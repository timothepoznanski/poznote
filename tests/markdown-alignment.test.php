<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/html_to_markdown.php';

// Paragraph alignment in Markdown notes (discussion #1513) is written the
// GitHub README way, <p align="center">text</p>, one line at a time. The
// parser renders it as a paragraph with text-align; the HTML to Markdown
// converter writes it back from a rich-text note's text-align.

test('an aligned line renders as a paragraph with text-align and Markdown inside', function () {
    $html = parseMarkdown("Intro\n<p align=\"center\">Hello **world**</p>");
    assertContains('<p data-line="1" style="text-align: center;">Hello <strong>world</strong></p>', $html);
});

test('consecutive lines with the same alignment are one paragraph', function () {
    $html = parseMarkdown("<p align=\"right\">One</p>\n<p align=\"right\">Two</p>\n<p align=\"center\">Three</p>");
    assertContains('<p data-line="0" style="text-align: right;">One<br>Two</p>', $html);
    assertContains('<p data-line="2" style="text-align: center;">Three</p>', $html);
});

test('unknown values, other attributes and code blocks stay plain text', function () {
    $html = parseMarkdown("<p align=\"bogus\">a</p>\n\n<p align=\"center\" onclick=\"x\">b</p>\n\n```\n<p align=\"center\">c</p>\n```");
    assertFalse(strpos($html, 'text-align') !== false, 'no alignment rendered');
    assertContains('&lt;p align=&quot;bogus&quot;&gt;a&lt;/p&gt;', $html);
});

test('HTML inside an aligned line stays escaped', function () {
    $html = parseMarkdown('<p align="center"><img src=x onerror=alert(1)></p>');
    assertContains('style="text-align: center;">&lt;img src=x onerror=alert(1)&gt;</p>', $html);
});

test('text-align in a rich-text note becomes aligned Markdown lines', function () {
    $md = poznoteHtmlToMarkdown('<div>Plain</div><div style="text-align: center;">A <b>bold</b> word</div><div style="text-align: right;">One<br>Two</div><div style="text-align: left;">Left</div>');
    assertSame("Plain\n\n<p align=\"center\">A **bold** word</p>\n\n<p align=\"right\">One</p>\n<p align=\"right\">Two</p>\n\nLeft", $md);
});

test('a converted note renders back with the same alignment', function () {
    $html = parseMarkdown(poznoteHtmlToMarkdown('<p style="text-align: justify">Some text</p><div style="text-align: right;">One<br>Two</div>'));
    assertContains('style="text-align: justify;">Some text</p>', $html);
    assertContains('style="text-align: right;">One<br>Two</p>', $html);
});
