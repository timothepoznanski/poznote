<?php
lib('note-sort');

/** Sorts rows with one mode and returns the headings, as the sidebar would. */
function sortedHeadings(string $mode, array $rows): array
{
    usort($rows, function ($a, $b) use ($mode) {
        return poznoteCompareNotes($mode, $a, $b);
    });
    return array_column($rows, 'heading');
}

/** Same for folders. */
function sortedFolderNames(string $mode, array $rows): array
{
    usort($rows, function ($a, $b) use ($mode) {
        return poznoteCompareFolders($mode, $a, $b);
    });
    return array_column($rows, 'name');
}

test('the button walks every mode and comes back to the first', function () {
    $modes = poznoteNoteSortModes();
    assertSame(['heading_asc', 'updated_desc', 'created_desc', 'type_asc', 'manual'], $modes);

    $seen = [];
    $mode = $modes[0];
    for ($i = 0; $i < count($modes); $i++) {
        $seen[] = $mode;
        $mode = poznoteNextNoteSort($mode);
    }
    assertSame($modes, $seen);
    assertSame('heading_asc', $mode, 'the cycle closes');
});

test('an unknown, empty or non-string value reads as the default mode', function () {
    assertSame('updated_desc', POZNOTE_NOTE_SORT_DEFAULT);
    assertSame('updated_desc', poznoteNormalizeNoteSort('alphabet'));
    assertSame('updated_desc', poznoteNormalizeNoteSort(''));
    assertSame('updated_desc', poznoteNormalizeNoteSort(null));
    assertSame('updated_desc', poznoteNormalizeNoteSort(false));
    assertSame('manual', poznoteNormalizeNoteSort('  manual  '));
    // An unknown mode still walks to the mode after the default
    assertSame('created_desc', poznoteNextNoteSort('alphabet'));
});

test('every mode has an icon and a label', function () {
    foreach (poznoteNoteSortModes() as $mode) {
        assertTrue(strpos(poznoteNoteSortIcon($mode), 'lucide-') === 0, $mode . ' icon');
        [$key, $fallback] = poznoteNoteSortLabel($mode);
        assertTrue(strpos($key, 'sort.modes.') === 0, $mode . ' label key');
        assertTrue($fallback !== '', $mode . ' label fallback');
    }
});

test('notes: name is natural and case-insensitive, dates are newest first', function () {
    $rows = [
        ['id' => 1, 'heading' => 'Note 10', 'created' => '2026-01-03', 'updated' => '2026-02-01'],
        ['id' => 2, 'heading' => 'note 9', 'created' => '2026-01-02', 'updated' => '2026-02-03'],
        ['id' => 3, 'heading' => 'Alpha', 'created' => '2026-01-01', 'updated' => '2026-02-02'],
    ];

    assertSame(['Alpha', 'note 9', 'Note 10'], sortedHeadings('heading_asc', $rows));
    assertSame(['note 9', 'Alpha', 'Note 10'], sortedHeadings('updated_desc', $rows));
    assertSame(['Note 10', 'note 9', 'Alpha'], sortedHeadings('created_desc', $rows));
});

test('notes: the type mode groups by kind, unknown kinds last', function () {
    $rows = [
        ['id' => 1, 'heading' => 'shortcut', 'type' => 'linked'],
        ['id' => 2, 'heading' => 'zeta', 'type' => 'note'],
        ['id' => 3, 'heading' => 'later', 'type' => 'somethingelse'],
        ['id' => 4, 'heading' => 'drawing', 'type' => 'excalidraw'],
        ['id' => 5, 'heading' => 'alpha', 'type' => ''],
        ['id' => 6, 'heading' => 'list', 'type' => 'tasklist'],
        ['id' => 7, 'heading' => 'doc', 'type' => 'markdown'],
    ];

    // An empty type is an HTML note, so 'alpha' groups with 'zeta'
    assertSame(
        ['alpha', 'zeta', 'doc', 'list', 'drawing', 'shortcut', 'later'],
        sortedHeadings('type_asc', $rows)
    );
});

