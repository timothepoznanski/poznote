<?php
lib('ai-upstream');

// Issue #1388: "Could not resolve host: api.openai.com (Timeout while
// contacting DNS servers)" is curl error 6, and pasting the message again
// worked. That is the case the retry exists for.
test('a DNS or connection failure before any answer is transient', function () {
    assertTrue(aiUpstreamIsTransientCurlError(6, false), 'could not resolve host');
    assertTrue(aiUpstreamIsTransientCurlError(7, false), 'could not connect');
    assertTrue(aiUpstreamIsTransientCurlError(35, false), 'TLS handshake');
    assertTrue(aiUpstreamIsTransientCurlError(52, true), 'empty reply');
    assertTrue(aiUpstreamIsTransientCurlError(56, true), 'recv failure');
});

// A connect timeout deserves another try; a server that accepted the
// connection and then sat on the request for CURLOPT_TIMEOUT does not, or
// the user would wait three times as long for the same error.
test('a timeout is transient only while the connection was never established', function () {
    assertTrue(aiUpstreamIsTransientCurlError(28, false));
    assertFalse(aiUpstreamIsTransientCurlError(28, true));
});

test('a clean transfer, a bad URL or a TLS certificate problem are not retried', function () {
    assertFalse(aiUpstreamIsTransientCurlError(0, true), 'no error');
    assertFalse(aiUpstreamIsTransientCurlError(3, false), 'malformed URL');
    assertFalse(aiUpstreamIsTransientCurlError(60, false), 'peer certificate');
    assertFalse(aiUpstreamIsTransientCurlError(1, false), 'unsupported protocol');
});

test('the pause grows with the attempts and stays short', function () {
    assertSame(1, aiUpstreamRetryDelaySeconds(1));
    assertSame(2, aiUpstreamRetryDelaySeconds(2));
    assertSame(1, aiUpstreamRetryDelaySeconds(0), 'never a zero-second busy loop');
    assertSame(5, aiUpstreamRetryDelaySeconds(40), 'capped');
});

test('three attempts in total, so two retries', function () {
    assertSame(3, AI_UPSTREAM_MAX_ATTEMPTS);
});

// The connection test sends a stored API key along when the form shows the
// mask. Outside the owner's own settings page, that key may only go to the
// server it is stored with.
test('a stored key follows a URL only when it is the stored server', function () {
    assertTrue(aiUpstreamSameServer('https://api.example.com/v1', 'https://api.example.com/v1'));
    assertTrue(aiUpstreamSameServer(' https://api.example.com/v1/ ', 'https://api.example.com/v1'), 'whitespace and a trailing slash');
    assertFalse(aiUpstreamSameServer('https://other.example.net/v1', 'https://api.example.com/v1'), 'another host');
    assertFalse(aiUpstreamSameServer('https://api.example.com/v1/extra', 'https://api.example.com/v1'), 'another path');
    assertFalse(aiUpstreamSameServer('http://api.example.com/v1', 'https://api.example.com/v1'), 'another scheme');
    assertFalse(aiUpstreamSameServer('https://API.example.com/v1', 'https://api.example.com/v1'), 'compared as written');
    assertFalse(aiUpstreamSameServer('', ''), 'nothing configured is not a match');
    assertFalse(aiUpstreamSameServer('https://api.example.com/v1', ''), 'no stored server');
});

// Discussion #1610: custom request headers for a gateway in front of the
// models, typed one per line in the settings.
test('custom headers are read one per line', function () {
    $parsed = aiUpstreamParseHeaders("x-litellm-customer-id: poznote\r\n\n  X-Title :  My notes  \nHelicone-Auth: Bearer sk-1:2");
    assertSame(null, $parsed['error']);
    assertSame([
        ['name' => 'x-litellm-customer-id', 'value' => 'poznote'],
        ['name' => 'X-Title', 'value' => 'My notes'],
        ['name' => 'Helicone-Auth', 'value' => 'Bearer sk-1:2'],
    ], $parsed['headers']);
    assertSame([], aiUpstreamParseHeaders(" \n")['headers'], 'an empty field is no header');
});

