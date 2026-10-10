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

test('the notes hidden from the Tasks page read as a list of distinct ids', function () {
    assertSame([12, 7], poznoteParseTasksPageHiddenNotes('[12, "7", 12]'));
    assertSame([3], poznoteParseTasksPageHiddenNotes([3]));
    assertSame([], poznoteParseTasksPageHiddenNotes(''));
    assertSame([], poznoteParseTasksPageHiddenNotes(null));
    assertSame([], poznoteParseTasksPageHiddenNotes('[]'));
});

test('anything else than a list of note ids is refused', function () {
    assertSame(null, poznoteParseTasksPageHiddenNotes('pas du json'));
    assertSame(null, poznoteParseTasksPageHiddenNotes('{"a":1}'));
    assertSame(null, poznoteParseTasksPageHiddenNotes('[0]'));
    assertSame(null, poznoteParseTasksPageHiddenNotes('[-4]'));
    assertSame(null, poznoteParseTasksPageHiddenNotes('["1 OR 1=1"]'));
    assertSame(null, poznoteParseTasksPageHiddenNotes('[1.5]'));
    assertSame(null, poznoteParseTasksPageHiddenNotes(12));
});

test('a task that does not repeat has no next occurrence', function () {
    assertSame(null, poznoteNextTaskOccurrence(['id' => 1, 'text' => 'a', 'dueAt' => '2026-10-10'], '2026-10-10 12:00'));
    assertSame(null, poznoteNextTaskOccurrence(['id' => 1, 'text' => 'a', 'dueRecurrence' => '1d'], '2026-10-10 12:00'));
    assertSame(null, poznoteNextTaskOccurrence(['id' => 1, 'dueAt' => '2026-10-10', 'dueRecurrence' => 'often'], '2026-10-10 12:00'));
});

test('the next occurrence is an open copy that keeps the repeat', function () {
    $next = poznoteNextTaskOccurrence([
        'id' => 1,
        'text' => 'water the plants',
        'completed' => true,
        'important' => true,
        'dueAt' => '2026-10-10T18:30',
        'dueReminder' => true,
        'dueRecurrence' => '1w',
        'subtasks' => [['id' => 11, 'text' => 'balcony', 'completed' => true]],
    ], '2026-10-10 12:00');

    assertFalse(array_key_exists('id', $next));
    assertSame('water the plants', $next['text']);
    assertFalse($next['completed']);
    assertTrue($next['important']);
    assertTrue($next['dueReminder']);
    assertSame('1w', $next['dueRecurrence']);
    assertSame('2026-10-17T18:30', $next['dueAt']);
    assertFalse($next['subtasks'][0]['completed']);
});

test('the next due date is the first one of the schedule still ahead', function () {
    $due = static function (string $dueAt, string $recurrence, string $now): string {
        return poznoteNextTaskOccurrence(['dueAt' => $dueAt, 'dueRecurrence' => $recurrence], $now)['dueAt'];
    };

    // Completed early: the occurrence after the one being ticked
    assertSame('2026-10-12', $due('2026-10-11', '1d', '2026-10-10 12:00'));
    // A date without a time counts as 09:00
    assertSame('2026-10-10', $due('2026-10-09', '1d', '2026-10-10 08:00'));
    assertSame('2026-10-11', $due('2026-10-09', '1d', '2026-10-10 15:00'));
    // Long overdue: missed occurrences are skipped, the weekday is kept
    assertSame('2026-10-15', $due('2026-09-03', '1w', '2026-10-10 12:00'));
    assertSame('2026-10-10T14:00', $due('2026-10-10T08:00', '3h', '2026-10-10 12:00'));
    assertSame('2026-11-05', $due('2026-08-05', '1m', '2026-10-10 12:00'));
    assertSame('2027-02-01T10:00', $due('2025-02-01T10:00', '1y', '2026-10-10 12:00'));
});
