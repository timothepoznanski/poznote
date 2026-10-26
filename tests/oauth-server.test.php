<?php
lib('oauth-server');

// The OAuth server that lets chat apps sign in to the MCP server (#1681).
// What is pinned here is what an attacker controls: the redirect URI an app
// registers, the one it later asks to be sent to, the PKCE verifier, and the
// metadata body of an open registration endpoint.

test('PKCE S256 accepts the matching verifier only', function () {
    $verifier = str_repeat('a1b2C3d4-._~', 5);
    $challenge = oauthBase64UrlEncode(hash('sha256', $verifier, true));
    assertTrue(oauthIsValidCodeChallenge($challenge), 'challenge shape');
    assertTrue(oauthVerifyPkce($verifier, $challenge), 'matching verifier');
    assertFalse(oauthVerifyPkce($verifier . 'x', $challenge), 'other verifier');
    assertFalse(oauthVerifyPkce('short', oauthBase64UrlEncode(hash('sha256', 'short', true))), 'too short for RFC 7636');
    assertFalse(oauthVerifyPkce($verifier, ''), 'no challenge stored');
});

test('the RFC 7636 example verifier hashes to its published challenge', function () {
    assertTrue(oauthVerifyPkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
});

test('redirect URIs: https, loopback http and app schemes only', function () {
    foreach (['https://claude.ai/api/mcp/auth_callback', 'https://chatgpt.com/connector_platform_oauth_redirect',
              'http://127.0.0.1:33418/callback', 'http://localhost:6274/oauth/callback', 'http://[::1]:8080/cb',
              'cursor://anysphere.cursor-retrieval/oauth/callback', 'com.example.app:/oauth'] as $uri) {
        assertTrue(oauthIsAllowedRedirectUri($uri), $uri);
    }
    foreach (['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
              'https://example.com/cb#frag', 'https:///nohost', '', "https://example.com/\ncb", 'http://127.0.0.1.evil.example/cb',
              'vbscript:x', '//example.com/cb'] as $uri) {
        assertFalse(oauthIsAllowedRedirectUri($uri), var_export($uri, true));
    }
});

test('a requested redirect URI must be one the app registered', function () {
    $registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1/callback'];
    assertTrue(oauthRedirectUriMatches('https://claude.ai/api/mcp/auth_callback', $registered), 'exact');
    assertFalse(oauthRedirectUriMatches('https://claude.ai/api/mcp/auth_callback/../evil', $registered), 'path suffix');
    assertFalse(oauthRedirectUriMatches('https://claude.ai.evil.example/api/mcp/auth_callback', $registered), 'host suffix');
    assertFalse(oauthRedirectUriMatches('https://claude.ai/api/mcp/auth_callback?x=1', $registered), 'added query');
    // RFC 8252 7.3: a desktop app listens on whatever loopback port is free
    assertTrue(oauthRedirectUriMatches('http://127.0.0.1:51234/callback', $registered), 'loopback port');
    assertFalse(oauthRedirectUriMatches('http://127.0.0.1:51234/other', $registered), 'loopback other path');
    assertFalse(oauthRedirectUriMatches('http://localhost:51234/callback', $registered), 'loopback other host');
});

test('registration metadata is validated and normalised', function () {
    $ok = oauthNormalizeClientMetadata([
        'client_name' => "  Claude\n ",
        'redirect_uris' => ['https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback'],
        'token_endpoint_auth_method' => 'none',
        'grant_types' => ['authorization_code', 'refresh_token'],
        'response_types' => ['code'],
    ]);
    assertTrue(is_array($ok), 'accepted');
    assertSame('Claude', $ok['client_name'], 'name trimmed');
    assertSame(['https://claude.ai/api/mcp/auth_callback'], $ok['redirect_uris'], 'duplicates dropped');
    assertSame('none', $ok['token_endpoint_auth_method'], 'public client');

    $default = oauthNormalizeClientMetadata(['redirect_uris' => ['https://chatgpt.com/cb']]);
    assertSame('client_secret_basic', $default['token_endpoint_auth_method'], 'RFC 7591 default');

    assertTrue(is_string(oauthNormalizeClientMetadata('nope')), 'not an object');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => []])), 'no redirect');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => ['http://evil.example/cb']])), 'plain http');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => ['https://a/cb'], 'grant_types' => ['password']])), 'password grant');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => ['https://a/cb'], 'response_types' => ['token']])), 'implicit');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => ['https://a/cb'], 'token_endpoint_auth_method' => 'private_key_jwt'])), 'auth method');
    assertTrue(is_string(oauthNormalizeClientMetadata(['redirect_uris' => array_fill(0, OAUTH_MAX_REDIRECT_URIS + 1, 'https://a/cb')])), 'too many');
});

test('scope, resource and level fall back to safe values', function () {
    assertSame('mcp', oauthNormalizeScope(null), 'absent scope');
    assertSame('mcp offline_access', oauthNormalizeScope(" mcp  offline_access mcp "), 'kept as sent, deduplicated');
    assertSame('mcp', oauthNormalizeScope('"quoted" \\back'), 'invalid characters dropped');
    assertSame('https://mcp.example.com/mcp', oauthNormalizeResource('https://mcp.example.com/mcp'), 'resource kept');
    assertSame('', oauthNormalizeResource('https://mcp.example.com/mcp#x'), 'fragment refused');
    assertSame('', oauthNormalizeResource('urn:x'), 'not a URL');
    assertSame('read', oauthNormalizeAccessLevel('read'), 'known level');
    assertSame(OAUTH_DEFAULT_ACCESS_LEVEL, oauthNormalizeAccessLevel('root'), 'unknown level');
});

