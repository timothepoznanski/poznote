<?php
lib('workspace-activity');

// Discussion #1545: members of a shared workspace can be emailed about what
// the others changed in it, as it happens or as a daily or weekly summary.
// The service that reads the databases and sends is not reachable from here;
// what is pinned down is every decision it delegates: who is told about a
// note, when a summary is owed, how long "instant" waits, and that a link
// only opens for the person it was signed for.

function activityTs(string $local, string $timezone): int
{
    return (new DateTimeImmutable($local, new DateTimeZone($timezone)))->getTimestamp();
}

test('an unknown or missing frequency means no email', function () {
    assertSame('off', poznoteNormalizeWorkspaceActivityFrequency(null));
    assertSame('off', poznoteNormalizeWorkspaceActivityFrequency(''));
    assertSame('off', poznoteNormalizeWorkspaceActivityFrequency('hourly'));
    assertSame('off', poznoteNormalizeWorkspaceActivityFrequency(['daily']));
    assertSame('daily', poznoteNormalizeWorkspaceActivityFrequency(' Daily '));
    assertSame('instant', poznoteNormalizeWorkspaceActivityFrequency('instant'));
    assertSame('weekly', poznoteNormalizeWorkspaceActivityFrequency('weekly'));
});

test('the daily slot is 08:00 in the reader timezone, today or yesterday', function () {
    $tz = 'Europe/Paris';
    assertSame(
        activityTs('2026-10-02 08:00', $tz),
        poznoteWorkspaceActivitySlot('daily', activityTs('2026-10-02 08:00', $tz), $tz),
        'at 08:00 sharp'
    );
    assertSame(
        activityTs('2026-10-02 08:00', $tz),
        poznoteWorkspaceActivitySlot('daily', activityTs('2026-10-02 23:30', $tz), $tz),
        'late evening'
    );
    assertSame(
        activityTs('2026-10-01 08:00', $tz),
        poznoteWorkspaceActivitySlot('daily', activityTs('2026-10-02 07:59', $tz), $tz),
        'before 08:00'
    );
    // Same instant, another reader: 07:30 in Paris is already 14:30 in Tokyo
    assertSame(
        activityTs('2026-10-02 08:00', 'Asia/Tokyo'),
        poznoteWorkspaceActivitySlot('daily', activityTs('2026-10-02 07:30', $tz), 'Asia/Tokyo'),
        'Tokyo'
    );
});

test('the weekly slot is 08:00 on the latest Monday', function () {
    $tz = 'Europe/Paris';
    // 2026-10-02 is a Friday, 2026-09-28 the Monday before it
    assertSame(
        activityTs('2026-09-28 08:00', $tz),
        poznoteWorkspaceActivitySlot('weekly', activityTs('2026-10-02 12:00', $tz), $tz),
        'a Friday'
    );
    assertSame(
        activityTs('2026-09-28 08:00', $tz),
        poznoteWorkspaceActivitySlot('weekly', activityTs('2026-10-04 23:00', $tz), $tz),
        'the Sunday of that week'
    );
    assertSame(
        activityTs('2026-09-28 08:00', $tz),
        poznoteWorkspaceActivitySlot('weekly', activityTs('2026-10-05 07:00', $tz), $tz),
        'Monday before 08:00 still belongs to the week before'
    );
    assertSame(
        activityTs('2026-10-05 08:00', $tz),
        poznoteWorkspaceActivitySlot('weekly', activityTs('2026-10-05 08:00', $tz), $tz),
        'Monday 08:00'
    );
});

test('frequencies without a slot have none, and a bad timezone falls back to UTC', function () {
    assertSame(null, poznoteWorkspaceActivitySlot('instant', 1790000000, 'UTC'));
    assertSame(null, poznoteWorkspaceActivitySlot('off', 1790000000, 'UTC'));
    assertSame(
        activityTs('2026-10-02 08:00', 'UTC'),
        poznoteWorkspaceActivitySlot('daily', activityTs('2026-10-02 09:00', 'UTC'), 'Not/AZone')
    );
});

test('a summary is owed once per slot', function () {
    $tz = 'Europe/Paris';
    $yesterdayEvening = activityTs('2026-10-01 19:00', $tz);
    assertFalse(poznoteWorkspaceActivitySummaryDue('daily', activityTs('2026-10-02 07:59', $tz), $yesterdayEvening, $tz));
    assertTrue(poznoteWorkspaceActivitySummaryDue('daily', activityTs('2026-10-02 08:00', $tz), $yesterdayEvening, $tz));
    // Sent at 08:00: the mark is past the slot, nothing more until tomorrow
    $sent = activityTs('2026-10-02 08:00', $tz);
    assertFalse(poznoteWorkspaceActivitySummaryDue('daily', activityTs('2026-10-02 18:00', $tz), $sent, $tz));
    assertTrue(poznoteWorkspaceActivitySummaryDue('daily', activityTs('2026-10-03 08:01', $tz), $sent, $tz));

    assertFalse(poznoteWorkspaceActivitySummaryDue('weekly', activityTs('2026-10-04 12:00', $tz), activityTs('2026-09-28 08:00', $tz), $tz));
    assertTrue(poznoteWorkspaceActivitySummaryDue('weekly', activityTs('2026-10-05 08:00', $tz), activityTs('2026-09-28 08:00', $tz), $tz));
    assertFalse(poznoteWorkspaceActivitySummaryDue('instant', activityTs('2026-10-05 08:00', $tz), 0, $tz));
});

