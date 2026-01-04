<?php
/**
 * API Endpoint: List Backup Files
 * 
 * Lists all available backup files in the backups directory
 * 
 * Method: GET
 * 
 * Response:
 * {
 *   "success": true,
 *   "backups": [
 *     {
 *       "filename": "poznote_backup_2025-10-24_14-30-15.zip",
 *       "path": "../data/backups/poznote_backup_2025-10-24_14-30-15.zip",
 *       "download_url": "api_download_backup.php?filename=poznote_backup_2025-10-24_14-30-15.zip",
 *       "size": 1048576,
 *       "size_mb": 1.0,
 *       "created_at": "2025-10-24T14:30:15+00:00"
 *     }
 *   ],
 *   "total": 1
 * }
 */

header('Content-Type: application/json');

require_once 'auth.php';
require_once 'config.php';

// Check authentication (session or HTTP Basic Auth)
requireApiAuth();

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use GET.'
    ]);
    exit;
}

try {
    $backupsDir = __DIR__ . '/data/backups';
    
    // Create backups directory if it doesn't exist
    if (!is_dir($backupsDir)) {
        if (!mkdir($backupsDir, 0755, true)) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Failed to create backups directory'
            ]);
            exit;
        }
    }
    
    $backups = [];
    
    // Scan the backups directory
    $files = scandir($backupsDir);
    
    foreach ($files as $file) {
        // Skip . and ..
        if ($file === '.' || $file === '..') {
            continue;
        }
        
        // Only include ZIP files with the correct naming pattern
        if (preg_match('/^poznote_backup_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.zip$/', $file, $matches)) {
            $filePath = $backupsDir . '/' . $file;
            
            if (is_file($filePath)) {
                $fileSize = filesize($filePath);
                $timestamp = $matches[1];
                
                // Convert timestamp to ISO 8601 format
                $dateTime = DateTime::createFromFormat('Y-m-d_H-i-s', $timestamp);
                $isoDate = $dateTime ? $dateTime->format('c') : null;
                
                $backups[] = [
                    'filename' => $file,
                    'path' => '../data/backups/' . $file,
                    'download_url' => 'api_download_backup.php?filename=' . urlencode($file),
                    'size' => $fileSize,
                    'size_mb' => round($fileSize / 1024 / 1024, 2),
                    'created_at' => $isoDate,
                    'created_timestamp' => $dateTime ? $dateTime->getTimestamp() : null
                ];
            }
        }
    }
    
    // Sort backups by creation date (newest first)
    usort($backups, function($a, $b) {
        return ($b['created_timestamp'] ?? 0) - ($a['created_timestamp'] ?? 0);
    });
    
    // Remove the timestamp field as it's only used for sorting
    foreach ($backups as &$backup) {
        unset($backup['created_timestamp']);
    }
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'backups' => $backups,
        'total' => count($backups)
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage()
    ]);
}
