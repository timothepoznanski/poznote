<?php

require_once __DIR__ . '/config.php';

function oidc_is_enabled() {
    return defined('OIDC_ENABLED') && OIDC_ENABLED === true && (OIDC_ISSUER !== '' || OIDC_DISCOVERY_URL !== '') && OIDC_CLIENT_ID !== '';
}

function oidc_base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function oidc_base64url_decode($data) {
    $data = strtr((string)$data, '-_', '+/');
    $pad = strlen($data) % 4;
    if ($pad) {
        $data .= str_repeat('=', 4 - $pad);
    }
    return base64_decode($data, true);
}

function oidc_get_base_url() {
    $proto = 'http';
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $proto = strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'])[0]));
    } elseif (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        $proto = 'https';
    }

    $host = $_SERVER['HTTP_HOST'] ?? (defined('SERVER_NAME') ? SERVER_NAME : 'localhost');
    return $proto . '://' . $host;
}

function oidc_get_redirect_uri() {
    if (defined('OIDC_REDIRECT_URI') && OIDC_REDIRECT_URI !== '') {
        return OIDC_REDIRECT_URI;
    }
    return oidc_get_base_url() . '/oidc_callback.php';
}

function oidc_get_post_logout_redirect_uri() {
    if (defined('OIDC_POST_LOGOUT_REDIRECT_URI') && OIDC_POST_LOGOUT_REDIRECT_URI !== '') {
        return OIDC_POST_LOGOUT_REDIRECT_URI;
    }
    return oidc_get_base_url() . '/login.php';
}

function oidc_http_request($url, $method = 'GET', $headers = [], $body = null, $timeoutSeconds = 10) {
    $method = strtoupper($method);
    $responseHeaders = [];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, (int)$timeoutSeconds);
        curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $headerLine) use (&$responseHeaders) {
            $len = strlen($headerLine);
            $parts = explode(':', $headerLine, 2);
            if (count($parts) === 2) {
                $name = strtolower(trim($parts[0]));
                $value = trim($parts[1]);
                $responseHeaders[$name][] = $value;
            }
            return $len;
        });

        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $respBody = curl_exec($ch);
        $err = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($respBody === false) {
            return ['ok' => false, 'status' => $status ?: 0, 'headers' => $responseHeaders, 'body' => '', 'error' => $err ?: 'curl error'];
        }

        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'headers' => $responseHeaders, 'body' => $respBody, 'error' => null];
    }

    // Fallback to file_get_contents
    $opts = [
        'http' => [
            'method' => $method,
            'timeout' => (int)$timeoutSeconds,
            'ignore_errors' => true,
        ]
    ];

    if (!empty($headers)) {
        $opts['http']['header'] = implode("\r\n", $headers);
    }
    if ($body !== null) {
        $opts['http']['content'] = $body;
    }

    $ctx = stream_context_create($opts);
    $respBody = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                $status = (int)$m[1];
                break;
            }
        }
    }

    if ($respBody === false) {
        return ['ok' => false, 'status' => $status, 'headers' => [], 'body' => '', 'error' => 'http request failed'];
    }

    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'headers' => [], 'body' => $respBody, 'error' => null];
}

function oidc_get_discovery_url() {
    if (defined('OIDC_DISCOVERY_URL') && OIDC_DISCOVERY_URL !== '') {
        return OIDC_DISCOVERY_URL;
    }
    $issuer = defined('OIDC_ISSUER') ? OIDC_ISSUER : '';
    if ($issuer === '') {
        return '';
    }
    return rtrim($issuer, '/') . '/.well-known/openid-configuration';
}

