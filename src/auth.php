<?php
/**
 * Authentication Module
 * 
 * In multi-user mode:
 * - Single global password (AUTH_USERNAME / AUTH_PASSWORD)
 * - Multiple user profiles, each with their own data space
 * - User selects their profile on login page
 */

require_once __DIR__ . '/lib/session.php';

// Read as globals by the cookie helpers below and by REMEMBER_ME_COOKIE
$isSecure = poznoteSessionCookieIsSecure();
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';

// Same session as the public share pages (see lib/session.php)
poznoteStartSession();

// Prevent browser caching to ensure fresh content on every load (especially for home and settings)
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Cache-Control: post-check=0, pre-check=0", false);
header("Pragma: no-cache");
header("Expires: Mon, 26 Jul 1997 05:00:00 GMT"); // Date in the past

// Load config first
require_once __DIR__ . '/config.php';

// Robust .env parser fallback
// Search in current directory (src/) and parent directory (project root)
$envSearchPaths = [__DIR__ . '/.env', dirname(__DIR__) . '/.env'];
foreach ($envSearchPaths as $envPath) {
    if (file_exists($envPath)) {
        $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || strpos($line, '#') === 0) continue;
                if (strpos($line, '=') !== false) {
                    list($key, $value) = explode('=', $line, 2);
                    $key = trim($key);
                    $value = trim($value);
                    $value = trim($value, '"\'');
                    
                    // Overwrite environment variables to ensure .env changes take effect
                    // even if Docker was started with default values.
                    if ($value !== '') {
                        $_ENV[$key] = $value;
                        putenv("$key=$value");
                    }
                }
            }
        }
        break; // Stop after first .env found
    }
}

// Authentication configuration - hardcoded defaults for initial/new users
// Passwords are managed exclusively through the Poznote UI (Settings > Change Password).
// These defaults are only used as initial passwords for new user accounts.
define("AUTH_PASSWORD", 'admin');
define("AUTH_USER_PASSWORD", 'user');

// Helper to read an environment variable with a default value
function getAuthConfig($key, $default) {
    $val = $_ENV[$key] ?? getenv($key);
    if ($val === false || $val === null || (is_string($val) && trim($val) === '')) {
        return $default;
    }
    return trim((string)$val);
}

// Remember me cookie settings
define("REMEMBER_ME_COOKIE", 'poznote_remember_' . ($configured_port ?? '8040'));
define("REMEMBER_ME_DURATION", 30 * 24 * 60 * 60); // 30 days

/**
 * Set or clear the remember-me cookie with proper security attributes.
 * Mirrors session cookie settings (secure flag, SameSite=Lax).
 */
function setRememberMeCookie(string $value, int $expires): void {
    $secure = $GLOBALS['isSecure'] ?? false;
    setcookie(REMEMBER_ME_COOKIE, $value, [
        'expires'  => $expires,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $secure,
        'httponly'  => true,
        'samesite' => 'Lax'
    ]);
}

/**
 * Expose the authenticated user's id to the browser so client-side display
 * preferences (theme, font sizes, icon scale) can be stored per user instead
 * of being shared by every account using the same browser.
 * Not HttpOnly on purpose: JS needs to read it, and the id is not sensitive.
 * Re-synced on every authenticated request because several Poznote instances
 * on the same host share the cookie jar (cookies ignore the port).
 */
function syncUserPreferenceCookie(): void {
    $userId = (int)(getAuthenticatedUserId() ?? 0);
    if ($userId <= 0 || headers_sent()) {
        return;
    }

    if ((string)($_COOKIE['poznote_uid'] ?? '') === (string)$userId) {
        return;
    }

    setcookie('poznote_uid', (string)$userId, [
        'expires'  => time() + 365 * 24 * 60 * 60,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $GLOBALS['isSecure'] ?? false,
        'httponly' => false,
        'samesite' => 'Lax'
    ]);
    $_COOKIE['poznote_uid'] = (string)$userId;
}

function clearUserPreferenceCookie(): void {
    if (headers_sent()) {
        return;
    }
    setcookie('poznote_uid', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $GLOBALS['isSecure'] ?? false,
        'httponly' => false,
        'samesite' => 'Lax'
    ]);
    unset($_COOKIE['poznote_uid']);
}

/**
 * Short-lived marker read once by login.php: a page reached by logging out
 * must not autofocus a field, or a phone opens its keyboard over the page.
 * A cookie rather than a query parameter because an SSO logout comes back
 * through the provider's registered post-logout URL, which cannot carry it.
 */
const JUST_LOGGED_OUT_COOKIE = 'poznote_logged_out';

