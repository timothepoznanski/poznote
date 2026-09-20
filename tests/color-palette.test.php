<?php
lib('color-palette');

// The palette exists three times: the tokens in css/tokens.css, the fallbacks
// in lib/color-palette.php, and the browser copy in js/color-palette.js. A
// fallback that drifts from its token shows one colour in the app and another
// in every export; a JS copy that drifts writes a colour the PHP side does not
// recognise as a token.

test('the JS palette is the PHP palette, in the same order', function () {
    $js = file_get_contents(dirname(__DIR__) . '/src/public/js/color-palette.js');
    preg_match_all("/\\{ id: '([a-z]+)', hex: '(#[0-9a-f]{6})', soft: '(#[0-9a-f]{6})' \\}/", $js, $m, PREG_SET_ORDER);
    $jsPalette = [];
    foreach ($m as $row) {
        $jsPalette[$row[1]] = ['hex' => $row[2], 'soft' => $row[3]];
    }
    assertSame(poznoteColorPalette(), $jsPalette);
});

test('the JS legacy icon map is the PHP one', function () {
    $js = file_get_contents(dirname(__DIR__) . '/src/public/js/color-palette.js');
    preg_match_all("/'(#[0-9a-f]{6})': '(--pz-[a-z-]+)'/", $js, $m, PREG_SET_ORDER);
    $jsLegacy = [];
    foreach ($m as $row) {
        $jsLegacy[$row[1]] = $row[2];
    }
    assertSame(poznoteLegacyIconColorTokens(), $jsLegacy);
});

test('every fallback is the light value of its token', function () {
    $css = file_get_contents(dirname(__DIR__) . '/src/public/css/tokens.css');
    if (!preg_match('/:root\s*\{(.*?)\n\}/s', $css, $root)) {
        fail('could not find the :root block of tokens.css');
    }
    foreach (poznoteColorPalette() as $id => $entry) {
        assertContains('--pz-color-' . $id . ': ' . $entry['hex'] . ';', $root[1], $id);
        assertContains('--pz-color-' . $id . '-soft: color-mix(', $root[1], $id . '-soft');
    }
    assertContains('--pz-color-soft-mix: 50%;', $root[1]);
    // Yellow, the highlighter, is mixed stronger than the rest (discussion #1451).
    assertContains('--pz-color-yellow-soft-mix: 65%;', $root[1]);
    assertContains('--pz-color-yellow-soft: color-mix(in srgb, var(--pz-color-yellow) var(--pz-color-yellow-soft-mix),', $root[1]);
});

test('every soft fallback is its colour mixed over white, like the light token', function () {
    foreach (poznoteColorPalette() as $id => $entry) {
        $percent = $id === 'yellow' ? 65 : 50;
        $mixed = '#';
        foreach ([1, 3, 5] as $offset) {
            $channel = hexdec(substr($entry['hex'], $offset, 2));
            $mixed .= sprintf('%02x', (int)round(($percent * $channel + (100 - $percent) * 255) / 100));
        }
        assertSame($mixed, $entry['soft'], $id);
    }
});

test('a dark theme mixes yellow like the other highlights', function () {
    $css = file_get_contents(dirname(__DIR__) . '/src/public/css/tokens.css');
    if (!preg_match("/\nhtml\[data-theme='dark'\]\s*\{(.*?)\n\}/s", $css, $dark)) {
        fail('could not find the dark block of tokens.css');
    }
    // 65% of yellow under light text drops its contrast to 2:1.
    assertContains('--pz-color-yellow-soft-mix: var(--pz-color-soft-mix);', $dark[1]);
});

test('a palette icon colour renders as its token, whatever its case', function () {
    assertSame('var(--pz-color-red, #dc2626)', poznoteIconColorCss('#dc2626'));
    assertSame('var(--pz-color-red, #dc2626)', poznoteIconColorCss('#DC2626'));
});

test('a colour from the old icon palette renders as the token that replaced it', function () {
    assertSame('var(--pz-color-cyan, #0ea5e9)', poznoteIconColorCss('#0ea5e9'));
    assertSame('var(--pz-text, #111827)', poznoteIconColorCss('#111827'));
});

test('any other safe colour renders as it is, anything else not at all', function () {
    assertSame('#123456', poznoteIconColorCss('#123456'));
    assertSame('rebeccapurple', poznoteIconColorCss('rebeccapurple'));
    assertSame('', poznoteIconColorCss(''));
    assertSame('', poznoteIconColorCss(null));
    assertSame('', poznoteIconColorCss('red" onmouseover="alert(1)'));
    assertSame('', poznoteIconColorCss('red; background: url(x)'));
});
