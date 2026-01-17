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

// Authentication configuration - single global password
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
define("AUTH_PASSWORD", $_ENV['POZNOTE_PASSWORD'] ?? 'admin123');

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
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === AUTH_USERNAME &&
                    $hash === hash('sha256', $username . $userId . $timestamp . AUTH_PASSWORD)) {
                    // Auto-login the user with their profile
                    $_SESSION['authenticated'] = true;
                    $_SESSION['user_id'] = (int)$userId;
                    
                    // Load user profile
                    require_once __DIR__ . '/users/db_master.php';
                    $user = getUserProfileById((int)$userId);
                    if ($user) {
                        $_SESSION['user'] = $user;
                        updateUserLastLogin((int)$userId);
                    }
                    return true;
                }
            } elseif (count($parts) === 3) {
                // Legacy format: username:timestamp:hash (single-user mode)
                list($username, $timestamp, $hash) = $parts;
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === AUTH_USERNAME &&
                    $hash === hash('sha256', $username . $timestamp . AUTH_PASSWORD)) {
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
    if ($username === AUTH_USERNAME && $password === AUTH_PASSWORD) {
        $_SESSION['authenticated'] = true;
        
        // Set the selected user profile
        require_once __DIR__ . '/users/db_master.php';
        
        // If no userId provided, use the first/default user
        if ($userId === null) {
            $profiles = getAllUserProfiles();
            if (!empty($profiles)) {
                $userId = $profiles[0]['id'];
            } else {
                // No profiles exist, create a default one
                $result = createUserProfile('Admin', 'Administrateur');
                if ($result['success']) {
                    $userId = $result['user_id'];
                }
            }
        }
        
        if ($userId !== null) {
            $user = getUserProfileById((int)$userId);
            if ($user && $user['active']) {
                $_SESSION['user_id'] = (int)$userId;
                $_SESSION['user'] = $user;
                updateUserLastLogin((int)$userId);
            } else {
                // Invalid user, fail authentication
                $_SESSION['authenticated'] = false;
                unset($_SESSION['user_id'], $_SESSION['user']);
                return false;
            }
        }
        
        // Set remember me cookie if requested
        if ($rememberMe && $userId !== null) {
            $timestamp = time();
            // Include user_id in token
            $hash = hash('sha256', $username . $userId . $timestamp . AUTH_PASSWORD);
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
    
    // Validate credentials (API uses global password, not user profiles)
    if ($_SERVER['PHP_AUTH_USER'] !== AUTH_USERNAME || $_SERVER['PHP_AUTH_PW'] !== AUTH_PASSWORD) {
        $msg = api_t('auth.api.invalid_credentials', [], 'Invalid credentials');
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => $msg]);
        exit;
    }
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
?>
