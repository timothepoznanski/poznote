<?php
/**
 * Activity log for destructive and data-movement operations.
 *
 * Entries live in the master database, never in a per-user one: deleting an
 * account wipes that user's whole data directory, so a per-user table could
 * never keep the record of its own deletion. Storing everything centrally also
 * gives admins a single instance-wide view.
 *
 * Logging must never break the operation it describes. Every public helper
 * swallows its own errors and reports failure through the return value, so a
 * locked or missing master DB degrades to "no log line" rather than a 500 in
 * the middle of a backup or a deletion.
 *
 * SECRETS ARE NEVER RECORDED. No password reaches this table, in any form:
 * not account passwords (plaintext or hash), not workspace share passwords
 * (plaintext or the reversibly encrypted copy), not API tokens or session
 * identifiers. Where a password is relevant to an entry, only the fact that
 * one is set is stored, as a boolean. logActivity() strips any such key
 * defensively before writing, so a future call site cannot leak one by
 * accident. "password" appearing as a login *method* is a label, not a value.
 */

require_once __DIR__ . '/users/db_master.php';

// Event identifiers. Stored verbatim in the action column and used as the
// i18n key suffix (activity_log.actions.<action>), so renaming one orphans
// existing rows: add a new value instead.
const ACTIVITY_ACCOUNT_DELETED    = 'account.deleted';
const ACTIVITY_BACKUP_CREATED     = 'backup.created';
const ACTIVITY_BACKUP_RESTORED    = 'backup.restored';
const ACTIVITY_TRASH_EMPTIED      = 'trash.emptied';
const ACTIVITY_NOTE_DELETED       = 'note.deleted';
const ACTIVITY_WORKSPACE_CREATED  = 'workspace.created';
const ACTIVITY_WORKSPACE_DELETED  = 'workspace.deleted';
const ACTIVITY_WORKSPACE_SHARED   = 'workspace.shared';
const ACTIVITY_WORKSPACE_UNSHARED = 'workspace.unshared';
const ACTIVITY_ACCESS_GRANTED     = 'access.granted';
const ACTIVITY_ACCESS_REVOKED     = 'access.revoked';
const ACTIVITY_PROFILE_UPDATED    = 'profile.updated';
const ACTIVITY_QUOTA_UPDATED      = 'quota.updated';
const ACTIVITY_ACCOUNT_ACTIVATED  = 'account.activated';
const ACTIVITY_ACCOUNT_DEACTIVATED = 'account.deactivated';
const ACTIVITY_ADMIN_GRANTED      = 'admin.granted';
const ACTIVITY_ADMIN_REVOKED      = 'admin.revoked';
const ACTIVITY_LOGIN              = 'user.login';
const ACTIVITY_LOGOUT             = 'user.logout';

/**
 * Every action the log can hold, in the order the admin filter lists them.
 *
 * @return string[]
 */
function activityLogActions(): array {
    return [
        ACTIVITY_LOGIN,
        ACTIVITY_LOGOUT,
        ACTIVITY_PROFILE_UPDATED,
        ACTIVITY_QUOTA_UPDATED,
        ACTIVITY_ACCOUNT_ACTIVATED,
        ACTIVITY_ACCOUNT_DEACTIVATED,
        ACTIVITY_ADMIN_GRANTED,
        ACTIVITY_ADMIN_REVOKED,
        ACTIVITY_ACCOUNT_DELETED,
        ACTIVITY_ACCESS_GRANTED,
        ACTIVITY_ACCESS_REVOKED,
        ACTIVITY_WORKSPACE_CREATED,
        ACTIVITY_WORKSPACE_DELETED,
        ACTIVITY_WORKSPACE_SHARED,
        ACTIVITY_WORKSPACE_UNSHARED,
        ACTIVITY_BACKUP_CREATED,
        ACTIVITY_BACKUP_RESTORED,
        ACTIVITY_TRASH_EMPTIED,
        ACTIVITY_NOTE_DELETED,
    ];
}

/**
 * Create the table on first use.
 *
 * initializeMasterDatabase() has no version gate and re-runs its CREATE TABLE
 * IF NOT EXISTS statements on every connection, so following that convention
 * here keeps the schema self-healing without touching the per-user
 * $CURRENT_SCHEMA_VERSION in db_connect.php.
 *
 * username and user_id are denormalised copies, not foreign keys: the whole
 * point of an account.deleted row is to outlive the users row it refers to.
 */
function ensureActivityLogTable(PDO $con): void {
    static $ready = false;
    if ($ready) {
        return;
    }

    $con->exec("
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            details TEXT,
            source TEXT
        )
    ");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)");

    $ready = true;
}

