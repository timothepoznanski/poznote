<?php
/**
 * OAuth token introspection (RFC 7662), for the MCP server only.
 *
 * The MCP server asks here what each bearer token it receives belongs to:
 * the account (sub), the access level chosen on the consent page
 * (poznote_level) and the resource it was issued for (aud). The caller must
 * present the MCP service token (data/.mcp_token): anyone else would be
 * testing tokens they found. See src/lib/oauth-server.php.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../users/oauth.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    oauthErrorResponse('invalid_request', 'Use POST', 405, ['Allow' => 'POST']);
}

$header = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
$presented = preg_match('/^Bearer\s+(.+)$/i', $header, $m) ? trim($m[1]) : '';
$serviceToken = oauthServiceToken();
if ($serviceToken === null || $presented === '' || !hash_equals($serviceToken, $presented)) {
    oauthErrorResponse('invalid_client', 'Introspection is reserved to the MCP server', 401,
        ['WWW-Authenticate' => 'Bearer realm="poznote-oauth"']);
}

$token = is_string($_POST['token'] ?? null) ? trim($_POST['token']) : '';
$claims = $token !== '' ? introspectOAuthAccessToken($token) : null;

oauthJsonResponse($claims ?? ['active' => false]);
