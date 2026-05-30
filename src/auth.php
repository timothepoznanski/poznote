<?php
/**
 * Authentication Module
 * 
 * In multi-user mode:
 * - Single global password (AUTH_USERNAME / AUTH_PASSWORD)
 * - Multiple user profiles, each with their own data space
 * - User selects their profile on login page
 */

// Detect if behind a reverse proxy (HTTPS termination)
$isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
         || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
         || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
         || (!empty($_SERVER['HTTP_X_FORWARDED_PORT']) && $_SERVER['HTTP_X_FORWARDED_PORT'] === '443');

// Allow override via environment variable for edge cases
$forceSecureCookies = getenv('POZNOTE_FORCE_SECURE_COOKIES');
if ($forceSecureCookies !== false && $forceSecureCookies !== '') {
    $isSecure = filter_var($forceSecureCookies, FILTER_VALIDATE_BOOLEAN);
}

// Configure session cookie for reverse proxy compatibility
$cookieParams = [
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isSecure,
    'httponly' => true,
    'samesite' => 'Lax'
];
session_set_cookie_params($cookieParams);

// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

session_start();

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

    // Try to initialize DB connection so getUserLanguage() can read settings.language.
    if (!isset($GLOBALS['con'])) {
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
    } elseif (($_SESSION['auth_method'] ?? '') !== 'public_workspace') {
        unset($_SESSION['auth_method']);
    }
}

function setActiveUserAccount(array $targetUser): bool {
    $targetUserId = (int)($targetUser['id'] ?? 0);
    if ($targetUserId <= 0 || empty($targetUser['active'])) {
        return false;
    }

    $_SESSION['user_id'] = $targetUserId;
    $_SESSION['user'] = $targetUser;
    unset($_SESSION['account_selection_required']);

    return true;
}

function startAuthenticatedUserSession(array $authUser, ?string $authMethod = null): bool {
    $authUserId = (int)($authUser['id'] ?? 0);
    if ($authUserId <= 0) {
        return false;
    }

    setAuthenticatedIdentity($authUser, $authMethod);

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

function validateActiveAccountAccess(): bool {
    $authUserId = (int)getAuthenticatedUserId();
    $activeUserId = (int)getCurrentUserId();

    if ($authUserId <= 0 || $activeUserId <= 0) {
        return false;
    }

    if ($authUserId === $activeUserId) {
        return true;
    }

    require_once __DIR__ . '/users/db_master.php';
    if (canUserAccessAccount($authUserId, $activeUserId)) {
        return true;
    }

    unset($_SESSION['user_id'], $_SESSION['user']);
    $_SESSION['account_selection_required'] = true;
    return false;
}

function isAuthenticated() {
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
                if (time() - $timestamp < REMEMBER_ME_DURATION) {
                    require_once __DIR__ . '/users/db_master.php';
                    $user = getUserProfileById((int)$userId);
                    
                    if ($user && $user['active'] && $user['username'] === $username) {
                        $secretToUse = getRememberMeSecret($user);
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
                // Legacy format: username:timestamp:hash (single-user mode before multi-user migration)
                // These cookies are from before the multi-user migration and don't contain a user_id.
                // We need to check if a migration has occurred and invalidate these old cookies.
                list($username, $timestamp, $hash) = $parts;
                
                // Check if migration has occurred by looking for migration_timestamp in global_settings
                $migrationTimestamp = null;
                try {
                    require_once __DIR__ . '/users/db_master.php';
                    $migrationTimestamp = getGlobalSetting('migration_timestamp');
                } catch (Exception $e) {
                    // Ignore errors, proceed without migration check
                }
                
                // If migration occurred and cookie was created before migration, invalidate it
                // This forces the user to re-login and select their profile
                if ($migrationTimestamp !== null && (int)$timestamp < (int)$migrationTimestamp) {
                    // Cookie was created before migration, invalidate it
                    setRememberMeCookie('', time() - 3600);
                    error_log("Poznote: Invalidated pre-migration remember-me cookie");
                    return false;
                }
                
                // If no migration or cookie was created after (shouldn't happen for legacy format),
                // validate normally but auto-select the first user profile
                $fallbackUsername = getAuthConfig('POZNOTE_USERNAME', 'admin');
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === $fallbackUsername &&
                    $hash === hash('sha256', $username . $timestamp . AUTH_PASSWORD)) {
                    
                    // For legacy cookies, we need to associate with a user profile
                    // Auto-select the first active user (typically the migrated admin user)
                    require_once __DIR__ . '/users/db_master.php';
                    $profiles = getAllUserProfiles();
                    if (!empty($profiles)) {
                        $firstUser = $profiles[0];
                        $firstUser = getUserProfileById((int)$firstUser['id']) ?: $firstUser;
                        $activeAccountSelected = startAuthenticatedUserSession($firstUser);
                        updateUserLastLogin((int)$firstUser['id']);
                        
                        // Upgrade the cookie to the new format with user_id
                        $newTimestamp = time();
                        $secretToUse = getRememberMeSecret($firstUser);
                        $newToken = buildRememberMeToken($username, (int)$firstUser['id'], $newTimestamp, $secretToUse);
                        setRememberMeCookie($newToken, time() + REMEMBER_ME_DURATION);
                        
                        return $activeAccountSelected;
                    }
                    
                    // Fallback if no profiles exist (shouldn't happen)
                    return false;
                }
            }
        }
        // Invalid token, remove it
        setRememberMeCookie('', time() - 3600);
    }
    
    return false;
}

