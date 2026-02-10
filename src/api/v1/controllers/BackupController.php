<?php
/**
 * BackupController - RESTful API for backup operations
 * 
 * Endpoints:
 *   GET    /api/v1/backups              - List all backups
 *   POST   /api/v1/backups              - Create a new backup
 *   GET    /api/v1/backups/{filename}   - Download a backup file
 *   DELETE /api/v1/backups/{filename}   - Delete a backup file
 *   POST   /api/v1/backups/{filename}/restore - Restore a backup file
 */

class BackupController {
    private $con;
    private $backupsDir;
    
    public function __construct($con) {
        $this->con = $con;
        $this->backupsDir = getBackupsPath();
    }
    
    /**
     * GET /api/v1/backups - List all backups
     */
    public function index() {
        // Create backups directory if it doesn't exist
        if (!createDirectoryWithPermissions($this->backupsDir)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create backups directory'];
        }
        
        $backups = [];
        $files = scandir($this->backupsDir);
        
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') continue;
            
            // Only include ZIP files with the correct naming pattern
            if (preg_match('/^poznote_backup_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.zip$/', $file, $matches)) {
                $filePath = $this->backupsDir . '/' . $file;
                
                if (is_file($filePath)) {
                    $fileSize = filesize($filePath);
                    $timestamp = $matches[1];
                    
                    // Parse the timestamp in the user's timezone (since backups are created with user's timezone)
                    $userTimezone = getUserTimezone();
                    $dateTime = DateTime::createFromFormat('Y-m-d_H-i-s', $timestamp, new DateTimeZone($userTimezone));
                    $isoDate = $dateTime ? $dateTime->format('c') : null;
                    
                    $backups[] = [
                        'filename' => $file,
                        'download_url' => '/api/v1/backups/' . urlencode($file),
                        'size' => $fileSize,
                        'size_mb' => round($fileSize / 1024 / 1024, 2),
                        'created_at' => $isoDate
                    ];
                }
            }
        }
        
        // Sort backups by date, most recent first
        usort($backups, function($a, $b) {
            return strcmp($b['created_at'], $a['created_at']);
        });
        
