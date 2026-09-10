<?php
/**
 * App passwords: storage and verification.
 *
 * The format, the hash and the reasoning behind the feature are in
 * src/lib/app-passwords.php. This file owns the user_app_passwords table in
 * master.db and is the only place that reads or writes it.
 *
 * The table is created on first use with CREATE TABLE IF NOT EXISTS, the
 * convention initializeMasterDatabase() follows for every master table (see
 * ensureActivityLogTable() for the same pattern), so no schema version bump
 * is involved.
 */

require_once __DIR__ . '/../lib/app-passwords.php';
require_once __DIR__ . '/db_master.php';

function ensureAppPasswordsTable(PDO $con): void {
    static $ready = false;
    if ($ready) {
        return;
    }
    // token_hash is UNIQUE so the lookup on every API request is an index
    // hit, and so the same secret can never belong to two rows. The FK
    // cascade removes the credentials with the account: a deleted profile
    // must not leave behind secrets that would answer for a reused id.
    $con->exec("
        CREATE TABLE IF NOT EXISTS user_app_passwords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            label TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            token_hint TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_user_app_passwords_user ON user_app_passwords(user_id)");
    $ready = true;
}

function getAppPasswordsConnection(): PDO {
    $con = getMasterConnection();
    ensureAppPasswordsTable($con);
    return $con;
}

/**
 * Every app password of a profile, newest first, without the hash. Expired
 * rows are included and flagged rather than hidden: the user should see that
 * a client stopped working because its credential ran out, and be able to
 * remove the row.
 *
 * @return list<array{id:int,label:string,hint:string,created_at:?string,last_used_at:?string,expires_at:?string,expired:bool}>
 */
function listUserAppPasswords(int $userId): array {
    if ($userId <= 0) {
        return [];
    }
    try {
        $con = getAppPasswordsConnection();
        $stmt = $con->prepare("
            SELECT id, label, token_hint, created_at, last_used_at, expires_at
            FROM user_app_passwords
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
        ");
        $stmt->execute([$userId]);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rows[] = [
                'id' => (int)$row['id'],
                'label' => (string)$row['label'],
                'hint' => (string)$row['token_hint'],
                'created_at' => $row['created_at'] ?? null,
                'last_used_at' => $row['last_used_at'] ?? null,
                'expires_at' => $row['expires_at'] ?? null,
                'expired' => isAppPasswordExpired($row['expires_at'] ?? null),
            ];
        }
        return $rows;
    } catch (Throwable $e) {
        error_log("Failed to list app passwords for user $userId: " . $e->getMessage());
        return [];
    }
}

/** Rows held by a profile, expired ones included (they count against the cap). */
function countUserAppPasswords(int $userId): int {
    if ($userId <= 0) {
        return 0;
    }
    try {
        $con = getAppPasswordsConnection();
        $stmt = $con->prepare("SELECT COUNT(*) FROM user_app_passwords WHERE user_id = ?");
        $stmt->execute([$userId]);
        return (int)$stmt->fetchColumn();
    } catch (Throwable $e) {
        error_log("Failed to count app passwords for user $userId: " . $e->getMessage());
        return 0;
    }
}

/** Rows a client could still authenticate with right now. */
function countActiveUserAppPasswords(int $userId): int {
    $active = 0;
    foreach (listUserAppPasswords($userId) as $row) {
        if (!$row['expired']) {
            $active++;
        }
    }
    return $active;
}

/**
 * Creates an app password and returns it with the clear-text secret, which
 * is the only time the secret exists outside the caller's hands.
 *
 * @param string|null $expiresAt UTC 'Y-m-d H:i:s', or null for no expiry
 * @return array{id:int,label:string,secret:string,hint:string,created_at:?string,expires_at:?string}|null
 */
function createUserAppPassword(int $userId, string $label, ?string $expiresAt = null): ?array {
    if ($userId <= 0 || $label === '') {
        return null;
    }
    try {
        $con = getAppPasswordsConnection();
        $secret = generateAppPasswordSecret();
        $stmt = $con->prepare("
            INSERT INTO user_app_passwords (user_id, label, token_hash, token_hint, expires_at)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$userId, $label, hashAppPasswordSecret($secret), appPasswordHint($secret), $expiresAt]);
        $id = (int)$con->lastInsertId();

        $created = $con->prepare("SELECT created_at FROM user_app_passwords WHERE id = ?");
        $created->execute([$id]);
        $createdAt = $created->fetchColumn();

        return [
            'id' => $id,
            'label' => $label,
            'secret' => $secret,
            'hint' => appPasswordHint($secret),
            'created_at' => $createdAt !== false ? (string)$createdAt : null,
            'expires_at' => $expiresAt,
        ];
    } catch (Throwable $e) {
        error_log("Failed to create app password for user $userId: " . $e->getMessage());
        return null;
    }
}

