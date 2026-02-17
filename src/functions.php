<?php
date_default_timezone_set('UTC');

/**
 * Trusted domains allowed for iframe embeds.
 * Used by both unescapeIframesInHtml() and the Markdown parser.
 */
if (!defined('ALLOWED_IFRAME_DOMAINS')) {
    define('ALLOWED_IFRAME_DOMAINS', [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'player.bilibili.com',
        'www.bilibili.com',
        'bilibili.com',
    ]);
}

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
 * Detect if the current request is using HTTPS
 * Supports reverse proxy headers (X-Forwarded-Proto, X-Forwarded-SSL)
 */
function isSecureConnection() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
}

/**
 * Get the current protocol (http or https), supporting reverse proxies
 */
function getProtocol() {
    return isSecureConnection() ? 'https' : 'http';
}

/**
 * Get the full base URL for the application, supporting reverse proxies
 */
function getBaseUrl() {
    $protocol = getProtocol();
    $host = !empty($_SERVER['HTTP_X_FORWARDED_HOST']) ? $_SERVER['HTTP_X_FORWARDED_HOST'] : 
            (!empty($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost');
    return $protocol . '://' . $host;
}

/**
 * Global settings cache - loads all settings in one query and caches them
 * This dramatically reduces database queries when settings are accessed multiple times
 */
function getSetting($key, $default = null) {
    static $cache = null;
    
    // Load all settings on first call
    if ($cache === null) {
        $cache = [];
        global $con;
        if (isset($con)) {
            try {
                $stmt = $con->query("SELECT key, value FROM settings");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $cache[$row['key']] = $row['value'];
                }
            } catch (Exception $e) {
                // Ignore errors, cache remains empty
            }
        }
    }
    
    return isset($cache[$key]) ? $cache[$key] : $default;
}

/**
 * Clean content for search by removing base64 images and other heavy data
 * This is used to keep the database entry column lightweight for search functionality
 */
function cleanContentForSearch($content) {
    // Remove base64 images (data:image/...)
    $content = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $content);
    
    // Remove Excalidraw containers with embedded data
    $content = preg_replace('/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s', '[Excalidraw diagram]', $content);
    
    return $content;
}

/**
 * Internationalization (i18n)
 * - Uses JSON dictionaries in src/i18n/{lang}.json
 * - Active language stored in settings table key: 'language'
 * - Fallback to English when a key is missing
 */

function getUserLanguage() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $lang = getSetting('language', 'en');
    if ($lang && is_string($lang)) {
        $lang = strtolower(trim($lang));
        // Basic allowlist: keep it simple and safe
        if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
            $cached = $lang;
            return $cached;
        }
    }
    
    $cached = 'en';
    return $cached;
}