        return [
            'success' => true,
            'backups' => $backups,
            'total' => count($backups)
        ];
    }
    
    /**
     * POST /api/v1/backups - Create a new backup
     */
    public function create() {
        // Create backups directory if it doesn't exist
        if (!createDirectoryWithPermissions($this->backupsDir)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create backups directory'];
        }
        
        // Use user's timezone for backup filename
        $userTimezone = getUserTimezone();
        $dt = new DateTime('now', new DateTimeZone($userTimezone));
        $timestamp = $dt->format('Y-m-d_H-i-s');
        $zipFileName = 'poznote_backup_' . $timestamp . '.zip';
        $zipFilePath = $this->backupsDir . '/' . $zipFileName;
        
        $zip = new ZipArchive();
        if ($zip->open($zipFilePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Cannot create ZIP file'];
        }
        
        // Add SQL dump
        $sqlContent = $this->generateSQLDump();
        if ($sqlContent) {
            $zip->addFromString('database/poznote_backup.sql', $sqlContent);
        } else {
            $zip->close();
            if (file_exists($zipFilePath)) unlink($zipFilePath);
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create database backup'];
        }
        
        // Add all note entries
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
                    
                    if ($extension === 'html' || $extension === 'md') {
                        $zip->addFile($filePath, 'entries/' . $relativePath);
                    }
                }
            }
        }
        
        // Generate index.html
        $indexContent = $this->generateIndexHtml();
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
        
        // Add attachments metadata
        $metadataInfo = $this->getAttachmentsMetadata();
        if (!empty($metadataInfo)) {
            $zip->addFromString('attachments/poznote_attachments_metadata.json', json_encode($metadataInfo, JSON_PRETTY_PRINT));
        }
        
        $zip->close();
        
        if (file_exists($zipFilePath) && filesize($zipFilePath) > 0) {
            http_response_code(201);
            return [
                'success' => true,
                'message' => 'Backup created successfully',
                'backup_file' => $zipFileName,
                'backup_size' => filesize($zipFilePath),
                'backup_size_mb' => round(filesize($zipFilePath) / 1024 / 1024, 2),
                'created_at' => date('c')
            ];
        } else {
            if (file_exists($zipFilePath)) unlink($zipFilePath);
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create backup file'];
        }
    }
    
    /**
     * GET /api/v1/backups/{filename} - Download a backup file
     */
    public function download($filename) {
        $filename = basename($filename); // Security: prevent path traversal
        
        // Validate filename format
        if (!preg_match('/^poznote_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/', $filename)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid backup filename format'];
        }
        
        $filePath = $this->backupsDir . '/' . $filename;
        
        if (!file_exists($filePath)) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Backup file not found'];
        }
        
        if (!is_readable($filePath)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Cannot read backup file'];
        }
        
        // Send file to browser
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: no-cache, must-revalidate');
        header('Pragma: no-cache');
        
        readfile($filePath);
        exit;
    }
    
    /**
     * DELETE /api/v1/backups/{filename} - Delete a backup file
     */
    public function destroy($filename) {
        $filename = basename($filename); // Security: prevent path traversal
        
        // Validate filename format
        if (!preg_match('/^poznote_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/', $filename)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid backup filename format'];
        }
        
        $filePath = $this->backupsDir . '/' . $filename;
        
        if (!file_exists($filePath)) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Backup file not found'];
        }
        
        if (unlink($filePath)) {
            return ['success' => true, 'message' => 'Backup deleted successfully'];
        } else {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to delete backup file'];
        }
    }
    
    /**
     * POST /api/v1/backups/{filename}/restore - Restore a backup file
     */
    public function restore($filename) {
        $filename = basename($filename); // Security: prevent path traversal
        
        // Validate filename format
        if (!preg_match('/^poznote_backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/', $filename)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid backup filename format'];
        }
        
        $filePath = $this->backupsDir . '/' . $filename;
        
        if (!file_exists($filePath)) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Backup file not found'];
        }
        
        // Include restore functions
        require_once __DIR__ . '/../../restore_import.php';
        
        // Create a temporary file object that mimics $_FILES structure
        $fileInfo = [
            'name' => $filename,
            'type' => 'application/zip',
            'tmp_name' => $filePath,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($filePath)
        ];
        
        // Use the existing restoreCompleteBackup function
        // We need to temporarily copy the file since restoreCompleteBackup expects an uploaded file
        $tempFile = sys_get_temp_dir() . '/poznote_restore_' . uniqid() . '.zip';
        if (!copy($filePath, $tempFile)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to prepare backup for restoration'];
        }
        
        $fileInfo['tmp_name'] = $tempFile;
        
        try {
            $result = restoreCompleteBackup($fileInfo);
            
            // Clean up temp file
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
            
            if ($result['success']) {
                return [
                    'success' => true,
                    'message' => $result['message'] ?? 'Backup restored successfully',
                    'details' => $result
                ];
            } else {
                http_response_code(500);
                return [
                    'success' => false,
                    'error' => $result['error'] ?? 'Failed to restore backup',
                    'message' => $result['message'] ?? ''
                ];
            }
        } catch (Exception $e) {
            // Clean up temp file on error
            if (file_exists($tempFile)) {
                @unlink($tempFile);
            }
            
            http_response_code(500);
            return [
                'success' => false,
                'error' => 'Exception during restore: ' . $e->getMessage()
            ];
        }
    }
    
    // Helper methods
    
    private function generateSQLDump() {
        $sql = "-- Poznote Database Dump\n-- Generated on " . date('Y-m-d H:i:s') . "\n\n";
        
        $tables = $this->con->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        $tableNames = [];
        while ($row = $tables->fetch(PDO::FETCH_ASSOC)) {
            $tableNames[] = $row['name'];
        }
        
        foreach ($tableNames as $table) {
        // Get CREATE TABLE statement using prepared statement to prevent SQL injection
        $stmt = $this->con->prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?");
        $stmt->execute([$table]);
        $createStmt = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($createStmt && $createStmt['sql']) {
            $sql .= "DROP TABLE IF EXISTS \"{$table}\";\n";
            $sql .= $createStmt['sql'] . ";\n\n";
        }
        
        // Get all data using prepared statement
        $stmt = $this->con->prepare("SELECT * FROM \"{$table}\"");
        $stmt->execute();
        $data = $stmt;
            while ($row = $data->fetch(PDO::FETCH_ASSOC)) {
                $columns = array_keys($row);
                $values = array_map(function($value) {
                    if ($value === null) return 'NULL';
                    return $this->con->quote($value);
                }, array_values($row));
                
                $sql .= "INSERT INTO \"{$table}\" (" . implode(', ', array_map(function($col) {
                    return "\"{$col}\"";
                }, $columns)) . ") VALUES (" . implode(', ', $values) . ");\n";
            }
            $sql .= "\n";
        }
        
        return $sql;
    }
    
    private function generateIndexHtml() {
        $query = "SELECT id, heading, tags, folder, folder_id, workspace, attachments, type FROM entries WHERE trash = 0 ORDER BY workspace, folder, updated DESC";
        $result = $this->con->query($query);
        
        $content = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>Poznote Index</title>\n";
        $content .= "<style>\nbody { font-family: Arial, sans-serif; }\nh2 { margin-top: 30px; }\nh3 { color: #28a745; margin-top: 20px; }\n";
        $content .= "ul { list-style-type: none; }\nli { margin: 5px 0; }\na { text-decoration: none; color: #007bff; }\na:hover { text-decoration: underline; }\n</style>\n";
        $content .= "</head>\n<body>\n";
        
        $currentWorkspace = '';
        $currentFolder = '';
        
        if ($result) {
            while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
                $workspace = htmlspecialchars($row['workspace'] ?: 'Default');
                $folder = htmlspecialchars($row['folder'] ?: 'Default');
                
                if ($currentWorkspace !== $workspace) {
                    if ($currentWorkspace !== '') {
                        if ($currentFolder !== '') $content .= "</ul>\n";
                        $content .= "</div>\n";
                    }
                    $content .= "<h2>{$workspace}</h2>\n<div>\n";
                    $currentWorkspace = $workspace;
                    $currentFolder = '';
                }
                
                if ($currentFolder !== $folder) {
                    if ($currentFolder !== '') $content .= "</ul>\n";
                    $content .= "<h3>{$folder}</h3>\n<ul>\n";
                    $currentFolder = $folder;
                }
                
                $heading = htmlspecialchars($row['heading'] ?: 'Untitled');
                $noteType = $row['type'] ?? 'note';
                $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
                
                $content .= "<li><a href='entries/{$row['id']}.{$fileExtension}'>{$heading}</a></li>\n";
            }
            
            if ($currentFolder !== '') $content .= "</ul>\n";
            if ($currentWorkspace !== '') $content .= "</div>\n";
        }
        
        $content .= "</body>\n</html>";
        return $content;
    }
    
    private function getAttachmentsMetadata() {
        $query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $result = $this->con->query($query);
        $metadata = [];
        
        if ($result) {
            while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
                $attachments = json_decode($row['attachments'], true);
                if (is_array($attachments) && !empty($attachments)) {
                    foreach ($attachments as $attachment) {
                        if (isset($attachment['filename'])) {
                            $metadata[] = [
                                'note_id' => $row['id'],
                                'note_heading' => $row['heading'],
                                'attachment_data' => $attachment
                            ];
                        }
                    }
                }
            }
        }
        
        return $metadata;
    }
}
