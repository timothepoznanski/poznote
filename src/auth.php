<?php
// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

session_start();

// Authentication configuration - you can change these values
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
define("AUTH_PASSWORD", $_ENV['POZNOTE_PASSWORD'] ?? 'admin123');
// Authentication configuration

// Remember me cookie settings
define("REMEMBER_ME_COOKIE", 'poznote_remember_' . ($configured_port ?? '8040'));
define("REMEMBER_ME_DURATION", 30 * 24 * 60 * 60); // 30 days

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
                if (time() - $timestamp < REMEMBER_ME_DURATION && 
                    $username === AUTH_USERNAME &&
                    $hash === hash('sha256', $username . $timestamp . AUTH_PASSWORD)) {
                    // Auto-login the user
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

function authenticate($username, $password, $rememberMe = false) {
    if ($username === AUTH_USERNAME && $password === AUTH_PASSWORD) {
        $_SESSION['authenticated'] = true;
        
        // Set remember me cookie if requested
        if ($rememberMe) {
            $timestamp = time();
            $hash = hash('sha256', $username . $timestamp . AUTH_PASSWORD);
            $token = base64_encode($username . ':' . $timestamp . ':' . $hash);
            setcookie(REMEMBER_ME_COOKIE, $token, time() + REMEMBER_ME_DURATION, '/', '', false, true);
        }
        
        return true;
    }
    return false;
}

function logout() {
    session_destroy();
    // Remove remember me cookie
    if (isset($_COOKIE[REMEMBER_ME_COOKIE])) {
        setcookie(REMEMBER_ME_COOKIE, '', time() - 3600, '/', '', false, true);
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
    if (!authenticate($_SERVER['PHP_AUTH_USER'], $_SERVER['PHP_AUTH_PW'])) {
        header('HTTP/1.1 401 Unauthorized');
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Invalid credentials']);
        exit;
    }
}
?>
