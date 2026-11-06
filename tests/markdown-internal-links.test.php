<?php
lib('html-sanitize');
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/html_to_markdown.php';

// Issue #1744, the other two losses of the Markdown round trip the AI
// assistant reads and writes rich-text notes through. js/markdown-parser.js,
// which renders the editor's own preview, had both right; the PHP renderer
// (public shares, exports, the assistant's writes) did not.

test('an internal note link is rendered as one', function () {
    assertSame(
        '<p data-line="0"><a href="index.php?note=42" class="note-internal-link" data-note-id="42"'
            . ' data-note-reference="true" target="_blank" rel="noopener">Other note</a></p>',
        parseMarkdown('[Other note](index.php?note=42)')
    );
    // With a workspace, with a title, and in the bare form the modal writes
    assertContains('data-note-id="42"', parseMarkdown('[X](index.php?note=42&workspace=Lab)'));
    assertContains('data-note-id="42"', parseMarkdown('[X](?note=42)'));
    assertContains(
        'data-note-reference="true" title="Go to: X"',
        parseMarkdown('[X](index.php?note=42 "Go to: X")')
    );
});

test('an outside link is left exactly as it was', function () {
    assertSame(
        '<p data-line="0"><a href="https://example.com" target="_blank" rel="noopener">Example</a></p>',
        parseMarkdown('[Example](https://example.com)')
    );
    assertSame(
        '<p data-line="0"><a href="https://example.com" title="Site" target="_blank" rel="noopener">Example</a></p>',
        parseMarkdown('[Example](https://example.com "Site")')
    );
    // Nothing that merely looks like one is taken for an internal link
    foreach (['index.php', 'index.php?notes=42', 'index.php?note=x', 'https://example.com/?note=42'] as $url) {
        assertNotContains('note-internal-link', parseMarkdown('[X](' . $url . ')'), $url);
    }
});

test('an image used as a link is not lost', function () {
    assertSame(
        '<p data-line="0"><a href="https://example.com" target="_blank" rel="noopener">'
            . '<img src="/x.png" alt="alt" loading="lazy" decoding="async"></a></p>',
        parseMarkdown('[![alt](/x.png)](https://example.com)')
    );
    // The same picture linking to a note of the instance
    assertContains(
        'data-note-reference="true" target="_blank" rel="noopener">'
            . '<img src="/x.png" alt="alt" loading="lazy" decoding="async"></a>',
        parseMarkdown('[![alt](/x.png)](index.php?note=42)')
    );
    // No placeholder is ever left behind
    assertNotContains('PIMG', parseMarkdown('[![alt](/x.png)](https://example.com)'));
    assertNotContains("\x00", parseMarkdown('[![alt](/x.png)](https://example.com)'));
    // An image is still an image where it stands alone, inside emphasis, and
    // in a table cell: the restore pass runs over all of them
    assertContains('<img src="/x.png"', parseMarkdown('![alt](/x.png)'));
    assertContains('<img src="/x.png"', parseMarkdown('**[![alt](/x.png)](https://example.com)**'));
    assertContains('<img src="/x.png"', parseMarkdown("| a |\n| --- |\n| [![alt](/x.png)](https://example.com) |"));
});

test('the AI round trip of a rich-text note keeps both', function () {
    $stored = '<p>See <a href="index.php?note=42" class="note-internal-link" data-note-id="42"'
        . ' data-note-reference="true" title="Go to: Other note">Other note</a></p>'
        . '<p><a href="https://example.com"><img src="/x.png" alt="shot" width="420"></a></p>';
    $written = sanitizeHtml(parseMarkdownForRichText(poznoteHtmlToMarkdown($stored)));
    // The link is still an internal link, with the look that goes with it
    // (sanitizeHtml() drops the two data attributes, as it does on every save)
    assertContains('<a href="index.php?note=42" class="note-internal-link"', $written);
    // The linked image survived the trip
    assertContains('<img src="/x.png" alt="shot"', $written);
});