/**
 * Record one operation.
 *
 * $details is free-form structured context (note title, workspace name,
 * deleted count, backup filename...) rendered by the admin page; it is stored
 * as JSON so new keys can be added without a schema change.
 *
 * Pass $userId/$username explicitly when the acting account is already known
 * or no longer exists (account deletion); otherwise they are resolved from the
 * session.
 *
 * @param array<string,mixed> $details
 * @param string $source how the action was triggered: 'web', 'api', 'admin',
 *                       'self', 'cli' or 'auto'
 * @return bool false when the entry could not be written
 */
function logActivity(
    string $action,
    array $details = [],
    string $source = 'web',
    ?int $userId = null,
    ?string $username = null
): bool {
    try {
        if ($userId === null && $username === null) {
            [$userId, $username] = currentActivityActor();
        }

        // A caller that knows only the id (a backup run, a scheduled job) still
        // needs a readable name in the table, so resolve it from the profile.
        // Deletion call sites pass the name explicitly because by this point
        // their row is already gone.
        if ($username === null && $userId !== null) {
            $username = activityUsernameForId($userId);
        }

        $details = activityStripSecrets($details);

        $con = getMasterConnection();
        ensureActivityLogTable($con);

        $stmt = $con->prepare(
            'INSERT INTO activity_log (user_id, username, action, details, source)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $username,
            $action,
            $details ? json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            $source,
        ]);

        pruneActivityLogOccasionally($con);

        return true;
    } catch (Throwable $e) {
        // Never let logging abort the operation being logged.
        error_log('Activity log write failed for ' . $action . ': ' . $e->getMessage());
        return false;
    }
}

/**
 * Log the identity and quota fields changed by a profile update.
 *
 * Called from updateUserProfile(), the single point every profile and quota
 * write passes through. Quota edits and profile edits arrive via the same
 * function and are told apart by which keys $data carries, so they are emitted
 * as two distinct actions; a request touching both produces one entry each.
 *
 * Only fields whose value actually changed are recorded, so a form that
 * re-submits unchanged values writes nothing.
 *
 * @param array $before the users row as it was before the UPDATE
 * @param array $data   the normalised field => value map that was written
 */
function logProfileUpdate(int $userId, ?array $before, array $data): void {
    try {
        if (!is_array($before)) {
            return;
        }

        // Identity fields only. active/is_admin are handled separately below:
        // they are status changes rather than profile edits, and each direction
        // gets its own action so the log can be filtered on "who was made an
        // admin" without reading every profile entry.
        $profileFields = ['username', 'email', 'first_name', 'last_name'];
        $quotaFields   = [
            'quota_max_notes',
            'quota_max_storage_mb',
            'quota_max_storage_s3_mb',
            'quota_max_backups_s3_mb',
        ];

        $profileChanges = activityDiffFields($before, $data, $profileFields);
        $quotaChanges   = activityDiffFields($before, $data, $quotaFields);

        // Status flips, compared the same way updateUserProfile() normalises
        // them ((int)(bool)) so "1" and true do not read as a change.
        $statusActions = [];
        foreach ([['active', ACTIVITY_ACCOUNT_ACTIVATED, ACTIVITY_ACCOUNT_DEACTIVATED],
                  ['is_admin', ACTIVITY_ADMIN_GRANTED, ACTIVITY_ADMIN_REVOKED]] as [$field, $onAction, $offAction]) {
            if (!array_key_exists($field, $data)) {
                continue;
            }
            $wasOn = (int)(bool)($before[$field] ?? 0);
            $isOn  = (int)(bool)$data[$field];
            if ($wasOn !== $isOn) {
                $statusActions[] = $isOn ? $onAction : $offAction;
            }
        }

        if (!$profileChanges && !$quotaChanges && !$statusActions) {
            return;
        }

        // The subject is the account being modified; currentActivityActor()
        // supplies who did it via 'performed_by'.
        [, $actorName] = currentActivityActor();
        $subjectName = $data['username'] ?? ($before['username'] ?? null);

        foreach ($statusActions as $statusAction) {
            logActivity(
                $statusAction,
                ['performed_by' => $actorName],
                'web',
                $userId,
                $subjectName
            );
        }

        if ($profileChanges) {
            logActivity(
                ACTIVITY_PROFILE_UPDATED,
                ['changes' => $profileChanges, 'performed_by' => $actorName],
                'web',
                $userId,
                $subjectName
            );
        }
        if ($quotaChanges) {
            logActivity(
                ACTIVITY_QUOTA_UPDATED,
                ['changes' => $quotaChanges, 'performed_by' => $actorName],
                'web',
                $userId,
                $subjectName
            );
        }
    } catch (Throwable $e) {
        error_log('Profile update logging failed: ' . $e->getMessage());
    }
}

