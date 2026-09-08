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
