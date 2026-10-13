<?php
lib('mentions');

// Discussion #1621: "@username" in a note of a shared workspace draws that
// member's attention to it. A mention is plain text found by reading the
// note, so what is pinned down here is the reading: what counts as naming
// someone, what the reader of each note type actually sees, the line shown
// on the Mentions page, and when a note that was handled asks again.

test('a mention is @ and the whole username, whatever its case', function () {
    assertSame(1, poznoteCountMentions('ask @tim about it', 'tim'));
    assertSame(1, poznoteCountMentions('@Tim', 'tim'));
    assertSame(1, poznoteCountMentions('(@tim)', 'tim'));
    assertSame(2, poznoteCountMentions("@tim first\nand again @tim", 'tim'));
    assertSame(0, poznoteCountMentions('ask tim about it', 'tim'));
    assertSame(0, poznoteCountMentions('', 'tim'));
    assertSame(0, poznoteCountMentions('@tim', ''));
});

test('a longer name or an email address mentions nobody', function () {
    assertSame(0, poznoteCountMentions('@timothy', 'tim'));
    assertSame(0, poznoteCountMentions('@tim-b and @tim_b', 'tim'));
    assertSame(0, poznoteCountMentions('write to joe@tim', 'tim'));
    assertSame(0, poznoteCountMentions('joe@tim.example', 'tim'));
    assertSame(0, poznoteCountMentions('https://example.org/@tim', 'tim'));
});

test('the full stop of a sentence ends a name, the one inside a name does not', function () {
    assertSame(1, poznoteCountMentions('Please check, @tim.', 'tim'));
    assertSame(1, poznoteCountMentions('@tim, @ana: look', 'tim'));
    assertSame(0, poznoteCountMentions('@tim.b will do it', 'tim'));
    assertSame(1, poznoteCountMentions('@tim.b will do it', 'tim.b'));
    assertSame(1, poznoteCountMentions('thanks @contact.poznote.', 'contact.poznote'));
});

test('a username is matched literally', function () {
    assertSame(0, poznoteCountMentions('@timXb', 'tim.b'));
    assertSame(1, poznoteCountMentions('@a-b_c', 'a-b_c'));
});

test('rich text is read without its tags', function () {
    $html = '<p>Hello <b>@tim</b></p><p>next <a href="mailto:joe@tim">mail</a></p>';
    $text = poznoteMentionPlainText($html, 'note');
    assertSame(1, poznoteCountMentions($text, 'tim'));
    assertSame(1, poznoteCountMentions(poznoteMentionPlainText('<div>@tim</div><div>b</div>', 'note'), 'tim'), 'a block that ends is a line that ends');
    assertSame(1, poznoteCountMentions(poznoteMentionPlainText('see&nbsp;@tim&#33;', 'note'), 'tim'), 'entities are decoded');
    assertSame(0, poznoteCountMentions(poznoteMentionPlainText('<style>.a{content:"@tim"}</style><p>x</p>', 'note'), 'tim'));
});

test('markdown is read as written, a task list by its task texts', function () {
    assertSame(1, poznoteCountMentions(poznoteMentionPlainText("# Plan\n\n- @tim reviews", 'markdown'), 'tim'));
    $tasks = json_encode([
        ['id' => 1, 'text' => 'call @tim', 'completed' => false, 'subtasks' => [['id' => 2, 'text' => 'then @tim again']]],
        ['id' => 3, 'text' => 'nothing', 'noteId' => '@tim'],
    ]);
    assertSame(2, poznoteCountMentions(poznoteMentionPlainText($tasks, 'tasklist'), 'tim'));
});

test('the excerpt is the line of the first mention, shortened', function () {
    assertSame('Can @tim check this?', poznoteMentionExcerpt("Title\nCan   @tim check this?\nBye @tim", 'tim'));
    assertSame('', poznoteMentionExcerpt('nobody here', 'tim'));

    $long = str_repeat('word ', 60) . '@tim ' . str_repeat('tail ', 60);
    $excerpt = poznoteMentionExcerpt($long, 'tim', 20);
    assertTrue(mb_substr($excerpt, 0, 1) === '…' && mb_substr($excerpt, -1) === '…', 'cut on both sides');
    assertTrue(strpos($excerpt, '@tim') !== false);
    assertTrue(mb_strlen($excerpt) <= 44);

    assertSame('é @tim è', poznoteMentionExcerpt('é @tim è', 'tim'), 'multibyte text is not cut inside a character');
});

test('a handled note asks again only when it names the person more often', function () {
    assertTrue(poznoteMentionIsOpen(1, null), 'never handled');
    assertFalse(poznoteMentionIsOpen(1, 1), 'handled');
    assertFalse(poznoteMentionIsOpen(1, 2), 'one of two handled mentions was removed');
    assertTrue(poznoteMentionIsOpen(2, 1), 'a second mention was added since');
    assertFalse(poznoteMentionIsOpen(0, null), 'not mentioned at all');
});