function setJustLoggedOutCookie(): void {
    if (headers_sent()) {
        return;
    }
    setcookie(JUST_LOGGED_OUT_COOKIE, '1', [
        'expires'  => time() + 300,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $GLOBALS['isSecure'] ?? false,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

/** True when the request follows a logout; the marker is cleared on read. */
function consumeJustLoggedOutCookie(): bool {
    if (empty($_COOKIE[JUST_LOGGED_OUT_COOKIE])) {
        return false;
    }
    if (!headers_sent()) {
        setcookie(JUST_LOGGED_OUT_COOKIE, '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $GLOBALS['isSecure'] ?? false,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    }
    unset($_COOKIE[JUST_LOGGED_OUT_COOKIE]);
    return true;
}

function createRememberMeHash(string $username, int $userId, int $timestamp, string $secret): string {
    return hash_hmac('sha256', $username . ':' . $userId . ':' . $timestamp, $secret);
}

function createLegacyRememberMeHash(string $username, int $userId, int $timestamp, string $secret): string {
    return hash('sha256', $username . $userId . $timestamp . $secret);
}

function buildRememberMeToken(string $username, int $userId, int $timestamp, string $secret): string {
    $hash = createRememberMeHash($username, $userId, $timestamp, $secret);
    return base64_encode($username . ':' . $userId . ':' . $timestamp . ':' . $hash);
}

function api_t($key, $vars = [], $default = null) {
    // Lazy-load i18n helpers when auth.php is used standalone
    if (!function_exists('t')) {
        $functionsPath = __DIR__ . '/functions.php';
        if (is_file($functionsPath)) {
            require_once $functionsPath;
        }
    }

    // Try to initialize DB connection so getUserLanguage() can read
    // settings.language. Only for a signed-in session: without one there is
    // no user whose language could be read, and db_connect.php would fall
    // back to the legacy data/database/poznote.db, recreating it empty after
    // every container start (init.sh removes it) just to answer a 401 in
    // English anyway.
    if (!isset($GLOBALS['con']) && !empty($_SESSION['user_id'])) {
        $configPath = __DIR__ . '/config.php';
        $dbPath = __DIR__ . '/db_connect.php';
        if (is_file($configPath)) {
            require_once $configPath;
        }
        if (is_file($dbPath)) {
            require_once $dbPath;
        }
    }

    if (function_exists('t')) {
        return t($key, $vars, $default);
    }

    $text = $default !== null ? (string)$default : (string)$key;
    if (is_array($vars) && !empty($vars)) {
        foreach ($vars as $k => $v) {
            $text = str_replace('{{' . $k . '}}', (string)$v, $text);
        }
    }
    return $text;
}

function getAuthenticatedUser() {
    return $_SESSION['login_user'] ?? $_SESSION['user'] ?? null;
}

function getAuthenticatedUserId() {
    return $_SESSION['login_user_id'] ?? ($_SESSION['user_id'] ?? null);
}

function setAuthenticatedIdentity(array $authUser, ?string $authMethod = null): void {
    $authUserId = (int)($authUser['id'] ?? 0);
    if ($authUserId <= 0) {
        return;
    }

    $_SESSION['authenticated'] = true;
    $_SESSION['login_user_id'] = $authUserId;
    $_SESSION['login_user'] = $authUser;

    if ($authMethod !== null && $authMethod !== '') {
        $_SESSION['auth_method'] = $authMethod;
    } else {
        unset($_SESSION['auth_method']);
    }

    syncUserPreferenceCookie();
}

/**
 * Mirror of the ACTIVE account in a cookie the page scripts can read
 * (poznote_uid above is the login identity). The active account is session
 * state, so a switch made in one tab (switch_account.php, the login-time
 * account choice) silently redirects every later call of the other open
 * tabs, and of a page brought back from the back-forward cache, to the new
 * account while they still show the old one. js/session-guard.js compares
 * this cookie with the value it saw at load and reloads such a tab.
 */
function syncActiveAccountCookie(): void {
    $activeUserId = (int)(getCurrentUserId() ?? 0);
    if ($activeUserId <= 0 || headers_sent()) {
        return;
    }
    if ((string)($_COOKIE['poznote_account'] ?? '') === (string)$activeUserId) {
        return;
    }
    $_COOKIE['poznote_account'] = (string)$activeUserId;
    setcookie('poznote_account', (string)$activeUserId, [
        'expires'  => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $GLOBALS['isSecure'] ?? false,
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
}

/**
 * Second half of the same protection, server-side: js/session-guard.js sends
 * the account its page was rendered for as X-Poznote-Account on every call.
 * A call whose header names another account than the session's active one
 * comes from a tab that missed a switch, and acting on it would apply that
 * tab's ids (note 94, folder 5) to the wrong account's data. Refused with
 * 409 and a marker the guard recognises; it then reloads its page. Calls
 * without the header (navigations, API clients, older pages) are untouched.
 */
function enforceActiveAccountHeader(): void {
    $header = trim((string)($_SERVER['HTTP_X_POZNOTE_ACCOUNT'] ?? ''));
    if ($header === '' || !ctype_digit($header)) {
        return;
    }
    $activeUserId = (int)(getCurrentUserId() ?? 0);
    if ($activeUserId <= 0 || (int)$header === $activeUserId) {
        return;
    }
    http_response_code(409);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode([
        'success' => false,
        'error' => 'account_switched',
        'active_account' => $activeUserId,
    ]);
    exit;
}

function setActiveUserAccount(array $targetUser): bool {
    $targetUserId = (int)($targetUser['id'] ?? 0);
    if ($targetUserId <= 0 || empty($targetUser['active'])) {
        return false;
    }

    $_SESSION['user_id'] = $targetUserId;
    $_SESSION['user'] = $targetUser;
    unset($_SESSION['account_selection_required']);
    // A plain account selection is never confined to one workspace; only
    // openSharedWorkspace() sets the scope, right after this.
    clearSharedWorkspaceScope();
    syncActiveAccountCookie();

    return true;
}

function startAuthenticatedUserSession(array $authUser, ?string $authMethod = null): bool {
    $authUserId = (int)($authUser['id'] ?? 0);
    if ($authUserId <= 0) {
        return false;
    }

    // Prevent session fixation: never keep the pre-authentication session ID.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }

    setAuthenticatedIdentity($authUser, $authMethod);

    // A login that completes, by whichever route, ends any second step left
    // pending in this session (password typed, then SSO used instead).
    unset($_SESSION['totp_login_challenge']);

    // Single hook for every interactive login: the password form, OIDC and the
    // remember-me cookie all land here. Logged at this point rather than on
    // return, because the identity is already established even when the call
    // ends up returning false for pending multi-account selection. Stateless
    // API auth (Basic/Bearer) never reaches this function, which keeps
    // per-request traffic out of the log.
    require_once __DIR__ . '/ActivityLog.php';
    logActivity(
        ACTIVITY_LOGIN,
        ['method' => $authMethod ?? 'password'],
        $authMethod === 'oidc' ? 'oidc' : 'web',
        $authUserId,
        $authUser['username'] ?? null
    );

    require_once __DIR__ . '/users/db_master.php';
    $accessibleProfiles = getUserAccessibleProfiles($authUserId);

    if (count($accessibleProfiles) > 1) {
        unset($_SESSION['user_id'], $_SESSION['user']);
        $_SESSION['account_selection_required'] = true;
        return false;
    }

    $targetUser = $accessibleProfiles[0] ?? $authUser;
    return setActiveUserAccount($targetUser);
}

function isAccountSelectionRequired(): bool {
    return !empty($_SESSION['account_selection_required'])
        && isset($_SESSION['login_user_id'])
        && (!isset($_SESSION['user_id']) || (int)$_SESSION['user_id'] <= 0);
}

function getPendingAccountSelectionProfiles(): array {
    $authUserId = (int)($_SESSION['login_user_id'] ?? 0);
    if ($authUserId <= 0) {
        return [];
    }

    require_once __DIR__ . '/users/db_master.php';
    return getUserAccessibleProfiles($authUserId);
}

function selectAuthenticatedAccount(int $targetUserId): bool {
    $authUserId = (int)getAuthenticatedUserId();
    if ($authUserId <= 0 || $targetUserId <= 0) {
        return false;
    }

    require_once __DIR__ . '/users/db_master.php';
    if (!canUserAccessAccount($authUserId, $targetUserId)) {
        return false;
    }

    $targetUser = getUserProfileById($targetUserId);
    if (!$targetUser || empty($targetUser['active'])) {
        return false;
    }

    return setActiveUserAccount($targetUser);
}

/**
 * Accounts the signed-in person can switch to without signing in again, their
 * own first. Empty unless there is a real choice: someone with a single
 * account has nothing to switch to (a shared workspace is not an account,
 * see getSharedWorkspacesForLogin()).
 */
function getSwitchableAccountProfiles(): array {
    if (!isAuthenticated()) {
        return [];
    }

    $authUserId = (int)(getAuthenticatedUserId() ?? 0);
    if ($authUserId <= 0) {
        return [];
    }

    require_once __DIR__ . '/users/db_master.php';
    $profiles = getUserAccessibleProfiles($authUserId);

    return count($profiles) > 1 ? $profiles : [];
}

/**
 * Leave the active account for another one the signed-in person can open. The
 * login identity is kept, so no password or SSO round trip is needed; only the
 * session state that belongs to the account being left is dropped.
 */
function switchActiveAccount(int $targetUserId): bool {
    if (!isAuthenticated()) {
        return false;
    }

    $previousUserId = (int)(getCurrentUserId() ?? 0);
    if (!selectAuthenticatedAccount($targetUserId)) {
        return false;
    }

    if ($previousUserId !== $targetUserId) {
        unset(
            $_SESSION['last_sync_result'],
            $_SESSION['git_sync_progress'],
            $_SESSION['git_sync_running'],
            $_SESSION['git_sync_async_result'],
            $_SESSION['git_sync_state_file']
        );
    }

    return true;
}

function validateActiveAccountAccess(): bool {
    $authUserId = (int)getAuthenticatedUserId();
    $activeUserId = (int)getCurrentUserId();

    if ($authUserId <= 0 || $activeUserId <= 0) {
        return false;
    }

    if ($authUserId === $activeUserId) {
        return true;
    }

    // One master.db round trip per (login, account, scope) and request: this
    // runs under every isAuthenticated() call.
    static $verified = null;
    $scope = getSharedWorkspaceScope();
    $key = $authUserId . ':' . $activeUserId . ':' . ($scope !== null ? $scope['workspace'] : '');
    if ($verified === $key) {
        return true;
    }

    require_once __DIR__ . '/users/db_master.php';
    if (canUserAccessAccount($authUserId, $activeUserId)) {
        // Full access to the account: no reason to stay confined to one of
        // its workspaces.
        clearSharedWorkspaceScope();
        $verified = $authUserId . ':' . $activeUserId . ':';
        return true;
    }

    if ($scope !== null && isWorkspaceSharedWithUser($activeUserId, $scope['workspace'], $authUserId)) {
        $verified = $key;
        return true;
    }

    clearSharedWorkspaceScope();
    unset($_SESSION['user_id'], $_SESSION['user']);
    $_SESSION['account_selection_required'] = true;
    return false;
}

/**
 * Sessions opened before the public read-only workspace link was removed may
 * still carry its state: the visitor was signed in AS the owner (user_id and
 * login_user_id both the owner's), read-only only because that code refused
 * writes. Without it such a session would pass for the owner with full
 * access, so it is taken apart: back to the person's own sign-in when one was
 * kept aside, anonymous otherwise.
 */
function purgeLegacyPublicWorkspaceSession(): void {
    $user = $_SESSION['user'] ?? null;
    $loginUser = $_SESSION['login_user'] ?? null;
    $isLegacy = ($_SESSION['auth_method'] ?? '') === 'public_workspace'
        || (is_array($user) && !empty($user['_public_workspace']))
        || (is_array($loginUser) && !empty($loginUser['_public_workspace']))
        || isset($_SESSION['public_workspace_access']);
    $original = $_SESSION['public_workspace_original_auth'] ?? null;

    foreach (array_keys($_SESSION) as $key) {
        if (strpos((string)$key, 'public_workspace') === 0) {
            unset($_SESSION[$key]);
        }
    }
    if (!$isLegacy) {
        return;
    }

    unset($_SESSION['authenticated'], $_SESSION['user_id'], $_SESSION['user'], $_SESSION['login_user_id'],
        $_SESSION['login_user'], $_SESSION['auth_method'], $_SESSION['account_selection_required']);
    clearSharedWorkspaceScope();

    if (is_array($original) && !empty($original['authenticated'])
        && isset($original['user_id'], $original['user']) && (int)$original['user_id'] > 0
        && is_array($original['user']) && empty($original['user']['_public_workspace'])) {
        $_SESSION['authenticated'] = true;
        $_SESSION['user_id'] = (int)$original['user_id'];
        $_SESSION['user'] = $original['user'];
        $_SESSION['login_user_id'] = (int)($original['login_user_id'] ?? $original['user_id']);
        $_SESSION['login_user'] = is_array($original['login_user'] ?? null) ? $original['login_user'] : $original['user'];
        if (!empty($original['auth_method'])) {
            $_SESSION['auth_method'] = (string)$original['auth_method'];
        }
    }
}

function isAuthenticated() {
    purgeLegacyPublicWorkspaceSession();

    // Check session first
    if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
        if (!isset($_SESSION['login_user_id']) && isset($_SESSION['user_id'])) {
            $_SESSION['login_user_id'] = (int)$_SESSION['user_id'];
            if (isset($_SESSION['user']) && is_array($_SESSION['user'])) {
                $_SESSION['login_user'] = $_SESSION['user'];
            }
        }

        if (isAccountSelectionRequired()) {
            return false;
        }

        return validateActiveAccountAccess();
    }
    
    // Check remember me cookie
    if (isset($_COOKIE[REMEMBER_ME_COOKIE])) {
        $token = $_COOKIE[REMEMBER_ME_COOKIE];
        $decoded = base64_decode($token);
        if ($decoded !== false) {
            $parts = explode(':', $decoded);
            if (count($parts) === 4) {
                // Format: username:user_id:timestamp:hash
                list($username, $userId, $timestamp, $hash) = $parts;
                // The timestamp comes from the cookie: reject anything that is
                // not a plain integer, and anything dated in the future, so a
                // far-future value cannot defeat the expiry window.
                $timestampValid = ctype_digit((string)$timestamp)
                    && (int)$timestamp <= time() + 60
                    && time() - (int)$timestamp < REMEMBER_ME_DURATION;
                if ($timestampValid) {
                    require_once __DIR__ . '/users/db_master.php';
                    $user = getUserProfileById((int)$userId);
                    
                    $secretToUse = $user ? getRememberMeSecret($user) : null;
                    if ($user && $secretToUse !== null && $user['active'] && $user['username'] === $username) {
                        $expectedHash = createRememberMeHash($username, (int)$userId, (int)$timestamp, $secretToUse);
                        $legacyExpectedHash = createLegacyRememberMeHash($username, (int)$userId, (int)$timestamp, $secretToUse);
                        $validHash = hash_equals($expectedHash, $hash);
                        $validLegacyHash = !$validHash && hash_equals($legacyExpectedHash, $hash);
                        
                        if ($validHash || $validLegacyHash) {
                            $activeAccountSelected = startAuthenticatedUserSession($user);
                            updateUserLastLogin((int)$userId);

                            if ($validLegacyHash) {
                                $newTimestamp = time();
                                setRememberMeCookie(buildRememberMeToken($username, (int)$userId, $newTimestamp, $secretToUse), time() + REMEMBER_ME_DURATION);
                            }

                            return $activeAccountSelected;
                        }
                    }
                }
            } elseif (count($parts) === 3) {
                // Legacy pre-multi-user format: username:timestamp:hash. It was
                // signed with the hardcoded AUTH_PASSWORD constant, which is
                // public, so anyone could mint one and be logged in as the first
                // profile. These cookies are no longer accepted: the holder is
                // sent back to the login page and re-issued a signed token.
                setRememberMeCookie('', time() - 3600);
                error_log('Poznote: Rejected legacy remember-me cookie (unsigned legacy format)');
                return false;
            }
        }
        // Invalid token, remove it
        setRememberMeCookie('', time() - 3600);
    }
    
    return false;
}

// --- Shared workspace scope -------------------------------------------------
//
// A workspace shared with an account (workspaces.php > Share, recorded in
// master.db workspace_shares) is opened by switching to the owner's account
// with the session confined to that one workspace: the grantee reads and
// edits it as the owner would, but the owner's other workspaces, trash of
// those, settings and backups stay out of reach. The scope sits in the
// session next to the active account and is checked again on every request
// (validateActiveAccountAccess), so revoking the share ends the session's
// access at the next call.

function getSharedWorkspaceScope(): ?array {
    $scope = $_SESSION['shared_workspace_scope'] ?? null;
    if (!is_array($scope)) {
        return null;
    }
    $ownerUserId = (int)($scope['owner_user_id'] ?? 0);
    $workspaceName = trim((string)($scope['workspace'] ?? ''));
    if ($ownerUserId <= 0 || $workspaceName === '' || $ownerUserId !== (int)($_SESSION['user_id'] ?? 0)) {
        return null;
    }
    return ['owner_user_id' => $ownerUserId, 'workspace' => $workspaceName];
}

function isSharedWorkspaceScopeActive(): bool {
    return getSharedWorkspaceScope() !== null;
}

function getSharedWorkspaceScopeName(): ?string {
    $scope = getSharedWorkspaceScope();
    return $scope !== null ? $scope['workspace'] : null;
}

function clearSharedWorkspaceScope(): void {
    unset($_SESSION['shared_workspace_scope']);
}

/**
 * True when the named workspace exists in the owner's database.
 */
function sharedWorkspaceExists(int $ownerUserId, string $workspaceName): bool {
    require_once __DIR__ . '/users/UserDataManager.php';
    try {
        $dbPath = (new UserDataManager($ownerUserId))->getUserDatabasePath();
        if (!is_file($dbPath)) {
            return false;
        }
        $ownerCon = new PDO('sqlite:' . $dbPath);
        $ownerCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $ownerCon->exec('PRAGMA busy_timeout = 5000');
        $stmt = $ownerCon->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
        $stmt->execute([$workspaceName]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Exception $e) {
        error_log('Poznote: cannot check shared workspace: ' . $e->getMessage());
        return false;
    }
}

/**
 * Open a workspace another account shares with the signed-in person: the
 * owner's account becomes the active one, confined to that workspace. Someone
 * holding full access to the owner's account (Admin > User Management) goes
 * through switchActiveAccount() instead and gets the whole account.
 *
 * Without a workspace name, the first one that account shares with the person
 * opens: "open this account" means its shared part, the only part they have.
 */
function openSharedWorkspace(int $ownerUserId, string $workspaceName = ''): bool {
    $workspaceName = trim($workspaceName);
    $authUserId = (int)(getAuthenticatedUserId() ?? 0);
    if (!isAuthenticated() || $authUserId <= 0 || $ownerUserId <= 0 || $ownerUserId === $authUserId) {
        return false;
    }

    if ($workspaceName === '') {
        $workspaceName = (string)(getSharedWorkspaceNamesFromOwner($ownerUserId)[0] ?? '');
        if ($workspaceName === '') {
            return false;
        }
    }

    require_once __DIR__ . '/users/db_master.php';
    if (!isWorkspaceSharedWithUser($ownerUserId, $workspaceName, $authUserId)) {
        return false;
    }

    $owner = getUserProfileById($ownerUserId);
    if (!$owner || empty($owner['active']) || !sharedWorkspaceExists($ownerUserId, $workspaceName)) {
        return false;
    }

    $previousUserId = (int)(getCurrentUserId() ?? 0);
    if (!setActiveUserAccount($owner)) {
        return false;
    }
    $_SESSION['shared_workspace_scope'] = ['owner_user_id' => $ownerUserId, 'workspace' => $workspaceName];

    if ($previousUserId !== $ownerUserId) {
        unset(
            $_SESSION['last_sync_result'],
            $_SESSION['git_sync_progress'],
            $_SESSION['git_sync_running'],
            $_SESSION['git_sync_async_result'],
            $_SESSION['git_sync_state_file']
        );
    }

    return true;
}

/**
 * Names of the workspaces one account shares with the signed-in person, in
 * the order getWorkspacesSharedWithUser() returns them.
 */
function getSharedWorkspaceNamesFromOwner(int $ownerUserId): array {
    $names = [];
    foreach (getSharedWorkspacesForLogin() as $row) {
        if ((int)$row['owner_user_id'] === $ownerUserId) {
            $names[] = (string)$row['workspace_name'];
        }
    }
    return $names;
}

/**
 * Workspaces other accounts share with the signed-in person, for the
 * workspace menu: rows of owner_user_id, owner_username, workspace_name and
 * 'current' (true for the one the session is confined to right now).
 */
function getSharedWorkspacesForLogin(): array {
    if (!isAuthenticated()) {
        return [];
    }
    $authUserId = (int)(getAuthenticatedUserId() ?? 0);
    if ($authUserId <= 0) {
        return [];
    }

    require_once __DIR__ . '/users/db_master.php';
    $scope = getSharedWorkspaceScope();
    $rows = [];
    foreach (getWorkspacesSharedWithUser($authUserId) as $row) {
        $row['current'] = $scope !== null
            && $scope['owner_user_id'] === $row['owner_user_id']
            && $scope['workspace'] === $row['workspace_name'];
        $rows[] = $row;
    }
    return $rows;
}

function getCurrentRelativeRequestUri(): string {
    require_once __DIR__ . '/lib/safe-redirect.php';
    return poznoteSanitizeLocalRedirect($_SERVER['REQUEST_URI'] ?? null) ?? 'index.php';
}

/**
 * Scripts a session confined to a shared workspace is kept away from: they
 * manage the owner's whole account (settings, webhooks, backups, Git sync,
 * the workspace list, the share list, storage), export or list it across its
 * workspaces, or act on the instance (admin pages, which an administrator
 * reaches again from their own account). A page redirects to the shared
 * workspace, a script answers 403.
 */
function enforceSharedWorkspaceScopeAccess(): void {
    $scope = getSharedWorkspaceScope();
    if ($scope === null) {
        return;
    }

    $scriptName = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $baseName = basename($scriptName);

    // Leaving the scope, or reading another account the login may open, is
    // not an action on the owner's workspace.
    if (in_array($baseName, ['switch_account.php', 'account_tree.php', 'logout.php'], true)) {
        return;
    }

    $restrictedPages = [
        'notes_manager.php', 'settings.php', 'workspaces.php', 'shared.php', 'trash.php',
        'backup_export.php', 'restore_import.php', 'git_sync.php',
        'user-webhooks.php', 'storage-stats-user.php', 'ai_settings_user.php', 'stt_settings_user.php',
        'ai_settings.php', 's3_settings.php', 's3_backup_settings.php', 'saas_settings.php', 'stt_settings.php',
    ];
    $restrictedScripts = [
        'api_export_attachments.php', 'api_backup_job.php', 'api_restore_upload.php',
        'api_s3_backup.php', 'api_s3_storage.php', 'api_upload_css.php',
    ];
    $isAdminPath = strpos($scriptName, '/admin/') !== false;
    if (in_array($baseName, $restrictedScripts, true)) {
        denyAccountAccessResponse('This action is not available in a workspace shared with you', 403);
    }
    if ($isAdminPath || in_array($baseName, $restrictedPages, true)) {
        header('Location: ' . ($isAdminPath ? '../' : '') . 'index.php?workspace=' . rawurlencode($scope['workspace']));
        exit;
    }

    enforceSharedWorkspaceScopeOnRequest($scope);
}

/**
 * Keep a scoped request inside its workspace. The workspace parameter is
 * forced to the shared one on the query string and form body (a stale link
 * lands in the right place), a JSON body naming another workspace is
 * refused, and every note or folder id the request carries, in the URL of
 * an API call or in a parameter, must belong to the shared workspace. The
 * lists of parameter names cover the API controllers and the api_*.php
 * scripts; an id that matches nothing is left to the handler's own 404.
 */
function enforceSharedWorkspaceScopeOnRequest(array $scope): void {
    $workspaceName = $scope['workspace'];

    // Requests that manage workspaces or the owner's account are not for a
    // scoped session. Settings stay readable, as for any borrowed account
    // (SettingsController), since the interface reads display preferences.
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $isRead = in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);
    if (preg_match('#/api/v1/(workspaces|settings)(/|$|\?)#', $uri) && !$isRead) {
        denyAccountAccessResponse('This workspace is shared with you: its settings belong to its owner', 403);
    }
    if (preg_match('#/api/v1/(shared|backups|git-sync|admin|trash)(/|$|\?)#', $uri)) {
        denyAccountAccessResponse('This endpoint is not available in a shared workspace', 403);
    }
    // Publishing a note or a folder on the public web is the owner's call, and
    // the page that manages those links is theirs too.
    if (preg_match('#/api/v1/(notes|folders)/\d+/share(/|$|\?)#', $uri)) {
        denyAccountAccessResponse('Public links are managed by the workspace owner', 403);
    }

    $body = [];
    $contentType = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (strpos($contentType, 'application/json') !== false) {
        $decoded = json_decode((string)file_get_contents('php://input'), true);
        if (is_array($decoded)) {
            $body = $decoded;
        }
    }

    $workspaceKeys = ['workspace', 'target_workspace', 'new_workspace', 'to_workspace', 'destination_workspace'];
    foreach ($workspaceKeys as $key) {
        if (isset($_GET[$key]) && is_string($_GET[$key]) && trim($_GET[$key]) !== '') {
            $_GET[$key] = $workspaceName;
            $_REQUEST[$key] = $workspaceName;
        }
        if (isset($_POST[$key]) && is_string($_POST[$key]) && trim($_POST[$key]) !== '') {
            $_POST[$key] = $workspaceName;
            $_REQUEST[$key] = $workspaceName;
        }
        if (isset($body[$key]) && is_string($body[$key]) && trim($body[$key]) !== '' && trim($body[$key]) !== $workspaceName) {
            denyAccountAccessResponse('This workspace is shared with you: notes cannot leave it', 403);
        }
    }
    // Every request is scoped to the shared workspace, also where leaving the
    // parameter out means "every workspace" (the export scripts, the lists
    // of the API).
    $_GET['workspace'] = $workspaceName;
    $_REQUEST['workspace'] = $workspaceName;

    $noteIds = [];
    $folderIds = [];
    if (preg_match('#/api/v1/notes/(\d+)#', $uri, $m)) {
        $noteIds[] = (int)$m[1];
    }
    if (preg_match('#/api/v1/folders/(\d+)#', $uri, $m)) {
        $folderIds[] = (int)$m[1];
    }
    if (preg_match('#/api/v1/trash/(\d+)#', $uri, $m)) {
        $noteIds[] = (int)$m[1];
    }

    $collect = static function (array $source, array $keys, array &$into): void {
        foreach ($keys as $key) {
            if (!isset($source[$key])) {
                continue;
            }
            $values = $source[$key];
            if (is_string($values) && strpos($values, ',') !== false) {
                $values = explode(',', $values);
            }
            foreach ((array)$values as $value) {
                if (is_scalar($value) && ctype_digit(trim((string)$value)) && (int)$value > 0) {
                    $into[] = (int)$value;
                }
            }
        }
    };
    $noteKeys = ['note_id', 'noteId', 'note_ids', 'target_note_id', 'linked_note_id', 'source_note_id', 'original_note_id', 'note', 'select_linked_note'];
    $folderKeys = ['folder_id', 'folderId', 'folder_ids', 'parent_id', 'parent_folder_id', 'source_folder_id', 'new_parent_id', 'new_parent_folder_id', 'target_folder_id', 'destination_folder_id', 'kanban', 'diary'];
    foreach ([$_GET, $_POST, $body] as $source) {
        $collect($source, $noteKeys, $noteIds);
        $collect($source, $folderKeys, $folderIds);
    }
    // The single-note export scripts name the note "id".
    if (in_array(basename((string)($_SERVER['SCRIPT_NAME'] ?? '')), ['api_export_note.php', 'api_download_note.php'], true)) {
        $collect($_GET, ['id'], $noteIds);
    }
    $noteIds = array_values(array_unique($noteIds));
    $folderIds = array_values(array_unique($folderIds));
    if (empty($noteIds) && empty($folderIds)) {
        return;
    }

    require_once __DIR__ . '/users/UserDataManager.php';
    try {
        $dbPath = (new UserDataManager((int)$scope['owner_user_id']))->getUserDatabasePath();
        if (!is_file($dbPath)) {
            return;
        }
        $ownerCon = new PDO('sqlite:' . $dbPath);
        $ownerCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $ownerCon->exec('PRAGMA busy_timeout = 5000');

        if (!empty($noteIds)) {
            $placeholders = implode(',', array_fill(0, count($noteIds), '?'));
            $stmt = $ownerCon->prepare("SELECT COUNT(*) FROM entries WHERE id IN ($placeholders) AND workspace != ?");
            $stmt->execute(array_merge($noteIds, [$workspaceName]));
            if ((int)$stmt->fetchColumn() > 0) {
                denyAccountAccessResponse('This note is outside the workspace shared with you', 403);
            }
        }
        if (!empty($folderIds)) {
            $placeholders = implode(',', array_fill(0, count($folderIds), '?'));
            $stmt = $ownerCon->prepare("SELECT COUNT(*) FROM folders WHERE id IN ($placeholders) AND workspace != ?");
            $stmt->execute(array_merge($folderIds, [$workspaceName]));
            if ((int)$stmt->fetchColumn() > 0) {
                denyAccountAccessResponse('This folder is outside the workspace shared with you', 403);
            }
        }
    } catch (Exception $e) {
        error_log('Poznote: shared workspace scope check failed: ' . $e->getMessage());
        denyAccountAccessResponse('Shared workspace check failed', 500);
    }
}

function denyAccountAccessResponse(string $message, int $code = 403, ?array $account = null): void {
    http_response_code($code);

    $acceptHeader = (string)($_SERVER['HTTP_ACCEPT'] ?? '');
    $requestUri = (string)($_SERVER['REQUEST_URI'] ?? '');
    $isJsonRequest = strpos($acceptHeader, 'application/json') !== false || strpos($requestUri, '/api/') !== false;

    if ($isJsonRequest) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => $message,
        ]);
    } else {
        $v = @file_get_contents(__DIR__ . '/version.txt') ?: time();
        $themeAssetVersion = max(
            (int) (@filemtime(__DIR__ . '/public/js/theme-init.js') ?: 0),
            (int) (@filemtime(__DIR__ . '/public/css/tokens.css') ?: 0),
            (int) (@filemtime(__DIR__ . '/public/css/public_folder.css') ?: 0)
        );
        $v = urlencode(trim($v) . ($themeAssetVersion > 0 ? '-' . $themeAssetVersion : ''));
        $currentLang = (function_exists('getUserLanguage')) ? getUserLanguage() : 'en';
        $title = (function_exists('t')) ? t('common.access_denied', [], 'Access Denied') : 'Access Denied';
        $isSubdir = strpos($_SERVER['SCRIPT_NAME'] ?? '', '/admin/') !== false;
        $prefix = $isSubdir ? '../' : '';
        ?>
        <!doctype html>
        <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo htmlspecialchars($title); ?></title>
            <meta name="color-scheme" content="dark light">
            <script src="<?php echo $prefix; ?>js/theme-init.js?v=<?php echo $v; ?>"></script>
            <link rel="stylesheet" href="<?php echo $prefix; ?>css/tokens.css?v=<?php echo $v; ?>">
            <link rel="stylesheet" href="<?php echo $prefix; ?>css/public_folder.css?v=<?php echo $v; ?>">
            <link rel="stylesheet" href="<?php echo $prefix; ?>css/lucide.css?v=<?php echo $v; ?>">
            <style>
                .error-container {
                    width: min(420px, 100%);
                    padding: 32px;
                    border: 1px solid var(--password-border, #dddddd);
                    border-radius: 10px;
                    background: var(--password-card-bg, #ffffff);
                    box-shadow: var(--password-shadow, 0 6px 24px rgba(0,0,0,0.08));
                    text-align: center;
                }
                .error-icon { font-size: 48px; color: #ef4444; margin-bottom: 20px; }
                .error-title { font-size: 24px; font-weight: 600; margin-bottom: 12px; color: var(--password-text, #333333); }
                .error-message { color: var(--password-muted, #666666); margin-bottom: 20px; line-height: 1.5; }
                /* Tokens only, no colour fallbacks: css/tokens.css and
                   css/public_folder.css are loaded above. */
                .error-account {
                    margin-bottom: 28px;
                    padding: 16px;
                    border: 1px solid var(--password-border);
                    border-radius: var(--pz-radius-lg);
                    background: var(--password-bg);
                }
                .error-account-label {
                    display: block;
                    font-size: 12px;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--password-muted);
                }
                .error-account-name {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    margin-top: 8px;
                    font-size: 20px;
                    font-weight: var(--pz-weight-semibold);
                    color: var(--password-text);
                    word-break: break-word;
                }
                .error-account-id {
                    display: inline-block;
                    margin-top: 8px;
                    padding: 3px 10px;
                    border: 1px solid var(--password-border);
                    border-radius: var(--pz-radius-pill);
                    background: var(--password-card-bg);
                    font-size: 14px;
                    color: var(--password-text);
                }
                .back-link {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 24px;
                    background: var(--password-accent, #3182ce);
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                .back-link:hover { background: var(--password-accent-hover, #2563eb); }
            </style>
        </head>
        <body class="password-page-body">
            <div class="error-container">
                <div class="error-icon"><i class="lucide lucide-shield"></i></div>
                <h1 class="error-title"><?php echo htmlspecialchars($title); ?></h1>
                <p class="error-message"><?php echo htmlspecialchars($message); ?></p>
                <?php if ($account !== null): ?>
                <div class="error-account">
                    <span class="error-account-label"><?php
                        echo htmlspecialchars((function_exists('t')) ? t('account_access.current_user_label', [], 'Current user') : 'Current user');
                    ?></span>
                    <span class="error-account-name">
                        <i class="lucide lucide-user"></i>
                        <?php echo htmlspecialchars($account['username']); ?>
                    </span>
                    <span class="error-account-id"><?php
                        echo htmlspecialchars((function_exists('t')) ? t('account_access.current_user_id', ['id' => $account['id']], 'ID {{id}}') : 'ID ' . $account['id']);
                    ?></span>
                </div>
                <?php endif; ?>
                <a href="<?php echo $prefix; ?>index.php" class="back-link">
                    <i class="lucide lucide-arrow-left"></i>
                    <?php echo (function_exists('t')) ? t('common.back_to_notes', [], 'Back to Notes') : 'Back to Notes'; ?>
                </a>
            </div>
        </body>
        </html>
        <?php
    }

    exit;
}

// --- Brute-force protection for password logins (form + API Basic Auth) ---
//
// Strategy: progressive delay, not a hard lockout. Each consecutive failure
// makes the next attempt slower (0s -> 1s -> 2s -> 4s ... capped), so a
// legitimate user fumbling a few passwords is never locked out, while a
// brute-forcer is throttled to a handful of guesses per minute. A very high
// hard cap stays as a last-resort safety net against sustained attacks.
define('LOGIN_DELAY_FREE_ATTEMPTS', 2);     // first N failures incur no delay
define('LOGIN_DELAY_MAX_SECONDS', 10);      // per-attempt delay cap
define('LOGIN_HARD_BLOCK_ATTEMPTS', 50);    // safety-net hard block threshold
define('LOGIN_ATTEMPT_WINDOW_SECONDS', 15 * 60); // failures older than this are forgotten

function getLoginRateLimitConnection(): ?PDO {
    static $initialized = false;

    try {
        require_once __DIR__ . '/users/db_master.php';
        $con = getMasterConnection();
        if (!$initialized) {
            $con->exec('CREATE TABLE IF NOT EXISTS login_attempts (
                key TEXT PRIMARY KEY,
                attempts INTEGER NOT NULL DEFAULT 0,
                first_attempt_at INTEGER NOT NULL
            )');
            $initialized = true;
        }
        return $con;
    } catch (Throwable $e) {
        error_log('Poznote login rate limit storage unavailable: ' . $e->getMessage());
        return null;
    }
}

/**
 * Rate limit keys: per-account (primary) and per-source-IP (backstop).
 * REMOTE_ADDR is used on purpose — X-Forwarded-For is client-controlled.
 */
function getLoginRateLimitKeys(string $identifier): array {
    $keys = [];
    $identifier = strtolower(trim($identifier));
    if ($identifier !== '') {
        $keys[] = 'user:' . $identifier;
    }
    $remoteAddr = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($remoteAddr !== '') {
        $keys[] = 'ip:' . $remoteAddr;
    }
    return $keys;
}

/**
 * Highest active failure count across this request's keys (account + IP),
 * ignoring failures older than the forget window.
 */
function getRecentFailedLoginCount(string $identifier): int {
    $con = getLoginRateLimitConnection();
    if ($con === null) {
        return 0;
    }

    $maxAttempts = 0;
    try {
        $windowStart = time() - LOGIN_ATTEMPT_WINDOW_SECONDS;
        foreach (getLoginRateLimitKeys($identifier) as $key) {
            $stmt = $con->prepare('SELECT attempts FROM login_attempts WHERE key = ? AND first_attempt_at >= ?');
            $stmt->execute([$key, $windowStart]);
            $attempts = $stmt->fetchColumn();
            if ($attempts !== false) {
                $maxAttempts = max($maxAttempts, (int)$attempts);
            }
        }
    } catch (Throwable $e) {
        error_log('Poznote login rate limit check failed: ' . $e->getMessage());
    }

    return $maxAttempts;
}

/**
 * Delay (in seconds) to apply before processing an attempt, based on how many
 * recent failures precede it: 0 while under the free allowance, then doubling
 * (1, 2, 4, 8, ...) up to the cap.
 */
function computeLoginDelaySeconds(int $recentFailures): int {
    $over = $recentFailures - LOGIN_DELAY_FREE_ATTEMPTS;
    if ($over <= 0) {
        return 0;
    }

    $delay = 1 << ($over - 1); // 1, 2, 4, 8, ...
    return (int)min($delay, LOGIN_DELAY_MAX_SECONDS);
}

/**
 * Throttle the current login attempt. Sleeps a progressively longer time as
 * recent failures accumulate. Returns true when the hard safety-net block is
 * in effect and the caller should reject the attempt outright.
 */
function throttleLoginAttempt(string $identifier): bool {
    $recentFailures = getRecentFailedLoginCount($identifier);

    if ($recentFailures >= LOGIN_HARD_BLOCK_ATTEMPTS) {
        error_log("Poznote Auth: Login hard-blocked after $recentFailures failures for '$identifier'");
        return true;
    }

    $delay = computeLoginDelaySeconds($recentFailures);
    if ($delay > 0) {
        sleep($delay);
    }

    return false;
}

function recordFailedLoginAttempt(string $identifier): void {
    $con = getLoginRateLimitConnection();
    if ($con === null) {
        return;
    }

    try {
        $now = time();
        $windowStart = $now - LOGIN_ATTEMPT_WINDOW_SECONDS;
        // Opportunistically drop forgotten windows so the table stays small.
        $con->prepare('DELETE FROM login_attempts WHERE first_attempt_at < ?')->execute([$windowStart]);
        foreach (getLoginRateLimitKeys($identifier) as $key) {
            $con->prepare('INSERT INTO login_attempts (key, attempts, first_attempt_at) VALUES (?, 1, ?)
                ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1')->execute([$key, $now]);
        }
    } catch (Throwable $e) {
        error_log('Poznote login rate limit record failed: ' . $e->getMessage());
    }
}

function clearLoginRateLimit(string $identifier): void {
    $con = getLoginRateLimitConnection();
    if ($con === null) {
        return;
    }

    try {
        foreach (getLoginRateLimitKeys($identifier) as $key) {
            $con->prepare('DELETE FROM login_attempts WHERE key = ?')->execute([$key]);
        }
    } catch (Throwable $e) {
        error_log('Poznote login rate limit clear failed: ' . $e->getMessage());
    }
}

/**
 * Authenticate with username/password
 */
function authenticate($username, $password, $rememberMe = false) {
    require_once __DIR__ . '/users/db_master.php';

    // Progressive delay before processing; hard block only as a safety net.
    if (throttleLoginAttempt((string)$username)) {
        return false;
    }

    // 1. Find user profile by their own username or email
    $user = getUserProfileByUsername($username);
    
    // If not found by username, try by email
    if (!$user) {
        $user = getUserProfileByEmail($username);
    }
    
    if (!$user || !$user['active']) {
        error_log("Poznote Auth: Login failed - User/Email '$username' not found or inactive");
        recordFailedLoginAttempt((string)$username);
        return false;
    }

    $userId = (int)$user['id'];
    $isProfileAdmin = (bool)$user['is_admin'];

    // 2. Validate password: DB hash takes priority, then env var fallback
    $authenticated = verifyUserPassword($userId, $password);
    if (!$authenticated) {
        $role = $isProfileAdmin ? 'Admin' : 'User';
        error_log("Poznote Auth: $role password mismatch for user '$username'");
        recordFailedLoginAttempt((string)$username);
    }

    if ($authenticated) {
        // 3. Second factor. The password alone opens nothing on a profile with
        // two-factor on: the login is parked in the session and login.php asks
        // for the code (completeTotpLoginChallenge()). The failure counter is
        // left as it is, so wrong codes keep adding to it.
        try {
            require_once __DIR__ . '/users/totp.php';
            $needsSecondFactor = isUserTotpEnabled($userId);
        } catch (Throwable $e) {
            // Unknown state is not "no second factor": refuse the login.
            error_log("Poznote Auth: two-factor state unreadable for user '$username': " . $e->getMessage());
            return false;
        }
        if ($needsSecondFactor) {
            beginTotpLoginChallenge($user, (string)$username, (bool)$rememberMe);
            return false;
        }

        clearLoginRateLimit((string)$username);
        startAuthenticatedUserSession($user);
        updateUserLastLogin($userId);

        if ($rememberMe) {
            issueRememberMeCookie($user);
        }

        return true;
    }

    return false;
}

function issueRememberMeCookie(array $user): void {
    $secretToUse = getRememberMeSecret($user);
    if ($secretToUse === null) {
        return;
    }

    // Format: actual_username:user_id:timestamp:hash
    $token = buildRememberMeToken((string)$user['username'], (int)$user['id'], time(), $secretToUse);
    setRememberMeCookie($token, time() + REMEMBER_ME_DURATION);
}

// --- Second step of a password login (two-factor, see src/lib/totp.php) ---
//
// Between the password and the code nothing is authenticated: the session
// only remembers who passed the first step, under a key isAuthenticated()
// never looks at. The challenge is short-lived and allows a few tries, after
// which the password has to be typed again; wrong codes also feed the same
// progressive delay as wrong passwords.
define('TOTP_LOGIN_CHALLENGE_SECONDS', 5 * 60);
define('TOTP_LOGIN_CHALLENGE_MAX_TRIES', 5);

function beginTotpLoginChallenge(array $user, string $loginIdentifier, bool $rememberMe): void {
    // Same reason as in startAuthenticatedUserSession(): the session now
    // carries a half-login, it must not keep an ID chosen before it.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }

    $_SESSION['totp_login_challenge'] = [
        'user_id' => (int)$user['id'],
        'identifier' => $loginIdentifier,
        'remember_me' => $rememberMe,
        'expires_at' => time() + TOTP_LOGIN_CHALLENGE_SECONDS,
        'tries' => 0,
    ];
}

/**
 * The pending second step of this session, or null. An expired or exhausted
 * challenge is dropped on the way.
 */
function getPendingTotpLoginChallenge(): ?array {
    $challenge = $_SESSION['totp_login_challenge'] ?? null;
    if (!is_array($challenge)) {
        return null;
    }

    if ((int)($challenge['user_id'] ?? 0) <= 0
        || (int)($challenge['expires_at'] ?? 0) < time()
        || (int)($challenge['tries'] ?? 0) >= TOTP_LOGIN_CHALLENGE_MAX_TRIES) {
        unset($_SESSION['totp_login_challenge']);
        return null;
    }

    return $challenge;
}

function cancelTotpLoginChallenge(): void {
    unset($_SESSION['totp_login_challenge']);
}

/**
 * Finishes a password login with an authenticator code or a recovery code.
 * Returns true once the session is authenticated, exactly like authenticate():
 * the caller still has to check isAccountSelectionRequired().
 */
function completeTotpLoginChallenge(string $code): bool {
    $challenge = getPendingTotpLoginChallenge();
    if ($challenge === null) {
        return false;
    }

    require_once __DIR__ . '/users/db_master.php';
    require_once __DIR__ . '/users/totp.php';

    $userId = (int)$challenge['user_id'];
    $identifier = (string)$challenge['identifier'];

    if (throttleLoginAttempt($identifier)) {
        return false;
    }

    // The profile may have been disabled since the password was checked.
    $user = getUserProfileById($userId);
    if (!$user || !$user['active']) {
        cancelTotpLoginChallenge();
        return false;
    }

    try {
        $factor = verifyUserSecondFactor($userId, $code);
    } catch (Throwable $e) {
        error_log("Poznote Auth: two-factor check failed for user $userId: " . $e->getMessage());
        $factor = null;
    }

    if ($factor === null) {
        error_log("Poznote Auth: wrong two-factor code for user '" . ($user['username'] ?? $userId) . "'");
        recordFailedLoginAttempt($identifier);
        $_SESSION['totp_login_challenge']['tries'] = (int)$challenge['tries'] + 1;
        return false;
    }

    clearLoginRateLimit($identifier);
    startAuthenticatedUserSession($user);
    updateUserLastLogin($userId);

    if ($factor === 'recovery') {
        // Worth a trace of its own: either the user lost their device, or
        // someone else holds one of their printed codes.
        logActivity(
            ACTIVITY_TWO_FACTOR_RECOVERY_USED,
            ['remaining' => countUserTotpRecoveryCodes($userId)],
            'web',
            $userId,
            $user['username'] ?? null
        );
    }

    if (!empty($challenge['remember_me'])) {
        issueRememberMeCookie($user);
    }

    return true;
}

function logout() {
    // Must run before session_destroy(): the actor is read from the session,
    // and there is no identity left to record afterwards.
    $logoutMethod = $_SESSION['auth_method'] ?? 'password';
    if (!empty($_SESSION['authenticated'])) {
        require_once __DIR__ . '/ActivityLog.php';
        logActivity(
            ACTIVITY_LOGOUT,
            ['method' => $logoutMethod],
            $logoutMethod === 'oidc' ? 'oidc' : 'web',
            isset($_SESSION['login_user_id']) ? (int)$_SESSION['login_user_id'] : null,
            $_SESSION['login_user']['username'] ?? null
        );
    }

    $oidcLogoutUrl = null;
    if (isset($_SESSION['auth_method']) && $_SESSION['auth_method'] === 'oidc') {
        $oidcPath = __DIR__ . '/public/oidc.php';
        if (is_file($oidcPath)) {
            require_once $oidcPath;
            if (function_exists('oidc_logout_redirect_url')) {
                $oidcLogoutUrl = oidc_logout_redirect_url();
            }
        }
    }

    session_destroy();
    // Remove remember me cookie
    if (isset($_COOKIE[REMEMBER_ME_COOKIE])) {
        setRememberMeCookie('', time() - 3600);
    }
    clearUserPreferenceCookie();
    setJustLoggedOutCookie();

    if (is_string($oidcLogoutUrl) && $oidcLogoutUrl !== '') {
        header('Location: ' . $oidcLogoutUrl);
        exit;
    }

    header('Location: login.php');
    exit;
}

/**
 * Turns away a request that carries no usable credential, in the shape its
 * caller can act on (issue #1389):
 *
 *  - a top-level navigation goes to the login page, with the current URL as
 *    the place to come back to once signed in;
 *  - a call made by a page's script gets a bare 401 with a JSON body, and
 *    js/session-guard.js sends the page to the login form itself. No Basic
 *    challenge here: the browser would answer it with its own username and
 *    password dialog, which cannot sign an SSO account in and hides the login
 *    page that could;
 *  - anything else is an API client and gets what it always had. From an API
 *    gate that is 401 plus the Basic challenge (withheld when account
 *    passwords are barred from the API); from a page gate, the redirect to
 *    the login form.
 *
 * @param string $message   Error text for the JSON body.
 * @param string $loginPath Path to login.php from the request's URL.
 * @param bool   $isPage    True from a page gate (requireAuth), false from an
 *                          API gate.
 */
function poznoteDenyUnauthenticatedRequest(string $message, string $loginPath, bool $isPage): void {
    require_once __DIR__ . '/lib/request-kind.php';
    $kind = poznoteClassifyRequest($_SERVER);

    $sendToLogin = $isPage ? ($kind !== POZNOTE_REQUEST_SCRIPT) : ($kind === POZNOTE_REQUEST_DOCUMENT);
    if ($sendToLogin) {
        $params = [];
        if (isAccountSelectionRequired()) {
            $params['select_account'] = '1';
        }
        // Only a page the browser can land on again is worth coming back to.
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($kind === POZNOTE_REQUEST_DOCUMENT && in_array($method, ['GET', 'HEAD'], true)) {
            $params['redirect'] = getCurrentRelativeRequestUri();
        }
        header('Location: ' . $loginPath . ($params === [] ? '' : '?' . http_build_query($params)));
        exit;
    }

    http_response_code(401);
    $basicAuthDisabled = defined('OIDC_DISABLE_BASIC_AUTH') && OIDC_DISABLE_BASIC_AUTH;
    if ($kind === POZNOTE_REQUEST_CLIENT && !$basicAuthDisabled) {
        header('WWW-Authenticate: Basic realm="Poznote API"');
    }
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function requireAuth() {
    if (!isAuthenticated()) {
        poznoteDenyUnauthenticatedRequest('Authentication required', 'login.php', true);
    }

    syncUserPreferenceCookie();
    syncActiveAccountCookie();
    enforceActiveAccountHeader();

    enforceSharedWorkspaceScopeAccess();
}

function getMcpServiceTokenPath(): string {
    static $tokenPath = null;

    if ($tokenPath !== null) {
        return $tokenPath;
    }

    $defaultPath = dirname(SQLITE_DATABASE, 2) . '/.mcp_token';
    $configuredPath = trim((string) getAuthConfig('POZNOTE_SERVICE_TOKEN_FILE', $defaultPath));
    $tokenPath = $configuredPath !== '' ? $configuredPath : $defaultPath;

    return $tokenPath;
}

function getMcpServiceToken(): ?string {
    static $token = null;

    if (is_string($token) && $token !== '') {
        return $token;
    }

    $tokenPath = getMcpServiceTokenPath();

    if (is_file($tokenPath) && is_readable($tokenPath)) {
        $storedToken = trim((string) @file_get_contents($tokenPath));
        if ($storedToken !== '') {
            $token = $storedToken;
            return $token;
        }
    }

    $tokenDir = dirname($tokenPath);
    if (!is_dir($tokenDir) || !is_writable($tokenDir)) {
        return null;
    }

    try {
        $generatedToken = bin2hex(random_bytes(32));
    } catch (Throwable $e) {
        return null;
    }

    if (@file_put_contents($tokenPath, $generatedToken . PHP_EOL, LOCK_EX) === false) {
        return null;
    }

    @chmod($tokenPath, 0644);
    $token = $generatedToken;
    return $token;
}

function getApiAuthorizationHeader(): string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (is_string($header) && $header !== '') {
        return trim($header);
    }

    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp((string) $name, 'Authorization') === 0) {
                return trim((string) $value);
            }
        }
    }

    return '';
}

function getApiBasicCredentials(): ?array {
    if (isset($_SERVER['PHP_AUTH_USER']) && isset($_SERVER['PHP_AUTH_PW'])) {
        return [
            'username' => (string) $_SERVER['PHP_AUTH_USER'],
            'password' => (string) $_SERVER['PHP_AUTH_PW'],
        ];
    }

    $authorizationHeader = getApiAuthorizationHeader();
    if (!preg_match('/^Basic\s+(.+)$/i', $authorizationHeader, $matches)) {
        return null;
    }

    $decodedValue = base64_decode($matches[1], true);
    if ($decodedValue === false || strpos($decodedValue, ':') === false) {
        return null;
    }

    [$username, $password] = explode(':', $decodedValue, 2);
    return [
        'username' => $username,
        'password' => $password,
    ];
}

function getApiBearerToken(): ?string {
    $authorizationHeader = getApiAuthorizationHeader();
    if (!preg_match('/^Bearer\s+(.+)$/i', $authorizationHeader, $matches)) {
        return null;
    }

    $token = trim($matches[1]);
    return $token !== '' ? $token : null;
}

function hasApiAuthCredentials(): bool {
    return getApiBearerToken() !== null || getApiBasicCredentials() !== null;
}

/**
 * True when the current request was authenticated with the internal MCP
 * service token (data/.mcp_token), i.e. it comes from the MCP server acting
 * for an AI assistant. Used to take a safety snapshot before such a client
 * rewrites a note.
 */
function isApiServiceTokenRequest(): bool {
    if (getApiBearerToken() === null) {
        return false;
    }
    return (($_SESSION['login_user']['_api_auth_method'] ?? '') === 'service_token');
}

/**
 * Whose editing the current request counts as, for the note edit lock.
 *
 * A note open in the app is locked by the logged-in user, and that same
 * user's other tools never block on it (their other tabs, the AI chat, an
 * API script with their credentials). Normally that identity is the
 * authenticated user, so an admin working inside another profile still
 * keeps their own: that profile's open tab does block them.
 *
 * The MCP service token has no user of its own (it is authenticated as the
 * default admin profile) and acts for the profile named by X-User-ID, so
 * for the lock it is that profile: the note open in their browser and the
 * assistant writing through MCP are the same person (issue 1366).
 */
function getNoteEditLockActorUserId(): int {
    if (isApiServiceTokenRequest()) {
        $targetUserId = (int) (getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0));
        if ($targetUserId > 0) {
            return $targetUserId;
        }
    }

    return (int) (getAuthenticatedUserId() ?? getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0));
}

/**
 * True when the current API request authenticated with an app password
 * (src/lib/app-passwords.php). Account management refuses such requests:
 * a credential issued for one client must not be able to change the account
 * password, delete the account, or mint further credentials.
 */
function isApiAppPasswordRequest(): bool {
    return (($_SESSION['login_user']['_api_auth_method'] ?? '') === 'app_password');
}

function isApiJwtBearerToken(string $token): bool {
    return substr_count($token, '.') === 2;
}

function setApiAuthenticatedUser(array $user, ?array $authUser = null): void {
    $authUser = $authUser ?? $user;
    $_SESSION['authenticated'] = true;
    $_SESSION['login_user_id'] = (int) $authUser['id'];
    $_SESSION['login_user'] = $authUser;
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['user'] = [
        'id' => $user['id'],
        'username' => $user['username'],
        'is_admin' => (bool) $user['is_admin']
    ];
    unset($_SESSION['account_selection_required']);
}

function getDefaultApiAdminProfile(): ?array {
    require_once __DIR__ . '/users/db_master.php';
    $profiles = getAllUserProfiles();

    foreach ($profiles as $profile) {
        if (!(bool) ($profile['is_admin'] ?? false)) {
            continue;
        }

        $adminProfile = getUserProfileById((int) $profile['id']);
        if ($adminProfile && (bool) ($adminProfile['active'] ?? false)) {
            return $adminProfile;
        }
    }

    foreach ($profiles as $profile) {
        $userProfile = getUserProfileById((int) $profile['id']);
        if ($userProfile && (bool) ($userProfile['active'] ?? false)) {
            return $userProfile;
        }
    }

    return null;
}

function authenticateApiOidcJwtBearerToken(string $providedToken, bool $requireAdmin = false): ?array {
    if (!isApiJwtBearerToken($providedToken)) {
        return null;
    }

    $oidcPath = __DIR__ . '/public/oidc.php';
    if (!is_file($oidcPath)) {
        return null;
    }

    require_once $oidcPath;
    if (!function_exists('oidc_is_enabled') || !oidc_is_enabled()) {
        return null;
    }

    try {
        $claims = oidc_parse_and_verify_api_token($providedToken);
        $authUser = oidc_find_or_provision_user($claims);
        $authUser['_api_auth_method'] = 'oidc_jwt';
    } catch (Throwable $e) {
        error_log('Poznote API OIDC Bearer authentication failed: ' . $e->getMessage());
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }

    if ($requireAdmin && !(bool) $authUser['is_admin']) {
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }

    updateUserLastLogin((int)$authUser['id']);
    return $authUser;
}

/**
 * Authenticate via the internal MCP Bearer token or an OIDC JWT Bearer token.
 * Returns null when no Bearer token is provided.
 */
function authenticateApiBearerToken(bool $requireAdmin = false): ?array {
    $providedToken = getApiBearerToken();
    if ($providedToken === null) {
        return null;
    }

    $expectedToken = getMcpServiceToken();
    if (is_string($expectedToken) && $expectedToken !== '' && hash_equals($expectedToken, $providedToken)) {
        $authUser = getDefaultApiAdminProfile();
        if ($authUser === null) {
            $authUser = [
                'id' => 1,
                'username' => 'mcp-service',
                'is_admin' => true,
                'active' => true,
            ];
        }
        $authUser['_api_auth_method'] = 'service_token';

        if ($requireAdmin && !(bool) $authUser['is_admin']) {
            $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
            header('HTTP/1.1 401 Unauthorized');
            header('Content-Type: application/json');
            echo json_encode(['error' => $msg]);
            exit;
        }

        return $authUser;
    }

    $oidcUser = authenticateApiOidcJwtBearerToken($providedToken, $requireAdmin);
    if ($oidcUser !== null) {
        return $oidcUser;
    }

    $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
    header('HTTP/1.1 401 Unauthorized');
    header('Content-Type: application/json');
    echo json_encode(['error' => $msg]);
    exit;
}

function getApiAuthenticatedUser(bool $requireAdmin = false): array {
    $bearerUser = authenticateApiBearerToken($requireAdmin);
    if ($bearerUser !== null) {
        return $bearerUser;
    }

    return authenticateApiBasicAuth($requireAdmin);
}

/**
 * Authenticate via HTTP Basic Auth headers.
 * Validates credentials and returns the authenticated user profile.
 * Sends error response and exits on failure.
 *
 * @param bool $requireAdmin If true, non-admin users are rejected with "Invalid credentials".
 * @return array The authenticated user profile.
 */
function authenticateApiBasicAuth(bool $requireAdmin = false): array {
    $basicAuthDisabled = defined('OIDC_DISABLE_BASIC_AUTH') && OIDC_DISABLE_BASIC_AUTH;
    $basicCredentials = getApiBasicCredentials();
    
    if ($basicCredentials === null) {
        $msg = api_t('auth.api.authentication_required', [], 'Authentication required');
        poznoteDenyUnauthenticatedRequest($msg, '/login.php', false);
    }
    
    // "Disable Basic auth" is about account passwords: an SSO-only instance
    // does not want them anywhere near the API. App passwords are the
    // credential that exists precisely for that instance, so they go through.
    // The shape check is all that is decided here; the secret itself is
    // verified below like any other.
    require_once __DIR__ . '/lib/app-passwords.php';
    if ($basicAuthDisabled && !isAppPasswordSecret((string)$basicCredentials['password'])) {
        $msg = api_t('auth.api.basic_auth_disabled', [], 'Basic authentication is disabled');
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $loginIdentifier = $basicCredentials['username'];

    // Progressive delay before processing; hard block only as a safety net.
    if (throttleLoginAttempt((string)$loginIdentifier)) {
        $msg = api_t('auth.api.too_many_attempts', [], 'Too many failed authentication attempts. Try again later.');
        header('HTTP/1.1 429 Too Many Requests');
        header('Retry-After: ' . LOGIN_ATTEMPT_WINDOW_SECONDS);
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }

    $authUser = resolveApiBasicAuthUser($basicCredentials);
    $credentialsValid = $authUser !== null;

    // Same response for bad credentials and insufficient role (no role disclosure),
    // but only genuine credential failures count towards the rate limit.
    if (!$credentialsValid || ($requireAdmin && !(bool)$authUser['is_admin'])) {
        // A correct password sent without a code is not a guess at anything,
        // and it is what a client configured before two-factor was switched on
        // sends on every poll: counting it would walk the account into the
        // hard block and lock its owner out of the login form.
        if (!$credentialsValid && poznoteApiSecondFactorRejection() !== 'missing') {
            recordFailedLoginAttempt((string)$loginIdentifier);
        }
        // A valid app password on an admin route is the one case that gets
        // told why: its holder already has the secret, so nothing is disclosed,
        // and "invalid credentials" would send them checking a value that is
        // fine. Admin routes are out of scope for app passwords by design.
        if ($credentialsValid && ($authUser['_api_auth_method'] ?? '') === 'app_password') {
            $msg = api_t('auth.api.app_password_admin_forbidden', [], 'App passwords cannot access administrator endpoints');
            header('HTTP/1.1 403 Forbidden');
            header('Content-Type: application/json');
            echo json_encode(['error' => $msg]);
            exit;
        }
        // Two-factor is the other case that gets told why. It does confirm
        // the password to whoever sent it, which is the trade every service
        // with an OTP header makes: a client given the account password by
        // habit would otherwise never find out an app password is expected.
        // A wrong code was counted above like a wrong password, so the code
        // cannot be guessed at a faster rate.
        if (!$credentialsValid && poznoteApiSecondFactorRejection() !== null) {
            $msg = poznoteApiSecondFactorRejection() === 'missing'
                ? api_t('auth.api.two_factor_required', [], 'Two-factor authentication is enabled on this account: use an app password, or send the current code in the X-Poznote-OTP header')
                : api_t('auth.api.two_factor_invalid', [], 'Invalid two-factor code');
            header('HTTP/1.1 401 Unauthorized');
            header('X-Poznote-OTP: required');
            header('Content-Type: application/json');
            echo json_encode(['error' => $msg]);
            exit;
        }
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }

    clearLoginRateLimit((string)$loginIdentifier);

    return $authUser;
}

/**
 * Resolves Basic credentials to the profile they authenticate, or null.
 *
 * Two credentials are accepted in the password slot: the account password,
 * checked by verifyUserPassword(), and an app password
 * (src/lib/app-passwords.php), told apart by its shape. An app password
 * authenticates the profile with the admin flag stripped and its method
 * recorded, and that is what every later restriction keys off: the admin
 * gate above, isCurrentUserAdmin() in the controllers, and the rule in
 * requireApiAuth() that a non-admin credential only reaches its own profile.
 *
 * Shared with the attachment download path, which checks Basic credentials
 * by hand because a publicly shared attachment must stay reachable with none.
 */
function resolveApiBasicAuthUser(array $basicCredentials): ?array {
    require_once __DIR__ . '/users/db_master.php';
    require_once __DIR__ . '/lib/app-passwords.php';

    $loginIdentifier = (string)($basicCredentials['username'] ?? '');
    $password = (string)($basicCredentials['password'] ?? '');

    $authUser = ctype_digit($loginIdentifier)
        ? getUserProfileById((int)$loginIdentifier)
        : getUserProfileByUsername($loginIdentifier);
    if (!$authUser || !$authUser['active']) {
        return null;
    }
    $userId = (int)($authUser['id'] ?? 0);

    if (isAppPasswordSecret($password)) {
        require_once __DIR__ . '/users/app_passwords.php';
        $appPassword = verifyUserAppPassword($userId, $password);
        if ($appPassword === null) {
            return null;
        }
        $authUser['is_admin'] = 0;
        $authUser['_api_auth_method'] = 'app_password';
        $authUser['_app_password_id'] = (int)$appPassword['id'];
        $authUser['_app_password_label'] = (string)$appPassword['label'];
        return $authUser;
    }

    if (!verifyUserPassword($userId, $password)) {
        return null;
    }

    // With two-factor on, the account password is not enough here either,
    // otherwise the API would be the way around the login form. Clients are
    // meant to use an app password; the account password still works when the
    // current code comes with it in X-Poznote-OTP, which is what keeps admin
    // routes (closed to app passwords) reachable from a terminal.
    try {
        require_once __DIR__ . '/users/totp.php';
        if (isUserTotpEnabled($userId)) {
            $otp = trim((string)($_SERVER['HTTP_X_POZNOTE_OTP'] ?? ''));
            if ($otp === '' || !verifyUserTotpCode($userId, $otp, false)) {
                poznoteApiSecondFactorRejection($otp === '' ? 'missing' : 'invalid');
                return null;
            }
        }
    } catch (Throwable $e) {
        error_log("Poznote Auth: two-factor state unreadable for API user $userId: " . $e->getMessage());
        return null;
    }

    $authUser['_api_auth_method'] = 'basic';
    return $authUser;
}

/**
 * Why resolveApiBasicAuthUser() turned down a correct account password, if it
 * did: 'missing' or 'invalid' second factor. Called with a value to record it,
 * without one to read it.
 */
function poznoteApiSecondFactorRejection(?string $reason = null): ?string {
    static $rejection = null;
    if ($reason !== null) {
        $rejection = $reason;
    }
    return $rejection;
}

function requireApiAuth() {
    // Header credentials take precedence over an existing session: API clients
    // that keep cookies between requests (e.g. the MCP server's HTTP client)
    // would otherwise stay pinned to the first profile they targeted, making
    // X-User-ID silently ignored on every later request.
    if (isAuthenticated() && !hasApiAuthCredentials()) {
        enforceActiveAccountHeader();
        enforceSharedWorkspaceScopeAccess();
        return;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $authUser = getApiAuthenticatedUser();
    $isAdminCreds = (bool)$authUser['is_admin'];
    
    // For Basic Auth, require X-User-ID header to specify which user profile to use
    // This is needed because with multi-user, each user has their own data.
    // A credential bound to one profile (OIDC JWT, app password) implies it.
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if ($userId === null && in_array($authUser['_api_auth_method'] ?? '', ['oidc_jwt', 'app_password'], true)) {
        $userId = (string)$authUser['id'];
    }
    
    if ($userId === null) {
        header('HTTP/1.1 400 Bad Request');
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'X-User-ID header is required for API authentication',
            'hint' => 'Specify the user profile ID to access. Use GET /api/v1/admin/users to list available profiles.'
        ]);
        exit;
    }
    
    // Validate target user ID and load user profile
    $user = getUserProfileById((int)$userId);
    
    // Authorization check: 
    // - Admin credentials can access ANY user's data
    // - User credentials can ONLY access their own data
    if ($user) {
        // If the authenticated user is NOT an admin, they must match the X-User-ID profile
        if (!$isAdminCreds && (int)$authUser['id'] !== (int)$userId) {
             header('HTTP/1.1 403 Forbidden');
             header('Content-Type: application/json');
             echo json_encode(['error' => 'User credentials can only access their own profile data']);
             exit;
        }
    }
    
    if (!$user) {
        header('HTTP/1.1 404 Not Found');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile not found: ' . $userId]);
        exit;
    }
    
    if (!$user['active']) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile is disabled']);
        exit;
    }
    
    // Set up session with the specified user profile
    setApiAuthenticatedUser($user, $authUser);
}

/**
 * Require API authentication for user-accessible non-data endpoints
 * Similar to requireApiAuth but doesn't require X-User-ID header
 * Used for /users/me, /users/profiles, /system/version
 */
function requireApiAuthUser() {
    // Header credentials take precedence over an existing session (see requireApiAuth)
    if (isAuthenticated() && !hasApiAuthCredentials()) {
        enforceActiveAccountHeader();
        enforceSharedWorkspaceScopeAccess();
        return;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $authUser = getApiAuthenticatedUser();

    $userId = $_SERVER['HTTP_X_USER_ID'] ?? (string) $authUser['id'];
    $user = getUserProfileById((int) $userId);

    if (!$user) {
        header('HTTP/1.1 404 Not Found');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile not found: ' . $userId]);
        exit;
    }

    if (!$user['active']) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile is disabled']);
        exit;
    }

    if (!(bool) $authUser['is_admin'] && (int) $authUser['id'] !== (int) $userId) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User credentials can only access their own profile data']);
        exit;
    }

    setApiAuthenticatedUser($user, $authUser);
}

/**
 * Get current user info
 */
function getCurrentUser() {
    return $_SESSION['user'] ?? null;
}

/**
 * Get current user ID
 */
function getCurrentUserId() {
    return $_SESSION['user_id'] ?? null;
}

/**
 * True when the active note account is the authenticated user's own account.
 */
function isActiveAccountOwnedByAuthenticatedUser(): bool {
    $authenticatedUserId = (int)(getAuthenticatedUserId() ?? 0);
    $activeUserId = (int)(getCurrentUserId() ?? 0);

    return $authenticatedUserId > 0 && $activeUserId > 0 && $authenticatedUserId === $activeUserId;
}

/**
 * Settings and account-management surfaces must not operate on borrowed accounts.
 */
function getActiveAccountOwnerRequiredMessage(): string {
    return api_t(
        'account_access.owner_only_settings',
        [],
        'This account\'s settings are not accessible because you are not the owner of this account.'
    );
}

/**
 * Name and id of the account currently in use, for display on denial screens.
 */
function getActiveAccountIdentity(): ?array {
    $activeUser = getCurrentUser();
    $activeUserId = (int)(getCurrentUserId() ?? 0);

    if (!is_array($activeUser) || $activeUserId <= 0) {
        return null;
    }

    return [
        'username' => (string)($activeUser['username'] ?? ''),
        'id' => $activeUserId,
    ];
}

function requireActiveAccountOwner(?string $message = null): void {
    requireAuth();

    if (isActiveAccountOwnedByAuthenticatedUser()) {
        return;
    }

    if ($message === null) {
        $message = getActiveAccountOwnerRequiredMessage();
    }

    denyAccountAccessResponse($message, 403, getActiveAccountIdentity());
}

/**
 * Check if current user is admin
 */
function isCurrentUserAdmin() {
    $user = getAuthenticatedUser();
    return $user && ($user['is_admin'] ?? false);
}

/**
 * Require admin access
 */
function requireAdmin() {
    requireAuth();
    if (!isCurrentUserAdmin()) {
        header('HTTP/1.1 403 Forbidden');
        echo 'Admin access required';
        exit;
    }
}

/**
 * Require API authentication for admin endpoints
 * Similar to requireApiAuth but doesn't require X-User-ID header
 * Used for /admin/* and /users/profiles endpoints that access master.db, not user data
 */
function requireApiAuthAdmin() {
    // Header credentials take precedence over an existing session (see requireApiAuth)
    if (isAuthenticated() && !hasApiAuthCredentials()) {
        enforceSharedWorkspaceScopeAccess();
        // Session users must hold the admin role; controllers may re-check,
        // but the gate itself must not let non-admins through.
        if (!isCurrentUserAdmin()) {
            header('HTTP/1.1 403 Forbidden');
            header('Content-Type: application/json');
            echo json_encode(['error' => api_t('auth.api.admin_required', [], 'Admin access required')]);
            exit;
        }
        enforceActiveAccountHeader();
        return;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $authUser = getApiAuthenticatedUser(requireAdmin: true);
    
    // For admin endpoints, we still need a user context for getCurrentUserId() etc.
    // Use X-User-ID if provided, otherwise use the authenticated admin profile
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    if ($userId !== null) {
        // Use the specified user
        $user = getUserProfileById((int)$userId);
        
        if ($user && $user['active']) {
            setApiAuthenticatedUser($user, $authUser);
            return;
        }

        header('HTTP/1.1 404 Not Found');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile not found: ' . $userId]);
        exit;
    } else {
        setApiAuthenticatedUser($authUser, $authUser);
    }
}