function normalizePublicWorkspaceName(string $workspaceName): string {
    $workspaceName = trim($workspaceName);
    if ($workspaceName === '') {
        return '';
    }

    return function_exists('mb_strtolower')
        ? mb_strtolower($workspaceName, 'UTF-8')
        : strtolower($workspaceName);
}

function buildPublicWorkspaceRegistryKey(string $workspaceName): string {
    $normalizedWorkspaceName = normalizePublicWorkspaceName($workspaceName);
    return $normalizedWorkspaceName !== '' ? 'workspace:' . $normalizedWorkspaceName : '';
}

function getPublicWorkspaceAccess(): ?array {
    $access = $_SESSION['public_workspace_access'] ?? null;
    if (!is_array($access)) {
        return null;
    }

    $workspaceName = trim((string)($access['workspace_name'] ?? ''));
    $userId = isset($access['user_id']) ? (int)$access['user_id'] : 0;
    if ($workspaceName === '' || $userId <= 0) {
        unset($_SESSION['public_workspace_access']);
        return null;
    }

    $access['workspace_name'] = $workspaceName;
    $access['user_id'] = $userId;
    $access['target_id'] = isset($access['target_id']) ? (int)$access['target_id'] : 0;
    $access['registry_key'] = trim((string)($access['registry_key'] ?? buildPublicWorkspaceRegistryKey($workspaceName)));
    $access['viewer_user_id'] = isset($access['viewer_user_id']) ? max(0, (int)$access['viewer_user_id']) : 0;
    return $access;
}

function getPublicWorkspaceName(): ?string {
    $access = getPublicWorkspaceAccess();
    return $access['workspace_name'] ?? null;
}

function isPublicWorkspaceAccessActive(): bool {
    return getPublicWorkspaceAccess() !== null;
}

function getRequestedWorkspaceNameForPublicAccess(): string {
    if (isset($_GET['workspace']) && is_string($_GET['workspace']) && trim($_GET['workspace']) !== '') {
        return trim($_GET['workspace']);
    }

    if (isset($_POST['workspace']) && is_string($_POST['workspace']) && trim($_POST['workspace']) !== '') {
        return trim($_POST['workspace']);
    }

    $workspaceName = getPublicWorkspaceName();
    return $workspaceName !== null ? $workspaceName : '';
}

