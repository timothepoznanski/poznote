<?php
/**
 * Which reminders does GET /reminders answer with: the ones that already
 * fired, the ones still to come, or both.
 *
 * Issue #1740. The endpoint behind the bell icon has always filtered on
 * "trigger_at <= now", so the only way to learn about a future reminder was
 * to ask for one note at a time (GET /notes/{id}/reminder). An unattended
 * client doing a weekly review had to walk every note of the workspace to
 * answer a question the database can answer in one row set.
 *
 * Future reminders are already in the notifications table: a row is inserted
 * when the reminder is set, with its trigger_at in the future, and the senders
 * (push, e-mail, webhook) pick it up when that time comes. "Upcoming" is
 * therefore the same rows seen from the other side of now, not a second
 * source of truth, and a reminder that will never fire (because it was
 * dismissed) is out of both halves.
 *
 * Pure functions on purpose: no session, no database, see
 * tests/reminder-scope.test.php.
 */

/** The scope of a reminder listing, when the caller asks for none. */
const POZNOTE_REMINDER_SCOPE_DEFAULT = 'fired';

/** Rows returned when the caller asks for no limit, the historical LIMIT 50. */
const POZNOTE_REMINDER_LIMIT_DEFAULT = 50;

/** Most rows one call can ask for. */
const POZNOTE_REMINDER_LIMIT_MAX = 500;

/**
 * Read the "scope" parameter.
 *
 * Absent or empty means 'fired', so the bell feed and every existing caller
 * keep the behaviour they have. Anything else unknown is refused rather than
 * silently read as the default: a client that misspells "upcomming" must not
 * be told "nothing is scheduled".
 *
 * @return string|null one of fired/upcoming/all, or null when not a scope
 */
function poznoteNormalizeReminderScope($value): ?string {
    if ($value === null) {
        return POZNOTE_REMINDER_SCOPE_DEFAULT;
    }
    if (!is_scalar($value)) {
        // ?scope[]=fired is not a scope
        return null;
    }
    $scope = strtolower(trim((string)$value));
    if ($scope === '') {
        return POZNOTE_REMINDER_SCOPE_DEFAULT;
    }
    return in_array($scope, ['fired', 'upcoming', 'all'], true) ? $scope : null;
}

/**
 * Read the "limit" parameter.
 *
 * Absent means the historical 50. A value out of range is refused instead of
 * being clamped, so a caller asking for 5 000 rows learns that it cannot have
 * them rather than wondering why it got 500.
 *
 * @return int|null the number of rows to return, or null when not a limit
 */
function poznoteNormalizeReminderLimit($value): ?int {
    if ($value === null) {
        return POZNOTE_REMINDER_LIMIT_DEFAULT;
    }
    if (!is_scalar($value)) {
        return null;
    }
    $raw = trim((string)$value);
    if ($raw === '') {
        return POZNOTE_REMINDER_LIMIT_DEFAULT;
    }
    // Not ctype_digit on purpose: "50.0" and "+50" are not limits either, and
    // intval() would read them as one.
    if (!preg_match('/^\d+$/', $raw)) {
        return null;
    }
    $limit = (int)$raw;
    if ($limit < 1 || $limit > POZNOTE_REMINDER_LIMIT_MAX) {
        return null;
    }
    return $limit;
}

/**
 * The WHERE fragment that keeps the half of the feed the scope names.
 *
 * $nowUtc is passed in rather than read from the clock so that the listing and
 * its counters compare against the very same instant, and so that a test can
 * put "now" where it wants it.
 *
 * @return array{sql: string, params: string[]}
 */
function poznoteReminderScopeFilter(string $scope, string $nowUtc): array {
    if ($scope === 'upcoming') {
        return ['sql' => 'AND n.trigger_at > ?', 'params' => [$nowUtc]];
    }
    if ($scope === 'all') {
        return ['sql' => '', 'params' => []];
    }
    return ['sql' => 'AND n.trigger_at <= ?', 'params' => [$nowUtc]];
}

/**
 * The ORDER BY fragment for a scope.
 *
 * Each half is ordered by what a reader of that half wants first: the latest
 * notification for what has fired (the bell list), the soonest for what is
 * coming. 'all' keeps those two orders and puts the fired half first, so a
 * LIMIT cuts into the future rather than hiding a notification that is
 * already waiting.
 *
 * @return array{sql: string, params: string[]}
 */
function poznoteReminderScopeOrder(string $scope, string $nowUtc): array {
    if ($scope === 'upcoming') {
        return ['sql' => 'n.trigger_at ASC', 'params' => []];
    }
    if ($scope === 'all') {
        return [
            'sql' => 'CASE WHEN n.trigger_at <= ? THEN 0 ELSE 1 END, '
                . 'CASE WHEN n.trigger_at <= ? THEN n.trigger_at END DESC, '
                . 'n.trigger_at ASC',
            'params' => [$nowUtc, $nowUtc],
        ];
    }
    return ['sql' => 'n.trigger_at DESC', 'params' => []];
}

/**
 * The state of one row of the feed, as the listing reports it.
 *
 * Both halves travel in the same array, so each row says which one it is in
 * instead of leaving the caller to compare timestamps against a clock that is
 * not the server's.
 */
function poznoteReminderState(string $triggerAt, string $nowUtc): string {
    return $triggerAt <= $nowUtc ? 'fired' : 'upcoming';
}
