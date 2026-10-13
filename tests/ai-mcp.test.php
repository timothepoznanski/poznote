<?php
lib('ai-mcp');

// Discussion #1611: the assistant calls tools of remote MCP servers. These
// are the parts of the client that touch no network.

function mcpTestServer(array $over = []): array
{
    return $over + [
        'id' => 'aaaaaaaaaaaa',
        'name' => 'Exa',
        'url' => 'https://mcp.example.com/mcp',
        'api_key' => 'secret',
        'headers' => [['name' => 'x-team', 'value' => 'notes']],
        'enabled' => true,
        'tools' => aiMcpNormalizeTools([['name' => 'web_search', 'description' => 'Search the web']]),
    ];
}

test('only an absolute http or https URL names a server', function () {
    assertTrue(aiMcpIsValidUrl('https://mcp.exa.ai/mcp'));
    assertTrue(aiMcpIsValidUrl('http://searxng:8080/mcp?key=1'));
    assertFalse(aiMcpIsValidUrl(''), 'empty');
    assertFalse(aiMcpIsValidUrl('mcp.exa.ai/mcp'), 'no scheme');
    assertFalse(aiMcpIsValidUrl('file:///etc/passwd'), 'another scheme');
    assertFalse(aiMcpIsValidUrl('gopher://example.com/'), 'another scheme');
    assertFalse(aiMcpIsValidUrl("https://example.com/\r\nHost: evil"), 'a line break');
    assertFalse(aiMcpIsValidUrl('https://example.com/a b'), 'a space');
    assertFalse(aiMcpIsValidUrl('https://'), 'no host');
});

// The model providers refuse a schema whose "properties" is a list, which
// is what an empty JSON object becomes once decoded into a PHP array.
test('a tool schema keeps its empty objects', function () {
    assertSame(AI_MCP_EMPTY_SCHEMA, aiMcpNormalizeSchema(null), 'no schema');
    assertSame(AI_MCP_EMPTY_SCHEMA, aiMcpNormalizeSchema(['type' => 'object', 'properties' => []]), 'empty properties');
    assertSame(AI_MCP_EMPTY_SCHEMA, aiMcpNormalizeSchema('{"type":"string"}'), 'not an object schema');
    assertSame(AI_MCP_EMPTY_SCHEMA, aiMcpNormalizeSchema('not json'));

    $schema = json_decode('{"$schema":"http://json-schema.org/draft-07/schema#","properties":{"filters":{},"query":{"type":"string"}},"required":["query"]}');
    assertSame(
        '{"properties":{"filters":{},"query":{"type":"string"}},"required":["query"],"type":"object"}',
        aiMcpNormalizeSchema($schema)
    );
    assertTrue(isset($schema->{'$schema'}), 'the schema handed in is left alone');
});

test('an oversized schema falls back to no parameters', function () {
    $schema = ['type' => 'object', 'properties' => ['q' => ['type' => 'string', 'description' => str_repeat('x', AI_MCP_TOOL_SCHEMA_MAX)]]];
    assertSame(AI_MCP_EMPTY_SCHEMA, aiMcpNormalizeSchema($schema));
});

test('tools of a server answer are read into the stored form', function () {
    $listed = json_decode('[
        {"name":"web_search","description":"  Search the web  ","inputSchema":{"type":"object","properties":{"query":{"type":"string"}}}},
        {"name":"web_search","description":"a duplicate"},
        {"name":""},
        {"description":"no name"},
        "not a tool",
        {"name":"fetch"}
    ]');
    $tools = aiMcpNormalizeTools($listed);
    assertSame(['web_search', 'fetch'], array_column($tools, 'name'));
    assertSame('Search the web', $tools[0]['description']);
    assertSame('{"type":"object","properties":{"query":{"type":"string"}}}', $tools[0]['schema']);
    assertSame([true, true], array_column($tools, 'enabled'), 'a new tool starts enabled');
    assertSame(AI_MCP_EMPTY_SCHEMA, $tools[1]['schema']);
});