function loadI18nDictionary($lang) {
    static $cache = [];

    $lang = strtolower(trim((string)$lang));
    if ($lang === '') $lang = 'en';
    if (isset($cache[$lang])) return $cache[$lang];

    $file = __DIR__ . '/i18n/' . $lang . '.json';
    $json = @file_get_contents($file);
    if ($json === false) {
        $cache[$lang] = [];
        return $cache[$lang];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
    $cache[$lang] = $data;
    return $data;
}

function i18nGet($dict, $key) {
    if (!is_array($dict)) return null;
    $parts = explode('.', $key);
    $cur = $dict;
    foreach ($parts as $p) {
        if (!is_array($cur) || !array_key_exists($p, $cur)) return null;
        $cur = $cur[$p];
    }
    return is_string($cur) ? $cur : null;
}

function t($key, $vars = [], $default = null, $lang = null) {
    if ($lang === null) {
        $lang = getUserLanguage();
    }

    $dict = loadI18nDictionary($lang);
    $en = ($lang === 'en') ? $dict : loadI18nDictionary('en');

    $text = i18nGet($dict, $key);
    if ($text === null) $text = i18nGet($en, $key);
    if ($text === null) $text = ($default !== null ? (string)$default : (string)$key);

    if (is_array($vars) && !empty($vars)) {
        foreach ($vars as $k => $v) {
            $text = str_replace('{{' . $k . '}}', (string)$v, $text);
        }
    }
    return $text;
}

function t_h($key, $vars = [], $default = null, $lang = null) {
    return htmlspecialchars(t($key, $vars, $default, $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Get the page title for the application
 * Uses custom display name from settings if available, otherwise uses app name from i18n
 * @return string The HTML-escaped page title
 */
function getPageTitle() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $login_display_name = getGlobalSetting('login_display_name', '');
    
    if ($login_display_name && trim($login_display_name) !== '') {
        $cached = htmlspecialchars($login_display_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    } else {
        $cached = t_h('app.name');
    }
    
    return $cached;
}

/**
 * Get the user's configured timezone from the database
 * Returns 'UTC' if no timezone is configured
 * @return string The timezone identifier (e.g., 'Europe/Paris')
 */
function getUserTimezone() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $timezone = getSetting('timezone', '');
    if ($timezone && $timezone !== '') {
        $cached = $timezone;
        return $cached;
    }
    
    $cached = defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
    return $cached;
}

/**
 * Convert a UTC datetime string to the user's configured timezone
 * @param string $utcDatetime The UTC datetime string (e.g., '2025-11-07 10:52:00')
 * @param string $format The output format (default: 'Y-m-d H:i:s')
 * @return string The datetime in the user's timezone
 */
function convertUtcToUserTimezone($utcDatetime, $format = 'Y-m-d H:i:s') {
    if (empty($utcDatetime)) return '';
    try {
        $userTz = getUserTimezone();
        $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($userTz));
        return $date->format($format);
    } catch (Exception $e) {
        return $utcDatetime; // Return original on error
    }
}

/**
 * Format a timestamp for display (with i18n support)
 * @param int $timestamp Unix timestamp
 * @param string $format Date format (default: 'j M Y H:i')
 * @return string Formatted date string
 */
function formatDateTime($timestamp) {
    $timezone = getUserTimezone();
    try {
        $date = new DateTime('@' . $timestamp);
        $date->setTimezone(new DateTimeZone($timezone));
        return $date->format('j M Y') . ' ' . t('common.at', [], 'at') . ' ' . $date->format('H:i');
    } catch (Exception $e) {
        return date('j M Y H:i', $timestamp);
    }
}

/**
 * Get a user data directory path by type.
 * @param string $type One of 'entries', 'attachments', 'backups'
 * @return string The directory path
 */
function getDataPath(string $type): string {
    global $activeUserId;
    $userId = $_SESSION['user_id'] ?? $activeUserId;

    $methodMap = [
        'entries' => 'getUserEntriesPath',
        'attachments' => 'getUserAttachmentsPath',
        'backups' => 'getUserBackupsPath',
    ];

    if ($userId && isset($methodMap[$type])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->{$methodMap[$type]}();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/data/' . $type;
}

function getEntriesPath() { return getDataPath('entries'); }
function getAttachmentsPath() { return getDataPath('attachments'); }
function getBackupsPath() { return getDataPath('backups'); }

/**
 * Get the appropriate file extension based on note type
 * @param string $type The note type (note, markdown, tasklist)
 * @return string The file extension (.md or .html)
 */
function getFileExtensionForType($type) {
    return ($type === 'markdown') ? '.md' : '.html';
}

/**
 * Get the full filename for a note entry
 * @param int $id The note ID
 * @param string $type The note type
 * @return string The complete filename with path and extension
 */
function getEntryFilename($id, $type) {
    $extension = getFileExtensionForType($type);
    return getEntriesPath() . '/' . $id . $extension;
}

/**
 * Get the first available workspace name from the database
 * Used as fallback when no specific workspace is selected
 * 
 * @return string The first workspace name, or empty string if none exists
 */
function getFirstWorkspaceName() {
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['name'])) {
                return $row['name'];
            }
        } catch (Exception $e) {
            // Continue to default
        }
    }
    return '';
}

/**
 * Get the current workspace filter from GET/POST parameters
 * Priority order:
 * 1. GET/POST parameter (highest priority)
 * 2. Database setting 'default_workspace' (if set to a specific workspace name)
 *    Special value '__last_opened__' means use last_opened_workspace from database
 * 3. Database setting 'last_opened_workspace' (the last workspace the user opened)
 * 4. Fallback to first available workspace
 * 
 * @return string The workspace name
 */
function getWorkspaceFilter() {
    static $cached = null;
    
    // First check URL parameters - but ignore if empty
    // These are dynamic, so don't cache if found
    if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace']) && $_POST['workspace'] !== '') {
        return $_POST['workspace'];
    }
    
    // Return cached value if we already computed it
    if ($cached !== null) {
        return $cached;
    }
    
    // If no parameter or empty parameter, check for default workspace setting in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $defaultWorkspace = $stmt->fetchColumn();
            // Only use defaultWorkspace if it's a real workspace name (not __last_opened__ or empty)
            if ($defaultWorkspace !== false && $defaultWorkspace !== '' && $defaultWorkspace !== '__last_opened__') {
                // Verify workspace exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$defaultWorkspace]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $defaultWorkspace;
                    return $cached;
                }
            }
            
            // Check for last_opened_workspace setting (used when default_workspace is '__last_opened__' or empty)
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['last_opened_workspace']);
            $lastOpened = $stmt->fetchColumn();
            if ($lastOpened !== false && $lastOpened !== '') {
                // Verify the workspace still exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$lastOpened]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $lastOpened;
                    return $cached;
                }
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
        }
    }
    
    // Final fallback: get first available workspace
    $cached = getFirstWorkspaceName();
    return $cached;
}

/**
 * Save the last opened workspace to the database
 * This is called when a workspace is opened/selected
 * 
 * @param string $workspace The workspace name to save
 * @return bool Whether the save was successful
 */
