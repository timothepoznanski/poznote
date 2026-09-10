<?php
require_once dirname(__DIR__) . '/src/theme_catalog.php';

// The theme list is a global setting an admin edits from the Custom CSS modal,
// so what lands in it is whatever the browser sent. Normalising is the only
// thing standing between that and a button cycling onto a theme that does not
// exist, which is why it is checked here rather than trusted.

// Named for the global scope the runner requires this file in: a plain $files
// would clobber the list of test files run.php is iterating.
$themeTestCssFiles = ['catppuccin.css', 'disco.css'];

test('an untouched instance offers the six built-in themes', function () {
    assertSame(
        ['light', 'dark', 'black', 'lavender', 'sepia', 'terminal'],
        array_column(poznoteDefaultThemeList(), 'id')
    );
});

test('the list keeps the order it was given', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList(
        [['id' => 'dark'], ['id' => 'custom:disco.css'], ['id' => 'light']],
        $themeTestCssFiles
    );
    assertSame(['dark', 'custom:disco.css', 'light'], array_column($entries, 'id'));
});

test('a theme that does not exist is dropped', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList(
        [['id' => 'light'], ['id' => 'nope'], ['id' => 'custom:missing.css'], ['id' => 'custom:../../etc/passwd']],
        $themeTestCssFiles
    );
    assertSame(['light'], array_column($entries, 'id'));
});

test('the same theme twice is kept once', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList(
        [['id' => 'light'], ['id' => 'light'], ['id' => 'custom:disco.css'], ['id' => 'custom:disco.css']],
        $themeTestCssFiles
    );
    assertSame(['light', 'custom:disco.css'], array_column($entries, 'id'));
});

test('a custom theme carries the base mode, defaulting to light', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList(
        [['id' => 'custom:disco.css', 'mode' => 'dark'], ['id' => 'custom:catppuccin.css', 'mode' => 'nonsense']],
        $themeTestCssFiles
    );
    assertSame('dark', $entries[0]['mode']);
    assertSame('light', $entries[1]['mode']);
});

test('a built-in theme carries no mode of its own', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList([['id' => 'dark', 'mode' => 'light']], $themeTestCssFiles);
    assertSame(['id' => 'dark'], $entries[0]);
});

test('the setting can be written by hand as a list of ids', function () use ($themeTestCssFiles) {
    $entries = poznoteNormalizeThemeList('["light","custom:disco.css"]', $themeTestCssFiles);
    assertSame(['light', 'custom:disco.css'], array_column($entries, 'id'));
    assertSame('light', $entries[1]['mode']);
});

test('anything that is not a list means not configured', function () use ($themeTestCssFiles) {
    assertSame([], poznoteNormalizeThemeList('', $themeTestCssFiles));
    assertSame([], poznoteNormalizeThemeList('not json', $themeTestCssFiles));
    assertSame([], poznoteNormalizeThemeList(null, $themeTestCssFiles));
    assertSame([], poznoteNormalizeThemeList([['id' => 'gone']], $themeTestCssFiles));
});

test('a stylesheet id round-trips through the custom: prefix', function () {
    assertSame('custom:disco.css', poznoteCustomThemeId('disco.css'));
    assertSame('disco.css', poznoteCustomThemeFile('custom:disco.css'));
    assertSame('', poznoteCustomThemeFile('dark'), 'a built-in id names no file');
    assertSame('', poznoteCustomThemeFile('custom:../secret.css'), 'a path is not a file name');
});
