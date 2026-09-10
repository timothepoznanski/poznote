<?php
/**
 * What the theme button offers, and what an admin puts in it.
 *
 * The rail button walks through a list of themes. That list used to be the six
 * built-in ones, hardcoded in js/theme-manager.js; an admin can now curate it
 * from Settings > Custom CSS, drop the themes nobody uses and add the CSS files
 * uploaded to data/css/ as themes of their own.
 *
 * The list is a global setting, so every user of the instance walks through the
 * same themes, and which one is applied stays a per-user choice in localStorage.
 *
 * The built-in definitions below are the PHP copy of a list that also lives in
 * js/theme-manager.js, js/theme-init.js and css/tokens.css. Adding a theme means
 * adding it in all four; this copy exists so the settings modal can render the
 * list and the API can refuse an id that is not a theme.
 */

/** The themes shipped with the app, in the order the button walks them. */
function poznoteBuiltinThemes(): array
{
    return [
        ['id' => 'light',    'mode' => 'light', 'icon' => 'lucide-sun'],
        ['id' => 'dark',     'mode' => 'dark',  'icon' => 'lucide-moon'],
        ['id' => 'black',    'mode' => 'dark',  'icon' => 'lucide-moon-star', 'variant' => 'theme-black'],
        ['id' => 'lavender', 'mode' => 'light', 'icon' => 'lucide-flower-2',  'variant' => 'theme-lavender'],
        ['id' => 'sepia',    'mode' => 'light', 'icon' => 'lucide-book-open', 'variant' => 'theme-sepia'],
        ['id' => 'terminal', 'mode' => 'dark',  'icon' => 'lucide-terminal',  'variant' => 'theme-terminal'],
    ];
}

/** A custom theme has no icon of its own, they all get this one. */
function poznoteCustomThemeIcon(): string
{
    return 'lucide-palette';
}

/** Where an uploaded stylesheet is stored, and where it is served from. */
function poznoteCustomCssDir(): string
{
    return __DIR__ . '/data/css';
}

function poznoteCustomCssNameIsValid($filename): bool
{
    return is_string($filename) && (bool) preg_match('/^[A-Za-z0-9._-]+\.css$/', $filename);
}

/** Every stylesheet in data/css/, by name, ordered so listings stay stable. */
function poznoteCustomCssFiles(): array
{
    $files = [];
    foreach (glob(poznoteCustomCssDir() . '/*.css') ?: [] as $path) {
        $filename = basename($path);
        if (!poznoteCustomCssNameIsValid($filename) || !is_file($path)) {
            continue;
        }
        $files[$filename] = $path;
    }
    uksort($files, 'strcasecmp');
    return $files;
}

function poznoteCustomCssHrefFor(string $filename): string
{
    $path = poznoteCustomCssDir() . '/' . $filename;
    $version = is_file($path) ? (string) filemtime($path) : '';
    return '/data/css/' . rawurlencode($filename) . ($version !== '' ? '?v=' . rawurlencode($version) : '');
}

/**
 * The id of a stored stylesheet used as a theme.
 *
 * Prefixed so a custom theme can never collide with a built-in id, and so the
 * client can tell the two apart from the id alone.
 */
function poznoteCustomThemeId(string $filename): string
{
    return 'custom:' . $filename;
}

function poznoteCustomThemeFile(string $themeId): string
{
    if (strpos($themeId, 'custom:') !== 0) {
        return '';
    }
    $filename = substr($themeId, strlen('custom:'));
    return poznoteCustomCssNameIsValid($filename) ? $filename : '';
}

/** The list every instance starts with: the six built-in themes. */
function poznoteDefaultThemeList(): array
{
    $entries = [];
    foreach (poznoteBuiltinThemes() as $theme) {
        $entries[] = ['id' => $theme['id']];
    }
    return $entries;
}

/**
 * Keeps the entries that name a theme this instance actually has.
 *
 * A stylesheet deleted from the library takes its theme entry with it, so a
 * stale list cannot leave the button cycling onto a stylesheet that is gone.
 * Returns [] when nothing is left, which callers read as "not configured".
 *
 * $knownFiles names the stylesheets that exist; it defaults to what data/css/
 * holds and is passed explicitly by the tests, which have no data volume.
 */
