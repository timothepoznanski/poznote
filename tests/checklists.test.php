<?php
lib('checklists');

test('markdown checklist items are read with their state', function () {
    $items = extractMarkdownChecklistItems("- [x] fait\n- [ ] a faire\ndu texte");
    assertSame(2, count($items));
    assertSame('fait', $items[0]['text']);
    assertTrue($items[0]['completed']);
    assertFalse($items[1]['completed']);
});

test('text that is not a checklist yields no items', function () {
    assertSame([], extractMarkdownChecklistItems("juste un paragraphe\n\net un autre"));
});

// buildNoteCardPreview() reads the note's file: point it at a temp one. The
// stub only wins when no earlier test file loaded functions.php; otherwise the
// real helper answers with the entries folder, which a fresh checkout lacks.
if (!function_exists('getEntryFilename')) {
    function getEntryFilename($id, $type) {
        return sys_get_temp_dir() . '/poznote-test-entry-' . (int)$id . '.txt';
    }
}

function cardPreviewOf(string $content, string $type, bool $withSearch = true): array {
    $file = getEntryFilename(987654, $type);
    $dir = dirname($file);
    $madeDirs = [];
    for ($d = $dir; !is_dir($d); $d = dirname($d)) {
        array_unshift($madeDirs, $d);
    }
    if ($madeDirs !== []) {
        mkdir($dir, 0777, true);
    }
    file_put_contents($file, $content);
    try {
        return buildNoteCardPreview(987654, $type, $withSearch);
    } finally {
        @unlink($file);
        foreach (array_reverse($madeDirs) as $d) {
            @rmdir($d);
        }
    }
}

test('a markdown card excerpt gives the heading level of each line', function () {
    foreach ([true, false] as $withSearch) {
        $preview = cardPreviewOf("# Title\n\nSome **text**\n\n### Sub part\n- item", 'markdown', $withSearch);
        assertSame("Title\nSome text\nSub part\n- item", $preview['text']);
        assertSame([1, 0, 3, 0], $preview['headings']);
    }
    assertSame('Title Some text Sub part - item', cardPreviewOf("# Title\n\nSome **text**\n\n### Sub part\n- item", 'markdown')['search']);
});

test('a heading emptied by the excerpt takes no line', function () {
    $preview = cardPreviewOf("## ![photo](attachments/1.png)\ntext\n## Next", 'markdown');
    assertSame("text\nNext", $preview['text']);
    assertSame([0, 2], $preview['headings']);
});

test('heading levels stop where the excerpt is cut', function () {
    $preview = cardPreviewOf("# One\n" . str_repeat('word ', 60) . "\n## Two", 'markdown');
    assertSame([1, 0], $preview['headings']);
});

test('an excerpt without a heading has no levels', function () {
    assertSame(null, cardPreviewOf("plain\n#tag and # in a line", 'markdown')['headings']);
    assertSame(null, cardPreviewOf('<h1>Title</h1><p>text</p>', 'note')['headings']);
});
