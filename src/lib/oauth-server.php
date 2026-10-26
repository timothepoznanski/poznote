<?php
/**
 * OAuth 2.1 authorization server for the MCP server: the pure part.
 *
 * Chat apps that connect to a remote MCP server (ChatGPT, Claude Desktop and
 * claude.ai, Gemini, ...) do not take a pasted token: they expect the server
 * to send them through an OAuth sign-in (issue #1681). Poznote plays the
 * authorization server, so the person signs in the way they always do,
 * password, two-factor or SSO, picks the access level, and the app gets a
 * token bound to that person's own account and nothing else. The MCP server is the
 * resource server: it advertises this server, and asks Poznote what each
 * token it receives belongs to (src/public/oauth/introspect.php).
 *
 * What is supported is what those apps use and nothing more:
 *  - dynamic client registration (RFC 7591), since an app registers itself
 *    the first time a user adds the connector;
 *  - the authorization code grant with PKCE S256, which is mandatory, and
 *    refresh tokens, rotated on every use;
 *  - revocation (RFC 7009), and introspection (RFC 7662) for the MCP server
 *    only, authenticated with its service token.
 * No implicit grant, no password grant, no client credentials grant.
 *
 * This file holds what needs no database so tests/ can cover it. The storage
 * side is src/users/oauth.php, the endpoints are in src/public/oauth/.
 */

/** Prefixes, so a secret-scanning tool recognises a leaked one. */
const OAUTH_ACCESS_TOKEN_PREFIX = 'pzo_';
const OAUTH_REFRESH_TOKEN_PREFIX = 'pzr_';
const OAUTH_CODE_PREFIX = 'pzc_';
const OAUTH_CLIENT_ID_PREFIX = 'pzclient_';

/** Lifetimes, in seconds. */
const OAUTH_CODE_TTL = 300;
const OAUTH_ACCESS_TOKEN_TTL = 3600;
/** A refresh token lasts this long after its last use, then the app signs in again. */
const OAUTH_REFRESH_TOKEN_TTL = 90 * 86400;
/**
 * A refresh token works once. Presented again, it means somebody else holds a
 * copy, and the whole connection is revoked (OAuth 2.1 section 4.3.1)...
 * except within this many seconds of its rotation, where it is far more likely
 * the same app sending two refreshes at once: that one is only refused.
 */
const OAUTH_REFRESH_REUSE_GRACE = 30;

/** The scope apps are told about. The access level is chosen on the consent page. */
const OAUTH_DEFAULT_SCOPE = 'mcp';

/**
 * Access levels, lowest first. Same names and meaning as POZNOTE_MCP_SCOPE in
 * the MCP server, which caps them: a token never reaches a tool the server
 * does not expose.
 */
const OAUTH_ACCESS_LEVELS = ['read', 'write', 'admin'];
const OAUTH_DEFAULT_ACCESS_LEVEL = 'write';

/** Registration limits: an open endpoint must not let anyone fill the table. */
const OAUTH_CLIENT_NAME_MAX_LENGTH = 100;
const OAUTH_MAX_REDIRECT_URIS = 10;
const OAUTH_REDIRECT_URI_MAX_LENGTH = 2000;
/**
 * Registrations that never led to a sign-in are forgotten after a month. Not
 * sooner: an administrator may add the connector to a whole team (Claude's
 * organisation connectors register once) and the people sign in days later
 * with that same client_id. One that did lead to a sign-in is kept as long as
 * a refresh token could live after its last connection (see pruneOAuthTables).
 */
const OAUTH_UNUSED_CLIENT_TTL = 30 * 86400;
/**
 * No more than this many never-used registrations are kept at once: past it,
 * the oldest are dropped to make room (createOAuthClient()), so the table
 * stays bounded without an anonymous flood being able to refuse new
 * connections. A row is a few hundred bytes; a flood has to sustain this many
 * in a month before it can push out a registration somebody is about to use.
 */
const OAUTH_MAX_PENDING_CLIENTS = 5000;

const OAUTH_TOKEN_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];

