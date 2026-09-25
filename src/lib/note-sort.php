<?php
/**
 * The single sort order of the notes tree.
 *
 * One setting, `note_list_sort`, decides how every folder and every note is
 * ordered in the sidebar. It used to be a global default that each folder
 * could override through its own `folders.sort_setting`; issue #1442 made it
 * global only, driven by the button at the top of the notes list which steps
 * through the modes the same way the theme button steps through themes.
 *
 * Modes, in the order the button walks them:
 *
 *   heading_asc   Name           notes by title, folders by name
 *   updated_desc  Date modified  notes by last change, newest first
 *   created_desc  Date created   notes by creation, newest first
 *   type_asc      Type           notes grouped by kind, then by title
 *   manual        Custom         the order the user arranged by dragging
 *
 * Folders carry no `updated` column, so both date modes order them on
 * `created`; under Type they keep the alphabetical order, since a folder has
 * no kind to group on.
 *
 * "Custom" is not a mode the user has to pick: dragging an item to a new
 * position switches to it (see enableManualNoteSort() in FoldersController),
 * which is what makes the drop stick. Moving an item into or out of a folder
 * is not a reorder and leaves the mode alone. Nothing erases the saved
 * positions, so leaving Custom and coming back restores the arrangement.
 *
 * Pure functions only: no database, no session, no config, so
 * tests/note-sort.test.php can cover them directly.
 */

/** Value used when the setting is unset or unreadable. */
const POZNOTE_NOTE_SORT_DEFAULT = 'updated_desc';

/**
 * Every accepted value, in the order the sidebar button cycles them.
 *
 * @return string[]
 */
function poznoteNoteSortModes(): array
{
    return ['heading_asc', 'updated_desc', 'created_desc', 'type_asc', 'manual'];
}

/**
 * Coerce a stored or submitted value to a known mode.
 *
 * @param mixed $value
 */
function poznoteNormalizeNoteSort($value): string
{
    $value = is_string($value) ? trim($value) : '';
    return in_array($value, poznoteNoteSortModes(), true) ? $value : POZNOTE_NOTE_SORT_DEFAULT;
}

/**
 * The mode one click on the sidebar button leads to.
 *
 * @param mixed $value
 */
function poznoteNextNoteSort($value): string
{
    $modes = poznoteNoteSortModes();
    $index = array_search(poznoteNormalizeNoteSort($value), $modes, true);
    return $modes[((int)$index + 1) % count($modes)];
}

/**
 * Icon class of the button for a mode. The icon names the mode in use, not the
 * one the next click brings, like the theme button.
 *
 * The five keep the same left half, the down arrow of lucide-arrow-down-a-z,
 * and differ only in the mark on its right. Five unrelated glyphs made the
 * button a different control on every click, and the mode is named anyway by
 * the title and the label that follows a click. The four composed classes sit
 * at the end of src/public/css/lucide.css; Name wears the Lucide icon whole.
 */
function poznoteNoteSortIcon(string $mode): string
{
    $icons = [
        'heading_asc' => 'lucide-arrow-down-a-z',
        'updated_desc' => 'lucide-sort-date-modified',
        'created_desc' => 'lucide-sort-date-created',
        'type_asc' => 'lucide-sort-type',
        'manual' => 'lucide-sort-custom',
    ];
    return $icons[poznoteNormalizeNoteSort($mode)];
}

/**
 * i18n key and English fallback of a mode's name, for the button title and
 * the toast shown on each click.
 *
 * @return array{0:string,1:string}
 */
function poznoteNoteSortLabel(string $mode): array
{
    $labels = [
        'heading_asc' => ['sort.modes.name', 'Name'],
        'updated_desc' => ['sort.modes.date_modified', 'Date modified'],
        'created_desc' => ['sort.modes.date_created', 'Date created'],
        'type_asc' => ['sort.modes.type', 'Type'],
        'manual' => ['sort.modes.custom', 'Custom'],
    ];
    return $labels[poznoteNormalizeNoteSort($mode)];
}

/**
 * Rank of a note kind under the Type mode.
 *
 * A fixed list rather than the alphabetical order of the internal names, so
 * the grouping reads as documents first, then lists, drawings and shortcuts.
 * A kind that is not listed (an older or newer one) lands after them, its
 * group kept together by the name comparison that follows.
 */
function poznoteNoteTypeRank(?string $type): int
{
    $order = ['note' => 0, 'markdown' => 1, 'tasklist' => 2, 'excalidraw' => 3, 'linked' => 4];
    $type = is_string($type) && $type !== '' ? $type : 'note';
    return $order[$type] ?? count($order);
}

