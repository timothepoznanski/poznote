<?php
lib('workspace-scope');

// A session opened on a shared workspace is kept inside it by checking every
// note or folder id a request carries. That only works if this module and the
// handlers read the same request: the handlers cast with intval() or accept
// what is_numeric() does, so an id spelled any other way than plain digits
// must get the request refused, never skipped. These cases pin both halves:
// what the web app really sends keeps passing, and the lenient spellings a
// handler would still resolve to a row do not.

/** Shorthand: ids of a request that only has a path. */
function scopeIdsOfPath(string $path): ?array
{
    return poznoteScopeRequestIds($path, [], [], [], 'index.php');
}

test('a plain id in an API path is collected, as a note or as a folder', function () {
    assertSame(['notes' => [12], 'folders' => []], scopeIdsOfPath('/api/v1/notes/12'));
    assertSame(['notes' => [12], 'folders' => []], scopeIdsOfPath('/api/v1/notes/12/tasks/abc/subtasks/def'));
    assertSame(['notes' => [], 'folders' => [7]], scopeIdsOfPath('/api/v1/folders/7/move'));
    assertSame(['notes' => [3], 'folders' => []], scopeIdsOfPath('/api/v1/trash/3'));
    assertSame(['notes' => [5], 'folders' => []], scopeIdsOfPath('/api/v1/notes/0005'), 'leading zeros are still that note');
});

test('the fixed routes of the API name no row', function () {
    $routes = [
        '/api/v1/notes', '/api/v1/notes/', '/api/v1/notes/search', '/api/v1/notes/search/ids',
        '/api/v1/notes/resolve', '/api/v1/notes/reorder', '/api/v1/notes/templates',
        '/api/v1/notes/with-attachments', '/api/v1/notes/favorites/clear',
        '/api/v1/folders', '/api/v1/folders/counts', '/api/v1/folders/move-files',
        '/api/v1/folders/reorder', '/api/v1/folders/restore', '/api/v1/folders/suggested',
        '/api/v1/reminders/4/dismiss', '/api/v1/tags', '/index.php', '/kanban_content.php',
    ];
    foreach ($routes as $route) {
        assertSame(['notes' => [], 'folders' => []], scopeIdsOfPath($route), $route);
    }
});

test('a path segment a handler could cast to another id is refused', function () {
    // (int)"1e1" is 10 and (int)"+12" is 12: the handler would act on a row
    // this check never looked at.
    foreach (['12abc', '+12', '-12', '1e1', '12.0', '%2012', ' 12', '12%20', '0x1A', '.5', '12,13'] as $segment) {
        assertSame(null, scopeIdsOfPath('/api/v1/notes/' . $segment), 'notes/' . $segment);
        assertSame(null, scopeIdsOfPath('/api/v1/folders/' . $segment . '/move'), 'folders/' . $segment);
    }
});

test('ids in parameters are collected from the query, the form and the JSON body', function () {
    $ids = poznoteScopeRequestIds(
        '/kanban_content.php',
        ['folder_id' => '4', 'workspace' => 'Team'],
        ['note_id' => '9'],
        ['target_note_id' => 21, 'new_parent_folder_id' => 6, 'note_ids' => [1, '2', 3], 'folder_ids' => '8,9'],
        'kanban_content.php'
    );
    assertSame(['notes' => [9, 1, 2, 3, 21], 'folders' => [4, 8, 9, 6]], $ids);
});

test('what the web app sends for "no folder" and "no note" passes', function () {
    $ids = poznoteScopeRequestIds('/api/v1/notes/12/folder', ['folder_id' => ''], ['parent_id' => '0'], [
        'folder_id' => null,
        'new_parent_folder_id' => null,
        'parent_id' => 0,
        'linked_note_id' => false,
        'note_ids' => [],
        'folderId' => 'root',
        'target_folder_id' => 'favorites',
    ], 'index.php');
    assertSame(['notes' => [12], 'folders' => []], $ids);
});

test('a parameter that is not a plain number but reads as one is refused', function () {
    foreach (['12abc', '+12', '-3', '1e1', '12.0', "\f12", '0.5e1'] as $value) {
        assertSame(null, poznoteScopeRequestIds('/excalidraw_editor.php', ['note_id' => $value], [], [], 'excalidraw_editor.php'), 'note_id=' . $value);
        assertSame(null, poznoteScopeRequestIds('/kanban_content.php', ['folder_id' => $value], [], [], 'kanban_content.php'), 'folder_id=' . $value);
        assertSame(null, poznoteScopeRequestIds('/api/v1/notes/1/attachments/a/move', [], [], ['target_note_id' => $value], 'index.php'), 'body target_note_id=' . $value);
    }
    assertSame(null, poznoteScopeRequestIds('/x.php', [], [], ['target_note_id' => 12.5], 'x.php'), 'a JSON float');
    assertSame(null, poznoteScopeRequestIds('/x.php', [], [], ['note_ids' => [1, '2x']], 'x.php'), 'one bad entry in a list');
    assertSame(null, poznoteScopeRequestIds('/x.php', [], [], ['note_ids' => '1,+2'], 'x.php'), 'one bad entry in a comma list');
});

test('a list where one id is expected is refused, a list of lists too', function () {
    // intval() of a non-empty array is 1
    assertSame(null, poznoteScopeRequestIds('/x.php', ['note_id' => ['5', '6']], [], [], 'x.php'));
    assertSame(null, poznoteScopeRequestIds('/x.php', [], [], ['folder_id' => [4]], 'x.php'));
    assertSame(null, poznoteScopeRequestIds('/x.php', [], [], ['note_ids' => [[1]]], 'x.php'));
});

test('the note parameter of index.php may hold something that is not an id', function () {
    // index.php filters on the workspace itself, and the value can be a
    // title: a plain number is still checked, anything else is its business.
    assertSame(['notes' => [14], 'folders' => []], poznoteScopeRequestIds('/index.php', ['note' => '14'], [], [], 'index.php'));
    assertSame(['notes' => [], 'folders' => []], poznoteScopeRequestIds('/index.php', ['note' => '2024 goals'], [], [], 'index.php'));
    assertSame(['notes' => [], 'folders' => []], poznoteScopeRequestIds('/index.php', ['note' => ['a']], [], [], 'index.php'));
    assertSame(['notes' => [3], 'folders' => []], poznoteScopeRequestIds('/index.php', ['select_linked_note' => '3'], [], [], 'index.php'));
});

test('the export scripts name their note "id", the others do not', function () {
    assertSame(['notes' => [8], 'folders' => []], poznoteScopeRequestIds('/api_export_note.php', ['id' => '8'], [], [], 'api_export_note.php'));
    assertSame(['notes' => [8], 'folders' => []], poznoteScopeRequestIds('/api_download_note.php', ['id' => '8'], [], [], 'api_download_note.php'));
    assertSame(null, poznoteScopeRequestIds('/api_export_note.php', ['id' => '8abc'], [], [], 'api_export_note.php'));
    assertSame(['notes' => [], 'folders' => []], poznoteScopeRequestIds('/other.php', ['id' => '8abc'], [], [], 'other.php'));
});

test('the same id named twice is checked once', function () {
    $ids = poznoteScopeRequestIds('/api/v1/notes/5', ['note_id' => '5'], [], ['note_id' => 5, 'folder_id' => 2, 'parent_id' => '2'], 'index.php');
    assertSame(['notes' => [5], 'folders' => [2]], $ids);
});
