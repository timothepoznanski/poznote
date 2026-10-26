<?php
/**
 * OAuth token endpoint, for the MCP server.
 *
 * Two grants: authorization_code, with the PKCE verifier, right after the
 * consent page; refresh_token, whenever the app's access token (one hour)
 * has run out. Refresh tokens are rotated: each works once. See
 * src/lib/oauth-server.php.
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
    $usedBasic = preg_match('/^Basic\s/i', (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '')) === 1;
    oauthErrorResponse('invalid_client', 'Unknown client or wrong client secret', 401,
        $usedBasic ? ['WWW-Authenticate' => 'Basic realm="poznote-oauth"'] : []);
}

pruneOAuthTables();

$grantType = is_string($_POST['grant_type'] ?? null) ? $_POST['grant_type'] : '';

if ($grantType === 'authorization_code') {
    $code = is_string($_POST['code'] ?? null) ? $_POST['code'] : '';
    $verifier = is_string($_POST['code_verifier'] ?? null) ? $_POST['code_verifier'] : '';
    $redirectUri = is_string($_POST['redirect_uri'] ?? null) ? $_POST['redirect_uri'] : '';

    $row = consumeOAuthAuthorizationCode($code);
    if ($row === null || !hash_equals((string)$row['client_id'], (string)$client['client_id'])) {
        oauthErrorResponse('invalid_grant', 'The authorization code is invalid, expired or already used');
    }
    // RFC 6749 section 4.1.3: the same redirect_uri as the authorization request
    if ($redirectUri !== '' && !hash_equals((string)$row['redirect_uri'], $redirectUri)) {
        oauthErrorResponse('invalid_grant', 'redirect_uri does not match the authorization request');
    }
    if (!oauthVerifyPkce($verifier, (string)$row['code_challenge'])) {
        oauthErrorResponse('invalid_grant', 'PKCE verification failed');
    }
    if (!oauthGrantAccountStillAllowed((int)$row['user_id'], (int)$row['login_user_id'])) {
        oauthErrorResponse('invalid_grant', 'The account is no longer available');
    }

    $tokens = createOAuthGrantFromCode($row);
} elseif ($grantType === 'refresh_token') {
    $refreshToken = is_string($_POST['refresh_token'] ?? null) ? $_POST['refresh_token'] : '';
    $tokens = refreshOAuthGrant($refreshToken, (string)$client['client_id']);
    if ($tokens === null) {
        oauthErrorResponse('invalid_grant', 'The refresh token is invalid, expired or revoked');
    }
} else {
    oauthErrorResponse('unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token');
}

if ($tokens === null) {
    oauthErrorResponse('server_error', 'The token could not be issued', 500);
}

oauthJsonResponse([
    'access_token' => $tokens['access_token'],
    'token_type' => 'Bearer',
    'expires_in' => $tokens['expires_in'],
    'refresh_token' => $tokens['refresh_token'],
    'scope' => $tokens['scope'],
]);
