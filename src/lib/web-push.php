<?php
/**
 * Web Push without a library: message encryption (RFC 8291, aes128gcm
 * content coding of RFC 8188) and VAPID server identification (RFC 8292).
 *
 * Poznote ships no Composer dependency, and the openssl extension already has
 * every primitive this needs (P-256 ECDH, HKDF, AES-128-GCM, ECDSA). The
 * functions here are pure: no database, no network. Sending lives in
 * ReminderPushService.
 */

const WEB_PUSH_RECORD_SIZE = 4096;
// An aes128gcm record carries the 86-byte header, the padding delimiter and
// the 16-byte tag: what is left of 4096 bytes is the largest payload a push
// service has to accept.
const WEB_PUSH_MAX_PAYLOAD = 3993;

// Push services of the browsers. A subscription endpoint is a URL the server
// posts to on a client's word, so anything else is refused: it would turn the
// reminder worker into a way to reach arbitrary hosts.
const WEB_PUSH_ENDPOINT_HOSTS = [
    'fcm.googleapis.com',
    'android.googleapis.com',
    '.push.services.mozilla.com',
    '.push.apple.com',
    '.notify.windows.com',
];

function webPushBase64UrlEncode(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function webPushBase64UrlDecode(string $text): ?string
{
    $text = strtr(trim($text), '-_', '+/');
    if ($text === '' || preg_match('/[^A-Za-z0-9+\/=]/', $text)) {
        return null;
    }
    $bytes = base64_decode($text . str_repeat('=', (4 - strlen($text) % 4) % 4), true);
    return $bytes === false ? null : $bytes;
}

function webPushIsAllowedEndpoint(string $endpoint): bool
{
    if (strlen($endpoint) > 2000) {
        return false;
    }
    $parts = parse_url($endpoint);
    if (!is_array($parts) || strtolower((string)($parts['scheme'] ?? '')) !== 'https') {
        return false;
    }
    if (isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && (int)$parts['port'] !== 443)) {
        return false;
    }
    $host = strtolower((string)($parts['host'] ?? ''));
    foreach (WEB_PUSH_ENDPOINT_HOSTS as $allowed) {
        if ($allowed[0] === '.' ? str_ends_with($host, $allowed) : $host === $allowed) {
            return true;
        }
    }
    return false;
}

/**
 * A browser's subscription keys, checked: p256dh is an uncompressed P-256
 * point (65 bytes), auth a 16-byte secret.
 */
function webPushValidSubscriptionKeys(string $p256dh, string $auth): bool
{
    $point = webPushBase64UrlDecode($p256dh);
    $secret = webPushBase64UrlDecode($auth);
    return $point !== null && strlen($point) === 65 && $point[0] === "\x04"
        && $secret !== null && strlen($secret) === 16;
}