function resolvePublicWorkspaceAccess(string $workspaceName): ?array {
    $registryKey = buildPublicWorkspaceRegistryKey($workspaceName);
    if ($registryKey === '') {
        return null;
    }

    require_once __DIR__ . '/users/db_master.php';
    require_once __DIR__ . '/users/UserDataManager.php';

    try {
        $masterCon = getMasterConnection();
        $stmt = $masterCon->prepare("SELECT user_id, target_id FROM shared_links WHERE token = ? AND target_type = 'workspace' LIMIT 1");
        $stmt->execute([$registryKey]);
        $registryRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$registryRow) {
            return null;
        }

        $userId = (int)$registryRow['user_id'];
        $targetId = (int)$registryRow['target_id'];
        if ($userId <= 0 || $targetId <= 0) {
            return null;
        }

        $user = getUserProfileById($userId);
        if (!$user || !(bool)($user['active'] ?? false)) {
            return null;
        }

        $userDataManager = new UserDataManager($userId);
        $dbPath = $userDataManager->getUserDatabasePath();
        if (!is_file($dbPath)) {
            return null;
        }

        $userCon = new PDO('sqlite:' . $dbPath);
        $userCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $userCon->exec('PRAGMA busy_timeout = 5000');

        $stmt = $userCon->prepare('SELECT * FROM shared_workspaces WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $sharedWorkspace = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedWorkspace) {
            return null;
        }

        $resolvedWorkspaceName = trim((string)($sharedWorkspace['workspace_name'] ?? ''));
        if ($resolvedWorkspaceName === '' || normalizePublicWorkspaceName($resolvedWorkspaceName) !== normalizePublicWorkspaceName($workspaceName)) {
            return null;
        }

        $stmt = $userCon->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
        $stmt->execute([$resolvedWorkspaceName]);
        if ((int)$stmt->fetchColumn() === 0) {
            return null;
        }

        return [
            'user_id' => $userId,
            'username' => (string)($user['username'] ?? ''),
            'workspace_name' => $resolvedWorkspaceName,
            'target_id' => $targetId,
            'registry_key' => $registryKey,
            'password' => $sharedWorkspace['password'] ?? null,
            'login_required' => !empty($sharedWorkspace['login_required']),
            'allowed_users' => $sharedWorkspace['allowed_users'] ?? null,
        ];
    } catch (Exception $e) {
        error_log('Poznote public workspace access failed: ' . $e->getMessage());
        return null;
    }
}

function isExplicitPublicWorkspaceRequest(): bool {
    $value = $_GET['public_workspace'] ?? $_POST['public_workspace'] ?? null;
    return is_string($value) && in_array(strtolower(trim($value)), ['1', 'true', 'yes'], true);
}

function isRealUserAuthenticated(): bool {
    if (!isAuthenticated()) {
        return false;
    }

    if (($_SESSION['auth_method'] ?? '') === 'public_workspace') {
        return false;
    }

    $user = $_SESSION['user'] ?? null;
    return !(is_array($user) && !empty($user['_public_workspace']));
}

function clearPublicWorkspaceAuthentication(): void {
    $user = $_SESSION['user'] ?? null;
    $isPublicWorkspaceAuth = ($_SESSION['auth_method'] ?? '') === 'public_workspace'
        || (is_array($user) && !empty($user['_public_workspace']));

    unset($_SESSION['public_workspace_access']);

    if (!$isPublicWorkspaceAuth) {
        unset($_SESSION['public_workspace_original_auth']);
        return;
    }

    $originalAuth = $_SESSION['public_workspace_original_auth'] ?? null;
    unset($_SESSION['public_workspace_original_auth']);

    if (is_array($originalAuth) && !empty($originalAuth['authenticated']) && isset($originalAuth['user_id'], $originalAuth['user']) && is_array($originalAuth['user'])) {
        $_SESSION['authenticated'] = true;
        $_SESSION['user_id'] = (int)$originalAuth['user_id'];
        $_SESSION['user'] = $originalAuth['user'];

        if (isset($originalAuth['login_user_id'], $originalAuth['login_user']) && is_array($originalAuth['login_user'])) {
            $_SESSION['login_user_id'] = (int)$originalAuth['login_user_id'];
            $_SESSION['login_user'] = $originalAuth['login_user'];
        } else {
            $_SESSION['login_user_id'] = (int)$originalAuth['user_id'];
            $_SESSION['login_user'] = $originalAuth['user'];
        }

        if (array_key_exists('auth_method', $originalAuth)) {
            if ($originalAuth['auth_method'] === null || $originalAuth['auth_method'] === '') {
                unset($_SESSION['auth_method']);
            } else {
                $_SESSION['auth_method'] = (string)$originalAuth['auth_method'];
            }
        }

        if (!empty($originalAuth['extra_session_keys']) && is_array($originalAuth['extra_session_keys'])) {
            foreach ($originalAuth['extra_session_keys'] as $sessionKey => $sessionValue) {
                $_SESSION[$sessionKey] = $sessionValue;
            }
        }

        return;
    }

    unset($_SESSION['authenticated'], $_SESSION['user_id'], $_SESSION['user'], $_SESSION['login_user_id'], $_SESSION['login_user'], $_SESSION['auth_method'], $_SESSION['account_selection_required']);
}

