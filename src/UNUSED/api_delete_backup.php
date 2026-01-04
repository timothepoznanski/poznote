<?php
/**
 * API Endpoint: Delete Backup File
 * 
 * Deletes a specific backup file from the server
 * 
 * Method: POST
 * Headers: Content-Type: application/json
 * 
 * Request Body:
 * {
 *   "filename": "poznote_backup_2025-10-24_14-30-15.zip"
 * }
 * 
 * Response:
 * {
 *   "success": true/false,
 *   "message": "Success or error message"
 * }
 */

header('Content-Type: application/json');

require_once 'auth.php';
require_once 'config.php';

// Check authentication (session or HTTP Basic Auth)
requireApiAuth();

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use POST.'
    ]);
    exit;
}

try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['filename']) || empty($input['filename'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Missing required parameter: filename'
        ]);
        exit;
    }
    
    $filename = basename($input['filename']); // Security: prevent path traversal
    
    // Validate filename format
    if (!preg_match('/^poznote_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/', $filename)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Invalid backup filename format'
        ]);
        exit;
    }
    
    $backupsDir = __DIR__ . '/data/backups';
    $filePath = $backupsDir . '/' . $filename;
    
    // Check if file exists
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'Backup file not found'
        ]);
        exit;
    }
    
    // Delete the file
    if (unlink($filePath)) {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Backup deleted successfully',
            'filename' => $filename
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to delete backup file'
        ]);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage()
    ]);
}
