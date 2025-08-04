<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Testing database_backup.php functionality...\n";

require 'config.php';
include 'db_connect.php';

// Test if we can connect to database
if ($con->ping()) {
    echo "Database connection: OK\n";
} else {
    echo "Database connection: FAILED - " . $con->error . "\n";
    exit(1);
}

// Test if importAttachmentsZip function can be called (syntax check)
if (function_exists('importAttachmentsZip')) {
    echo "importAttachmentsZip function: EXISTS\n";
} else {
    echo "importAttachmentsZip function: NOT FOUND - probably syntax error\n";
}

// Include the file to test for syntax errors
echo "Including database_backup.php...\n";
ob_start();
try {
    include 'database_backup.php';
    echo "Include successful\n";
} catch (Exception $e) {
    echo "Include failed: " . $e->getMessage() . "\n";
} catch (ParseError $e) {
    echo "Parse error: " . $e->getMessage() . "\n";
} catch (Error $e) {
    echo "Fatal error: " . $e->getMessage() . "\n";
}
ob_end_clean();

echo "Test completed\n";
?>
