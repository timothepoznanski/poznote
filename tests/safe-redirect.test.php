<?php
lib('safe-redirect');

// The "come back here after login" target is crafted by whoever writes the
// link, and the browser then navigates to it. GHSA-97jp-22c4-24px showed that
// matching "scheme://" and a leading "//" misses what the browser's URL parser
// accepts, so these cases pin the parser's behaviour, not a list of payloads:
// every refused string below resolves to another origin or to a script in a
// real browser, every accepted one to a page of this app.

test('the addresses the app itself produces are kept as they are', function () {
    foreach ([
        'index.php',
        'index.php?note=12',
        'index.php?workspace=Personal&note=12#heading',
        '/index.php?note=12',
        '/sub/dir/index.php?workspace=My%20Notes',
        '/my-shared-note',
        '/workspace/Personal',
        'diary.php?date=2026-09-21',
        'login.php?select_account=1',
        '?note=12',
        '#top',
    ] as $target) {
        assertSame($target, poznoteSanitizeLocalRedirect($target), $target);
    }
});

test('a colon, a backslash or "//" past the path start is only a character', function () {
    foreach ([
        'index.php?search=a:b',
        'index.php?url=https://example.com/x',
        'index.php?search=a\\b',
        'index.php?next=//example.com',
        'index.php#a:b',
        '/folder/a:b',
        '/a//b',
        '/@example.com',
    ] as $target) {
        assertSame($target, poznoteSanitizeLocalRedirect($target), $target);
    }
});

test('surrounding whitespace is trimmed, not refused', function () {
    assertSame('index.php?note=1', poznoteSanitizeLocalRedirect("  index.php?note=1 \n"));
});

test('an absolute URL is refused', function () {
    foreach ([
        'https://evil.example/',
        'http://evil.example',
        'HTTPS://EVIL.EXAMPLE',
        'ftp://evil.example',
        'x-custom+scheme.1://evil.example',
    ] as $target) {
        assertSame(null, poznoteSanitizeLocalRedirect($target), $target);
    }
});

test('a scheme needs no slashes to be one', function () {
    foreach ([
        'javascript:alert(document.cookie)',
        'JavaScript:alert(1)',
        'javascript://%0aalert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'blob:https://evil.example/uuid',
        'https:evil.example',
        'http:evil.example',
        'mailto:someone@evil.example',
    ] as $target) {
        assertSame(null, poznoteSanitizeLocalRedirect($target), $target);
    }
});

test('a network-path reference is refused however its slashes are written', function () {
    foreach ([
        '//evil.example',
        '//evil.example/index.php',
        '/\\evil.example',
        '\\/evil.example',
        '\\\\evil.example',
        '\\/\\/evil.example',
        '///evil.example',
        '/\\/evil.example',
    ] as $target) {
        assertSame(null, poznoteSanitizeLocalRedirect($target), $target);
    }
});

test('control characters the browser deletes cannot hide a scheme or a host', function () {
    foreach ([
        "/\t/evil.example",
        "/\n/evil.example",
        "/\r/evil.example",
        "java\tscript:alert(1)",
        "java\nscript:alert(1)",
        "j\ra\tv\nascript:alert(1)",
        "\x01javascript:alert(1)",
        "index\x00.php",
        "index.php?a=\x7F",
        "index.php\r\nSet-Cookie: x=1",
    ] as $target) {
        assertSame(null, poznoteSanitizeLocalRedirect($target), json_encode($target));
    }
});

test('a backslash anywhere in the path is refused', function () {
    assertSame(null, poznoteSanitizeLocalRedirect('index.php\\..\\x'));
    assertSame(null, poznoteSanitizeLocalRedirect('/a\\b?x=1'));
});

test('what is not a usable string is refused', function () {
    assertSame(null, poznoteSanitizeLocalRedirect(null));
    assertSame(null, poznoteSanitizeLocalRedirect(''));
    assertSame(null, poznoteSanitizeLocalRedirect("  \t "));
    assertSame(null, poznoteSanitizeLocalRedirect(['index.php']));
    assertSame(null, poznoteSanitizeLocalRedirect(12));
    assertSame(null, poznoteSanitizeLocalRedirect('/' . str_repeat('a', POZNOTE_REDIRECT_MAX_LENGTH)));
    assertSame('/' . str_repeat('a', POZNOTE_REDIRECT_MAX_LENGTH - 1),
        poznoteSanitizeLocalRedirect('/' . str_repeat('a', POZNOTE_REDIRECT_MAX_LENGTH - 1)),
        'the limit itself is allowed');
});

test('a double-encoded payload stays an inert path segment', function () {
    // PHP decodes the parameter once. What is still encoded after that is not
    // decoded by the browser either: it stays one segment of this origin.
    assertSame('%2F%5Cevil.example', poznoteSanitizeLocalRedirect('%2F%5Cevil.example'));
});