/**
 * The row an app password of a profile, by id. Null when the id belongs to
 * another profile: a caller must never learn that the id exists elsewhere.
 */
function getUserAppPassword(int $userId, int $id): ?array {
    if ($userId <= 0 || $id <= 0) {
        return null;
    }
    foreach (listUserAppPasswords($userId) as $row) {
        if ($row['id'] === $id) {
            return $row;
        }
    }
    return null;
}

/**
 * Deletes one app password of a profile. False when no such row belongs to
 * that profile, so a wrong id and another account's id look the same.
 */
function revokeUserAppPassword(int $userId, int $id): bool {
    if ($userId <= 0 || $id <= 0) {
        return false;
    }
    try {
        $con = getAppPasswordsConnection();
        $stmt = $con->prepare("DELETE FROM user_app_passwords WHERE id = ? AND user_id = ?");
        $stmt->execute([$id, $userId]);
        return $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        error_log("Failed to revoke app password $id for user $userId: " . $e->getMessage());
        return false;
    }
}

/**
 * Resolves a secret to its row, whoever owns it. Null for an unknown secret.
 */
function findAppPasswordBySecret(string $secret): ?array {
    if (!isAppPasswordSecret($secret)) {
        return null;
    }
    try {
        $con = getAppPasswordsConnection();
        $stmt = $con->prepare("
            SELECT id, user_id, label, token_hint, last_used_at, expires_at
            FROM user_app_passwords
            WHERE token_hash = ?
        ");
        $stmt->execute([hashAppPasswordSecret($secret)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) {
        error_log('Failed to look up an app password: ' . $e->getMessage());
        return null;
    }
}

/**
 * The check the API runs: does this secret belong to this profile, and is it
 * still valid? Returns the row on success, null otherwise.
 *
 * The profile is part of the question, not derived from the answer: the
 * caller already resolved the username sent alongside the secret, and a
 * secret presented with the wrong username is a failed attempt like any
 * other, not a way to sign in as whoever owns it.
 */
function verifyUserAppPassword(int $userId, string $secret): ?array {
    if ($userId <= 0) {
        return null;
    }
    $row = findAppPasswordBySecret($secret);
    if ($row === null || (int)$row['user_id'] !== $userId) {
        return null;
    }
    if (isAppPasswordExpired($row['expires_at'] ?? null)) {
        return null;
    }
    touchAppPasswordLastUsed((int)$row['id'], $row['last_used_at'] ?? null);
    return $row;
}

/**
 * Records a use. "Last used" is what makes the list actionable (a credential
 * nobody has used for months is one to revoke), but a write per API call
 * would put master.db under a write lock for every note fetch, so the
 * column is refreshed at most once a minute per credential.
 */
function touchAppPasswordLastUsed(int $id, ?string $lastUsedAt): void {
    if ($lastUsedAt !== null && $lastUsedAt !== '') {
        $previous = strtotime($lastUsedAt . ' UTC');
        if ($previous !== false && time() - $previous < 60) {
            return;
        }
    }
    try {
        $con = getAppPasswordsConnection();
        $con->prepare("UPDATE user_app_passwords SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
    } catch (Throwable $e) {
        // Bookkeeping only: never let it fail the request being authenticated.
        error_log("Failed to record app password use for $id: " . $e->getMessage());
    }
}
