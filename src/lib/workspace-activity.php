<?php
/**
 * Shared workspace emails (discussion #1545): the parts that need neither a
 * database nor a session. WorkspaceActivityEmailService does the reading and
 * the sending; what a setting value means, when an email is due, how a
 * changed note is described and how the links of an email are signed are
 * decided here, where the tests can reach them.
 *
 * Nothing is logged as it happens: a note already records when it was last
 * written and by whom (entries.updated, updated_by_user_id), so an email is
 * the list of notes of a workspace whose last write is newer than the
 * previous email and was made by someone else than its reader.
 */

/** Values of the per-user setting workspace_activity_emails. */
const POZNOTE_WORKSPACE_ACTIVITY_FREQUENCIES = ['off', 'instant', 'daily', 'weekly'];

/** Local hour of the daily summary, and of the weekly one on Mondays. */
const POZNOTE_WORKSPACE_ACTIVITY_DIGEST_HOUR = 8;

/**
 * "Instant" waits for a pause: a note being typed is saved every few seconds
 * and each save would otherwise be an email. The changes go out once nothing
 * has moved for the quiet period, or once the oldest of them has waited the
 * maximum, whichever comes first.
 */
const POZNOTE_WORKSPACE_ACTIVITY_QUIET_SECONDS = 300;
const POZNOTE_WORKSPACE_ACTIVITY_MAX_WAIT_SECONDS = 1800;

/**
 * An email never reaches further back than this, however long it could not
 * be sent (SMTP turned off for a month, a restored master database).
 */
const POZNOTE_WORKSPACE_ACTIVITY_MAX_LOOKBACK_SECONDS = 8 * 86400;

/**
 * The stored setting as one of the known frequencies. Anything else,
 * including a setting never written, means no email.
 *
 * @param mixed $value
 */
function poznoteNormalizeWorkspaceActivityFrequency($value): string {
    $value = is_string($value) ? strtolower(trim($value)) : '';
    return in_array($value, POZNOTE_WORKSPACE_ACTIVITY_FREQUENCIES, true) ? $value : 'off';
}

/**
 * Timestamp of the latest summary slot at or before $now: 08:00 today or
 * yesterday for 'daily', 08:00 of the latest Monday for 'weekly', in the
 * reader's timezone. Null for the frequencies that have no slot.
 */
function poznoteWorkspaceActivitySlot(string $frequency, int $now, string $timezone): ?int {
    if ($frequency !== 'daily' && $frequency !== 'weekly') {
        return null;
    }

    try {
        $tz = new DateTimeZone($timezone !== '' ? $timezone : 'UTC');
    } catch (Throwable $e) {
        $tz = new DateTimeZone('UTC');
    }

    $current = (new DateTimeImmutable('@' . $now))->setTimezone($tz);
    $slot = $current->setTime(POZNOTE_WORKSPACE_ACTIVITY_DIGEST_HOUR, 0, 0);
    if ($frequency === 'weekly') {
        $slot = $slot->modify('-' . ((int)$slot->format('N') - 1) . ' days');
    }
    if ($slot > $current) {
        $slot = $slot->modify($frequency === 'weekly' ? '-7 days' : '-1 day');
    }

    return $slot->getTimestamp();
}

/**
 * True when a summary slot has passed since the last email, so a daily or
 * weekly reader is owed one. The slot is crossed once: the email that
 * follows moves $reportedUntil past it.
 */
function poznoteWorkspaceActivitySummaryDue(string $frequency, int $now, int $reportedUntil, string $timezone): bool {
    $slot = poznoteWorkspaceActivitySlot($frequency, $now, $timezone);
    return $slot !== null && $reportedUntil < $slot;
}

/**
 * True when the pending changes of an 'instant' reader may go out, from the
 * timestamps of the most recent and of the oldest changed note.
 */
