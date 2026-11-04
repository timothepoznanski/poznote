<?php
lib('diary', 'html-sanitize');
require_once dirname(__DIR__) . '/src/markdown_parser.php';
require_once dirname(__DIR__) . '/src/public_helpers.php';

// The journal view renders many notes at once outside the editor, through
// renderDiaryJournalContent(). These pin what each note type becomes and that
// nothing in a body gets to run.

test('a rich-text entry keeps its markup and loses its scripts and handlers', function () {
    $html = renderDiaryJournalContent('<p>Walked <b>10 km</b></p><script>alert(1)</script><img src="x" onerror="alert(1)">', 'note');
    assertContains('<b>10 km</b>', $html);
    assertNotContains('<script', $html);
    assertNotContains('onerror', $html);
});

test('a markdown entry is rendered to HTML', function () {
    $html = renderDiaryJournalContent("# Morning\n\nSome **bold** text", 'markdown');
    assertContains('<h1', $html);
    assertContains('<strong>bold</strong>', $html);
});

test('raw HTML inside a markdown entry never becomes live markup', function () {
    $html = renderDiaryJournalContent("Hello\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))", 'markdown');
    assertNotContains('<img', $html);
    assertNotContains('href="javascript:', $html);
});

test('a tasklist entry lists its tasks as disabled boxes with escaped labels', function () {
    $json = json_encode([
        ['text' => 'Buy <milk>', 'completed' => false, 'priority' => 'medium'],
        ['text' => 'Call mum', 'completed' => true, 'important' => true],
        ['text' => '   ', 'completed' => false],
    ]);
    $html = renderDiaryJournalContent($json, 'tasklist');
    assertContains('Buy &lt;milk&gt;', $html);
    // Only open tasks carry their priority (#1730)
    assertContains('<li class="priority-medium">', $html);
    assertContains('<li class="completed">', $html);
    assertSame(2, substr_count($html, '<li'), 'blank tasks are skipped');
    assertSame(2, substr_count($html, 'disabled'));
});

test('an empty or unreadable body renders as nothing', function () {
    assertSame('', renderDiaryJournalContent('', 'note'));
    assertSame('', renderDiaryJournalContent("  \n ", 'markdown'));
    assertSame('', renderDiaryJournalContent('not json', 'tasklist'));
});