/**
 * Build a field => {from, to} map of the values that actually changed.
 *
 * Comparison is done on strings so that a quota arriving as "500" does not
 * read as different from a stored 500. NULL and '' both mean "inherit the
 * global default" for quotas, so they are normalised to the same empty value.
 *
 * @param string[] $fields
 * @return array<string,array{from:string,to:string}>
 */
function activityDiffFields(array $before, array $data, array $fields): array {
    $changes = [];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data)) {
            continue;
        }
        $old = $before[$field] ?? null;
        $new = $data[$field];
        $oldStr = $old === null ? '' : trim((string)$old);
        $newStr = $new === null ? '' : trim((string)$new);
        if ($oldStr !== $newStr) {
            $changes[$field] = ['from' => $oldStr, 'to' => $newStr];
        }
    }
    return $changes;
}

/**
 * Log the grants added and removed by an account-access update.
 *
 * setUserAccountAccessTargets() replaces the whole list rather than granting
 * and revoking individually, so callers capture the target ids beforehand and
 * hand them here; the current state is re-read to compute the difference. Two
 * separate entries are emitted, one per direction, and nothing is written when
 * the submitted list matched what was already stored.
 *
 * @param int[] $before target user ids granted before the update
 */
function logAccountAccessChange(int $accessorUserId, array $before): void {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare('SELECT target_user_id FROM user_account_access WHERE accessor_user_id = ?');
        $stmt->execute([$accessorUserId]);
        $after = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

        $before  = array_map('intval', $before);
        $added   = array_values(array_diff($after, $before));
        $removed = array_values(array_diff($before, $after));

        if (!$added && !$removed) {
            return;
        }

        $accessorName = activityUsernameForId($accessorUserId);

        if ($added) {
            logActivity(ACTIVITY_ACCESS_GRANTED, [
                'accounts' => activityUsernamesForIds($added),
            ], 'admin', $accessorUserId, $accessorName);
        }
        if ($removed) {
            logActivity(ACTIVITY_ACCESS_REVOKED, [
                'accounts' => activityUsernamesForIds($removed),
            ], 'admin', $accessorUserId, $accessorName);
        }
    } catch (Throwable $e) {
        error_log('Account access logging failed: ' . $e->getMessage());
    }
}

/**
 * Map user ids to display names, falling back to "#id" for deleted profiles.
 *
 * @param int[] $ids
 * @return string[]
 */
function activityUsernamesForIds(array $ids): array {
    $names = [];
    foreach ($ids as $id) {
        $names[] = activityUsernameForId((int)$id) ?? ('#' . (int)$id);
    }
    return $names;
}

/**
 * Drop anything that looks like a credential from a details payload.
 *
 * A backstop, not the primary defence: no current call site passes a secret,
 * and each one is written to pass a boolean flag instead. This makes that
 * guarantee structural, so a later call site that forwards a whole $_POST or a
 * profile row cannot silently write a password into the log.
 *
 * Boolean flags such as password_protected are deliberately kept: they record
 * that a password exists without revealing it.
 *
 * @param array<string,mixed> $details
 * @return array<string,mixed>
 */
function activityStripSecrets(array $details): array {
    $clean = [];
    foreach ($details as $key => $value) {
        $name = strtolower((string)$key);
        $isSecret = (
            strpos($name, 'password') !== false
            || strpos($name, 'passwd') !== false
            || strpos($name, 'secret') !== false
            || strpos($name, 'token') !== false
            || strpos($name, 'api_key') !== false
        );
        // Keep the booleans that merely say "a password is set".
        if ($isSecret && !is_bool($value)) {
            continue;
        }
        $clean[$key] = is_array($value) ? activityStripSecrets($value) : $value;
    }
    return $clean;
}

/**
 * Look up a username from a user id, or null when the profile is gone.
 */
function activityUsernameForId(int $userId): ?string {
    try {
        $profile = getUserProfileById($userId);
        return $profile['username'] ?? null;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Identify the acting account from the session.
 *
 * Falls back to the login identity when a user is browsing another account
 * through a shared-access grant, since the log should name whoever performed
 * the action, not whose data it touched.
 *
 * @return array{0:?int,1:?string}
 */
function currentActivityActor(): array {
    if (function_exists('getAuthenticatedUser')) {
        $user = getAuthenticatedUser();
        if (is_array($user) && isset($user['id'])) {
            return [(int) $user['id'], $user['username'] ?? null];
        }
    }

    if (isset($_SESSION['user_id'])) {
        return [(int) $_SESSION['user_id'], $_SESSION['username'] ?? null];
    }

    return [null, null];
}

/**
 * Retention in days; 0 means keep everything. Stored instance-wide.
 */
function getActivityLogRetentionDays(): int {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT value FROM global_settings WHERE key = 'activity_log_retention_days'");
        $stmt->execute();
        $value = $stmt->fetchColumn();

        return $value === false ? 90 : max(0, (int) $value);
    } catch (Throwable $e) {
        return 90;
    }
}

function setActivityLogRetentionDays(int $days): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('activity_log_retention_days', ?)"
        );
        $stmt->execute([(string) max(0, $days)]);

        return true;
    } catch (Throwable $e) {
        error_log('Failed to save activity log retention: ' . $e->getMessage());
        return false;
    }
}