function oauthBase64UrlEncode(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/** A new opaque secret with its prefix: 32 random bytes, 256 bits. */
function oauthGenerateSecret(string $prefix): string
{
    return $prefix . oauthBase64UrlEncode(random_bytes(32));
}

/**
 * What a secret is stored as. A plain SHA-256 is enough: the secrets are
 * 256 random bits, not something a user chose, so there is nothing to slow
 * down a guess of, and the lookup on every MCP call stays an index hit.
 */
function oauthHashSecret(string $secret): string
{
    return hash('sha256', $secret);
}

/**
 * PKCE S256 (RFC 7636): the verifier the app sends with the code must hash to
 * the challenge it sent when the sign-in began. The verifier's own shape is
 * checked too (43 to 128 unreserved characters), as the RFC requires.
 */
function oauthVerifyPkce(string $verifier, string $challenge): bool
{
    if (!preg_match('/^[A-Za-z0-9._~-]{43,128}$/', $verifier) || $challenge === '') {
        return false;
    }
    return hash_equals($challenge, oauthBase64UrlEncode(hash('sha256', $verifier, true)));
}

function oauthIsValidCodeChallenge(string $challenge): bool
{
    // base64url of a SHA-256 digest is always 43 characters
    return preg_match('/^[A-Za-z0-9_-]{43}$/', $challenge) === 1;
}

function oauthIsLoopbackHost(string $host): bool
{
    $host = strtolower(trim($host, '[]'));
    return $host === 'localhost' || $host === '127.0.0.1' || $host === '::1';
}

/**
 * Whether an app may register this redirect URI.
 *
 *  - https anywhere (claude.ai, chatgpt.com, ...);
 *  - http only to the machine itself, where desktop apps and CLIs listen on a
 *    random port (RFC 8252 section 7.3);
 *  - a private-use scheme such as cursor:// or vscode:// (RFC 8252 section
 *    7.1), except the schemes a browser would run or read instead of handing
 *    to an app.
 * Never a fragment, which the code would end up in.
 */
function oauthIsAllowedRedirectUri(string $uri): bool
{
    if ($uri === '' || strlen($uri) > OAUTH_REDIRECT_URI_MAX_LENGTH) {
        return false;
    }
    // RFC 3986 characters only, and no fragment. Anything else is where PHP's
    // parse_url() and a browser stop agreeing on the host: with a backslash,
    // "https://evil.example\@claude.ai/cb" is claude.ai to PHP, so to the
    // consent page, and evil.example to the browser that follows the redirect.
    if (!preg_match('/^[A-Za-z0-9\-._~:\/?\[\]@!$&\'()*+,;=%]+$/', $uri) || strpos($uri, '#') !== false) {
        return false;
    }
    $parts = parse_url($uri);
    if ($parts === false || empty($parts['scheme'])) {
        return false;
    }
    $scheme = strtolower($parts['scheme']);
    if (!preg_match('/^[a-z][a-z0-9+.-]*$/', $scheme)) {
        return false;
    }
    // No credentials in the authority ("user@host"): another way to show one
    // host and send to another, and no app needs them in a callback.
    $rest = substr($uri, strlen($parts['scheme']) + 1);
    if (strncmp($rest, '//', 2) === 0) {
        $authority = substr($rest, 2, strcspn($rest, '/?', 2));
        if (strpos($authority, '@') !== false) {
            return false;
        }
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        return false;
    }
    if ($scheme === 'https' || $scheme === 'http') {
        $host = (string)($parts['host'] ?? '');
        $isDnsName = preg_match('/^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/', $host) === 1;
        $isIpv6 = preg_match('/^\[[0-9A-Fa-f:.]+\]$/', $host) === 1;
        if (!$isDnsName && !$isIpv6) {
            return false;
        }
        return $scheme === 'https' || oauthIsLoopbackHost($host);
    }
    $blocked = ['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'ftp', 'ws', 'wss', 'mailto', 'tel', 'sms'];
    return !in_array($scheme, $blocked, true);
}

/**
 * Whether a redirect URI sent to /authorize matches a registered one.
 *
 * Exact string match, except for the port of a loopback http URI: a desktop
 * app registers http://127.0.0.1/callback once and listens on whatever port
 * is free each time (RFC 8252 section 7.3).
 */
function oauthRedirectUriMatches(string $requested, array $registered): bool
{
    // The requested one is held to the registration rules too, so the loopback
    // port rule below can never let an odd URI through by comparing parts.
    if (!oauthIsAllowedRedirectUri($requested)) {
        return false;
    }
    foreach ($registered as $candidate) {
        if (!is_string($candidate)) {
            continue;
        }
        if (hash_equals($candidate, $requested)) {
            return true;
        }
        $a = parse_url($candidate);
        $b = parse_url($requested);
        if (!is_array($a) || !is_array($b)) {
            continue;
        }
        if (strtolower($a['scheme'] ?? '') === 'http' && strtolower($b['scheme'] ?? '') === 'http'
            && oauthIsLoopbackHost($a['host'] ?? '') && strtolower($a['host'] ?? '') === strtolower($b['host'] ?? '')
            && ($a['path'] ?? '') === ($b['path'] ?? '') && ($a['query'] ?? '') === ($b['query'] ?? '')) {
            return true;
        }
    }
    return false;
}

/**
 * Normalise the body of a registration request (RFC 7591).
 *
 * @return array{client_name:string,redirect_uris:list<string>,token_endpoint_auth_method:string}|string
 *         the metadata to store, or the error_description to answer with
 */
function oauthNormalizeClientMetadata($data)
{
    if (!is_array($data)) {
        return 'The request body must be a JSON object';
    }

    $uris = $data['redirect_uris'] ?? null;
    if (!is_array($uris) || $uris === [] || count($uris) > OAUTH_MAX_REDIRECT_URIS) {
        return 'redirect_uris must list between 1 and ' . OAUTH_MAX_REDIRECT_URIS . ' URIs';
    }
    $redirectUris = [];
    foreach ($uris as $uri) {
        if (!is_string($uri) || !oauthIsAllowedRedirectUri($uri)) {
            return 'Redirect URI not allowed: use https, http on localhost, or an app scheme';
        }
        $redirectUris[] = $uri;
    }

    $grantTypes = $data['grant_types'] ?? ['authorization_code'];
    if (!is_array($grantTypes) || array_diff($grantTypes, ['authorization_code', 'refresh_token']) !== []) {
        return 'Only the authorization_code and refresh_token grant types are supported';
    }
    $responseTypes = $data['response_types'] ?? ['code'];
    if (!is_array($responseTypes) || array_diff($responseTypes, ['code']) !== []) {
        return 'Only the code response type is supported';
    }

    // RFC 7591 makes client_secret_basic the default when the field is absent
    $method = $data['token_endpoint_auth_method'] ?? 'client_secret_basic';
    if (!is_string($method) || !in_array($method, OAUTH_TOKEN_AUTH_METHODS, true)) {
        return 'token_endpoint_auth_method must be one of ' . implode(', ', OAUTH_TOKEN_AUTH_METHODS);
    }

    // The name is shown to people (consent page, Settings) and chosen by
    // whoever registers: no markup characters, and none of the invisible or
    // direction-changing ones that make a name read as another.
    $name = is_string($data['client_name'] ?? null) ? $data['client_name'] : '';
    $name = (string)preg_replace('/[\x00-\x1F\x7F"\'<>`\\\\]+/', ' ', $name);
    $name = (string)preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]+/u', '', $name);
    $name = trim((string)preg_replace('/\s+/u', ' ', $name));
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, OAUTH_CLIENT_NAME_MAX_LENGTH);
    } else {
        $name = substr($name, 0, OAUTH_CLIENT_NAME_MAX_LENGTH);
    }

    return [
        'client_name' => $name,
        'redirect_uris' => array_values(array_unique($redirectUris)),
        'token_endpoint_auth_method' => $method,
    ];
}

