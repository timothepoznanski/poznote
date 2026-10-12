<?php
lib('i18n', 'note-titles');

// Same bug class as i18n.test.php: these two functions glob src/i18n/*.json to
// learn every language's default note title. When the path broke they silently
// fell back to English alone, and a note called "Nouvelle note" stopped being
// treated as untitled - its title showed as real text instead of a placeholder.

test('the default titles cover every shipped language, not just English', function () {
    $titles = getDefaultNoteTitles();
    $expected = count(poznoteSupportedLanguages());

    if (count($titles) < $expected - 1) {
        fail('getDefaultNoteTitles() returned ' . count($titles) . ' titles ('
            . implode(', ', $titles) . '), expected one per shipped language');
    }
    assertTrue(in_array('New note', $titles, true), 'English default missing');
    assertTrue(in_array('Nouvelle note', $titles, true), 'French default missing');
});

test('a localized default title is recognised, with or without a suffix', function () {
    assertSame('Nouvelle note', matchDefaultNoteTitle('Nouvelle note')['title']);
    assertSame('3', matchDefaultNoteTitle('Nouvelle note (3)')['number']);
    assertSame(null, matchDefaultNoteTitle('New note')['number']);
});

test('a title the user chose is left alone', function () {
    assertSame(null, matchDefaultNoteTitle('Nouvelle note de frais'));
    assertSame(null, matchDefaultNoteTitle('Courses'));
    assertSame(null, matchDefaultNoteTitle(''));
});

// #1614: a [[Paris]] reference opened "Weekend in Paris", the most recently
// updated note whose title contained the text. A reference names one note.

function noteTitleLookupDb(array $notes): PDO {
    $con = new PDO('sqlite::memory:');
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->sqliteCreateFunction('remove_accents', function ($text) {
        return poznoteFoldAccents((string)$text);
    }, 1);
    $con->exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, heading TEXT, workspace TEXT, trash INTEGER DEFAULT 0, updated TEXT)');
    $insert = $con->prepare('INSERT INTO entries (id, heading, workspace, trash, updated) VALUES (?, ?, ?, ?, ?)');
    foreach ($notes as $note) {
        $insert->execute($note);
    }
    return $con;
}

test('a title resolves to the note called that way, not to a more recent one containing it', function () {
    $con = noteTitleLookupDb([
        [1, 'Paris', 'W', 0, '2026-01-01 10:00:00'],
        [2, 'Weekend in Paris', 'W', 0, '2026-06-01 10:00:00'],
        [3, 'Floor Plan', 'W', 0, '2026-06-01 10:00:00'],
    ]);
    assertSame(1, findNoteIdByTitle($con, 'Paris', 'W'));
    assertSame(1, findNoteIdByTitle($con, ' Paris '));
    assertSame(null, findNoteIdByTitle($con, 'Plan', 'W'), 'a title that is only contained');
});

test('case and accents do not matter, the same spelling wins', function () {
    $con = noteTitleLookupDb([
        [1, 'Résumé', 'W', 0, '2026-06-01 10:00:00'],
        [2, 'Resume', 'W', 0, '2026-01-01 10:00:00'],
    ]);
    assertSame(2, findNoteIdByTitle($con, 'Resume', 'W'));
    assertSame(1, findNoteIdByTitle($con, 'Résumé', 'W'));
    assertSame(1, findNoteIdByTitle($con, 'RESUME', 'W'), 'no same spelling: most recent');
});

test('the workspace and the trash bound the lookup', function () {
    $con = noteTitleLookupDb([
        [1, 'Paris', 'Other', 0, '2026-06-01 10:00:00'],
        [2, 'Paris', 'W', 1, '2026-06-01 10:00:00'],
    ]);
    assertSame(null, findNoteIdByTitle($con, 'Paris', 'W'));
    assertSame(1, findNoteIdByTitle($con, 'Paris'));
});

test('a search falls back to a contained title, with % and _ read as text', function () {
    $con = noteTitleLookupDb([
        [1, 'Floor Plan', 'W', 0, '2026-01-01 10:00:00'],
        [2, 'Plan', 'W', 0, '2026-01-01 09:00:00'],
        [3, '100% done', 'W', 0, '2026-01-01 10:00:00'],
    ]);
    assertSame(2, findNoteIdByTitle($con, 'Plan', 'W', true));
    assertSame(1, findNoteIdByTitle($con, 'Floor', 'W', true));
    assertSame(3, findNoteIdByTitle($con, '0% d', 'W', true));
    assertSame(null, findNoteIdByTitle($con, 'F%n', 'W', true));
    assertSame(null, findNoteIdByTitle($con, 'Pla_', 'W', true));
});