test('instant waits for a pause, but not for ever', function () {
    $now = 1790000000;
    // Still being typed: saved 20 seconds ago, first touched 2 minutes ago
    assertFalse(poznoteWorkspaceActivityInstantReady($now, $now - 20, $now - 120));
    // Quiet for five minutes
    assertTrue(poznoteWorkspaceActivityInstantReady($now, $now - 300, $now - 400));
    // Someone keeps typing, but the oldest change has waited half an hour
    assertTrue(poznoteWorkspaceActivityInstantReady($now, $now - 20, $now - 1800));
});

test('a reader is never told about their own write', function () {
    $since = '2026-10-02 08:00:00';
    $row = ['created' => '2026-09-01 10:00:00', 'updated' => '2026-10-02 09:00:00', 'trash' => 0,
        'created_by_user_id' => 5, 'updated_by_user_id' => 7];
    assertSame(null, poznoteClassifyWorkspaceActivity($row, 7, 5, $since));
    assertSame(['kind' => 'edited', 'actor' => 7], poznoteClassifyWorkspaceActivity($row, 5, 5, $since));
    assertSame(['kind' => 'edited', 'actor' => 7], poznoteClassifyWorkspaceActivity($row, 9, 5, $since));
});

test('a note without a recorded writer is its owner\'s', function () {
    $since = '2026-10-02 08:00:00';
    $row = ['created' => '2026-09-01 10:00:00', 'updated' => '2026-10-02 09:00:00', 'trash' => 0,
        'created_by_user_id' => null, 'updated_by_user_id' => null];
    assertSame(null, poznoteClassifyWorkspaceActivity($row, 5, 5, $since), 'the owner reads');
    assertSame(['kind' => 'edited', 'actor' => 5], poznoteClassifyWorkspaceActivity($row, 7, 5, $since), 'a grantee reads');
    // 0 is what a write records when nobody is signed in
    $row['updated_by_user_id'] = 0;
    assertSame(['kind' => 'edited', 'actor' => 5], poznoteClassifyWorkspaceActivity($row, 7, 5, $since));
});

test('created, edited and deleted are told apart', function () {
    $since = '2026-10-02 08:00:00';
    $created = ['created' => '2026-10-02 08:30:00', 'updated' => '2026-10-02 09:00:00', 'trash' => 0,
        'created_by_user_id' => 7, 'updated_by_user_id' => 7];
    assertSame(['kind' => 'created', 'actor' => 7], poznoteClassifyWorkspaceActivity($created, 5, 5, $since));

    // Created before the previous email: only an edit is news
    $old = ['created' => '2026-10-02 07:00:00'] + $created;
    assertSame(['kind' => 'edited', 'actor' => 7], poznoteClassifyWorkspaceActivity($old, 5, 5, $since));

    // Created by the reader, then edited by someone else
    $mine = ['created_by_user_id' => 5] + $created;
    assertSame(['kind' => 'edited', 'actor' => 7], poznoteClassifyWorkspaceActivity($mine, 5, 5, $since));

    $deleted = ['trash' => 1] + $created;
    assertSame(['kind' => 'deleted', 'actor' => 7], poznoteClassifyWorkspaceActivity($deleted, 5, 5, $since));
    assertSame(null, poznoteClassifyWorkspaceActivity($deleted, 7, 5, $since), 'deleted by the reader');
});

test('a link opens only with the signature made for it', function () {
    $key = 'test-key';
    parse_str(poznoteWorkspaceActivityLinkQuery($key, 7, 5, 'Team & co', 42), $params);
    assertSame(['owner', 'workspace', 'note', 'u', 'sig'], array_keys($params));
    assertSame('Team & co', $params['workspace']);
    assertTrue(poznoteWorkspaceActivityLinkIsValid($key, $params));

    // Every field is covered: another reader, owner, workspace or note is refused
    foreach (['u' => '8', 'owner' => '6', 'workspace' => 'Team', 'note' => '43'] as $name => $value) {
        assertFalse(poznoteWorkspaceActivityLinkIsValid($key, [$name => $value] + $params), $name);
    }
    assertFalse(poznoteWorkspaceActivityLinkIsValid('another-key', $params), 'another instance');
    assertFalse(poznoteWorkspaceActivityLinkIsValid($key, ['sig' => ''] + $params), 'no signature');
    assertFalse(poznoteWorkspaceActivityLinkIsValid($key, ['sig' => ['x']] + $params), 'array signature');
    assertFalse(poznoteWorkspaceActivityLinkIsValid($key, ['note' => ['42']] + $params), 'array note');
    assertFalse(poznoteWorkspaceActivityLinkIsValid($key, ['owner' => '5x'] + $params), 'non numeric owner');
    assertFalse(poznoteWorkspaceActivityLinkIsValid($key, []), 'nothing at all');
});

test('the fields of a link cannot be shifted into one another', function () {
    // Reader 1 + owner 23 must not sign the same as reader 12 + owner 3
    assertTrue(
        poznoteWorkspaceActivityLinkSignature('k', 1, 23, 'W', 4)
        !== poznoteWorkspaceActivityLinkSignature('k', 12, 3, 'W', 4)
    );
    // A workspace name holding a line break cannot stand in for another field
    assertTrue(
        poznoteWorkspaceActivityLinkSignature('k', 1, 2, "3\nW", 0)
        !== poznoteWorkspaceActivityLinkSignature('k', 1, 2, 'W', 3)
    );
});
