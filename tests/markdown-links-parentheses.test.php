<?php
require_once dirname(__DIR__) . '/src/markdown_parser.php';

// Links whose address holds parentheses (issue #1700): a ")" that closes a
// "(" of the address belongs to it; the one after it closes the link.
// js/markdown-parser.js follows the same rules.

test('a link keeps the parentheses of its address', function () {
    $html = parseMarkdown('[Paris](https://fr.wikipedia.org/wiki/Paris_(homonymie))');
    assertContains('<a href="https://fr.wikipedia.org/wiki/Paris_(homonymie)" target="_blank" rel="noopener">Paris</a>', $html);
    assertFalse(strpos($html, '</a>)') !== false, 'no stray parenthesis after the link');
});

test('parentheses in the middle of an address, with a title', function () {
    assertContains('<a href="https://ex.com/a_(b)_c" title="t"', parseMarkdown('[x](https://ex.com/a_(b)_c "t")'));
});

test('two links on a line stay two links', function () {
    $html = parseMarkdown('[a](https://x.y/(a)) et [b](https://x.y/c)');
    assertContains('<a href="https://x.y/(a)" target="_blank" rel="noopener">a</a> et ', $html);
    assertContains('<a href="https://x.y/c" target="_blank" rel="noopener">b</a>', $html);
});

test('escaped parentheses in an address', function () {
    assertContains('<a href="https://ex.com/a(b)" target="_blank" rel="noopener">x</a>', parseMarkdown('[x](https://ex.com/a\\(b\\))'));
});

test('an address written <url>', function () {
    assertContains('<a href="https://ex.com/a b" target="_blank" rel="noopener">x</a>', parseMarkdown('[x](<https://ex.com/a b>)'));
});

test('an image keeps the parentheses of its address', function () {
    assertContains('src="https://ex.com/a_(b).png"', parseMarkdown('![img](https://ex.com/a_(b).png)'));
});

test('a bare address keeps a closing parenthesis it opened', function () {
    $html = parseMarkdown('Voir https://fr.wikipedia.org/wiki/Paris_(homonymie) ici');
    assertContains('<a href="https://fr.wikipedia.org/wiki/Paris_(homonymie)" target="_blank" rel="noopener">https://fr.wikipedia.org/wiki/Paris_(homonymie)</a> ici', $html);
});

test('a bare address in parentheses leaves the closing one out', function () {
    assertContains('(voir <a href="https://ex.com/a" target="_blank" rel="noopener">https://ex.com/a</a>)', parseMarkdown('(voir https://ex.com/a)'));
    assertContains('<a href="https://ex.com/a(b)" target="_blank" rel="noopener">https://ex.com/a(b)</a>).', parseMarkdown('https://ex.com/a(b)).'));
});

test('a backslash still escapes a run of delimiters', function () {
    assertContains('a ** b', parseMarkdown('a \\*\\* b'));
    assertContains('b )) c', parseMarkdown('b \\)) c'));
});

test('an unsafe address is still not a link', function () {
    assertFalse(strpos(parseMarkdown('[x](javascript:alert(1))'), '<a ') !== false, 'javascript: link');
});
