<?php
/**
 * BackupController - RESTful API for backup operations
 * 
 * Endpoints:
 *   GET    /api/v1/backups           - List all backups
 *   POST   /api/v1/backups           - Create a new backup
 *   GET    /api/v1/backups/{filename} - Download a backup file
 *   DELETE /api/v1/backups/{filename} - Delete a backup file
 *   POST   /api/v1/backups/restore/chunk - Upload a chunk for restore
 *   POST   /api/v1/backups/restore/assemble - Assemble chunks
 *   POST   /api/v1/backups/restore/cleanup - Cleanup chunks
 */

class BackupController {
    private $con;
    private $backupsDir;
    
    public function __construct($con) {
        $this->con = $con;
        // Path from api/v1/controllers/ to data/backups/
        $this->backupsDir = __DIR__ . '/../../../data/backups';
    }
    
    /**
     * GET /api/v1/backups - List all backups
     */
    public function index() {
        // Create backups directory if it doesn't exist
        if (!is_dir($this->backupsDir)) {
            if (!mkdir($this->backupsDir, 0755, true)) {
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to create backups directory'];
            }
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
                    
                    $dateTime = DateTime::createFromFormat('Y-m-d_H-i-s', $timestamp);
                    $isoDate = $dateTime ? $dateTime->format('c') : null;
                    
                    $backups[] = [
                        'filename' => $file,
                        'path' => '../data/backups/' . $file,
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
        if (!is_dir($this->backupsDir)) {
            if (!mkdir($this->backupsDir, 0755, true)) {
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to create backups directory'];
            }
        }
        
        $timestamp = date('Y-m-d_H-i-s');
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
                'backup_path' => '../data/backups/' . $zipFileName,
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
     * POST /api/v1/backups/restore/chunk - Upload a chunk for restore
     */
    public function uploadChunk() {
        $fileId = $_POST['file_id'] ?? '';
        $chunkIndex = (int)($_POST['chunk_index'] ?? 0);
        $totalChunks = (int)($_POST['total_chunks'] ?? 0);
        $fileName = $_POST['file_name'] ?? '';
        $chunkSize = (int)($_POST['chunk_size'] ?? 0);

        if (!$fileId || !$fileName || $totalChunks <= 0) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Missing required parameters'];
        }

        if (!preg_match('/\.zip$/i', $fileName)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Only ZIP files are allowed'];
        }

        if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            return ['success' => false, 'error' => 'No chunk file uploaded'];
        }

        $chunkFile = $_FILES['chunk']['tmp_name'];
        $chunkData = file_get_contents($chunkFile);

        if ($chunkData === false) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to read chunk data'];
        }

        $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;
        if (!is_dir($chunksDir)) {
            if (!mkdir($chunksDir, 0755, true)) {
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to create chunks directory'];
            }
        }

        $chunkFilePath = $chunksDir . '/chunk_' . str_pad($chunkIndex, 6, '0', STR_PAD_LEFT);
        if (file_put_contents($chunkFilePath, $chunkData) === false) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to save chunk'];
        }

        // Save metadata
        $metadataFile = $chunksDir . '/metadata.json';
        $metadata = [
            'file_name' => $fileName,
            'file_id' => $fileId,
            'total_chunks' => $totalChunks,
            'chunk_size' => $chunkSize,
            'uploaded_chunks' => [],
            'upload_start_time' => time()
        ];

        if (file_exists($metadataFile)) {
            $existingMetadata = json_decode(file_get_contents($metadataFile), true);
            if ($existingMetadata) {
                $metadata = array_merge($metadata, $existingMetadata);
            }
        }

        $metadata['uploaded_chunks'][] = $chunkIndex;
        $metadata['uploaded_chunks'] = array_unique($metadata['uploaded_chunks']);
        sort($metadata['uploaded_chunks']);

        file_put_contents($metadataFile, json_encode($metadata));

        $allChunksUploaded = count($metadata['uploaded_chunks']) === $totalChunks;

        return [
            'success' => true,
            'chunk_index' => $chunkIndex,
            'uploaded_chunks' => count($metadata['uploaded_chunks']),
            'total_chunks' => $totalChunks,
            'all_chunks_uploaded' => $allChunksUploaded
        ];
    }
    
    /**
     * POST /api/v1/backups/restore/assemble - Assemble chunks into final file
     */
    public function assembleChunks() {
        $fileId = $_POST['file_id'] ?? '';
        
        if (!$fileId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Missing file_id'];
        }
        
        $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;
        $metadataFile = $chunksDir . '/metadata.json';
        
        if (!file_exists($metadataFile)) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Upload session not found'];
        }
        
        $metadata = json_decode(file_get_contents($metadataFile), true);
        $totalChunks = $metadata['total_chunks'];
        $fileName = $metadata['file_name'];
        
        // Assemble file
        $outputPath = sys_get_temp_dir() . '/' . $fileName;
        $outputFile = fopen($outputPath, 'wb');
        
        if (!$outputFile) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create output file'];
        }
        
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkPath = $chunksDir . '/chunk_' . str_pad($i, 6, '0', STR_PAD_LEFT);
            if (!file_exists($chunkPath)) {
                fclose($outputFile);
                unlink($outputPath);
                http_response_code(400);
                return ['success' => false, 'error' => 'Missing chunk ' . $i];
            }
            fwrite($outputFile, file_get_contents($chunkPath));
        }
        
        fclose($outputFile);
        
        return [
            'success' => true,
            'file_path' => $outputPath,
            'file_name' => $fileName,
            'file_size' => filesize($outputPath)
        ];
    }
    
    /**
     * POST /api/v1/backups/restore/cleanup - Cleanup chunks
     */
    public function cleanupChunks() {
        $fileId = $_POST['file_id'] ?? '';
        
        if (!$fileId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Missing file_id'];
        }
        
        $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;
        
        if (is_dir($chunksDir)) {
            $files = glob($chunksDir . '/*');
            foreach ($files as $file) {
                unlink($file);
            }
            rmdir($chunksDir);
        }
        
        return ['success' => true, 'message' => 'Chunks cleaned up'];
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
            $createStmt = $this->con->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='{$table}'")->fetch(PDO::FETCH_ASSOC);
            if ($createStmt && $createStmt['sql']) {
                $sql .= $createStmt['sql'] . ";\n\n";
            }
            
            $data = $this->con->query("SELECT * FROM \"{$table}\"");
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
