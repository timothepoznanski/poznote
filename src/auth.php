<?php
/**
 * Authentication Module
 * 
 * In multi-user mode:
 * - Single global password (AUTH_USERNAME / AUTH_PASSWORD)
 * - Multiple user profiles, each with their own data space
 * - User selects their profile on login page
 */

// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

session_start();

// Load config first
require_once __DIR__ . '/config.php';

// Ensure multi-user migration runs on first access (before any auth checks)
require_once __DIR__ . '/auto_migrate.php';

// Simple .env parser fallback for new variables if not loaded by server
// This ensures POZNOTE_USERNAME_USER is available even if server wasn't restarted
$envPath = dirname(__DIR__) . '/.env';
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            // Remove quotes if present
            $value = trim($value, '"\'');
            if (!isset($_ENV[$key])) {
                $_ENV[$key] = $value;
                putenv("$key=$value");
            }
        }
    }
}

// Authentication configuration - single global password
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
define("AUTH_PASSWORD", $_ENV['POZNOTE_PASSWORD'] ?? 'admin123');
define("AUTH_USER_USERNAME", $_ENV['POZNOTE_USERNAME_USER'] ?? 'user');
define("AUTH_USER_PASSWORD", $_ENV['POZNOTE_PASSWORD_USER'] ?? 'user123');

// Remember me cookie settings
define("REMEMBER_ME_COOKIE", 'poznote_remember_' . ($configured_port ?? '8040'));
define("REMEMBER_ME_DURATION", 30 * 24 * 60 * 60); // 30 days

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
                    // Check signature with both possible passwords
                
                    // Case 1: Admin Password
                    if ($username === AUTH_USERNAME && 
                        $hash === hash('sha256', $username . $userId . $timestamp . AUTH_PASSWORD)) {
                         // Valid Admin session? Check if user is actually admin
                         require_once __DIR__ . '/users/db_master.php';
                         $user = getUserProfileById((int)$userId);
                         if ($user && $user['active'] && $user['is_admin']) { // Admin must be admin
                            $_SESSION['authenticated'] = true;
                            $_SESSION['user_id'] = (int)$userId;
                            $_SESSION['user'] = $user;
                            updateUserLastLogin((int)$userId);
                            return true;
                         }
                    }
                    
                    // Case 2: User Password
                    if ($username === AUTH_USER_USERNAME && 
                        $hash === hash('sha256', $username . $userId . $timestamp . AUTH_USER_PASSWORD)) {
                         // Valid User session? Check if user is NOT admin (or allowed?)
                         // Assuming strictly separate: User creds for non-admin only
                         require_once __DIR__ . '/users/db_master.php';
                         $user = getUserProfileById((int)$userId);
                         if ($user && $user['active'] && !$user['is_admin']) { 
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
                    setcookie(REMEMBER_ME_COOKIE, '', time() - 3600, '/', '', false, true);
                    error_log("Poznote: Invalidated pre-migration remember-me cookie");
                    return false;
                }
                
                // If no migration or cookie was created after (shouldn't happen for legacy format),
                // validate normally but auto-select the first user profile
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === AUTH_USERNAME &&
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
                        setcookie(REMEMBER_ME_COOKIE, $newToken, time() + REMEMBER_ME_DURATION, '/', '', false, true);
                        
                        return true;
                    }
                    
                    // Fallback if no profiles exist (shouldn't happen)
                    $_SESSION['authenticated'] = true;
                    return true;
                }
            }
        }
        // Invalid token, remove it
        setcookie(REMEMBER_ME_COOKIE, '', time() - 3600, '/', '', false, true);
    }
    
    return false;
}

/**
 * Authenticate with username/password and optionally select a user profile
 */