test('the response goes on the registered redirect, its query kept', function () {
    assertSame('https://a.example/cb?code=c1&state=s%20t', oauthBuildRedirect('https://a.example/cb', ['code' => 'c1', 'state' => 's t']));
    assertSame('https://a.example/cb?x=1&error=access_denied', oauthBuildRedirect('https://a.example/cb?x=1', ['error' => 'access_denied', 'state' => '']));
});

test('generated secrets carry their prefix and are stored hashed', function () {
    $token = oauthGenerateSecret(OAUTH_ACCESS_TOKEN_PREFIX);
    assertSame(0, strpos($token, OAUTH_ACCESS_TOKEN_PREFIX), 'prefix');
    assertSame(strlen(OAUTH_ACCESS_TOKEN_PREFIX) + 43, strlen($token), '256 bits, base64url');
    if ($token === oauthGenerateSecret(OAUTH_ACCESS_TOKEN_PREFIX)) {
        fail('two calls returned the same token');
    }
    assertSame(64, strlen(oauthHashSecret($token)), 'sha256 hex');
    assertNotContains($token, oauthHashSecret($token), 'token not in its hash');
});

test('an app without a name is shown by the host it redirects to', function () {
    assertSame('Claude', oauthClientDisplayName(['client_name' => 'Claude', 'redirect_uris' => ['https://claude.ai/cb']]));
    assertSame('chatgpt.com', oauthClientDisplayName(['client_name' => '', 'redirect_uris' => ['https://chatgpt.com/cb']]));
    assertSame('com.example.app', oauthClientDisplayName(['client_name' => '', 'redirect_uris' => ['com.example.app:/oauth']]));
});

test('the consent page address survives the login redirect filter, password and SSO alike', function () {
    // authorize.php sends an anonymous visitor to login.php?redirect=<this>,
    // and both login.php and oidc_callback.php hand it to the sanitizer
    // before going back; a refusal would drop the person on the home page.
    lib('safe-redirect');
    $target = 'oauth/authorize.php?request=' . bin2hex(random_bytes(12));
    assertSame($target, poznoteSanitizeLocalRedirect($target));
});

// Findings of the security review of #1681, kept fixed.

test('a redirect URI whose host PHP and browsers read differently is refused', function () {
    foreach (['https://evil.example\\@claude.ai/api/mcp/auth_callback',   // \ is / to a browser
              'https://evil.example@claude.ai/cb',                         // userinfo
              'https://user:pass@claude.ai/cb',
              'http://evil.example\\@127.0.0.1:5555/cb',
              'https://x"onfocus="alert(1)"autofocus="/cb',                 // quote in the host
              'https://claude.ai%2F@evil.example/cb',
              "https://claude.ai/cb\u{202E}", 'https://exa mple.com/cb', 'https://<x>/cb'] as $uri) {
        assertFalse(oauthIsAllowedRedirectUri($uri), $uri);
    }
    // the loopback port rule never lets one of them match a registered callback
    assertFalse(oauthRedirectUriMatches('http://evil.example\\@127.0.0.1:5555/cb', ['http://127.0.0.1/cb']), 'loopback + backslash');
    assertFalse(oauthRedirectUriMatches('http://evil.example@127.0.0.1:5555/cb', ['http://127.0.0.1/cb']), 'loopback + userinfo');
    assertTrue(oauthRedirectUriMatches('http://127.0.0.1:5555/cb', ['http://127.0.0.1/cb']), 'plain loopback still works');
});

test('an app name cannot carry markup or invisible characters', function () {
    $m = oauthNormalizeClientMetadata([
        'client_name' => "Claude\" style=\"x\" onmouseover=\"import('//evil')\u{202E}\u{200B}<b>`",
        'redirect_uris' => ['https://claude.ai/cb'],
    ]);
    foreach (['"', "'", '<', '>', '`', "\u{202E}", "\u{200B}"] as $c) {
        assertFalse(strpos($m['client_name'], $c) !== false, 'kept ' . json_encode($c));
    }
    assertSame(0, strpos($m['client_name'], 'Claude'), 'readable part kept');
});

test('a token can only be asked for this instance MCP server when its address is known', function () {
    assertTrue(oauthResourceIsThisMcpServer('https://mcp.example.com/mcp', 'https://mcp.example.com'), 'resource URL');
    assertTrue(oauthResourceIsThisMcpServer('https://mcp.example.com/', 'https://mcp.example.com/'), 'base URL');
    assertFalse(oauthResourceIsThisMcpServer('https://other.example/mcp', 'https://mcp.example.com'), 'another server');
    assertTrue(oauthResourceIsThisMcpServer('https://other.example/mcp', ''), 'unknown address: left to the MCP audience check');
});

test('the sign-in address notice tells an administrator what will not work', function () {
    assertSame('missing', oauthSignInUrlStatus(''), 'empty');
    assertSame('ok', oauthSignInUrlStatus('https://notes.example.com'), 'public https');
    assertSame('ok', oauthSignInUrlStatus('https://notes.example.com:8443/'), 'public https with a port');
    foreach (['http://notes.example.com', 'https://localhost', 'https://127.0.0.1:8042', 'https://192.168.1.10',
              'https://10.0.0.5:8040', 'https://172.16.0.2', 'https://poznote', 'https://nas.local', 'notes.example.com'] as $url) {
        assertSame('unreachable', oauthSignInUrlStatus($url), $url);
    }
});
