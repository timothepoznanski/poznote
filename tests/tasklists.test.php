<?php
lib('tasklists');

test('content that is not JSON normalises to nothing, valid JSON to a list', function () {
    assertSame('', normalizeTasklistJsonContent('pas du json'));
    assertSame('', normalizeTasklistJsonContent(''));
    assertSame('[]', normalizeTasklistJsonContent('{}'));
});

test('a task keeps its text and its completed flag', function () {
    $out = json_decode(normalizeTasklistJsonContent('{"tasks":[{"id":"1","text":"a","completed":true}]}'), true);
    assertSame(1, count($out));
    assertSame('a', $out[0]['text']);
    assertTrue((bool) $out[0]['completed']);
});