function poznoteWorkspaceActivityInstantReady(int $now, int $newestChange, int $oldestChange): bool {
    return ($now - $newestChange) >= POZNOTE_WORKSPACE_ACTIVITY_QUIET_SECONDS
        || ($now - $oldestChange) >= POZNOTE_WORKSPACE_ACTIVITY_MAX_WAIT_SECONDS;
}

/**
 * What one note of a shared workspace has to tell a reader, or null when its
 * last write is the reader's own. $row is an entries row (created, updated,
 * trash, created_by_user_id, updated_by_user_id), $sinceUtc the end of the
 * previous email as 'Y-m-d H:i:s' UTC, the format of both date columns.
 *
 * A note without a recorded writer predates the column: it is its owner's.
 * Only the latest write of a note is known, so a note created by the reader
 * and then edited by someone else reads as edited, never as created.
 *
 * @return array{kind:string,actor:int}|null kind is created, edited or deleted
 */
function poznoteClassifyWorkspaceActivity(array $row, int $readerUserId, int $ownerUserId, string $sinceUtc): ?array {
    $actor = (int)($row['updated_by_user_id'] ?? 0);
    if ($actor <= 0) {
        $actor = $ownerUserId;
    }
    if ($actor === $readerUserId) {
        return null;
    }

    if (!empty($row['trash'])) {
        return ['kind' => 'deleted', 'actor' => $actor];
    }

    $creator = (int)($row['created_by_user_id'] ?? 0);
    if ($creator <= 0) {
        $creator = $ownerUserId;
    }
    $created = (string)($row['created'] ?? '');
    if ($created !== '' && $created > $sinceUtc && $creator === $actor) {
        return ['kind' => 'created', 'actor' => $actor];
    }

    return ['kind' => 'edited', 'actor' => $actor];
}

/**
 * Signature of the link an email carries to a note of a shared workspace.
 * The link changes the active account of whoever opens it (open_shared.php),
 * which a plain GET may not do: the account switch is a POST behind a CSRF
 * token. The signature stands in for that token. It names the reader, so a
 * link only works in the session of the person the email was sent to.
 */
function poznoteWorkspaceActivityLinkSignature(string $key, int $readerUserId, int $ownerUserId, string $workspace, int $noteId): string {
    $payload = implode("\n", ['workspace-activity-link', $readerUserId, $ownerUserId, $noteId, $workspace]);
    return substr(hash_hmac('sha256', $payload, $key), 0, 32);
}

/**
 * Query string of that link: owner, workspace, note (0 for the workspace
 * itself), reader and signature.
 */
function poznoteWorkspaceActivityLinkQuery(string $key, int $readerUserId, int $ownerUserId, string $workspace, int $noteId): string {
    return http_build_query([
        'owner' => $ownerUserId,
        'workspace' => $workspace,
        'note' => $noteId,
        'u' => $readerUserId,
        'sig' => poznoteWorkspaceActivityLinkSignature($key, $readerUserId, $ownerUserId, $workspace, $noteId),
    ]);
}

/**
 * True when the parameters of a request to open_shared.php carry the
 * signature made for them.
 *
 * @param array<string,mixed> $params
 */
function poznoteWorkspaceActivityLinkIsValid(string $key, array $params): bool {
    $signature = $params['sig'] ?? '';
    $workspace = $params['workspace'] ?? '';
    if (!is_string($signature) || $signature === '' || !is_string($workspace) || $workspace === '') {
        return false;
    }
    foreach (['owner', 'note', 'u'] as $name) {
        $value = $params[$name] ?? '';
        if (!is_string($value) && !is_int($value)) {
            return false;
        }
        if (!ctype_digit((string)$value)) {
            return false;
        }
    }

    $expected = poznoteWorkspaceActivityLinkSignature(
        $key,
        (int)$params['u'],
        (int)$params['owner'],
        $workspace,
        (int)$params['note']
    );

    return hash_equals($expected, $signature);
}
