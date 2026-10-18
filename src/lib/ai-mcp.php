<?php
/**
 * External tools for the AI assistant: a small MCP client (discussion #1611).
 *
 * Poznote ships an MCP server so that other assistants can reach the notes.
 * This is the other direction: the built-in assistant calls tools offered by
 * remote MCP servers the administrator or the user connected, a web search
 * for instance, next to its own note tools.
 *
 * Scope, on purpose: the Streamable HTTP transport only (JSON-RPC over POST,
 * the answer coming back as JSON or as a short event stream), authenticated
 * with an API key or custom headers. Servers started as a local process
 * (stdio) and OAuth are not supported.
 *
 * A server is stored with the tools it offered when its settings page last
 * checked it. The chat sends the model those stored definitions and nothing
 * else, so a server cannot slip in a new tool, or reword one, between two
 * visits of the person who enabled it.
 *
 * No database, no session, no config: tests/ai-mcp.test.php loads the file
 * on its own. The network calls need the curl extension, the rest does not.
 *
 * A server travels as
 *   ['id', 'name', 'url', 'api_key', 'headers' => list as in ai-upstream.php,
 *    'enabled' => bool, 'tools' => list of
 *       ['name', 'description', 'schema' => JSON text, 'enabled' => bool]]
 */

require_once __DIR__ . '/ai-upstream.php';
require_once __DIR__ . '/outbound-url.php';

/** The protocol revision asked for; the server answers with the one it speaks. */
const AI_MCP_PROTOCOL_VERSION = '2025-06-18';

const AI_MCP_MAX_SERVERS = 5;
/** Tools kept per server, and offered to the model in one chat over all servers. */
const AI_MCP_MAX_TOOLS = 40;
const AI_MCP_MAX_CHAT_TOOLS = 60;
const AI_MCP_SERVER_NAME_MAX = 40;
const AI_MCP_URL_MAX = 2000;
const AI_MCP_TOOL_NAME_MAX = 128;
const AI_MCP_TOOL_DESCRIPTION_MAX = 1000;
const AI_MCP_TOOL_SCHEMA_MAX = 16000;
/** Longest tool result handed to the model, in characters. */
const AI_MCP_RESULT_MAX = 20000;
/** Largest answer read from a server, in bytes. */
const AI_MCP_RESPONSE_MAX = 2097152;

/** The parameters of a tool that declares none, or none that can be used. */
const AI_MCP_EMPTY_SCHEMA = '{"type":"object","properties":{}}';

/** An absolute http(s) URL with a host, short enough to be stored. */
function aiMcpIsValidUrl(string $url): bool
{
    if ($url === '' || strlen($url) > AI_MCP_URL_MAX || preg_match('/[\x00-\x20\x7F]/', $url) === 1) {
        return false;
    }
    $parts = parse_url($url);
    return is_array($parts)
        && in_array(strtolower((string)($parts['scheme'] ?? '')), ['http', 'https'], true)
        && ($parts['host'] ?? '') !== '';
}

/** A new server id: opaque, only ever compared with the stored ones. */
function aiMcpNewServerId(): string
{
    return bin2hex(random_bytes(6));
}

/**
 * The input schema of a tool as JSON text, ready to be handed to the model
 * as the function parameters. Kept as text so that an empty "properties"
 * object stays an object: decoded into a PHP array it would come back as a
 * list, which the model providers refuse.
 */
function aiMcpNormalizeSchema($schema): string
{
    if (is_string($schema)) {
        $schema = json_decode($schema);
    } elseif (is_array($schema)) {
        $schema = json_decode((string)json_encode($schema));
    }
    if ($schema instanceof stdClass) {
        // Work on a copy: the caller keeps what the server sent
        $schema = clone $schema;
    }
    if (!($schema instanceof stdClass) || ($schema->type ?? 'object') !== 'object') {
        return AI_MCP_EMPTY_SCHEMA;
    }
    // Chat completion servers know the JSON Schema keywords, not the dialect
    // declaration some MCP servers put at the top
    unset($schema->{'$schema'});
    $schema->type = 'object';
    if (!isset($schema->properties) || !($schema->properties instanceof stdClass)) {
        $schema->properties = new stdClass();
    }
    $json = json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($json) && strlen($json) <= AI_MCP_TOOL_SCHEMA_MAX ? $json : AI_MCP_EMPTY_SCHEMA;
}

