<?php
lib('ai-note-images', 'html-sanitize');
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/html_to_markdown.php';

// Issue #1744: a rich-text note reaches the assistant as Markdown, whose image
// syntax has nowhere to keep width/height, so every AI edit of the note gave
// each resized image its natural size back. aiRestoreImageSizes() puts the
// stored sizes back on the images the model wrote.

/** What the resize handle leaves on an image, as the editor stores it. */
function aiTestImage(string $src, string $size = '', string $alt = 'shot.png'): string
{
    return '<img src="' . $src . '" alt="' . $alt . '"' . $size . '>';
}

/**
 * The Markdown round trip of aiWriteNoteFromMarkdown(), from the stored note
 * to what the model's reply becomes just before the sizes are restored.
 */
function aiTestRoundTrip(string $stored): string
{
    return sanitizeHtml(parseMarkdownForRichText(poznoteHtmlToMarkdown($stored)));
}

test('a resized image keeps its size through an AI rewrite', function () {
    $src = '/api/v1/notes/377/attachments/6aedf3ff94428';
    $stored = '<p>' . aiTestImage($src, ' width="420" style="width: 420px;"') . '</p>';
    $written = aiTestRoundTrip($stored);
    assertNotContains('width', $written, 'the round trip drops the size');
    assertSame(
        '<p><img src="' . $src . '" alt="shot.png" width="420"></p>',
        aiRestoreImageSizes($written, $stored)
    );
});

test('the text the model added is kept, the image size comes back', function () {
    $src = '/api/v1/notes/377/attachments/abc';
    $stored = '<p>' . aiTestImage($src, ' width="300" height="200"') . '</p>';
    // What the model sends: the note's Markdown with one line added
    $reply = parseMarkdownForRichText("![shot.png](" . $src . ")\n\nHello World");
    $out = aiRestoreImageSizes(sanitizeHtml($reply), $stored);
    assertContains('width="300" height="200"', $out);
    assertContains('Hello World', $out);
});

test('an image the model sized itself is left alone', function () {
    $src = '/x.png';
    $stored = '<p>' . aiTestImage($src, ' width="420"') . '</p>';
    assertSame(
        '<p><img src="/x.png" width="120"></p>',
        aiRestoreImageSizes('<p><img src="/x.png" width="120"></p>', $stored)
    );
    // Only a height of its own is still a size of its own: a width copied
    // next to it would change the aspect ratio the model chose
    assertSame(
        '<p><img src="/x.png" height="90"></p>',
        aiRestoreImageSizes('<p><img src="/x.png" height="90"></p>', $stored)
    );
});

test('an image the user never resized stays unsized', function () {
    $stored = '<p>' . aiTestImage('/x.png') . '</p>';
    $written = '<p><img src="/x.png" alt="shot.png"></p>';
    assertSame($written, aiRestoreImageSizes($written, $stored));
});

test('a new image the model inserted gets no size', function () {
    $stored = '<p>' . aiTestImage('/x.png', ' width="420"') . '</p>';
    $written = '<p><img src="/x.png"></p><p><img src="/other.png"></p>';
    assertSame(
        '<p><img src="/x.png" width="420"></p><p><img src="/other.png"></p>',
        aiRestoreImageSizes($written, $stored)
    );
});

test('the same image used twice at one size is sized twice', function () {
    $stored = '<p>' . aiTestImage('/x.png', ' width="420"') . aiTestImage('/x.png', ' width="420"') . '</p>';
    assertSame(
        '<p><img src="/x.png" width="420"><img src="/x.png" width="420"></p>',
        aiRestoreImageSizes('<p><img src="/x.png"><img src="/x.png"></p>', $stored)
    );
});

test('the same image used at two sizes is left alone, not guessed', function () {
    $stored = '<p>' . aiTestImage('/x.png', ' width="420"') . aiTestImage('/x.png', ' width="120"') . '</p>';
    $written = '<p><img src="/x.png"><img src="/x.png"></p>';
    assertSame($written, aiRestoreImageSizes($written, $stored));
    // ... while the other images of the note still get theirs
    $stored .= '<p>' . aiTestImage('/y.png', ' width="200"') . '</p>';
    assertSame(
        '<p><img src="/x.png"><img src="/x.png"></p><p><img src="/y.png" width="200"></p>',
        aiRestoreImageSizes($written . '<p><img src="/y.png"></p>', $stored)
    );
});

