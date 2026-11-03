<?php

lib('speed-dial');

test('a note is on the speed dial only with the whole tag', function () {
    assertTrue(poznoteHasSpeedDialTag('speed-dial'));
    assertTrue(poznoteHasSpeedDialTag('work, Speed-Dial ,home'));
    assertTrue(!poznoteHasSpeedDialTag('my-speed-dial-notes'));
    assertTrue(!poznoteHasSpeedDialTag(''));
});

test('a markdown note gives its links, rows split by a rule', function () {
    $rows = poznoteSpeedDialParseMarkdown(implode("\n", [
        '---',
        'tags: speed-dial',
        '---',
        '[![Google](https://cdn.example/g.svg "Google")](https://google.com)',
        '',
        '[![a](https://cdn.example/h.svg)](https://github.com "GitHub")',
        '',
        '----',
        '',
        '[Wiki](https://en.wikipedia.org/wiki/Foo_(bar))',
        'and https://example.com/page.',
    ]));
    assertSame(2, count($rows));
    assertSame('https://google.com', $rows[0][0]['url']);
    assertSame('Google', $rows[0][0]['label']);
    assertSame('https://cdn.example/g.svg', $rows[0][0]['image']);
    assertSame('GitHub', $rows[0][1]['label']);
    assertSame('https://en.wikipedia.org/wiki/Foo_(bar)', $rows[1][0]['url']);
    assertSame('Wiki', $rows[1][0]['label']);
    assertSame('https://example.com/page', $rows[1][1]['url']);
});

test('only web links count in a markdown note', function () {
    $rows = poznoteSpeedDialParseMarkdown(implode("\n", [
        '# Title',
        '[x](javascript:alert(1))',
        '[note](index.php?note=3)',
        '![alone](https://cdn.example/i.png)',
        '`https://in-code.example`',
        '```',
        'https://in-a-block.example',
        '```',
        '<div data-excalidraw="{&quot;source&quot;:&quot;https://excalidraw.com&quot;}"><img src="https://x.example/a.png"></div>',
    ]));
    assertSame([], $rows);
});

test('a rich text note gives its links, rows split by a rule', function () {
    $rows = poznoteSpeedDialParseHtml('<p><a href="https://a.example" title="A"><img src="https://x.example/a.png"></a> <a href="https://b.example">B &amp; co</a></p><hr><a href="javascript:alert(1)">x</a><a href="https://c.example">C</a>');
    assertSame(2, count($rows));
    assertSame('A', $rows[0][0]['label']);
    assertSame('https://x.example/a.png', $rows[0][0]['image']);
    assertSame('B & co', $rows[0][1]['label']);
    assertSame(1, count($rows[1]));
    assertSame('https://c.example', $rows[1][0]['url']);
});

test('every rule of a note counts, even with nothing after it', function () {
    $rows = poznoteSpeedDialParseMarkdown("[A](https://a.example)\n\n[B](https://b.example)\n\n----\n\n[C](https://c.example)\n\n----\n");
    assertSame(3, count($rows));
    assertSame(2, count($rows[0]));
    assertSame(1, count($rows[1]));
    assertSame([], $rows[2]);

    $rows = poznoteSpeedDialParseHtml('<a href="https://a.example">A</a><hr><hr><a href="https://b.example">B</a><hr>');
    assertSame(4, count($rows));
    assertSame([], $rows[1]);
    assertSame([], $rows[3]);
});

test('a rule right under a line of text is a rule, as in the rendered note', function () {
    assertSame(2, count(poznoteSpeedDialParseMarkdown("Text\n---\n\n[A](https://a.example)")));
    assertSame([], poznoteSpeedDialParseMarkdown("----\n\ntext\n\n----\n"));
});

test('a heading is no separator and adds nothing, its link stays a link', function () {
    $rows = poznoteSpeedDialParseMarkdown("# Test\n\n[A](https://a.example)\n\n## [B](https://b.example)\n\n[C](https://c.example)");
    assertSame(1, count($rows));
    assertSame(['https://a.example', 'https://b.example', 'https://c.example'], array_column($rows[0], 'url'));

    $rows = poznoteSpeedDialParseHtml('<h1>Test</h1><a href="https://a.example">A</a><h2>Other</h2><a href="https://b.example">B</a>');
    assertSame(1, count($rows));
    assertSame(2, count($rows[0]));
});

