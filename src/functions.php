<?php
date_default_timezone_set('UTC');

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
 * Clear settings cache (call after updating settings)
 */
function clearSettingsCache() {
    static $cache = null;
    $cache = null;
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

function formatDate($t) {
	return date('j M Y',$t);
}

function formatDateTime($t) {
	return formatDate($t)." à ".date('H:i',$t);
}

/**
 * Get the entries directory path
 * Returns the path for the current user
 */
function getEntriesPath() {
    global $activeUserId;
    $userId = $_SESSION['user_id'] ?? $activeUserId;
    
    if ($userId) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->getUserEntriesPath();
    }
    // Fallback for unauthenticated access (should not happen in normal use)
    return __DIR__ . '/data/entries';
}

/**
 * Get the attachments directory path
 * Returns the path for the current user
 */
function getAttachmentsPath() {
    global $activeUserId;
    $userId = $_SESSION['user_id'] ?? $activeUserId;

    if ($userId) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->getUserAttachmentsPath();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/data/attachments';
}

/**
 * Get the backups directory path
 * Returns the path for the current user
 */
function getBackupsPath() {
    global $activeUserId;
    $userId = $_SESSION['user_id'] ?? $activeUserId;

    if ($userId) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->getUserBackupsPath();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/data/backups';
}

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
 * Create a new note with both database entry and HTML file
 * This is the standard way to create notes used throughout the application
 */
function createNote($con, $heading, $content, $folder = 'Default', $workspace = null, $favorite = 0, $tags = '', $type = 'note') {
    // If no workspace provided, get first available
    if ($workspace === null || $workspace === '') {
        $workspace = getFirstWorkspaceName();
    }
    try {
        // Get folder_id from folder name
        $folder_id = null;
        if ($folder !== null) {
            $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
            $fStmt->execute([$folder, $workspace]);
            $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folder_id = (int)$folderData['id'];
            }
        }
        
        // Insert note into database
        $stmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, favorite, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");
        
        if (!$stmt->execute([$heading, $content, $tags, $folder, $folder_id, $workspace, $type, $favorite])) {
            return ['success' => false, 'error' => 'Failed to insert note into database'];
        }
        
        $noteId = $con->lastInsertId();
        
        // If folder is shared, auto-share the new note
        if ($folder_id) {
            $sharedFolderStmt = $con->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
            $sharedFolderStmt->execute([$folder_id]);
            $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($sharedFolder) {
                $noteToken = bin2hex(random_bytes(16));
                $insertShareStmt = $con->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                $insertShareStmt->execute([$noteId, $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
            }
        }
        
        // Create the file for the note content with appropriate extension
        $filename = getEntryFilename($noteId, $type);
        
        // Ensure the entries directory exists
        $entriesDir = dirname($filename);
        if (!is_dir($entriesDir)) {
            mkdir($entriesDir, 0755, true);
        }
        
        // Write content to file
        if (!empty($content)) {
            $write_result = file_put_contents($filename, $content);
            if ($write_result === false) {
                // Log error but don't fail since DB entry was successful
                error_log("Failed to write file for note ID $noteId: $filename");
                return ['success' => false, 'error' => 'Failed to create HTML file', 'id' => $noteId];
            }
            
            // Set proper permissions
            chmod($filename, 0644);
            
            // Set proper ownership if running as root (Docker context)
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                chown($filename, 'www-data');
                chgrp($filename, 'www-data');
            }
        }
        
        return ['success' => true, 'id' => $noteId];
        
    } catch (Exception $e) {
        error_log("Error creating note: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
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
        if (!mkdir($tempExtractDir, 0755, true)) {
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
            mkdir($entriesPath, 0755, true);
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                $current_uid = posix_getuid();
                $current_gid = posix_getgid();
                chown($entriesPath, $current_uid);
                chgrp($entriesPath, $current_gid);
            }
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
            mkdir($attachmentsPath, 0755, true);
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                $current_uid = posix_getuid();
                $current_gid = posix_getgid();
                chown($attachmentsPath, $current_uid);
                chgrp($attachmentsPath, $current_gid);
            }
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
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            $current_uid = posix_getuid();
            $current_gid = posix_getgid();
            chown($dbPath, $current_uid);
            chgrp($dbPath, $current_gid);
        }
        chmod($dbPath, 0664);
        
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
                $targetFile = $entriesPath . '/' . basename($relativePath);
                if (copy($filePath, $targetFile)) {
                    chmod($targetFile, 0644);
                    $importedCount++;
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
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    $importedCount = 0;
    
    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            
            // Skip metadata file
            if (basename($relativePath) === 'poznote_attachments_metadata.json') {
                continue;
            }
            
            $targetFile = $attachmentsPath . '/' . basename($relativePath);
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
?>
