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
