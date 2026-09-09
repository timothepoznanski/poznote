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

// The reason the helpers above exist is that a page is easy to forget: a new
// <script src="js/thing.js"> with no ?v= is served `immutable` for a year by
// nginx, so self-hosters keep running last release's JavaScript against this
// release's PHP until they clear the browser cache by hand (issue 1345).
// Nothing about the page looks broken, so scan for it instead of relying on
// remembering.

/** Every source file that can emit an asset URL. */
function assetSourceFiles(array $extensions): array
{
    $root = dirname(__DIR__) . '/src';
    $files = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        $path = $file->getPathname();
        // Vendored bundles are built artefacts, not hand-written markup.
        if (strpos($path, '-dist/') !== false || strpos($path, '/swagger-ui/') !== false) {
            continue;
        }
        if (in_array(strtolower($file->getExtension()), $extensions, true)) {
            $files[] = $path;
        }
    }

    sort($files);
    return $files;
}

test('every href/src to a css, js or webmanifest file is cache-busted', function () {
    $offenders = [];

    foreach (assetSourceFiles(['php', 'html']) as $path) {
        $lines = file($path, FILE_IGNORE_NEW_LINES);
        foreach ($lines as $i => $line) {
            if (!preg_match_all('/(?:href|src)="([^"]*\.(?:css|js|webmanifest)(?:\?[^"]*)?)"/i', $line, $m)) {
                continue;
            }
            foreach ($m[1] as $url) {
                // Either a literal ?v= / &v= in the markup...
                if (preg_match('/[?&]v=/', $url)) {
                    continue;
                }
                // ...or the whole href comes from a helper that appends one.
                if (preg_match('/\bpoznoteAsset\s*\(|AssetHref\s*\(|\$\w*[Aa]sset\s*\(/', $url)) {
                    continue;
                }
                $offenders[] = str_replace(dirname(__DIR__) . '/', '', $path) . ':' . ($i + 1) . ' ' . $url;
            }
        }
    }

    if ($offenders !== []) {
        fail("unversioned asset URLs, they will be served from a stale browser cache:\n  "
            . implode("\n  ", $offenders));
    }
});

test('scripts injected from JavaScript are cache-busted', function () {
    $offenders = [];

    foreach (assetSourceFiles(['js']) as $path) {
        $lines = file($path, FILE_IGNORE_NEW_LINES);
        foreach ($lines as $i => $line) {
            if (!preg_match('/\.(?:src|href)\s*=\s*([\'"])([^\'"]*\.(?:css|js)[^\'"]*)\1/', $line, $m)) {
                continue;
            }
            if (preg_match('/[?&]v=/', $m[2])) {
                continue;
            }
            $offenders[] = str_replace(dirname(__DIR__) . '/', '', $path) . ':' . ($i + 1) . ' ' . $m[2];
        }
    }

    if ($offenders !== []) {
        fail("assets injected from JS without a version, use window.poznoteAssetUrl():\n  "
            . implode("\n  ", $offenders));
    }
});
