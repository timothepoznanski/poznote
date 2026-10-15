<?php
lib('statistics');

// GET /api/v1/public/statistics (discussion #1638): the token format, where
// a dashboard may put it, and the warnings derived from a summary.

test('a generated statistics token has the documented shape and is detected as one', function () {
    $token = generateStatisticsToken();
    assertSame(0, strpos($token, STATISTICS_TOKEN_PREFIX), 'prefix');
    assertSame(strlen(STATISTICS_TOKEN_PREFIX) + STATISTICS_TOKEN_RANDOM_BYTES * 2, strlen($token), 'length');
    assertTrue(isStatisticsToken($token), 'detected');
});

test('an app password or a malformed value is not a statistics token', function () {
    foreach (['', 'pzs_', 'pzn_' . str_repeat('a', 40), 'pzs_' . str_repeat('g', 40),
              'pzs_' . str_repeat('a', 40) . "\n", 'PZS_' . str_repeat('a', 40),
              'pzs_' . str_repeat('a', 41)] as $candidate) {
        assertFalse(isStatisticsToken($candidate), var_export($candidate, true));
    }
});

test('the stored hash is not the token and the hint stops after four digits', function () {
    $token = 'pzs_' . str_repeat('0123456789abcdef', 2) . '01234567';
    $hash = hashStatisticsToken($token);
    assertSame(64, strlen($hash), 'sha256 hex');
    assertNotContains($token, $hash, 'token must not appear in the hash');
    assertSame('pzs_0123', statisticsTokenHint($token));
});

test('the token is read from Bearer, then X-Poznote-Token, then ?token=', function () {
    assertSame('abc', statisticsTokenFromRequest(['HTTP_AUTHORIZATION' => 'Bearer abc'], ['token' => 'q']));
    assertSame('abc', statisticsTokenFromRequest(['HTTP_AUTHORIZATION' => 'bearer   abc '], []));
    assertSame('hdr', statisticsTokenFromRequest(['HTTP_AUTHORIZATION' => 'Basic dXNlcjpwYXNz', 'HTTP_X_POZNOTE_TOKEN' => 'hdr'], ['token' => 'q']));
    assertSame('q', statisticsTokenFromRequest([], ['token' => 'q']));
    assertSame(null, statisticsTokenFromRequest([], ['token' => ['array']]));
    assertSame(null, statisticsTokenFromRequest([], []));
});

test('an update is offered for a newer stable release only', function () {
    assertSame(true, statisticsIsNewerRelease('6.117.0', '6.117.1'));
    assertSame(false, statisticsIsNewerRelease('6.117.1', '6.117.1'));
    // A beta of the next version is above the latest stable one
    assertSame(false, statisticsIsNewerRelease('6.119.2-beta', '6.117.1'));
    assertSame(false, statisticsIsNewerRelease('6.119.2', 'v6.117.1'));
    assertSame(null, statisticsIsNewerRelease('6.117.0', '6.118.0-beta'));
    assertSame(null, statisticsIsNewerRelease('6.117.0', null));
    assertSame(null, statisticsIsNewerRelease('X.X.X', '6.117.1'));
});

test('warnings name failed backups, Git sync errors and updates', function () {
    $stats = [
        'update_available' => true,
        'backups' => [
            'local' => ['enabled' => true, 'last_run_success' => false],
            's3' => ['enabled' => false, 'last_run_success' => false],
        ],
        'git_sync' => ['enabled' => true, 'last_sync_errors' => 2],
    ];
    assertSame(['local_backup_failed', 'git_sync_errors', 'update_available'], statisticsWarnings($stats));
    assertSame([], statisticsWarnings(['update_available' => null, 'backups' => [], 'git_sync' => ['enabled' => false, 'last_sync_errors' => 3]]));
});

test('dates come out as UTC ISO 8601', function () {
    assertSame('2026-10-09T05:58:32Z', statisticsIsoDate('2026-10-09 05:58:32'));
    assertSame('2026-10-09T05:58:32Z', statisticsIsoDate(1791525512));
    assertSame('2026-10-09T03:58:32Z', statisticsIsoDate('2026-10-09T05:58:32+02:00'));
    assertSame(null, statisticsIsoDate(''));
    assertSame(null, statisticsIsoDate(0));
    assertSame(null, statisticsIsoDate(null));
});
