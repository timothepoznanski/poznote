<?php
/**
 * User Data Manager Class for Multi-User Mode
 * 
 * Manages user-specific data directories and files:
 * - Database files
 * - Note entries
 * - Attachments
 * - Backups
 */

class UserDataManager {
    private $userId;
    private $baseDataPath;
    
    public function __construct($userId) {
        $this->userId = (int)$userId;
        // Derive data path from the main SQLITE_DATABASE constant to ensure consistency
        // SQLITE_DATABASE is typically [data_root]/database/poznote.db
        $this->baseDataPath = dirname(SQLITE_DATABASE, 2);
    }
    
    /**
     * Get the base path for user data
     * @return string
     */
    public function getUserBasePath() {
        return $this->baseDataPath . '/users/' . $this->userId;
    }
    
    /**
     * Get the path to user's database
     * @return string
     */
    public function getUserDatabasePath() {
        return $this->getUserBasePath() . '/database/poznote.db';
    }
    
    /**
     * Get the path to user's entries directory
     * @return string
     */
    public function getUserEntriesPath() {
        return $this->getUserBasePath() . '/entries';
    }
    
    /**
     * Get the path to user's attachments directory
     * @return string
     */
    public function getUserAttachmentsPath() {
        return $this->getUserBasePath() . '/attachments';
    }
    
    /**
     * Get the path to user's backups directory
     * @return string
     */
    public function getUserBackupsPath() {
        return $this->getUserBasePath() . '/backups';
    }
    
    /**
     * Initialize user directories and database
     * @return bool
     */
    public function initializeUserDirectories() {
        try {
            $basePath = $this->getUserBasePath();
            $directories = [
                $basePath . '/database',
                $basePath . '/entries',
                $basePath . '/attachments',
                $basePath . '/backups'
            ];
            
            foreach ($directories as $dir) {
                if (!createDirectoryWithPermissions($dir)) {
                    return false;
                }
            }
            
            return true;
            
        } catch (Exception $e) {
            error_log("Failed to initialize user directories: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Check if user directories exist
     * @return bool
     */
    public function userDirectoriesExist() {
        return is_dir($this->getUserBasePath()) && is_dir($this->getUserBasePath() . '/database');
    }
    
    /**
     * Get total storage used by user (in bytes)
     * @return int
     */
    public function getStorageUsed() {
        $basePath = $this->getUserBasePath();
        if (!is_dir($basePath)) {
            return 0;
        }
        
        $size = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($basePath, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $size += $file->getSize();
            }
        }
        
        return $size;
    }
    
    /**
     * Get storage statistics for user
     * @return array
     */
    public function getStorageStats() {
        $basePath = $this->getUserBasePath();
        
        $stats = [
            'total' => 0,
            'database' => 0,
            'entries' => 0,
            'attachments' => 0,
            'backups' => 0
        ];
        
        if (!is_dir($basePath)) {
            return $stats;
        }
        
        // Database size
        $dbPath = $this->getUserDatabasePath();
        if (file_exists($dbPath)) {
            $stats['database'] = filesize($dbPath);
        }
        
        // Entries size
        $stats['entries'] = $this->getDirectorySize($this->getUserEntriesPath());
        
        // Attachments size
        $stats['attachments'] = $this->getDirectorySize($this->getUserAttachmentsPath());
        
        // Backups size
        $stats['backups'] = $this->getDirectorySize($this->getUserBackupsPath());
        
        $stats['total'] = $stats['database'] + $stats['entries'] + $stats['attachments'] + $stats['backups'];
        
        return $stats;
    }
    
    /**
     * Get size of a directory
     * @param string $path
     * @return int
     */
    private function getDirectorySize($path) {
        if (!is_dir($path)) {
            return 0;
        }
        
        $size = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $size += $file->getSize();
            }
        }
        
        return $size;
    }
    
    /**
     * Get count of notes for user
     * @return int
     */
    public function getNotesCount() {
        $entriesPath = $this->getUserEntriesPath();
        if (!is_dir($entriesPath)) {
            return 0;
        }
        
        $count = 0;
        $files = scandir($entriesPath);
        foreach ($files as $file) {
            if (preg_match('/^\d+\.(html|md)$/', $file)) {
                $count++;
            }
        }
        
        return $count;
    }
    
