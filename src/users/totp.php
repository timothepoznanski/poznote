<?php
/**
 * Two-factor authentication: storage and verification.
 *
 * The algorithm, the recovery code format and the reasoning behind the
 * feature are in src/lib/totp.php. This file owns the user_totp and
 * user_totp_recovery_codes tables in master.db and is the only place that
 * reads or writes them.
 *
 * The secret lives in its own table rather than in a users column on purpose:
 * profile rows are read with SELECT *, copied into the session and returned by
 * several API endpoints, and the shared secret must never travel with them.
 *
 * A row only exists once the user has proved the authenticator app works by
 * typing a first code; a setup in progress is kept in the session (see
 * UsersController::twoFactorSetup()), so an abandoned setup cannot lock
 * anyone out.
 *
 * Both tables are created on first use with CREATE TABLE IF NOT EXISTS, the
 * convention every master table follows (see ensureAppPasswordsTable()), so
 * no schema version bump is involved.
 */

require_once __DIR__ . '/../lib/totp.php';
require_once __DIR__ . '/db_master.php';

function ensureTotpTables(PDO $con): void {
    static $ready = false;
    if ($ready) {
        return;
    }
    // The FK cascades remove the factor with the account: a deleted profile
    // must not leave a secret behind that would answer for a reused id.
    $con->exec("
        CREATE TABLE IF NOT EXISTS user_totp (
            user_id INTEGER PRIMARY KEY,
            secret TEXT NOT NULL,
            last_step INTEGER,
            enabled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $con->exec("
        CREATE TABLE IF NOT EXISTS user_totp_recovery_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            used_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_user_totp_recovery_user ON user_totp_recovery_codes(user_id)");
    $ready = true;
}

function getTotpConnection(): PDO {
    $con = getMasterConnection();
    ensureTotpTables($con);
    return $con;
}

/**
 * The stored factor of a profile, or null when two-factor is off.
 *
 * @return array{secret:string,last_step:?int,enabled_at:?string}|null
 */
function getUserTotpRow(int $userId): ?array {
    if ($userId <= 0) {
        return null;
    }
    $con = getTotpConnection();
    $stmt = $con->prepare("SELECT secret, last_step, enabled_at FROM user_totp WHERE user_id = ?");
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || (string)$row['secret'] === '') {
        return null;
    }
    return [
        'secret' => (string)$row['secret'],
        'last_step' => $row['last_step'] === null ? null : (int)$row['last_step'],
        'enabled_at' => $row['enabled_at'] ?? null,
    ];
}

/**
 * Whether a profile signs in with a second factor.
 *
 * Deliberately lets a storage error through as an exception instead of
 * answering false: every caller is a login path, and "the table could not be
 * read" must not be understood as "no second factor needed".
 */
function isUserTotpEnabled(int $userId): bool {
    return getUserTotpRow($userId) !== null;
}

/**
 * Unused recovery codes left to a profile.
 */
function countUserTotpRecoveryCodes(int $userId): int {
    if ($userId <= 0) {
        return 0;
    }
    $con = getTotpConnection();
    $stmt = $con->prepare("SELECT COUNT(*) FROM user_totp_recovery_codes WHERE user_id = ? AND used_at IS NULL");
    $stmt->execute([$userId]);
    return (int)$stmt->fetchColumn();
}

/**
 * Replaces the recovery codes of a profile and returns the new ones in clear,
 * the only time they exist outside the user's hands. Runs inside the caller's
 * transaction when there is one.
 *
 * @return list<string>
 */
function replaceUserTotpRecoveryCodes(PDO $con, int $userId): array {
    $codes = totpGenerateRecoveryCodes();
    $con->prepare("DELETE FROM user_totp_recovery_codes WHERE user_id = ?")->execute([$userId]);
    $insert = $con->prepare("INSERT INTO user_totp_recovery_codes (user_id, code_hash) VALUES (?, ?)");
    foreach ($codes as $code) {
        $insert->execute([$userId, totpHashRecoveryCode($code)]);
    }
    return $codes;
}

/**
 * Switches two-factor on with a secret the user has just confirmed, and
 * returns the recovery codes. $confirmedStep is the step of the confirming
 * code, recorded so that same code cannot be used again at the login form.
 *
 * @return list<string>|null null when nothing was stored
 */
function enableUserTotp(int $userId, string $secret, ?int $confirmedStep = null): ?array {
    if ($userId <= 0 || totpBase32Decode($secret) === null) {
        return null;
    }
    $con = getTotpConnection();
    try {
        $con->beginTransaction();
        $con->prepare("
            INSERT INTO user_totp (user_id, secret, last_step, enabled_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, last_step = excluded.last_step, enabled_at = excluded.enabled_at
        ")->execute([$userId, $secret, $confirmedStep]);
        $codes = replaceUserTotpRecoveryCodes($con, $userId);
        $con->commit();
        return $codes;
    } catch (Throwable $e) {
        if ($con->inTransaction()) {
            $con->rollBack();
        }
        error_log("Failed to enable two-factor for user $userId: " . $e->getMessage());
        return null;
    }
}

/**
 * Switches two-factor off and forgets the secret and the recovery codes.
 * Returns true when a factor was actually removed.
 */
function disableUserTotp(int $userId): bool {
    if ($userId <= 0) {
        return false;
    }
    $con = getTotpConnection();
    try {
        $con->beginTransaction();
        $con->prepare("DELETE FROM user_totp_recovery_codes WHERE user_id = ?")->execute([$userId]);
        $stmt = $con->prepare("DELETE FROM user_totp WHERE user_id = ?");
        $stmt->execute([$userId]);
        $removed = $stmt->rowCount() > 0;
        $con->commit();
        return $removed;
    } catch (Throwable $e) {
        if ($con->inTransaction()) {
            $con->rollBack();
        }
        error_log("Failed to disable two-factor for user $userId: " . $e->getMessage());
        return false;
    }
}

/**
 * New recovery codes for a profile that already has two-factor on.
 *
 * @return list<string>|null
 */
function regenerateUserTotpRecoveryCodes(int $userId): ?array {
    if (!isUserTotpEnabled($userId)) {
        return null;
    }
    $con = getTotpConnection();
    try {
        $con->beginTransaction();
        $codes = replaceUserTotpRecoveryCodes($con, $userId);
        $con->commit();
        return $codes;
    } catch (Throwable $e) {
        if ($con->inTransaction()) {
            $con->rollBack();
        }
        error_log("Failed to regenerate recovery codes for user $userId: " . $e->getMessage());
        return null;
    }
}

/**
 * Checks an authenticator code for a profile.
 *
 * With $singleUse (the login form and the account settings) a code is spent
 * once accepted. The step is claimed with a conditional UPDATE so two
 * requests racing with the same code cannot both win.
 *
 * Without it (the X-Poznote-OTP header of the API) the same code stays valid
 * for its whole window: a script makes several requests within 30 seconds,
 * each one carrying its own credentials.
 */
function verifyUserTotpCode(int $userId, string $input, bool $singleUse = true): bool {
    $row = getUserTotpRow($userId);
    if ($row === null) {
        return false;
    }

    $step = totpVerifyCode($row['secret'], $input, null, $singleUse ? $row['last_step'] : null);
    if ($step === null) {
        return false;
    }
    if (!$singleUse) {
        return true;
    }

    $con = getTotpConnection();
    $stmt = $con->prepare("UPDATE user_totp SET last_step = ? WHERE user_id = ? AND (last_step IS NULL OR last_step < ?)");
    $stmt->execute([$step, $userId, $step]);
    return $stmt->rowCount() === 1;
}

/**
 * Spends a recovery code. True exactly once per code.
 */
function consumeUserTotpRecoveryCode(int $userId, string $input): bool {
    $hash = totpHashRecoveryCode($input);
    if ($hash === null || !isUserTotpEnabled($userId)) {
        return false;
    }
    $con = getTotpConnection();
    $stmt = $con->prepare("UPDATE user_totp_recovery_codes SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND code_hash = ? AND used_at IS NULL");
    $stmt->execute([$userId, $hash]);
    return $stmt->rowCount() === 1;
}

/**
 * Checks whatever was typed in a "code" field: an authenticator code, or a
 * recovery code. The two shapes cannot be confused (six digits against ten
 * letters and digits), so one field serves both.
 *
 * @return string|null 'totp', 'recovery', or null when the input matched neither
 */
function verifyUserSecondFactor(int $userId, string $input): ?string {
    if (totpNormalizeCode($input) !== null) {
        return verifyUserTotpCode($userId, $input) ? 'totp' : null;
    }
    if (totpNormalizeRecoveryCode($input) !== null) {
        return consumeUserTotpRecoveryCode($userId, $input) ? 'recovery' : null;
    }
    return null;
}

/**
 * Ties the remember-me signing secret to the second factor.
 *
 * The cookie is signed with the password hash (getRememberMeSecret()), and
 * for a profile still on the default password that is a public constant. With
 * the TOTP secret mixed in, a cookie can only be minted by the server, after
 * a login that went through the second factor. It also means switching
 * two-factor on or off invalidates every remember-me cookie issued before:
 * a device remembered without a second factor has to sign in again with it.
 */
function bindRememberMeSecretToTotp(int $userId, string $secret): string {
    $row = getUserTotpRow($userId);
    if ($row === null) {
        return $secret;
    }
    return hash_hmac('sha256', $secret, 'poznote-remember-totp:' . $row['secret']);
}
