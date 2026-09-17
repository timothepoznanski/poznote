<?php
lib('attachment-adoption');

test('finds attachment addresses in HTML and markdown, with origin, prefix and query', function () {
    $content = '<img src="/api/v1/notes/12/attachments/abc123" alt="x">'
        . '<a href="https://notes.example.com/api/v1/notes/7/attachments/def_45-6?download=1">f</a>'
        . "\n![pic](/sub/api/v1/notes/3/attachments/xyz)\n"
        . '<img src="account_attachment.php?account=9&amp;note=1&amp;attachment=69f704c727360">';
    $refs = poznoteFindAttachmentRefs($content, 'notes.example.com');

    assertSame(4, count($refs));
    assertSame(['url' => '/api/v1/notes/12/attachments/abc123', 'account' => null, 'note' => 12, 'attachment' => 'abc123', 'kind' => 'file', 'download' => false], $refs[0]);
    assertSame(true, $refs[1]['download']);
    assertSame('https://notes.example.com/api/v1/notes/7/attachments/def_45-6?download=1', $refs[1]['url']);
    assertSame(7, $refs[1]['note']);
    assertSame('/sub/api/v1/notes/3/attachments/xyz', $refs[2]['url']);
    assertSame(['account' => 9, 'note' => 1, 'attachment' => '69f704c727360'], array_intersect_key($refs[3], ['account' => 1, 'note' => 1, 'attachment' => 1]));
    assertSame('account_attachment.php?account=9&amp;note=1&amp;attachment=69f704c727360', $refs[3]['url']);
});

test('another host, or an address inside another URL, is not ours to resolve', function () {
    $content = '<img src="https://other.example.org/api/v1/notes/1/attachments/aaa">'
        . '<a href="https://evil.test/?u=/api/v1/notes/1/attachments/bbb">x</a>';
    assertSame([], poznoteFindAttachmentRefs($content, 'notes.example.com'));
});

test('only what the note does not already own at its own address is foreign', function () {
    $refs = poznoteFindAttachmentRefs(
        '<img src="/api/v1/notes/5/attachments/own1"><img src="/api/v1/notes/5/attachments/lost">'
        . '<img src="/api/v1/notes/8/attachments/own1"><img src="/api/v1/notes/8/attachments/other">'
        . '<img src="account_attachment.php?account=2&note=5&attachment=own1">'
    );
    $foreign = poznoteForeignAttachmentRefs($refs, 5, ['own1']);

    // same id under the same note id but another account (pasted from the
    // same-numbered note of another account) is foreign too
    assertSame(['0:5:lost', '0:8:own1', '0:8:other', '2:5:own1'], array_map('poznoteAttachmentRefKey', $foreign));
});

test('addresses are rewritten to the note, longest match first', function () {
    $content = '<img src="/api/v1/notes/8/attachments/a1"><a href="/api/v1/notes/8/attachments/a1?download=1">dl</a>'
        . '<img src="account_attachment.php?account=2&amp;note=1&amp;attachment=b2">';
    $out = poznoteRewriteAttachmentRefs($content, 5, [
        '/api/v1/notes/8/attachments/a1' => 'n1',
        '/api/v1/notes/8/attachments/a1?download=1' => 'n1',
        'account_attachment.php?account=2&amp;note=1&amp;attachment=b2' => 'n2',
    ]);
    assertSame('<img src="/api/v1/notes/5/attachments/n1"><a href="/api/v1/notes/5/attachments/n1">dl</a>'
        . '<img src="/api/v1/notes/5/attachments/n2">', $out);
});

test('an audio embed is a reference too, and keeps its shape once rewritten', function () {
    $content = '<iframe src="/audio_player.php?note=8&amp;attachment=snd1&amp;workspace=Team%20A"></iframe>'
        . '<a href="/api/v1/notes/8/attachments/snd1?download=1">get</a>'
        . "\n<iframe src=\"/audio_player.php?note=8&attachment=snd2\"></iframe>";
    $refs = poznoteFindAttachmentRefs($content, 'notes.example.com');

    assertSame(['audio', 'file', 'audio'], [$refs[1]['kind'], $refs[0]['kind'], $refs[2]['kind']]);
    assertSame('/audio_player.php?note=8&amp;attachment=snd1&amp;workspace=Team%20A', $refs[1]['url']);
    // both shapes of the same file share one identity: copied once
    assertSame(poznoteAttachmentRefKey($refs[0]), poznoteAttachmentRefKey($refs[1]));

    $refByUrl = [];
    $newIdByUrl = [];
    foreach ($refs as $ref) {
        $refByUrl[$ref['url']] = $ref;
        $newIdByUrl[$ref['url']] = $ref['attachment'] === 'snd1' ? 'n1' : 'n2';
    }
    assertSame(
        '<iframe src="/audio_player.php?note=5&amp;attachment=n1"></iframe>'
        . '<a href="/api/v1/notes/5/attachments/n1?download=1">get</a>'
        . "\n<iframe src=\"/audio_player.php?note=5&attachment=n2\"></iframe>",
        poznoteRewriteAttachmentRefs($content, 5, $newIdByUrl, $refByUrl)
    );
});
