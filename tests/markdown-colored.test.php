<?php
lib('markdown-colored');

// The "Colored markdown" setting reaches the stylesheets as body.markdown-colored
// plus --mdc-* declarations on <body>; index.php and diary.php both build them
// from these two functions, so the journal view paints what the editor paints.

test('the setting is off for 0, empty and false, on for anything else', function () {
    foreach (['0', '', 'false', ' 0 ', null] as $off) {
        assertSame(false, poznoteMarkdownColoredEnabled($off), var_export($off, true));
    }
    assertSame(true, poznoteMarkdownColoredEnabled('custom'));
    assertSame(true, poznoteMarkdownColoredEnabled('1'));
});

test('valid colours become --mdc-* declarations and invalid ones are skipped', function () {
    $json = json_encode(['h1' => '#112233', 'code' => 'red', 'codeblock' => '#ABCDEF', 'hr' => '#12345', 'quote' => '#a1b2c3']);
    assertSame('--mdc-h1: #112233; --mdc-codeblock: #ABCDEF; --mdc-quote: #a1b2c3;', poznoteMarkdownColoredStyle('custom', $json));
});

test('a legacy single heading colour fans out to every level and code tints the block', function () {
    $style = poznoteMarkdownColoredStyle('custom', json_encode(['heading' => '#007db8', 'h3' => '#8250df', 'code' => '#b34e00']));
    foreach (['h1', 'h2', 'h4', 'h5', 'h6'] as $level) {
        assertContains("--mdc-$level: #007db8;", $style);
    }
    assertContains('--mdc-h3: #8250df;', $style);
    assertContains('--mdc-code: #b34e00;', $style);
    assertContains('--mdc-codeblock: #b34e00;', $style);
});

test('nothing is declared when the setting is off or the stored value is not JSON', function () {
    assertSame('', poznoteMarkdownColoredStyle('0', json_encode(['h1' => '#112233'])));
    assertSame('', poznoteMarkdownColoredStyle('custom', ''));
    assertSame('', poznoteMarkdownColoredStyle('custom', 'not json'));
    assertSame('', poznoteMarkdownColoredStyle('custom', '"a string"'));
});