function poznoteNormalizeThemeList($raw, ?array $knownFiles = null): array
{
    if (is_string($raw)) {
        $raw = json_decode($raw, true);
    }
    if (!is_array($raw)) {
        return [];
    }

    $builtinIds = array_column(poznoteBuiltinThemes(), 'id');
    $customFiles = $knownFiles === null
        ? poznoteCustomCssFiles()
        : array_flip(array_values($knownFiles));

    $entries = [];
    $seen = [];
    foreach ($raw as $entry) {
        // A bare string is accepted so the setting can be written by hand.
        $id = is_array($entry) ? ($entry['id'] ?? '') : $entry;
        if (!is_string($id) || $id === '' || isset($seen[$id])) {
            continue;
        }

        if (in_array($id, $builtinIds, true)) {
            $seen[$id] = true;
            $entries[] = ['id' => $id];
            continue;
        }

        $file = poznoteCustomThemeFile($id);
        if ($file === '' || !isset($customFiles[$file])) {
            continue;
        }

        $mode = is_array($entry) ? ($entry['mode'] ?? 'light') : 'light';
        $seen[$id] = true;
        $entries[] = ['id' => $id, 'mode' => $mode === 'dark' ? 'dark' : 'light'];
    }

    return $entries;
}

/**
 * What the admin stored, [] when nobody curated the list yet.
 *
 * Read once per request: the pages ask on every HTML response, and this is a
 * lookup in the master DB.
 */
function poznoteStoredThemeList(bool $reload = false): array
{
    static $cached = null;
    if ($reload) {
        $cached = null;
    }
    if ($cached !== null) {
        return $cached;
    }

    $cached = [];
    try {
        require_once __DIR__ . '/users/db_master.php';
        $cached = poznoteNormalizeThemeList(getGlobalSetting('theme_list', ''));
    } catch (Exception $e) {
        error_log('theme_catalog: poznoteStoredThemeList() failed: ' . $e->getMessage());
    }

    return $cached;
}

/** Read the setting again after writing it, within the same request. */
function poznoteResetThemeListCache(): void
{
    poznoteStoredThemeList(true);
}

/** True once an admin has curated the list, so the client needs to be told. */
function poznoteThemeListIsConfigured(): bool
{
    return poznoteStoredThemeList() !== [];
}

/**
 * The curated list, or the built-in one when no admin ever touched it.
 */
function poznoteThemeList(): array
{
    $stored = poznoteStoredThemeList();
    return $stored !== [] ? $stored : poznoteDefaultThemeList();
}

/**
 * The same list, with everything the browser needs to apply a theme: the mode
 * that goes in data-theme, the variant class carrying a built-in palette, and
 * the stylesheet a custom theme loads.
 */
function poznoteThemeListForClient(): array
{
    $builtins = [];
    foreach (poznoteBuiltinThemes() as $theme) {
        $builtins[$theme['id']] = $theme;
    }

    $out = [];
    foreach (poznoteThemeList() as $entry) {
        $id = $entry['id'];
        if (isset($builtins[$id])) {
            $out[] = [
                'id' => $id,
                'mode' => $builtins[$id]['mode'],
                'icon' => $builtins[$id]['icon'],
                'variant' => $builtins[$id]['variant'] ?? '',
            ];
            continue;
        }

        $file = poznoteCustomThemeFile($id);
        if ($file === '') {
            continue;
        }
        $out[] = [
            'id' => $id,
            'mode' => $entry['mode'] ?? 'light',
            'icon' => poznoteCustomThemeIcon(),
            'variant' => '',
            'file' => $file,
            'href' => poznoteCustomCssHrefFor($file),
            'label' => preg_replace('/\.css$/i', '', $file),
        ];
    }

    return $out;
}

/** True when the button offers a theme that loads a stylesheet of its own. */
function poznoteThemeListHasCustom(): bool
{
    foreach (poznoteThemeList() as $entry) {
        if (poznoteCustomThemeFile($entry['id']) !== '') {
            return true;
        }
    }
    return false;
}