test('a line that is not a header is refused with its number', function () {
    $reason = function (string $text, array $stored = []) {
        return aiUpstreamParseHeaders($text, $stored)['error'];
    };
    assertSame(['line' => 2, 'reason' => 'format'], $reason("X-A: 1\nno colon here"));
    assertSame(['line' => 1, 'reason' => 'format'], $reason('X-A:'), 'no value');
    assertSame(['line' => 1, 'reason' => 'format'], $reason('X A: 1'), 'a space in the name');
    assertSame(['line' => 1, 'reason' => 'format'], $reason(': 1'), 'no name');
    assertSame(['line' => 1, 'reason' => 'format'], $reason('X-A: café'), 'not ASCII');
    assertSame(['line' => 1, 'reason' => 'format'], $reason("X-A: a\x00b"), 'a control character');
    assertSame(['line' => 1, 'reason' => 'format'], $reason('X-A: ' . str_repeat('a', AI_UPSTREAM_HEADER_VALUE_MAX + 1)));
    assertSame(['line' => 3, 'reason' => 'duplicate'], $reason("X-A: 1\n\nx-a: 2"));
    assertSame([], aiUpstreamParseHeaders("X-A: 1\nbroken")['headers'], 'nothing is kept from a refused field');
});

// The request is framed by Poznote and authenticated by the API key field:
// a configuration cannot take either over.
test('headers that frame or authenticate the request are reserved', function () {
    foreach (['Host', 'content-length', 'Transfer-Encoding', 'Content-Type', 'ACCEPT', 'Accept-Encoding', 'Authorization', 'Connection'] as $name) {
        assertSame(['line' => 1, 'reason' => 'reserved'], aiUpstreamParseHeaders($name . ': x')['error'], $name);
        assertFalse(aiUpstreamIsValidHeader($name, 'x'), $name . ' read back from storage');
    }
    assertSame(null, aiUpstreamParseHeaders("User-Agent: mine\nx-api-key: k\nCookie: a=b")['error']);
});

// An Anthropic organization key that is not scoped to a workspace is refused
// without anthropic-workspace-id. The header goes through for Anthropic,
// while the key and API version Poznote sends there stay its own; a gateway
// keeps its x-api-key.
test('Anthropic takes custom headers but keeps its key and version headers', function () {
    $anthropic = aiUpstreamServerReservedHeaders('https://api.anthropic.com');
    assertSame(['x-api-key', 'anthropic-version'], $anthropic);
    assertSame([], aiUpstreamServerReservedHeaders('https://api.openai.com'));
    assertSame([], aiUpstreamServerReservedHeaders('http://litellm:4000/v1'));
    assertSame([], aiUpstreamServerReservedHeaders('https://evil.com/?anthropic.com'));

    $parsed = aiUpstreamParseHeaders("anthropic-workspace-id: wrkspc_01\nanthropic-beta: x", [], $anthropic);
    assertSame(null, $parsed['error']);
    assertSame('wrkspc_01', $parsed['headers'][0]['value']);
    assertSame(['line' => 2, 'reason' => 'reserved'], aiUpstreamParseHeaders("anthropic-workspace-id: w\nX-Api-Key: k", [], $anthropic)['error']);
    assertSame(['line' => 1, 'reason' => 'reserved'], aiUpstreamParseHeaders('Anthropic-Version: 2099-01-01', [], $anthropic)['error']);

    $stored = [['name' => 'x-api-key', 'value' => 'k'], ['name' => 'anthropic-workspace-id', 'value' => 'w']];
    assertSame([['name' => 'anthropic-workspace-id', 'value' => 'w']], aiUpstreamWithoutHeaders($stored, $anthropic));
    assertSame($stored, aiUpstreamWithoutHeaders($stored, []));
});

test('no more headers than the limit', function () {
    $lines = [];
    for ($i = 1; $i <= AI_UPSTREAM_HEADERS_MAX; $i++) {
        $lines[] = "X-H$i: v";
    }
    assertSame(null, aiUpstreamParseHeaders(implode("\n", $lines))['error']);
    $lines[] = 'X-One-More: v';
    assertSame(['line' => AI_UPSTREAM_HEADERS_MAX + 1, 'reason' => 'too_many'], aiUpstreamParseHeaders(implode("\n", $lines))['error']);
});

