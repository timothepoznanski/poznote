<?php
lib('ai-note-diagrams');

// An embedded diagram as a browser serialises it: quotes escaped, but the
// ">" and "<" of the scene's text left raw inside the attribute.
function aiTestDiagram(string $id, string $scene = '{"elements":[{"text":"a > b </div> <div>"}]}'): string
{
    return '<div class="excalidraw-container" id="' . $id . '" style="cursor: pointer; text-align: center;"'
        . ' data-diagram-id="' . $id . '" data-excalidraw="' . str_replace('"', '&quot;', $scene) . '">'
        . '<img src="/api/v1/notes/7/attachments/abc" class="excalidraw-image" data-is-excalidraw="true"'
        . ' style="max-width: 100%; height: auto; width: 400px;" alt="Excalidraw diagram" /></div>';
}

test('an embedded diagram reaches the assistant as a placeholder', function () {
    $html = '<p>before</p>' . aiTestDiagram('excalidraw-1') . '<p>after</p>';
    assertSame(
        '<p>before</p><p><img src="/poznote-diagram/excalidraw-1" alt="Excalidraw diagram"></p><p>after</p>',
        aiHideEmbeddedDiagrams($html, false)
    );
    assertSame(
        "before\n\n![Excalidraw diagram](/poznote-diagram/excalidraw-1)\n\nafter",
        aiHideEmbeddedDiagrams("before\n\n" . aiTestDiagram('excalidraw-1') . "\n\nafter", true)
    );
});

test('a rewritten rich-text note gets its diagrams back as stored (#1579)', function () {
    $one = aiTestDiagram('excalidraw-1');
    $two = aiTestDiagram('excalidraw-2');
    $stored = '<p>before</p>' . $one . '<p>middle</p>' . $two;
    // What the Markdown round trip and the sanitizer leave of the placeholders
    $written = '<p>edited</p><p><img src="/poznote-diagram/excalidraw-2" alt="Excalidraw diagram"></p>'
        . '<p>middle</p><p style="text-align: center;"><img src="/poznote-diagram/excalidraw-1" alt="x"></p>';
    assertSame('<p>edited</p>' . $two . '<p>middle</p>' . $one, aiRestoreEmbeddedDiagrams($written, $stored, false));
});

test('a rewritten Markdown note gets its diagrams back as stored', function () {
    $stored = "# Title\n\n" . aiTestDiagram('excalidraw-1') . "\n\nend\n";
    $read = aiHideEmbeddedDiagrams($stored, true);
    assertSame($stored, aiRestoreEmbeddedDiagrams($read, $stored, true));
});

test('a placeholder repeated or invented by the model leaves nothing behind', function () {
    $one = aiTestDiagram('excalidraw-1');
    $line = '![Excalidraw diagram](/poznote-diagram/excalidraw-1)';
    $out = aiRestoreEmbeddedDiagrams("a\n\n$line\n\n$line\n\n![x](/poznote-diagram/nope)\n\nb", $one, true);
    assertSame(1, substr_count($out, 'excalidraw-container'));
    assertNotContains('poznote-diagram', $out);
});

test('a diagram holding a photo is found whatever its size', function () {
    $scene = '{"files":{"f":"' . str_repeat('A', 3000000) . '"}}';
    $html = '<p>before</p>' . aiTestDiagram('excalidraw-1', $scene) . '<p>after</p>';
    assertTrue(strlen(aiHideEmbeddedDiagrams($html, false)) < 200);
});

test('diagrams without a usable id are told apart by position', function () {
    $anonymous = '<div class="excalidraw-container" data-excalidraw="{}"><img src="/a" /></div>';
    assertSame(['1', '2'], array_map('strval', array_keys(aiFindEmbeddedDiagrams($anonymous . $anonymous))));
});

test('the diagram of a full Excalidraw note is not an embedded one', function () {
    $note = '<div class="excalidraw-container" contenteditable="false"><img src="/a" />'
        . '<div class="excalidraw-data" style="display: none;">{}</div></div>';
    assertSame([], aiFindEmbeddedDiagrams($note));
});
