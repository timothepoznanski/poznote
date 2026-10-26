<?php
/**
 * OAuth authorization server for the MCP server: storage.
 *
 * What the server does and why is in src/lib/oauth-server.php. This file owns
 * the oauth_* tables in master.db and is the only place that reads or writes
 * them. They are created on first use with CREATE TABLE IF NOT EXISTS, like
 * the other master tables (see ensureAppPasswordsTable()), so no schema
 * version bump is involved.
 *
 * Four tables:
 *  - oauth_clients: the apps that registered themselves (RFC 7591);
 *  - oauth_codes: authorization codes, single use, five minutes;
 *  - oauth_grants: one per "connected app" a user approved, holding the
 *    current refresh token. Revoking a connection deletes its row;
 *  - oauth_access_tokens: short-lived tokens of a grant, deleted with it.
 * Only hashes of the secrets are stored.
 *
 * A grant is bound to the account it reads (user_id) and to the person who
 * approved it (login_user_id), and the two are always the same: the consent
 * page only offers the signed-in person's own account, never one they were
 * given access to. That is checked again whenever a token is used, along
 * with the account still being active, so a disabled account ends the
 * connection without anyone having to find it and revoke it.
 */

require_once __DIR__ . '/../lib/oauth-server.php';
require_once __DIR__ . '/db_master.php';

