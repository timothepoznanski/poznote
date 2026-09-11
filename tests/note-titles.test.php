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
