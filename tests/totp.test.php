<?php
lib('totp');

// The code computation has to agree with every authenticator app, and nothing
// in the app would notice if it stopped doing so: a wrong digit only shows up
// as users locked out of their account. The RFC vectors pin it down.

// RFC 6238 appendix B, SHA-1 rows. The RFC lists 8-digit codes; the last six
// digits are what a 6-digit token shows for the same step.
const TOTP_RFC_SECRET_ASCII = '12345678901234567890';

test('codes match the RFC 6238 test vectors', function () {
    $secret = totpBase32Encode(TOTP_RFC_SECRET_ASCII);
    $vectors = [
        59 => '287082',
        1111111109 => '081804',
        1111111111 => '050471',
        1234567890 => '005924',
        2000000000 => '279037',
        20000000000 => '353130',
    ];
    foreach ($vectors as $timestamp => $expected) {
        assertSame($expected, totpCodeForStep($secret, totpStepAt($timestamp)), "t=$timestamp");
    }
});

test('base32 matches the RFC 4648 vectors and round-trips', function () {
    assertSame('MZXW6YTBOI', totpBase32Encode('foobar'));
    assertSame('MY', totpBase32Encode('f'));
    assertSame('foobar', totpBase32Decode('MZXW6YTBOI'));
    assertSame('foobar', totpBase32Decode('mzxw 6ytb-oi======'), 'typed by hand');
    $bytes = random_bytes(TOTP_SECRET_BYTES);
    assertSame($bytes, totpBase32Decode(totpBase32Encode($bytes)), 'round trip');
});

test('an invalid base32 secret is refused, not truncated', function () {
    assertSame(null, totpBase32Decode(''));
    assertSame(null, totpBase32Decode('ABC1DEF'), '1 is not in the alphabet');
    assertSame(null, totpCodeForStep('not base32 !', 1));
});

test('a generated secret is 160 bits of base32 and differs each time', function () {
    $secret = totpGenerateSecret();
    assertSame(32, strlen($secret), 'length');
    assertSame(TOTP_SECRET_BYTES, strlen((string)totpBase32Decode($secret)), 'decoded size');
    if ($secret === totpGenerateSecret()) {
        fail('two calls returned the same secret');
    }
});

test('a code is accepted one step either side and no further', function () {
    $secret = totpBase32Encode(TOTP_RFC_SECRET_ASCII);
    $now = 1111111111;
    $step = totpStepAt($now);
    foreach ([-1, 0, 1] as $offset) {
        $code = totpCodeForStep($secret, $step + $offset);
        assertSame($step + $offset, totpVerifyCode($secret, $code, $now), "offset $offset");
    }
    foreach ([-2, 2] as $offset) {
        $code = totpCodeForStep($secret, $step + $offset);
        assertSame(null, totpVerifyCode($secret, $code, $now), "offset $offset");
    }
});

test('a code already used is refused, a later one still passes', function () {
    $secret = totpBase32Encode(TOTP_RFC_SECRET_ASCII);
    $now = 1234567890;
    $step = totpStepAt($now);
    $code = totpCodeForStep($secret, $step);
    assertSame($step, totpVerifyCode($secret, $code, $now, $step - 1), 'first use');
    assertSame(null, totpVerifyCode($secret, $code, $now, $step), 'replay');
    $next = totpCodeForStep($secret, $step + 1);
    assertSame($step + 1, totpVerifyCode($secret, $next, $now, $step), 'next step');
});

test('a code is read the way authenticator apps display it', function () {
    assertSame('123456', totpNormalizeCode(' 123 456 '));
    assertSame('012345', totpNormalizeCode('012-345'), 'leading zero kept');
    foreach (['', '12345', '1234567', '12345a', '١٢٣٤٥٦', "123456\n7"] as $input) {
        assertSame(null, totpNormalizeCode($input), var_export($input, true));
    }
});

test('the provisioning URI carries the issuer twice and escapes its parts', function () {
    $uri = totpProvisioningUri('JBSWY3DPEHPK3PXP', 'tim@example.com', 'My: Notes');
    assertSame(0, strpos($uri, 'otpauth://totp/My%20%20Notes:tim%40example.com?'), $uri);
    assertContains('secret=JBSWY3DPEHPK3PXP', $uri);
    assertContains('issuer=My%20%20Notes', $uri);
    assertContains('digits=6', $uri);
    assertContains('period=30', $uri);
    assertContains('otpauth://totp/Poznote:bob?', totpProvisioningUri('JBSWY3DPEHPK3PXP', 'bob', ' '), 'default issuer');
});

test('recovery codes are distinct, well formed and survive sloppy typing', function () {
    $codes = totpGenerateRecoveryCodes();
    assertSame(TOTP_RECOVERY_CODE_COUNT, count($codes), 'count');
    assertSame(TOTP_RECOVERY_CODE_COUNT, count(array_unique($codes)), 'distinct');
    foreach ($codes as $code) {
        assertSame(1, preg_match('/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/', $code), $code);
        $hash = totpHashRecoveryCode($code);
        assertSame(64, strlen((string)$hash), 'sha256 hex');
        assertSame($hash, totpHashRecoveryCode(' ' . strtolower(str_replace('-', ' ', $code)) . ' '), 'typed loosely');
        assertNotContains(str_replace('-', '', $code), (string)$hash, 'code must not appear in the hash');
    }
});

test('a totp code or junk is never taken for a recovery code', function () {
    foreach (['', '123456', 'ABCDE-FGHI', 'ABCDE-FGHIJK', 'ABCDE-FGH0J', 'ABCDE-FGH1J', 'ABCDE-FGHLJ'] as $input) {
        assertSame(null, totpNormalizeRecoveryCode($input), var_export($input, true));
        assertSame(null, totpHashRecoveryCode($input), var_export($input, true));
    }
});