/**
 * The scope an app asked for, kept as it sent it so the token response can
 * echo it back. Only the characters RFC 6749 allows in a scope.
 */
function oauthNormalizeScope($scope): string
{
    if (!is_string($scope)) {
        return OAUTH_DEFAULT_SCOPE;
    }
    $tokens = preg_split('/\s+/', trim($scope), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $tokens = array_values(array_filter($tokens, static function ($t) {
        return preg_match('/^[\x21\x23-\x5B\x5D-\x7E]{1,100}$/', $t) === 1;
    }));
    $tokens = array_slice(array_values(array_unique($tokens)), 0, 20);
    return $tokens ? implode(' ', $tokens) : OAUTH_DEFAULT_SCOPE;
}

/**
 * The resource indicator (RFC 8707) an app names, usually the MCP server's
 * URL. Recorded and handed back as the token's audience, so the MCP server
 * can refuse a token issued for somewhere else. '' when absent or unusable.
 */
function oauthNormalizeResource($resource): string
{
    if (!is_string($resource) || $resource === '' || strlen($resource) > OAUTH_REDIRECT_URI_MAX_LENGTH) {
        return '';
    }
    $parts = parse_url($resource);
    if (!is_array($parts) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        || empty($parts['host']) || isset($parts['fragment'])) {
        return '';
    }
    return $resource;
}

/**
 * Whether a resource indicator names this instance's MCP server. The web
 * server reads the same .env as the MCP container: with
 * POZNOTE_MCP_PUBLIC_URL set, only that server (with or without /mcp) is
 * accepted. Without it there is nothing to compare with, and the MCP server's
 * own audience check is the guard.
 */
function oauthResourceIsThisMcpServer(string $resource, ?string $publicUrl = null): bool
{
    $publicUrl = rtrim(trim((string)($publicUrl ?? (function_exists('_env') ? _env('POZNOTE_MCP_PUBLIC_URL', '') : ''))), '/');
    if ($publicUrl === '') {
        return true;
    }
    return in_array(rtrim($resource, '/'), [$publicUrl, $publicUrl . '/mcp'], true);
}

/**
 * Whether the address chat apps are sent to sign in at (the instance URL)
 * can work for them, for the notice shown to administrators in Settings:
 * 'missing' (nothing set), 'unreachable' (plain http, or a host only a local
 * network resolves: the apps connect from the internet over HTTPS), or 'ok'.
 */
function oauthSignInUrlStatus(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return 'missing';
    }
    $parts = parse_url($url);
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https' || $host === '') {
        return 'unreachable';
    }
    if ($host === 'localhost' || substr($host, -6) === '.local' || strpos($host, '.') === false) {
        return 'unreachable';
    }
    $ip = trim($host, '[]');
    if (filter_var($ip, FILTER_VALIDATE_IP) !== false
        && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return 'unreachable';
    }
    return 'ok';
}

