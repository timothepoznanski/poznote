<?php

// The theme contract of css/tokens.css (discussion #1460): a role has one
// --pz-* name in every theme and only its value changes. The --dm-* names are
// the older vocabulary of the dark layer, kept as the storage of the dark
// values so that custom stylesheets written against them keep working. These
// tests hold the two ends of that bridge together; tools/css-check.php holds
// the third one, that nothing outside tokens.css reads --dm-*.

/** @return array<string, string> the custom properties of one block of tokens.css */
function tokensBlock(string $selector): array
{
    $css = file_get_contents(dirname(__DIR__) . '/src/public/css/tokens.css');
    $css = preg_replace('!/\*.*?\*/!s', '', (string) $css);
    $found = [];
    // Several blocks may share a selector (the dark one is stated twice, once
    // for the tokens and once for the page ground): merge them in order.
    if (preg_match_all('/(?:^|\})\s*' . preg_quote($selector, '/') . '\s*\{([^}]*)\}/', $css, $blocks)) {
        foreach ($blocks[1] as $body) {
            if (preg_match_all('/(--[\w-]+)\s*:\s*([^;]+);/', $body, $m, PREG_SET_ORDER)) {
                foreach ($m as $row) {
                    $found[$row[1]] = trim($row[2]);
                }
            }
        }
    }
    return $found;
}

test('a token the dark theme redefines has a light value too', function () {
    $root = tokensBlock(':root');
    $dark = tokensBlock("html[data-theme='dark']");
    assertTrue(count($dark) > 40, 'the dark block of tokens.css was not found');
    $orphans = [];
    foreach (array_keys($dark) as $name) {
        if (str_starts_with($name, '--pz-') && !isset($root[$name])) {
            $orphans[] = $name;
        }
    }
    // A --pz-* name that only exists in the dark block is a dark-only token
    // again: a light rule reading it gets nothing and drops its declaration.
    assertSame([], $orphans, 'declared in the dark block and missing from :root');
});

test('every legacy --dm-* value is reachable under a --pz-* name', function () {
    $dark = tokensBlock("html[data-theme='dark']");
    $bridged = [];
    foreach ($dark as $name => $value) {
        if (str_starts_with($name, '--pz-') && preg_match('/^var\((--dm-[\w-]+)\)$/', $value, $m)) {
            $bridged[$m[1]] = true;
        }
    }
    $unreachable = [];
    foreach (array_keys($dark) as $name) {
        if (str_starts_with($name, '--dm-') && !isset($bridged[$name])) {
            $unreachable[] = $name;
        }
    }
    // The stylesheets may not read --dm-*, so a dark value with no --pz-* name
    // pointing at it is a value nothing can use.
    assertSame([], $unreachable, 'dark values without a universal name');
});

test('the bridge points one way', function () {
    // --pz-x: var(--dm-y) next to --dm-y: var(--pz-x) is a cycle, and a cycle
    // makes BOTH properties invalid: the role would lose its colour in dark.
    foreach (["html[data-theme='dark']", "html.theme-black[data-theme='dark']", "html.theme-terminal[data-theme='dark']"] as $selector) {
        foreach (tokensBlock($selector) as $name => $value) {
            if (str_starts_with($name, '--dm-')) {
                assertNotContains('var(--pz-', $value, "$selector $name");
            }
        }
    }
});

test('a dark variant does not restate what the bridge already carries', function () {
    // theme-black and theme-terminal outweigh html[data-theme='dark'], so a
    // --pz-text stated there beats a custom stylesheet that only sets
    // --dm-text on the variant. Saying it again with the value the bridge
    // would have carried buys nothing and costs that. A variant may still give
    // a bridged name a value of its OWN (terminal wants its brightest green as
    // -strong), which is a decision and not a repeat.
    $dark = tokensBlock("html[data-theme='dark']");
    $bridge = [];
    foreach ($dark as $name => $value) {
        if (str_starts_with($name, '--pz-') && preg_match('/^var\((--dm-[\w-]+)\)$/', $value, $m)) {
            $bridge[$name] = $m[1];
        }
    }
    foreach (["html.theme-black[data-theme='dark']", "html.theme-terminal[data-theme='dark']"] as $selector) {
        $block = tokensBlock($selector);
        $repeats = [];
        foreach ($block as $name => $value) {
            if (!isset($bridge[$name])) {
                continue;
            }
            $carried = $block[$bridge[$name]] ?? $dark[$bridge[$name]] ?? null;
            if ($carried !== null && strtolower($carried) === strtolower($value)) {
                $repeats[] = $name;
            }
        }
        assertSame([], $repeats, "$selector repeats a value the bridge carries");
    }
});
