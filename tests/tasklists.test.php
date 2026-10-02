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

test('subtasks survive normalisation, cleaned to one level', function () {
    $json = json_encode([[
        'id' => 1,
        'text' => 'parent',
        'completed' => false,
        'subtasks' => [
            ['id' => 11, 'text' => 'a', 'done' => true, 'note' => 'kept'],
            'not a subtask',
            ['id' => 12, 'text' => 'b', 'subtasks' => [['id' => 121, 'text' => 'too deep']]],
        ],
    ]]);

    $out = json_decode(normalizeTasklistJsonContent($json), true);
    $subtasks = $out[0]['subtasks'];

    assertSame(2, count($subtasks));
    assertSame('a', $subtasks[0]['text']);
    assertTrue($subtasks[0]['completed']);
    assertSame('kept', $subtasks[0]['note'], 'unknown keys are kept');
    assertFalse(array_key_exists('done', $subtasks[0]));
    assertFalse($subtasks[1]['completed']);
    assertFalse(array_key_exists('subtasks', $subtasks[1]), 'no second level');
});

test('a task without subtasks gains no subtasks key', function () {
    $out = json_decode(normalizeTasklistJsonContent('[{"id":1,"text":"a","completed":false}]'), true);
    assertFalse(array_key_exists('subtasks', $out[0]));
    assertSame([], getTasklistSubtasks($out[0]));
});

test('readers get the subtasks that have a text, and can address them back', function () {
    $task = ['id' => 1, 'text' => 'parent', 'subtasks' => [
        ['id' => 11, 'text' => '  '],
        ['id' => 12, 'text' => 'shown first', 'completed' => true],
        ['id' => 13, 'text' => 'shown second'],
    ]];

    $subtasks = getTasklistSubtasks($task);
    assertSame(2, count($subtasks));
    assertSame(['id' => 12, 'text' => 'shown first', 'completed' => true], $subtasks[0]);
    assertFalse($subtasks[1]['completed']);

    // The position a page displays maps back to the stored entry
    assertSame(1, resolveTasklistSubtaskKey($task, 0));
    assertSame(2, resolveTasklistSubtaskKey($task, 1));
    assertSame(null, resolveTasklistSubtaskKey($task, 2));
    assertSame(null, resolveTasklistSubtaskKey(['id' => 2, 'text' => 'none'], 0));
});

test('the static subtask markup escapes labels and stays invisible to the HTML importer', function () {
    $task = ['id' => 1, 'text' => 'parent', 'subtasks' => [
        ['id' => 11, 'text' => '<b>bold</b>', 'completed' => true],
        ['id' => 12, 'text' => 'open'],
    ]];

    $html = renderTasklistSubtasksHtml($task);
    assertContains('&lt;b&gt;bold&lt;/b&gt;', $html);
    assertNotContains('<b>', $html);
    assertContains('class="task-subitem completed"', $html);
    assertSame(1, substr_count($html, ' checked'));
    assertSame(2, substr_count($html, ' disabled'));

    // extractTaskListFromHTML() finds tasks with contains(@class, "task-item")
    // and their label with contains(@class, "task-text")
    assertNotContains('task-item', $html);
    assertNotContains('task-text', $html);

    assertSame('', renderTasklistSubtasksHtml(['id' => 2, 'text' => 'none']));
});

test('a subtask id is found as the client holds it, float digits included', function () {
    $subtasks = [
        ['id' => 1786657214842.3545, 'text' => 'float'],
        ['id' => '12', 'text' => 'string'],
        ['text' => 'no id'],
    ];

    assertSame(0, findTasklistSubtaskKey($subtasks, '1786657214842.3545'));
    assertSame(1, findTasklistSubtaskKey($subtasks, ' 12 '));
    assertSame(null, findTasklistSubtaskKey($subtasks, '1786657214842.4'), 'a rounded id matches nothing');
    assertSame(null, findTasklistSubtaskKey($subtasks, ''));
});

test('subtasks written without a usable id get one, the others keep theirs', function () {
    $out = ensureTasklistSubtaskIds([
        ['id' => 11, 'text' => 'kept'],
        ['text' => 'no id'],
        ['id' => 11, 'text' => 'duplicate'],
        ['id' => 'abc', 'text' => 'not a number'],
        'not a subtask',
    ]);

    assertSame(4, count($out), 'what is not an object is dropped');
    assertSame(11, $out[0]['id']);

    $ids = [];
    foreach ($out as $subtask) {
        assertTrue(is_int($subtask['id']) || is_float($subtask['id']));
        $ids[tasklistIdToString($subtask['id'])] = true;
    }
    assertSame(4, count($ids), 'ids are unique in the task');
    assertSame('duplicate', $out[2]['text']);
});
