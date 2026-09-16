<?php
lib('ui-customization');

// The toolbar keys land verbatim in a <style> block (a class selector and a
// data-action attribute), so the normalizer is what keeps a hand-edited
// setting from injecting CSS.

test('toolbar colours keep well-formed keys and #rrggbb colours only', function () {
    $colors = poznoteNormalizeToolbarIconColors([
        'btn-bold' => '#EF4444',
        'menu-archive-note' => '#22c55e',
        'btn-x"] { display:none } [a="' => '#111827',
        'btn-trash' => 'red',
        'BTN-UPPER' => '#3b82f6',
        'btn-bad-color' => '#12345',
    ]);
    assertSame(['btn-bold' => '#ef4444', 'menu-archive-note' => '#22c55e'], $colors);
});

test('rail colours accept the camelCase button ids', function () {
    $colors = poznoteNormalizeIconSidebarColors(['iconSidebarNotesBtn' => '#6366F1', '1bad' => '#6366f1']);
    assertSame(['iconSidebarNotesBtn' => '#6366f1'], $colors);
});

test('a non-array value normalizes to no colours', function () {
    assertSame([], poznoteNormalizeToolbarIconColors(null));
    assertSame([], poznoteNormalizeIconSidebarColors('#ef4444'));
});

test('a button key paints the button and its menu mirror, never over a state colour', function () {
    $css = poznoteBuildToolbarIconColorRules(['btn-duplicate' => '#ef4444']);
    assertContains('.note-edit-toolbar .toolbar-btn.btn-duplicate:not(.is-favorite)', $css);
    assertContains(':not(.has-reminder):not(.is-saving):not(.is-format-active):not(.is-edit-mode) i', $css);
    assertContains('.dropdown-item[data-selector=".btn-duplicate"]', $css);
    assertContains('background-color: #ef4444;', $css);
});

test('a menu key paints the entries with that action only', function () {
    $css = poznoteBuildToolbarIconColorRules(['menu-print-note' => '#22c55e']);
    assertSame('.note-edit-toolbar .dropdown-item[data-action="print-note"]:not([data-selector]):not(.has-attachments) i { color: #22c55e; background-color: #22c55e; }', $css);
});

// js/toolbar-icon-colors.js carries its own copy of the state list, to rebuild
// the same <style> after the colour modal saves. Adding a state to one and not
// the other paints the custom colour over the state colour on every page until
// the user reloads, which looks like the state simply not working.
test('the JS copy of the state list matches the PHP one', function () {
    $php = poznoteBuildToolbarIconColorRules(['btn-duplicate' => '#ef4444']);
    if (!preg_match('/\.toolbar-btn\.btn-duplicate((?::not\([^)]+\))+) i/', $php, $m)) {
        fail('could not read the state list out of the generated CSS');
    }

    $js = file_get_contents(dirname(__DIR__) . '/src/public/js/toolbar-icon-colors.js');
    assertContains("var STATES = '" . $m[1] . "';", $js);
});