function storeOriginalAuthForPublicWorkspace(): void {
    if (!isRealUserAuthenticated() || isset($_SESSION['public_workspace_original_auth'])) {
        return;
    }

    $extraSessionKeys = [];
    foreach ($_SESSION as $sessionKey => $sessionValue) {
        if (strpos((string)$sessionKey, 'oidc_') === 0) {
            $extraSessionKeys[$sessionKey] = $sessionValue;
        }
    }

    $_SESSION['public_workspace_original_auth'] = [
        'authenticated' => true,
        'user_id' => (int)($_SESSION['user_id'] ?? 0),
        'user' => is_array($_SESSION['user'] ?? null) ? $_SESSION['user'] : [],
        'login_user_id' => (int)($_SESSION['login_user_id'] ?? ($_SESSION['user_id'] ?? 0)),
        'login_user' => is_array($_SESSION['login_user'] ?? null) ? $_SESSION['login_user'] : (is_array($_SESSION['user'] ?? null) ? $_SESSION['user'] : []),
        'auth_method' => $_SESSION['auth_method'] ?? null,
        'extra_session_keys' => $extraSessionKeys,
    ];
}

function hasStoredOriginalAuthForPublicWorkspace(): bool {
    $originalAuth = $_SESSION['public_workspace_original_auth'] ?? null;
    return is_array($originalAuth)
        && !empty($originalAuth['authenticated'])
        && isset($originalAuth['user_id'], $originalAuth['user'])
        && (int)$originalAuth['user_id'] > 0
        && is_array($originalAuth['user'])
        && !empty($originalAuth['user']);
}

function getPublicWorkspaceViewerUserId(): int {
    if (isRealUserAuthenticated()) {
        return max(0, (int)getAuthenticatedUserId());
    }

    $access = getPublicWorkspaceAccess();
    return $access !== null ? max(0, (int)($access['viewer_user_id'] ?? 0)) : 0;
}

function getCurrentRelativeRequestUri(): string {
    $requestUri = (string)($_SERVER['REQUEST_URI'] ?? 'index.php');
    if ($requestUri === '' || preg_match('#^[a-zA-Z][a-zA-Z0-9+.-]*://#', $requestUri) || str_starts_with($requestUri, '//')) {
        return 'index.php';
    }

    return $requestUri;
}

function getPublicWorkspacePasswordSessionKey(array $workspaceAccess): string {
    $registryKey = (string)($workspaceAccess['registry_key'] ?? '');
    return 'public_workspace_auth_' . hash('sha256', $registryKey);
}

function getPublicWorkspaceBasePath(): string {
    $scriptName = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $scriptDir = str_replace('\\', '/', dirname($scriptName));
    if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
        return '';
    }

    return rtrim($scriptDir, '/');
}

function buildPublicWorkspacePath(string $workspaceName): string {
    return getPublicWorkspaceBasePath() . '/' . rawurlencode(normalizePublicWorkspaceName($workspaceName));
}

function buildExplicitPublicWorkspaceUrl(string $workspaceName): string {
    return buildPublicWorkspacePath($workspaceName);
}

