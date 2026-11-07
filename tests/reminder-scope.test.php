<?php
lib('reminder-queries');

// Issue #1740: GET /reminders only ever answered with the reminders that had
// already fired, so "what is coming" needed one call per note. The scope
// parameter opens the other half of the same table.
//
// The clauses are run against a real in-memory SQLite, because a WHERE that
// looks right and selects the wrong side of now is exactly the bug these
// tests exist to catch. "Now" is fixed at 2026-11-06 12:00:00 UTC.

const REMINDER_NOW = '2026-11-06 12:00:00';

function reminderScopeDb(): PDO {
    $con = new Pdo\Sqlite('sqlite::memory:');
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, heading TEXT, workspace TEXT, trash INTEGER DEFAULT 0, reminder_recurrence TEXT)');
    $con->exec('CREATE TABLE notifications (id INTEGER PRIMARY KEY, note_id INTEGER, task_id TEXT, type TEXT, message TEXT, is_read INTEGER DEFAULT 0, dismissed INTEGER DEFAULT 0, created TEXT, trigger_at TEXT, recurrence TEXT)');

    $notes = $con->prepare('INSERT INTO entries (id, heading, workspace, trash, reminder_recurrence) VALUES (?, ?, ?, ?, ?)');
    $notes->execute([1, 'Weekly review', 'Poznote', 0, '1w']);
    $notes->execute([2, 'Invoices', 'Poznote', 0, null]);
    $notes->execute([3, 'Research log', 'Lab', 0, null]);
    $notes->execute([4, 'Old plan', 'Poznote', 1, null]);

    $notifs = $con->prepare('INSERT INTO notifications (id, note_id, task_id, type, message, is_read, dismissed, created, trigger_at, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    // Already fired, still pending.
    $notifs->execute([10, 1, null, 'reminder', 'Weekly review', 0, 0, REMINDER_NOW, '2026-11-02 09:00:00', null]);
    $notifs->execute([11, 2, null, 'reminder', 'Invoices', 1, 0, REMINDER_NOW, '2026-11-05 09:00:00', null]);
    // Exactly now counts as fired: the senders pick up trigger_at <= now.
    $notifs->execute([12, 2, null, 'reminder', 'Right now', 0, 0, REMINDER_NOW, REMINDER_NOW, null]);
    // Still to come.
    $notifs->execute([13, 1, null, 'reminder', 'Next review', 0, 0, REMINDER_NOW, '2026-11-09 09:00:00', null]);
    $notifs->execute([14, 2, '1762000000001', 'reminder', 'Pay the VAT', 0, 0, REMINDER_NOW, '2026-11-07 08:00:00', '1m']);
    $notifs->execute([15, 3, null, 'reminder', 'Rerun the batch', 0, 0, REMINDER_NOW, '2026-11-20 09:00:00', null]);
    // Dismissed: in neither half.
    $notifs->execute([16, 1, null, 'reminder', 'Done with it', 0, 1, REMINDER_NOW, '2026-11-08 09:00:00', null]);
    // On a trashed note: the join keeps the row with no heading, exactly as
    // the bell feed keeps it today (the senders will fire it too).
    $notifs->execute([17, 4, null, 'reminder', 'Forgotten', 0, 0, REMINDER_NOW, '2026-11-10 09:00:00', null]);

    return $con;
}

/**
 * Run the listing the controller runs, and return the notification ids in the
 * order the scope asks for.
 *
 * @return int[]
 */