test('the colours of the labels only keep notes and hex colours', function () {
    $colors = poznoteSpeedDialNormalizeLabelColors([
        '105' => '#DC2626',
        '106' => 'red;}',
        '107' => ['#000000'],
        'x' => '#dc2626',
    ]);
    assertSame(['105' => '#dc2626'], $colors);
    assertSame('{"105":"#dc2626"}', json_encode($colors, JSON_FORCE_OBJECT));
});

test('the size of the tiles is a width the slider offers', function () {
    assertSame(140, poznoteSpeedDialTileSize('140'));
    assertSame(260, poznoteSpeedDialTileSize(9999));
    assertSame(80, poznoteSpeedDialTileSize('-5'));
    assertSame(150, poznoteSpeedDialTileSize('147'));
    assertSame(140, poznoteSpeedDialTileSize('large'));
    assertSame(140, poznoteSpeedDialTileSize('1px;}'));
});

test('a rich text note gives the addresses written as plain text too', function () {
    $rows = poznoteSpeedDialParseHtml('<p>https://a.example/x?a=1&amp;b=2.</p><p><img src="https://img.example/i.png" data-x="https://attr.example"> https://b.example&nbsp;</p><hr><a href="https://c.example">https://c.example</a><pre>https://code.example</pre><code>https://inline.example</code>');
    assertSame(2, count($rows));
    assertSame(['https://a.example/x?a=1&b=2', 'https://b.example'], array_column($rows[0], 'url'));
    assertSame('', $rows[0][0]['label']);
    assertSame(['https://c.example'], array_column($rows[1], 'url'));
    assertSame([], poznoteSpeedDialParseHtml('<p>no address</p><hr><img src="https://img.example/i.png">'));
});

test('a speed dial is a tag', function () {
    assertTrue(poznoteHasSpeedDialTag('work, speed-dial-Travail', 'speed-dial-travail'));
    assertTrue(!poznoteHasSpeedDialTag('speed-dial-Travail'));
    assertTrue(!poznoteHasSpeedDialTag('speed-dial', 'speed-dial-travail'));
    assertTrue(poznoteSpeedDialIsBoardTag('speed-dial'));
    assertTrue(poznoteSpeedDialIsBoardTag('Speed-Dial-Maison'));
    assertTrue(!poznoteSpeedDialIsBoardTag('speed-dial-'));
    assertTrue(!poznoteSpeedDialIsBoardTag('my-speed-dial'));
    assertSame(['speed-dial', 'speed-dial-a_b'], poznoteSpeedDialTagsOf('x, Speed-Dial, speed-dial-A_B, my-speed-dial'));
});

test('a name gives a tag and back, or nothing', function () {
    assertSame('speed-dial-Mes_liens', poznoteSpeedDialTagFromName('  Mes liens '));
    assertSame('Mes liens', poznoteSpeedDialBoardName('speed-dial-Mes_liens'));
    assertSame(null, poznoteSpeedDialBoardName('speed-dial'));
    assertSame('speed-dial-a_b', poznoteSpeedDialTagFromName('a, b'));
    foreach (['', '   ', 'a/b', 'a<b', 'a"b', "a'b", 'a&b', str_repeat('x', 51)] as $bad) {
        assertSame(null, poznoteSpeedDialTagFromName($bad));
    }
});

test('the speed dials of a workspace: default first, created ones, tags in use, no double', function () {
    assertSame(['speed-dial'], poznoteSpeedDialMergeBoards([], []));
    assertSame(
        ['speed-dial', 'speed-dial-Empty', 'speed-dial-Used'],
        poznoteSpeedDialMergeBoards(['speed-dial-Empty', 'junk', 42], ['x, speed-dial-Used', 'speed-dial-empty, my-speed-dial-notes', 'SPEED-DIAL-USED'])
    );
});

test('only a named speed dial has a background key, the same whatever the case', function () {
    assertSame('', poznoteSpeedDialBackgroundKey('speed-dial'));
    assertSame(poznoteSpeedDialBackgroundKey('speed-dial-A'), poznoteSpeedDialBackgroundKey('speed-dial-a'));
    assertTrue(preg_match('/^[0-9a-f]{10}$/', poznoteSpeedDialBackgroundKey('speed-dial-a')) === 1);
});
