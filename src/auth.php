<?php
// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

session_start();

// Authentication configuration - you can change these values
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
define("AUTH_PASSWORD", $_ENV['POZNOTE_PASSWORD'] ?? 'admin123');

function isAuthenticated() {
    return isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;
}

function authenticate($username, $password) {
    if ($username === AUTH_USERNAME && $password === AUTH_PASSWORD) {
        $_SESSION['authenticated'] = true;
        return true;
    }
    return false;
}

function logout() {
    session_destroy();
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
