<?php
lib('web-push');

// A push message that is encrypted slightly wrong is not refused by anyone:
// the push service accepts it, the browser fails to decrypt it and shows
// nothing. The RFC 8291 example pins the whole derivation down.

// RFC 8291 section 5 and appendix A
const WEB_PUSH_RFC_PLAINTEXT = 'When I grow up, I want to be a watermelon';
const WEB_PUSH_RFC_SENDER_PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const WEB_PUSH_RFC_SENDER_PUBLIC = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const WEB_PUSH_RFC_RECEIVER_PRIVATE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const WEB_PUSH_RFC_RECEIVER_PUBLIC = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const WEB_PUSH_RFC_AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const WEB_PUSH_RFC_SALT = 'DGv6ra1nlYgDCS1FRnbzlw';
const WEB_PUSH_RFC_BODY = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

/** What a browser does with a received body, to check a message end to end. */
function webPushTestDecrypt(string $body, string $receiverPrivatePem, string $receiverPoint, string $authSecret): ?string
{
    $salt = substr($body, 0, 16);
    $keyLength = ord($body[20]);
    $senderPoint = substr($body, 21, $keyLength);
    $ciphertext = substr($body, 21 + $keyLength, -16);
    $tag = substr($body, -16);

    $secret = openssl_pkey_derive(
        openssl_pkey_get_public(webPushPublicKeyPem($senderPoint)),
        openssl_pkey_get_private($receiverPrivatePem),
        32
    );
    $ikm = hash_hkdf('sha256', $secret, 32, "WebPush: info\0" . $receiverPoint . $senderPoint, $authSecret);
    $key = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $plain = openssl_decrypt($ciphertext, 'aes-128-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
    return $plain === false ? null : rtrim($plain, "\0");
}

test('encryption matches the RFC 8291 example', function () {
    $senderPublic = webPushBase64UrlDecode(WEB_PUSH_RFC_SENDER_PUBLIC);
    $senderKey = [
        'private_pem' => webPushPrivateKeyPem(webPushBase64UrlDecode(WEB_PUSH_RFC_SENDER_PRIVATE), $senderPublic),
        'public' => $senderPublic,
    ];
    $body = webPushEncrypt(
        WEB_PUSH_RFC_PLAINTEXT,
        WEB_PUSH_RFC_RECEIVER_PUBLIC,
        WEB_PUSH_RFC_AUTH,
        $senderKey,
        webPushBase64UrlDecode(WEB_PUSH_RFC_SALT)
    );
    assertSame(WEB_PUSH_RFC_BODY, webPushBase64UrlEncode((string)$body));
});

test('a message with a fresh key and salt decrypts on the receiving side', function () {
    $receiver = webPushGenerateKeyPair();
    $auth = random_bytes(16);
    $payload = json_encode(['title' => 'Appeler le dentiste', 'body' => 'Tâches', 'id' => 42]);

    $first = webPushEncrypt($payload, webPushBase64UrlEncode($receiver['public']), webPushBase64UrlEncode($auth));
    $second = webPushEncrypt($payload, webPushBase64UrlEncode($receiver['public']), webPushBase64UrlEncode($auth));

    assertSame($payload . "\x02", webPushTestDecrypt($first, $receiver['private_pem'], $receiver['public'], $auth));
    assertTrue($first !== $second, 'two messages never share a salt or a key');
    assertSame(pack('N', 4096), substr($first, 16, 4), 'record size');
});

test('malformed subscription keys and oversized payloads are refused', function () {
    $receiver = webPushGenerateKeyPair();
    $point = webPushBase64UrlEncode($receiver['public']);
    $auth = webPushBase64UrlEncode(random_bytes(16));

    assertTrue(webPushValidSubscriptionKeys($point, $auth));
    assertFalse(webPushValidSubscriptionKeys($point, webPushBase64UrlEncode(random_bytes(8))), 'short auth');
    assertFalse(webPushValidSubscriptionKeys(webPushBase64UrlEncode(random_bytes(65)), $auth), 'not a point');
    assertFalse(webPushValidSubscriptionKeys('not base64 !', $auth));
    assertSame(null, webPushEncrypt('x', 'AAAA', $auth));
    assertSame(null, webPushEncrypt(str_repeat('x', WEB_PUSH_MAX_PAYLOAD + 1), $point, $auth));
    assertTrue(is_string(webPushEncrypt(str_repeat('x', WEB_PUSH_MAX_PAYLOAD), $point, $auth)), 'largest payload');
});

test('the VAPID header carries a JWT the instance key verifies', function () {
    $key = webPushGenerateKeyPair();
    $header = webPushVapidAuthorization(
        'https://fcm.googleapis.com/fcm/send/abc',
        $key['private_pem'],
        'https://notes.example.org',
        1700000000
    );

    assertTrue(preg_match('/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/', (string)$header, $m) === 1, 'header shape');
    assertSame($key['public'], webPushBase64UrlDecode($m[4]), 'k is the public point');
    assertSame(['typ' => 'JWT', 'alg' => 'ES256'], json_decode(webPushBase64UrlDecode($m[1]), true));
    assertSame(
        ['aud' => 'https://fcm.googleapis.com', 'exp' => 1700000000 + 43200, 'sub' => 'https://notes.example.org'],
        json_decode(webPushBase64UrlDecode($m[2]), true)
    );

    // Back to the DER form openssl verifies
    $raw = webPushBase64UrlDecode($m[3]);
    assertSame(64, strlen($raw), 'raw signature');
    $integer = function (string $bytes): string {
        $bytes = ltrim($bytes, "\0");
        if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
            $bytes = "\0" . $bytes;
        }
        return "\x02" . chr(strlen($bytes)) . $bytes;
    };
    $sequence = $integer(substr($raw, 0, 32)) . $integer(substr($raw, 32));
    $der = "\x30" . chr(strlen($sequence)) . $sequence;
    assertSame(1, openssl_verify($m[1] . '.' . $m[2], $der, webPushPublicKeyPem($key['public']), OPENSSL_ALGO_SHA256));
});

