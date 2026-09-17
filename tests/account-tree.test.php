<?php
lib('account-tree');

test('folders nest under their parent and notes under their folder, in workspace order', function () {
    $tree = poznoteBuildAccountTree(
        [['name' => 'Team'], ['name' => 'Archive']],
        [
            ['id' => 1, 'name' => 'Projects', 'parent_id' => null, 'workspace' => 'Team'],
            ['id' => 2, 'name' => 'Alpha', 'parent_id' => 1, 'workspace' => 'Team'],
            ['id' => 3, 'name' => 'Old', 'parent_id' => null, 'workspace' => 'Archive'],
        ],
        [
            ['id' => 10, 'heading' => 'Kickoff', 'folder_id' => 2, 'workspace' => 'Team', 'type' => 'note'],
            ['id' => 11, 'heading' => 'Roadmap', 'folder_id' => 1, 'workspace' => 'Team', 'type' => 'note'],
            ['id' => 12, 'heading' => 'Loose', 'folder_id' => null, 'workspace' => 'Team', 'type' => 'tasklist'],
        ]
    );

    assertSame(['Team', 'Archive'], array_column($tree, 'name'));
    assertSame([['id' => 12, 'title' => 'Loose', 'type' => 'tasklist']], $tree[0]['notes']);
    assertSame('Projects', $tree[0]['folders'][0]['name']);
    assertSame('Roadmap', $tree[0]['folders'][0]['notes'][0]['title']);
    assertSame('Alpha', $tree[0]['folders'][0]['folders'][0]['name']);
    assertSame('Kickoff', $tree[0]['folders'][0]['folders'][0]['notes'][0]['title']);
    assertSame('Old', $tree[1]['folders'][0]['name']);
    assertSame([], $tree[1]['notes']);
});

test('orphan, cross-workspace and cyclic parents fall back to the workspace root', function () {
    $tree = poznoteBuildAccountTree(
        [['name' => 'A'], ['name' => 'B']],
        [
            ['id' => 1, 'name' => 'Orphan', 'parent_id' => 99, 'workspace' => 'A'],
            ['id' => 2, 'name' => 'Cross', 'parent_id' => 3, 'workspace' => 'A'],
            ['id' => 3, 'name' => 'Other', 'parent_id' => null, 'workspace' => 'B'],
            ['id' => 4, 'name' => 'Loop1', 'parent_id' => 5, 'workspace' => 'A'],
            ['id' => 5, 'name' => 'Loop2', 'parent_id' => 4, 'workspace' => 'A'],
        ],
        []
    );

    assertSame(['Cross', 'Loop1', 'Loop2', 'Orphan'], array_column($tree[0]['folders'], 'name'));
    assertSame(['Other'], array_column($tree[1]['folders'], 'name'));
});

test('a note or folder naming a missing workspace still shows up', function () {
    $tree = poznoteBuildAccountTree(
        [['name' => 'Main']],
        [['id' => 1, 'name' => 'F', 'parent_id' => null, 'workspace' => 'Gone']],
        [
            ['id' => 2, 'heading' => 'Note in gone folder', 'folder_id' => 42, 'workspace' => 'Gone'],
            ['id' => 3, 'heading' => 'No workspace at all', 'folder_id' => null, 'workspace' => ''],
        ]
    );

    assertSame(['Main', 'Gone'], array_column($tree, 'name'));
    assertSame('No workspace at all', $tree[0]['notes'][0]['title']);
    assertSame('F', $tree[1]['folders'][0]['name']);
    assertSame('Note in gone folder', $tree[1]['notes'][0]['title']);
});

test('hand-ordered folders come first, then names case-insensitively', function () {
    $tree = poznoteBuildAccountTree(
        [['name' => 'W']],
        [
            ['id' => 1, 'name' => 'zeta', 'parent_id' => null, 'workspace' => 'W', 'display_order' => 0],
            ['id' => 2, 'name' => 'Alpha', 'parent_id' => null, 'workspace' => 'W', 'display_order' => 0],
            ['id' => 3, 'name' => 'Pinned', 'parent_id' => null, 'workspace' => 'W', 'display_order' => 2],
            ['id' => 4, 'name' => 'First', 'parent_id' => null, 'workspace' => 'W', 'display_order' => 1],
        ],
        [
            ['id' => 5, 'heading' => 'b', 'folder_id' => null, 'workspace' => 'W'],
            ['id' => 6, 'heading' => 'A', 'folder_id' => null, 'workspace' => 'W'],
        ]
    );

    assertSame(['First', 'Pinned', 'Alpha', 'zeta'], array_column($tree[0]['folders'], 'name'));
    assertSame(['A', 'b'], array_column($tree[0]['notes'], 'title'));
});

test('notes follow the account sort setting, and a folder its own', function () {
    $folders = [
        ['id' => 1, 'name' => 'Own sort', 'parent_id' => null, 'workspace' => 'W', 'sort_setting' => 'alphabet'],
        ['id' => 2, 'name' => 'Default', 'parent_id' => null, 'workspace' => 'W', 'sort_setting' => ''],
    ];
    $notes = [];
    foreach ([1, 2, 0] as $folderId) {
        foreach ([['b', '2026-01-01', '2026-03-01', 0], ['a', '2026-02-01', '2026-01-01', 2], ['c', '2026-03-01', '2026-02-01', 1]] as $i => [$title, $created, $updated, $order]) {
            $notes[] = ['id' => $folderId * 10 + $i + 1, 'heading' => $title, 'folder_id' => $folderId ?: null, 'workspace' => 'W',
                'created' => $created, 'updated' => $updated, 'display_order' => $order];
        }
    }
    $titles = static function (array $tree): array {
        return [
            array_column($tree[0]['folders'][1]['notes'], 'title'),
            array_column($tree[0]['folders'][0]['notes'], 'title'),
            array_column($tree[0]['notes'], 'title'),
        ];
    };

    // [own-sort folder, default folder, root]
    assertSame([['a', 'b', 'c'], ['b', 'c', 'a'], ['b', 'c', 'a']], $titles(poznoteBuildAccountTree([['name' => 'W']], $folders, $notes, 'updated_desc')));
    assertSame([['a', 'b', 'c'], ['c', 'a', 'b'], ['c', 'a', 'b']], $titles(poznoteBuildAccountTree([['name' => 'W']], $folders, $notes, 'created_desc')));
    // manual: unplaced (order 0) first, then the saved positions
    assertSame([['a', 'b', 'c'], ['b', 'c', 'a'], ['b', 'c', 'a']], $titles(poznoteBuildAccountTree([['name' => 'W']], $folders, $notes, 'manual')));
    // sort keys never leave the builder
    assertSame(['id', 'title', 'type'], array_keys(poznoteBuildAccountTree([['name' => 'W']], $folders, $notes, 'manual')[0]['notes'][0]));
});
