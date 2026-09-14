<?php
lib('request-kind');

// The Basic challenge on a 401 is what makes the browser open its native
// username/password dialog over the app (issue #1389). Withholding it is only
// safe if the app's own calls are told apart from real API clients reliably,
// and only useful if navigations are sent to the login page instead. These
// cases pin the header combinations each kind of caller actually sends.

test('a fetch or XHR from a page is a script call', function () {
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'cors',
        'HTTP_SEC_FETCH_DEST' => 'empty',
    ]), 'fetch() default mode');
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'same-origin',
        'HTTP_SEC_FETCH_DEST' => 'empty',
    ]), 'fetch() with mode same-origin');
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'no-cors',
        'HTTP_SEC_FETCH_DEST' => 'image',
    ]), 'an <img> subresource');
});

test('the live-refresh poller is recognised even without Fetch Metadata', function () {
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest',
        'HTTP_ACCEPT' => '*/*',
    ]));
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_X_REQUESTED_WITH' => 'xmlhttprequest',
    ]), 'marker compared case-insensitively');
});

test('a top-level navigation is a document request', function () {
    assertSame(POZNOTE_REQUEST_DOCUMENT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'navigate',
        'HTTP_SEC_FETCH_DEST' => 'document',
        'HTTP_ACCEPT' => 'text/html,application/xhtml+xml,*/*;q=0.8',
    ]));
    assertSame(POZNOTE_REQUEST_DOCUMENT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'navigate',
    ]), 'a navigate without a dest is still a navigation');
    assertSame(POZNOTE_REQUEST_DOCUMENT, poznoteClassifyRequest([
        'HTTP_ACCEPT' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ]), 'an old browser is known by the HTML it asks for');
});

test('a navigation inside a frame is kept apart from the page itself', function () {
    assertSame(POZNOTE_REQUEST_FRAME, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'navigate',
        'HTTP_SEC_FETCH_DEST' => 'iframe',
    ]));
    assertSame(POZNOTE_REQUEST_FRAME, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'navigate',
        'HTTP_SEC_FETCH_DEST' => 'embed',
    ]));
});

test('an API client sends none of the browser signals and keeps its challenge', function () {
    assertSame(POZNOTE_REQUEST_CLIENT, poznoteClassifyRequest([]), 'nothing at all');
    assertSame(POZNOTE_REQUEST_CLIENT, poznoteClassifyRequest([
        'HTTP_ACCEPT' => '*/*',
        'HTTP_USER_AGENT' => 'curl/8.5.0',
    ]), 'curl');
    assertSame(POZNOTE_REQUEST_CLIENT, poznoteClassifyRequest([
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_AUTHORIZATION' => '',
    ]), 'a JSON client');
    assertSame(false, poznoteRequestIsFromBrowser(['HTTP_ACCEPT' => '*/*']));
    assertSame(true, poznoteRequestIsFromBrowser(['HTTP_SEC_FETCH_MODE' => 'cors']));
});

test('header values are trimmed and matched case-insensitively', function () {
    assertSame(POZNOTE_REQUEST_DOCUMENT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => ' Navigate ',
        'HTTP_SEC_FETCH_DEST' => 'Document',
    ]));
    assertSame(POZNOTE_REQUEST_SCRIPT, poznoteClassifyRequest([
        'HTTP_SEC_FETCH_MODE' => 'CORS',
    ]));
});
