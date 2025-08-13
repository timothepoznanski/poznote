<?php
require_once 'auth.php';

header('Content-Type: application/json');

echo json_encode([
    'authenticated' => isAuthenticated(),
    'session_id' => session_id(),
    'session_name' => session_name(),
    'session_data' => $_SESSION ?? [],
    'configured_port' => $_ENV['HTTP_WEB_PORT'] ?? 'not_set'
]);
?>