function oauthNormalizeAccessLevel($level): string
{
    return is_string($level) && in_array($level, OAUTH_ACCESS_LEVELS, true) ? $level : OAUTH_DEFAULT_ACCESS_LEVEL;
}

/**
 * A redirect URI with the response parameters added to its query, keeping
 * any query it already has.
 */
function oauthBuildRedirect(string $redirectUri, array $params): string
{
    $params = array_filter($params, static function ($v) {
        return $v !== null && $v !== '';
    });
    if ($params === []) {
        return $redirectUri;
    }
    return $redirectUri . (strpos($redirectUri, '?') === false ? '?' : '&') . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

/** Name shown for a client that registered without one: the redirect's host. */
function oauthClientDisplayName(array $client): string
{
    $name = trim((string)($client['client_name'] ?? ''));
    if ($name !== '') {
        return $name;
    }
    $uris = $client['redirect_uris'] ?? [];
    $first = is_array($uris) && $uris ? (string)reset($uris) : '';
    $host = (string)(parse_url($first, PHP_URL_HOST) ?? '');
    return $host !== '' ? $host : (string)(parse_url($first, PHP_URL_SCHEME) ?? 'app');
}

/**
 * Answer a JSON endpoint and stop. Every token endpoint response carries
 * no-store (RFC 6749 section 5.1).
 */
function oauthJsonResponse(array $body, int $status = 200, array $headers = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Pragma: no-cache');
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}

function oauthErrorResponse(string $error, string $description = '', int $status = 400, array $headers = []): never
{
    $body = ['error' => $error];
    if ($description !== '') {
        $body['error_description'] = $description;
    }
    oauthJsonResponse($body, $status, $headers);
}

/**
 * CORS for the endpoints an app may call from a browser page (registration,
 * token, revocation). They never read a cookie, so a wildcard origin is safe.
 * Answers a preflight and stops.
 */
function oauthHandleCors(string $methods = 'POST, OPTIONS'): void
{
    header('Access-Control-Allow-Origin: *');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        header('Access-Control-Allow-Methods: ' . $methods);
        header('Access-Control-Allow-Headers: Authorization, Content-Type, MCP-Protocol-Version');
        header('Access-Control-Max-Age: 86400');
        http_response_code(204);
        exit;
    }
}

/**
 * Client credentials of a token or revocation request: HTTP Basic
 * (client_secret_basic) or form fields (client_secret_post, or a public
 * client sending only its id).
 *
 * @return array{0:string,1:?string} client_id and secret (null when none was sent)
 */
function oauthRequestClientCredentials(): array
{
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Basic\s+(.+)$/i', trim($header), $m)) {
        $decoded = base64_decode($m[1], true);
        if (is_string($decoded) && strpos($decoded, ':') !== false) {
            [$id, $secret] = explode(':', $decoded, 2);
            // RFC 6749 section 2.3.1: both are form-urlencoded inside Basic
            return [urldecode($id), urldecode($secret)];
        }
    }
    $id = is_string($_POST['client_id'] ?? null) ? $_POST['client_id'] : '';
    $secret = is_string($_POST['client_secret'] ?? null) ? $_POST['client_secret'] : null;
    return [$id, $secret];
}

/**
 * The MCP server's service token (data/.mcp_token), read without opening a
 * session: introspect.php is called by a server, not a browser. auth.php
 * creates the file on the first API call; until then nothing can match.
 */
function oauthServiceToken(): ?string
{
    $default = dirname(SQLITE_DATABASE, 2) . '/.mcp_token';
    $path = trim((string)_env('POZNOTE_SERVICE_TOKEN_FILE', $default));
    if ($path === '') {
        $path = $default;
    }
    if (!is_file($path) || !is_readable($path)) {
        return null;
    }
    $token = trim((string)@file_get_contents($path));
    return $token !== '' ? $token : null;
}
