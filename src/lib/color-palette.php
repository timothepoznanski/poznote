<?php
/**
 * The colour palette the pickers offer: text colour, highlight, the slash
 * menu, and the icon colour of folders, notes, the icon rail and the toolbar
 * (issue #1408).
 *
 * Every colour is a token in css/tokens.css, --pz-color-<id>, with a pale
 * --pz-color-<id>-soft derived from it for highlights. A theme or a custom
 * stylesheet redefines the fifteen base values and everything follows.
 *
 * What is stored does not change shape:
 * - note content gets `var(--pz-color-red, #dc2626)`, so the colour follows
 *   the theme in the app and on public pages while an export, a Git Sync
 *   file or another editor still reads the hex after the comma;
 * - icon colours stay a plain #rrggbb in the database and the API, and
 *   poznoteIconColorCss() turns a palette hex into its token when rendering.
 *
 * js/color-palette.js holds the same list for the browser;
 * tests/color-palette.test.php keeps the two copies identical.
 */

/**
 * id => [hex, soft]. `hex` is the light-theme value of --pz-color-<id>,
 * `soft` the light value of --pz-color-<id>-soft (30% of the colour over
 * white). Both are the fallbacks written into note content. Order is the
 * order of the swatches: round the colour wheel, then the two neutrals.
 */
function poznoteColorPalette() {
    return [
        'red'     => ['hex' => '#dc2626', 'soft' => '#f5bebe'],
        'orange'  => ['hex' => '#ea580c', 'soft' => '#f9cdb6'],
        'amber'   => ['hex' => '#d97706', 'soft' => '#f4d6b4'],
        'yellow'  => ['hex' => '#eab308', 'soft' => '#f9e8b5'],
        'lime'    => ['hex' => '#84cc16', 'soft' => '#daf0b9'],
        'green'   => ['hex' => '#16a34a', 'soft' => '#b9e3c9'],
        'teal'    => ['hex' => '#0d9488', 'soft' => '#b6dfdb'],
        'cyan'    => ['hex' => '#0891b2', 'soft' => '#b5dee8'],
        'blue'    => ['hex' => '#2563eb', 'soft' => '#bed0f9'],
        'indigo'  => ['hex' => '#4f46e5', 'soft' => '#cac8f7'],
        'purple'  => ['hex' => '#9333ea', 'soft' => '#dfc2f9'],
        'magenta' => ['hex' => '#c026d3', 'soft' => '#ecbef2'],
        'pink'    => ['hex' => '#db2777', 'soft' => '#f4bed6'],
        'brown'   => ['hex' => '#92400e', 'soft' => '#dec6b7'],
        'gray'    => ['hex' => '#6b7280', 'soft' => '#d3d5d9'],
    ];
}

/**
 * The 21 colours the icon picker offered before the palette became tokens,
 * mapped to the token that now stands for them. They are still stored on
 * folders and notes, and a colour that did not follow the theme would be the
 * bug this palette fixes. Black maps to the text colour, which is the only
 * way a black icon stays visible on a dark theme.
 */
function poznoteLegacyIconColorTokens() {
    return [
        '#ef4444' => '--pz-color-red',
        '#f97316' => '--pz-color-orange',
        '#f59e0b' => '--pz-color-amber',
        '#22c55e' => '--pz-color-green',
        '#10b981' => '--pz-color-green',
        '#14b8a6' => '--pz-color-teal',
        '#06b6d4' => '--pz-color-cyan',
        '#0ea5e9' => '--pz-color-cyan',
        '#3b82f6' => '--pz-color-blue',
        '#6366f1' => '--pz-color-indigo',
        '#8b5cf6' => '--pz-color-purple',
        '#a855f7' => '--pz-color-purple',
        '#d946ef' => '--pz-color-magenta',
        '#ec4899' => '--pz-color-pink',
        '#f43f5e' => '--pz-color-red',
        '#64748b' => '--pz-color-gray',
        '#78716c' => '--pz-color-gray',
        '#111827' => '--pz-text',
    ];
}

/**
 * Localized name of a palette colour.
 */
function poznoteColorPaletteName($id) {
    $fallback = ucfirst((string)$id);
    return function_exists('t') ? t('colors.' . $id, [], $fallback) : $fallback;
}

/**
 * Whether a stored colour can be written into a style attribute or a <style>
 * block as it is: a hex colour or a bare colour keyword. icon_color comes from
 * the API and from Git Sync metadata with no other check, and several
 * renderers interpolate it without escaping.
 */
function poznoteIsSafeCssColor($color) {
    return is_string($color) && preg_match('/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30})$/', $color) === 1;
}

/**
 * The CSS value to paint a stored icon colour with: the theme token for a
 * palette colour (current or legacy) with the stored hex as fallback, the
 * colour itself for anything else that is safe, '' otherwise.
 */
function poznoteIconColorCss($color) {
    $color = trim((string)$color);
    if (!poznoteIsSafeCssColor($color)) {
        return '';
    }
    $lower = strtolower($color);
    foreach (poznoteColorPalette() as $id => $entry) {
        if ($entry['hex'] === $lower) {
            return 'var(--pz-color-' . $id . ', ' . $lower . ')';
        }
    }
    $legacy = poznoteLegacyIconColorTokens();
    if (isset($legacy[$lower])) {
        return 'var(' . $legacy[$lower] . ', ' . $lower . ')';
    }
    return $color;
}
