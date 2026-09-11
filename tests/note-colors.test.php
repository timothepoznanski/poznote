<?php
lib('i18n', 'note-colors');

test('a hex colour is recognised in both short and long form', function () {
    assertTrue(isNoteColorHex('#ABC'));
    assertTrue(isNoteColorHex('#aabbcc'));
    assertFalse(isNoteColorHex('rouge'));
    assertFalse(isNoteColorHex('#12'));
});

test('a short hex is expanded and lowercased', function () {
    assertSame('#aabbcc', normalizeNoteColorHex('#ABC'));
});

test('anything that is not a colour normalises away', function () {
    assertSame('', normalizeNoteColorHex('rouge'));
    assertSame('', normalizeNoteColorHex('javascript:alert(1)'));
});

// The known-name table globs src/i18n/*.json so a palette entry the user never
// renamed keeps being recognised in any language. A broken glob left only the
// English names, and "Bleu" started looking like a deliberate rename.
test('a built-in colour is recognised under its translated name', function () {
    $known = getKnownNoteColorNames();
    assertTrue(in_array('bleu', $known['blue'], true), 'French name for blue missing');
    assertTrue(in_array('blau', $known['blue'], true), 'German name for blue missing');
    assertTrue(in_array('verde', $known['green'], true), 'Spanish name for green missing');
});