test('notes: Custom shows what was never placed first, newest change first', function () {
    $rows = [
        ['id' => 1, 'heading' => 'placed second', 'updated' => '2026-01-01', 'display_order' => 2],
        ['id' => 2, 'heading' => 'fresh', 'updated' => '2026-03-01', 'display_order' => 0],
        ['id' => 3, 'heading' => 'placed first', 'updated' => '2026-01-02', 'display_order' => 1],
        ['id' => 4, 'heading' => 'older, unplaced', 'updated' => '2026-02-01', 'display_order' => 0],
    ];

    assertSame(
        ['fresh', 'older, unplaced', 'placed first', 'placed second'],
        sortedHeadings('manual', $rows)
    );
});

test('notes: equal keys break on the id, so a list never shuffles', function () {
    $rows = [
        ['id' => 7, 'heading' => 'same', 'created' => '2026-01-01', 'updated' => '2026-01-01', 'type' => 'note'],
        ['id' => 3, 'heading' => 'same', 'created' => '2026-01-01', 'updated' => '2026-01-01', 'type' => 'note'],
    ];

    foreach (poznoteNoteSortModes() as $mode) {
        $first = sortedHeadings($mode, $rows);
        assertSame($first, sortedHeadings($mode, array_reverse($rows)), $mode . ' is total');
    }
});

test('folders: only Custom reads the hand-set positions', function () {
    $rows = [
        ['id' => 1, 'name' => 'zeta', 'created' => '2026-01-03', 'display_order' => 0],
        ['id' => 2, 'name' => 'Alpha', 'created' => '2026-01-01', 'display_order' => 0],
        ['id' => 3, 'name' => 'Pinned', 'created' => '2026-01-02', 'display_order' => 2],
        ['id' => 4, 'name' => 'First', 'created' => '2026-01-04', 'display_order' => 1],
    ];

    assertSame(['Alpha', 'First', 'Pinned', 'zeta'], sortedFolderNames('heading_asc', $rows));
    assertSame(['Alpha', 'First', 'Pinned', 'zeta'], sortedFolderNames('type_asc', $rows));
    // No 'updated' column on a folder: both date modes fall back on 'created'
    assertSame(['First', 'zeta', 'Pinned', 'Alpha'], sortedFolderNames('created_desc', $rows));
    assertSame(['First', 'zeta', 'Pinned', 'Alpha'], sortedFolderNames('updated_desc', $rows));
    assertSame(['First', 'Pinned', 'Alpha', 'zeta'], sortedFolderNames('manual', $rows));
});

test('a mode change never touches the saved positions', function () {
    $rows = [
        ['id' => 1, 'heading' => 'b', 'updated' => '2026-01-01', 'display_order' => 2],
        ['id' => 2, 'heading' => 'a', 'updated' => '2026-01-02', 'display_order' => 1],
    ];
    $arranged = sortedHeadings('manual', $rows);

    // Leaving Custom for any other mode and coming back gives the same list:
    // the comparators are pure, the display_order values are untouched.
    foreach (poznoteNoteSortModes() as $mode) {
        sortedHeadings($mode, $rows);
    }
    assertSame($arranged, sortedHeadings('manual', $rows));
    assertSame(['a', 'b'], $arranged, 'display_order 1 then 2, not the newest change');
});

test('the dashboard shares the placed-order rule on its own column', function () {
    $rows = [
        ['id' => 1, 'heading' => 'second', 'updated' => '2026-01-01', 'dashboard_order' => 2],
        ['id' => 2, 'heading' => 'first', 'updated' => '2026-01-02', 'dashboard_order' => 1],
        ['id' => 3, 'heading' => 'unplaced', 'updated' => '2026-03-01', 'dashboard_order' => 0],
    ];
    usort($rows, function ($a, $b) {
        return poznoteComparePlacedOrder($a, $b, 'dashboard_order');
    });

    assertSame(['unplaced', 'first', 'second'], array_column($rows, 'heading'));
});
