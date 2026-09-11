<?php
/**
 * The note and tag colour palettes: defaults, validation and hex resolution.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * English names of the factory palette, keyed by id. They are what a palette
 * saved before the names became translatable still holds in the database, so
 * localizeNoteColorPalette() uses them to tell an untouched entry from one the
 * user renamed on purpose.
 */
function getDefaultNoteColorNames() {
    return [
        'blue'   => 'Blue',
        'green'  => 'Green',
        'yellow' => 'Yellow',
        'orange' => 'Orange',
        'red'    => 'Red',
        'purple' => 'Purple',
        'pink'   => 'Pink',
        'gray'   => 'Gray',
    ];
}

/**
 * Factory palette, used when the user has never customized theirs.
 * Ids are stable identifiers; names are localized for display.
 */
function getDefaultNoteColorPalette() {
    $hex = [
        'blue'   => '#3b82f6',
        'green'  => '#22c55e',
        'yellow' => '#eab308',
        'orange' => '#f97316',
        'red'    => '#ef4444',
        'purple' => '#a855f7',
        'pink'   => '#ec4899',
        'gray'   => '#6b7280',
    ];

    $palette = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $palette[] = [
            'id'   => $id,
            'name' => t('note_color.names.' . $id, [], $englishName),
            'hex'  => $hex[$id],
        ];
    }
    return $palette;
}

/**
 * id => name of the built-in colors in the current user's language.
 */
function getLocalizedNoteColorNames() {
    $names = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $names[$id] = t('note_color.names.' . $id, [], $englishName);
    }
    return $names;
}

/**
 * id => every name a built-in color goes by across the shipped languages,
 * lowercased. A stored palette entry whose name is in this list was never
 * renamed by the user, only saved in whatever language was active at the time,
 * so it is safe to re-translate.
 */
function getKnownNoteColorNames() {
    static $known = null;
    if ($known !== null) {
        return $known;
    }

    $known = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $known[$id] = [mb_strtolower($englishName)];
    }
    foreach (glob(__DIR__ . '/../i18n/*.json') ?: [] as $file) {
        $dict = loadI18nDictionary(basename($file, '.json'));
        foreach (array_keys($known) as $id) {
            $translated = i18nGet($dict, 'note_color.names.' . $id);
            if ($translated !== null) {
                $known[$id][] = mb_strtolower($translated);
            }
        }
    }
    foreach ($known as $id => $names) {
        $known[$id] = array_values(array_unique($names));
    }

    return $known;
}

/**
 * Translate the names of built-in palette entries the user never renamed.
 * A deliberate rename such as "Bleu client" is always left alone.
 */
function localizeNoteColorPalette($palette) {
    $known = getKnownNoteColorNames();
    $localized = getLocalizedNoteColorNames();

    foreach ($palette as &$entry) {
        $id = $entry['id'] ?? '';
        if (!isset($known[$id])) {
            continue;
        }
        if (in_array(mb_strtolower((string)($entry['name'] ?? '')), $known[$id], true)) {
            $entry['name'] = $localized[$id];
        }
    }
    unset($entry);

    return $palette;
}

/**
 * True when $value is a valid #rgb / #rrggbb literal.
 */
function isNoteColorHex($value) {
    return is_string($value) && preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', trim($value)) === 1;
}

/**
 * Normalize a hex color to lowercase #rrggbb, or '' when invalid.
 */
function normalizeNoteColorHex($value) {
    $value = strtolower(trim((string)$value));
    if (!isNoteColorHex($value)) {
        return '';
    }
    if (strlen($value) === 4) {
        // #abc -> #aabbcc
        $value = '#' . $value[1] . $value[1] . $value[2] . $value[2] . $value[3] . $value[3];
    }
    return $value;
}

/**
 * Validate and clean a palette structure coming from user input or storage.
 * Returns a list of ['id','name','hex'] entries, or [] when nothing is usable.
 */
