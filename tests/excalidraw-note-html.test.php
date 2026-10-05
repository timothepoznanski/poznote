<?php
lib('excalidraw-note-html');

// The container api_save_excalidraw.php writes for a full Excalidraw note.
function excalidrawNoteDiagram(string $attachmentId, string $json): string
{
    return '<div class="excalidraw-container" contenteditable="false">'
        . '<img src="/api/v1/notes/7/attachments/' . $attachmentId . '" alt="Excalidraw diagram"'
        . ' class="excalidraw-image excalidraw-image-neutral" data-is-excalidraw="true" data-excalidraw-note-id="7" />'
        . '<div class="excalidraw-data" style="display: none;">' . htmlspecialchars($json, ENT_QUOTES) . '</div>'
        . '</div>';
}

// A diagram holding a photo: its JSON carries the image as base64, past what
// a lazy regex can backtrack over.
function excalidrawPhotoJson(int $bytes): string
{
    return json_encode(['elements' => [], 'files' => ['f' => [
        'dataURL' => 'data:image/jpeg;base64,' . base64_encode(str_repeat("\xff\xd8\x00", intdiv($bytes, 3))),
    ]]]);
}

test('a save replaces the diagram and keeps the text around it', function () {
    $html = '<p>before</p>' . excalidrawNoteDiagram('old', '{"elements":[]}') . '<p>after</p>';
    $saved = poznoteReplaceExcalidrawNoteDiagram($html, excalidrawNoteDiagram('new', '{"v":2}'));
    assertSame('<p>before</p>' . excalidrawNoteDiagram('new', '{"v":2}') . '<p>after</p>', $saved);
});

test('a small diagram no longer leaves a </div> behind on each save', function () {
    $html = excalidrawNoteDiagram('a', '{}');
    for ($i = 0; $i < 3; $i++) {
        $html = poznoteReplaceExcalidrawNoteDiagram($html, excalidrawNoteDiagram('a', '{}'));
    }
    assertSame(excalidrawNoteDiagram('a', '{}'), $html);
});

test('a diagram holding a photo is replaced, not appended', function () {
    $big = excalidrawNoteDiagram('old', excalidrawPhotoJson(1200000));
    $saved = poznoteReplaceExcalidrawNoteDiagram($big, excalidrawNoteDiagram('new', '{}'));
    assertSame(excalidrawNoteDiagram('new', '{}'), $saved);
});

test('a file bloated by the old save heals: copies, stray tags and their previews go', function () {
    $json = excalidrawPhotoJson(1200000);
    // What the old save left: one copy per save, each after a stray </div>,
    // with text the user typed after the first one kept where it is.
    $html = '<p>intro</p>' . excalidrawNoteDiagram('a1', $json) . '</div>'
        . '<p>typed later</p>'
        . excalidrawNoteDiagram('a2', $json) . '</div>' . excalidrawNoteDiagram('a3', '{}');

    $spans = poznoteFindExcalidrawNoteDiagrams($html);
    assertSame(3, count($spans));
    assertSame(['a1', 'a2', 'a3'], poznoteExcalidrawNoteDiagramAttachmentIds($html, $spans, 7));

    $saved = poznoteReplaceExcalidrawNoteDiagram($html, excalidrawNoteDiagram('new', '{}'), $spans);
    assertSame('<p>intro</p>' . excalidrawNoteDiagram('new', '{}') . '<p>typed later</p>', $saved);
});

test('the editor reads the newest copy, whatever its size', function () {
    $html = excalidrawNoteDiagram('a1', excalidrawPhotoJson(1200000)) . '</div>'
        . excalidrawNoteDiagram('a2', '{"newest":"a < b & \\"c\\""}');
    assertSame('{"newest":"a < b & \\"c\\""}', poznoteReadExcalidrawNoteData($html));

    $json = excalidrawPhotoJson(1200000);
    assertSame($json, poznoteReadExcalidrawNoteData(excalidrawNoteDiagram('a', $json)));
});

test('an embedded diagram is not taken for the note diagram', function () {
    $embedded = '<div class="excalidraw-container" id="diagram-1" data-excalidraw="{&quot;x&quot;:1}">'
        . '<img src="/api/v1/notes/7/attachments/emb" data-is-excalidraw="true" /></div>';
    assertSame([], poznoteFindExcalidrawNoteDiagrams($embedded));

    $html = $embedded . excalidrawNoteDiagram('note', '{}');
    $saved = poznoteReplaceExcalidrawNoteDiagram($html, excalidrawNoteDiagram('new', '{}'));
    assertSame($embedded . excalidrawNoteDiagram('new', '{}'), $saved);
    assertSame(null, poznoteReadExcalidrawNoteData($embedded));
});

