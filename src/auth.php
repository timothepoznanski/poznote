<?php
// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

// Security headers
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'");

// Session configuration
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_samesite', 'Lax');
if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
    ini_set('session.cookie_secure', 1);
}
ini_set('session.use_strict_mode', 1);

session_start();

// Authentication configuration - you can change these values
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
// For backward compatibility: check if password is already hashed
$env_password = $_ENV['POZNOTE_PASSWORD'] ?? 'admin123';
if (strlen($env_password) > 20 && (substr($env_password, 0, 4) === '$2y$' || substr($env_password, 0, 7) === '$argon2')) {
    // Already hashed (bcrypt hashes are 60 chars, argon2 are longer)
    define("AUTH_PASSWORD_HASH", $env_password);
} else {
    // Plain text password - hash it (for backward compatibility)
    define("AUTH_PASSWORD_HASH", password_hash($env_password, PASSWORD_DEFAULT));
}
// Authentication configuration

// Remember me cookie settings
define("REMEMBER_ME_COOKIE", 'poznote_remember_' . ($configured_port ?? '8040'));
define("REMEMBER_ME_DURATION", 30 * 24 * 60 * 60); // 30 days

// Rate limiting settings
define("MAX_LOGIN_ATTEMPTS", 10);
define("LOGIN_LOCKOUT_TIME", 300); // 5 minutes

/**
 * Generate CSRF token
 */
function generateCSRFToken() {
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Validate CSRF token
 */
function validateCSRFToken($token) {
    if (!isset($_SESSION['csrf_token']) || !isset($token)) {
        return false;
    }
    return $_SESSION['csrf_token'] === $token;
}

/**
 * Check and update rate limiting
 */
function checkRateLimit($ip) {
    if (!isset($_SESSION['login_attempts'])) {
        $_SESSION['login_attempts'] = [];
    }
    
    // Clean old attempts
    $_SESSION['login_attempts'] = array_filter(
        $_SESSION['login_attempts'],
        function($timestamp) {
            return (time() - $timestamp) < LOGIN_LOCKOUT_TIME;
        }
    );
    
    // Check if locked out
    if (count($_SESSION['login_attempts']) >= MAX_LOGIN_ATTEMPTS) {
        $oldest_attempt = min($_SESSION['login_attempts']);
        $time_remaining = LOGIN_LOCKOUT_TIME - (time() - $oldest_attempt);
        return [
            'allowed' => false,
            'time_remaining' => ceil($time_remaining / 60) // minutes
        ];
    }
    
    return ['allowed' => true];
}

/**
 * Record failed login attempt
 */
function recordFailedLogin() {
    if (!isset($_SESSION['login_attempts'])) {
        $_SESSION['login_attempts'] = [];
    }
    $_SESSION['login_attempts'][] = time();
}

/**
 * Clear login attempts on successful login
 */
function clearLoginAttempts() {
    unset($_SESSION['login_attempts']);
}

function isAuthenticated() {
    // Check session first
    if (isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true) {
        return true;
    }
    
    // Check remember me cookie
    if (isset($_COOKIE[REMEMBER_ME_COOKIE])) {
        $token = $_COOKIE[REMEMBER_ME_COOKIE];
        // Simple token validation (token format: base64(username:timestamp:hash))
        $decoded = base64_decode($token);
        if ($decoded !== false) {
            $parts = explode(':', $decoded);
            if (count($parts) === 3) {
                list($username, $timestamp, $hash) = $parts;
                // Verify the token hasn't expired and is valid
                $expected_hash = hash('sha256', $username . $timestamp . AUTH_PASSWORD_HASH);
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === AUTH_USERNAME &&
                    $hash === $expected_hash) {
                    // Auto-login the user
                    $_SESSION['authenticated'] = true;
                    // Regenerate session ID
                    session_regenerate_id(true);
                    return true;
                }
            }
        }
        // Invalid token, remove it
        $cookie_secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on');
        setcookie(REMEMBER_ME_COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => '',
            'secure' => $cookie_secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    }
    
    return false;
}

function authenticate($username, $password, $rememberMe = false) {
    // Check rate limit
    $rate_check = checkRateLimit($_SERVER['REMOTE_ADDR']);
    if (!$rate_check['allowed']) {
        return [
            'success' => false,
            'error' => 'Too many failed attempts. Please try again in ' . $rate_check['time_remaining'] . ' minutes.'
        ];
    }
    
    // Validate username and password
    if ($username === AUTH_USERNAME && password_verify($password, AUTH_PASSWORD_HASH)) {
        $_SESSION['authenticated'] = true;
        clearLoginAttempts();
        
        // Regenerate session ID to prevent session fixation
        session_regenerate_id(true);
        
        // Set remember me cookie if requested
        if ($rememberMe) {
            $timestamp = time();
            $hash = hash('sha256', $username . $timestamp . AUTH_PASSWORD_HASH);
            $token = base64_encode($username . ':' . $timestamp . ':' . $hash);
            
            $cookie_secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on');
            
            // Use options array for better compatibility and SameSite support
            setcookie(REMEMBER_ME_COOKIE, $token, [
                'expires' => time() + REMEMBER_ME_DURATION,
                'path' => '/',
                'domain' => '',
                'secure' => $cookie_secure,
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
        
        return ['success' => true];
    }
    
    // Record failed attempt
    recordFailedLogin();
    return [
        'success' => false,
        'error' => 'Incorrect username or password.'
    ];
}

function logout() {
    session_destroy();
    // Remove remember me cookie
    if (isset($_COOKIE[REMEMBER_ME_COOKIE])) {
        $cookie_secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on');
        setcookie(REMEMBER_ME_COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => '',
            'secure' => $cookie_secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
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
    
    // If no session, try HTTP Basic Auth
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW'])) {
        header('HTTP/1.1 401 Unauthorized');
        header('WWW-Authenticate: Basic realm="Poznote API"');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
    
    // Validate credentials
    if ($_SERVER['PHP_AUTH_USER'] !== AUTH_USERNAME || !password_verify($_SERVER['PHP_AUTH_PW'], AUTH_PASSWORD_HASH)) {
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid credentials']);
        exit;
    }
}
?>