function reminderScopeIds(PDO $con, string $scope, ?string $workspace = null, int $limit = 500): array {
    $filter = poznoteReminderScopeFilter($scope, REMINDER_NOW);
    $order = poznoteReminderScopeOrder($scope, REMINDER_NOW);
    $workspaceClause = $workspace !== null ? 'AND e.workspace = ?' : '';
    $workspaceParams = $workspace !== null ? [$workspace] : [];

    $sql = "SELECT n.id FROM notifications n
            LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
            WHERE n.dismissed = 0
              {$filter['sql']}
              $workspaceClause
            ORDER BY {$order['sql']}
            LIMIT ?";
    $stmt = $con->prepare($sql);
    $params = array_merge($filter['params'], $workspaceParams, $order['params'], [$limit]);
    foreach ($params as $i => $value) {
        $stmt->bindValue($i + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->execute();
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

test('the default scope is the fired feed, and an unknown scope is refused rather than guessed', function () {
    assertSame('fired', poznoteNormalizeReminderScope(null));
    assertSame('fired', poznoteNormalizeReminderScope(''));
    assertSame('fired', poznoteNormalizeReminderScope('  '));
    assertSame('fired', poznoteNormalizeReminderScope('FIRED'));
    assertSame('upcoming', poznoteNormalizeReminderScope(' upcoming '));
    assertSame('all', poznoteNormalizeReminderScope('all'));
    // A misspelling must not be read as "nothing is scheduled".
    assertSame(null, poznoteNormalizeReminderScope('upcomming'));
    assertSame(null, poznoteNormalizeReminderScope('future'));
    assertSame(null, poznoteNormalizeReminderScope(['fired']));
});

test('the limit defaults to the historical 50 and is refused out of range', function () {
    assertSame(50, poznoteNormalizeReminderLimit(null));
    assertSame(50, poznoteNormalizeReminderLimit(''));
    assertSame(1, poznoteNormalizeReminderLimit('1'));
    assertSame(500, poznoteNormalizeReminderLimit(500));
    assertSame(null, poznoteNormalizeReminderLimit('0'));
    assertSame(null, poznoteNormalizeReminderLimit('501'));
    assertSame(null, poznoteNormalizeReminderLimit('-5'));
    assertSame(null, poznoteNormalizeReminderLimit('50.0'));
    assertSame(null, poznoteNormalizeReminderLimit('all'));
    assertSame(null, poznoteNormalizeReminderLimit(['50']));
});

test('scope=fired keeps exactly what the bell showed before, latest first', function () {
    $con = reminderScopeDb();
    assertSame([12, 11, 10], reminderScopeIds($con, 'fired'));
});

test('scope=upcoming lists only the future, soonest first', function () {
    $con = reminderScopeDb();
    // 14 (07th), 13 (09th), 17 (10th), 15 (20th). The dismissed 16 is out.
    assertSame([14, 13, 17, 15], reminderScopeIds($con, 'upcoming'));
});

test('a reminder due at this very second is fired, not upcoming', function () {
    $con = reminderScopeDb();
    assertSame(true, in_array(12, reminderScopeIds($con, 'fired'), true));
    assertSame(false, in_array(12, reminderScopeIds($con, 'upcoming'), true));
    assertSame('fired', poznoteReminderState(REMINDER_NOW, REMINDER_NOW));
    assertSame('upcoming', poznoteReminderState('2026-11-06 12:00:01', REMINDER_NOW));
});

test('scope=all puts the fired half first so a limit cuts into the future', function () {
    $con = reminderScopeDb();
    assertSame([12, 11, 10, 14, 13, 17, 15], reminderScopeIds($con, 'all'));
    assertSame([12, 11, 10, 14], reminderScopeIds($con, 'all', null, 4));
});

test('a workspace filter applies to both halves, and leaves out the trashed notes', function () {
    $con = reminderScopeDb();
    assertSame([14, 13], reminderScopeIds($con, 'upcoming', 'Poznote'));
    assertSame([15], reminderScopeIds($con, 'upcoming', 'Lab'));
    assertSame([12, 11, 10, 14, 13], reminderScopeIds($con, 'all', 'Poznote'));
});

test('the limit cuts the list without reordering it', function () {
    $con = reminderScopeDb();
    assertSame([14], reminderScopeIds($con, 'upcoming', null, 1));
    assertSame([12, 11], reminderScopeIds($con, 'fired', null, 2));
});