test('surrounding placeholders and whitespace go with the diagram', function () {
    $ph = '<p class="excalidraw-placeholder" data-ph="…"></p>';
    $html = '<p>x</p>' . $ph . "\n" . excalidrawNoteDiagram('a', '{}') . "\n" . $ph . '<p>y</p>';
    $saved = poznoteReplaceExcalidrawNoteDiagram($html, 'NEW');
    assertSame('<p>x</p>NEW<p>y</p>', $saved);
});

test('a note without a diagram gets one appended', function () {
    assertSame('<p>x</p>NEW', poznoteReplaceExcalidrawNoteDiagram('<p>x</p>', 'NEW'));
    assertSame('NEW', poznoteReplaceExcalidrawNoteDiagram('', 'NEW'));
});

test('a </div> that closes a wrapper is not mistaken for a stray one', function () {
    $html = '<div class="wrap">' . excalidrawNoteDiagram('a', '{}') . '</div><p>after</p>';
    $saved = poznoteReplaceExcalidrawNoteDiagram($html, 'NEW');
    assertSame('<div class="wrap">NEW</div><p>after</p>', $saved);
});

test('the data is still read from a container the tag walk does not recognise', function () {
    // Found nothing, the editor opens empty and the next save overwrites the
    // diagram: an unclosed container or another attribute order must not
    // cost the data.
    $data = '<div class="excalidraw-data" style="display: none;">{&quot;a&quot;:1}</div>';
    assertSame('{"a":1}', poznoteReadExcalidrawNoteData(
        '<div class="excalidraw-container" contenteditable="false">' . $data
    ));
    assertSame('{"a":1}', poznoteReadExcalidrawNoteData(
        '<div contenteditable="false" class="excalidraw-container">' . $data . '</div>'
    ));
    assertSame(null, poznoteReadExcalidrawNoteData('<p>no diagram</p>'));
});

test('the entry column gives the diagram back whichever form it holds', function () {
    // The note's HTML, which every save now writes there
    assertSame('{"v":2}', poznoteExcalidrawDataFromEntry('<p>x</p>' . excalidrawNoteDiagram('a', '{"v":2}')));
    // The diagram JSON itself, as an older version left it
    assertSame('{"elements":[]}', poznoteExcalidrawDataFromEntry('{"elements":[]}'));
    // A container without data, or nothing at all, is no diagram
    assertSame(null, poznoteExcalidrawDataFromEntry('<div class="excalidraw-container"><img src="x" /></div>'));
    assertSame(null, poznoteExcalidrawDataFromEntry(''));
    assertSame(null, poznoteExcalidrawDataFromEntry(null));
});

test('a caret position maps to the same place in the HTML, entities and breaks included', function () {
    $html = '<p>ab</p><p>c&nbsp;d &amp; é<br>f</p>';
    // "ab" + end of block = 3, so position 3 is right after the first </p>
    assertSame('<p>ab</p>', substr($html, 0, poznoteHtmlOffsetForTextPosition($html, 3)));
    // an entity counts for the one character it shows
    assertSame('<p>ab</p><p>c&nbsp;', substr($html, 0, poznoteHtmlOffsetForTextPosition($html, 5)));
    // a multi-byte character is never cut, and <br> counts for one
    assertSame('<p>ab</p><p>c&nbsp;d &amp; é', substr($html, 0, poznoteHtmlOffsetForTextPosition($html, 10)));
    assertSame('<p>ab</p><p>c&nbsp;d &amp; é<br>', substr($html, 0, poznoteHtmlOffsetForTextPosition($html, 11)));
    assertSame(0, poznoteHtmlOffsetForTextPosition($html, 0));
    assertSame(strlen($html), poznoteHtmlOffsetForTextPosition($html, 999));
});

test('finding the caret in a note that holds a large diagram takes no time', function () {
    // The loop this replaced was quadratic: minutes on a note like this one,
    // whatever was being inserted (issue #1567).
    $json = htmlspecialchars(json_encode(['files' => ['f' => ['dataURL' => 'data:image/jpeg;base64,' . str_repeat('QUFB', 400000)]]]));
    $html = '<p>intro</p><div class="excalidraw-container" id="e1" data-excalidraw="' . $json . '"><img src="x" /></div>'
        . '<p>' . str_repeat('mot ', 500) . '</p>';
    $start = microtime(true);
    $offset = poznoteHtmlOffsetForTextPosition($html, 1000);
    assertTrue(microtime(true) - $start < 1.0, 'caret lookup took too long');
    // "intro" and its </p> count 6, the diagram's </div> one more: the
    // remaining 993 characters are read in the last paragraph
    assertSame(strpos($html, '<p>mot') + 3 + 993, $offset);
});