/**
 * Drop entries older than the retention window.
 *
 * @return int rows removed
 */
function pruneActivityLog(?int $days = null): int {
    $days = $days ?? getActivityLogRetentionDays();
    if ($days <= 0) {
        return 0;
    }

    try {
        $con = getMasterConnection();
        ensureActivityLogTable($con);

        $stmt = $con->prepare("DELETE FROM activity_log WHERE created_at < datetime('now', ?)");
        $stmt->execute(['-' . $days . ' days']);

        return $stmt->rowCount();
    } catch (Throwable $e) {
        error_log('Activity log prune failed: ' . $e->getMessage());
        return 0;
    }
}

/**
 * Prune on roughly 1 write in 50.
 *
 * There is no scheduler guaranteed to run, and the events logged here are rare
 * enough that a DELETE on every insert would be wasted work; sampling keeps the
 * table bounded without adding a cron dependency.
 */
function pruneActivityLogOccasionally(PDO $con): void {
    if (random_int(1, 50) !== 1) {
        return;
    }

    $days = getActivityLogRetentionDays();
    if ($days <= 0) {
        return;
    }

    try {
        $stmt = $con->prepare("DELETE FROM activity_log WHERE created_at < datetime('now', ?)");
        $stmt->execute(['-' . $days . ' days']);
    } catch (Throwable $e) {
        error_log('Activity log auto-prune failed: ' . $e->getMessage());
    }
}

/**
 * Read entries, newest first.
 *
 * @param array{action?:string,user_id?:int,search?:string} $filters
 * @return array<int,array<string,mixed>>
 */
function getActivityLogEntries(array $filters = [], int $limit = 500, int $offset = 0): array {
    try {
        $con = getMasterConnection();
        ensureActivityLogTable($con);

        $where = [];
        $params = [];

        if (!empty($filters['action'])) {
            $where[] = 'action = ?';
            $params[] = $filters['action'];
        }
        if (!empty($filters['user_id'])) {
            $where[] = 'user_id = ?';
            $params[] = (int) $filters['user_id'];
        }
        if (!empty($filters['search'])) {
            $where[] = '(username LIKE ? OR details LIKE ?)';
            $params[] = '%' . $filters['search'] . '%';
            $params[] = '%' . $filters['search'] . '%';
        }

        $sql = 'SELECT id, created_at, user_id, username, action, details, source FROM activity_log';
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';

        $params[] = max(1, $limit);
        $params[] = max(0, $offset);

        $stmt = $con->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('Activity log read failed: ' . $e->getMessage());
        return [];
    }
}

/**
 * Total rows matching the same filters as getActivityLogEntries().
 *
 * @param array{action?:string,user_id?:int,search?:string} $filters
 */
function countActivityLogEntries(array $filters = []): int {
    try {
        $con = getMasterConnection();
        ensureActivityLogTable($con);

        $where = [];
        $params = [];

        if (!empty($filters['action'])) {
            $where[] = 'action = ?';
            $params[] = $filters['action'];
        }
        if (!empty($filters['user_id'])) {
            $where[] = 'user_id = ?';
            $params[] = (int) $filters['user_id'];
        }
        if (!empty($filters['search'])) {
            $where[] = '(username LIKE ? OR details LIKE ?)';
            $params[] = '%' . $filters['search'] . '%';
            $params[] = '%' . $filters['search'] . '%';
        }

        $sql = 'SELECT COUNT(*) FROM activity_log';
        if ($where) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }

        $stmt = $con->prepare($sql);
        $stmt->execute($params);

        return (int) $stmt->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

/**
 * Remove every entry. Returns rows deleted, or -1 on failure.
 */
function clearActivityLog(): int {
    try {
        $con = getMasterConnection();
        ensureActivityLogTable($con);

        $count = (int) $con->query('SELECT COUNT(*) FROM activity_log')->fetchColumn();
        $con->exec('DELETE FROM activity_log');

        return $count;
    } catch (Throwable $e) {
        error_log('Activity log clear failed: ' . $e->getMessage());
        return -1;
    }
}
