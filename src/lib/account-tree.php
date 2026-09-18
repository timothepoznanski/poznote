<?php
/**
 * Read-only outline of another account's notes.
 *
 * The notes list (notes_list.php) can show, under the active account's tree,
 * a block for every other account the signed-in person may open. Clicking a
 * note there switches to that account and opens the note. The block is a
 * browsing aid only: nothing in it is editable, dragged or renamed, so the
 * markup is deliberately not the main tree's.
 *
 * This file turns the three flat tables of such an account into the nested
 * structure account_tree.php sends and js/other-accounts.js renders. It is a
 * pure function so tests/account-tree.test.php can cover the edge cases
 * (orphan folders, folder cycles, notes whose workspace row is gone) without
 * a database.
 */

require_once __DIR__ . '/note-sort.php';

/**
 * Nest workspaces, folders and notes.
 *
 * Folders and notes come out in the order the account's own tree shows them
 * (folders_display.php): its note_list_sort setting, one mode for the whole
 * tree since #1442. Switching accounts then turns an outline into the full
 * tree, and back, without anything changing place.
 *
 * @param array $workspaces rows with 'name', in display order
 * @param array $folders    rows with 'id', 'name', 'parent_id', 'workspace',
 *                          optional 'created', 'display_order'
 * @param array $notes      rows with 'id', 'heading', 'folder_id',
 *                          'workspace', optional 'type', 'created',
 *                          'updated', 'display_order'
 * @param string $noteListSort the account's note_list_sort setting, see
 *                          src/lib/note-sort.php; anything else reads as the
 *                          default mode
 * @return array list of ['name', 'folders' => [...], 'notes' => [...]]; a
 *               folder is ['id', 'name', 'folders', 'notes'], a note is
 *               ['id', 'title', 'type']
 */
function poznoteBuildAccountTree(array $workspaces, array $folders, array $notes, string $noteListSort = 'heading_asc'): array
{
    $sortMode = poznoteNormalizeNoteSort($noteListSort);

    $tree = [];
    $order = [];
    foreach ($workspaces as $row) {
        $name = (string)($row['name'] ?? '');
        if ($name === '' || isset($tree[$name])) {
            continue;
        }
        $tree[$name] = ['name' => $name, 'folders' => [], 'notes' => []];
        $order[] = $name;
    }

    // A folder or a note may name a workspace whose row is gone (an old
    // rename, an import): it is still listed rather than silently dropped.
    $ensureWorkspace = static function (string $name) use (&$tree, &$order): string {
        if ($name === '') {
            $name = $order[0] ?? 'Poznote';
        }
        if (!isset($tree[$name])) {
            $tree[$name] = ['name' => $name, 'folders' => [], 'notes' => []];
            $order[] = $name;
        }
        return $name;
    };

    $byId = [];
    foreach ($folders as $row) {
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $byId[$id] = [
            'id' => $id,
            'name' => (string)($row['name'] ?? ''),
            'parent_id' => isset($row['parent_id']) && $row['parent_id'] !== null && $row['parent_id'] !== '' ? (int)$row['parent_id'] : 0,
            'workspace' => $ensureWorkspace((string)($row['workspace'] ?? '')),
            'created' => (string)($row['created'] ?? ''),
            'display_order' => (int)($row['display_order'] ?? 0),
            'folders' => [],
            'notes' => [],
        ];
    }

    // Parent resolution: a parent that does not exist, sits in another
    // workspace or closes a cycle makes the folder a root of its workspace.
    $parentOf = [];
    foreach ($byId as $id => $folder) {
        $parent = $folder['parent_id'];
        if ($parent <= 0 || $parent === $id || !isset($byId[$parent]) || $byId[$parent]['workspace'] !== $folder['workspace']) {
            $parentOf[$id] = 0;
            continue;
        }
        $seen = [$id => true];
        $cursor = $parent;
        $cyclic = false;
        while ($cursor > 0 && isset($byId[$cursor])) {
            if (isset($seen[$cursor])) {
                $cyclic = true;
                break;
            }
            $seen[$cursor] = true;
            $cursor = $byId[$cursor]['parent_id'];
        }
        $parentOf[$id] = $cyclic ? 0 : $parent;
    }

    $childrenOf = [];
    foreach ($parentOf as $id => $parent) {
        $childrenOf[$parent][] = $id;
    }

    $notesOfFolder = [];
    foreach ($notes as $row) {
        $id = (int)($row['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $note = [
            'id' => $id,
            'title' => (string)($row['heading'] ?? ''),
            'type' => (string)($row['type'] ?? 'note'),
            // Sort keys, dropped before the tree leaves this function.
            'heading' => (string)($row['heading'] ?? ''),
            'created' => (string)($row['created'] ?? ''),
            'updated' => (string)($row['updated'] ?? ''),
            'display_order' => (int)($row['display_order'] ?? 0),
        ];
        $folderId = isset($row['folder_id']) && $row['folder_id'] !== null && $row['folder_id'] !== '' ? (int)$row['folder_id'] : 0;
        if ($folderId > 0 && isset($byId[$folderId])) {
            $notesOfFolder[$folderId][] = $note;
        } else {
            $workspace = $ensureWorkspace((string)($row['workspace'] ?? ''));
            $tree[$workspace]['notes'][] = $note;
        }
    }

    // Both comparators come from src/lib/note-sort.php, the ones the account's
    // own sidebar sorts with. The rows are adapted to the column names those
    // functions expect ('heading', 'updated', 'display_order').
    $sortFolders = static function (array $ids) use ($byId, $sortMode): array {
        usort($ids, static function (int $a, int $b) use ($byId, $sortMode): int {
            return poznoteCompareFolders($sortMode, $byId[$a], $byId[$b]);
        });
        return $ids;
    };
    $sortNotes = static function (array $list) use ($sortMode): array {
        usort($list, static function (array $a, array $b) use ($sortMode): int {
            return poznoteCompareNotes($sortMode, $a, $b);
        });
        return array_map(static function (array $note): array {
            return ['id' => $note['id'], 'title' => $note['title'], 'type' => $note['type']];
        }, $list);
    };

    $build = static function (int $id) use (&$build, $byId, $childrenOf, $notesOfFolder, $sortFolders, $sortNotes): array {
        $node = ['id' => $id, 'name' => $byId[$id]['name'], 'folders' => [], 'notes' => []];
        foreach ($sortFolders($childrenOf[$id] ?? []) as $childId) {
            $node['folders'][] = $build($childId);
        }
        $node['notes'] = $sortNotes($notesOfFolder[$id] ?? []);
        return $node;
    };

    foreach ($sortFolders($childrenOf[0] ?? []) as $rootId) {
        $tree[$byId[$rootId]['workspace']]['folders'][] = $build($rootId);
    }

    $out = [];
    foreach ($order as $name) {
        $tree[$name]['notes'] = $sortNotes($tree[$name]['notes']);
        $out[] = $tree[$name];
    }
    return $out;
}