function oidc_get_provider_config() {
    if (!oidc_is_enabled()) {
        throw new Exception('OIDC is not enabled');
    }

    $cacheKey = 'oidc_provider_config';
    if (isset($_SESSION[$cacheKey]) && is_array($_SESSION[$cacheKey])) {
        return $_SESSION[$cacheKey];
    }

    $discoveryUrl = oidc_get_discovery_url();
    if ($discoveryUrl === '') {
        throw new Exception('OIDC discovery URL not configured');
    }

    $resp = oidc_http_request($discoveryUrl, 'GET', ['Accept: application/json']);
    if (!$resp['ok']) {
        throw new Exception('Failed to fetch OIDC discovery document');
    }

    $cfg = json_decode($resp['body'], true);
    if (!is_array($cfg)) {
        throw new Exception('Invalid OIDC discovery JSON');
    }

    foreach (['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'issuer'] as $required) {
        if (empty($cfg[$required]) || !is_string($cfg[$required])) {
            throw new Exception('OIDC discovery missing ' . $required);
        }
    }

    $_SESSION[$cacheKey] = $cfg;
    return $cfg;
}

function oidc_random_string($bytes = 32) {
    return oidc_base64url_encode(random_bytes((int)$bytes));
}

function oidc_create_pkce_pair() {
    $verifier = oidc_random_string(32);
    $challenge = oidc_base64url_encode(hash('sha256', $verifier, true));
    return ['verifier' => $verifier, 'challenge' => $challenge];
}

function oidc_build_authorization_url($redirectAfter = null) {
    $cfg = oidc_get_provider_config();

    $state = oidc_random_string(32);
    $nonce = oidc_random_string(32);
    $pkce = oidc_create_pkce_pair();

    $_SESSION['oidc_state'] = $state;
    $_SESSION['oidc_nonce'] = $nonce;
    $_SESSION['oidc_code_verifier'] = $pkce['verifier'];
    if (is_string($redirectAfter) && $redirectAfter !== '') {
        $_SESSION['oidc_redirect_after'] = $redirectAfter;
    } else {
        unset($_SESSION['oidc_redirect_after']);
    }

    $params = [
        'response_type' => 'code',
        'client_id' => OIDC_CLIENT_ID,
        'redirect_uri' => oidc_get_redirect_uri(),
        'scope' => (defined('OIDC_SCOPES') && OIDC_SCOPES !== '') ? OIDC_SCOPES : 'openid profile email',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $pkce['challenge'],
        'code_challenge_method' => 'S256',
    ];

    return $cfg['authorization_endpoint'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function oidc_exchange_code_for_tokens($code) {
    $cfg = oidc_get_provider_config();
    $verifier = $_SESSION['oidc_code_verifier'] ?? '';
    if (!is_string($verifier) || $verifier === '') {
        throw new Exception('Missing PKCE verifier');
    }

    $params = [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'redirect_uri' => oidc_get_redirect_uri(),
        'client_id' => OIDC_CLIENT_ID,
        'code_verifier' => $verifier,
    ];

    // Optional client_secret (confidential clients)
    if (defined('OIDC_CLIENT_SECRET') && OIDC_CLIENT_SECRET !== '') {
        $params['client_secret'] = OIDC_CLIENT_SECRET;
    }

    $body = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

    $resp = oidc_http_request(
        $cfg['token_endpoint'],
        'POST',
        ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        $body
    );

    if (!$resp['ok']) {
        throw new Exception('Failed to exchange authorization code for tokens');
    }

    $tokens = json_decode($resp['body'], true);
    if (!is_array($tokens) || empty($tokens['id_token']) || !is_string($tokens['id_token'])) {
        throw new Exception('Token response missing id_token');
    }

    return $tokens;
}

function oidc_asn1_len($len) {
    if ($len < 128) {
        return chr($len);
    }
    $out = '';
    while ($len > 0) {
        $out = chr($len & 0xff) . $out;
        $len >>= 8;
    }
    return chr(0x80 | strlen($out)) . $out;
}

function oidc_asn1_int($data) {
    $data = ltrim($data, "\x00");
    if ($data === '') {
        $data = "\x00";
    }
    if (ord($data[0]) > 0x7f) {
        $data = "\x00" . $data;
    }
    return "\x02" . oidc_asn1_len(strlen($data)) . $data;
}

function oidc_asn1_seq($data) {
    return "\x30" . oidc_asn1_len(strlen($data)) . $data;
}

function oidc_asn1_bit_string($data) {
    // 0 unused bits
    $data = "\x00" . $data;
    return "\x03" . oidc_asn1_len(strlen($data)) . $data;
}

function oidc_asn1_oid($oid) {
    $parts = array_map('intval', explode('.', $oid));
    $first = (40 * $parts[0]) + $parts[1];
    $out = chr($first);
    for ($i = 2; $i < count($parts); $i++) {
        $v = $parts[$i];
        $tmp = '';
        do {
            $tmp = chr($v & 0x7f) . $tmp;
            $v >>= 7;
        } while ($v > 0);
        $tmpLen = strlen($tmp);
        for ($j = 0; $j < $tmpLen - 1; $j++) {
            $tmp[$j] = chr(ord($tmp[$j]) | 0x80);
        }
        $out .= $tmp;
    }
    return "\x06" . oidc_asn1_len(strlen($out)) . $out;
}

function oidc_rsa_jwk_to_pem($n_b64u, $e_b64u) {
    $n = oidc_base64url_decode($n_b64u);
    $e = oidc_base64url_decode($e_b64u);
    if ($n === false || $e === false) {
        return null;
    }

    $rsaPubKey = oidc_asn1_seq(oidc_asn1_int($n) . oidc_asn1_int($e));

    // AlgorithmIdentifier for rsaEncryption OID 1.2.840.113549.1.1.1 + NULL
    $algId = oidc_asn1_seq(oidc_asn1_oid('1.2.840.113549.1.1.1') . "\x05\x00");

    $spki = oidc_asn1_seq($algId . oidc_asn1_bit_string($rsaPubKey));

    $pem = "-----BEGIN PUBLIC KEY-----\n";
    $pem .= chunk_split(base64_encode($spki), 64, "\n");
    $pem .= "-----END PUBLIC KEY-----\n";
    return $pem;
}

function oidc_get_jwks() {
    $cfg = oidc_get_provider_config();
    $cacheKey = 'oidc_jwks';

    if (isset($_SESSION[$cacheKey]) && is_array($_SESSION[$cacheKey])) {
        return $_SESSION[$cacheKey];
    }

    $resp = oidc_http_request($cfg['jwks_uri'], 'GET', ['Accept: application/json']);
    if (!$resp['ok']) {
        throw new Exception('Failed to fetch JWKS');
    }

    $jwks = json_decode($resp['body'], true);
    if (!is_array($jwks) || !isset($jwks['keys']) || !is_array($jwks['keys'])) {
        throw new Exception('Invalid JWKS JSON');
    }

    $_SESSION[$cacheKey] = $jwks;
    return $jwks;
}

function oidc_find_jwk_for_jwt_header($jwtHeader) {
    $jwks = oidc_get_jwks();
    $kid = $jwtHeader['kid'] ?? null;

    foreach ($jwks['keys'] as $k) {
        if (!is_array($k)) continue;
        if (($k['use'] ?? 'sig') !== 'sig') continue;
        if (($k['kty'] ?? '') !== 'RSA') continue;
        if ($kid !== null && isset($k['kid']) && $k['kid'] === $kid) {
            return $k;
        }
    }

    // fallback: first RSA signing key
    foreach ($jwks['keys'] as $k) {
        if (!is_array($k)) continue;
        if (($k['use'] ?? 'sig') !== 'sig') continue;
        if (($k['kty'] ?? '') !== 'RSA') continue;
        return $k;
    }

    return null;
}

function oidc_public_key_from_jwk($jwk) {
    if (!is_array($jwk)) {
        return null;
    }

    if (!empty($jwk['x5c']) && is_array($jwk['x5c']) && !empty($jwk['x5c'][0])) {
        $cert = "-----BEGIN CERTIFICATE-----\n" . chunk_split($jwk['x5c'][0], 64, "\n") . "-----END CERTIFICATE-----\n";
        $pk = openssl_pkey_get_public($cert);
        if ($pk !== false) {
            return $pk;
        }
    }

    if (!empty($jwk['n']) && !empty($jwk['e'])) {
        $pem = oidc_rsa_jwk_to_pem($jwk['n'], $jwk['e']);
        if ($pem) {
            $pk = openssl_pkey_get_public($pem);
            if ($pk !== false) {
                return $pk;
            }
        }
    }

    return null;
}

function oidc_parse_and_verify_id_token($idToken) {
    $parts = explode('.', (string)$idToken);
    if (count($parts) !== 3) {
        throw new Exception('Invalid id_token format');
    }

    $headerJson = oidc_base64url_decode($parts[0]);
    $payloadJson = oidc_base64url_decode($parts[1]);
    $sig = oidc_base64url_decode($parts[2]);

    if ($headerJson === false || $payloadJson === false || $sig === false) {
        throw new Exception('Invalid id_token encoding');
    }

    $header = json_decode($headerJson, true);
    $claims = json_decode($payloadJson, true);
    if (!is_array($header) || !is_array($claims)) {
        throw new Exception('Invalid id_token JSON');
    }

    $alg = $header['alg'] ?? '';
    if ($alg !== 'RS256') {
        throw new Exception('Unsupported id_token alg (only RS256 supported)');
    }

    $jwk = oidc_find_jwk_for_jwt_header($header);
    if (!$jwk) {
        throw new Exception('No matching JWK found');
    }

    $pubKey = oidc_public_key_from_jwk($jwk);
    if (!$pubKey) {
        throw new Exception('Failed to load public key');
    }

    $signed = $parts[0] . '.' . $parts[1];
    $ok = openssl_verify($signed, $sig, $pubKey, OPENSSL_ALGO_SHA256);
    if ($ok !== 1) {
        throw new Exception('Invalid id_token signature');
    }

    // Claims validation
    $cfg = oidc_get_provider_config();
    $iss = $claims['iss'] ?? '';
    if (!is_string($iss) || $iss !== $cfg['issuer']) {
        throw new Exception('Invalid issuer');
    }

    $aud = $claims['aud'] ?? null;
    $audOk = false;
    if (is_string($aud)) {
        $audOk = ($aud === OIDC_CLIENT_ID);
    } elseif (is_array($aud)) {
        $audOk = in_array(OIDC_CLIENT_ID, $aud, true);
    }
    if (!$audOk) {
        throw new Exception('Invalid audience');
    }

    $now = time();
    $exp = $claims['exp'] ?? null;
    if (!is_int($exp) && !is_float($exp)) {
        throw new Exception('Missing exp');
    }
    if ($now >= (int)$exp) {
        throw new Exception('Token expired');
    }

    $nonce = $claims['nonce'] ?? '';
    $expectedNonce = $_SESSION['oidc_nonce'] ?? '';
    if (!is_string($nonce) || $nonce === '' || !is_string($expectedNonce) || $expectedNonce === '' || !hash_equals($expectedNonce, $nonce)) {
        throw new Exception('Invalid nonce');
    }

    return $claims;
}

function oidc_claims_to_display_user($claims) {
    $candidates = [
        $claims['preferred_username'] ?? null,
        $claims['email'] ?? null,
        $claims['name'] ?? null,
        $claims['sub'] ?? null,
    ];

    foreach ($candidates as $c) {
        if (is_string($c) && $c !== '') {
            return $c;
        }
    }
    return 'oidc-user';
}

function oidc_finish_login($claims, $tokens) {
    $_SESSION['authenticated'] = true;
    $_SESSION['auth_method'] = 'oidc';
    $_SESSION['oidc_sub'] = $claims['sub'] ?? null;
    $_SESSION['oidc_user'] = oidc_claims_to_display_user($claims);
    $_SESSION['oidc_claims'] = [
        'sub' => $claims['sub'] ?? null,
        'email' => $claims['email'] ?? null,
        'name' => $claims['name'] ?? null,
        'preferred_username' => $claims['preferred_username'] ?? null,
        'iss' => $claims['iss'] ?? null,
    ];

    if (!empty($tokens['id_token']) && is_string($tokens['id_token'])) {
        $_SESSION['oidc_id_token'] = $tokens['id_token'];
    }

    // Clear transient values
    unset($_SESSION['oidc_state'], $_SESSION['oidc_nonce'], $_SESSION['oidc_code_verifier']);
}

function oidc_logout_redirect_url() {
    if (!oidc_is_enabled()) {
        return null;
    }

    if (!defined('OIDC_END_SESSION_ENDPOINT') || OIDC_END_SESSION_ENDPOINT === '') {
        return null;
    }

    $params = [
        'post_logout_redirect_uri' => oidc_get_post_logout_redirect_uri(),
    ];

    // Some providers accept id_token_hint
    if (isset($_SESSION['oidc_id_token']) && is_string($_SESSION['oidc_id_token']) && $_SESSION['oidc_id_token'] !== '') {
        $params['id_token_hint'] = $_SESSION['oidc_id_token'];
    }

    return OIDC_END_SESSION_ENDPOINT . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}