function saveLastOpenedWorkspace($workspace) {
    global $con;
    if (!isset($con) || empty($workspace)) {
        return false;
    }
    
    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return $stmt->execute(['last_opened_workspace', $workspace]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Generate a unique note title to prevent duplicates
 * Default to "New note" when empty.
 * If a title already exists, add a numeric suffix like " (1)", " (2)", ...
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null, $folder_id = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = t('index.note.new_note', [], 'New note');
    }
    
    // Check if title already exists (excluding the current note if updating)
    // Uniqueness is scoped to folder + workspace
    $query = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0";
    $params = [$title];

    // Check uniqueness within the same folder
    if ($folder_id !== null) {
        $query .= " AND folder_id = ?";
        $params[] = $folder_id;
    } else {
        $query .= " AND folder_id IS NULL";
    }

    // If workspace specified, restrict uniqueness to that workspace
    if ($workspace !== null) {
        $query .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    if ($excludeId !== null) {
        $query .= " AND id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $count = $stmt->fetchColumn();
    
    // If no duplicate, return the title as is
    if ($count == 0) {
        return $title;
    }
    
    // If duplicate exists, add a number suffix
    $counter = 1;
    $baseTitle = $title;
    
    do {
        $title = $baseTitle . ' (' . $counter . ')';
        
    $stmt = $con->prepare($query);
    $params[0] = $title; // Update the title in params
    $stmt->execute($params);
        $count = $stmt->fetchColumn();
        
        $counter++;
    } while ($count > 0);
    
    return $title;
}

/**
 * Restore a complete backup from ZIP file
 * Handles database, notes, and attachments restoration
 */
function restoreCompleteBackup($uploadedFile, $isLocalFile = false) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_complete_restore_' . uniqid() . '.zip';
    $tempExtractDir = null;
    
    try {
        // Move/copy uploaded file
        if ($isLocalFile) {
            // For locally created files
            if (!copy($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error copying local file'];
            }
        } else {
            // For HTTP uploaded files
            if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error uploading file'];
            }
        }
        
        // Extract ZIP to temporary directory
        $tempExtractDir = '/tmp/poznote_restore_' . uniqid();
        if (!createDirectoryWithPermissions($tempExtractDir)) {
            unlink($tempFile);
            return ['success' => false, 'error' => 'Cannot create temporary directory'];
        }
        
        // Ensure required data directories exist
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            if (!$dataManager->userDirectoriesExist()) {
                $dataManager->initializeUserDirectories();
            }
        } else {
            // Fallback for non-user mode (old structure compatibility)
            $dataDir = __DIR__ . '/data';
            $requiredDirs = ['attachments', 'database', 'entries'];
            foreach ($requiredDirs as $dir) {
                $fullPath = $dataDir . '/' . $dir;
                if (!is_dir($fullPath)) {
                    mkdir($fullPath, 0755, true);
                    if (function_exists('posix_getuid') && posix_getuid() === 0) {
                        $current_uid = posix_getuid();
                        $current_gid = posix_getgid();
                        chown($fullPath, $current_uid);
                        chgrp($fullPath, $current_gid);
                    }
                }
            }
        }
        
        $zip = new ZipArchive;
        $res = $zip->open($tempFile);
        
        if ($res !== TRUE) {
            unlink($tempFile);
            rmdir($tempExtractDir);
            return ['success' => false, 'error' => 'Cannot open ZIP file'];
        }
        
        $zip->extractTo($tempExtractDir);
        $zip->close();
        unlink($tempFile);
        $tempFile = null; // Mark as cleaned
        
        // CLEAR ENTRIES DIRECTORY BEFORE RESTORATION
        $entriesPath = getEntriesPath();
        if (is_dir($entriesPath)) {
            // Delete all files in entries directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($entriesPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $entriesCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $entriesCleared++;
            }
            error_log("CLEARED $entriesCleared files from entries directory");
        } else {
            // Create entries directory if it doesn't exist
            createDirectoryWithPermissions($entriesPath);
        }
        
        // CLEAR ATTACHMENTS DIRECTORY BEFORE RESTORATION
        $attachmentsPath = getAttachmentsPath();
        if (is_dir($attachmentsPath)) {
            // Delete all files in attachments directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $attachmentsCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $attachmentsCleared++;
            }
            error_log("CLEARED $attachmentsCleared files from attachments directory");
        } else {
            // Create attachments directory if it doesn't exist
            createDirectoryWithPermissions($attachmentsPath);
        }
        
        $results = [];
        $hasErrors = false;
        
        // Restore database if SQL file exists
        $sqlFile = $tempExtractDir . '/database/poznote_backup.sql';
        if (file_exists($sqlFile)) {
            $dbResult = restoreDatabaseFromFile($sqlFile);
            $results[] = 'Database: ' . ($dbResult['success'] ? 'Restored successfully' : 'Failed - ' . $dbResult['error']);
            if (!$dbResult['success']) $hasErrors = true;
            
            // Fix orphaned folders and missing entries immediately after DB restore
            if ($dbResult['success']) {
                global $con;
                if (isset($con)) {
                    $repairResult = repairDatabaseEntries($con);
                    if ($repairResult['success'] && ($repairResult['folders_fixed'] > 0 || $repairResult['entries_fixed'] > 0)) {
                        $results[] = "Migration: Fixed {$repairResult['folders_fixed']} folders and {$repairResult['entries_fixed']} entry snippets";
                    }
                }
            }
            // Note: Schema migration is now handled inside restoreDatabaseFromFile()
        } else {
            $results[] = 'Database: No SQL file found in backup';
        }
        
        // Restore entries if entries directory exists in backup
        $entriesDir = $tempExtractDir . '/entries';
        if (is_dir($entriesDir)) {
            $entriesResult = restoreEntriesFromDir($entriesDir);
            $results[] = 'Notes: ' . ($entriesResult['success'] ? 'Restored ' . $entriesResult['count'] . ' files' : 'Failed - ' . $entriesResult['error']);
            if (!$entriesResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Notes: No entries directory found in backup (entries directory cleared)';
        }
        
        // Restore attachments if attachments directory exists in backup
        $attachmentsDir = $tempExtractDir . '/attachments';
        if (is_dir($attachmentsDir)) {
            $attachmentsResult = restoreAttachmentsFromDir($attachmentsDir);
            $results[] = 'Attachments: ' . ($attachmentsResult['success'] ? 'Restored ' . $attachmentsResult['count'] . ' files' : 'Failed - ' . $attachmentsResult['error']);
            if (!$attachmentsResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Attachments: No attachments directory found in backup (attachments directory cleared)';
        }
        
        // Clean up temporary directory
        deleteDirectory($tempExtractDir);
        $tempExtractDir = null; // Mark as cleaned
        
        // Ensure proper permissions after restoration
        ensureDataPermissions();
        
        return [
            'success' => !$hasErrors,
            'message' => implode("\n", $results),
            'error' => $hasErrors ? 'Some components failed to restore' : ''
        ];
        
    } catch (Exception $e) {
        // Clean up on error
        if ($tempFile && file_exists($tempFile)) {
            unlink($tempFile);
        }
        if ($tempExtractDir && is_dir($tempExtractDir)) {
            deleteDirectory($tempExtractDir);
        }
        return ['success' => false, 'error' => 'Exception during restore: ' . $e->getMessage()];
    }
}

