<?php
require_once dirname(__DIR__) . '/src/config.php';
require_once dirname(__DIR__) . '/src/public_helpers.php';

// Three separate cache-busting helpers all resolved asset paths against their
// own directory. When the entry points moved into src/public/ they kept looking
// one level too high, found nothing, and silently degraded: the theme version
// became '', poznoteAsset() dropped the per-file part, and the public pages
// served their assets with no ?v= at all. Every page still answered 200.

test('the theme asset version is a real timestamp, not empty', function () {
    $v = poznoteGetThemeAssetVersion();
    if (!preg_match('/^\d{9,}$/', $v)) {
        fail("expected a unix timestamp, got " . var_export($v, true)
            . ' — the probed theme files are probably not being found');
    }
});

test('poznoteAsset carries both the app version and the file mtime', function () {
    $href = poznoteAsset('css/base.css');
    assertContains('css/base.css?v=', $href);
    if (!preg_match('/\?v=[^&]*-\d{9,}/', $href)) {
        fail("expected an app-version + mtime pair, got {$href}");
    }
});

test('a public page asset is versioned', function () {
    $href = getVersionedPublicAppAssetHref('js/public-note.js');
    if (!preg_match('/\?v=\d{9,}$/', $href)) {
        fail("expected a versioned href, got {$href}");
    }
});

test('an asset that does not exist still yields a usable href', function () {
    assertContains('css/does-not-exist.css', poznoteAsset('css/does-not-exist.css'));
});