function authenticate($username, $password, $rememberMe = false, $userId = null) {
    require_once __DIR__ . '/users/db_master.php';

    // Verify which credentials were offered
    $isAdminCreds = ($username === AUTH_USERNAME && $password === AUTH_PASSWORD);
    $isUserCreds = ($username === AUTH_USER_USERNAME && $password === AUTH_USER_PASSWORD);

    if (!$isAdminCreds && !$isUserCreds) {
        return false;
    }

    // Determine target user if not specified
    if ($userId === null) {
        $profiles = getAllUserProfiles();
        if (empty($profiles)) {
            // No profiles exist, create a default admin
            // Only allow if using admin creds
            if ($isAdminCreds) {
                $result = createUserProfile('admin');
                if ($result['success']) {
                    $userId = $result['user_id'];
                } else {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            // Try to find a matching profile for the credentials used
            foreach ($profiles as $profile) {
                if ($isAdminCreds && $profile['is_admin']) {
                    $userId = $profile['id'];
                    break;
                }
                if ($isUserCreds && !$profile['is_admin']) {
                    $userId = $profile['id'];
                    break;
                }
            }
            
            // If still no user found (e.g. admin creds used but no admin user exists? unlikely if profiles !empty)
            // But if we have mixed case: admin creds used, but only standard users exist -> fail? Or create new admin?
            // Current system assumes profiles exist.
            if ($userId === null) {
                 return false;
            }
        }
    }

    // Validate if the selected user allows these credentials
    if ($userId !== null) {
        $user = getUserProfileById((int)$userId);
        if (!$user || !$user['active']) {
            $_SESSION['authenticated'] = false;
            unset($_SESSION['user_id'], $_SESSION['user']);
            return false;
        }

        // Check permission: Admin User needs Admin Creds, Regular User needs User Creds
        $isProfileAdmin = (bool)$user['is_admin'];
        if ($isProfileAdmin) {
            if (!$isAdminCreds) { // Admin profile requires Admin credentials
                return false;
            }
        } else {
             if (!$isUserCreds) { // Regular profile requires User credentials
                 // Wait, can Admin Creds log in as Regular User? 
                 // The requirement: "Le POZNOTE_USERNAME et le POZNOTE_PASSWORD doivent rester les credentials des comptes qui son admin."
                 // "Quand on passe un profil en admin, il devra utiliser ces credentials pour ce connecter."
                 // It doesn't explicitly say Admin creds CANNOT login as user. But "Separation" implies it.
                 // Usually admin credentials are for admin accounts.
                 // IF I am an admin, I log in to MY ADMIN ACCOUNT.
                 // IF I use admin creds to log into a user account, is that allowed?
                 // The prompt says: "POZNOTE_USERNAME/PASSWORD must remain credentials for accounts THAT ARE ADMIN."
                 // It implies a 1-to-1 mapping between Credential Type and Account Type.
                 // So: Admin Creds -> Admin Account. User Creds -> User Account.
                 return false;
             }
        }

        $_SESSION['authenticated'] = true;
        $_SESSION['user_id'] = (int)$userId;
        $_SESSION['user'] = $user;
        updateUserLastLogin((int)$userId); // Ensure this function exists in users/db_master.php

        // Set remember me cookie if requested
        if ($rememberMe) {
            $timestamp = time();
            // Include user_id in token
            // We use the credential set that was used to login? No, hash uses AUTH_PASSWORD constant usually.
            // We should use the password corresponding to the user type to generate the hash, 
            // OR just stick to one internal secret? 
            // The existing check uses AUTH_PASSWORD in `isAuthenticated`.
            // We need to update `isAuthenticated` too!
            
            $secretToUse = $isProfileAdmin ? AUTH_PASSWORD : AUTH_USER_PASSWORD;
            
            $hash = hash('sha256', $username . $userId . $timestamp . $secretToUse);
            $token = base64_encode($username . ':' . $userId . ':' . $timestamp . ':' . $hash);
            setcookie(REMEMBER_ME_COOKIE, $token, time() + REMEMBER_ME_DURATION, '/', '', false, true);
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
        setcookie(REMEMBER_ME_COOKIE, '', time() - 3600, '/', '', false, true);
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

function requireApiAuth() {
    // For API endpoints, check session first
    if (isAuthenticated()) {
        return;
    }
    
    // Check if Basic Auth is disabled
    $basicAuthDisabled = defined('OIDC_DISABLE_BASIC_AUTH') && OIDC_DISABLE_BASIC_AUTH;
    
    // If no session, try HTTP Basic Auth
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
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
    
    // Validate credentials
    $isAdminCreds = ($_SERVER['PHP_AUTH_USER'] === AUTH_USERNAME && $_SERVER['PHP_AUTH_PW'] === AUTH_PASSWORD);
    $isUserCreds = ($_SERVER['PHP_AUTH_USER'] === AUTH_USER_USERNAME && $_SERVER['PHP_AUTH_PW'] === AUTH_USER_PASSWORD);
    
    if (!$isAdminCreds && !$isUserCreds) {
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
    
    // For Basic Auth, require X-User-ID header to specify which user profile to use
    // This is needed because with multi-user, each user has their own data
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    if ($userId === null) {
        header('HTTP/1.1 400 Bad Request');
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'X-User-ID header is required for API authentication',
            'hint' => 'Specify the user profile ID to access. Use GET /api/v1/admin/users to list available profiles.'
        ]);
        exit;
    }
    
    // Validate user ID and load user profile
    require_once __DIR__ . '/users/db_master.php';
    $user = getUserProfileById((int)$userId);
    
    // Check role/credentials match
    if ($user) {
        $isProfileAdmin = (bool)$user['is_admin'];
        if ($isProfileAdmin && !$isAdminCreds) {
            // Admin profile entered but User credentials provided -> Fail
             header('HTTP/1.1 403 Forbidden');
             header('Content-Type: application/json');
             echo json_encode(['error' => 'Admin profile requires admin credentials']);
             exit;
        }
        if (!$isProfileAdmin && !$isUserCreds) {
            // User profile entered but Admin credentials provided
            // Strictly forcing User credentials for User profiles
             header('HTTP/1.1 403 Forbidden');
             header('Content-Type: application/json');
             echo json_encode(['error' => 'User profile requires user credentials']);
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
    $_SESSION['authenticated'] = true;
    $_SESSION['user_id'] = (int)$userId;
    $_SESSION['user'] = [
        'id' => $user['id'],
        'username' => $user['username'],
        'is_admin' => (bool)$user['is_admin']
    ];
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
    
    // Check if Basic Auth is disabled
    $basicAuthDisabled = defined('OIDC_DISABLE_BASIC_AUTH') && OIDC_DISABLE_BASIC_AUTH;
    
    // If no session, try HTTP Basic Auth
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
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
    
    // Validate credentials (API uses global password)
    if ($_SERVER['PHP_AUTH_USER'] !== AUTH_USERNAME || $_SERVER['PHP_AUTH_PW'] !== AUTH_PASSWORD) {
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
    
    // For admin endpoints, we still need a user context for getCurrentUserId() etc.
    // Use X-User-ID if provided, otherwise use the first admin user
    $userId = $_SERVER['HTTP_X_USER_ID'] ?? null;
    
    if ($userId !== null) {
        // Use the specified user
        require_once __DIR__ . '/users/db_master.php';
        $user = getUserProfileById((int)$userId);
        
        if ($user && $user['active']) {
            $_SESSION['authenticated'] = true;
            $_SESSION['user_id'] = (int)$userId;
            $_SESSION['user'] = [
                'id' => $user['id'],
                'username' => $user['username'],
                'is_admin' => (bool)$user['is_admin']
            ];
        }
    } else {
        // No X-User-ID provided, use the first admin user for admin operations
        require_once __DIR__ . '/users/db_master.php';
        $profiles = getAllUserProfiles();
        
        // Find an admin user
        $adminUser = null;
        foreach ($profiles as $profile) {
            if ($profile['is_admin']) {
                $adminUser = getUserProfileById($profile['id']);
                break;
            }
        }
        
        if ($adminUser) {
            $_SESSION['authenticated'] = true;
            $_SESSION['user_id'] = (int)$adminUser['id'];
            $_SESSION['user'] = [
                'id' => $adminUser['id'],
                'username' => $adminUser['username'],
                'is_admin' => true
            ];
        } else if (!empty($profiles)) {
            // Fallback to first user if no admin exists
            $firstUser = getUserProfileById($profiles[0]['id']);
            if ($firstUser) {
                $_SESSION['authenticated'] = true;
                $_SESSION['user_id'] = (int)$firstUser['id'];
                $_SESSION['user'] = [
                    'id' => $firstUser['id'],
                    'username' => $firstUser['username'],
                    'is_admin' => (bool)$firstUser['is_admin']
                ];
            }
        }
    }
}
?>
