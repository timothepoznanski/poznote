<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

// Test simple sans authentification
header('Content-Type: application/json');

try {
    require_once 'config.php';
    require_once 'db_connect.php';
    
    // Test de connection DB
    $test = $con->query("SELECT 1");
    if (!$test) {
        throw new Exception("Database connection failed");
    }
    
    // Test de la table folders
    $folders = $con->query("SELECT * FROM folders LIMIT 1");
    
    echo json_encode([
        'success' => true,
        'message' => 'Database test successful',
        'folders_table_exists' => $folders !== false,
        'method' => $_SERVER['REQUEST_METHOD'],
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
}
?>
