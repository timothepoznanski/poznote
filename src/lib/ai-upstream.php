<?php
/**
 * Which failures of a call to the AI server are worth a second attempt.
 *
 * Issue #1388: a chat request sometimes dies with "Could not resolve host:
 * api.openai.com (Timeout while contacting DNS servers)" and works when the
 * user pastes the same message again. Failures of that kind happen before
 * the server has answered anything, so the same request can be sent again
 * without the user seeing anything but a short pause. This module only
 * decides whether a failure is transient; the callers in api_ai_chat.php do
 * the retrying, because the streaming one has to keep its SSE connection
 * alive meanwhile.
 *
 * No database, no session, no config: tests/ai-upstream.test.php loads it
 * on its own. The curl error numbers are written as literals so that the
 * file also loads where the curl extension is missing.
 */

/** Attempts in total, the first one included. */
const AI_UPSTREAM_MAX_ATTEMPTS = 3;

/**
 * True when the request never reached the point where the server started
 * answering and the reason is a network hiccup rather than a configuration
 * error. $connected says whether the TCP connection had been established
 * (CURLINFO_CONNECT_TIME > 0): a timeout before that is a flaky route or an
 * overloaded resolver, a timeout after it is a server that took the request
 * and never answered, which another 600 second wait would not fix.
 */
function aiUpstreamIsTransientCurlError(int $errno, bool $connected): bool
{
    switch ($errno) {
        case 5:  // CURLE_COULDNT_RESOLVE_PROXY
        case 6:  // CURLE_COULDNT_RESOLVE_HOST
        case 7:  // CURLE_COULDNT_CONNECT
        case 35: // CURLE_SSL_CONNECT_ERROR
        case 52: // CURLE_GOT_NOTHING
        case 55: // CURLE_SEND_ERROR
        case 56: // CURLE_RECV_ERROR
            return true;
        case 28: // CURLE_OPERATION_TIMEDOUT
            return !$connected;
        default:
            return false;
    }
}

/**
 * Pause before the next attempt, in seconds, given how many attempts have
 * been made: 1 s after the first failure, 2 s after the second. Long enough
 * for a resolver hiccup to clear, short enough that the user does not wonder.
 */
function aiUpstreamRetryDelaySeconds(int $attemptsMade): int
{
    return max(1, min($attemptsMade, 5));
}

/**
 * True when two server URLs are the same one, give or take surrounding
 * whitespace and a trailing slash.
 *
 * The connection test of the AI and speech-to-text settings sends a stored
 * API key along when the form still shows the mask. That is right for the
 * owner of the configuration, who may be trying another URL with the key
 * already saved. For anyone else, and for a request that names no
 * configuration at all, the stored key only ever travels to the server it is
 * stored with: this is the comparison that decides it.
 */
function aiUpstreamSameServer(string $a, string $b): bool
{
    $a = rtrim(trim($a), '/');
    $b = rtrim(trim($b), '/');

    return $a !== '' && $a === $b;
}

/**
 * Custom request headers (discussion #1610).
 *
 * A gateway in front of the models (LiteLLM, Cloudflare AI Gateway,
 * OpenRouter, Helicone, ...) often wants headers of its own to identify or
 * bill the caller. The settings pages take them as text, one "Name: value"
 * per line, and every request to the AI server carries them.
 *
 * The values are treated as secrets, as some of them are: stored encrypted,
 * shown masked, and bound to the same rule as the API key when a connection
 * test names another URL (see aiUpstreamSameServer() above).
 *
 * Headers travel as a list of ['name' => string, 'value' => string].
 */

/** What a settings page shows instead of a stored value, as for the API key. */
const AI_UPSTREAM_HEADER_MASK = '••••••••';

const AI_UPSTREAM_HEADERS_MAX = 20;
const AI_UPSTREAM_HEADER_NAME_MAX = 64;
const AI_UPSTREAM_HEADER_VALUE_MAX = 4096;

/**
 * Header names (lowercase) a configuration may not set: the ones that frame
 * the request or the connection, the ones Poznote sets itself and whose
 * value the code that reads the answer relies on, and Authorization, which
 * belongs to the API key field.
 */
function aiUpstreamReservedHeaders(): array
{
    return [
        'host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
        'upgrade', 'te', 'trailer', 'expect', 'proxy-authorization', 'proxy-connection',
        'content-type', 'content-encoding', 'accept', 'accept-encoding',
        'authorization',
    ];
}

/**
 * True when the pair can be handed to curl as it is. The name is an HTTP
 * token; the value is printable ASCII, which leaves no room for the line
 * break a header injection needs.
 */
