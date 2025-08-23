<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "Test started...<br>";

try {
    require 'auth.php';
    echo "auth.php loaded successfully<br>";
    
    require_once 'config.php';
    echo "config.php loaded successfully<br>";
    
    include 'db_connect.php';
    echo "db_connect.php loaded successfully<br>";
    
    echo "SQLITE_DATABASE path: " . SQLITE_DATABASE . "<br>";
    
    // Test database query
    $stmt = $con->prepare("SELECT COUNT(*) FROM notes");
    $stmt->execute();
    $count = $stmt->fetchColumn();
    echo "Notes count: " . $count . "<br>";
    
    echo "Test completed successfully!";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "<br>";
    echo "File: " . $e->getFile() . "<br>";
    echo "Line: " . $e->getLine() . "<br>";
}
?>
