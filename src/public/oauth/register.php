<?php
/**
 * OAuth dynamic client registration (RFC 7591), for the MCP server.
 *
 * A chat app registers itself here the first time someone adds Poznote as a
 * connector, then sends that person to authorize.php. Registration grants
 * nothing by itself: no token is issued until a signed-in user approves the
 * app on the consent page. See src/lib/oauth-server.php.
 */

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../users/oauth.php';

oauthHandleCors();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    oauthErrorResponse('invalid_request', 'Use POST', 405, ['Allow' => 'POST, OPTIONS']);
}

$raw = (string)file_get_contents('php://input', false, null, 0, 65536);
$metadata = oauthNormalizeClientMetadata(json_decode($raw, true));
if (is_string($metadata)) {
    $error = strpos($metadata, 'Redirect URI') === 0 ? 'invalid_redirect_uri' : 'invalid_client_metadata';
    oauthErrorResponse($error, $metadata);
}

$client = createOAuthClient($metadata);
if ($client === null) {
    oauthErrorResponse('temporarily_unavailable', 'Registration is not available right now, try again later', 503);
}

$response = [
    'client_id' => $client['client_id'],
    'client_id_issued_at' => $client['created_at'],
    'client_name' => $client['client_name'],
    'redirect_uris' => $client['redirect_uris'],
    'grant_types' => ['authorization_code', 'refresh_token'],
    'response_types' => ['code'],
    'token_endpoint_auth_method' => $client['token_endpoint_auth_method'],
    'scope' => OAUTH_DEFAULT_SCOPE,
];
if ($client['client_secret'] !== null) {
    $response['client_secret'] = $client['client_secret'];
    $response['client_secret_expires_at'] = 0;
}
oauthJsonResponse($response, 201);
