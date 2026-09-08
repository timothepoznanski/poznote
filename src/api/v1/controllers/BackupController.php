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

    private function requireActiveAccountOwner() {
        if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
            return null;
        }

        if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
            http_response_code(403);
            $message = function_exists('getActiveAccountOwnerRequiredMessage')
                ? getActiveAccountOwnerRequiredMessage()
                : 'This account\'s settings are not accessible because you are not the owner of this account.';
            return ['success' => false, 'error' => $message];
        }

        return null;
    }
    
    /**
     * GET /api/v1/backups - List all backups
     */
    public function index() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

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
        if ($err = $this->requireActiveAccountOwner()) return $err;

        // Create backups directory if it doesn't exist
        if (!createDirectoryWithPermissions($this->backupsDir)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create backups directory'];
        }

        $userId = (int)(getCurrentUserId() ?? ($GLOBALS['activeUserId'] ?? 0));
        if ($userId <= 0) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Cannot resolve the active user'];
        }

        // Same builder as the web UI's complete backup and the S3 backups:
        // attachments stored in the S3 bucket are fetched into the archive,
        // and a bucket read failure refuses the backup instead of shipping
        // one that silently misses files.
        require_once dirname(__DIR__, 3) . '/backup_zip.php';
        $build = buildUserBackupZip($userId);
        if (empty($build['success'])) {
            http_response_code(500);
            return ['success' => false, 'error' => (string)$build['error']];
        }

        // Move to this endpoint's canonical name: index(), download() and
        // restore() only accept poznote_backup_{timestamp}.zip.
        $userTimezone = getUserTimezone();
        $dt = new DateTime('now', new DateTimeZone($userTimezone));
        $zipFileName = 'poznote_backup_' . $dt->format('Y-m-d_H-i-s') . '.zip';
        $zipFilePath = $this->backupsDir . '/' . $zipFileName;
        if (!@rename($build['zip_path'], $zipFilePath)) {
            // rename() fails across filesystems when the temp dir is a
            // separate mount; fall back to copy + delete
            if (!copy($build['zip_path'], $zipFilePath)) {
                @unlink($build['zip_path']);
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to move backup file into the backups directory'];
            }
            @unlink($build['zip_path']);
        }

        if (file_exists($zipFilePath) && filesize($zipFilePath) > 0) {
            require_once dirname(__DIR__, 3) . '/ActivityLog.php';
            logActivity(ACTIVITY_BACKUP_CREATED, [
                'filename' => $zipFileName,
                'size' => filesize($zipFilePath),
                'destination' => 'server',
            ], 'api');

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
        if ($err = $this->requireActiveAccountOwner()) return $err;

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
        if ($err = $this->requireActiveAccountOwner()) return $err;

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
     * POST /api/v1/backups/upload - Upload a backup ZIP and save it in the backups directory
     */
    public function upload() {
        if ($err = $this->requireActiveAccountOwner()) return $err;

        if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $uploadError = $_FILES['file']['error'] ?? -1;
            http_response_code(400);
            return ['success' => false, 'error' => 'No valid backup file uploaded', 'upload_error' => $uploadError];
        }

        $file = $_FILES['file'];

        // Validate extension
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if ($ext !== 'zip') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Uploaded file must be a ZIP archive'];
        }

        // Validate MIME type via finfo (more reliable than browser-supplied type)
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);
        if (!in_array($mime, ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], true)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Uploaded file does not appear to be a valid ZIP archive'];
        }

        // Create backups directory if it doesn't exist
        if (!createDirectoryWithPermissions($this->backupsDir)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to create backups directory'];
        }

        // Always save with a standard timestamped name so restore() can accept it
        $userTimezone = getUserTimezone();
        $dt = new DateTime('now', new DateTimeZone($userTimezone));
        $timestamp = $dt->format('Y-m-d_H-i-s');
        $filename = 'poznote_backup_' . $timestamp . '.zip';
        $destPath = $this->backupsDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to save uploaded backup file'];
        }

        $fileSize = filesize($destPath);
        http_response_code(201);
        return [
            'success'      => true,
            'filename'     => $filename,
            'size'         => $fileSize,
            'size_mb'      => round($fileSize / 1024 / 1024, 2),
            'restore_url'  => '/api/v1/backups/' . urlencode($filename) . '/restore',
            'download_url' => '/api/v1/backups/' . urlencode($filename),
        ];
    }

    /**
     * POST /api/v1/backups/{filename}/restore - Restore a backup file
     */
    public function restore($filename) {
        if ($err = $this->requireActiveAccountOwner()) return $err;

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
        
        // Create a temporary file object that mimics $_FILES structure
        $fileInfo = [
            'name' => $filename,
            'type' => 'application/zip',
            'tmp_name' => $filePath,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($filePath)
        ];
        
        try {
            $result = restoreCompleteBackup($fileInfo, true);
            
            if ($result['success']) {
                require_once dirname(__DIR__, 3) . '/ActivityLog.php';
                logActivity(ACTIVITY_BACKUP_RESTORED, [
                    'filename' => $filename,
                    'source' => 'server',
                ], 'api');

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
            http_response_code(500);
            return [
                'success' => false,
                'error' => 'Exception during restore: ' . $e->getMessage()
            ];
        }
    }
    
}