function aiUpstreamIsValidHeader(string $name, string $value): bool
{
    return strlen($name) <= AI_UPSTREAM_HEADER_NAME_MAX
        && preg_match('/^[A-Za-z0-9!#$%&\'*+.^_`|~-]+$/', $name) === 1
        && !in_array(strtolower($name), aiUpstreamReservedHeaders(), true)
        && strlen($value) <= AI_UPSTREAM_HEADER_VALUE_MAX
        && preg_match('/^[\x21-\x7E]([\x20-\x7E]*[\x21-\x7E])?$/', $value) === 1;
}

/**
 * Read the text of a settings field. A value left as the mask keeps the
 * value $stored holds under that name, so one header can be edited without
 * typing the others again; the callers pass no stored headers when those
 * must not follow the request.
 *
 * Returns ['headers' => list, 'error' => null | ['line' => int, 'reason' => string]]
 * and stops at the first line it refuses. Reasons: 'format', 'reserved',
 * 'duplicate', 'masked' (nothing stored under that name), 'too_many'.
 */
function aiUpstreamParseHeaders(string $text, array $stored = []): array
{
    $storedValues = [];
    foreach ($stored as $header) {
        $storedValues[strtolower($header['name'])] = $header['value'];
    }

    $headers = [];
    $seen = [];
    $fail = function (int $line, string $reason): array {
        return ['headers' => [], 'error' => ['line' => $line, 'reason' => $reason]];
    };

    foreach (preg_split('/\r\n|\r|\n/', $text) as $index => $line) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        $parts = explode(':', $line, 2);
        if (count($parts) !== 2) {
            return $fail($index + 1, 'format');
        }
        $name = trim($parts[0]);
        $value = trim($parts[1]);
        $key = strtolower($name);

        if (in_array($key, aiUpstreamReservedHeaders(), true)) {
            return $fail($index + 1, 'reserved');
        }
        if (isset($seen[$key])) {
            return $fail($index + 1, 'duplicate');
        }
        if ($value === AI_UPSTREAM_HEADER_MASK) {
            if (!isset($storedValues[$key])) {
                return $fail($index + 1, 'masked');
            }
            $value = $storedValues[$key];
        }
        if (!aiUpstreamIsValidHeader($name, $value)) {
            return $fail($index + 1, 'format');
        }
        if (count($headers) >= AI_UPSTREAM_HEADERS_MAX) {
            return $fail($index + 1, 'too_many');
        }
        $seen[$key] = true;
        $headers[] = ['name' => $name, 'value' => $value];
    }

    return ['headers' => $headers, 'error' => null];
}

/** The text a settings page shows for stored headers: names only. */
function aiUpstreamMaskHeaders(array $headers): string
{
    $lines = [];
    foreach ($headers as $header) {
        $lines[] = $header['name'] . ': ' . AI_UPSTREAM_HEADER_MASK;
    }
    return implode("\n", $lines);
}

function aiUpstreamEncodeHeaders(array $headers): string
{
    if ($headers === []) {
        return '';
    }
    $pairs = [];
    foreach ($headers as $header) {
        $pairs[] = [$header['name'], $header['value']];
    }
    return (string)json_encode($pairs);
}

/**
 * Stored headers back as a list. Every pair is validated again: what goes
 * on the wire does not depend on the database having been written by
 * aiUpstreamParseHeaders().
 */
function aiUpstreamDecodeHeaders(string $json): array
{
    $pairs = $json === '' ? null : json_decode($json, true);
    if (!is_array($pairs)) {
        return [];
    }
    $headers = [];
    foreach (array_slice($pairs, 0, AI_UPSTREAM_HEADERS_MAX) as $pair) {
        if (is_array($pair) && is_string($pair[0] ?? null) && is_string($pair[1] ?? null)
            && aiUpstreamIsValidHeader($pair[0], $pair[1])) {
            $headers[] = ['name' => $pair[0], 'value' => $pair[1]];
        }
    }
    return $headers;
}

/**
 * The header lines every request to an AI server carries besides its own:
 * a User-Agent naming Poznote, so that a gateway's logs say who is calling,
 * then the custom headers. A custom User-Agent replaces the default one.
 */
function aiUpstreamIdentityHeaders(string $version, array $custom = []): array
{
    $lines = [];
    $hasUserAgent = false;
    foreach ($custom as $header) {
        if (strtolower($header['name']) === 'user-agent') {
            $hasUserAgent = true;
        }
        $lines[] = $header['name'] . ': ' . $header['value'];
    }
    if (!$hasUserAgent) {
        $version = preg_replace('/[^A-Za-z0-9._-]/', '', $version);
        array_unshift($lines, 'User-Agent: Poznote' . ($version !== '' ? '/' . $version : ''));
    }
    return $lines;
}