/**
 * The tools of a tools/list answer (or stored ones read back) in the stored
 * form. A tool the server already offered keeps the choice made for it in
 * $previous; a new one starts enabled, the settings page showing the list
 * right after the check.
 */
function aiMcpNormalizeTools(array $listed, array $previous = []): array
{
    $wasEnabled = [];
    foreach ($previous as $tool) {
        if (is_array($tool) && is_string($tool['name'] ?? null)) {
            $wasEnabled[$tool['name']] = !empty($tool['enabled']);
        }
    }

    $tools = [];
    foreach ($listed as $tool) {
        // An entry of a server answer is an object, its schema left as
        // decoded so that the empty objects inside survive
        $tool = $tool instanceof stdClass ? get_object_vars($tool) : $tool;
        $name = is_array($tool) ? ($tool['name'] ?? null) : null;
        if (!is_string($name) || $name === '' || strlen($name) > AI_MCP_TOOL_NAME_MAX || isset($tools[$name])) {
            continue;
        }
        if (count($tools) >= AI_MCP_MAX_TOOLS) {
            break;
        }
        $description = is_string($tool['description'] ?? null) ? trim($tool['description']) : '';
        $tools[$name] = [
            'name' => $name,
            'description' => mb_substr($description, 0, AI_MCP_TOOL_DESCRIPTION_MAX),
            'schema' => aiMcpNormalizeSchema($tool['inputSchema'] ?? $tool['schema'] ?? null),
            'enabled' => $wasEnabled[$name] ?? true,
        ];
    }
    return array_values($tools);
}