test('only the push services of the browsers are accepted as endpoints', function () {
    assertTrue(webPushIsAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc:def'));
    assertTrue(webPushIsAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
    assertTrue(webPushIsAllowedEndpoint('https://web.push.apple.com/abc'));
    assertTrue(webPushIsAllowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'));

    assertFalse(webPushIsAllowedEndpoint('http://fcm.googleapis.com/fcm/send/abc'), 'plain http');
    assertFalse(webPushIsAllowedEndpoint('https://fcm.googleapis.com.evil.test/abc'), 'suffix of another host');
    assertFalse(webPushIsAllowedEndpoint('https://evil.test/?fcm.googleapis.com'));
    assertFalse(webPushIsAllowedEndpoint('https://127.0.0.1/abc'));
    assertFalse(webPushIsAllowedEndpoint('https://user@fcm.googleapis.com/abc'), 'credentials');
    assertFalse(webPushIsAllowedEndpoint('https://fcm.googleapis.com:8443/abc'), 'other port');
    assertFalse(webPushIsAllowedEndpoint('https://storage.googleapis.com/abc'), 'another Google host');
    assertFalse(webPushIsAllowedEndpoint('file:///etc/passwd'));
});

test('the VAPID subject is always something a push service accepts', function () {
    assertSame('https://notes.example.org', webPushVapidSubject('https://notes.example.org/poznote/'));
    assertSame('mailto:poznote@notes.example.org', webPushVapidSubject('http://notes.example.org'));
    assertSame('mailto:poznote@example.com', webPushVapidSubject('https://192.168.1.10'));
    assertSame('mailto:poznote@example.com', webPushVapidSubject('http://localhost:8040'));
    assertSame('mailto:poznote@example.com', webPushVapidSubject(''));
});
