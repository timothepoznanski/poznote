<?php
lib('folders');

// Issue #1374: create_note(folder: "08") used to create a second, root-level
// "08" even though the workspace already held Diary/2026/08. A bare name is
// how an agent refers to a folder it saw in a listing, so it has to reach the
// folder that exists, and say so when the name reaches several.

function folderFixture(): PDO
{
    $con = new PDO('sqlite::memory:');
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->exec('CREATE TABLE folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT NOT NULL,
        parent_id INTEGER,
        created TEXT
    )');

    $insert = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
    $add = function (string $name, ?int $parent, string $workspace = 'Poznote') use ($con, $insert): int {
        $insert->execute([$name, $workspace, $parent]);
        return (int) $con->lastInsertId();
    };

    $diary = $add('Diary', null);
    $y2026 = $add('2026', $diary);
    $add('08', $y2026);
    $add('Projects', null);

    return $con;
}

test('a bare name reaches the nested folder that carries it', function () {
    $con = folderFixture();
    assertSame(3, resolveFolderPathToId('Poznote', '08', false, $con));
});

test('a bare name does not create a duplicate at the root', function () {
    $con = folderFixture();
    assertSame(3, resolveFolderPathToId('Poznote', '08', true, $con));
    assertSame(4, (int) $con->query('SELECT COUNT(*) FROM folders')->fetchColumn());
});

test('a root folder still wins over a nested namesake', function () {
    $con = folderFixture();
    $con->exec("INSERT INTO folders (name, workspace, parent_id) VALUES ('08', 'Poznote', NULL)");
    assertSame(5, resolveFolderPathToId('Poznote', '08', false, $con));
});

test('an ambiguous bare name resolves to nothing rather than a guess', function () {
    $con = folderFixture();
    $con->exec("INSERT INTO folders (name, workspace, parent_id) VALUES ('Archive', 'Poznote', NULL)");
    $archiveId = (int) $con->lastInsertId();
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id) VALUES ('08', 'Poznote', ?)");
    $stmt->execute([$archiveId]);

    assertSame(null, resolveFolderPathToId('Poznote', '08', false, $con));
});

test('a full path still resolves segment by segment', function () {
    $con = folderFixture();
    assertSame(3, resolveFolderPathToId('Poznote', 'Diary/2026/08', false, $con));
    assertSame(null, resolveFolderPathToId('Poznote', 'Diary/2025/08', false, $con));
});

test('missing segments of a path are created on demand', function () {
    $con = folderFixture();
    $id = resolveFolderPathToId('Poznote', 'Diary/2026/09', true, $con);
    assertSame(5, $id);
    $stmt = $con->prepare('SELECT parent_id FROM folders WHERE id = ?');
    $stmt->execute([$id]);
    assertSame(2, (int) $stmt->fetchColumn());
});

test('another workspace is never reached by a bare name', function () {
    $con = folderFixture();
    assertSame(null, resolveFolderPathToId('Other', '08', false, $con));
});

test('every folder carrying a name is listed with its path', function () {
    $con = folderFixture();
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id) VALUES ('Archive', 'Poznote', NULL)");
    $stmt->execute();
    $archiveId = (int) $con->lastInsertId();
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id) VALUES ('08', 'Poznote', ?)");
    $stmt->execute([$archiveId]);

    $matches = poznoteFindFoldersNamed('Poznote', '08', $con);
    assertSame(2, count($matches));
    assertSame('Archive/08', $matches[0]['path']);
    assertSame('Diary/2026/08', $matches[1]['path']);
});

test('a name no folder carries matches nothing', function () {
    assertSame([], poznoteFindFoldersNamed('Poznote', 'Nope', folderFixture()));
    assertSame([], poznoteFindFoldersNamed('Poznote', '  ', folderFixture()));
});
