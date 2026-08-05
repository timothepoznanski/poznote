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
    /** Paths the last deleteAllUserData() call could not remove. */
    private $deletionFailures = [];

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
        
        // Attachments size. In S3 mode the directory is (mostly) empty:
        // count the sizes recorded in the user's database instead.
        $stats['attachments'] = $this->getDirectorySize($this->getUserAttachmentsPath());
        require_once __DIR__ . '/../storage/AttachmentStorage.php';
        if (AttachmentStorage::isEnabled()) {
            $stats['attachments'] += $this->sumAttachmentBytesFromDb();
        }

        // Backups size
        $stats['backups'] = $this->getDirectorySize($this->getUserBackupsPath());
        
        $stats['total'] = $stats['database'] + $stats['entries'] + $stats['attachments'] + $stats['backups'];
        
        return $stats;
    }
    
    /**
     * Sum of the attachment sizes recorded in this user's database (all
     * entries, trash included). Used when attachments live in an S3 bucket.
     * @return int
     */
    public function sumAttachmentBytesFromDb() {
        $dbPath = $this->getUserDatabasePath();
        if (!file_exists($dbPath)) {
            return 0;
        }
        $total = 0;
        try {
            $db = new PDO('sqlite:' . $dbPath);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $stmt = $db->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $list = json_decode($row['attachments'] ?? '', true);
                if (is_array($list)) {
                    foreach ($list as $attachment) {
                        $total += max(0, (int)($attachment['file_size'] ?? 0));
                    }
                }
            }
        } catch (Exception $e) {
            // Stats input only: never break the caller
        }
        return $total;
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
        $this->deletionFailures = [];

        if (is_link($basePath)) {
            // The tree lives somewhere else; removing the link alone would leave
            // the notes on disk, so report it instead of claiming success.
            $this->deletionFailures[] = $basePath;
            return false;
        }

        if (!is_dir($basePath)) {
            return true;
        }

        return $this->deleteDirectory($basePath);
    }

    /**
     * Paths the last deleteAllUserData() call could not remove.
     * @return array
     */
    public function getDeletionFailures() {
        return $this->deletionFailures;
    }

    /**
     * Recursively delete a directory.
     * Every failure is recorded and propagated: a caller that deletes the
     * account row on a false return would leave the notes on disk.
     * @param string $path
     * @return bool
     */
    private function deleteDirectory($path) {
        if (!is_dir($path)) {
            return true;
        }

        $entries = scandir($path);
        if ($entries === false) {
            $this->deletionFailures[] = $path;
            return false;
        }

        $deleted = true;

        foreach (array_diff($entries, ['.', '..']) as $file) {
            $fullPath = $path . '/' . $file;
            // Symlinked directories are unlinked, never followed, so a link
            // cannot lead the recursion outside the user's own tree.
            if (is_dir($fullPath) && !is_link($fullPath)) {
                $deleted = $this->deleteDirectory($fullPath) && $deleted;
            } elseif (!@unlink($fullPath)) {
                $this->deletionFailures[] = $fullPath;
                $deleted = false;
            }
        }

        if (!@rmdir($path)) {
            $this->deletionFailures[] = $path;
            return false;
        }

        return $deleted;
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

    /**
     * Sync first/last name to user's local settings table for redundancy (disaster recovery)
     * @param string|null $firstName
     * @param string|null $lastName
     * @param PDO|null $con Optional existing database connection to use
     * @return bool
     */
    public function syncProfileNames($firstName, $lastName, $con = null) {
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

            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $ok = $stmt->execute(['user_profile_first_name', (string)($firstName ?? '')]);
            $ok = $stmt->execute(['user_profile_last_name', (string)($lastName ?? '')]) && $ok;
            return $ok;
        } catch (Exception $e) {
            error_log("Failed to sync profile names for user " . $this->userId . ": " . $e->getMessage());
            return false;
        }
    }
}