// A line break is what a header injection needs. Splitting on every kind of
// line break leaves none inside a value, and the validation refuses one
// that would come from anywhere else.
test('a value cannot carry a second header', function () {
    $parsed = aiUpstreamParseHeaders("X-A: 1\rAuthorization: Bearer stolen");
    assertSame(['line' => 2, 'reason' => 'reserved'], $parsed['error'], 'a bare CR is a line break too');
    assertFalse(aiUpstreamIsValidHeader('X-A', "1\r\nAuthorization: Bearer stolen"));
    assertFalse(aiUpstreamIsValidHeader('X-A', "1\nX-B: 2"));
    assertFalse(aiUpstreamIsValidHeader("X-A\r\nX-B", '1'));
    assertFalse(aiUpstreamIsValidHeader('X-A', ''), 'curl reads "Name:" as "remove this header"');
});

// The settings pages never show a stored value. A line sent back with the
// mask keeps the stored value, whatever the case of its name.
test('a masked value is the stored one', function () {
    $stored = [['name' => 'X-Token', 'value' => 'secret'], ['name' => 'X-Other', 'value' => 'kept']];
    assertSame("X-Token: " . AI_UPSTREAM_HEADER_MASK . "\nX-Other: " . AI_UPSTREAM_HEADER_MASK, aiUpstreamMaskHeaders($stored));
    assertSame('', aiUpstreamMaskHeaders([]));

    $parsed = aiUpstreamParseHeaders('x-token: ' . AI_UPSTREAM_HEADER_MASK . "\nX-New: typed", $stored);
    assertSame([['name' => 'x-token', 'value' => 'secret'], ['name' => 'X-New', 'value' => 'typed']], $parsed['headers']);
});

// The connection test passes no stored headers when they must not follow
// the request to the URL that was typed: the mask then stands for nothing.
test('a masked value with nothing stored behind it is refused', function () {
    $text = 'X-Token: ' . AI_UPSTREAM_HEADER_MASK;
    assertSame(['line' => 1, 'reason' => 'masked'], aiUpstreamParseHeaders($text)['error']);
    assertSame(['line' => 1, 'reason' => 'masked'], aiUpstreamParseHeaders($text, [['name' => 'X-Other', 'value' => 'v']])['error']);
});

test('stored headers survive a round trip and are validated on the way back', function () {
    $headers = [['name' => 'X-A', 'value' => 'one two'], ['name' => 'X-B', 'value' => '"quoted" \\ /']];
    assertSame($headers, aiUpstreamDecodeHeaders(aiUpstreamEncodeHeaders($headers)));
    assertSame('', aiUpstreamEncodeHeaders([]));
    assertSame([], aiUpstreamDecodeHeaders(''));
    assertSame([], aiUpstreamDecodeHeaders('not json'));
    assertSame([], aiUpstreamDecodeHeaders('"a string"'));

    $tampered = json_encode([['X-A', "1\r\nAuthorization: Bearer stolen"], ['Host', 'evil.example'], ['X-Ok', 'fine'], 'junk', ['X-Short']]);
    assertSame([['name' => 'X-Ok', 'value' => 'fine']], aiUpstreamDecodeHeaders($tampered));
});

test('every request names Poznote unless the configuration sets its own User-Agent', function () {
    assertSame(['User-Agent: Poznote/6.116.0'], aiUpstreamIdentityHeaders('6.116.0'));
    assertSame(['User-Agent: Poznote'], aiUpstreamIdentityHeaders(''));
    assertSame(['User-Agent: Poznote/6.1X-Injected1'], aiUpstreamIdentityHeaders("6.1\r\nX-Injected: 1 "), 'a version cannot break the line either');
    assertSame(
        ['User-Agent: Poznote/1.0', 'x-litellm-customer-id: poznote'],
        aiUpstreamIdentityHeaders('1.0', [['name' => 'x-litellm-customer-id', 'value' => 'poznote']])
    );
    assertSame(
        ['user-agent: my-notes'],
        aiUpstreamIdentityHeaders('1.0', [['name' => 'user-agent', 'value' => 'my-notes']])
    );
});
