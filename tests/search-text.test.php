<?php
lib('search-text');

// A markdown note must not come up for a word its preview never shows: the
// search compares against the rendered text, so a link's address, an image's
// path or a comment cannot match, while the visible label still does.

test('a link keeps its label and loses its address and title', function () {
    $out = poznoteMarkdownVisibleText('See [the board](https://example.com/zebrafish "Zebrafish page") today.');
    assertContains('the board', $out);
    assertContains('today', $out);
    assertNotContains('zebrafish', $out);
    assertNotContains('Zebrafish', $out);
});

test('an image contributes no text at all', function () {
    $out = poznoteMarkdownVisibleText('Before ![zebrafish diagram](img/zebrafish.png) after');
    assertContains('Before', $out);
    assertContains('after', $out);
    assertNotContains('zebrafish', $out);
});

test('an address with parentheses is dropped whole', function () {
    $out = poznoteMarkdownVisibleText('[wiki](https://en.wikipedia.org/wiki/Zebrafish_(fish)) end');
    assertContains('wiki', $out);
    assertContains('end', $out);
    assertNotContains('Zebrafish', $out);
});

test('a reference definition never renders', function () {
    $out = poznoteMarkdownVisibleText("Read [this][1].\n\n[1]: https://example.com/zebrafish \"Title\"\n");
    assertContains('this', $out);
    assertNotContains('zebrafish', $out);
});

test('an autolink shows its address, so it stays searchable', function () {
    $out = poznoteMarkdownVisibleText('Go to <https://example.com/zebrafish> now');
    assertContains('example.com/zebrafish', $out);
    assertNotContains('<https', $out, 'unwrapped, so a later strip_tags cannot eat it');
});

test('an HTML comment is invisible', function () {
    $out = poznoteMarkdownVisibleText("Visible <!-- zebrafish, note to self --> text");
    assertContains('Visible', $out);
    assertContains('text', $out);
    assertNotContains('zebrafish', $out);
});

test('a code fence keeps its code and loses its language badge', function () {
    $out = poznoteMarkdownVisibleText("```bash\necho zebrafish\n```\n");
    assertContains('echo zebrafish', $out);
    assertNotContains('bash', $out);
});

test('plain prose passes through untouched', function () {
    $prose = "# Zebrafish\n\nThe *zebrafish* is a **model** organism.";
    assertSame($prose, poznoteMarkdownVisibleText($prose));
});

test('folding lowercases and drops accents, ligatures included', function () {
    assertSame('reparer le velo a zanzibar', poznoteFoldAccents('Réparer le VÉLO à Zanzibar'));
    assertSame('coeur ecole', poznoteFoldAccents('Cœur ÉCOLE'));
});

test('a diagram holding a photo leaves the rest of the note searchable', function () {
    // The JSON of a diagram with a photo: past what the old lazy pattern
    // could backtrack over, which made preg_replace() return null (#1567).
    $json = htmlspecialchars(json_encode(['files' => ['f' => [
        'dataURL' => 'data:image/jpeg;base64,' . str_repeat('QUFB', 400000),
    ]]]), ENT_QUOTES);
    $full = '<p>before</p><div class="excalidraw-container" contenteditable="false"><img src="x" />'
        . '<div class="excalidraw-data" style="display: none;">' . $json . '</div></div><p>after</p>';
    $embedded = '<p>before</p><div class="excalidraw-container" id="d1" data-excalidraw="' . $json . '">'
        . '<img src="x" /></div><p>after</p>';

    assertSame('<p>before</p>[D]</div><p>after</p>', poznoteReplaceExcalidrawContainers($full, '[D]'));
    assertSame('<p>before</p>[D]<p>after</p>', poznoteReplaceExcalidrawContainers($embedded, '[D]'));
    assertSame('<p>no diagram</p>', poznoteReplaceExcalidrawContainers('<p>no diagram</p>', '[D]'));
});