    /**
     * Get count of attachments for user
     * @return int
     */
    public function getAttachmentsCount() {
        $attachmentsPath = $this->getUserAttachmentsPath();
        if (!is_dir($attachmentsPath)) {
            return 0;
        }
        
        $count = 0;
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $count++;
            }
        }
        
        return $count;
    }
    
    /**
     * Delete all user data
     * @return bool
     */
    public function deleteAllUserData() {
        $basePath = $this->getUserBasePath();
        
        if (!is_dir($basePath)) {
            return true;
        }
        
        return $this->deleteDirectory($basePath);
    }
    
    /**
     * Recursively delete a directory
     * @param string $path
     * @return bool
     */
    private function deleteDirectory($path) {
        if (!is_dir($path)) {
            return true;
        }
        
        $files = array_diff(scandir($path), ['.', '..']);
        
        foreach ($files as $file) {
            $fullPath = $path . '/' . $file;
            if (is_dir($fullPath)) {
                $this->deleteDirectory($fullPath);
            } else {
                unlink($fullPath);
            }
        }
        
        return rmdir($path);
    }
    
    /**
     * Create a complete backup of user data
     * @return array ['success' => bool, 'path' => string|null, 'error' => string|null]
     */
    public function createBackup() {
        try {
            $backupsPath = $this->getUserBackupsPath();
            createDirectoryWithPermissions($backupsPath);
            
            $userTimezone = getUserTimezone();
            $dt = new DateTime('now', new DateTimeZone($userTimezone));
            $backupName = 'backup_' . $dt->format('Y-m-d_H-i-s') . '.zip';
            $backupPath = $backupsPath . '/' . $backupName;
            
            $zip = new ZipArchive();
            if ($zip->open($backupPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                return ['success' => false, 'path' => null, 'error' => 'Failed to create ZIP archive'];
            }
            
            // Add database
            $dbPath = $this->getUserDatabasePath();
            if (file_exists($dbPath)) {
                $zip->addFile($dbPath, 'database/poznote.db');
            }
            
            // Add entries
            $entriesPath = $this->getUserEntriesPath();
            if (is_dir($entriesPath)) {
                $this->addDirectoryToZip($zip, $entriesPath, 'entries');
            }
            
            // Add attachments
            $attachmentsPath = $this->getUserAttachmentsPath();
            if (is_dir($attachmentsPath)) {
                $this->addDirectoryToZip($zip, $attachmentsPath, 'attachments');
            }
            
            $zip->close();
            
            return ['success' => true, 'path' => $backupPath, 'error' => null];
            
        } catch (Exception $e) {
            error_log("Failed to create backup: " . $e->getMessage());
            return ['success' => false, 'path' => null, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Add a directory to ZIP archive
     * @param ZipArchive $zip
     * @param string $path
     * @param string $prefix
     */
    private function addDirectoryToZip(ZipArchive $zip, $path, $prefix) {
        if (!is_dir($path)) {
            return;
        }
        
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($iterator as $file) {
            if ($file->isFile()) {
                $filePath = $file->getRealPath();
                $relativePath = $prefix . '/' . substr($filePath, strlen($path) + 1);
                $zip->addFile($filePath, $relativePath);
            }
        }
    }
    
    /**
     * Restore from a backup file
     * @param string $backupFilePath
     * @param bool $replace Whether to replace existing data
     * @return array ['success' => bool, 'message' => string|null, 'error' => string|null]
     */
    public function restoreFromBackup($backupFilePath, $replace = true) {
        try {
            if (!file_exists($backupFilePath)) {
                return ['success' => false, 'message' => null, 'error' => 'Backup file not found'];
            }
            
            $zip = new ZipArchive();
            if ($zip->open($backupFilePath) !== true) {
                return ['success' => false, 'message' => null, 'error' => 'Failed to open backup file'];
            }
            
            $basePath = $this->getUserBasePath();
            
            // If replacing, clear existing data first
            if ($replace) {
                // Keep the directory structure but clear contents
                $this->clearDirectory($this->getUserEntriesPath());
                $this->clearDirectory($this->getUserAttachmentsPath());
                // Don't delete database, just replace it
            }
            
            // Ensure directories exist
            $this->initializeUserDirectories();
            
            // Extract the backup
            $zip->extractTo($basePath);
            $zip->close();
            
            return ['success' => true, 'message' => 'Backup restored successfully', 'error' => null];
            
        } catch (Exception $e) {
            error_log("Failed to restore backup: " . $e->getMessage());
            return ['success' => false, 'message' => null, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Clear contents of a directory without deleting it
     * @param string $path
     */
    private function clearDirectory($path) {
        if (!is_dir($path)) {
            return;
        }
        
        $files = array_diff(scandir($path), ['.', '..']);
        
        foreach ($files as $file) {
            $fullPath = $path . '/' . $file;
            if (is_dir($fullPath)) {
                $this->deleteDirectory($fullPath);
            } else {
                unlink($fullPath);
            }
        }
    }
    
    /**
     * List available backups
     * @return array
     */
    public function listBackups() {
        $backupsPath = $this->getUserBackupsPath();
        $backups = [];
        
        if (!is_dir($backupsPath)) {
            return $backups;
        }
        
        $files = scandir($backupsPath);
        foreach ($files as $file) {
            if (preg_match('/^backup_.*\.zip$/', $file)) {
                $fullPath = $backupsPath . '/' . $file;
                $backups[] = [
                    'name' => $file,
                    'path' => $fullPath,
                    'size' => filesize($fullPath),
                    'created' => filemtime($fullPath)
                ];
            }
        }
        
        // Sort by creation time, newest first
        usort($backups, function($a, $b) {
            return $b['created'] - $a['created'];
        });
        
        return $backups;
    }
    
    /**
     * Delete a specific backup
     * @param string $backupName
     * @return bool
     */
    public function deleteBackup($backupName) {
        // Sanitize filename to prevent directory traversal
        $backupName = basename($backupName);
        if (!preg_match('/^backup_.*\.zip$/', $backupName)) {
            return false;
        }
        
        $backupPath = $this->getUserBackupsPath() . '/' . $backupName;
        
        if (file_exists($backupPath)) {
            return unlink($backupPath);
        }
        
        return false;
    }
    /**
     * Sync username to user's local settings table for redundancy (disaster recovery)
     * @param string $username
     * @param PDO|null $con Optional existing database connection to use
     * @return bool
     */
    public function syncUsername($username, $con = null) {
        $dbPath = $this->getUserDatabasePath();
        if (!file_exists($dbPath)) {
            // If DB doesn't exist yet, we can't sync, but it's not strictly an error
            return true;
        }
        
        try {
            if ($con === null) {
                $con = new PDO('sqlite:' . $dbPath);
                $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $con->exec('PRAGMA busy_timeout = 5000');
            }
            
            // Use 'user_profile_username' instead of 'login_display_name' to avoid confusion
            // login_display_name is a GLOBAL setting for the login page title
            // user_profile_username is for disaster recovery of the user profile
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('user_profile_username', ?)");
            return $stmt->execute([$username]);
        } catch (Exception $e) {
            error_log("Failed to sync username for user " . $this->userId . ": " . $e->getMessage());
            return false;
        }
    }

    /**
     * Sync email to user's local settings table for redundancy (disaster recovery)
     * @param string $email
     * @param PDO|null $con Optional existing database connection to use
     * @return bool
     */
    public function syncEmail($email, $con = null) {
        $dbPath = $this->getUserDatabasePath();
        if (!file_exists($dbPath)) {
            return true;
        }
        
        try {
            if ($con === null) {
                $con = new PDO('sqlite:' . $dbPath);
                $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $con->exec('PRAGMA busy_timeout = 5000');
            }
            
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('login_email', ?)");
            return $stmt->execute([$email]);
        } catch (Exception $e) {
            error_log("Failed to sync email for user " . $this->userId . ": " . $e->getMessage());
            return false;
        }
    }
}
