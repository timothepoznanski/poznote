<?php
lib('note-paths');

// Issue #1738: a caller that knows where a note lives (its folder path and its
// title) had to turn that into an id first, with a listing and a client-side
// scan. These tests pin the resolver the path address goes through, against a
// real in-memory SQLite with the remove_accents() function db_connect.php
// registers, because a folder rule that reads right and matches nothing is the
// whole risk here.

/**
 * @param array<int, array{0:int,1:string,2:?int,3:string}> $folders id, name, parent_id, workspace
 * @param array<int, array{0:int,1:string,2:?int,3:string,4?:int}> $notes id, heading, folder_id, workspace, trash
 */
function notePathDb(array $folders, array $notes): PDO {
    $con = new Pdo\Sqlite('sqlite::memory:');
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->createFunction('remove_accents', fn($text) => poznoteFoldAccents((string)$text), 1);
    $con->exec('CREATE TABLE folders (id INTEGER PRIMARY KEY, name TEXT, parent_id INTEGER, workspace TEXT)');
    $con->exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, heading TEXT, folder_id INTEGER, workspace TEXT, trash INTEGER DEFAULT 0, updated TEXT)');

    $insertFolder = $con->prepare('INSERT INTO folders (id, name, parent_id, workspace) VALUES (?, ?, ?, ?)');
    foreach ($folders as $folder) {
        $insertFolder->execute($folder);
    }

    $insertNote = $con->prepare('INSERT INTO entries (id, heading, folder_id, workspace, trash, updated) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($notes as $note) {
        $insertNote->execute([
            $note[0], $note[1], $note[2], $note[3], $note[4] ?? 0,
            $note[5] ?? ('2026-11-0' . (($note[0] % 9) + 1) . ' 10:00:00'),
        ]);
    }

    return $con;
}

/**
 * Projects/Alpha and Projects/Beta in "Work", Archive/Alpha in "Perso",
 * plus a root folder named Alpha in "Work".
 */
function notePathFixture(): PDO {
    return notePathDb(
        [
            [1, 'Projects', null, 'Work'],
            [2, 'Alpha', 1, 'Work'],
            [3, 'Beta', 1, 'Work'],
            [4, 'Archive', null, 'Perso'],
            [5, 'Alpha', 4, 'Perso'],
            [6, 'Déjà vu', null, 'Work'],
        ],
        [
            [10, 'Status', 2, 'Work'],
            [11, 'Status', 3, 'Work'],
            [12, 'Roadmap', 2, 'Work'],
            [13, 'Inbox', null, 'Work'],
            [14, 'Status', 5, 'Perso'],
            [15, 'Rétrospective', 6, 'Work'],
            [16, 'Deleted status', 2, 'Work', 1],
        ]
    );
}

function notePathResolve(PDO $con, string $path, ?string $workspace = null): array {
    return poznoteResolveNotePath($con, $path, $workspace);
}

test('a path splits into its folder segments and its title', function () {
    assertSame(['folder' => ['Projects', 'Alpha'], 'title' => 'Status'], poznoteSplitNotePath('Projects/Alpha/Status'));
    assertSame(['folder' => [], 'title' => 'Status'], poznoteSplitNotePath('Status'));
    assertSame(['folder' => ['Projects'], 'title' => 'Status'], poznoteSplitNotePath(' /Projects//Status/ '));
    assertSame(null, poznoteSplitNotePath('   '));
    assertSame(null, poznoteSplitNotePath('///'));
});

test('an empty path is refused rather than read as "any note"', function () {
    $outcome = notePathResolve(notePathFixture(), '  /  ');
    assertSame('empty_path', $outcome['status']);
});

// The reported need, in one test.
test('a full path resolves to the one note it addresses', function () {
    $outcome = notePathResolve(notePathFixture(), 'Projects/Alpha/Status');
    assertSame('ok', $outcome['status']);
    assertSame(10, $outcome['note']['id']);
    assertSame('Projects/Alpha', $outcome['note']['folder']);
    assertSame('Work', $outcome['note']['workspace']);
    assertSame('Projects/Alpha/Status', $outcome['note']['path']);
});

test('the title has to match in full, as a [[link]] does', function () {
    $con = notePathFixture();
    assertSame('not_found', notePathResolve($con, 'Projects/Alpha/Stat')['status']);
    assertSame('not_found', notePathResolve($con, 'Projects/Alpha/Status report')['status']);
});

test('case and accents are ignored on both halves of the path', function () {
    $con = notePathFixture();
    assertSame(10, notePathResolve($con, 'projects/ALPHA/status')['note']['id']);
    assertSame(15, notePathResolve($con, 'Deja vu/Retrospective')['note']['id']);
    assertSame(15, notePathResolve($con, 'Déjà vu/Rétrospective')['note']['id']);
});

test('a bare folder name reaches a folder at any depth (#1374)', function () {
    $con = notePathFixture();
    assertSame(12, notePathResolve($con, 'Alpha/Roadmap')['note']['id']);
});

test('a folder path is walked from the root, so a middle segment is not enough', function () {
    $con = notePathFixture();
    assertSame('not_found', notePathResolve($con, 'Alpha/Projects/Roadmap')['status']);
    assertSame(12, notePathResolve($con, 'Projects/Alpha/Roadmap')['note']['id']);
});

test('a title alone addresses the note wherever it sits', function () {
    $con = notePathFixture();
    assertSame(12, notePathResolve($con, 'Roadmap')['note']['id']);
    assertSame(13, notePathResolve($con, 'Inbox')['note']['id']);
});

