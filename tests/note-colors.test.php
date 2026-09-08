<?php
lib('note-colors');

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
