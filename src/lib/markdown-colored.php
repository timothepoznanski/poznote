<?php
/**
 * "Colored markdown" display setting. The per-element colours picked in the
 * settings modal (modals.php #markdownColoredModal, stored by
 * api/v1/controllers/SettingsController.php as markdown_colored and
 * markdown_colored_custom) reach the stylesheets as body.markdown-colored
 * plus --mdc-* custom properties inlined on <body>. css/markdown.css paints
 * the note preview from them and css/diary.css the journal view, so every
 * page rendering markdown builds its <body> through these two functions.
 */

/** Elements a colour can be chosen for, in the order the modal lists them. */
const POZNOTE_MARKDOWN_COLORED_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'codeblock', 'quote', 'table', 'hr'];

/**
 * The fixed colours the modal used to prefill and save for every element,
 * before the defaults followed the theme (issue #1444). Most stored settings
 * hold them only because saving the modal wrote all eleven, so an element
 * still on its old default is read as "follow the theme" rather than pinning
 * a light-theme colour on every theme. Mirrored in js/settings-page.js.
 */
const POZNOTE_MARKDOWN_COLORED_LEGACY_DEFAULTS = [
    'h1' => '#007db8',
    'h2' => '#1a7f37',
    'h3' => '#8250df',
    'h4' => '#bf3989',
    'h5' => '#1b7c83',
    'h6' => '#656d76',
    'code' => '#b34e00',
    'codeblock' => '#b34e00',
    'quote' => '#007db8',
    'table' => '#007db8',
    'hr' => '#007db8',
];

/**
 * Whether the setting is on. '0', '' and 'false' are off; anything else
 * ('custom' today, the named themes of older installs) turns the class on.
 */
function poznoteMarkdownColoredEnabled($theme): bool {
    $theme = trim((string)$theme);
    return $theme !== '' && $theme !== '0' && $theme !== 'false';
}

/**
 * Inline style declaring the --mdc-* colours from the stored JSON of
 * markdown_colored_custom, '' when the setting is off or nothing valid was
 * saved. An element stored as "" (the modal's "follow the theme"), without a
 * valid #rrggbb, or still on its legacy default keeps the theme default
 * (css/tokens.css, .markdown-colored).
 */
function poznoteMarkdownColoredStyle($theme, $customJson): string {
    if (!poznoteMarkdownColoredEnabled($theme)) {
        return '';
    }
    $customColors = json_decode((string)$customJson, true);
    if (!is_array($customColors)) {
        return '';
    }
    // Legacy values stored a single 'heading' color and no code block background
    $legacyHeading = (string)($customColors['heading'] ?? '');
    foreach (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as $level) {
        if (!isset($customColors[$level]) && $legacyHeading !== '') {
            $customColors[$level] = $legacyHeading;
        }
    }
    if (!isset($customColors['codeblock']) && isset($customColors['code'])) {
        $customColors['codeblock'] = $customColors['code'];
    }
    $style = '';
    foreach (POZNOTE_MARKDOWN_COLORED_ELEMENTS as $element) {
        $color = (string)($customColors[$element] ?? '');
        if (strcasecmp($color, POZNOTE_MARKDOWN_COLORED_LEGACY_DEFAULTS[$element]) === 0) {
            continue;
        }
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            $style .= '--mdc-' . $element . ': ' . $color . '; ';
        }
    }
    return trim($style);
}
