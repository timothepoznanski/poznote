<?php
lib('offline');

// Offline copies (README "Offline", api/v1/controllers/OfflineController.php):
// which notes a browser keeps, in what order, within which budgets.

function offlineNote(int $id, string $updated, array $extra = []): array
{
    return array_merge(['id' => $id, 'updated' => $updated, 'folder_id' => null, 'favorite' => 0, 'offline' => 0], $extra);
}

test('the days setting falls back to the default and stays within bounds', function () {
    assertSame(5, poznoteOfflineDays(null, 5, 30), 'never set');
    assertSame(5, poznoteOfflineDays('', 5, 30), 'empty');
    assertSame(5, poznoteOfflineDays(false, 5, 30), 'missing');
    assertSame(0, poznoteOfflineDays('0', 5, 30), '0 turns it off');
    assertSame(0, poznoteOfflineDays('-3', 5, 30), 'negative reads as off');
    assertSame(12, poznoteOfflineDays('12', 5, 30));
    assertSame(30, poznoteOfflineDays('400', 5, 30), 'capped at the maximum');
    assertSame(0, poznoteOfflineDays('abc', 5, 30), 'garbage reads as 0, not as the default');
});

test('a folder marked Keep offline covers every folder under it', function () {
    $folders = [
        ['id' => 1, 'parent_id' => null, 'offline' => 0],
        ['id' => 2, 'parent_id' => 1, 'offline' => 1],
        ['id' => 3, 'parent_id' => 2, 'offline' => 0],
        ['id' => 4, 'parent_id' => 3, 'offline' => 0],
        ['id' => 5, 'parent_id' => 1, 'offline' => 0],
        ['id' => 6, 'parent_id' => null, 'offline' => 0],
    ];
    $kept = poznoteOfflineFolderIds($folders);
    assertSame([2, 3, 4], array_keys($kept));
    assertSame([], poznoteOfflineFolderIds([['id' => 1, 'parent_id' => null, 'offline' => 0]]), 'nothing marked');
});

test('a parent loop does not hang the folder walk', function () {
    $kept = poznoteOfflineFolderIds([
        ['id' => 1, 'parent_id' => 2, 'offline' => 0],
        ['id' => 2, 'parent_id' => 1, 'offline' => 0],
        ['id' => 3, 'parent_id' => null, 'offline' => 1],
    ]);
    assertSame([3], array_keys($kept));
});

test('why a note is kept, most important reason first', function () {
    $cutoff = '2026-09-19 00:00:00';
    $folders = [7 => true];
    assertSame('note', poznoteOfflineReason(offlineNote(1, '2026-01-01 00:00:00', ['offline' => 1, 'favorite' => 1, 'folder_id' => 7]), $cutoff, $folders));
    assertSame('folder', poznoteOfflineReason(offlineNote(2, '2026-01-01 00:00:00', ['favorite' => 1, 'folder_id' => 7]), $cutoff, $folders));
    assertSame('favorite', poznoteOfflineReason(offlineNote(3, '2026-01-01 00:00:00', ['favorite' => 1]), $cutoff, $folders));
    assertSame('recent', poznoteOfflineReason(offlineNote(4, '2026-09-19 00:00:00'), $cutoff, $folders), 'the cutoff itself is recent');
    assertSame(null, poznoteOfflineReason(offlineNote(5, '2026-09-18 23:59:59'), $cutoff, $folders));
    assertSame(null, poznoteOfflineReason(offlineNote(6, '2026-01-01 00:00:00', ['folder_id' => 8]), $cutoff, $folders), 'another folder');
    assertSame(null, poznoteOfflineReason(offlineNote(7, ''), $cutoff, $folders), 'no date');
});

test('notes kept whatever their date come before the recent ones, newest first', function () {
    $notes = [
        offlineNote(1, '2026-09-24 10:00:00') + ['reason' => 'recent'],
        offlineNote(2, '2026-01-01 00:00:00') + ['reason' => 'favorite'],
        offlineNote(3, '2026-09-23 10:00:00') + ['reason' => 'recent'],
        offlineNote(4, '2026-03-01 00:00:00') + ['reason' => 'note'],
        offlineNote(5, '2026-03-01 00:00:00') + ['reason' => 'folder'],
    ];
    $kept = poznoteOfflineFit($notes, 100, PHP_INT_MAX, function () { return 10; });
    assertSame([5, 4, 2, 1, 3], array_column($kept, 'id'));
});

test('the budgets drop the oldest recent notes first, never the pinned ones', function () {
    $notes = [
        offlineNote(1, '2026-09-24 10:00:00') + ['reason' => 'recent'],
        offlineNote(2, '2026-09-23 10:00:00') + ['reason' => 'recent'],
        offlineNote(3, '2026-09-22 10:00:00') + ['reason' => 'recent'],
        offlineNote(4, '2025-01-01 00:00:00') + ['reason' => 'note'],
    ];
    $kept = poznoteOfflineFit($notes, 2, PHP_INT_MAX, function () { return 10; });
    assertSame([4, 1], array_column($kept, 'id'), 'the count limit');

    $kept = poznoteOfflineFit($notes, 100, 25, function () { return 10; });
    assertSame([4, 1], array_column($kept, 'id'), 'the text limit');
    assertSame(10, $kept[0]['bytes']);

    $kept = poznoteOfflineFit($notes, 100, 5, function () { return 10; });
    assertSame([4], array_column($kept, 'id'), 'the first note is always kept, even over budget');
});

test('the text of a note that will not be sent is never read', function () {
    $notes = [
        offlineNote(1, '2026-09-24 10:00:00') + ['reason' => 'recent'],
        offlineNote(2, '2026-09-23 10:00:00') + ['reason' => 'recent'],
        offlineNote(3, '2026-09-22 10:00:00') + ['reason' => 'recent'],
    ];
    $read = [];
    poznoteOfflineFit($notes, 1, PHP_INT_MAX, function ($note) use (&$read) {
        $read[] = $note['id'];
        return 1;
    });
    assertSame([1], $read);
});

test('the version token follows the date, the title and the content', function () {
    $base = poznoteNoteVersion('2026-09-24 10:00:00', 'Physics', '<p>a</p>');
    assertSame(32, strlen($base));
    assertSame($base, poznoteNoteVersion('2026-09-24 10:00:00', 'Physics', '<p>a</p>'), 'stable');
    assertTrue($base !== poznoteNoteVersion('2026-09-24 10:00:01', 'Physics', '<p>a</p>'), 'the date counts');
    assertTrue($base !== poznoteNoteVersion('2026-09-24 10:00:00', 'Chemistry', '<p>a</p>'), 'the title counts');
    assertTrue($base !== poznoteNoteVersion('2026-09-24 10:00:00', 'Physics', '<p>b</p>'), 'the content counts');
});

test('the files token follows the list of attachments, not its order', function () {
    assertSame('', poznoteOfflineFilesToken(null), 'no column');
    assertSame('', poznoteOfflineFilesToken(''), 'empty column');
    assertSame('', poznoteOfflineFilesToken('[]'), 'no attachment');
    assertSame('', poznoteOfflineFilesToken('not json'), 'unreadable');
    $one = poznoteOfflineFilesToken('[{"id":"a1","original_filename":"course.pdf"}]');
    $two = poznoteOfflineFilesToken('[{"id":"a1"},{"id":"b2"}]');
    assertSame(32, strlen($one));
    assertTrue($one !== $two, 'a file added');
    assertSame($two, poznoteOfflineFilesToken('[{"id":"b2"},{"id":"a1","file_size":10}]'), 'same files, other order and fields');
});