function decodePublicWorkspaceAllowedUsers($allowedUsersRaw): array {
    if (empty($allowedUsersRaw)) {
        return [];
    }

    $decoded = is_array($allowedUsersRaw) ? $allowedUsersRaw : json_decode((string)$allowedUsersRaw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map('intval', $decoded), function ($id) {
        return $id > 0;
    })));
}

function loadPublicWorkspacePageHelpers(): string {
    if (!function_exists('t_h')) {
        require_once __DIR__ . '/functions.php';
    }
    if (!function_exists('renderPublicStatusPage')) {
        require_once __DIR__ . '/public_helpers.php';
    }

    return function_exists('getUserLanguage') ? getUserLanguage() : 'en';
}

function renderPublicWorkspaceLoginRequiredPage(array $workspaceAccess): void {
    $currentLang = loadPublicWorkspacePageHelpers();
    $redirect = getCurrentRelativeRequestUri();
    if (empty($_SERVER['POZNOTE_PUBLIC_WORKSPACE_SLUG']) && strpos($redirect, 'public_workspace=') === false) {
        $redirect .= (strpos($redirect, '?') === false ? '?' : '&') . 'public_workspace=1';
    }
    $_SESSION['post_login_redirect'] = $redirect;

    if (!isRealUserAuthenticated()) {
        clearPublicWorkspaceAuthentication();
    }

    renderPublicStatusPage($currentLang, [
        'status' => 403,
        'title' => t_h('public.login_required_title', [], 'Login Required', $currentLang),
        'message' => t_h('public.login_required_message', [], 'This content is restricted to specific users. Please log in to access it.', $currentLang),
        'actions' => [
            [
                'href' => '/login.php?redirect=' . rawurlencode($redirect),
                'label' => t_h('common.login.button', [], 'Log in', $currentLang),
            ],
        ],
    ]);
}

function renderPublicWorkspaceAccessDeniedPage(array $workspaceAccess = []): void {
    $currentLang = loadPublicWorkspacePageHelpers();

    renderPublicStatusPage($currentLang, [
        'status' => 403,
        'title' => t_h('public.access_denied_title', [], 'Access Denied', $currentLang),
        'message' => t_h('public.access_denied_message', [], 'You do not have permission to view this content.', $currentLang),
        'actions' => [
            [
                'href' => '/index.php',
                'label' => t_h('common.back_to_home', [], 'Dashboard', $currentLang),
            ],
        ],
    ]);
}

