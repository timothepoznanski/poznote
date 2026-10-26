<?php
/**
 * OAuth token revocation (RFC 7009), for the MCP server.
 *
 * An app disconnecting itself sends its access or refresh token here; the
 * whole connection (grant) it belongs to goes. The answer is 200 whether or
 * not the token was known, as the RFC asks. People disconnect an app from
 * Settings > Connected apps instead. See src/lib/oauth-server.php.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../users/oauth.php';

oauthHandleCors();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    oauthErrorResponse('invalid_request', 'Use POST', 405, ['Allow' => 'POST, OPTIONS']);
}

[$clientId, $clientSecret] = oauthRequestClientCredentials();
$client = authenticateOAuthClient($clientId, $clientSecret);
if ($client === null) {
    oauthErrorResponse('invalid_client', 'Unknown client or wrong client secret', 401);
}

$token = is_string($_POST['token'] ?? null) ? $_POST['token'] : '';
if ($token !== '') {
    revokeOAuthToken($token, (string)$client['client_id']);
}

oauthJsonResponse([]);
