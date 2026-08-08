<?php
/**
 * Master Database Connection for Multi-User Mode
 * 
 * In this simplified multi-user mode:
 * - One global password for everyone (same as single-user mode)
 * - Multiple user profiles, each with their own data space
 * - User selects their profile on login
 */

// Ensure config is loaded
if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/../config.php';
}

// Include utility functions (createDirectoryWithPermissions, etc.)
require_once __DIR__ . '/../functions.php';

// Master database path - usually located at the root of the data directory
define('MASTER_DATABASE', $_ENV['POZNOTE_MASTER_DATABASE'] ?? dirname(SQLITE_DATABASE, 2) . '/master.db');

/**
 * Get connection to master database
 */
function getMasterConnection(): PDO {
    static $masterCon = null;
    
    if ($masterCon !== null) {
        return $masterCon;
    }
    
    try {
        $dbPath = MASTER_DATABASE;
        $dbDir = dirname($dbPath);
        createDirectoryWithPermissions($dbDir);
        
        $masterCon = new PDO('sqlite:' . $dbPath);
        $masterCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $masterCon->exec('PRAGMA busy_timeout = 5000');
        $masterCon->exec('PRAGMA foreign_keys = ON');
        
        initializeMasterDatabase($masterCon);
        
        return $masterCon;
    } catch (PDOException $e) {
        error_log("Master database connection failed: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Initialize the master database schema
 */
function initializeMasterDatabase(PDO $con): void {
    // User profiles table - no passwords, just profiles
    $con->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            email_verified INTEGER DEFAULT 0,
            first_name TEXT,
            last_name TEXT,
            active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0,
            notify_new_user INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    ");
    
    // Migration: Add missing columns
    try {
        $cols = $con->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
        $existingColumns = array_column($cols, 'name');
        
        if (!in_array('email', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN email TEXT");
            $con->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != ''");
        }
        
        if (!in_array('oidc_subject', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN oidc_subject TEXT");
            $con->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_subject ON users(oidc_subject) WHERE oidc_subject IS NOT NULL AND oidc_subject != ''");
        }
        
        if (!in_array('password_hash', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
        }

        if (!in_array('password_changed_at', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN password_changed_at DATETIME");
        }

        if (!in_array('first_name', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN first_name TEXT");
        }

        if (!in_array('last_name', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN last_name TEXT");
        }

        if (!in_array('email_verified', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
            // Emails that predate self-service editing were all set by an
            // administrator, so they are trusted for OIDC account matching.
            $con->exec("UPDATE users SET email_verified = 1 WHERE email IS NOT NULL AND email != ''");
        }

        if (!in_array('notify_new_user', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN notify_new_user INTEGER DEFAULT 0");
        }

        // Per-user quota overrides: NULL inherits the global setting, 0 means
        // unlimited, any other value is the limit for that user.
        if (!in_array('quota_max_notes', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN quota_max_notes INTEGER");
        }

        if (!in_array('quota_max_storage_mb', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN quota_max_storage_mb INTEGER");
        }

        if (!in_array('quota_max_storage_s3_mb', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN quota_max_storage_s3_mb INTEGER");
        }

        if (!in_array('quota_max_backups_s3_mb', $existingColumns)) {
            $con->exec("ALTER TABLE users ADD COLUMN quota_max_backups_s3_mb INTEGER");
        }
    } catch (Exception $e) {
        error_log("Failed to add columns: " . $e->getMessage());
    }

    // Security-sensitive migration, kept in its own try so a failure here can
    // never skip the column additions above (and vice versa). Marks profiles
    // that never received an initial credential from an admin, so they must not
    // answer to the hardcoded default password.
    try {
        $cols = $con->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
        if (!in_array('password_login_disabled', array_column($cols, 'name'))) {
            $con->exec("ALTER TABLE users ADD COLUMN password_login_disabled INTEGER DEFAULT 0");
            // Backfill the profiles that are exposed right now: linked to an SSO
            // identity and with no password hash, so they currently answer to the
            // public default. Profiles that already have a hash are untouched,
            // they went through a deliberate password set and keep working.
            // getUserPasswordHash() treats an empty string as "no hash", so the
            // backfill must too: matching only IS NULL would leave such a row
            // answering to the public default.
            $con->exec("
                UPDATE users
                SET password_login_disabled = 1
                WHERE (password_hash IS NULL OR password_hash = '')
                  AND oidc_subject IS NOT NULL
                  AND oidc_subject != ''
            ");
        }
    } catch (Exception $e) {
        error_log("Failed to add password_login_disabled column: " . $e->getMessage());
    }
    
    // Global settings table
    $con->exec("
        CREATE TABLE IF NOT EXISTS global_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ");
    
    // Shared links registry (for public routing)
    $con->exec("
        CREATE TABLE IF NOT EXISTS shared_links (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            target_type TEXT NOT NULL, -- 'note', 'folder', or 'workspace'
            target_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");

    // Account access grants: one authenticated user can open another user's note space.
    $con->exec("
        CREATE TABLE IF NOT EXISTS user_account_access (
            accessor_user_id INTEGER NOT NULL,
            target_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (accessor_user_id, target_user_id),
            FOREIGN KEY (accessor_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
            CHECK (accessor_user_id != target_user_id)
        )
    ");

    // Transient edit locks for notes shared across users.
    $con->exec("
        CREATE TABLE IF NOT EXISTS note_edit_locks (
            target_user_id INTEGER NOT NULL,
            note_id INTEGER NOT NULL,
            holder_login_user_id INTEGER NOT NULL,
            holder_session_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            PRIMARY KEY (target_user_id, note_id),
            FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (holder_login_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    
    // Outgoing webhooks. Instance webhooks (user_id NULL) are registered by
    // admins and notified of instance events; user webhooks belong to a single
    // account (user_id) and are notified of that account's own content events.
    $con->exec("
        CREATE TABLE IF NOT EXISTS webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            secret TEXT,
            events TEXT NOT NULL DEFAULT 'user.created',
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_status TEXT,
            last_delivery_at DATETIME,
            user_id INTEGER
        )
    ");

    // Migration: user webhooks used to be implicitly owned by the primary
    // account (user 1); attach the pre-existing rows to it so they keep
    // working now that every account can register its own.
    try {
        $cols = $con->query("PRAGMA table_info(webhooks)")->fetchAll(PDO::FETCH_ASSOC);
        if (!in_array('user_id', array_column($cols, 'name'))) {
            $con->exec("ALTER TABLE webhooks ADD COLUMN user_id INTEGER");
            $con->exec("
                UPDATE webhooks
                SET user_id = 1
                WHERE user_id IS NULL
                  AND (events LIKE 'reminder.%' OR events LIKE '%,reminder.%'
                       OR events LIKE 'note.%' OR events LIKE '%,note.%')
            ");
        }
    } catch (Exception $e) {
        error_log("Failed to add webhooks.user_id column: " . $e->getMessage());
    }

    // Create indexes
    $con->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_user_account_access_accessor ON user_account_access(accessor_user_id)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_user_account_access_target ON user_account_access(target_user_id)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_note_edit_locks_holder ON note_edit_locks(holder_login_user_id)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_note_edit_locks_expires ON note_edit_locks(expires_at)");
    
    // Create default user if none exist
    createDefaultUserIfNeeded($con);
}

/**
 * Create default user profile if none exist
 */
function createDefaultUserIfNeeded(PDO $con): void {
    // Check if any users exist
    $stmt = $con->query("SELECT COUNT(*) FROM users");
    if ($stmt->fetchColumn() == 0) {
        $stmt = $con->prepare("
            INSERT INTO users (username, is_admin, active)
            VALUES ('admin_change_me', 1, 1)
        ");
        $stmt->execute();
    }
}

/**
 * Get all active user profiles for login selector
 */
function getAllUserProfiles(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, email, is_admin 
            FROM users 
            WHERE active = 1 
            ORDER BY username
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        error_log("Error getting user profiles: " . $e->getMessage());
        return [];
    }
}

/**
 * Return all active account IDs a user can open. Their own account is always included.
 */
function getUserAccessibleAccountIds(int $accessorUserId): array {
    if ($accessorUserId <= 0) {
        return [];
    }

    try {
        $con = getMasterConnection();
        $ids = [$accessorUserId];

        $stmt = $con->prepare("
            SELECT u.id
            FROM user_account_access a
            INNER JOIN users u ON u.id = a.target_user_id
            WHERE a.accessor_user_id = ? AND u.active = 1
            ORDER BY u.username
        ");
        $stmt->execute([$accessorUserId]);

        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $targetId) {
            $ids[] = (int)$targetId;
        }

        return array_values(array_unique(array_filter($ids, function ($id) {
            return (int)$id > 0;
        })));
    } catch (Exception $e) {
        error_log("Error getting accessible accounts: " . $e->getMessage());
        return [$accessorUserId];
    }
}

/**
 * Return active user profiles a user can open, with their own account first.
 */
function getUserAccessibleProfiles(int $accessorUserId): array {
    $ids = getUserAccessibleAccountIds($accessorUserId);
    if (empty($ids)) {
        return [];
    }

    try {
        $con = getMasterConnection();
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $con->prepare("
            SELECT *
            FROM users
            WHERE active = 1 AND id IN ($placeholders)
            ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, username
        ");
        $params = array_merge($ids, [$accessorUserId]);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        error_log("Error getting accessible account profiles: " . $e->getMessage());
        return [];
    }
}

/**
 * Check whether an authenticated user may open a target account.
 */
function canUserAccessAccount(int $accessorUserId, int $targetUserId): bool {
    if ($accessorUserId <= 0 || $targetUserId <= 0) {
        return false;
    }

    if ($accessorUserId === $targetUserId) {
        $user = getUserProfileById($targetUserId);
        return $user !== null && (bool)($user['active'] ?? false);
    }

    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("
            SELECT COUNT(*)
            FROM user_account_access a
            INNER JOIN users u ON u.id = a.target_user_id
            WHERE a.accessor_user_id = ? AND a.target_user_id = ? AND u.active = 1
        ");
        $stmt->execute([$accessorUserId, $targetUserId]);

        return (int)$stmt->fetchColumn() > 0;
    } catch (Exception $e) {
        error_log("Error checking account access: " . $e->getMessage());
        return false;
    }
}

/**
 * Replace the explicit target account grants for one user.
 */
function setUserAccountAccessTargets(int $accessorUserId, array $targetUserIds): array {
    if ($accessorUserId <= 0) {
        return ['success' => false, 'error' => 'Invalid user profile'];
    }

    try {
        $con = getMasterConnection();

        $accessor = getUserProfileById($accessorUserId);
        if (!$accessor) {
            return ['success' => false, 'error' => 'User profile not found'];
        }

        $normalizedTargetIds = [];
        foreach ($targetUserIds as $targetUserId) {
            $targetUserId = (int)$targetUserId;
            if ($targetUserId > 0 && $targetUserId !== $accessorUserId) {
                $normalizedTargetIds[$targetUserId] = true;
            }
        }

        $validTargetIds = [];
        if (!empty($normalizedTargetIds)) {
            $ids = array_keys($normalizedTargetIds);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $con->prepare("SELECT id FROM users WHERE active = 1 AND id IN ($placeholders)");
            $stmt->execute($ids);
            $validTargetIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        }

        $con->beginTransaction();

        $stmt = $con->prepare("DELETE FROM user_account_access WHERE accessor_user_id = ?");
        $stmt->execute([$accessorUserId]);

        if (!empty($validTargetIds)) {
            $stmt = $con->prepare("INSERT OR IGNORE INTO user_account_access (accessor_user_id, target_user_id) VALUES (?, ?)");
            foreach ($validTargetIds as $targetUserId) {
                $stmt->execute([$accessorUserId, $targetUserId]);
            }
        }

        $con->commit();

        return ['success' => true];
    } catch (Exception $e) {
        if (isset($con) && $con instanceof PDO && $con->inTransaction()) {
            $con->rollBack();
        }
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Return all explicit access grants grouped by accessor user ID.
 */
function getUserAccountAccessMap(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT accessor_user_id, target_user_id
            FROM user_account_access
            ORDER BY accessor_user_id, target_user_id
        ");

        $map = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $accessorUserId = (int)$row['accessor_user_id'];
            $targetUserId = (int)$row['target_user_id'];
            if (!isset($map[$accessorUserId])) {
                $map[$accessorUserId] = [];
            }
            $map[$accessorUserId][] = $targetUserId;
        }

        return $map;
    } catch (Exception $e) {
        error_log("Error getting account access map: " . $e->getMessage());
        return [];
    }
}

function pruneExpiredNoteEditLocks(?PDO $con = null): void {
    try {
        $con = $con ?? getMasterConnection();
        $stmt = $con->prepare("DELETE FROM note_edit_locks WHERE expires_at <= ?");
        $stmt->execute([gmdate('Y-m-d H:i:s')]);
    } catch (Exception $e) {
        error_log("Error pruning note edit locks: " . $e->getMessage());
    }
}

function normalizeNoteEditLockRow(array $row): array {
    return [
        'target_user_id' => (int)($row['target_user_id'] ?? 0),
        'note_id' => (int)($row['note_id'] ?? 0),
        'holder_login_user_id' => (int)($row['holder_login_user_id'] ?? 0),
        'holder_session_id' => (string)($row['holder_session_id'] ?? ''),
        'holder_username' => (string)($row['holder_username'] ?? ''),
        'created_at' => (string)($row['created_at'] ?? ''),
        'last_seen_at' => (string)($row['last_seen_at'] ?? ''),
        'expires_at' => (string)($row['expires_at'] ?? ''),
    ];
}

function getNoteEditLock(int $targetUserId, int $noteId): ?array {
    if ($targetUserId <= 0 || $noteId <= 0) {
        return null;
    }

    try {
        $con = getMasterConnection();
        pruneExpiredNoteEditLocks($con);

        $stmt = $con->prepare("
            SELECT l.target_user_id,
                   l.note_id,
                   l.holder_login_user_id,
                   l.holder_session_id,
                   l.created_at,
                   l.last_seen_at,
                   l.expires_at,
                   u.username AS holder_username
            FROM note_edit_locks l
            INNER JOIN users u ON u.id = l.holder_login_user_id
            WHERE l.target_user_id = ? AND l.note_id = ?
            LIMIT 1
        ");
        $stmt->execute([$targetUserId, $noteId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? normalizeNoteEditLockRow($row) : null;
    } catch (Exception $e) {
        error_log("Error getting note edit lock: " . $e->getMessage());
        return null;
    }
}

function acquireNoteEditLock(int $targetUserId, int $noteId, int $holderLoginUserId, string $holderSessionId, int $ttlSeconds = 90): array {
    if ($targetUserId <= 0 || $noteId <= 0 || $holderLoginUserId <= 0) {
        return ['success' => false, 'error' => 'Invalid note edit lock parameters'];
    }

    $holderSessionId = trim($holderSessionId);
    if ($holderSessionId === '') {
        return ['success' => false, 'error' => 'Missing editor session'];
    }

    $ttlSeconds = max(15, min(300, $ttlSeconds));
    $now = gmdate('Y-m-d H:i:s');
    $expiresAt = gmdate('Y-m-d H:i:s', time() + $ttlSeconds);

    try {
        $con = getMasterConnection();
        pruneExpiredNoteEditLocks($con);

        $con->beginTransaction();

        $stmt = $con->prepare("
            SELECT target_user_id, note_id, holder_login_user_id, holder_session_id, created_at, last_seen_at, expires_at
            FROM note_edit_locks
            WHERE target_user_id = ? AND note_id = ?
            LIMIT 1
        ");
        $stmt->execute([$targetUserId, $noteId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            $insert = $con->prepare("
                INSERT INTO note_edit_locks (
                    target_user_id,
                    note_id,
                    holder_login_user_id,
                    holder_session_id,
                    created_at,
                    last_seen_at,
                    expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $insert->execute([$targetUserId, $noteId, $holderLoginUserId, $holderSessionId, $now, $now, $expiresAt]);
            $con->commit();

            return ['success' => true, 'lock' => getNoteEditLock($targetUserId, $noteId)];
        }

        if ((int)$existing['holder_login_user_id'] === $holderLoginUserId) {
            $update = $con->prepare("
                UPDATE note_edit_locks
                SET holder_session_id = ?, last_seen_at = ?, expires_at = ?
                WHERE target_user_id = ? AND note_id = ?
            ");
            $update->execute([$holderSessionId, $now, $expiresAt, $targetUserId, $noteId]);
            $con->commit();

            return ['success' => true, 'lock' => getNoteEditLock($targetUserId, $noteId)];
        }

        $con->rollBack();
        return [
            'success' => false,
            'error' => 'Note is currently locked for editing',
            'lock' => getNoteEditLock($targetUserId, $noteId),
        ];
    } catch (Exception $e) {
        if (isset($con) && $con instanceof PDO && $con->inTransaction()) {
            $con->rollBack();
        }
        error_log("Error acquiring note edit lock: " . $e->getMessage());
        return ['success' => false, 'error' => 'Failed to acquire note edit lock'];
    }
}

function refreshNoteEditLock(int $targetUserId, int $noteId, int $holderLoginUserId, string $holderSessionId, int $ttlSeconds = 90): array {
    return acquireNoteEditLock($targetUserId, $noteId, $holderLoginUserId, $holderSessionId, $ttlSeconds);
}

function releaseNoteEditLock(int $targetUserId, int $noteId, int $holderLoginUserId, string $holderSessionId): bool {
    if ($targetUserId <= 0 || $noteId <= 0 || $holderLoginUserId <= 0) {
        return false;
    }

    $holderSessionId = trim($holderSessionId);
    if ($holderSessionId === '') {
        return false;
    }

    try {
        $con = getMasterConnection();
        pruneExpiredNoteEditLocks($con);

        $stmt = $con->prepare("
            DELETE FROM note_edit_locks
            WHERE target_user_id = ?
              AND note_id = ?
              AND holder_login_user_id = ?
              AND holder_session_id = ?
        ");
        $stmt->execute([$targetUserId, $noteId, $holderLoginUserId, $holderSessionId]);

        return true;
    } catch (Exception $e) {
        error_log("Error releasing note edit lock: " . $e->getMessage());
        return false;
    }
}

function noteEditLockBelongsTo(int $targetUserId, int $noteId, int $holderLoginUserId, string $holderSessionId): bool {
    if ($targetUserId <= 0 || $noteId <= 0 || $holderLoginUserId <= 0) {
        return false;
    }

    $holderSessionId = trim($holderSessionId);
    if ($holderSessionId === '') {
        return false;
    }

    try {
        $con = getMasterConnection();
        pruneExpiredNoteEditLocks($con);

        $stmt = $con->prepare("
            SELECT COUNT(*)
            FROM note_edit_locks
            WHERE target_user_id = ?
              AND note_id = ?
              AND holder_login_user_id = ?
        ");
        $stmt->execute([$targetUserId, $noteId, $holderLoginUserId]);

        return (int)$stmt->fetchColumn() > 0;
    } catch (Exception $e) {
        error_log("Error validating note edit lock: " . $e->getMessage());
        return false;
    }
}

/**
 * Compute the display name for a user row: "First Last" when set, username otherwise.
 */
function buildUserDisplayName(?array $user): string {
    if (!$user) {
        return '';
    }
    $name = trim(trim((string)($user['first_name'] ?? '')) . ' ' . trim((string)($user['last_name'] ?? '')));
    if ($name === '') {
        $name = trim((string)($user['username'] ?? ''));
    }
    return $name;
}

/**
 * Attach the computed display_name to a user row (display_name is not a real column).
 */
function withComputedDisplayName(?array $user): ?array {
    if (!$user) {
        return null;
    }
    $user['display_name'] = buildUserDisplayName($user);
    return $user;
}

/**
 * Count user profiles. Returns null when the count cannot be established, so
 * callers enforcing a cap can fail closed instead of reading a failure as 0.
 */
function countUserProfiles(): ?int {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("SELECT COUNT(*) FROM users");
        $count = $stmt->fetchColumn();
        return $count === false ? null : (int)$count;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by ID
 */
function getUserProfileById(int $id): ?array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ? withComputedDisplayName($user) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by username
 */
function getUserProfileByUsername(string $username): ?array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ? withComputedDisplayName($user) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by email
 */
function getUserProfileByEmail(string $email): ?array {
    try {
        if (trim($email) === '') return null;
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ? withComputedDisplayName($user) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by email, restricted to VERIFIED emails (set by an admin
 * or synced from the OIDC provider). Used for OIDC account matching so a
 * self-set, unverified email can never capture someone else's SSO login.
 */
function getUserProfileByVerifiedEmail(string $email): ?array {
    try {
        if (trim($email) === '') return null;
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE email = ? AND email_verified = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ? withComputedDisplayName($user) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by OIDC subject (sub claim)
 */
function getUserProfileByOidcSubject(string $oidcSubject): ?array {
    try {
        if (trim($oidcSubject) === '') return null;
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE oidc_subject = ?");
        $stmt->execute([$oidcSubject]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ? withComputedDisplayName($user) : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Update user last login timestamp
 */
function updateUserLastLogin(int $userId): void {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$userId]);
    } catch (Exception $e) {
        // Ignore errors
    }
}

/**
 * Update user OIDC subject
 */
function updateUserOidcSubject(int $userId, string $oidcSubject): void {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE users SET oidc_subject = ? WHERE id = ?");
        $stmt->execute([$oidcSubject, $userId]);
    } catch (Exception $e) {
        error_log("Failed to update OIDC subject for user $userId: " . $e->getMessage());
    }
}

/**
 * Create a new user profile
 */

/**
 * @param bool $disablePasswordLogin Set by flows that provision a profile without
 *        handing over any initial credential (OIDC auto-provisioning). Such a
 *        profile must not answer to the hardcoded default password. It is stored
 *        in the same INSERT as the row itself, so there is no window where the
 *        profile exists and is still reachable with the public default.
 */
function createUserProfile(string $username, ?string $email = null, ?int $maxUsers = null, bool $disablePasswordLogin = false): array {
    try {
        $con = getMasterConnection();

        // Same normalization as updateUserProfile: a username stored with
        // stray whitespace could never match a typed delete confirmation.
        $username = trim($username);
        if ($username === '') {
            return ['success' => false, 'error' => 'Username is required'];
        }

        // Reject purely numeric usernames — they would be ambiguous with user IDs
        // in the Basic Auth lookup (which accepts both usernames and numeric IDs).
        if (ctype_digit($username)) {
            return ['success' => false, 'error' => 'Username cannot be purely numeric'];
        }

        // Check if username exists
        $stmt = $con->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            return ['success' => false, 'error' => 'Username already exists'];
        }

        // Check if email exists
        if ($email) {
            $stmt = $con->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) {
                return ['success' => false, 'error' => 'Email already exists'];
            }
        }

        // When the caller enforces a profile cap (OIDC self-signup), re-check it
        // inside the write transaction: two concurrent signups could otherwise
        // both pass an earlier check and land on the same last free slot.
        $useCap = $maxUsers !== null && $maxUsers > 0;
        if ($useCap) {
            $con->beginTransaction();
            $stmt = $con->query("SELECT COUNT(*) FROM users");
            $current = $stmt->fetchColumn();
            if ($current === false || (int)$current >= $maxUsers) {
                $con->rollBack();
                return ['success' => false, 'error' => 'signup limit reached'];
            }
        }

        // createUserProfile is only reachable from trusted flows (admin
        // creation, OIDC provisioning), so a provided email counts as verified.
        $stmt = $con->prepare("
            INSERT INTO users (username, email, email_verified, active, password_login_disabled)
            VALUES (?, ?, ?, 1, ?)
        ");
        $stmt->execute([
            $username,
            $email,
            ($email !== null && trim((string)$email) !== '') ? 1 : 0,
            $disablePasswordLogin ? 1 : 0
        ]);

        $userId = (int)$con->lastInsertId();

        if ($useCap) {
            $con->commit();
        }
        
        // Sync username and email to user's local DB for recovery
        require_once __DIR__ . '/UserDataManager.php';
        $udm = new UserDataManager($userId);
        $udm->syncUsername($username);
        if ($email) {
            $udm->syncEmail($email);
        }
        
        return ['success' => true, 'user_id' => $userId];
    } catch (Exception $e) {
        if (isset($con) && $con instanceof PDO && $con->inTransaction()) {
            $con->rollBack();
        }
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Update a user profile
 */
function updateUserProfile(int $id, array $data): array {
    try {
        $masterCon = getMasterConnection();

        $stmt = $masterCon->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$currentUser) {
            return ['success' => false, 'error' => 'User profile not found'];
        }
        
        $allowedFields = ['username', 'email', 'email_verified', 'first_name', 'last_name', 'active', 'is_admin', 'notify_new_user', 'oidc_subject', 'quota_max_notes', 'quota_max_storage_mb', 'quota_max_storage_s3_mb', 'quota_max_backups_s3_mb'];
        $updates = [];
        $params = [];

        if (array_key_exists('username', $data)) {
            $newUsername = trim((string)$data['username']);
            if ($newUsername === '') {
                return ['success' => false, 'error' => 'Username is required'];
            }
            // Same rule as createUserProfile: numeric usernames would be ambiguous
            // with user IDs in the Basic Auth lookup.
            if (ctype_digit($newUsername)) {
                return ['success' => false, 'error' => 'Username cannot be purely numeric'];
            }
            $stmt = $masterCon->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
            $stmt->execute([$newUsername, $id]);
            if ($stmt->fetch()) {
                return ['success' => false, 'error' => 'Username already exists'];
            }
            $data['username'] = $newUsername;
        }

        if (array_key_exists('email', $data)) {
            $newEmail = trim((string)$data['email']);
            if ($newEmail !== '') {
                $stmt = $masterCon->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
                $stmt->execute([$newEmail, $id]);
                if ($stmt->fetch()) {
                    return ['success' => false, 'error' => 'Email already exists'];
                }
            }
            $data['email'] = $newEmail;
            // Fail secure: an email change drops the verified flag unless the
            // caller (admin flow, OIDC sync) explicitly marks it verified.
            if (!array_key_exists('email_verified', $data)) {
                $data['email_verified'] = 0;
            }
        }
        if (array_key_exists('email_verified', $data)) {
            $data['email_verified'] = (int)(bool)$data['email_verified'];
        }

        foreach (['first_name', 'last_name'] as $nameField) {
            if (array_key_exists($nameField, $data)) {
                $trimmedName = trim((string)$data[$nameField]);
                $data[$nameField] = $trimmedName !== '' ? $trimmedName : null;
            }
        }

        // Per-user quota overrides: null or '' clears the override (inherit the
        // global setting), 0 means unlimited, a positive value is the limit.
        foreach (['quota_max_notes', 'quota_max_storage_mb', 'quota_max_storage_s3_mb', 'quota_max_backups_s3_mb'] as $quotaField) {
            if (array_key_exists($quotaField, $data)) {
                $rawQuota = $data[$quotaField];
                if ($rawQuota === null || trim((string)$rawQuota) === '') {
                    $data[$quotaField] = null;
                } else {
                    $quotaValue = (int)$rawQuota;
                    if ($quotaValue < 0 || $quotaValue > 100000000) {
                        return ['success' => false, 'error' => $quotaField . ' must be between 0 and 100000000'];
                    }
                    $data[$quotaField] = $quotaValue;
                }
            }
        }

        foreach ($data as $key => $value) {
            if (in_array($key, $allowedFields)) {
                if ($key === 'active' || $key === 'is_admin' || $key === 'notify_new_user') {
                    $value = (int)(bool)$value;
                }
                $updates[] = "$key = ?";
                $params[] = $value;
            }
        }
        
        if (empty($updates)) {
            return ['success' => false, 'error' => 'No valid fields to update'];
        }

        $newActive = array_key_exists('active', $data) ? (int)(bool)$data['active'] : (int)$currentUser['active'];
        $newIsAdmin = array_key_exists('is_admin', $data) ? (int)(bool)$data['is_admin'] : (int)$currentUser['is_admin'];

        if ($id === 1 && array_key_exists('is_admin', $data) && $newIsAdmin !== 1) {
            return ['success' => false, 'error' => 'Cannot remove administrator role from user ID 1'];
        }

        if ((int)$currentUser['active'] === 1 && (int)$currentUser['is_admin'] === 1 && ($newActive !== 1 || $newIsAdmin !== 1)) {
            $stmt = $masterCon->query("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND active = 1");
            $activeAdminCount = (int)$stmt->fetchColumn();

            if ($activeAdminCount <= 1) {
                return ['success' => false, 'error' => 'Cannot remove or deactivate the last active admin user'];
            }
        }
        
        // Losing the admin role, being deactivated, or losing the email address
        // makes the user undeliverable for new-user notifications, so drop the
        // opt-in instead of leaving it stale.
        $emailCleared = array_key_exists('email', $data) && trim((string)$data['email']) === '';
        if (($newActive !== 1 || $newIsAdmin !== 1 || $emailCleared) && !array_key_exists('notify_new_user', $data)) {
            $updates[] = "notify_new_user = 0";
        }

        $updates[] = "updated_at = CURRENT_TIMESTAMP";
        $params[] = $id;
        
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $masterCon->prepare($sql);
        $stmt->execute($params);

        // Every profile and quota write funnels through here, so logging at
        // this single point covers the self-service API, the admin API, both
        // admin forms and the OIDC email sync. $currentUser holds the row as it
        // was before the UPDATE, which is what makes "X -> Y" possible.
        require_once __DIR__ . '/../ActivityLog.php';
        logProfileUpdate($id, $currentUser, $data);

        // If updating the current active account or authenticated identity, refresh the session data
        $isCurrentUser = (isset($_SESSION['user_id']) && (int)$_SESSION['user_id'] === $id);
        $isAuthenticatedUser = (isset($_SESSION['login_user_id']) && (int)$_SESSION['login_user_id'] === $id);
        if ($isCurrentUser) {
            $stmt = $masterCon->prepare("SELECT * FROM users WHERE id = ?");
            $stmt->execute([$id]);
            $updatedUser = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($updatedUser) {
                $updatedUser = withComputedDisplayName($updatedUser);
                $_SESSION['user'] = $updatedUser;
                if ($isAuthenticatedUser) {
                    $_SESSION['login_user'] = $updatedUser;
                }
            }
        } elseif ($isAuthenticatedUser) {
            $stmt = $masterCon->prepare("SELECT * FROM users WHERE id = ?");
            $stmt->execute([$id]);
            $updatedUser = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($updatedUser) {
                $_SESSION['login_user'] = withComputedDisplayName($updatedUser);
            }
        }
        
        // If username, email or names were updated, sync to local DB
        if (isset($data['username']) || isset($data['email'])
            || array_key_exists('first_name', $data) || array_key_exists('last_name', $data)) {
            require_once __DIR__ . '/UserDataManager.php';
            $udm = new UserDataManager($id);
            
            // If it's the current user, we can reuse the global $con to avoid 
            // SQLite lock contention which causes several seconds of delay.
            // The global $con is provided by db_connect.php and points to the user's DB.
            global $con; 
            $useCon = ($isCurrentUser && isset($con)) ? $con : null;
            
            if (isset($data['username'])) {
                $udm->syncUsername($data['username'], $useCon);
            }
            if (isset($data['email'])) {
                $udm->syncEmail($data['email'], $useCon);
            }
            if (array_key_exists('first_name', $data) || array_key_exists('last_name', $data)) {
                $freshUser = $updatedUser ?? null;
                if ($freshUser === null) {
                    $stmt = $masterCon->prepare("SELECT first_name, last_name FROM users WHERE id = ?");
                    $stmt->execute([$id]);
                    $freshUser = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
                }
                $udm->syncProfileNames($freshUser['first_name'] ?? null, $freshUser['last_name'] ?? null, $useCon);
            }
        }
        
        return ['success' => true];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Delete a user profile
 *
 * Deleting an account also removes its objects from the S3 buckets (its
 * attachments and its backup archives). This is not optional: nothing
 * references a deleted user's prefix anymore, so anything left behind would be
 * orphaned in the bucket forever.
 *
 * The result carries 's3_deleted' (objects removed) and, when a bucket could
 * not be reached, 's3_error' — on failure too, since the purge runs before the
 * row deletions and cannot be rolled back. A bucket failure never blocks the
 * deletion: the account and its local data are still removed, and the leftover
 * objects are reported so an admin can clean them up.
 */
function deleteUserProfile(int $id, bool $deleteData = false): array {
    try {
        $con = getMasterConnection();

        if ($id === 1) {
            return ['success' => false, 'error' => 'Cannot delete user ID 1'];
        }
        
        // Don't allow deleting the last admin
        $stmt = $con->query("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND active = 1");
        $adminCount = $stmt->fetchColumn();
        
        $stmt = $con->prepare("SELECT is_admin FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user && $user['is_admin'] && $adminCount <= 1) {
            return ['success' => false, 'error' => 'Cannot delete the last admin user'];
        }
        
        // Delete user data if requested
        if ($deleteData) {
            require_once __DIR__ . '/UserDataManager.php';
            $dataManager = new UserDataManager($id);
            if (!$dataManager->deleteAllUserData()) {
                // Keep the account row: dropping it here would orphan the notes
                // and attachments still on disk while reporting a success.
                $failures = $dataManager->getDeletionFailures();
                error_log(
                    'deleteUserProfile: kept user ' . $id . ', could not remove '
                    . count($failures) . ' path(s), first: ' . ($failures[0] ?? 'unknown')
                );

                return [
                    'success' => false,
                    'error' => 'Could not delete the user data files'
                ];
            }
        }
        
        // Remove the account's objects from the S3 buckets. Done after the
        // local data (a failure there aborts and keeps the account) but before
        // the rows are dropped, so a bucket error is still reported against an
        // account the admin can retry on.
        $s3Deleted = 0;
        $s3Errors = [];

        require_once __DIR__ . '/../storage/AttachmentStorage.php';
        $attachments = AttachmentStorage::purgeUserObjects($id);
        $s3Deleted += $attachments['deleted'];
        if ($attachments['error'] !== null) {
            $s3Errors[] = 'attachments: ' . $attachments['error'];
        }

        require_once __DIR__ . '/../S3BackupService.php';
        $backups = S3BackupService::deleteAllUserBackups($id);
        $s3Deleted += $backups['deleted'];
        if ($backups['error'] !== null) {
            $s3Errors[] = 'backups: ' . $backups['error'];
        }

        // Delete user's shared links from global registry
        $stmt = $con->prepare("DELETE FROM shared_links WHERE user_id = ?");
        $stmt->execute([$id]);

        // Delete account access grants involving this user.
        $stmt = $con->prepare("DELETE FROM user_account_access WHERE accessor_user_id = ? OR target_user_id = ?");
        $stmt->execute([$id, $id]);
        
        $stmt = $con->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$id]);

        return [
            'success' => true,
            's3_deleted' => $s3Deleted,
            's3_error' => $s3Errors ? implode('; ', $s3Errors) : null,
        ];
    } catch (Exception $e) {
        // The S3 purge runs before the row deletions and is irreversible: if
        // the failure happened after it, the caller must still learn that
        // objects are already gone even though the account was kept.
        return [
            'success' => false,
            'error' => $e->getMessage(),
            's3_deleted' => $s3Deleted ?? 0,
            's3_error' => !empty($s3Errors) ? implode('; ', $s3Errors) : null,
        ];
    }
}

/**
 * List all user profiles (for admin)
 * $sort must be one of the whitelisted keys below; anything else falls back to id_asc.
 */
function listAllUserProfiles(string $sort = 'id_asc'): array {
    // Text columns push empty values last in both directions; NULL dates sort
    // as "least recent" (SQLite treats NULL as smallest, so DESC puts them last).
    $orderClauses = [
        'id_asc' => 'id ASC',
        'id_desc' => 'id DESC',
        'status_asc' => 'active ASC, username COLLATE NOCASE ASC',
        'status_desc' => 'active DESC, username COLLATE NOCASE ASC',
        'username_asc' => 'username COLLATE NOCASE ASC',
        'username_desc' => 'username COLLATE NOCASE DESC',
        'admin_asc' => 'is_admin ASC, username COLLATE NOCASE ASC',
        'admin_desc' => 'is_admin DESC, username COLLATE NOCASE ASC',
        'first_name_asc' => "(first_name IS NULL OR first_name = '') ASC, first_name COLLATE NOCASE ASC",
        'first_name_desc' => "(first_name IS NULL OR first_name = '') ASC, first_name COLLATE NOCASE DESC",
        'last_name_asc' => "(last_name IS NULL OR last_name = '') ASC, last_name COLLATE NOCASE ASC",
        'last_name_desc' => "(last_name IS NULL OR last_name = '') ASC, last_name COLLATE NOCASE DESC",
        'email_asc' => "(email IS NULL OR email = '') ASC, email COLLATE NOCASE ASC",
        'email_desc' => "(email IS NULL OR email = '') ASC, email COLLATE NOCASE DESC",
        'created_asc' => 'created_at ASC',
        'created_desc' => 'created_at DESC',
        'last_login_asc' => 'last_login ASC',
        'last_login_desc' => 'last_login DESC',
    ];
    $orderBy = ($orderClauses[$sort] ?? $orderClauses['id_asc']) . ', id ASC';

    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, email, email_verified, first_name, last_name, is_admin, notify_new_user, active, created_at, last_login, oidc_subject
            FROM users
            ORDER BY $orderBy
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }
}

/**
 * List the active admins who opted in to new-user notifications.
 * Admins without an email address cannot be notified, so they are skipped.
 */
function listNewUserNotificationRecipients(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, email, first_name, last_name
            FROM users
            WHERE notify_new_user = 1
              AND is_admin = 1
              AND active = 1
              AND email IS NOT NULL
              AND email != ''
            ORDER BY username
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }
}

/**
 * List the active admins with an email address, i.e. those who can be offered
 * the new-user notification opt-in.
 */
function listNewUserNotificationCandidates(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, email, first_name, last_name, notify_new_user
            FROM users
            WHERE is_admin = 1
              AND active = 1
              AND email IS NOT NULL
              AND email != ''
            ORDER BY username
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }
}

/**
 * List all registered outgoing webhooks, newest first.
 */
function listWebhooks(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("SELECT * FROM webhooks ORDER BY id DESC");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }
}

/**
 * List the active webhooks subscribed to a given event.
 * The events column holds a comma-separated list of event names.
 *
 * $userId scopes the lookup to one account's webhooks: user events must only
 * ever reach the endpoints registered by the account that produced them.
 * Leave it null for instance events, which go to every subscribed webhook.
 */
function listActiveWebhooksForEvent(string $event, ?int $userId = null): array {
    $matching = [];
    foreach (listWebhooks() as $webhook) {
        if (empty($webhook['active'])) {
            continue;
        }
        if ($userId !== null && (int)($webhook['user_id'] ?? 0) !== $userId) {
            continue;
        }
        $events = array_map('trim', explode(',', (string)$webhook['events']));
        if (in_array($event, $events, true)) {
            $matching[] = $webhook;
        }
    }
    return $matching;
}

/**
 * List one account's own webhooks (user webhooks page).
 */
function listWebhooksForUser(int $userId): array {
    return array_values(array_filter(listWebhooks(), static function ($webhook) use ($userId) {
        return (int)($webhook['user_id'] ?? 0) === $userId;
    }));
}

/**
 * Distinct owner ids of the active webhooks subscribed to at least one of the
 * given events. Lets the reminder worker scan only the accounts that actually
 * registered a reminder webhook.
 */
function listWebhookUserIdsForEvents(array $events): array {
    $userIds = [];
    foreach ($events as $event) {
        foreach (listActiveWebhooksForEvent($event) as $webhook) {
            $ownerId = (int)($webhook['user_id'] ?? 0);
            if ($ownerId > 0) {
                $userIds[$ownerId] = true;
            }
        }
    }
    return array_keys($userIds);
}

/**
 * True when the webhook subscribes to at least one event about the primary
 * account's own content (reminder.* / note.*). User webhooks are managed from
 * that account's settings page, instance webhooks from the admin page; a
 * legacy webhook mixing both kinds of events shows up on both pages.
 */
function isUserWebhook(array $webhook): bool {
    foreach (array_map('trim', explode(',', (string)($webhook['events'] ?? ''))) as $event) {
        if (strpos($event, 'reminder.') === 0 || strpos($event, 'note.') === 0) {
            return true;
        }
    }
    return false;
}

/**
 * isUserWebhook counterpart: true when the webhook subscribes to at least one
 * instance-level event (anything that is not reminder.* / note.*).
 */
function isInstanceWebhook(array $webhook): bool {
    foreach (array_map('trim', explode(',', (string)($webhook['events'] ?? ''))) as $event) {
        if ($event === '') {
            continue;
        }
        if (strpos($event, 'reminder.') !== 0 && strpos($event, 'note.') !== 0) {
            return true;
        }
    }
    return false;
}

function getWebhookById(int $id): ?array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM webhooks WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * $userId is the owning account for a user webhook; null registers an
 * instance webhook (admin page).
 */
function createWebhook(string $url, string $secret, array $events, ?int $userId = null): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("INSERT INTO webhooks (url, secret, events, active, user_id) VALUES (?, ?, ?, 1, ?)");
        return $stmt->execute([$url, $secret !== '' ? $secret : null, implode(',', $events), $userId]);
    } catch (Exception $e) {
        error_log("Failed to create webhook: " . $e->getMessage());
        return false;
    }
}

function deleteWebhook(int $id): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("DELETE FROM webhooks WHERE id = ?");
        return $stmt->execute([$id]);
    } catch (Exception $e) {
        return false;
    }
}

function setWebhookActive(int $id, bool $active): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE webhooks SET active = ? WHERE id = ?");
        return $stmt->execute([$active ? 1 : 0, $id]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Record the outcome of the most recent delivery attempt, e.g. "200" or
 * "error: timeout", for display on the admin page.
 */
function recordWebhookDelivery(int $id, string $status): void {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE webhooks SET last_status = ?, last_delivery_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([mb_substr($status, 0, 200), $id]);
    } catch (Exception $e) {
        // Delivery bookkeeping must never break the dispatch itself.
    }
}

/**
 * Replace the set of admins subscribed to new-user notifications.
 * Ids that are not eligible admins are ignored rather than rejected.
 */
function setNewUserNotificationRecipients(array $userIds): bool {
    try {
        $con = getMasterConnection();

        $eligible = [];
        foreach (listNewUserNotificationCandidates() as $candidate) {
            $eligible[(int)$candidate['id']] = true;
        }

        $selected = [];
        foreach ($userIds as $userId) {
            $userId = (int)$userId;
            if (isset($eligible[$userId])) {
                $selected[$userId] = true;
            }
        }

        $con->beginTransaction();
        $con->exec("UPDATE users SET notify_new_user = 0 WHERE notify_new_user = 1");
        if (!empty($selected)) {
            $stmt = $con->prepare("UPDATE users SET notify_new_user = 1 WHERE id = ?");
            foreach (array_keys($selected) as $userId) {
                $stmt->execute([$userId]);
            }
        }
        $con->commit();

        return true;
    } catch (Exception $e) {
        if (isset($con) && $con instanceof PDO && $con->inTransaction()) {
            $con->rollBack();
        }
        error_log('Failed to save new user notification recipients: ' . $e->getMessage());
        return false;
    }
}

/**
 * Get a global setting
 */
function getGlobalSetting(string $key, $default = null) {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT value FROM global_settings WHERE key = ?");
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value !== false ? $value : $default;
    } catch (Exception $e) {
        return $default;
    }
}

/**
 * Set a global setting
 */
function setGlobalSetting(string $key, $value): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("
            INSERT OR REPLACE INTO global_settings (key, value)
            VALUES (?, ?)
        ");
        return $stmt->execute([$key, $value]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Per-user quota overrides. NULL means the user inherits the global setting,
 * 0 means unlimited, any other value is that user's limit.
 * @return array Keys: max_notes (int|null), max_storage_mb (int|null),
 *               max_storage_s3_mb (int|null), max_backups_s3_mb (int|null)
 */
function getUserQuotaOverrides(int $userId): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT quota_max_notes, quota_max_storage_mb, quota_max_storage_s3_mb, quota_max_backups_s3_mb FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return [
                'max_notes' => $row['quota_max_notes'] !== null ? (int)$row['quota_max_notes'] : null,
                'max_storage_mb' => $row['quota_max_storage_mb'] !== null ? (int)$row['quota_max_storage_mb'] : null,
                'max_storage_s3_mb' => $row['quota_max_storage_s3_mb'] !== null ? (int)$row['quota_max_storage_s3_mb'] : null,
                'max_backups_s3_mb' => $row['quota_max_backups_s3_mb'] !== null ? (int)$row['quota_max_backups_s3_mb'] : null,
            ];
        }
    } catch (Exception $e) {
        // Fall through to "no overrides"
    }
    return ['max_notes' => null, 'max_storage_mb' => null, 'max_storage_s3_mb' => null, 'max_backups_s3_mb' => null];
}

/**
 * Register a shared link in the global registry
 */
function registerSharedLink(string $token, int $userId, string $targetType, int $targetId): bool {
    try {
        $con = getMasterConnection();
        
        // Ensure availability before inserting
        if (!isTokenAvailable($token, $userId, $targetType, $targetId)) {
            error_log("Token registration denied: collision with existing token ownership.");
            return false;
        }

        $stmt = $con->prepare("
            INSERT OR REPLACE INTO shared_links (token, user_id, target_type, target_id)
            VALUES (?, ?, ?, ?)
        ");
        return $stmt->execute([$token, $userId, $targetType, $targetId]);
    } catch (Exception $e) {
        error_log("Failed to register shared link: " . $e->getMessage());
        return false;
    }
}

/**
 * Check if a token is available for use.
 * Returns true if the token is not used by anyone, 
 * or if it is already used by the SAME user for the SAME item.
 */
function isTokenAvailable(string $token, int $userId, string $targetType, int $targetId): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT user_id, target_type, target_id FROM shared_links WHERE token = ? LIMIT 1");
        $stmt->execute([$token]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            return true;
        }
        
        // It's available if it's the exact same item
        return (int)$row['user_id'] === $userId && 
               $row['target_type'] === $targetType && 
               (int)$row['target_id'] === $targetId;
    } catch (Exception $e) {
        error_log("Failed to check token availability: " . $e->getMessage());
        return false;
    }
}

/**
 * Unregister a shared link from the global registry
 */
function unregisterSharedLink(string $token): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("DELETE FROM shared_links WHERE token = ?");
        return $stmt->execute([$token]);
    } catch (Exception $e) {
        error_log("Failed to unregister shared link: " . $e->getMessage());
        return false;
    }
}

/**
 * Get the stored password hash for a user
 */
function getUserPasswordHash(int $userId): ?string {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $hash = $stmt->fetchColumn();
        return ($hash !== false && $hash !== null && $hash !== '') ? $hash : null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Set a new password hash for a user (bcrypt)
 */
function setUserPasswordHash(int $userId, string $plainPassword): bool {
    try {
        $con = getMasterConnection();
        $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
        // Setting an explicit password re-enables password login: the profile
        // now has a real credential, so the no-handover flag no longer applies.
        $stmt = $con->prepare("UPDATE users SET password_hash = ?, password_login_disabled = 0, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        return $stmt->execute([$hash, $userId]);
    } catch (Exception $e) {
        error_log("Failed to set password hash for user $userId: " . $e->getMessage());
        return false;
    }
}

/**
 * Clear the stored password hash (revert to default password)
 */
function clearUserPasswordHash(int $userId): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE users SET password_hash = NULL, password_changed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        return $stmt->execute([$userId]);
    } catch (Exception $e) {
        error_log("Failed to clear password hash for user $userId: " . $e->getMessage());
        return false;
    }
}

/**
 * Whether a profile is barred from the hardcoded default-password fallback.
 *
 * The defaults exist so an admin can hand over initial credentials for a
 * profile they created. Profiles auto-provisioned by OIDC never went through
 * that handover, so anyone knowing the username could sign in with 'user' (or
 * 'admin'). They are flagged at creation time instead of being inferred from
 * oidc_subject: that column is also stamped onto long-standing password
 * accounts the first time they use SSO, and keying off it would silently
 * revoke a password those users legitimately rely on.
 *
 * Setting a password hash clears the flag, so a profile can always be given
 * local credentials deliberately.
 */
function isPasswordLoginDisabled(array $user): bool {
    if (array_key_exists('password_login_disabled', $user)) {
        return (int)$user['password_login_disabled'] === 1;
    }

    // Not every profile getter selects the column (getAllUserProfiles() returns
    // only a few), so re-read it rather than treating a partial row as "allowed"
    // and failing open.
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0) {
        return true; // Unidentifiable profile: refuse the default-password fallback.
    }
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT password_login_disabled FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $value = $stmt->fetchColumn();
    } catch (Exception $e) {
        error_log("Failed to read password_login_disabled for user $userId: " . $e->getMessage());
        return true; // On error, deny rather than fall back to a public constant.
    }

    return $value !== false && (int)$value === 1;
}

/**
 * Verify a password against a user's stored hash or hardcoded default.
 * Returns true if password matches.
 */
function verifyUserPassword(int $userId, string $password): bool {
    $user = getUserProfileById($userId);
    if (!$user) return false;

    // Priority 1: Check DB-stored bcrypt hash
    $storedHash = getUserPasswordHash($userId);
    if ($storedHash !== null) {
        return password_verify($password, $storedHash);
    }

    // No hash, and the profile never received an initial credential: password
    // authentication is not available on it. An admin can still set one through
    // the reset-password endpoint if a local credential is genuinely wanted.
    if (isPasswordLoginDisabled($user)) {
        return false;
    }

    // Priority 2: Fall back to hardcoded default password. The constants live in
    // auth.php, which db_master.php does not pull in; deny rather than fatal if
    // this is reached from a context that never loaded it.
    if ((bool)$user['is_admin']) {
        return defined('AUTH_PASSWORD') && $password === AUTH_PASSWORD;
    }
    return defined('AUTH_USER_PASSWORD') && $password === AUTH_USER_PASSWORD;
}

/**
 * Check if a user has a custom password set (not using env var default)
 */
function hasCustomPassword(int $userId): bool {
    return getUserPasswordHash($userId) !== null;
}

/**
 * Get the secret used for remember-me cookie signing.
 * Uses DB password hash if available, otherwise hardcoded default password.
 *
 * Returns null when no secret can be derived, which means remember-me is not
 * available for that profile: a profile with no hash and no initial credential
 * would otherwise be signed with a publicly known constant, letting anyone
 * forge a valid session cookie from a guessable username, id and timestamp.
 */
function getRememberMeSecret(array $user): ?string {
    $userId = (int)($user['id'] ?? 0);
    if ($userId <= 0) {
        return null; // Unidentifiable profile: no secret rather than a constant.
    }

    $storedHash = getUserPasswordHash($userId);
    if ($storedHash !== null) {
        return $storedHash;
    }

    if (isPasswordLoginDisabled($user)) {
        return null;
    }

    // Fall back to hardcoded default password
    if ((bool)$user['is_admin']) {
        return defined('AUTH_PASSWORD') ? AUTH_PASSWORD : 'admin';
    }
    return defined('AUTH_USER_PASSWORD') ? AUTH_USER_PASSWORD : 'user';
}