/** PEM public key from an uncompressed P-256 point. */
function webPushPublicKeyPem(string $point): string
{
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** PEM private key from a raw P-256 scalar and its public point. */
function webPushPrivateKeyPem(string $scalar, string $point): string
{
    $der = hex2bin('30770201010420') . $scalar . hex2bin('a00a06082a8648ce3d030107a144034200') . $point;
    return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
}

/**
 * A fresh P-256 key pair: the private key as PEM, the public one as the
 * uncompressed point browsers and push services exchange.
 *
 * @return array{private_pem:string,public:string}|null
 */
function webPushGenerateKeyPair(): ?array
{
    $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if ($key === false || !openssl_pkey_export($key, $pem)) {
        return null;
    }
    $public = webPushPublicPoint($pem);
    return $public === null ? null : ['private_pem' => $pem, 'public' => $public];
}

/** Uncompressed public point (65 bytes) of a PEM P-256 private key. */
function webPushPublicPoint(string $privatePem): ?string
{
    $key = openssl_pkey_get_private($privatePem);
    $details = $key === false ? false : openssl_pkey_get_details($key);
    if (!is_array($details) || !isset($details['ec']['x'], $details['ec']['y'])) {
        return null;
    }
    return "\x04" . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

/**
 * Encrypt a payload for one subscription. Returns the request body, already
 * in the aes128gcm coding (salt, record size, sender key, ciphertext).
 *
 * $senderKey and $salt exist for the RFC 8291 test vector; a real message
 * leaves them out and gets a fresh key pair and salt.
 */
function webPushEncrypt(string $payload, string $p256dh, string $auth, ?array $senderKey = null, ?string $salt = null): ?string
{
    $receiverPoint = webPushBase64UrlDecode($p256dh);
    $authSecret = webPushBase64UrlDecode($auth);
    if ($receiverPoint === null || $authSecret === null || !webPushValidSubscriptionKeys($p256dh, $auth)
        || strlen($payload) > WEB_PUSH_MAX_PAYLOAD) {
        return null;
    }

    $senderKey = $senderKey ?? webPushGenerateKeyPair();
    $salt = $salt ?? random_bytes(16);
    if ($senderKey === null || strlen($salt) !== 16) {
        return null;
    }

    $receiverKey = openssl_pkey_get_public(webPushPublicKeyPem($receiverPoint));
    $privateKey = openssl_pkey_get_private($senderKey['private_pem']);
    if ($receiverKey === false || $privateKey === false) {
        return null;
    }
    $sharedSecret = openssl_pkey_derive($receiverKey, $privateKey, 32);
    if ($sharedSecret === false) {
        return null;
    }

    $keyInfo = "WebPush: info\0" . $receiverPoint . $senderKey['public'];
    $ikm = hash_hkdf('sha256', $sharedSecret, 32, $keyInfo, $authSecret);
    $contentKey = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);

    // One record: the payload, then the 0x02 delimiter of a last record
    $tag = '';
    $ciphertext = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $contentKey, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($ciphertext === false) {
        return null;
    }

    return $salt . pack('N', WEB_PUSH_RECORD_SIZE) . chr(strlen($senderKey['public'])) . $senderKey['public'] . $ciphertext . $tag;
}

/**
 * The VAPID Authorization header value: a JWT signed with the instance key,
 * naming the push service it is for and who to contact about the sender.
 */
function webPushVapidAuthorization(string $endpoint, string $privatePem, string $subject, ?int $now = null): ?string
{
    $parts = parse_url($endpoint);
    $public = webPushPublicPoint($privatePem);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host']) || $public === null) {
        return null;
    }

    $header = webPushBase64UrlEncode((string)json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = webPushBase64UrlEncode((string)json_encode([
        'aud' => $parts['scheme'] . '://' . $parts['host'],
        'exp' => ($now ?? time()) + 12 * 3600,
        'sub' => $subject,
    ], JSON_UNESCAPED_SLASHES));

    $signed = $header . '.' . $claims;
    if (!openssl_sign($signed, $derSignature, $privatePem, OPENSSL_ALGO_SHA256)) {
        return null;
    }
    $signature = webPushEcdsaDerToRaw($derSignature);
    if ($signature === null) {
        return null;
    }

    return 'vapid t=' . $signed . '.' . webPushBase64UrlEncode($signature) . ', k=' . webPushBase64UrlEncode($public);
}

/**
 * openssl signs ECDSA as a DER sequence of two integers; a JWT wants them
 * as two fixed 32-byte numbers side by side.
 */
function webPushEcdsaDerToRaw(string $der): ?string
{
    $offset = 0;
    $readLength = function () use ($der, &$offset): ?int {
        if (!isset($der[$offset])) {
            return null;
        }
        $length = ord($der[$offset++]);
        if ($length & 0x80) {
            $bytes = $length & 0x7f;
            $length = 0;
            for ($i = 0; $i < $bytes; $i++) {
                if (!isset($der[$offset])) {
                    return null;
                }
                $length = ($length << 8) | ord($der[$offset++]);
            }
        }
        return $length;
    };

    if (($der[$offset++] ?? '') !== "\x30" || $readLength() === null) {
        return null;
    }
    $raw = '';
    for ($i = 0; $i < 2; $i++) {
        if (($der[$offset++] ?? '') !== "\x02") {
            return null;
        }
        $length = $readLength();
        if ($length === null || $offset + $length > strlen($der)) {
            return null;
        }
        $integer = ltrim(substr($der, $offset, $length), "\0");
        $offset += $length;
        if (strlen($integer) > 32) {
            return null;
        }
        $raw .= str_pad($integer, 32, "\0", STR_PAD_LEFT);
    }
    return $raw;
}

/**
 * VAPID "sub" claim: who a push service can contact about this sender. The
 * instance URL when it is a public https one (Apple refuses anything that is
 * neither https nor mailto), an address under its host otherwise.
 */
function webPushVapidSubject(string $appUrl): string
{
    $parts = parse_url(trim($appUrl));
    $host = is_array($parts) ? strtolower((string)($parts['host'] ?? '')) : '';
    if ($host !== '' && strtolower((string)($parts['scheme'] ?? '')) === 'https' && str_contains($host, '.')
        && !filter_var($host, FILTER_VALIDATE_IP)) {
        return 'https://' . $host;
    }
    return 'mailto:poznote@' . ($host !== '' && str_contains($host, '.') && !filter_var($host, FILTER_VALIDATE_IP) ? $host : 'example.com');
}