/**
 * Restore database from SQL file
 */
function restoreDatabaseFromFile($sqlFile) {
    $content = file_get_contents($sqlFile);
    if (!$content) {
        return ['success' => false, 'error' => 'Cannot read SQL file'];
    }
    
    // Use the active database path from db_connect.php or determine it for the current user
    global $dbPath; 
    if (!isset($dbPath) || empty($dbPath)) {
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            $dbPath = $dataManager->getUserDatabasePath();
        } else {
            $dbPath = SQLITE_DATABASE;
        }
    }
    
    // Remove current database
    if (file_exists($dbPath)) {
        if (!unlink($dbPath)) {
            // If unlink fails (e.g. open handle), try to truncate the file
            if (file_put_contents($dbPath, '') === false) {
                return ['success' => false, 'error' => 'Failed to delete or clear existing database file. Please check permissions or restarting the service.'];
            }
        }
    }
    
    // Restore database
    $command = "sqlite3 {$dbPath} < {$sqlFile} 2>&1";
    
    exec($command, $output, $returnCode);
    
    if ($returnCode === 0) {
        // Ensure proper permissions on restored database
        setFilePermissions($dbPath, 0664);
        
        return ['success' => true];
    } else {
        $errorMessage = implode("\n", $output);
        return ['success' => false, 'error' => $errorMessage];
    }
}

// Note: schema migrations are handled at runtime by db_connect.php

/**
 * Restore entries from directory
 */
