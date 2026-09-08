<?php
require_once dirname(__DIR__) . '/src/config.php';

// src/css_assets.php replaced 778 hand-written <link> tags spread over 39
// <head> blocks. The point of moving them into one list is that the list can
// now be checked, so these are the checks the old copy-paste could not have.

$docroot = dirname(__DIR__) . '/src/public/';

test('every stylesheet in the manifest exists on disk', function () use ($docroot) {
    $missing = [];
    foreach (array_keys(poznoteCssManifest()) as $page) {
        foreach (poznoteCssResolve($page) as $file) {
            if (!is_file($docroot . $file)) {
                $missing[] = "$page -> $file";
            }
        }
    }
    assertSame([], $missing, 'stylesheets linked but not present');
});

test('every group referenced by a page is defined', function () {
    $groups = poznoteCssGroups();
    $unknown = [];
    foreach (poznoteCssManifest() as $page => $items) {
        foreach ($items as $item) {
            if (str_starts_with($item, '@') && !isset($groups[$item])) {
                $unknown[] = "$page -> $item";
            }
        }
    }
    assertSame([], $unknown, 'undefined group names');
});

test('no page links the same stylesheet twice', function () {
    // Six pages linked lucide.css twice and settings.php also linked
    // dark-mode/variables.css twice. poznoteCssResolve() drops the repeat, but
    // a duplicate in the manifest is still a mistake worth catching.
    $dupes = [];
    foreach (poznoteCssManifest() as $page => $items) {
        $seen = [];
        foreach ($items as $item) {
            if (in_array($item, $seen, true)) {
                $dupes[] = "$page -> $item";
            }
            $seen[] = $item;
        }
    }
    assertSame([], $dupes, 'stylesheet listed twice for one page');
});

test('every page loads the whole dark layer, not a slice of it', function () {
    // 19 of the 39 pages used to carry only part of it, which is how
    // markdown_syntax.php ended up rendering the icon sidebar with no dark
    // styling at all: it linked two of the ten files. A page either themes
    // itself or it does not; there is no reason to pick a subset.
    $partial = [];
    $full = poznoteCssGroups()['@theme'];
    foreach (array_keys(poznoteCssManifest()) as $page) {
        $dark = array_values(array_filter(
            poznoteCssResolve($page),
            fn($f) => str_starts_with($f, 'css/dark-mode/')
        ));
        if ($dark !== $full) {
            $partial[] = $page . ' (' . count($dark) . '/' . count($full) . ')';
        }
    }
    assertSame([], $partial, 'pages carrying an incomplete dark layer');
});

test('a page using the dark layer declares the theme tokens first', function () {
    // dark-mode/*.css consume --dm-* from dark-mode/variables.css. Loading any
    // of them without it, or after it, leaves the dark theme unstyled.
    $wrong = [];
    foreach (array_keys(poznoteCssManifest()) as $page) {
        $dark = array_values(array_filter(
            poznoteCssResolve($page),
            fn($f) => str_starts_with($f, 'css/dark-mode/')
        ));
        if (!$dark) {
            continue;
        }
        if ($dark[0] !== 'css/dark-mode/variables.css') {
            $wrong[] = "$page (first is {$dark[0]})";
        }
    }
    assertSame([], $wrong, 'dark layer loaded before its tokens');
});

test('every page key matches an entry point that renders it', function () use ($docroot) {
    $wrong = [];
    foreach (array_keys(poznoteCssManifest()) as $page) {
        $file = $docroot . $page . '.php';
        if (!is_file($file)) {
            $wrong[] = "$page (no such entry point)";
            continue;
        }
        if (!str_contains(file_get_contents($file), "poznoteRenderStylesheets('$page'")) {
            $wrong[] = "$page (entry point does not render its own key)";
        }
    }
    assertSame([], $wrong, 'manifest keys without a matching page');
});

test('rendered links are versioned and honour the subdirectory prefix', function () {
    ob_start();
    poznoteRenderStylesheets('admin/users', ['prefix' => '../']);
    $html = ob_get_clean();
    assertContains('<link rel="stylesheet" href="../css/lucide.css?v=', $html);
    if (!preg_match('/\?v=[^"&]*-\d{9,}"/', $html)) {
        fail('expected app-version + mtime cache busting, got: ' . substr($html, 0, 200));
    }
});

test('an unknown page key resolves to nothing rather than half a page', function () {
    assertSame([], poznoteCssResolve('does-not-exist'));
});

// A page that styles .btn without loading components/buttons.css gets the
// browser's default button: index.php shipped ten of them across seven
// dialogs, grey with black text, because its bundle deliberately left the
// base out on the belief that the page had no .btn element. It has eight,
// plus 66 bare modifiers, all from the shared dialogs in src/modals.php.
test('every page that styles a button also loads the button base', function () use ($docroot) {
    $stylesButton = function (array $files) use ($docroot): array {
        $hits = [];
        foreach ($files as $file) {
            $css = @file_get_contents($docroot . $file);
            if ($css !== false && preg_match('/(^|[\s,{}])\.btn(-[a-z]+)?[\s,:.\[{]/m', $css)) {
                $hits[] = $file;
            }
        }
        return $hits;
    };
    $wrong = [];
    foreach (array_keys(poznoteCssManifest()) as $page) {
        $files = poznoteCssResolve($page);
        if (in_array('css/components/buttons.css', $files, true)) {
            continue;
        }
        foreach ($stylesButton($files) as $file) {
            $wrong[] = "$page -> $file";
        }
    }
    // index.php is not in the manifest; its bundles are listed in index_css.php.
    // Read that file rather than requiring it: it is an endpoint and would
    // print a concatenated stylesheet into the test output.
    $source = (string) file_get_contents(dirname(__DIR__) . '/src/public/index_css.php');
    preg_match_all("/'(css\/[^']+\.css)'/", $source, $m);
    $flat = $m[1];
    assertTrue($flat !== [], 'index_css.php lists no stylesheet');
    if (!in_array('css/components/buttons.css', $flat, true)) {
        foreach ($stylesButton($flat) as $file) {
            $wrong[] = "index.php -> $file";
        }
    }
    assertSame([], $wrong, 'button rules loaded without components/buttons.css');
});
