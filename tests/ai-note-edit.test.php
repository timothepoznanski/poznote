<?php
lib('ai-note-edit');

test('a note that fits comes whole, with no next part', function () {
    $page = aiNotePage('short note', 0, 100);
    assertSame('short note', $page['content']);
    assertSame(null, $page['next_offset']);
    assertSame(10, $page['total_length']);
});

// Issue #1710: the note was cut in the middle of a table row, and Russian and
// Korean notes could lose half a character at the cut.
test('reading part after part gives the note back to the byte', function () {
    $note = '';
    for ($i = 0; $i < 400; $i++) {
        $note .= '| ' . $i . ' | 붉은 달 푸른 해 | Южнокорейские сериалы |' . "\n";
    }
    $read = '';
    $offset = 0;
    $parts = 0;
    do {
        $page = aiNotePage($note, $offset, 1000);
        assertTrue(strlen($page['content']) <= 1000, 'part size');
        assertSame(1, preg_match('//u', $page['content']), 'valid UTF-8 in part ' . $parts);
        $read .= $page['content'];
        $offset = $page['next_offset'];
        $parts++;
    } while ($offset !== null && $parts < 100);
    assertSame($note, $read);
});

test('a part ends on a line end when one is close, not in the middle of a row', function () {
    $page = aiNotePage(str_repeat('x', 90) . "\n" . str_repeat('y', 90), 0, 100);
    assertSame(str_repeat('x', 90) . "\n", $page['content']);
    assertSame(91, $page['next_offset']);
});

test('a part without a nearby line end still stops between two characters', function () {
    $page = aiNotePage(str_repeat('é', 50), 0, 11);
    assertSame(str_repeat('é', 5), $page['content']);
    assertSame(10, $page['next_offset']);
});

test('an offset out of range or inside a character is brought back', function () {
    assertSame('', aiNotePage('abc', 99, 10)['content']);
    assertSame('abc', aiNotePage('abc', -5, 10)['content']);
    $page = aiNotePage('aé', 2, 10);
    assertSame(1, $page['offset']);
    assertSame('é', $page['content']);
});

test('a limit smaller than one character does not stop the reading', function () {
    $page = aiNotePage('éa', 0, 1);
    assertSame('é', $page['content']);
    assertSame(2, $page['next_offset']);
});

// update_note_content sends the whole note: it may only run once the model
// has seen the whole note, or the part it never saw would be lost.
test('a note counts as read only when every range of that version was', function () {
    aiNoteReadReset();
    assertFalse(aiNoteReadIsComplete(7, 'v1', 100), 'nothing read');
    aiNoteReadRecord(7, 'v1', 0, 40);
    assertFalse(aiNoteReadIsComplete(7, 'v1', 100), 'first part only');
    aiNoteReadRecord(7, 'v1', 70, 100);
    assertFalse(aiNoteReadIsComplete(7, 'v1', 100), 'a hole in the middle');
    aiNoteReadRecord(7, 'v1', 40, 70);
    assertTrue(aiNoteReadIsComplete(7, 'v1', 100), 'all parts, out of order');
    assertFalse(aiNoteReadIsComplete(7, 'v2', 100), 'the note changed since');
    assertFalse(aiNoteReadIsComplete(8, 'v1', 100), 'another note');
    aiNoteReadReset();
});

test('replacements apply in order and report how many places changed', function () {
    $result = aiApplyNoteReplacements('one two two', [
        ['find' => 'one', 'replace' => 'uno'],
        ['find' => 'two', 'replace' => 'dos', 'all' => true],
    ]);
    assertSame('uno dos dos', $result['content']);
    assertSame(3, $result['replaced']);
});

// The links of issue #1710: Markdown punctuation is matched literally.
test('a replacement matches regex and Markdown punctuation literally', function () {
    $result = aiApplyNoteReplacements('[Mouse](https://x/Mouse_\(TV\_series)', [
        ['find' => '(https://x/Mouse_\(TV\_series)', 'replace' => '(https://x/Mouse_(TV_series))'],
    ]);
    assertSame('[Mouse](https://x/Mouse_(TV_series))', $result['content']);
});

test('a replacement that cannot be applied changes nothing at all', function () {
    $missing = aiApplyNoteReplacements('abc', [['find' => 'a', 'replace' => 'z'], ['find' => 'nope', 'replace' => 'y']]);
    assertContains('Replacement 2', $missing['error']);
    assertFalse(isset($missing['content']));
    assertContains('matches 2 places', aiApplyNoteReplacements('aa', [['find' => 'a', 'replace' => 'b']])['error']);
});

test('a malformed replacement list is refused', function () {
    assertTrue(isset(aiApplyNoteReplacements('a', [])['error']), 'empty list');
    assertTrue(isset(aiApplyNoteReplacements('a', 'a')['error']), 'not a list');
    assertTrue(isset(aiApplyNoteReplacements('a', [['find' => '', 'replace' => 'b']])['error']), 'empty find');
    assertTrue(isset(aiApplyNoteReplacements('a', [['find' => 'a']])['error']), 'no replace');
    $many = array_fill(0, AI_NOTE_REPLACEMENTS_MAX + 1, ['find' => 'a', 'replace' => 'a']);
    assertContains('Too many', aiApplyNoteReplacements('a', $many)['error']);
});