function ensureOAuthTables(PDO $con): void {
    static $ready = false;
    if ($ready) {
        return;
    }
    $con->exec("
        CREATE TABLE IF NOT EXISTS oauth_clients (
            client_id TEXT PRIMARY KEY,
            client_secret_hash TEXT,
            client_name TEXT NOT NULL DEFAULT '',
            redirect_uris TEXT NOT NULL,
            token_endpoint_auth_method TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_grant_at INTEGER
        )
    ");
    $con->exec("
        CREATE TABLE IF NOT EXISTS oauth_codes (
            code_hash TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            login_user_id INTEGER NOT NULL,
            redirect_uri TEXT NOT NULL,
            code_challenge TEXT NOT NULL,
            scope TEXT NOT NULL,
            access_level TEXT NOT NULL,
            resource TEXT NOT NULL DEFAULT '',
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $con->exec("
        CREATE TABLE IF NOT EXISTS oauth_grants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            login_user_id INTEGER NOT NULL,
            scope TEXT NOT NULL,
            access_level TEXT NOT NULL,
            resource TEXT NOT NULL DEFAULT '',
            refresh_token_hash TEXT NOT NULL UNIQUE,
            refresh_expires_at INTEGER NOT NULL,
            previous_refresh_token_hash TEXT,
            rotated_at INTEGER,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $con->exec("
        CREATE TABLE IF NOT EXISTS oauth_access_tokens (
            token_hash TEXT PRIMARY KEY,
            grant_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (grant_id) REFERENCES oauth_grants(id) ON DELETE CASCADE
        )
    ");
    // Added after the first version of the tables
    $clientColumns = array_column($con->query("PRAGMA table_info(oauth_clients)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('last_grant_at', $clientColumns, true)) {
        $con->exec("ALTER TABLE oauth_clients ADD COLUMN last_grant_at INTEGER");
    }
    $grantColumns = array_column($con->query("PRAGMA table_info(oauth_grants)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('previous_refresh_token_hash', $grantColumns, true)) {
        $con->exec("ALTER TABLE oauth_grants ADD COLUMN previous_refresh_token_hash TEXT");
    }
    if (!in_array('rotated_at', $grantColumns, true)) {
        $con->exec("ALTER TABLE oauth_grants ADD COLUMN rotated_at INTEGER");
    }
    $con->exec("CREATE INDEX IF NOT EXISTS idx_oauth_grants_user ON oauth_grants(user_id)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_oauth_grants_previous_refresh ON oauth_grants(previous_refresh_token_hash)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_grant ON oauth_access_tokens(grant_id)");
    $ready = true;
}

function getOAuthConnection(): PDO {
    $con = getMasterConnection();
    ensureOAuthTables($con);
    return $con;
}

/**
 * Drop what can no longer be used: expired codes, tokens and grants, and
 * registrations nobody uses. Cheap enough to run on every registration and
 * token request, which is what keeps the tables small without a scheduled job.
 *
 * A registration that never led to a connection goes after a month
 * (OAUTH_UNUSED_CLIENT_TTL: a team may sign in days after their administrator
 * added the connector). One that did is kept as long as a refresh token could
 * live (90 days) after its last connection ended: the app holds on to its
 * client_id, and a person who disconnects it in Settings and reconnects a
 * week later must not be told the app is unknown and has to be set up again.
 */
function pruneOAuthTables(?PDO $con = null): void {
    try {
        $con = $con ?? getOAuthConnection();
        $now = time();
        $con->prepare("DELETE FROM oauth_codes WHERE expires_at < ?")->execute([$now]);
        $con->prepare("DELETE FROM oauth_access_tokens WHERE expires_at < ?")->execute([$now]);
        $con->prepare("DELETE FROM oauth_grants WHERE refresh_expires_at < ?")->execute([$now]);
        // Grants on an account their approver only borrowed, stored before
        // the consent page stopped offering one (see oauthGrantAccountStillAllowed)
        $con->exec("DELETE FROM oauth_grants WHERE user_id <> login_user_id");
        $con->exec("DELETE FROM oauth_codes WHERE user_id <> login_user_id");
        $con->prepare("
            DELETE FROM oauth_clients
            WHERE client_id NOT IN (SELECT client_id FROM oauth_grants)
              AND client_id NOT IN (SELECT client_id FROM oauth_codes)
              AND ((last_grant_at IS NULL AND created_at < ?) OR (last_grant_at IS NOT NULL AND last_grant_at < ?))
        ")->execute([$now - OAUTH_UNUSED_CLIENT_TTL, $now - OAUTH_REFRESH_TOKEN_TTL]);
    } catch (Exception $e) {
        error_log('OAuth prune failed: ' . $e->getMessage());
    }
}

function oauthDecodeClientRow(array $row): array {
    $uris = json_decode((string)$row['redirect_uris'], true);
    $row['redirect_uris'] = is_array($uris) ? array_values(array_filter($uris, 'is_string')) : [];
    return $row;
}

/**
 * Register an app. Returns the stored client plus its clear-text secret
 * (null for a public client), or null when the pending-registration cap is
 * reached or the insert failed.
 */
function createOAuthClient(array $metadata): ?array {
    try {
        $con = getOAuthConnection();
        pruneOAuthTables($con);

        // At the cap, the oldest registrations nobody ever signed in with make
        // room rather than new ones being refused: refusing would let anyone
        // stop every new connection with a loop of anonymous POSTs. A flood
        // now only disturbs someone in the middle of connecting, never an app
        // that was connected once, is connected (it has a grant) or holds a
        // code.
        $pending = (int)$con->query("
            SELECT COUNT(*) FROM oauth_clients
            WHERE last_grant_at IS NULL
              AND client_id NOT IN (SELECT client_id FROM oauth_grants)
              AND client_id NOT IN (SELECT client_id FROM oauth_codes)
        ")->fetchColumn();
        if ($pending >= OAUTH_MAX_PENDING_CLIENTS) {
            $con->prepare("
                DELETE FROM oauth_clients WHERE client_id IN (
                    SELECT client_id FROM oauth_clients
                    WHERE last_grant_at IS NULL
                      AND client_id NOT IN (SELECT client_id FROM oauth_grants)
                      AND client_id NOT IN (SELECT client_id FROM oauth_codes)
                    ORDER BY created_at ASC
                    LIMIT ?
                )
            ")->execute([$pending - OAUTH_MAX_PENDING_CLIENTS + 1]);
            error_log('OAuth registration: ' . $pending . ' unused registrations pending, the oldest were dropped');
        }

        $clientId = OAUTH_CLIENT_ID_PREFIX . bin2hex(random_bytes(16));
        $secret = $metadata['token_endpoint_auth_method'] === 'none' ? null : oauthGenerateSecret('');
        $createdAt = time();
        $con->prepare("
            INSERT INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ")->execute([
            $clientId,
            $secret !== null ? oauthHashSecret($secret) : null,
            $metadata['client_name'],
            json_encode($metadata['redirect_uris'], JSON_UNESCAPED_SLASHES),
            $metadata['token_endpoint_auth_method'],
            $createdAt,
        ]);

        return [
            'client_id' => $clientId,
            'client_secret' => $secret,
            'client_name' => $metadata['client_name'],
            'redirect_uris' => $metadata['redirect_uris'],
            'token_endpoint_auth_method' => $metadata['token_endpoint_auth_method'],
            'created_at' => $createdAt,
        ];
    } catch (Exception $e) {
        error_log('OAuth client registration failed: ' . $e->getMessage());
        return null;
    }
}

function getOAuthClient(string $clientId): ?array {
    if ($clientId === '' || strlen($clientId) > 200) {
        return null;
    }
    try {
        $stmt = getOAuthConnection()->prepare("SELECT * FROM oauth_clients WHERE client_id = ?");
        $stmt->execute([$clientId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? oauthDecodeClientRow($row) : null;
    } catch (Exception $e) {
        error_log('OAuth client lookup failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Authenticate a client at the token or revocation endpoint. A confidential
 * client must present its secret, by whichever of the two methods it sends;
 * a public one only its id (PKCE is what binds the code to it).
 */
function authenticateOAuthClient(string $clientId, ?string $secret): ?array {
    $client = getOAuthClient($clientId);
    if ($client === null) {
        return null;
    }
    $storedHash = $client['client_secret_hash'] ?? null;
    if ($storedHash === null || $storedHash === '') {
        return $client;
    }
    if ($secret === null || $secret === '' || !hash_equals((string)$storedHash, oauthHashSecret($secret))) {
        return null;
    }
    return $client;
}

/**
 * Store an authorization code for an approved sign-in and return it.
 */
function createOAuthAuthorizationCode(array $client, int $userId, int $loginUserId, string $redirectUri, string $codeChallenge, string $scope, string $accessLevel, string $resource): ?string {
    try {
        $code = oauthGenerateSecret(OAUTH_CODE_PREFIX);
        getOAuthConnection()->prepare("
            INSERT INTO oauth_codes (code_hash, client_id, user_id, login_user_id, redirect_uri, code_challenge, scope, access_level, resource, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            oauthHashSecret($code),
            $client['client_id'],
            $userId,
            $loginUserId,
            $redirectUri,
            $codeChallenge,
            $scope,
            $accessLevel,
            $resource,
            time() + OAUTH_CODE_TTL,
        ]);
        return $code;
    } catch (Exception $e) {
        error_log('OAuth code creation failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Take a code out of the table: it is deleted whether or not the rest of the
 * exchange succeeds, so a code can be tried exactly once.
 */
function consumeOAuthAuthorizationCode(string $code): ?array {
    if (strpos($code, OAUTH_CODE_PREFIX) !== 0) {
        return null;
    }
    $con = null;
    try {
        $con = getOAuthConnection();
        $hash = oauthHashSecret($code);
        $con->beginTransaction();
        $stmt = $con->prepare("SELECT * FROM oauth_codes WHERE code_hash = ?");
        $stmt->execute([$hash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $con->prepare("DELETE FROM oauth_codes WHERE code_hash = ?")->execute([$hash]);
        $con->commit();
        if (!$row || (int)$row['expires_at'] < time()) {
            return null;
        }
        return $row;
    } catch (Exception $e) {
        if ($con !== null && $con->inTransaction()) {
            $con->rollBack();
        }
        error_log('OAuth code exchange failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Whether a grant may still be used: its account is its approver's own, and
 * is active. An app never reads an account its approver was only given
 * access to; the MCP service token passes the owner checks of the account it
 * acts for (isActiveAccountOwnedByAuthenticatedUser()) on that ground, so a
 * grant breaking the rule (one stored before it existed) is refused.
 */
function oauthGrantAccountStillAllowed(int $userId, int $loginUserId): bool {
    if ($userId <= 0 || $userId !== $loginUserId) {
        return false;
    }
    $user = getUserProfileById($userId);
    return $user !== null && !empty($user['active']);
}

/**
 * Issue an access token for a grant, and a new refresh token, which replaces
 * the grant's previous one (rotation: a refresh token works once). The
 * replaced one is remembered so a later reuse of it can be recognised.
 *
 * @return array{access_token:string,refresh_token:string,expires_in:int}|null
 */
function oauthIssueTokens(PDO $con, int $grantId, string $expectedRefreshHash): ?array {
    $access = oauthGenerateSecret(OAUTH_ACCESS_TOKEN_PREFIX);
    $refresh = oauthGenerateSecret(OAUTH_REFRESH_TOKEN_PREFIX);
    $now = time();
    // Rotates only if the grant still holds the refresh token being spent:
    // of two requests racing with the same token, the second updates nothing
    // and is refused, instead of both walking away with valid tokens. SQLite
    // reads refresh_token_hash on the right before the row is written.
    $update = $con->prepare("
        UPDATE oauth_grants
        SET previous_refresh_token_hash = refresh_token_hash, rotated_at = ?,
            refresh_token_hash = ?, refresh_expires_at = ?, last_used_at = ?
        WHERE id = ? AND refresh_token_hash = ?
    ");
    $update->execute([$now, oauthHashSecret($refresh), $now + OAUTH_REFRESH_TOKEN_TTL, $now, $grantId, $expectedRefreshHash]);
    if ($update->rowCount() !== 1) {
        return null;
    }
    $con->prepare("INSERT INTO oauth_access_tokens (token_hash, grant_id, expires_at) VALUES (?, ?, ?)")
        ->execute([oauthHashSecret($access), $grantId, $now + OAUTH_ACCESS_TOKEN_TTL]);
    return [
        'access_token' => $access,
        'refresh_token' => $refresh,
        'expires_in' => OAUTH_ACCESS_TOKEN_TTL,
    ];
}

/**
 * Turn a consumed code into a grant and its first tokens.
 */
function createOAuthGrantFromCode(array $codeRow): ?array {
    $con = null;
    try {
        $con = getOAuthConnection();
        $con->beginTransaction();
        $now = time();
        // Placeholder hash, replaced by oauthIssueTokens() in the same transaction
        $placeholder = 'pending-' . bin2hex(random_bytes(16));
        $con->prepare("
            INSERT INTO oauth_grants (client_id, user_id, login_user_id, scope, access_level, resource, refresh_token_hash, refresh_expires_at, created_at, last_used_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            $codeRow['client_id'],
            (int)$codeRow['user_id'],
            (int)$codeRow['login_user_id'],
            $codeRow['scope'],
            $codeRow['access_level'],
            $codeRow['resource'],
            $placeholder,
            $now + OAUTH_REFRESH_TOKEN_TTL,
            $now,
            $now,
        ]);
        $grantId = (int)$con->lastInsertId();
        $tokens = oauthIssueTokens($con, $grantId, $placeholder);
        if ($tokens === null) {
            $con->rollBack();
            return null;
        }
        $con->prepare("UPDATE oauth_clients SET last_grant_at = ? WHERE client_id = ?")->execute([$now, $codeRow['client_id']]);
        $con->commit();
        return $tokens + ['scope' => $codeRow['scope'], 'grant_id' => $grantId];
    } catch (Exception $e) {
        if ($con !== null && $con->inTransaction()) {
            $con->rollBack();
        }
        error_log('OAuth grant creation failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Exchange a refresh token. Returns the new tokens, or null when the token is
 * unknown, expired, belongs to another client, or its account may no longer
 * be used (the grant is then deleted). A token already exchanged once gets
 * its whole grant revoked, see OAUTH_REFRESH_REUSE_GRACE.
 */
function refreshOAuthGrant(string $refreshToken, string $clientId): ?array {
    if (strpos($refreshToken, OAUTH_REFRESH_TOKEN_PREFIX) !== 0) {
        return null;
    }
    $con = null;
    try {
        $con = getOAuthConnection();
        $stmt = $con->prepare("SELECT * FROM oauth_grants WHERE refresh_token_hash = ?");
        $stmt->execute([oauthHashSecret($refreshToken)]);
        $grant = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$grant) {
            oauthHandleRefreshTokenReuse($con, $refreshToken, $clientId);
            return null;
        }
        if (!hash_equals((string)$grant['client_id'], $clientId) || (int)$grant['refresh_expires_at'] < time()) {
            return null;
        }
        if (!oauthGrantAccountStillAllowed((int)$grant['user_id'], (int)$grant['login_user_id'])) {
            $con->prepare("DELETE FROM oauth_grants WHERE id = ?")->execute([(int)$grant['id']]);
            return null;
        }
        $con->beginTransaction();
        $tokens = oauthIssueTokens($con, (int)$grant['id'], (string)$grant['refresh_token_hash']);
        if ($tokens === null) {
            $con->rollBack();
            return null;
        }
        $con->commit();
        return $tokens + ['scope' => $grant['scope'], 'grant_id' => (int)$grant['id']];
    } catch (Exception $e) {
        if ($con !== null && $con->inTransaction()) {
            $con->rollBack();
        }
        error_log('OAuth refresh failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * A refresh token that is not a grant's current one: if it is the one a grant
 * just replaced, and the rotation is older than the grace period, somebody is
 * replaying a copy (the app itself moved on to the new token), so the grant
 * goes, with every access token issued under it.
 */
function oauthHandleRefreshTokenReuse(PDO $con, string $refreshToken, string $clientId): void {
    $stmt = $con->prepare("SELECT id, client_id, user_id, rotated_at FROM oauth_grants WHERE previous_refresh_token_hash = ?");
    $stmt->execute([oauthHashSecret($refreshToken)]);
    $grant = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$grant || !hash_equals((string)$grant['client_id'], $clientId)) {
        return;
    }
    if ((int)($grant['rotated_at'] ?? 0) >= time() - OAUTH_REFRESH_REUSE_GRACE) {
        return;
    }
    $con->prepare("DELETE FROM oauth_grants WHERE id = ?")->execute([(int)$grant['id']]);
    error_log('OAuth: refresh token reused for grant ' . (int)$grant['id'] . ', connection revoked');

    require_once __DIR__ . '/../ActivityLog.php';
    logActivity(ACTIVITY_OAUTH_APP_REVOKED, [
        'grant_id' => (int)$grant['id'],
        'reason' => 'refresh_token_reuse',
    ], 'api', (int)$grant['user_id']);
}

/**
 * What an access token stands for, for the MCP server (RFC 7662 fields plus
 * Poznote's own). null for an unknown, expired or no longer allowed token.
 */
function introspectOAuthAccessToken(string $token): ?array {
    if (strpos($token, OAUTH_ACCESS_TOKEN_PREFIX) !== 0) {
        return null;
    }
    try {
        $con = getOAuthConnection();
        $stmt = $con->prepare("
            SELECT t.expires_at, g.id AS grant_id, g.client_id, g.user_id, g.login_user_id,
                   g.scope, g.access_level, g.resource, g.created_at, g.last_used_at
            FROM oauth_access_tokens t
            JOIN oauth_grants g ON g.id = t.grant_id
            WHERE t.token_hash = ?
        ");
        $stmt->execute([oauthHashSecret($token)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['expires_at'] < time()) {
            return null;
        }
        $userId = (int)$row['user_id'];
        $loginUserId = (int)$row['login_user_id'];
        if (!oauthGrantAccountStillAllowed($userId, $loginUserId)) {
            return null;
        }

        // "Last used" in Settings, written at most every five minutes rather
        // than on each of the many calls a chat makes
        if ((int)($row['last_used_at'] ?? 0) < time() - 300) {
            $con->prepare("UPDATE oauth_grants SET last_used_at = ? WHERE id = ?")->execute([time(), (int)$row['grant_id']]);
        }

        $user = getUserProfileById($userId);
        // Administrator rights follow the person who approved the app, like
        // isCurrentUserAdmin() follows the login identity in the browser.
        // Approver and account are the same person (oauthGrantAccountStillAllowed),
        // so that is the account's own flag; kept explicit for the MCP server.
        $approver = $user;
        $result = [
            'active' => true,
            'sub' => (string)$userId,
            'username' => (string)($user['username'] ?? ''),
            'client_id' => (string)$row['client_id'],
            'scope' => (string)$row['scope'],
            'token_type' => 'Bearer',
            'exp' => (int)$row['expires_at'],
            'iat' => (int)$row['expires_at'] - OAUTH_ACCESS_TOKEN_TTL,
            'poznote_level' => oauthNormalizeAccessLevel($row['access_level']),
            'poznote_login_user_id' => $loginUserId,
            'poznote_admin' => !empty($approver['is_admin']),
        ];
        if ((string)$row['resource'] !== '') {
            $result['aud'] = (string)$row['resource'];
        }
        return $result;
    } catch (Exception $e) {
        error_log('OAuth introspection failed: ' . $e->getMessage());
        return null;
    }
}

/**
 * Revoke whatever grant a token (access or refresh) belongs to, if it was
 * issued to this client. Silent either way, as RFC 7009 asks.
 */
function revokeOAuthToken(string $token, string $clientId): void {
    try {
        $con = getOAuthConnection();
        $hash = oauthHashSecret($token);
        if (strpos($token, OAUTH_REFRESH_TOKEN_PREFIX) === 0) {
            $con->prepare("DELETE FROM oauth_grants WHERE refresh_token_hash = ? AND client_id = ?")->execute([$hash, $clientId]);
        } elseif (strpos($token, OAUTH_ACCESS_TOKEN_PREFIX) === 0) {
            $con->prepare("
                DELETE FROM oauth_grants
                WHERE client_id = ? AND id IN (SELECT grant_id FROM oauth_access_tokens WHERE token_hash = ?)
            ")->execute([$clientId, $hash]);
        }
    } catch (Exception $e) {
        error_log('OAuth revocation failed: ' . $e->getMessage());
    }
}

/**
 * The connected apps of an account, newest first, for Settings.
 *
 * @return list<array{id:int,client_name:string,access_level:string,created_at:int,last_used_at:?int}>
 */
function listOAuthGrantsForUser(int $userId): array {
    if ($userId <= 0) {
        return [];
    }
    try {
        $con = getOAuthConnection();
        pruneOAuthTables($con);
        $stmt = $con->prepare("
            SELECT g.id, g.access_level, g.created_at, g.last_used_at,
                   c.client_name, c.redirect_uris
            FROM oauth_grants g
            JOIN oauth_clients c ON c.client_id = g.client_id
            WHERE g.user_id = ? AND g.login_user_id = g.user_id
            ORDER BY g.created_at DESC, g.id DESC
        ");
        $stmt->execute([$userId]);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $client = oauthDecodeClientRow($row);
            $rows[] = [
                'id' => (int)$row['id'],
                'client_name' => oauthClientDisplayName($client),
                'access_level' => oauthNormalizeAccessLevel($row['access_level']),
                'created_at' => (int)$row['created_at'],
                'last_used_at' => $row['last_used_at'] !== null ? (int)$row['last_used_at'] : null,
            ];
        }
        return $rows;
    } catch (Exception $e) {
        error_log('OAuth grant listing failed: ' . $e->getMessage());
        return [];
    }
}

function countOAuthGrantsForUser(int $userId): int {
    if ($userId <= 0) {
        return 0;
    }
    try {
        // Same rows as listOAuthGrantsForUser(), so the badge and the list agree
        $stmt = getOAuthConnection()->prepare("SELECT COUNT(*) FROM oauth_grants WHERE user_id = ? AND login_user_id = user_id AND refresh_expires_at >= ?");
        $stmt->execute([$userId, time()]);
        return (int)$stmt->fetchColumn();
    } catch (Exception $e) {
        return 0;
    }
}

/**
 * Disconnect one app of an account. Its tokens stop working at once (the MCP
 * server may still accept one for up to its cache TTL, a minute by default).
 * Returns the removed grant's client name, null when there was none.
 */
function revokeOAuthGrantForUser(int $userId, int $grantId): ?string {
    try {
        $con = getOAuthConnection();
        $stmt = $con->prepare("
            SELECT c.client_name, c.redirect_uris
            FROM oauth_grants g JOIN oauth_clients c ON c.client_id = g.client_id
            WHERE g.id = ? AND g.user_id = ?
        ");
        $stmt->execute([$grantId, $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $con->prepare("DELETE FROM oauth_grants WHERE id = ? AND user_id = ?")->execute([$grantId, $userId]);
        return oauthClientDisplayName(oauthDecodeClientRow($row));
    } catch (Exception $e) {
        error_log('OAuth grant revocation failed: ' . $e->getMessage());
        return null;
    }
}
