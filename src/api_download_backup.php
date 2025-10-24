<?php
/**
 * API Endpoint: Download Backup File
 * 
 * Downloads a specific backup file from the backups directory
 * 
 * Method: GET
 * Parameters: 
 *   - filename: Name of the backup file to download (required)
 * 
 * Response:
 * - Success: ZIP file download
 * - Error: JSON with error message
 */

require_once 'auth.php';
require_once 'config.php';

// Check authentication (session or HTTP Basic Auth)
requireApiAuth();

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use GET.'
    ]);
    exit;
}

// Get filename from query parameter
$filename = $_GET['filename'] ?? '';

if (empty($filename)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Missing required parameter: filename'
    ]);
    exit;
}

// Sanitize filename to prevent directory traversal attacks
$filename = basename($filename);

// Verify it's a ZIP file
if (pathinfo($filename, PATHINFO_EXTENSION) !== 'zip') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid file type. Only ZIP files are allowed.'
    ]);
    exit;
}

// Verify the filename follows the expected pattern
if (!preg_match('/^poznote_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/', $filename)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid backup filename format'
    ]);
    exit;
}

// Build the full file path
$backupsDir = __DIR__ . '/data/backups';
$filePath = $backupsDir . '/' . $filename;

// Check if file exists
if (!file_exists($filePath)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Backup file not found'
    ]);
    exit;
}

// Check if file is readable
if (!is_readable($filePath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Cannot read backup file'
    ]);
    exit;
}

// Send the file to the browser
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Read and output the file
readfile($filePath);
exit;
