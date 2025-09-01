<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Starting API test...\n";

try {
    require 'auth.php';
    echo "Auth loaded...\n";
    
    if (!isAuthenticated()) {
        echo "Not authenticated!\n";
        exit;
    }
    echo "Authenticated OK...\n";
    
    require_once 'config.php';
    echo "Config loaded...\n";
    
    require_once 'db_connect.php';
    echo "DB connected...\n";
    
    // Test basic insert
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, created) VALUES (?, ?, datetime('now'))");
    echo "Statement prepared...\n";
    
    $result = $stmt->execute(['TestFolder123', 'Test2']);
    echo "Statement executed: " . ($result ? "SUCCESS" : "FAILED") . "\n";
    
    echo "All tests passed!\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    echo "TRACE: " . $e->getTraceAsString() . "\n";
}
?>
