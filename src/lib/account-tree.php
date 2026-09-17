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

/**
 * Nest workspaces, folders and notes.
 *
 * @param array $workspaces rows with 'name', in display order
 * @param array $folders    rows with 'id', 'name', 'parent_id', 'workspace',
 *                          optional 'display_order'
 * @param array $notes      rows with 'id', 'heading', 'folder_id',
 *                          'workspace', optional 'type'
 * @return array list of ['name', 'folders' => [...], 'notes' => [...]]; a
 *               folder is ['id', 'name', 'folders', 'notes'], a note is
 *               ['id', 'title', 'type']
 */
function poznoteBuildAccountTree(array $workspaces, array $folders, array $notes): array
{
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
        ];
        $folderId = isset($row['folder_id']) && $row['folder_id'] !== null && $row['folder_id'] !== '' ? (int)$row['folder_id'] : 0;
        if ($folderId > 0 && isset($byId[$folderId])) {
            $notesOfFolder[$folderId][] = $note;
        } else {
            $workspace = $ensureWorkspace((string)($row['workspace'] ?? ''));
            $tree[$workspace]['notes'][] = $note;
        }
    }

    // Same order as list_folders.php: a hand-set position first, then the name.
    $sortFolders = static function (array $ids) use ($byId): array {
        usort($ids, static function (int $a, int $b) use ($byId): int {
            $oa = $byId[$a]['display_order'];
            $ob = $byId[$b]['display_order'];
            if (($oa > 0) !== ($ob > 0)) {
                return $oa > 0 ? -1 : 1;
            }
            if ($oa !== $ob) {
                return $oa <=> $ob;
            }
            return strcasecmp($byId[$a]['name'], $byId[$b]['name']);
        });
        return $ids;
    };
    $sortNotes = static function (array $list): array {
        usort($list, static function (array $a, array $b): int {
            return strcasecmp($a['title'], $b['title']);
        });
        return $list;
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