function restoreEntriesFromDir($sourceDir) {
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    $importedCount = 0;
    
    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
            
            // Include both HTML and Markdown files
            if ($extension === 'html' || $extension === 'md') {
                $content = file_get_contents($filePath);
                
                if ($content !== false) {
                    // Get note ID from filename (e.g., "123.html" -> "123")
                    $noteId = pathinfo($relativePath, PATHINFO_FILENAME);
                    
                    // Convert relative attachment paths back to API URLs
                    if ($extension === 'html') {
                        // Convert ../attachments/{attachmentId}.ext to /api/v1/notes/{noteId}/attachments/{attachmentId}
                        $content = preg_replace(
                            '#\.\./attachments/([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9]+)?#',
                            '/api/v1/notes/' . $noteId . '/attachments/$1',
                            $content
                        );
                    } else if ($extension === 'md') {
                        // Convert ![alt](../attachments/{attachmentId}.ext) to ![alt](/api/v1/notes/{noteId}/attachments/{attachmentId})
                        $content = preg_replace(
                            '#\!\[([^\]]*)\]\(\.\./attachments/([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9]+)?\)#',
                            '![$1](/api/v1/notes/' . $noteId . '/attachments/$2)',
                            $content
                        );
                    }
                    
                    $targetFile = $entriesPath . '/' . basename($relativePath);
                    if (file_put_contents($targetFile, $content) !== false) {
                        chmod($targetFile, 0644);
                        $importedCount++;
                    }
                } else {
                    // If reading fails, just copy the file as-is
                    $targetFile = $entriesPath . '/' . basename($relativePath);
                    if (copy($filePath, $targetFile)) {
                        chmod($targetFile, 0644);
                        $importedCount++;
                    }
                }
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

/**
 * Restore attachments from directory
 */
function restoreAttachmentsFromDir($sourceDir) {
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        return ['success' => false, 'error' => 'Cannot find attachments directory'];
    }
    
    // Read metadata file to get original filenames
    $metadataFile = $sourceDir . '/poznote_attachments_metadata.json';
    $idToFilenameMap = [];
    
    if (file_exists($metadataFile)) {
        $metadataContent = file_get_contents($metadataFile);
        $metadata = json_decode($metadataContent, true);
        
        if (is_array($metadata)) {
            foreach ($metadata as $item) {
                if (isset($item['attachment_data']['id']) && isset($item['attachment_data']['filename'])) {
                    $idToFilenameMap[$item['attachment_data']['id']] = $item['attachment_data']['filename'];
                }
            }
        }
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    $importedCount = 0;
    
    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $basename = basename($relativePath);
            
            // Skip metadata file
            if ($basename === 'poznote_attachments_metadata.json') {
                continue;
            }
            
            // Check if this file is named with an attachment ID (e.g., "abc123.jpg")
            // Extract ID without extension
            $filenameWithoutExt = pathinfo($basename, PATHINFO_FILENAME);
            
            // If we have a mapping for this ID, use the real filename
            if (isset($idToFilenameMap[$filenameWithoutExt])) {
                $targetFilename = $idToFilenameMap[$filenameWithoutExt];
            } else {
                // Otherwise, use the original basename (for backwards compatibility)
                $targetFilename = $basename;
            }
            
            $targetFile = $attachmentsPath . '/' . $targetFilename;
            if (copy($filePath, $targetFile)) {
                chmod($targetFile, 0644);
                $importedCount++;
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

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

// Helper function to ensure proper permissions on data directory
function ensureDataPermissions() {
    if (isset($_SESSION['user_id'])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($_SESSION['user_id']);
        $userDir = $dataManager->getUserBasePath();
        $dbPath = $dataManager->getUserDatabasePath();
        
        if (is_dir($userDir)) {
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                // Use shell command for recursive chown
                exec("chown -R www-data:www-data {$userDir} 2>/dev/null");
            }
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    } else {
        $dataDir = __DIR__ . '/data';
        if (is_dir($dataDir)) {
            // Recursively set ownership to match the data directory owner
            $dataOwner = fileowner($dataDir);
            $dataGroup = filegroup($dataDir);
            
            // Use shell command for recursive chown
            exec("chown -R {$dataOwner}:{$dataGroup} {$dataDir} 2>/dev/null");
            
            // Ensure database file has write permissions
            $dbPath = $dataDir . '/database/poznote.db';
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    }
}

/**
 * Get the complete folder path including parent folders
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return string The complete folder path (e.g., "Parent/Child")
 */
function getFolderPath($folder_id, $con) {
    static $cache = [];
    static $folderData = null;
    
    if ($folder_id === null || $folder_id === 0) {
        return 'Default';
    }
    
    // Return cached path if available
    if (isset($cache[$folder_id])) {
        return $cache[$folder_id];
    }
    
    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }
    
    $path = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        
        // Add folder name to the beginning of the path
        array_unshift($path, $folder['name']);
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    $result = !empty($path) ? implode('/', $path) : 'Default';
    $cache[$folder_id] = $result;
    return $result;
}

/**
 * Fix database inconsistencies in notes:
 * 1. Populates folder_id from legacy folder (TEXT) column.
 * 2. Re-generates search snippets (entry column) from physical files if empty.
 * 
 * @param PDO $con The database connection
 * @return array Results of the repair operation
 */
function repairDatabaseEntries($con) {
    if (!$con) return ['success' => false, 'error' => 'No database connection'];
    
    $fixedFolders = 0;
    $createdFolders = 0;
    $fixedEntries = 0;
    
    try {
        // --- PART 1: FOLDERS MIGRATION ---
        // Only repair notes that are NOT in trash to avoid re-creating deleted folders
        $stmt = $con->query("SELECT id, folder, workspace FROM entries WHERE folder IS NOT NULL AND folder != '' AND folder_id IS NULL AND trash = 0");
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($notes as $note) {
            $noteId = $note['id'];
            $folderName = $note['folder'];
            $workspace = $note['workspace'] ?: 'Poznote';
            
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? LIMIT 1");
            $checkStmt->execute([$folderName, $workspace]);
            $folder = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                $folderId = $folder['id'];
            } else {
                $insertStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                $insertStmt->execute([$folderName, $workspace]);
                $folderId = $con->lastInsertId();
                $createdFolders++;
            }
            
            $updateStmt = $con->prepare("UPDATE entries SET folder_id = ? WHERE id = ?");
            $updateStmt->execute([$folderId, $noteId]);
            $fixedFolders++;
        }

        // --- PART 2: EMPTY ENTRY SNIPPETS (FOR SEARCH) ---
        $stmt = $con->query("SELECT id, type FROM entries WHERE (entry IS NULL OR entry = '') AND trash = 0");
        $emptyNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($emptyNotes as $note) {
            $noteId = $note['id'];
            $type = $note['type'] ?: 'note';
            $filePath = getEntryFilename($noteId, $type);
            
            if (file_exists($filePath)) {
                $content = file_get_contents($filePath);
                if ($content !== false) {
                    // Extract a clean snippet for search
                    $snippet = cleanContentForSearch($content);
                    $snippet = strip_tags($snippet);
                    $snippet = mb_substr($snippet, 0, 500); // Limit to 500 chars for DB performance
                    
                    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$snippet, $noteId]);
                    $fixedEntries++;
                }
            }
        }
        return [
            'success' => true, 
            'folders_fixed' => $fixedFolders, 
            'folders_created' => $createdFolders,
            'entries_fixed' => $fixedEntries
        ];
    } catch (Exception $e) {
        error_log("Error in repairDatabaseEntries: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Unescape iframe HTML entities in content
 * This fixes notes that were created with HTML-escaped iframe tags
 * (e.g., &lt;iframe&gt; becomes <iframe>)
 * Only unescapes iframes from whitelisted domains for security
 */
function unescapeIframesInHtml($content) {
    if (empty($content)) {
        return $content;
    }
    
    // Find escaped iframe tags: &lt;iframe...&gt;&lt;/iframe&gt;
    $pattern = '/&lt;iframe\s+([^&]+)&gt;\s*&lt;\/iframe&gt;/i';
    
    return preg_replace_callback($pattern, function($matches) {
        $escapedAttrs = $matches[1];
        // Unescape the attributes
        $attrs = html_entity_decode($escapedAttrs, ENT_QUOTES, 'UTF-8');
        
        // Extract src attribute to validate domain
        if (preg_match('/src\s*=\s*["\']([^"\']+)["\']/i', $attrs, $srcMatch)) {
            $src = $srcMatch[1];
            
            $allowedDomains = ALLOWED_IFRAME_DOMAINS;
            
            // Check if domain is whitelisted
            $isAllowed = false;
            foreach ($allowedDomains as $domain) {
                if (stripos($src, '//' . $domain) !== false || stripos($src, '.' . $domain) !== false) {
                    $isAllowed = true;
                    break;
                }
            }
            
            if ($isAllowed) {
                // Return unescaped iframe
                return '<iframe ' . $attrs . '></iframe>';
            }
        }
        
        // If not whitelisted, keep it escaped for security
        return $matches[0];
    }, $content);
}

/**
 * Unescape audio/video tags that were saved as escaped HTML
 * Keeps the escaped tag if the src is not a safe URL
 */
function unescapeMediaInHtml($content) {
    if (empty($content)) {
        return $content;
    }

    // Unescape iframes first (keeps existing behavior)
    $content = unescapeIframesInHtml($content);

    $unescapeMediaTag = function($matches, $tagName) {
        $escapedAttrs = $matches[1];
        $attrs = html_entity_decode($escapedAttrs, ENT_QUOTES, 'UTF-8');

        // Strip inline event handlers for safety
        $attrs = preg_replace('/\s+on[a-zA-Z]+=("[^"]*"|\'[^\']*\'|[^\s>]*)/i', '', $attrs);

        if (preg_match('/src\s*=\s*["\']([^"\']+)["\']/i', $attrs, $srcMatch)) {
            $src = $srcMatch[1];
            $isAllowed = preg_match('/^https?:\/\//i', $src)
                || preg_match('/^\//', $src)
                || preg_match('/^\.\.\//', $src)
                || preg_match('/^\.\//', $src);

            if ($isAllowed) {
                return '<' . $tagName . ' ' . $attrs . '></' . $tagName . '>';
            }
        }

        return $matches[0];
    };

    // Unescape audio tags
    $content = preg_replace_callback('/&lt;audio\s+([^&]+)&gt;\s*&lt;\/audio&gt;/i', function($matches) use ($unescapeMediaTag) {
        return $unescapeMediaTag($matches, 'audio');
    }, $content);

    // Unescape video tags
    $content = preg_replace_callback('/&lt;video\s+([^&]+)&gt;\s*&lt;\/video&gt;/i', function($matches) use ($unescapeMediaTag) {
        return $unescapeMediaTag($matches, 'video');
    }, $content);

    return $content;
}

/**
 * Resolve folder path to ID, optionally creating missing segments
 * 
 * @param string $workspace The workspace name
 * @param string $folderPath The full folder path (e.g., "A/B/C")
 * @param bool $createIfMissing Whether to create folders if they don't exist
 * @param PDO $con Database connection
 * @return int|null The resolved folder ID or null if not found/created
 */
function resolveFolderPathToId($workspace, $folderPath, $createIfMissing = false, $con = null) {
    if ($con === null) {
        global $con;
    }
    if (!$con) return null;

    $folderPath = trim($folderPath);
    if ($folderPath === '' || strtolower($folderPath) === 'default') return null;
    
    $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
    if (empty($segments)) return null;
    
    $parentId = null;
    foreach ($segments as $seg) {
        $sql = "SELECT id FROM folders WHERE name = ? AND workspace = ?";
        $params = [$seg, $workspace];
        if ($parentId === null) {
            $sql .= " AND parent_id IS NULL";
        } else {
            $sql .= " AND parent_id = ?";
            $params[] = $parentId;
        }
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) {
            $parentId = (int)$row['id'];
        } elseif ($createIfMissing) {
            // Create the folder segment
            $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
            $stmt->execute([$seg, $workspace, $parentId]);
            $parentId = (int)$con->lastInsertId();
        } else {
            return null;
        }
    }
    
    return $parentId;
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * This function removes dangerous HTML tags and attributes that could be used
 * for Cross-Site Scripting (XSS) attacks while preserving safe formatting.
 * 
 * @param string $html The HTML content to sanitize
 * @return string The sanitized HTML content
 */
function sanitizeHtml($html) {
    if (empty($html)) {
        return $html;
    }
    
    // Allowed HTML tags (safe formatting tags)
    $allowedTags = [
        'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'blockquote', 'pre', 'code', 'hr',
        'img', 'figure', 'figcaption',
        'details', 'summary',
        'mark', 'small', 'sub', 'sup',
        'abbr', 'cite', 'q', 'time',
        'input', 'label', // For task lists
        'iframe', // For YouTube, Vimeo embeds (validated separately)
        'video', // For MP4 embeds
        'audio', // For audio embeds
        'button', 'i', // For Excalidraw buttons and icons
        'aside', // For callout/quote blocks
        'svg', 'path', 'rect', 'polyline' // For callout icons (SVG)
    ];
    
    // Allowed attributes per tag
    $allowedAttrs = [
        'a' => ['href', 'title', 'target', 'rel'],
        'img' => ['src', 'alt', 'title', 'width', 'height', 'data-is-excalidraw', 'data-excalidraw-note-id'],
        'td' => ['colspan', 'rowspan'],
        'th' => ['colspan', 'rowspan', 'scope'],
        'div' => ['class', 'data-tasklist-json', 'data-markdown-content', 'data-excalidraw', 'data-diagram-id', 'contenteditable'],
        'span' => ['class'],
        'input' => ['type', 'checked', 'disabled'],
        'time' => ['datetime'],
        'blockquote' => ['cite'],
        'q' => ['cite'],
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'title', 'sandbox'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'],
        'button' => ['class', 'data-action'],
        'svg' => ['viewBox', 'width', 'height', 'aria-hidden', 'fill', 'xmlns', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'path' => ['d', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'rect' => ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
        'polyline' => ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']
    ];
    
    // Global allowed attributes (safe for all tags)
    $globalAllowedAttrs = ['id', 'class', 'style'];
    
    // Dangerous patterns to remove
    $dangerousPatterns = [
        // Remove javascript: protocol
        '/javascript:/i',
        // Remove data: protocol (except for images which we'll handle separately)
        '/data:(?!image\/)/i',
        // Remove vbscript: protocol
        '/vbscript:/i'
    ];
    
    // Note: We don't do regex-based removal here because it's blind to context
    // (e.g., it would remove <script> even inside <code> blocks where it's legitimate)
    // Instead, we let DOMDocument handle everything as it understands HTML structure
    
    // Use DOMDocument for more precise sanitization
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->encoding = 'UTF-8';
    
    // Load HTML with UTF-8 encoding
    // Use HTML5 meta tag instead of XML declaration to avoid it appearing in output
    $wrappedHtml = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' . $html . '</body></html>';
    @$dom->loadHTML($wrappedHtml, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    
    $xpath = new DOMXPath($dom);
    
    // Remove all disallowed tags
    $allElements = $xpath->query('//body//*');
    $elementsToRemove = [];
    
    foreach ($allElements as $element) {
        $tagName = strtolower($element->tagName);
        
        // Check if this element is inside a <code> or <pre> block
        $isInCodeBlock = false;
        $parent = $element->parentNode;
        while ($parent && $parent->nodeType === XML_ELEMENT_NODE) {
            $parentTag = strtolower($parent->tagName);
            if ($parentTag === 'code' || $parentTag === 'pre') {
                $isInCodeBlock = true;
                break;
            }
            $parent = $parent->parentNode;
        }
        
        // If it's a dangerous tag inside a code block, encode it as text instead of removing
        if ($isInCodeBlock && in_array($tagName, ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'style'])) {
            // Convert the element to text (encode it)
            $encodedTag = htmlspecialchars($element->ownerDocument->saveHTML($element), ENT_QUOTES, 'UTF-8');
            $textNode = $element->ownerDocument->createTextNode($encodedTag);
            $element->parentNode->replaceChild($textNode, $element);
            continue;
        }
        
        // If tag is not in allowed list, mark for removal
        if (!in_array($tagName, $allowedTags)) {
            $elementsToRemove[] = $element;
            continue;
        }
        
        // Check and sanitize attributes
        $attributesToRemove = [];
        foreach ($element->attributes as $attr) {
            $attrName = strtolower($attr->name);
            $attrValue = $attr->value;
            
            // Check if attribute is allowed for this tag
            $tagAllowedAttrs = $allowedAttrs[$tagName] ?? [];
            $isAllowed = in_array($attrName, $tagAllowedAttrs) || in_array($attrName, $globalAllowedAttrs);
            
            if (!$isAllowed) {
                $attributesToRemove[] = $attrName;
                continue;
            }
            
            // Check for dangerous patterns in attribute values
            foreach ($dangerousPatterns as $pattern) {
                if (preg_match($pattern, $attrValue)) {
                    $attributesToRemove[] = $attrName;
                    continue 2;
                }
            }
            
            // Special validation for href and src attributes
            if ($attrName === 'href' || $attrName === 'src') {
                // For iframes, validate that src is from trusted domains or local paths
                if ($tagName === 'iframe' && $attrName === 'src') {
                    $allowedIframeDomains = ALLOWED_IFRAME_DOMAINS;
                    
                    $isTrustedIframe = false;
                    
                    // Allow local/relative paths (e.g., /audio_player.php)
                    if (strpos($attrValue, '/') === 0 || strpos($attrValue, './') === 0) {
                        $isTrustedIframe = true;
                    } else {
                        // Check trusted domains
                        foreach ($allowedIframeDomains as $domain) {
                            if (stripos($attrValue, '//' . $domain) !== false || stripos($attrValue, 'https://' . $domain) !== false) {
                                $isTrustedIframe = true;
                                break;
                            }
                        }
                    }
                    
                    if (!$isTrustedIframe) {
                        // Not a trusted iframe source - mark entire element for removal
                        $elementsToRemove[] = $element;
                        break; // Exit attribute loop
                    }
                    continue;
                }
                
                // Allow http, https, mailto, and relative URLs
                // Allow data:image for images
                if ($attrName === 'src' && $tagName === 'img' && strpos($attrValue, 'data:image/') === 0) {
                    // Allow data:image URLs for images
                    continue;
                }
                
                if (!preg_match('/^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i', $attrValue) && 
                    strpos($attrValue, 'data:') !== 0) {
                    // If it doesn't start with allowed protocols, it might be relative - keep it
                    // but if it contains suspicious patterns, remove it
                    if (preg_match('/[<>"\']/', $attrValue)) {
                        $attributesToRemove[] = $attrName;
                    }
                }
            }
        }
        
        // Remove dangerous attributes
        foreach ($attributesToRemove as $attrName) {
            $element->removeAttribute($attrName);
        }
    }
    
    // Remove disallowed elements
    foreach ($elementsToRemove as $element) {
        if ($element->parentNode) {
            $element->parentNode->removeChild($element);
        }
    }
    
    // Get the sanitized HTML (only body content)
    $body = $dom->getElementsByTagName('body')->item(0);
    if ($body) {
        $sanitized = '';
        foreach ($body->childNodes as $child) {
            $sanitized .= $dom->saveHTML($child);
        }
    } else {
        $sanitized = $dom->saveHTML();
    }
    
    // Trim whitespace
    $sanitized = trim($sanitized);
    
    // Clean up any remaining dangerous patterns that might have been encoded
    $sanitized = str_replace(['&lt;script', '&lt;/script'], '', $sanitized);
    
    libxml_clear_errors();
    
    return $sanitized;
}

/**
 * Sanitize Markdown content to prevent XSS attacks
 * 
 * Unlike sanitizeHtml(), this function works on raw Markdown text without
 * using DOMDocument, which would mangle Markdown syntax characters like >.
 * It removes dangerous HTML patterns that could be embedded in Markdown
 * while preserving all Markdown syntax.
 * 
 * @param string $markdown The raw Markdown content to sanitize
 * @return string The sanitized Markdown content
 */
function sanitizeMarkdownContent($markdown) {
    if (empty($markdown)) {
        return $markdown;
    }

    // Remove <script> tags and their content
    $markdown = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $markdown);

    // Remove <style> tags and their content
    $markdown = preg_replace('/<style\b[^>]*>.*?<\/style>/is', '', $markdown);

    // Remove <object>, <embed>, <applet> tags and their content
    $markdown = preg_replace('/<(object|embed|applet)\b[^>]*>.*?<\/\1>/is', '', $markdown);
    $markdown = preg_replace('/<(object|embed|applet)\b[^>]*\/?>/is', '', $markdown);

    // Remove <form> tags and their content
    $markdown = preg_replace('/<form\b[^>]*>.*?<\/form>/is', '', $markdown);

    // Remove on* event handlers from any HTML tags embedded in markdown
    $markdown = preg_replace('/(<[^>]*)\s+on\w+\s*=\s*(["\']).*?\2/is', '$1', $markdown);
    $markdown = preg_replace('/(<[^>]*)\s+on\w+\s*=\s*[^\s>]*/is', '$1', $markdown);

    // Remove javascript: and vbscript: protocols from href/src attributes
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*javascript:/is', '$1=$2', $markdown);
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*vbscript:/is', '$1=$2', $markdown);

    return $markdown;
}