function sanitizeNoteColorPalette($palette) {
    if (is_string($palette)) {
        $palette = json_decode($palette, true);
    }
    if (!is_array($palette)) {
        return [];
    }

    $clean = [];
    $seenIds = [];
    foreach ($palette as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $hex = normalizeNoteColorHex($entry['hex'] ?? '');
        if ($hex === '') {
            continue;
        }
        $id = strtolower(trim((string)($entry['id'] ?? '')));
        // Ids are used verbatim in CSS class-like data attributes and in the DB.
        $id = preg_replace('/[^a-z0-9_-]/', '', $id);
        if ($id === '' || isset($seenIds[$id])) {
            continue;
        }
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '') {
            $name = ucfirst($id);
        }
        $seenIds[$id] = true;
        $clean[] = [
            'id'   => $id,
            'name' => mb_substr($name, 0, 40),
            'hex'  => $hex,
        ];
        if (count($clean) >= 24) {
            break; // keep the picker and the settings editor manageable
        }
    }

    return $clean;
}

/**
 * The palette in effect for the current user, falling back to the defaults.
 */
function getNoteColorPalette() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $stored = sanitizeNoteColorPalette(getSetting(NOTE_COLOR_PALETTE_SETTING, ''));
    $cached = !empty($stored) ? localizeNoteColorPalette($stored) : getDefaultNoteColorPalette();
    return $cached;
}

/**
 * Resolve a stored entries.color value to a concrete hex color.
 * Returns '' when the note has no color, or when its palette id no longer
 * exists (a deleted palette entry simply renders as uncolored).
 */
function resolveNoteColorHex($storedColor, $palette = null) {
    $storedColor = trim((string)$storedColor);
    if ($storedColor === '') {
        return '';
    }
    if (isNoteColorHex($storedColor)) {
        return normalizeNoteColorHex($storedColor);
    }

    $palette = $palette ?? getNoteColorPalette();
    foreach ($palette as $entry) {
        if ($entry['id'] === strtolower($storedColor)) {
            return $entry['hex'];
        }
    }
    return '';
}

/**
 * Validate a value destined for entries.color. Returns the value to store
 * (palette id or normalized hex), or null to clear the color.
 */
function normalizeStoredNoteColor($value, $palette = null) {
    $value = trim((string)$value);
    if ($value === '') {
        return null;
    }
    if (isNoteColorHex($value)) {
        return normalizeNoteColorHex($value);
    }

    $value = strtolower($value);
    $palette = $palette ?? getNoteColorPalette();
    foreach ($palette as $entry) {
        if ($entry['id'] === $value) {
            return $entry['id'];
        }
    }
    return null;
}

/**
 * Validate and clean a tag => color map coming from user input or storage.
 * Returns [lowercased tag => palette id or '#rrggbb'], dropping invalid rows.
 */
function sanitizeTagColorsMap($value, $palette = null) {
    if (is_string($value)) {
        $value = json_decode($value, true);
    }
    if (!is_array($value)) {
        return [];
    }

    $clean = [];
    foreach ($value as $tag => $color) {
        $tag = mb_strtolower(trim((string)$tag));
        if ($tag === '' || mb_strlen($tag) > 100) {
            continue;
        }
        $stored = normalizeStoredNoteColor($color, $palette);
        if ($stored === null) {
            continue;
        }
        $clean[$tag] = $stored;
        if (count($clean) >= 500) {
            break;
        }
    }

    return $clean;
}

/**
 * The tag => color map in effect for the current user.
 */
function getTagColorsMap() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $cached = sanitizeTagColorsMap(getSetting(TAG_COLORS_SETTING, ''));
    return $cached;
}

/**
 * Resolve a tag name to a concrete hex color, or '' when the tag has no
 * color (or its palette id no longer exists).
 */
function resolveTagColorHex($tag, $map = null, $palette = null) {
    $tag = mb_strtolower(trim((string)$tag));
    if ($tag === '') {
        return '';
    }

    $map = $map ?? getTagColorsMap();
    if (!isset($map[$tag])) {
        return '';
    }
    return resolveNoteColorHex($map[$tag], $palette);
}
