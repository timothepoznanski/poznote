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

function isAuthenticated() {
    // Check session first
    if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
        return true;
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
                        $expectedHash = hash('sha256', $username . $userId . $timestamp . $secretToUse);
                        
                        if (hash_equals($expectedHash, $hash)) {
                            $_SESSION['authenticated'] = true;
                            $_SESSION['user_id'] = (int)$userId;
                            $_SESSION['user'] = $user;
                            updateUserLastLogin((int)$userId);
                            return true;
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
                        $_SESSION['authenticated'] = true;
                        $_SESSION['user_id'] = (int)$firstUser['id'];
                        $_SESSION['user'] = getUserProfileById((int)$firstUser['id']);
                        updateUserLastLogin((int)$firstUser['id']);
                        
                        // Upgrade the cookie to the new format with user_id
                        $newTimestamp = time();
                        $newHash = hash('sha256', $username . $firstUser['id'] . $newTimestamp . AUTH_PASSWORD);
                        $newToken = base64_encode($username . ':' . $firstUser['id'] . ':' . $newTimestamp . ':' . $newHash);
                        setRememberMeCookie($newToken, time() + REMEMBER_ME_DURATION);
                        
                        return true;
                    }
                    
                    // Fallback if no profiles exist (shouldn't happen)
                    $_SESSION['authenticated'] = true;
                    return true;
                }
            }
        }
        // Invalid token, remove it
        setRememberMeCookie('', time() - 3600);
    }
    
    return false;
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
        $_SESSION['authenticated'] = true;
        $_SESSION['user_id'] = $userId;
        $_SESSION['user'] = $user;
        updateUserLastLogin($userId);

        // Set remember me cookie if requested
        if ($rememberMe) {
            $timestamp = time();
            $actualUsername = $user['username'];
            $secretToUse = getRememberMeSecret($user);
            
            // Format: actual_username:user_id:timestamp:hash
            $hash = hash('sha256', $actualUsername . $userId . $timestamp . $secretToUse);
            $token = base64_encode($actualUsername . ':' . $userId . ':' . $timestamp . ':' . $hash);
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
    if (!isAuthenticated()) {
        header('Location: login.php');
        exit;
    }
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

function setApiAuthenticatedUser(array $user): void {
    $_SESSION['authenticated'] = true;
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['user'] = [
        'id' => $user['id'],
        'username' => $user['username'],
        'is_admin' => (bool) $user['is_admin']
    ];
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
    setApiAuthenticatedUser($user);
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

    setApiAuthenticatedUser($user);
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
 * Check if current user is admin
 */
function isCurrentUserAdmin() {
    $user = getCurrentUser();
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
            setApiAuthenticatedUser($user);
            return;
        }

        header('HTTP/1.1 404 Not Found');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'User profile not found: ' . $userId]);
        exit;
    } else {
        setApiAuthenticatedUser($authUser);
    }
}