test('Default means the root of the workspace, not a folder of that name', function () {
    $con = notePathFixture();
    assertSame(13, notePathResolve($con, 'Default/Inbox')['note']['id']);
    assertSame('not_found', notePathResolve($con, 'Default/Roadmap')['status']);
});

// The point of the whole file: no silent first match, unlike findNoteIdByTitle().
test('a title several notes carry is refused, with every candidate', function () {
    $outcome = notePathResolve(notePathFixture(), 'Status');
    assertSame('ambiguous', $outcome['status']);
    assertSame(3, $outcome['total']);
    // Most recently updated first, so the one a caller probably meant is on top.
    assertSame([14, 11, 10], array_column($outcome['candidates'], 'id'));
    assertSame(
        ['Archive/Alpha/Status', 'Projects/Beta/Status', 'Projects/Alpha/Status'],
        array_column($outcome['candidates'], 'path')
    );
});

test('a bare folder name that two folders answer to is refused the same way', function () {
    $outcome = notePathResolve(notePathFixture(), 'Alpha/Status');
    assertSame('ambiguous', $outcome['status']);
    assertSame([14, 10], array_column($outcome['candidates'], 'id'));
    assertSame(['Perso', 'Work'], array_column($outcome['candidates'], 'workspace'));
});

test('naming the workspace settles a path that is ambiguous without it', function () {
    $con = notePathFixture();
    assertSame(10, notePathResolve($con, 'Alpha/Status', 'Work')['note']['id']);
    assertSame(14, notePathResolve($con, 'Alpha/Status', 'Perso')['note']['id']);
    assertSame('not_found', notePathResolve($con, 'Projects/Alpha/Status', 'Perso')['status']);
});

test('a folder at the root of the workspace wins over the same name deeper down', function () {
    // "Alpha" names both a root folder and Projects/Alpha in Work, which is
    // how resolveFolderPathToId() has always read a bare name.
    $con = notePathDb(
        [
            [1, 'Projects', null, 'Work'],
            [2, 'Alpha', 1, 'Work'],
            [3, 'Alpha', null, 'Work'],
        ],
        [
            [10, 'Status', 2, 'Work'],
            [11, 'Status', 3, 'Work'],
        ]
    );
    $outcome = notePathResolve($con, 'Alpha/Status');
    assertSame('ok', $outcome['status']);
    assertSame(11, $outcome['note']['id']);
    assertSame('Alpha', $outcome['note']['folder']);
});

test('a trashed note does not answer to a path', function () {
    $con = notePathFixture();
    assertSame('not_found', notePathResolve($con, 'Projects/Alpha/Deleted status')['status']);
    assertSame('not_found', notePathResolve($con, 'Deleted status')['status']);
});

test('a note at the root is addressed with its title alone', function () {
    $con = notePathFixture();
    $outcome = notePathResolve($con, 'Inbox');
    assertSame(null, $outcome['note']['folder']);
    assertSame('Inbox', $outcome['note']['path']);
});

test('the candidate list is capped, so a pathological title still answers', function () {
    $notes = [];
    $folders = [];
    for ($i = 1; $i <= 30; $i++) {
        $folders[] = [$i, 'F' . $i, null, 'Work'];
        $notes[] = [100 + $i, 'Same title', $i, 'Work', 0, '2026-11-01 10:00:00'];
    }
    $outcome = notePathResolve(notePathDb($folders, $notes), 'Same title');
    assertSame('ambiguous', $outcome['status']);
    assertSame(30, $outcome['total']);
    assertSame(POZNOTE_NOTE_PATH_MAX_CANDIDATES, count($outcome['candidates']));
});

test('a segment that is just "0" is a segment, not an empty one', function () {
    // array_filter() without a callback would have dropped "0" from the path.
    $con = notePathDb(
        [[1, '0', null, 'Work']],
        [[10, '0', 1, 'Work'], [11, 'Other', null, 'Work']]
    );
    $outcome = notePathResolve($con, '0/0');
    assertSame('ok', $outcome['status']);
    assertSame(10, $outcome['note']['id']);
    assertSame('0', $outcome['note']['folder']);
});

test('a note whose own title holds a slash is out of reach, by design', function () {
    // The separator is not escapable: "Projects/2026/11/06" is the folder
    // Projects/2026/11 and the title "06". Those notes stay addressed by id,
    // and the point of the test is that it fails rather than matching
    // something else.
    $con = notePathDb(
        [[1, 'Projects', null, 'Work'], [2, '2026', 1, 'Work'], [3, '11', 2, 'Work']],
        [[10, '2026/11/06', 1, 'Work'], [11, '06', 3, 'Work']]
    );
    assertSame(11, notePathResolve($con, 'Projects/2026/11/06')['note']['id']);
    assertSame('not_found', notePathResolve($con, '2026/11/06')['status']);
});

test('a path of a thousand segments is refused, not followed', function () {
    $con = notePathFixture();
    $deep = implode('/', array_fill(0, 999, 'x')) . '/Status';
    assertSame('not_found', notePathResolve($con, $deep)['status']);
});

test('a title is compared as text, never as a LIKE pattern', function () {
    $con = notePathDb([], [[10, 'Status', null, 'Work'], [11, '100%_sure', null, 'Work']]);
    assertSame('not_found', notePathResolve($con, '%')['status']);
    assertSame('not_found', notePathResolve($con, 'Stat_s')['status']);
    assertSame(11, notePathResolve($con, '100%_sure')['note']['id']);
});
