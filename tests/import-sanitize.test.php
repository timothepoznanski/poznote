<?php
lib('html-sanitize');

// GHSA-xjh4-q36h-mcvv: the import paths stored note bodies verbatim while the
// editor's save path had always sanitized them, so an imported file could run
// script in the owner's session with no click. These assertions pin the shared
// policy the import paths now apply, and above all what it must NOT eat.

test('an imported HTML note loses its inline handler and its script', function () {
    $out = poznoteSanitizeImportedNoteContent(
        "<html><body><img src=\"x\" onerror=\"alert('Stored XSS')\">\n<script>alert(1)</script></body></html>",
        'note'
    );
    assertNotContains('onerror', $out);
    assertNotContains('alert(1)', $out);
});

test('an imported markdown note loses its handler but keeps its code sample', function () {
    $out = poznoteSanitizeImportedNoteContent(
        "# Titre\n\n<img src=x onerror=alert(1)>\n\n```html\n<script>alert('sample')</script>\n```\n",
        'markdown'
    );
    assertNotContains('onerror', $out);
    assertContains('# Titre', $out);
    assertContains("<script>alert('sample')</script>", $out, 'a quoted code sample is not a payload');
});

test('a task list keeps its JSON body byte for byte', function () {
    $json = '[{"id":"a1","text":"Acheter du pain","done":false}]';
    assertSame($json, poznoteSanitizeImportedNoteContent($json, 'tasklist'));
});

test('a plain note whose body parses as JSON is still sanitized', function () {
    // The JSON exemption is keyed on the declared type on purpose: a note the
    // renderer prints as markup must never take the pass-through branch.
    $out = poznoteSanitizeImportedNoteContent('{"a":"<img src=x onerror=alert(1)>"}', 'note');
    assertNotContains('onerror', $out);
});

test('a task list whose body is not JSON falls back to the strict path', function () {
    $out = poznoteSanitizeImportedNoteContent('<img src=x onerror=alert(1)>', 'tasklist');
    assertNotContains('onerror', $out);
});

test('an unknown note type takes the strict path', function () {
    assertNotContains('onerror', poznoteSanitizeImportedNoteContent('<img src=x onerror=alert(1)>', null));
});

test('ordinary note formatting survives an import', function () {
    $source = '<h2>Titre</h2><p><strong>gras</strong> et <em>italique</em></p>'
        . '<ul><li>un</li><li>deux</li></ul>'
        . '<table><tr><th>a</th><td>b</td></tr></table>'
        . '<pre data-language="php"><code>echo 1;</code></pre>'
        . '<blockquote>cité</blockquote><hr>';
    $out = poznoteSanitizeImportedNoteContent($source, 'note');
    foreach (['<h2>Titre</h2>', '<strong>gras</strong>', '<li>deux</li>', '<th>a</th>',
              'data-language="php"', '<blockquote>cité</blockquote>', '<hr>'] as $kept) {
        assertContains($kept, $out);
    }
});

test('an imported YouTube embed survives, an untrusted one does not', function () {
    $out = poznoteSanitizeImportedNoteContent(
        '<iframe src="https://www.youtube.com/embed/a"></iframe><iframe src="https://evil.test/x"></iframe>',
        'note'
    );
    assertContains('youtube.com/embed/a', $out);
    assertNotContains('evil.test', $out);
});

test('imported attachment and image references survive', function () {
    // importIndividualNotesZip() rewrites these AFTER the sanitizer runs, and
    // reads the filename out of the download attribute to do it.
    $source = '<img src="attachments/abc.png" alt="x">'
        . '<a href="../attachments/def.pdf" download="rapport.pdf">rapport</a>'
        . '<img src="/api/v1/notes/12/attachments/ghi">';
    $out = poznoteSanitizeImportedNoteContent($source, 'note');
    assertContains('src="attachments/abc.png"', $out);
    assertContains('href="../attachments/def.pdf"', $out);
    assertContains('download="rapport.pdf"', $out);
    assertContains('/api/v1/notes/12/attachments/ghi', $out);
});

test('an imported Excalidraw diagram keeps its scene data', function () {
    $source = '<div class="excalidraw-container" id="diag-1" data-excalidraw="{&quot;elements&quot;:[]}">'
        . '<img src="/api/v1/notes/3/attachments/x" data-is-excalidraw="true" data-excalidraw-note-id="3"></div>';
    $out = poznoteSanitizeImportedNoteContent($source, 'note');
    assertContains('excalidraw-container', $out);
    assertContains('id="diag-1"', $out);
    assertContains('data-excalidraw=', $out);
    assertContains('data-is-excalidraw="true"', $out);
});

test('an imported embedded task list keeps its marker', function () {
    $source = '<div class="tasklist-embed" data-task-embed="42" data-tasklist-json="[]"></div>';
    $out = poznoteSanitizeImportedNoteContent($source, 'note');
    assertContains('data-task-embed="42"', $out);
    assertContains('data-tasklist-json="[]"', $out);
});

test('sanitizing an already sanitized note changes nothing', function () {
    // A Git pull compares the local file against the remote SHA before
    // downloading. If the sanitizer were not idempotent, every note of a repo
    // Poznote itself pushed would look changed on every single pull.
    $source = '<h2>Titre</h2><p>texte <a href="https://example.test/x">lien</a></p>'
        . '<ul><li>un</li></ul><img src="/api/v1/notes/1/attachments/a" alt="x">';
    $once = poznoteSanitizeImportedNoteContent($source, 'note');
    assertSame($once, poznoteSanitizeImportedNoteContent($once, 'note'));

    $md = "# Titre\n\ntexte **gras**\n\n```js\nconst a = 1 < 2;\n```\n";
    $mdOnce = poznoteSanitizeImportedNoteContent($md, 'markdown');
    assertSame($mdOnce, poznoteSanitizeImportedNoteContent($mdOnce, 'markdown'));
});

test('an empty or whitespace body is returned untouched', function () {
    assertSame('', poznoteSanitizeImportedNoteContent('', 'note'));
    assertSame("\n  ", poznoteSanitizeImportedNoteContent("\n  ", 'note'));
});
