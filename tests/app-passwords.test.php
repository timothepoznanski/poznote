<?php
lib('app-passwords');

// The secret format is the contract between the generator, the detector that
// routes a Basic-auth password to the right check, and whatever a user pastes
// into a client. These pin it down so a change to one side cannot silently
// leave the other behind.

test('a generated secret has the documented shape and is detected as one', function () {
    $secret = generateAppPasswordSecret();
    assertSame(0, strpos($secret, APP_PASSWORD_PREFIX), 'prefix');
    assertSame(strlen(APP_PASSWORD_PREFIX) + APP_PASSWORD_RANDOM_BYTES * 2, strlen($secret), 'length');
    assertTrue(isAppPasswordSecret($secret), 'detected');
});

test('two generated secrets differ', function () {
    if (generateAppPasswordSecret() === generateAppPasswordSecret()) {
        fail('two calls returned the same secret');
    }
});

test('an account password is never mistaken for an app password', function () {
    foreach (['admin', 'user', 'pzn_', 'pzn_short', 'pzn_' . str_repeat('g', 40),
              'PZN_' . str_repeat('a', 40), ' pzn_' . str_repeat('a', 40),
              'pzn_' . str_repeat('a', 40) . "\n", 'pzn_' . str_repeat('a', 41),
              'pzn_' . str_repeat('A', 40)] as $candidate) {
        assertFalse(isAppPasswordSecret($candidate), var_export($candidate, true));
    }
});

test('the stored hash is deterministic and not the secret', function () {
    $secret = generateAppPasswordSecret();
    $hash = hashAppPasswordSecret($secret);
    assertSame($hash, hashAppPasswordSecret($secret), 'same input, same hash');
    assertSame(64, strlen($hash), 'sha256 hex');
    assertNotContains($secret, $hash, 'secret must not appear in the hash');
});

test('the hint shows the prefix and four digits, never more', function () {
    $secret = 'pzn_' . str_repeat('0123456789abcdef', 2) . '01234567';
    assertSame('pzn_0123', appPasswordHint($secret));
});

test('labels are trimmed, collapsed and capped', function () {
    assertSame(null, normalizeAppPasswordLabel(null), 'null');
    assertSame(null, normalizeAppPasswordLabel('   '), 'blank');
    assertSame('Chrome extension', normalizeAppPasswordLabel("  Chrome \t\n extension  "), 'whitespace');
    $long = normalizeAppPasswordLabel(str_repeat('x', 200));
    assertSame(APP_PASSWORD_LABEL_MAX_LENGTH, strlen($long), 'cap');
});

test('expiry accepts a whole number of days within the cap, or nothing', function () {
    $now = 1_700_000_000;
    assertSame(null, appPasswordExpiryFromDays(null, $now), 'null');
    assertSame(null, appPasswordExpiryFromDays('', $now), 'empty');
    assertSame(null, appPasswordExpiryFromDays(0, $now), 'zero');
    assertSame(gmdate('Y-m-d H:i:s', $now + 30 * 86400), appPasswordExpiryFromDays(30, $now), '30 days');
    assertSame(gmdate('Y-m-d H:i:s', $now + 30 * 86400), appPasswordExpiryFromDays('30', $now), '30 as string');
    foreach ([-1, 1.5, 'soon', APP_PASSWORD_MAX_EXPIRY_DAYS + 1] as $bad) {
        assertSame(false, appPasswordExpiryFromDays($bad, $now), var_export($bad, true));
    }
});

test('expiry is checked against UTC and fails closed on garbage', function () {
    $now = 1_700_000_000;
    assertFalse(isAppPasswordExpired(null, $now), 'no expiry');
    assertFalse(isAppPasswordExpired('', $now), 'empty expiry');
    assertFalse(isAppPasswordExpired(gmdate('Y-m-d H:i:s', $now + 60), $now), 'a minute ahead');
    assertTrue(isAppPasswordExpired(gmdate('Y-m-d H:i:s', $now - 60), $now), 'a minute ago');
    assertTrue(isAppPasswordExpired(gmdate('Y-m-d H:i:s', $now), $now), 'exactly now');
    assertTrue(isAppPasswordExpired('not a date', $now), 'garbage');
});