test('a refreshed list keeps the choices already made and is capped', function () {
    $previous = [['name' => 'fetch', 'enabled' => false], ['name' => 'gone', 'enabled' => true]];
    $tools = aiMcpNormalizeTools([['name' => 'fetch'], ['name' => 'new']], $previous);
    assertSame(['fetch' => false, 'new' => true], array_column($tools, 'enabled', 'name'));

    $many = [];
    for ($i = 0; $i < AI_MCP_MAX_TOOLS + 10; $i++) {
        $many[] = ['name' => 'tool_' . $i, 'description' => str_repeat('é', AI_MCP_TOOL_DESCRIPTION_MAX + 50)];
    }
    $tools = aiMcpNormalizeTools($many);
    assertSame(AI_MCP_MAX_TOOLS, count($tools));
    assertSame(AI_MCP_TOOL_DESCRIPTION_MAX, mb_strlen($tools[0]['description']));
});

test('servers survive a round trip through their stored form', function () {
    $server = mcpTestServer();
    $server['tools'][0]['enabled'] = false;
    assertSame([$server], aiMcpDecodeServers(aiMcpEncodeServers([$server])));
    assertSame('', aiMcpEncodeServers([]));
    assertSame([], aiMcpDecodeServers(''));
    assertSame([], aiMcpDecodeServers('not json'));
});

// What goes on the wire does not depend on the database having been written
// by the settings pages.
test('stored servers are validated again when read', function () {
    $stored = json_encode([
        ['id' => 'aaaaaaaaaaaa', 'name' => '', 'url' => 'https://a.example.com/mcp', 'headers' => '[["Host","evil"],["x-ok","1"]]', 'enabled' => 1, 'tools' => 'nope'],
        ['id' => 'aaaaaaaaaaaa', 'url' => 'https://duplicate-id.example.com/mcp'],
        ['id' => '../etc', 'url' => 'https://bad-id.example.com/mcp'],
        ['id' => 'bbbbbbbbbbbb', 'url' => 'file:///etc/passwd'],
        'not a server',
    ]);
    $servers = aiMcpDecodeServers($stored);
    assertSame(1, count($servers));
    assertSame('a.example.com', $servers[0]['name'], 'an empty name falls back to the host');
    assertSame([['name' => 'x-ok', 'value' => '1']], $servers[0]['headers'], 'a reserved header is dropped');
    assertSame('', $servers[0]['api_key']);
    assertSame([], $servers[0]['tools']);
    assertTrue($servers[0]['enabled']);

    $tooMany = [];
    for ($i = 0; $i < AI_MCP_MAX_SERVERS + 3; $i++) {
        $tooMany[] = ['id' => str_pad((string)$i, 12, 'a'), 'url' => 'https://s' . $i . '.example.com/'];
    }
    assertSame(AI_MCP_MAX_SERVERS, count(aiMcpDecodeServers(json_encode($tooMany))));
});

test('the model sees each external tool under a name of its own', function () {
    $servers = [
        mcpTestServer(['tools' => aiMcpNormalizeTools([
            ['name' => 'web_search', 'description' => 'Search the web', 'inputSchema' => ['type' => 'object', 'properties' => []]],
            ['name' => 'web.fetch/v2'],
            ['name' => 'off'],
        ], [['name' => 'off', 'enabled' => false]])]),
        mcpTestServer(['id' => 'bbbbbbbbbbbb', 'name' => 'Disabled', 'enabled' => false]),
        mcpTestServer(['id' => 'cccccccccccc', 'name' => 'Tavily']),
    ];
    $chat = aiMcpChatTools($servers);

    assertSame(['mcp1_web_search', 'mcp1_web_fetch_v2', 'mcp3_web_search'], array_keys($chat['routes']));
    assertSame(['server' => 0, 'tool' => 'web.fetch/v2'], $chat['routes']['mcp1_web_fetch_v2'], 'the call goes out under the real name');
    assertSame(['server' => 2, 'tool' => 'web_search'], $chat['routes']['mcp3_web_search']);

    assertSame(3, count($chat['tools']));
    $first = $chat['tools'][0]['function'];
    assertSame('mcp1_web_search', $first['name']);
    assertContains('"Exa"', $first['description']);
    assertContains('Search the web', $first['description']);
    assertContains('"properties":{}', (string)json_encode($chat['tools'][0]), 'properties is still an object for the model');
    foreach (array_keys($chat['routes']) as $name) {
        assertSame(1, preg_match('/^[A-Za-z0-9_-]{1,64}$/', $name), $name);
    }
});

