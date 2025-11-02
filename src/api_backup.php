<?php
/**
 * API Endpoint: Create Complete Backup
 * 
 * Creates a complete backup ZIP file containing:
 * - Database SQL dump
 * - All HTML entries
 * - All attachments
 * - Index file for offline browsing
 * 
 * Method: POST
 * Headers: Content-Type: application/json
 * 
 * Response:
 * {
 *   "success": true/false,
 *   "message": "Success or error message",
 *   "backup_file": "filename of the created backup",
 *   "backup_path": "relative path to download the backup",
 *   "backup_size": size in bytes,
 *   "created_at": "ISO 8601 timestamp"
 * }
 */

header('Content-Type: application/json');

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

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

/**
 * Generate SQL dump of the database
 */
function generateSQLDump() {
    global $con;
    
    $sql = "-- Poznote Database Dump\n-- Generated on " . date('Y-m-d H:i:s') . "\n\n";
    
    // Get all table names
    $tables = $con->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    $tableNames = [];
    while ($row = $tables->fetch(PDO::FETCH_ASSOC)) {
        $tableNames[] = $row['name'];
    }
    
    foreach ($tableNames as $table) {
        // Get CREATE TABLE statement
        $createStmt = $con->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='{$table}'")->fetch(PDO::FETCH_ASSOC);
        if ($createStmt && $createStmt['sql']) {
            $sql .= $createStmt['sql'] . ";\n\n";
        }
        
        // Get all data
        $data = $con->query("SELECT * FROM \"{$table}\"");
        while ($row = $data->fetch(PDO::FETCH_ASSOC)) {
            $columns = array_keys($row);
            $values = array_map(function($value) use ($con) {
                if ($value === null) {
                    return 'NULL';
                }
                return $con->quote($value);
            }, array_values($row));
            
            $sql .= "INSERT INTO \"{$table}\" (" . implode(', ', array_map(function($col) {
                return "\"{$col}\"";
            }, $columns)) . ") VALUES (" . implode(', ', $values) . ");\n";
        }
        $sql .= "\n";
    }
    
    return $sql;
}

/**
 * Create a complete backup ZIP file
 */