/**
 * Compare two notes under one mode.
 *
 * Rows are `entries` rows: 'heading', 'created', 'updated', 'type',
 * 'display_order' and 'id'. Ties break on the id so the order is total and a
 * list does not shuffle between two page loads.
 *
 * @param array<string,mixed> $a
 * @param array<string,mixed> $b
 */
function poznoteCompareNotes(string $mode, array $a, array $b): int
{
    switch (poznoteNormalizeNoteSort($mode)) {
        case 'heading_asc':
            return poznoteCompareNoteHeadings($a, $b);

        case 'created_desc':
            return strcmp((string)($b['created'] ?? ''), (string)($a['created'] ?? ''))
                ?: ((int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0));

        case 'type_asc':
            return (poznoteNoteTypeRank(isset($a['type']) ? (string)$a['type'] : null)
                    <=> poznoteNoteTypeRank(isset($b['type']) ? (string)$b['type'] : null))
                ?: (strcmp((string)($a['type'] ?? ''), (string)($b['type'] ?? ''))
                ?: poznoteCompareNoteHeadings($a, $b));

        case 'manual':
            return poznoteComparePlacedOrder($a, $b, 'display_order');

        case 'updated_desc':
        default:
            return strcmp((string)($b['updated'] ?? ''), (string)($a['updated'] ?? ''))
                ?: ((int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0));
    }
}

/**
 * Titles, case-insensitive and natural ("Note 9" before "Note 10").
 *
 * @param array<string,mixed> $a
 * @param array<string,mixed> $b
 */
function poznoteCompareNoteHeadings(array $a, array $b): int
{
    $headingA = mb_strtolower((string)($a['heading'] ?? ''), 'UTF-8');
    $headingB = mb_strtolower((string)($b['heading'] ?? ''), 'UTF-8');
    return strnatcasecmp($headingA, $headingB) ?: ((int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0));
}

/**
 * Hand-set order: placed rows ($column > 0) in the saved order, rows never
 * placed before them, newest change first.
 *
 * A note created or moved in after the last drop has no position yet; showing
 * it first keeps it visible until the user drops it somewhere. The reorder
 * endpoint renumbers every sibling on each drop, so a mixed list only exists
 * between one drop and the next. Shared by the sidebar (display_order) and the
 * dashboard (dashboard_order).
 *
 * @param array<string,mixed> $a
 * @param array<string,mixed> $b
 */
function poznoteComparePlacedOrder(array $a, array $b, string $column): int
{
    $orderA = (int)($a[$column] ?? 0);
    $orderB = (int)($b[$column] ?? 0);
    if ($orderA > 0 && $orderB > 0) {
        return ($orderA <=> $orderB) ?: ((int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0));
    }
    if ($orderA > 0) return 1;
    if ($orderB > 0) return -1;
    return strcmp((string)($b['updated'] ?? ''), (string)($a['updated'] ?? ''))
        ?: ((int)($b['id'] ?? 0) <=> (int)($a['id'] ?? 0));
}

/**
 * Compare two sibling folders under one mode.
 *
 * Rows are `folders` rows: 'name', 'created', 'display_order' and 'id'. There
 * is no `updated` column on a folder, so Date modified falls back on the
 * creation date, and Type has nothing to group on and keeps the names.
 *
 * @param array<string,mixed> $a
 * @param array<string,mixed> $b
 */
function poznoteCompareFolders(string $mode, array $a, array $b): int
{
    $mode = poznoteNormalizeNoteSort($mode);

    if ($mode === 'manual') {
        $orderA = (int)($a['display_order'] ?? 0);
        $orderB = (int)($b['display_order'] ?? 0);
        if ($orderA > 0 || $orderB > 0) {
            if ($orderA <= 0) return 1;
            if ($orderB <= 0) return -1;
            if ($orderA !== $orderB) return $orderA <=> $orderB;
        }
        return poznoteCompareFolderNames($a, $b);
    }

    if ($mode === 'updated_desc' || $mode === 'created_desc') {
        return strcmp((string)($b['created'] ?? ''), (string)($a['created'] ?? ''))
            ?: poznoteCompareFolderNames($a, $b);
    }

    return poznoteCompareFolderNames($a, $b);
}

/**
 * @param array<string,mixed> $a
 * @param array<string,mixed> $b
 */
function poznoteCompareFolderNames(array $a, array $b): int
{
    return strnatcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? ''))
        ?: ((int)($a['id'] ?? 0) <=> (int)($b['id'] ?? 0));
}
