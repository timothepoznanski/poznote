<?php
header('Content-Type: application/json');
require_once 'config.php';

// Configure session name based on configured port to allow multiple instances
$configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
$session_name = 'POZNOTE_SESSION_' . $configured_port;
session_name($session_name);

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Get the posted password
$input = json_decode(file_get_contents('php://input'), true);
$password = $input['password'] ?? '';

// Check if password protection is enabled
if (!defined('SETTINGS_PASSWORD') || SETTINGS_PASSWORD === '') {
    echo json_encode(['success' => true]);
    exit;
}

// Verify the password
if ($password === SETTINGS_PASSWORD) {
    $_SESSION['settings_authenticated'] = true;
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Invalid password']);
}
?>