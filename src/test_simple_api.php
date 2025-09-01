<?php
require 'auth.php';

if (!isAuthenticated()) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

header('Content-Type: application/json');

try {
    // Read JSON data
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);
    
    echo json_encode([
        'success' => true,
        'received_json' => $json,
        'parsed_data' => $data,
        'json_error' => json_last_error_msg(),
        'method' => $_SERVER['REQUEST_METHOD']
    ]);
    
} catch (Exception $e) {
    echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
?>