function renderPublicWorkspacePasswordPage(array $workspaceAccess, bool $passwordError = false): void {
    $currentLang = loadPublicWorkspacePageHelpers();
    $stylesheetHref = getVersionedPublicAppAssetHref('css/public_folder.css');
    $themeInitHref = getVersionedPublicAppAssetHref('js/theme-init.js');
    $workspaceName = (string)($workspaceAccess['workspace_name'] ?? '');
    ?>
    <!doctype html>
    <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <title><?php echo t_h('public.protection.title', [], 'Password Protected', $currentLang); ?></title>
        <script src="<?php echo htmlspecialchars($themeInitHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
        <link rel="stylesheet" href="<?php echo htmlspecialchars($stylesheetHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    </head>
    <body class="password-page-body">
        <div class="password-container">
            <h2><?php echo t_h('public.protection.workspace_heading', [], 'Password Protected Workspace', $currentLang); ?></h2>
            <?php if ($passwordError): ?>
                <div class="error"><?php echo t_h('public.protection.error_incorrect', [], 'Incorrect password. Please try again.', $currentLang); ?></div>
            <?php endif; ?>
            <form method="POST" class="password-form">
                <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspaceName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
                <input type="hidden" name="public_workspace" value="1">
                <input type="password" name="workspace_password" placeholder="<?php echo t_h('public.protection.placeholder', [], 'Enter password', $currentLang); ?>" required autofocus>
                <button type="submit"><?php echo t_h('public.protection.unlock', [], 'Unlock', $currentLang); ?></button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

function authorizePublicWorkspaceRequest(array $workspaceAccess, ?int $viewerUserId = null): bool {
    $allowedUserIds = decodePublicWorkspaceAllowedUsers($workspaceAccess['allowed_users'] ?? null);
    $loginRequired = !empty($workspaceAccess['login_required']) || !empty($allowedUserIds);

    if (!$loginRequired) {
        return false;
    }

    $viewerUserId = $viewerUserId !== null ? max(0, $viewerUserId) : getPublicWorkspaceViewerUserId();
    if ($viewerUserId <= 0) {
        renderPublicWorkspaceLoginRequiredPage($workspaceAccess);
    }

    $ownerId = (int)($workspaceAccess['user_id'] ?? 0);
    if (!empty($allowedUserIds) && $viewerUserId !== $ownerId && !in_array($viewerUserId, $allowedUserIds, true)) {
        renderPublicWorkspaceAccessDeniedPage($workspaceAccess);
    }

    return true;
}

function getPublicWorkspacePasswordProof(array $workspaceAccess): string {
    return hash('sha256', (string)($workspaceAccess['password'] ?? ''));
}

function enforcePublicWorkspacePassword(array $workspaceAccess, bool $passedUserRestriction): void {
    $storedPassword = (string)($workspaceAccess['password'] ?? '');
    if ($storedPassword === '' || $passedUserRestriction) {
        return;
    }

    $sessionKey = getPublicWorkspacePasswordSessionKey($workspaceAccess);
    $passwordError = false;
    $workspaceName = trim((string)($workspaceAccess['workspace_name'] ?? ''));

    if (isset($_POST['workspace_password'])) {
        $submittedPassword = (string)$_POST['workspace_password'];
        if (password_verify($submittedPassword, $storedPassword)) {
            $_SESSION[$sessionKey] = getPublicWorkspacePasswordProof($workspaceAccess);
            if ($workspaceName !== '') {
                header('Location: ' . buildExplicitPublicWorkspaceUrl($workspaceName));
                exit;
            }
        } else {
            $passwordError = true;
        }
    }

    $passwordProof = $_SESSION[$sessionKey] ?? null;
    if (!is_string($passwordProof) || !hash_equals(getPublicWorkspacePasswordProof($workspaceAccess), $passwordProof)) {
        renderPublicWorkspacePasswordPage($workspaceAccess, $passwordError);
    }
}

function activatePublicWorkspaceAccess(array $workspaceAccess, int $viewerUserId = 0): void {
    $userId = (int)($workspaceAccess['user_id'] ?? 0);
    $workspaceName = trim((string)($workspaceAccess['workspace_name'] ?? ''));
    if ($userId <= 0 || $workspaceName === '') {
        return;
    }

    storeOriginalAuthForPublicWorkspace();

    if ($viewerUserId <= 0 && isRealUserAuthenticated()) {
        $viewerUserId = max(0, (int)getAuthenticatedUserId());
    }

    $_SESSION['authenticated'] = true;
    $_SESSION['user_id'] = $userId;
    $_SESSION['user'] = [
        'id' => $userId,
        'username' => (string)($workspaceAccess['username'] ?? ''),
        'is_admin' => false,
        '_public_workspace' => true,
    ];
    $_SESSION['login_user_id'] = $userId;
    $_SESSION['login_user'] = $_SESSION['user'];
    $_SESSION['auth_method'] = 'public_workspace';
    unset($_SESSION['account_selection_required']);
    $_SESSION['public_workspace_access'] = [
        'user_id' => $userId,
        'workspace_name' => $workspaceName,
        'target_id' => (int)($workspaceAccess['target_id'] ?? 0),
        'registry_key' => (string)($workspaceAccess['registry_key'] ?? ''),
        'viewer_user_id' => max(0, $viewerUserId),
        'activated_at' => time(),
    ];
}

function maybeAuthenticatePublicWorkspaceRequest(): bool {
    $activeAccess = getPublicWorkspaceAccess();
    $explicitPublicWorkspaceRequest = isExplicitPublicWorkspaceRequest();

    if ($activeAccess !== null && !$explicitPublicWorkspaceRequest) {
        if (hasStoredOriginalAuthForPublicWorkspace()) {
            clearPublicWorkspaceAuthentication();
            return false;
        }

        $workspaceAccess = resolvePublicWorkspaceAccess((string)$activeAccess['workspace_name']);
        if ($workspaceAccess === null) {
            clearPublicWorkspaceAuthentication();
            return false;
        }

        $viewerUserId = max(0, (int)($activeAccess['viewer_user_id'] ?? 0));
        $passedUserRestriction = authorizePublicWorkspaceRequest($workspaceAccess, $viewerUserId);
        enforcePublicWorkspacePassword($workspaceAccess, $passedUserRestriction);

        activatePublicWorkspaceAccess($workspaceAccess, $viewerUserId);
        return true;
    }

    $alreadyAuthenticated = isAuthenticated();
    if ($alreadyAuthenticated && !$explicitPublicWorkspaceRequest) {
        return false;
    }

    $workspaceName = getRequestedWorkspaceNameForPublicAccess();
    if ($workspaceName === '') {
        return false;
    }

    $workspaceAccess = resolvePublicWorkspaceAccess($workspaceName);
    if ($workspaceAccess === null) {
        if ($activeAccess !== null) {
            clearPublicWorkspaceAuthentication();
        }
        return false;
    }

    $viewerUserId = getPublicWorkspaceViewerUserId();
    $passedUserRestriction = authorizePublicWorkspaceRequest($workspaceAccess, $viewerUserId);
    enforcePublicWorkspacePassword($workspaceAccess, $passedUserRestriction);

    activatePublicWorkspaceAccess($workspaceAccess, $viewerUserId);
    return true;
}

function getPublicWorkspaceRedirectUrl(): string {
    $workspaceName = getPublicWorkspaceName();
    if ($workspaceName === null || $workspaceName === '') {
        return 'index.php';
    }

    return buildExplicitPublicWorkspaceUrl($workspaceName);
}

function denyPublicWorkspaceAccessResponse(string $message, int $code = 403): void {
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
        $v = urlencode(trim($v));
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
                .error-message { color: var(--password-muted, #666666); margin-bottom: 30px; line-height: 1.5; }
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

function denyPublicWorkspaceWriteAccess(string $message = 'This public workspace is read-only'): void {
    if (!isPublicWorkspaceAccessActive()) {
        return;
    }

    denyPublicWorkspaceAccessResponse($message, 403);
}

function enforcePublicWorkspaceRequestAccess(): void {
    if (!isPublicWorkspaceAccessActive()) {
        return;
    }

    $requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($requestMethod, ['GET', 'HEAD', 'OPTIONS'], true)) {
        denyPublicWorkspaceWriteAccess();
    }

    $scriptName = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $restrictedScripts = [
        '/home.php',
        '/favorites.php',
        '/notes_manager.php',
        '/trash.php',
        '/settings.php',
        '/workspaces.php',
        '/create.php',
        '/shared.php',
        '/backup_export.php',
        '/restore_import.php',
        '/git_sync.php',
        '/excalidraw_editor.php',
        '/markdown_syntax.php',
    ];

    foreach ($restrictedScripts as $restrictedScript) {
        if ($scriptName === $restrictedScript || str_ends_with($scriptName, $restrictedScript)) {
            header('Location: ' . getPublicWorkspaceRedirectUrl());
            exit;
        }
    }

    if (strpos($scriptName, '/admin/') !== false) {
        header('Location: ' . getPublicWorkspaceRedirectUrl());
        exit;
    }
}

/**
 * Authenticate with username/password
 */
function authenticate($username, $password, $rememberMe = false) {
    require_once __DIR__ . '/users/db_master.php';

    // 1. Find user profile by their own username or email
    $user = getUserProfileByUsername($username);
    
    // If not found by username, try by email
    if (!$user) {
        $user = getUserProfileByEmail($username);
    }
    
    if (!$user || !$user['active']) {
        error_log("Poznote Auth: Login failed - User/Email '$username' not found or inactive");
        return false;
    }

    $userId = (int)$user['id'];
    $isProfileAdmin = (bool)$user['is_admin'];

    // 2. Validate password: DB hash takes priority, then env var fallback
    $authenticated = verifyUserPassword($userId, $password);
    if (!$authenticated) {
        $role = $isProfileAdmin ? 'Admin' : 'User';
        error_log("Poznote Auth: $role password mismatch for user '$username'");
    }

    if ($authenticated) {
        startAuthenticatedUserSession($user);
        updateUserLastLogin($userId);

        // Set remember me cookie if requested
        if ($rememberMe) {
            $timestamp = time();
            $actualUsername = $user['username'];
            $secretToUse = getRememberMeSecret($user);
            
            // Format: actual_username:user_id:timestamp:hash
            $token = buildRememberMeToken($actualUsername, (int)$userId, $timestamp, $secretToUse);
            setRememberMeCookie($token, time() + REMEMBER_ME_DURATION);
        }

        return true;
    }

    return false;
}

function logout() {
    $oidcLogoutUrl = null;
    if (isset($_SESSION['auth_method']) && $_SESSION['auth_method'] === 'oidc') {
        $oidcPath = __DIR__ . '/oidc.php';
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

    if (is_string($oidcLogoutUrl) && $oidcLogoutUrl !== '') {
        header('Location: ' . $oidcLogoutUrl);
        exit;
    }

    header('Location: login.php');
    exit;
}

function requireAuth() {
    if (maybeAuthenticatePublicWorkspaceRequest()) {
        enforcePublicWorkspaceRequestAccess();
        return;
    }

    if (!isAuthenticated()) {
        header('Location: ' . (isAccountSelectionRequired() ? 'login.php?select_account=1' : 'login.php'));
        exit;
    }

    enforcePublicWorkspaceRequestAccess();
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

    $oidcPath = __DIR__ . '/oidc.php';
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
        header('HTTP/1.1 401 Unauthorized');
        if (!$basicAuthDisabled) {
            header('WWW-Authenticate: Basic realm="Poznote API"');
        }
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
    
    if ($basicAuthDisabled) {
        $msg = api_t('auth.api.basic_auth_disabled', [], 'Basic authentication is disabled');
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $loginIdentifier = $basicCredentials['username'];
    $authUser = ctype_digit($loginIdentifier)
        ? getUserProfileById((int)$loginIdentifier)
        : getUserProfileByUsername($loginIdentifier);
    
    if (!$authUser || !$authUser['active'] || ($requireAdmin && !(bool)$authUser['is_admin']) || !verifyUserPassword((int)$authUser['id'], $basicCredentials['password'])) {
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }

    $authUser['_api_auth_method'] = 'basic';
    
    return $authUser;
}

function requireApiAuth() {
    // For API endpoints, check session first
    if (isAuthenticated()) {
        if (isPublicWorkspaceAccessActive()) {
            $requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
            if (!in_array($requestMethod, ['GET', 'HEAD', 'OPTIONS'], true)) {
                denyPublicWorkspaceWriteAccess();
            }
        }
        return;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $authUser = getApiAuthenticatedUser();
    $isAdminCreds = (bool)$authUser['is_admin'];
    
    // For Basic Auth, require X-User-ID header to specify which user profile to use
    // This is needed because with multi-user, each user has their own data
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    if ($userId === null && ($authUser['_api_auth_method'] ?? '') === 'oidc_jwt') {
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
    // For API endpoints, check session first
    if (isAuthenticated()) {
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
function requireActiveAccountOwner(string $message = 'Settings are only available for your own account'): void {
    requireAuth();

    if (isActiveAccountOwnedByAuthenticatedUser()) {
        return;
    }

    denyPublicWorkspaceAccessResponse($message, 403);
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
    // For API endpoints, check session first
    if (isAuthenticated()) {
        if (isPublicWorkspaceAccessActive()) {
            denyPublicWorkspaceAccessResponse('This endpoint is not available in public workspace mode', 403);
        }
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
