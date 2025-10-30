<?php
/**
 * API Endpoint: Download Note File
 * 
 * Downloads a specific note file (HTML or Markdown)
 * 
 * Method: GET
 * Parameters: 
 *   - id: Note ID (required)
 *   - type: Note type - 'note', 'markdown', 'tasklist', 'excalidraw' (optional, defaults to 'note')
 * 
 * Response:
 * - Success: File download
 * - Error: JSON with error message or plain error
 */

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Check authentication
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

// Get parameters
$noteId = $_GET['id'] ?? '';
$noteType = $_GET['type'] ?? 'note';

if (empty($noteId) || !is_numeric($noteId)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Missing or invalid required parameter: id'
    ]);
    exit;
}

// Validate note type
$validTypes = ['note', 'markdown', 'tasklist', 'excalidraw'];
if (!in_array($noteType, $validTypes)) {
    $noteType = 'note';
}

// Get the note from database to verify it exists and user has access
try {
    $stmt = $con->prepare('SELECT id, heading, type FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Note not found or has been deleted'
        ]);
        exit;
    }
    
    // Use the actual type from database if available
    if (!empty($row['type'])) {
        $noteType = $row['type'];
    }
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Database error'
    ]);
    exit;
}

// Build the file path
$filename = getEntryFilename($noteId, $noteType);
$filePath = $filename;

// Security: ensure the path is within the entries directory
$realPath = realpath($filePath);
$expectedDir = realpath(getEntriesPath());

if ($realPath === false || strpos($realPath, $expectedDir) !== 0) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid file path'
    ]);
    exit;
}

// Check if file exists
if (!file_exists($filePath)) {
    http_response_code(404);
    die('Fichier non disponible sur le site');
}

// Check if file is readable
if (!is_readable($filePath)) {
    http_response_code(500);
    die('Cannot read file');
}

// Get the title for the download filename
$title = $row['heading'] ?? 'Note';
// Sanitize filename
$downloadFilename = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $title);
if (empty($downloadFilename)) {
    $downloadFilename = 'note_' . $noteId;
}

// Add appropriate extension
$extension = getFileExtensionForType($noteType);
$downloadFilename .= $extension;

// Send the file to the browser
$fileSize = filesize($filePath);
$contentType = ($extension === '.md') ? 'text/markdown' : 'text/html';

header('Content-Type: ' . $contentType . '; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $downloadFilename . '"');
header('Content-Length: ' . $fileSize);
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Read and output the file
readfile($filePath);
exit;
?>
