<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';

// The text of a link (issue #1713): it takes emphasis and balanced square
// brackets. js/markdown-parser.js follows the same rules.

test('a link text takes bold', function () {
    assertContains('<a href="https://x.y/a.html" target="_blank" rel="noopener"><strong>Rounds</strong></a>', parseMarkdown('[**Rounds**](https://x.y/a.html)'));
});

test('a link text takes italic, strikethrough and highlight', function () {
    assertContains('><em>a</em></a>', parseMarkdown('[*a*](https://x.y)'));
    assertContains('><em>a</em></a>', parseMarkdown('[_a_](https://x.y)'));
    assertContains('><del>a</del></a>', parseMarkdown('[~~a~~](https://x.y)'));
    assertContains('><mark>a</mark></a>', parseMarkdown('[==a==](https://x.y)'));
});

test('a link text is still escaped', function () {
    $html = parseMarkdown('[**<img src=x onerror=alert(1)>**](https://x.y)');
    assertFalse(strpos($html, '<img') !== false, 'no tag out of a link text');
    assertContains('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>', $html);
});

test('an address or a file name in a link text is no emphasis', function () {
    assertContains('>https://x.y/_a_/*b*</a>', parseMarkdown('[https://x.y/_a_/*b*](https://x.y)'));
    assertContains('>my_file_name.md</a>', parseMarkdown('[my_file_name.md](https://x.y)'));
    assertContains('<strong>https://x.y</strong></a>', parseMarkdown('[**https://x.y**](https://x.y)'));
});

test('a link text keeps balanced square brackets', function () {
    assertContains('<a href="https://x.y/p" target="_blank" rel="noopener">[MR] Plugin</a>', parseMarkdown('[[MR] Plugin](https://x.y/p)'));
    assertContains('>a [b] c [d]</a>', parseMarkdown('[a [b] c [d]](https://x.y)'));
    assertContains('>[Title]</a>', parseMarkdown('[[Title]](https://x.y)'));
});

test('an escaped bracket in a link text', function () {
    assertContains('>a]b</a>', parseMarkdown('[a\\]b](https://x.y)'));
});

test('an unbalanced bracket stays out of the link', function () {
    assertContains('[a <a href="https://x.y" target="_blank" rel="noopener">b</a>', parseMarkdown('[a [b](https://x.y)'));
});

test('a link inside brackets is the link', function () {
    assertContains('[a <a href="https://x.y" target="_blank" rel="noopener">b</a> c](', parseMarkdown('[a [b](https://x.y) c](https://z.t)'));
});

test('brackets that are not a link stay as they are', function () {
    assertContains('[[Title]] and [word]', parseMarkdown('[[Title]] and [word]'));
    assertFalse(strpos(parseMarkdown('[[x] y] (https://x.y)'), '<a href="https://x.y" target="_blank" rel="noopener">[x]') !== false, 'a space before the address');
});

test('an image alt keeps balanced square brackets', function () {
    assertContains('alt="[v2] shot"', parseMarkdown('![[v2] shot](https://x.y/a.png)'));
});

test('a very long text with an open bracket does not lose the note', function () {
    $long = str_repeat('word ', 400000);
    assertContains('word word', (string)parseMarkdown('[' . $long));
    assertContains('[word word', (string)parseMarkdown('![' . $long));
});