function createAPIBackup() {
    global $con;
    
    // Create backups directory if it doesn't exist
    $backupsDir = __DIR__ . '/data/backups';
    if (!is_dir($backupsDir)) {
        if (!mkdir($backupsDir, 0755, true)) {
            return [
                'success' => false,
                'error' => 'Failed to create backups directory'
            ];
        }
    }
    
    $timestamp = date('Y-m-d_H-i-s');
    $zipFileName = 'poznote_backup_' . $timestamp . '.zip';
    $zipFilePath = $backupsDir . '/' . $zipFileName;
    
    $zip = new ZipArchive();
    if ($zip->open($zipFilePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return [
            'success' => false,
            'error' => 'Cannot create ZIP file'
        ];
    }
    
    // Add SQL dump
    $sqlContent = generateSQLDump();
    if ($sqlContent) {
        $zip->addFromString('database/poznote_backup.sql', $sqlContent);
    } else {
        $zip->close();
        if (file_exists($zipFilePath)) {
            unlink($zipFilePath);
        }
        return [
            'success' => false,
            'error' => 'Failed to create database backup'
        ];
    }
    
    // Add all note entries (HTML and Markdown)
    $entriesPath = getEntriesPath();
    if ($entriesPath && is_dir($entriesPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($entriesPath), 
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($entriesPath) + 1);
                $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
                
                // Include both HTML and Markdown files
                if ($extension === 'html' || $extension === 'md') {
                    $zip->addFile($filePath, 'entries/' . $relativePath);
                }
            }
        }
    }
    
    // Generate index.html for entries
    $query = "SELECT id, heading, tags, folder, folder_id, workspace, attachments, type FROM entries WHERE trash = 0 ORDER BY workspace, folder, updated DESC";
    $result = $con->query($query);
    
    $indexContent = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>Poznote Index</title>\n<style>\nbody { font-family: Arial, sans-serif; }\nh2 { margin-top: 30px; }\nh3 { color: #28a745; margin-top: 20px; }\nul { list-style-type: none; }\nli { margin: 5px 0; }\na { text-decoration: none; color: #007bff; }\na:hover { text-decoration: underline; }\n.attachments { color: #17a2b8; }\n</style>\n</head>\n<body>\n";
    
    $currentWorkspace = '';
    $currentFolder = '';
    if ($result) {
        while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $workspace = htmlspecialchars($row['workspace'] ?: 'Poznote');
            $folder = htmlspecialchars($row['folder'] ?: 'Default');
            if ($currentWorkspace !== $workspace) {
                if ($currentWorkspace !== '') {
                    if ($currentFolder !== '') {
                        $indexContent .= "</ul>\n";
                    }
                    $indexContent .= "</div>\n";
                }
                $indexContent .= "<h2>{$workspace}</h2>\n<div>\n";
                $currentWorkspace = $workspace;
                $currentFolder = '';
            }
            if ($currentFolder !== $folder) {
                if ($currentFolder !== '') {
                    $indexContent .= "</ul>\n";
                }
                $indexContent .= "<h3>{$folder}</h3>\n<ul>\n";
                $currentFolder = $folder;
            }
            $heading = htmlspecialchars($row['heading'] ?: 'Untitled');
            $tags = $row['tags'];
            $tagsStr = '';
            if (!empty($tags)) {
                $tagsArray = array_map('trim', explode(',', $tags));
                $tagsArray = array_filter($tagsArray);
                if (!empty($tagsArray)) {
                    $tagsStr = implode(', ', array_map('htmlspecialchars', $tagsArray));
                }
            }
            $attachments = json_decode($row['attachments'], true);
            $attachmentsStr = '';
            if (is_array($attachments) && !empty($attachments)) {
                $attachmentLinks = [];
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $filename = htmlspecialchars($attachment['filename']);
                        $attachmentLinks[] = "<a href='attachments/{$filename}' target='_blank'>{$filename}</a>";
                    }
                }
                if (!empty($attachmentLinks)) {
                    $attachmentsStr = implode(', ', $attachmentLinks);
                }
            }
            $parts = [];
            
            // Determine the correct file extension based on note type
            $noteType = $row['type'] ?? 'note';
            $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
            
            $parts[] = "<a href='entries/{$row['id']}.{$fileExtension}'>{$heading}</a>";
            if (!empty($tagsStr)) { $parts[] = $tagsStr; }
            if (!empty($attachmentsStr)) { $parts[] = $attachmentsStr; }
            $indexContent .= "<li>" . implode(' - ', $parts) . "</li>\n";
        }
        if ($currentFolder !== '') {
            $indexContent .= "</ul>\n";
        }
        if ($currentWorkspace !== '') {
            $indexContent .= "</div>\n";
        }
    }
    
    $indexContent .= "</body>\n</html>";
    $zip->addFromString('index.html', $indexContent);
    
    // Add attachments
    $attachmentsPath = getAttachmentsPath();
    if ($attachmentsPath && is_dir($attachmentsPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($attachmentsPath), 
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($attachmentsPath) + 1);
                
                if (!str_starts_with($relativePath, '.')) {
                    $zip->addFile($filePath, 'attachments/' . $relativePath);
                }
            }
        }
    }
    
    // Add metadata file for attachments
    $query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $queryResult = $con->query($query);
    $metadataInfo = [];
    
    if ($queryResult) {
        while ($row = $queryResult->fetch(PDO::FETCH_ASSOC)) {
            $attachments = json_decode($row['attachments'], true);
            if (is_array($attachments) && !empty($attachments)) {
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $metadataInfo[] = [
                            'note_id' => $row['id'],
                            'note_heading' => $row['heading'],
                            'attachment_data' => $attachment
                        ];
                    }
                }
            }
        }
    }
    
    if (!empty($metadataInfo)) {
        $metadataContent = json_encode($metadataInfo, JSON_PRETTY_PRINT);
        $zip->addFromString('attachments/poznote_attachments_metadata.json', $metadataContent);
    }
    
    $zip->close();
    
    // Verify the file was created successfully
    if (file_exists($zipFilePath) && filesize($zipFilePath) > 0) {
        return [
            'success' => true,
            'backup_file' => $zipFileName,
            'backup_path' => '../data/backups/' . $zipFileName,
            'backup_size' => filesize($zipFilePath),
            'created_at' => date('c')
        ];
    } else {
        if (file_exists($zipFilePath)) {
            unlink($zipFilePath);
        }
        return [
            'success' => false,
            'error' => 'Failed to create backup file'
        ];
    }
}

try {
    $result = createAPIBackup();
    
    if ($result['success']) {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Backup created successfully',
            'backup_file' => $result['backup_file'],
            'backup_path' => $result['backup_path'],
            'backup_size' => $result['backup_size'],
            'backup_size_mb' => round($result['backup_size'] / 1024 / 1024, 2),
            'created_at' => $result['created_at']
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $result['error']
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage()
    ]);
}
