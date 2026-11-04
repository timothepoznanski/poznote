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
 * `soft` the light value of --pz-color-<id>-soft (half of the colour over
 * white, 65% for yellow, the highlighter). Both are the fallbacks written
 * into note content. Order is the order of the swatches: round the colour
 * wheel, then the two neutrals.
 */
function poznoteColorPalette() {
    return [
        'red'     => ['hex' => '#dc2626', 'soft' => '#ee9393'],
        'orange'  => ['hex' => '#ea580c', 'soft' => '#f5ac86'],
        'amber'   => ['hex' => '#d97706', 'soft' => '#ecbb83'],
        'yellow'  => ['hex' => '#eab308', 'soft' => '#f1ce5e'],
        'lime'    => ['hex' => '#84cc16', 'soft' => '#c2e68b'],
        'green'   => ['hex' => '#16a34a', 'soft' => '#8bd1a5'],
        'teal'    => ['hex' => '#0d9488', 'soft' => '#86cac4'],
        'cyan'    => ['hex' => '#0891b2', 'soft' => '#84c8d9'],
        'blue'    => ['hex' => '#2563eb', 'soft' => '#92b1f5'],
        'indigo'  => ['hex' => '#4f46e5', 'soft' => '#a7a3f2'],
        'purple'  => ['hex' => '#9333ea', 'soft' => '#c999f5'],
        'magenta' => ['hex' => '#c026d3', 'soft' => '#e093e9'],
        'pink'    => ['hex' => '#db2777', 'soft' => '#ed93bb'],
        'brown'   => ['hex' => '#92400e', 'soft' => '#c9a087'],
        'gray'    => ['hex' => '#6b7280', 'soft' => '#b5b9c0'],
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
 * Class and attributes of a coloured title in the notes tree (a note title,
 * a folder name): ' has-title-color' to append to the class, and the
 * custom property that paints it plus the stored hex as data-title-color,
 * or two empty strings for the default look.
 *
 * @return array{class: string, attrs: string}
 */
function poznoteTitleColorAttrs($titleColor, $property) {
    $css = poznoteIconColorCss($titleColor);
    if ($css === '') {
        return ['class' => '', 'attrs' => ''];
    }
    return [
        'class' => ' has-title-color',
        'attrs' => " style='" . $property . ': ' . htmlspecialchars($css, ENT_QUOTES) . "'"
            . " data-title-color='" . htmlspecialchars(strtolower(trim((string)$titleColor)), ENT_QUOTES) . "'",
    ];
}

/**
 * Pieces of a folder name element, in every view that names a folder (notes
 * tree, Kanban, Dashboard, Folders page): data-folder-title-for always, so
 * js/folder-icon.js finds the names to repaint after the icon picker, and,
 * for a coloured name (folders.title_color, discussion #1729), the stored
 * hex, ' has-title-color' and the --folder-title-color declaration that
 * css/components/folder-title.css paints. Already escaped for an attribute.
 *
 * @return array{class: string, style: string, data: string}
 */
function poznoteFolderTitleAttrs($folderId, $titleColor) {
    $data = ' data-folder-title-for="' . (int)$folderId . '"';
    $css = poznoteIconColorCss($titleColor);
    if ($css === '') {
        return ['class' => '', 'style' => '', 'data' => $data];
    }
    return [
        'class' => ' has-title-color',
        'style' => '--folder-title-color: ' . htmlspecialchars($css, ENT_QUOTES) . ';',
        'data' => $data . ' data-title-color="' . htmlspecialchars(strtolower(trim((string)$titleColor)), ENT_QUOTES) . '"',
    ];
}

/**
 * Title colour of a note or folder once its icon colour changes, for the
 * icon picker's "Apply the color to the title" box (discussion #1729): the
 * box ticked, the title takes the new icon colour (or the default when the
 * icon has none); unticked, a title that had the old icon colour goes back
 * to the default, and a title coloured otherwise (note title menu) is kept.
 * Titles only hold #rrggbb, so another icon colour leaves the default.
 *
 * @return string|null the title colour to store, lowercase, or null
 */
function poznoteTitleColorAfterIconChange($applyToTitle, $oldIconColor, $newIconColor, $oldTitleColor) {
    $oldTitle = strtolower(trim((string)$oldTitleColor));
    if ($applyToTitle) {
        $new = strtolower(trim((string)$newIconColor));
        return preg_match('/^#[0-9a-f]{6}$/', $new) ? $new : null;
    }
    $oldIcon = strtolower(trim((string)$oldIconColor));
    if ($oldTitle !== '' && $oldTitle === $oldIcon) {
        return null;
    }
    return $oldTitle !== '' ? $oldTitle : null;
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
