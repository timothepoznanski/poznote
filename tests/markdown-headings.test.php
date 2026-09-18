<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';

// CommonMark, and with it GitHub, Obsidian and every other editor notes get
// written in, allows up to three spaces of indentation in front of the hashes
// of an ATX heading. Poznote used to require column 0, so an imported note
// whose title carried a single leading space rendered as plain text (#1422).

test('a heading renders with up to three spaces of indentation', function () {
    foreach (['', ' ', '  ', '   '] as $indent) {
        $html = parseMarkdown($indent . '### David Hume');
        assertContains('<h3', $html, 'indent of ' . strlen($indent) . ' space(s)');
        assertContains('David Hume', $html);
    }
});

test('four spaces or a tab is indentation, not a heading', function () {
    assertNotContains('<h1', parseMarkdown('    # Four spaces'));
    assertNotContains('<h1', parseMarkdown("\t# Tab"));
});

test('hashes without a space are still not a heading', function () {
    assertNotContains('<h3', parseMarkdown(' ###No space'));
});

test('an indented heading in the middle of a note closes the paragraph', function () {
    $html = parseMarkdown("Intro paragraph.\n ## Sub\ntail");
    assertContains('<p data-line="0">Intro paragraph.</p>', $html);
    assertContains('<h2 data-line="1">Sub</h2>', $html);
});