test('no more external tools than a model can take in', function () {
    $tools = [];
    for ($i = 0; $i < AI_MCP_MAX_TOOLS; $i++) {
        $tools[] = ['name' => 'tool_' . $i];
    }
    $server = mcpTestServer(['tools' => aiMcpNormalizeTools($tools)]);
    $chat = aiMcpChatTools([$server, $server]);
    assertSame(AI_MCP_MAX_CHAT_TOOLS, count($chat['tools']));
    assertSame(AI_MCP_MAX_CHAT_TOOLS, count($chat['routes']));
});

test('the answer is found in a JSON body', function () {
    $answer = aiMcpFindResponse('application/json; charset=utf-8', '{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}', 2);
    assertSame([], $answer->result->tools);
    assertSame(null, aiMcpFindResponse('application/json', '{"jsonrpc":"2.0","id":3,"result":{}}', 2), 'another request');
    assertSame(null, aiMcpFindResponse('application/json', '{"jsonrpc":"2.0","id":2,"method":"ping"}', 2), 'a request of the server');
    assertSame(null, aiMcpFindResponse('text/html', '<html>', 2));
    $answer = aiMcpFindResponse('application/json', '[{"jsonrpc":"2.0","method":"x"},{"jsonrpc":"2.0","id":2,"error":{"code":-1,"message":"no"}}]', 2);
    assertSame('no', $answer->error->message, 'in a batch');
    $answer = aiMcpFindResponse('application/json', '{"jsonrpc":"2.0","id":2,"result":null}', 2);
    assertTrue(property_exists($answer, 'result'), 'a null result is an answer');
});

test('the answer is found in an event stream', function () {
    $stream = ": keep-alive\n\n"
        . "event: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{}}\n\n"
        . "event: message\r\nid: 7\r\ndata: {\"jsonrpc\":\"2.0\",\r\ndata: \"id\":4,\"result\":{\"ok\":true}}\r\n\r\n";
    $answer = aiMcpFindResponse('text/event-stream', $stream, 4);
    assertTrue($answer->result->ok, 'data lines of one event are joined');
    assertSame(null, aiMcpFindResponse('text/event-stream', $stream, 5));
    assertSame(null, aiMcpFindResponse('text/event-stream', "data: {\"jsonrpc\":\"2.0\",\"id\":4,\"resu", 4), 'an event still arriving');
});

test('a tool result is flattened into text for the model', function () {
    $result = json_decode('{"content":[
        {"type":"text","text":"First"},
        {"type":"image","data":"AAAA","mimeType":"image/png"},
        {"type":"resource","resource":{"uri":"file:///a","text":"Embedded"}},
        {"type":"resource_link","uri":"https://example.com/doc"},
        {"type":"text","text":"Last"}
    ]}');
    assertSame("First\n\n[image content omitted]\n\nEmbedded\n\nhttps://example.com/doc\n\nLast", aiMcpResultText($result));
    assertSame('{"hits":[1,2]}', aiMcpResultText(json_decode('{"content":[],"structuredContent":{"hits":[1,2]}}')));
    assertSame('', aiMcpResultText(new stdClass()));

    $long = new stdClass();
    $long->content = [(object)['type' => 'text', 'text' => str_repeat('é', AI_MCP_RESULT_MAX + 100)]];
    $text = aiMcpResultText($long);
    assertSame(AI_MCP_RESULT_MAX + mb_strlen("\n\n[result truncated]"), mb_strlen($text));
    assertContains('[result truncated]', $text);
});

test('requests carry the key as a Bearer token, then the custom headers', function () {
    $headers = aiMcpRequestHeaders(mcpTestServer(), '6.116.0');
    assertSame([
        'Content-Type: application/json',
        'Accept: application/json, text/event-stream',
        'Authorization: Bearer secret',
        'User-Agent: Poznote/6.116.0',
        'x-team: notes',
    ], $headers);
    assertFalse(in_array('Authorization: Bearer ', aiMcpRequestHeaders(mcpTestServer(['api_key' => '']), ''), true), 'no key, no header');
});

test('server ids are opaque and distinct', function () {
    $a = aiMcpNewServerId();
    assertSame(1, preg_match('/^[a-f0-9]{12}$/', $a));
    assertFalse($a === aiMcpNewServerId());
});