function aiMcpEncodeServers(array $servers): string
{
    if ($servers === []) {
        return '';
    }
    foreach ($servers as &$server) {
        $server['headers'] = aiUpstreamEncodeHeaders($server['headers']);
    }
    unset($server);
    return (string)json_encode(array_values($servers), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * Stored servers back as a list. Every field is validated again: what the
 * chat sends to a server, and to the model, does not depend on the database
 * having been written by the settings pages.
 */
function aiMcpDecodeServers(string $json): array
{
    $stored = $json === '' ? null : json_decode($json, true);
    if (!is_array($stored)) {
        return [];
    }
    $servers = [];
    foreach (array_slice($stored, 0, AI_MCP_MAX_SERVERS) as $server) {
        if (!is_array($server)) {
            continue;
        }
        $id = $server['id'] ?? null;
        $url = $server['url'] ?? null;
        if (!is_string($id) || preg_match('/^[a-f0-9]{12}$/', $id) !== 1 || isset($servers[$id])
            || !is_string($url) || !aiMcpIsValidUrl($url)) {
            continue;
        }
        $name = is_string($server['name'] ?? null) ? trim($server['name']) : '';
        $tools = is_array($server['tools'] ?? null) ? $server['tools'] : [];
        $servers[$id] = [
            'id' => $id,
            'name' => $name !== '' ? mb_substr($name, 0, AI_MCP_SERVER_NAME_MAX) : (string)parse_url($url, PHP_URL_HOST),
            'url' => $url,
            'api_key' => is_string($server['api_key'] ?? null) ? $server['api_key'] : '',
            'headers' => aiUpstreamDecodeHeaders(is_string($server['headers'] ?? null) ? $server['headers'] : ''),
            'enabled' => !empty($server['enabled']),
            'tools' => aiMcpNormalizeTools($tools, $tools),
        ];
    }
    return array_values($servers);
}

/**
 * What a chat request needs from the connected servers: the function
 * definitions to offer the model next to the note tools, and how to route a
 * call back. The model sees each tool as mcp<N>_<name>, N being the position
 * of its server, so that two servers may offer a tool of the same name and
 * no external tool can take the name of a note tool.
 *
 * Returns ['tools' => list of chat completion tools,
 *          'routes' => [exposed name => ['server' => index in $servers, 'tool' => name on the server]]]
 */
function aiMcpChatTools(array $servers): array
{
    $tools = [];
    $routes = [];
    foreach (array_values($servers) as $index => $server) {
        if (empty($server['enabled'])) {
            continue;
        }
        foreach ($server['tools'] as $tool) {
            if (empty($tool['enabled'])) {
                continue;
            }
            if (count($tools) >= AI_MCP_MAX_CHAT_TOOLS) {
                break 2;
            }
            $exposed = substr('mcp' . ($index + 1) . '_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $tool['name']), 0, 64);
            if (isset($routes[$exposed])) {
                continue;
            }
            $routes[$exposed] = ['server' => $index, 'tool' => $tool['name']];
            $description = 'External tool "' . $tool['name'] . '" of the server "' . $server['name'] . '".';
            $tools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $exposed,
                    'description' => $tool['description'] !== '' ? $description . ' ' . $tool['description'] : $description,
                    'parameters' => json_decode($tool['schema']),
                ],
            ];
        }
    }
    return ['tools' => $tools, 'routes' => $routes];
}

/**
 * The JSON-RPC answer to request $id in what a server sent back: either a
 * JSON body, or an event stream on which the server may have pushed
 * notifications of its own before it. Null when it is not there (yet).
 * Decoded as objects: a tool schema is passed on to the model as it came.
 */
function aiMcpFindResponse(string $contentType, string $body, int $id): ?stdClass
{
    $isAnswer = function ($message) use ($id): bool {
        return $message instanceof stdClass && ($message->id ?? null) === $id
            && (property_exists($message, 'result') || isset($message->error));
    };

    if (stripos($contentType, 'text/event-stream') === false) {
        $message = json_decode($body);
        if ($isAnswer($message)) {
            return $message;
        }
        // A batch, as older revisions of the protocol allowed
        foreach (is_array($message) ? $message : [] as $item) {
            if ($isAnswer($item)) {
                return $item;
            }
        }
        return null;
    }

    foreach (preg_split('/\r\n\r\n|\n\n|\r\r/', $body) as $event) {
        $data = [];
        foreach (preg_split('/\r\n|\n|\r/', $event) as $line) {
            if (strncmp($line, 'data:', 5) === 0) {
                $data[] = ltrim(substr($line, 5), ' ');
            }
        }
        // An event still being received does not decode, and is skipped
        $message = $data === [] ? null : json_decode(implode("\n", $data));
        if ($isAnswer($message)) {
            return $message;
        }
    }
    return null;
}

/**
 * The result of a tools/call as the text handed to the model: the text
 * parts, a mention of what cannot be shown to it, and the structured content
 * when a server sends nothing else.
 */
function aiMcpResultText(stdClass $callResult): string
{
    $result = json_decode((string)json_encode($callResult), true);
    if (!is_array($result)) {
        return '';
    }
    $parts = [];
    foreach (is_array($result['content'] ?? null) ? $result['content'] : [] as $item) {
        if (!is_array($item)) {
            continue;
        }
        $type = (string)($item['type'] ?? '');
        if ($type === 'text' && is_string($item['text'] ?? null)) {
            $parts[] = $item['text'];
        } elseif ($type === 'resource' && is_string($item['resource']['text'] ?? null)) {
            $parts[] = $item['resource']['text'];
        } elseif ($type === 'resource_link' && is_string($item['uri'] ?? null)) {
            $parts[] = $item['uri'];
        } elseif ($type !== '') {
            $parts[] = '[' . $type . ' content omitted]';
        }
    }
    $text = trim(implode("\n\n", $parts));
    if ($text === '' && isset($result['structuredContent'])) {
        $text = (string)json_encode($result['structuredContent'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    if (mb_strlen($text) > AI_MCP_RESULT_MAX) {
        $text = mb_substr($text, 0, AI_MCP_RESULT_MAX) . "\n\n[result truncated]";
    }
    return $text;
}

/** The header lines every request to a server carries. */
function aiMcpRequestHeaders(array $server, string $version): array
{
    return array_merge(
        ['Content-Type: application/json', 'Accept: application/json, text/event-stream'],
        $server['api_key'] !== '' ? ['Authorization: Bearer ' . $server['api_key']] : [],
        aiUpstreamIdentityHeaders($version, $server['headers'])
    );
}

/**
 * Send one JSON-RPC message to the server of $session and return the result
 * of its answer as an object, or null for a notification ($id null). Throws a
 * RuntimeException carrying a message fit for the user on any failure.
 *
 * $session['tick'], when set, is called about once a second while waiting
 * and aborts the call by returning false: the chat uses it to keep its own
 * stream alive and to stop when the browser has gone.
 */
function aiMcpSend(array &$session, string $method, ?array $params, ?int $id, int $timeout): ?stdClass
{
    $message = ['jsonrpc' => '2.0', 'method' => $method];
    if ($id !== null) {
        $message['id'] = $id;
    }
    if ($params !== null) {
        // An empty parameter list is an object on the wire, never a list
        $message['params'] = $params === [] ? new stdClass() : $params;
    }

    $headers = $session['headers'];
    if ($session['protocol'] !== '') {
        $headers[] = 'MCP-Protocol-Version: ' . $session['protocol'];
    }
    if ($session['id'] !== '') {
        $headers[] = 'Mcp-Session-Id: ' . $session['id'];
    }

    $body = '';
    $contentType = '';
    $sessionId = '';
    $answer = null;
    $tooLarge = false;
    $tick = $session['tick'] ?? null;

    $ch = curl_init($session['url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $timeout,
        // The URL is the one that was configured: no other scheme, and no
        // redirect carrying the credentials somewhere else
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$contentType, &$sessionId) {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $name = strtolower(trim($parts[0]));
                if ($name === 'content-type') {
                    $contentType = trim($parts[1]);
                } elseif ($name === 'mcp-session-id') {
                    $sessionId = trim($parts[1]);
                }
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$contentType, &$answer, &$tooLarge, $id) {
            $body .= $chunk;
            if (strlen($body) > AI_MCP_RESPONSE_MAX) {
                $tooLarge = true;
                return 0;
            }
            // A server may leave its event stream open after answering: the
            // answer is all this call is waiting for
            if ($id !== null && stripos($contentType, 'text/event-stream') !== false) {
                $answer = aiMcpFindResponse($contentType, $body, $id);
                if ($answer !== null) {
                    return 0;
                }
            }
            return strlen($chunk);
        },
        CURLOPT_NOPROGRESS => $tick === null,
        CURLOPT_PROGRESSFUNCTION => function () use ($tick) {
            return $tick !== null && $tick() === false ? 1 : 0;
        },
    ]);
    $blocked = poznoteOutboundPrepareCurl($ch, $session['url'], !empty($session['restricted']));
    if ($blocked !== '') {
        curl_close($ch);
        throw new RuntimeException($blocked);
    }
    curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($tooLarge) {
        throw new RuntimeException('the answer of the server is too large');
    }
    if ($errno === 42) { // CURLE_ABORTED_BY_CALLBACK: $tick asked to stop
        throw new RuntimeException('aborted');
    }
    // Error 23 is the write callback stopping the transfer once it had the answer
    if ($errno !== 0 && !($errno === 23 && $answer !== null)) {
        throw new RuntimeException($error !== '' ? $error : 'connection failed');
    }
    if ($sessionId !== '' && preg_match('/^[\x21-\x7E]{1,512}$/', $sessionId) === 1) {
        $session['id'] = $sessionId;
    }
    if ($status < 200 || $status >= 300) {
        $decoded = json_decode($body, true);
        $detail = is_string($decoded['error']['message'] ?? null) ? $decoded['error']['message']
            : (is_string($decoded['error'] ?? null) ? $decoded['error'] : '');
        throw new RuntimeException('HTTP ' . $status . ($detail !== '' ? ': ' . mb_substr($detail, 0, 300) : ''));
    }
    if ($id === null) {
        return null;
    }

    $answer = $answer ?? aiMcpFindResponse($contentType, $body, $id);
    if ($answer === null) {
        throw new RuntimeException('the server did not answer in the MCP format (is this the URL of an MCP endpoint?)');
    }
    if (isset($answer->error)) {
        $detail = is_string($answer->error->message ?? null) ? $answer->error->message : 'error';
        throw new RuntimeException(mb_substr($detail, 0, 300));
    }
    return ($answer->result ?? null) instanceof stdClass ? $answer->result : new stdClass();
}

/**
 * Open a session with a server: the initialize exchange every MCP server
 * expects before anything else. Throws a RuntimeException on failure.
 */
function aiMcpConnect(array $server, string $version, ?callable $tick = null): array
{
    $session = [
        'url' => $server['url'],
        // Set by the callers on a user's own server, see lib/outbound-url.php
        'restricted' => !empty($server['restricted']),
        'headers' => aiMcpRequestHeaders($server, $version),
        'protocol' => '',
        'id' => '',
        'next' => 1,
        'tick' => $tick,
    ];
    $result = aiMcpSend($session, 'initialize', [
        'protocolVersion' => AI_MCP_PROTOCOL_VERSION,
        'capabilities' => new stdClass(),
        'clientInfo' => ['name' => 'Poznote', 'version' => $version !== '' ? $version : '0'],
    ], $session['next']++, 20);

    $protocol = $result->protocolVersion ?? '';
    $session['protocol'] = is_string($protocol) && preg_match('/^[0-9A-Za-z.-]{1,32}$/', $protocol) === 1
        ? $protocol : AI_MCP_PROTOCOL_VERSION;
    aiMcpSend($session, 'notifications/initialized', null, null, 20);
    return $session;
}

/** Every tool the server offers, as raw tools/list entries. */
function aiMcpListTools(array &$session): array
{
    $tools = [];
    $cursor = null;
    // A server pages its list as it likes: stop once there is more than is kept
    for ($page = 0; $page < 10 && count($tools) <= AI_MCP_MAX_TOOLS; $page++) {
        $result = aiMcpSend($session, 'tools/list', $cursor === null ? [] : ['cursor' => $cursor], $session['next']++, 20);
        foreach (is_array($result->tools ?? null) ? $result->tools : [] as $tool) {
            $tools[] = $tool;
        }
        $cursor = $result->nextCursor ?? null;
        if (!is_string($cursor) || $cursor === '') {
            break;
        }
    }
    return $tools;
}

/**
 * Call one tool. $arguments is what the model sent, decoded as objects so
 * that an empty object stays one. Returns ['text' => string, 'is_error' => bool].
 */
function aiMcpCallTool(array &$session, string $tool, $arguments): array
{
    $result = aiMcpSend($session, 'tools/call', [
        'name' => $tool,
        'arguments' => $arguments instanceof stdClass ? $arguments : new stdClass(),
    ], $session['next']++, 90);
    return ['text' => aiMcpResultText($result), 'is_error' => !empty($result->isError)];
}

/** End a session the server keeps state for. Best effort: nothing waits on it. */
function aiMcpClose(array $session): void
{
    if ($session['id'] === '') {
        return;
    }
    $ch = curl_init($session['url']);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'DELETE',
        CURLOPT_HTTPHEADER => array_merge($session['headers'], [
            'MCP-Protocol-Version: ' . $session['protocol'],
            'Mcp-Session-Id: ' . $session['id'],
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if (poznoteOutboundPrepareCurl($ch, $session['url'], !empty($session['restricted'])) === '') {
        curl_exec($ch);
    }
    curl_close($ch);
}

/**
 * Check a server and read its tools, for the settings pages.
 * Returns ['tools' => stored form, 'error' => '' | message].
 */
function aiMcpFetchTools(array $server, string $version): array
{
    try {
        $session = aiMcpConnect($server, $version);
        $tools = aiMcpNormalizeTools(aiMcpListTools($session), $server['tools']);
        aiMcpClose($session);
        return ['tools' => $tools, 'error' => ''];
    } catch (RuntimeException $e) {
        return ['tools' => $server['tools'], 'error' => $e->getMessage()];
    }
}
