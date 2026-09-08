<?php
/**
 * Where the data lives on disk, and the permissions it needs.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Helper function to create directory with proper permissions
 * Centralizes the logic for creating directories and setting ownership
 * 
 * @param string $path The directory path to create
 * @param int $permissions The permissions to set (default: 0755)
 * @param bool $recursive Whether to create parent directories (default: true)
 * @return bool True on success, false on failure
 */
function createDirectoryWithPermissions($path, $permissions = 0755, $recursive = true) {
    // Directory already exists
    if (is_dir($path)) {
        return true;
    }
    
    // Try to create directory
    if (!mkdir($path, $permissions, $recursive)) {
        error_log("Failed to create directory: $path");
        return false;
    }
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
    
    return true;
}

/**
 * Helper function to set file permissions and ownership
 * Centralizes the logic for setting file ownership
 * 
 * @param string $path The file or directory path
 * @param int $permissions The permissions to set
 * @return void
 */
function setFilePermissions($path, $permissions = 0644) {
    if (!file_exists($path)) {
        return;
    }
    
    chmod($path, $permissions);
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
}

/**
 * Get a user data directory path by type.
 * @param string $type One of 'entries', 'attachments', 'backups'
 * @return string The directory path
 */
function getDataPath(string $type): string {
    global $activeUserId, $forcePublicTokenRouting;
    // Public share requests are routed to the share owner's data (see
    // db_connect.php): the visitor may be logged in as a different user, so
    // their session user_id must not win over the resolved owner id.
    $userId = !empty($forcePublicTokenRouting)
        ? $activeUserId
        : ($_SESSION['user_id'] ?? $activeUserId);

    $methodMap = [
        'entries' => 'getUserEntriesPath',
        'attachments' => 'getUserAttachmentsPath',
        'backups' => 'getUserBackupsPath',
    ];

    if ($userId && isset($methodMap[$type])) {
        require_once __DIR__ . '/../users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->{$methodMap[$type]}();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/../data/' . $type;
}

function getEntriesPath() { return getDataPath('entries'); }
function getAttachmentsPath() { return getDataPath('attachments'); }

function getBackupsPath() { return getDataPath('backups'); }

/**
 * Delete directory recursively
 */
function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    
    foreach ($files as $fileinfo) {
        $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
        $todo($fileinfo->getRealPath());
    }
    
    rmdir($dir);
}

function ensureDataPermissions() {
    if (isset($_SESSION['user_id'])) {
        require_once __DIR__ . '/../users/UserDataManager.php';
        $dataManager = new UserDataManager($_SESSION['user_id']);
        $userDir = $dataManager->getUserBasePath();
        $dbPath = $dataManager->getUserDatabasePath();
        
        if (is_dir($userDir)) {
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                // Use shell command for recursive chown
                exec('chown -R www-data:www-data ' . escapeshellarg($userDir) . ' 2>/dev/null');
            }
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    } else {
        $dataDir = __DIR__ . '/../data';
        if (is_dir($dataDir)) {
            // Recursively set ownership to match the data directory owner
            $dataOwner = fileowner($dataDir);
            $dataGroup = filegroup($dataDir);
            
            // Use shell command for recursive chown
            exec('chown -R ' . (int)$dataOwner . ':' . (int)$dataGroup . ' ' . escapeshellarg($dataDir) . ' 2>/dev/null');
            
            // Ensure database file has write permissions
            $dbPath = $dataDir . '/database/poznote.db';
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    }
}
