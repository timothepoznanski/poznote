<?php
lib('auto-login');

// "Open without login" signs a browser in without asking for anything
// (discussion #1608). Two decisions carry all the risk and are pinned here:
// the account that gets opened is the recorded one and never a guess, and
// only a browser is let in that way, API clients keep their credentials.

$profiles = [
    ['id' => 7, 'username' => 'alice', 'is_admin' => 0],
    ['id' => 5, 'username' => 'zed', 'is_admin' => 1],
    ['id' => 2, 'username' => 'Bob', 'is_admin' => 1],
];

test('the recorded account is the one opened', function () use ($profiles) {
    assertSame('zed', poznoteResolveAutoLoginProfile($profiles, 5)['username']);
    assertSame('alice', poznoteResolveAutoLoginProfile($profiles, 7)['username'], 'whatever its role');
});

test('a recorded account that is gone or deactivated opens nothing', function () use ($profiles) {
    assertSame(null, poznoteResolveAutoLoginProfile($profiles, 99), 'never falls back to an administrator');
    assertSame(null, poznoteResolveAutoLoginProfile([], 5));
});

test('nothing is opened while the option is off', function () use ($profiles) {
    assertSame(null, poznoteResolveAutoLoginProfile($profiles, 0));
    assertSame(null, poznoteResolveAutoLoginProfile($profiles, -1));
});

test('a page and its script calls are signed in', function () {
    assertSame(true, poznoteRequestQualifiesForAutoLogin([
        'HTTP_SEC_FETCH_MODE' => 'navigate',
        'HTTP_SEC_FETCH_DEST' => 'document',
    ], false));
    assertSame(true, poznoteRequestQualifiesForAutoLogin(['HTTP_SEC_FETCH_MODE' => 'cors'], false));
    assertSame(true, poznoteRequestQualifiesForAutoLogin(['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest'], false));
    assertSame(true, poznoteRequestQualifiesForAutoLogin(['HTTP_ACCEPT' => 'text/html'], false), 'browser without Fetch Metadata');
});

test('an API client is not', function () {
    assertSame(false, poznoteRequestQualifiesForAutoLogin([], false));
    assertSame(false, poznoteRequestQualifiesForAutoLogin(['HTTP_ACCEPT' => 'application/json'], false));
});

test('a request with credentials of its own is judged on them', function () {
    assertSame(false, poznoteRequestQualifiesForAutoLogin(['HTTP_SEC_FETCH_MODE' => 'cors'], true));
});
