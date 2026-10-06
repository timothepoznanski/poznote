<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/html_to_markdown.php';

// Inline code spans (issue #1585): a span opens on a run of backticks and
// closes on the next run of the same length, so backticks can be shown as code.

test('a single-backtick span still renders as code', function () {
    assertContains('Use <code>**bold**</code> here', parseMarkdown('Use `**bold**` here'));
});

test('a longer run holds backticks, the padding space is dropped', function () {
    assertContains('<code>`code`</code>', parseMarkdown('`` `code` ``'));
    assertContains('<code>`code`</code>', parseMarkdown('``` `code` ```'));
    assertContains('<code>```code block```</code>', parseMarkdown('`` ```code block``` ``'));
    assertContains('<code>a`b</code>', parseMarkdown('``a`b``'));
});

test('backtick code spans keep their table cell', function () {
    $html = parseMarkdown("| | Syntax | Output |\n| --- | --- | --- |\n| Inline code | ``` `code` ``` | `code` |");
    assertContains('<td><code>`code`</code></td>', $html);
    assertContains('<td><code>code</code></td>', $html);
});

test('escaped backticks stay plain text', function () {
    assertFalse(strpos(parseMarkdown('a \\` b \\` c'), '<code>') !== false, 'escaped backticks');
});

test('code holding backticks converts to a longer run and back', function () {
    $md = poznoteHtmlToMarkdown('<p>See <code>`code`</code> and <code>plain</code></p>');
    assertContains('`` `code` ``', $md);
    assertContains('`plain`', $md);
    assertContains('<code>`code`</code>', parseMarkdown($md));
});
