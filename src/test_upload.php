<?php
require 'auth.php';
requireAuth();

// Test upload configuration and directory permissions
echo "<h2>Poznote Upload Diagnostic Test</h2>";

// Test PHP upload settings
echo "<h3>PHP Upload Configuration:</h3>";
echo "file_uploads: " . (ini_get('file_uploads') ? 'ON' : 'OFF') . "<br>";
echo "upload_max_filesize: " . ini_get('upload_max_filesize') . "<br>";
echo "post_max_size: " . ini_get('post_max_size') . "<br>";
echo "max_file_uploads: " . ini_get('max_file_uploads') . "<br>";
echo "max_input_time: " . ini_get('max_input_time') . "<br>";
echo "max_execution_time: " . ini_get('max_execution_time') . "<br>";
echo "memory_limit: " . ini_get('memory_limit') . "<br>";
echo "upload_tmp_dir: " . (ini_get('upload_tmp_dir') ?: 'System default') . "<br>";

// Test directory permissions
echo "<h3>Directory Permissions:</h3>";
include 'functions.php';

$attachments_dir = 'attachments';
echo "Attachments directory: $attachments_dir<br>";
echo "Directory exists: " . (file_exists($attachments_dir) ? 'YES' : 'NO') . "<br>";
echo "Directory is readable: " . (is_readable($attachments_dir) ? 'YES' : 'NO') . "<br>";
echo "Directory is writable: " . (is_writable($attachments_dir) ? 'YES' : 'NO') . "<br>";

if (file_exists($attachments_dir)) {
    $perms = fileperms($attachments_dir);
    echo "Directory permissions: " . substr(sprintf('%o', $perms), -4) . "<br>";
}

// Test creating a test file
echo "<h3>Write Test:</h3>";
$test_file = $attachments_dir . '/test_write_' . time() . '.txt';
if (file_put_contents($test_file, 'test content')) {
    echo "✅ Successfully created test file: $test_file<br>";
    unlink($test_file);
    echo "✅ Successfully deleted test file<br>";
} else {
    echo "❌ Failed to create test file: $test_file<br>";
}

// Test temp directory
echo "<h3>Temporary Directory:</h3>";
$temp_dir = sys_get_temp_dir();
echo "System temp directory: $temp_dir<br>";
echo "Temp directory writable: " . (is_writable($temp_dir) ? 'YES' : 'NO') . "<br>";

// Test database connection
echo "<h3>Database Connection:</h3>";
try {
    include 'db_connect.php';
    echo "✅ Database connection successful<br>";
} catch (Exception $e) {
    echo "❌ Database connection failed: " . $e->getMessage() . "<br>";
}

echo "<h3>Server Information:</h3>";
echo "Operating System: " . PHP_OS . "<br>";
echo "PHP Version: " . PHP_VERSION . "<br>";
echo "Web Server: " . $_SERVER['SERVER_SOFTWARE'] . "<br>";
echo "Document Root: " . $_SERVER['DOCUMENT_ROOT'] . "<br>";
echo "Current Working Directory: " . getcwd() . "<br>";

if (function_exists('posix_getuid')) {
    echo "Process UID: " . posix_getuid() . "<br>";
    echo "Process GID: " . posix_getgid() . "<br>";
}

// Show recent PHP errors if log file exists
$log_file = '/var/log/php_errors.log';
if (file_exists($log_file) && is_readable($log_file)) {
    echo "<h3>Recent PHP Errors (last 10 lines):</h3>";
    $lines = file($log_file);
    $recent_lines = array_slice($lines, -10);
    echo "<pre>" . htmlspecialchars(implode('', $recent_lines)) . "</pre>";
}
?>