test('the same image sized once and not the other time is left alone', function () {
    $stored = '<p>' . aiTestImage('/x.png', ' width="420"') . aiTestImage('/x.png') . '</p>';
    $written = '<p><img src="/x.png"><img src="/x.png"></p>';
    assertSame($written, aiRestoreImageSizes($written, $stored));
    // In the other order too: the first answer does not win
    $stored = '<p>' . aiTestImage('/x.png') . aiTestImage('/x.png', ' width="420"') . '</p>';
    assertSame($written, aiRestoreImageSizes($written, $stored));
    // And a third copy does not lift the ambiguity
    $stored .= aiTestImage('/x.png', ' width="420"');
    assertSame($written, aiRestoreImageSizes($written, $stored));
});

test('an inline base64 image keeps its size too', function () {
    // aiRestoreInlineImages() has already put the data: URI back when the
    // sizes are restored, so the src matches the stored one
    $data = 'data:image/png;base64,iVBORw0KGgo=';
    $stored = '<p>' . aiTestImage($data, ' width="420"') . '</p>';
    assertSame(
        '<p><img src="' . $data . '" width="420"></p>',
        aiRestoreImageSizes('<p><img src="' . $data . '"></p>', $stored)
    );
});

test('an entity in the src does not break the match', function () {
    $stored = '<p><img src="/img.php?a=1&amp;b=2" width="420"></p>';
    assertSame(
        '<p><img src="/img.php?a=1&amp;b=2" width="420"></p>',
        aiRestoreImageSizes('<p><img src="/img.php?a=1&amp;b=2"></p>', $stored)
    );
    // The same src written raw by a converter is the same image
    assertSame(
        '<p><img src="/img.php?a=1&b=2" width="420"></p>',
        aiRestoreImageSizes('<p><img src="/img.php?a=1&b=2"></p>', $stored)
    );
});

test('a ">" inside an attribute does not cut the tag short', function () {
    $stored = '<p><img src="/x.png" alt="a > b" width="420"></p>';
    assertSame(
        '<p><img src="/x.png" alt="a > b" width="420"></p>',
        aiRestoreImageSizes('<p><img src="/x.png" alt="a > b"></p>', $stored)
    );
});

test('a self-closing tag stays self-contained', function () {
    $stored = '<p><img src="/x.png" width="420" /></p>';
    assertSame(
        '<p><img src="/x.png" width="420"></p>',
        aiRestoreImageSizes('<p><img src="/x.png" /></p>', $stored)
    );
});

test('only a size the resize handle could have written is copied', function () {
    foreach (['auto', '420px', 'javascript:1', '" onerror="alert(1)', '1234567', ''] as $bad) {
        $stored = '<p><img src="/x.png" width="' . $bad . '"></p>';
        assertSame(
            '<p><img src="/x.png"></p>',
            aiRestoreImageSizes('<p><img src="/x.png"></p>', $stored),
            'width="' . $bad . '"'
        );
    }
    // A percentage is a width the browser understands, and harmless
    assertSame(
        '<p><img src="/x.png" width="50%"></p>',
        aiRestoreImageSizes('<p><img src="/x.png"></p>', '<p><img src="/x.png" width="50%"></p>')
    );
});

test('a note without images is returned untouched', function () {
    assertSame('<p>text</p>', aiRestoreImageSizes('<p>text</p>', '<p><img src="/x.png" width="420"></p>'));
    assertSame('<p><img src="/x.png"></p>', aiRestoreImageSizes('<p><img src="/x.png"></p>', '<p>text</p>'));
    assertSame('', aiRestoreImageSizes('', ''));
});

test('the sizes of a stored note are read once, by src', function () {
    assertSame(
        ['/x.png' => ['420', null], '/y.png' => ['300', '200']],
        aiNoteImageSizes('<p><img src="/x.png" width="420"><img src="/y.png" width="300" height="200"><img src="/z.png"></p>')
    );
    assertSame([], aiNoteImageSizes('<p>no image here</p>'));
    assertSame([], aiNoteImageSizes('<p><img alt="no src" width="10"></p>'));
});
