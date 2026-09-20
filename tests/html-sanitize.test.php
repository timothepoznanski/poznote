<?php
lib('html-sanitize');

// Poznote has shipped three stored-XSS advisories (GHSA-m44h-mv9f-38x3 and the
// two fixed in 6.68.7). These assertions are the regression net for that class.

test('sanitizeHtml drops script tags', function () {
    assertSame('<p>ok</p>', sanitizeHtml('<p>ok</p><script>alert(1)</script>'));
});

test('sanitizeHtml drops inline event handlers', function () {
    assertNotContains('onerror', sanitizeHtml('<img src=x onerror=alert(1)>'));
    assertNotContains('onload', sanitizeHtml('<svg onload=alert(1)></svg>'));
});

test('sanitizeHtml drops javascript: URLs', function () {
    assertNotContains('javascript:', sanitizeHtml('<a href="javascript:alert(1)">x</a>'));
});

test('sanitizeHtml keeps an embed from a trusted domain', function () {
    assertContains('youtube.com/embed/a', sanitizeHtml('<iframe src="https://www.youtube.com/embed/a"></iframe>'));
});

test('sanitizeHtml removes an embed from any other domain', function () {
    assertNotContains('evil.com', sanitizeHtml('<iframe src="https://evil.com/x"></iframe>'));
});

test('a trusted domain is matched on the host, not as a substring', function () {
    assertFalse(poznoteIframeSrcIsTrusted('https://youtube.com.evil.test/x'));
    assertTrue(poznoteIframeSrcIsTrusted('https://www.youtube.com/embed/a'));
});

test('code segments survive a mask and restore round trip', function () {
    $source = "before\n\n```php\n<script>alert(1)</script>\n```\n\nafter `inline <b>` end";
    $segments = [];
    $masked = maskMarkdownCodeSegments($source, $segments);
    assertNotContains('alert(1)', $masked, 'the fence body must be masked out');
    assertSame($source, restoreMarkdownCodeSegments($masked, $segments));
});

test('sanitizeMarkdownContent leaves quoted markup alone', function () {
    $out = sanitizeMarkdownContent("Voici du code :\n\n```html\n<script>alert(1)</script>\n```\n");
    assertContains('<script>alert(1)</script>', $out, 'a code sample is not an XSS payload');
});

// A page copied from the web is wrapped in semantic containers. Taking their
// subtree along with them emptied the whole note, which is how content pasted
// from a modern site disappeared on the next save.

test('sanitizeHtml keeps the content of a disallowed container', function () {
    assertSame('<div><p>hello</p></div>', sanitizeHtml('<section><p>hello</p></section>'));
    assertSame('<div><h2>T</h2><p>body</p></div>', sanitizeHtml('<article><h2>T</h2><p>body</p></article>'));
    assertSame('<b>bold</b>', sanitizeHtml('<font color="red"><b>bold</b></font>'));
});

test('sanitizeHtml still drops what a container hides', function () {
    assertSame('<div><p>text</p></div>', sanitizeHtml('<section><script>alert(1)</script><p>text</p></section>'));
    assertSame('<div>visible</div>', sanitizeHtml('<div><style>.a{color:red}</style>visible</div>'));
    assertSame('<div><p>keep</p></div>', sanitizeHtml('<section><iframe src="https://evil.test/x"></iframe><p>keep</p></section>'));
    assertNotContains('onclick', sanitizeHtml('<section onclick="alert(1)"><p>t</p></section>'));
});

test('sanitizeHtml drops the labels inside an svg', function () {
    $out = sanitizeHtml('<p>a</p><svg><title>Icon name</title><path d="M0 0"/></svg>');
    assertNotContains('Icon name', $out, 'an svg label is not note text');
    assertContains('<path d="M0 0">', $out);
});
