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
