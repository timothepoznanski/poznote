<?php
date_default_timezone_set('UTC');

/**
 * Internationalization (i18n)
 * - Uses JSON dictionaries in src/i18n/{lang}.json
 * - Active language stored in settings table key: 'language'
 * - Fallback to English when a key is missing
 */

function getUserLanguage() {
    global $con;
    try {
        if (isset($con)) {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['language']);
            $lang = $stmt->fetchColumn();
            if ($lang && is_string($lang)) {
                $lang = strtolower(trim($lang));
                // Basic allowlist: keep it simple and safe
                if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
                    return $lang;
                }
            }
        }
    } catch (Exception $e) {
        // Ignore errors
    }
    return 'en';
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
    global $con;
    try {
        if (isset($con)) {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['timezone']);
            $timezone = $stmt->fetchColumn();
            if ($timezone && $timezone !== '') {
                return $timezone;
            }
        }
    } catch (Exception $e) {
        // Ignore errors
    }
    return defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
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
 */
function getEntriesPath() {
    return __DIR__ . '/data/entries';
}

/**
 * Get the attachments directory path
 */
function getAttachmentsPath() {
    return __DIR__ . '/data/attachments';
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
    // First check URL parameters - but ignore if empty
    if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace']) && $_POST['workspace'] !== '') {
        return $_POST['workspace'];
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
                    return $defaultWorkspace;
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
                    return $lastOpened;
                }
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
        }
    }
    
    // Final fallback: get first available workspace
    return getFirstWorkspaceName();
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
        $title = 'New note';
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
            // For locally created files (like from chunked upload)
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
        $dataDir = dirname(__DIR__) . '/data';
        $requiredDirs = ['attachments', 'database', 'entries'];
        foreach ($requiredDirs as $dir) {
            $fullPath = $dataDir . '/' . $dir;
            if (!is_dir($fullPath)) {
                mkdir($fullPath, 0755, true);
                // Set proper ownership if running as root (Docker context)
                if (function_exists('posix_getuid') && posix_getuid() === 0) {
                    $current_uid = posix_getuid();
                    $current_gid = posix_getgid();
                    chown($fullPath, $current_uid);
                    chgrp($fullPath, $current_gid);
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
            'message' => implode('; ', $results),
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
    
    $dbPath = SQLITE_DATABASE;
    
    // Remove current database
    if (file_exists($dbPath)) {
        unlink($dbPath);
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
    $dataDir = dirname(__DIR__) . '/data';
    if (is_dir($dataDir)) {
        // Recursively set ownership to match the data directory owner
        $dataOwner = fileowner($dataDir);
        $dataGroup = filegroup($dataDir);
        
        // Use shell command for recursive chown since PHP chown is not recursive
        exec("chown -R {$dataOwner}:{$dataGroup} {$dataDir} 2>/dev/null");
        
        // Ensure database file has write permissions
        $dbPath = $dataDir . '/database/poznote.db';
        if (file_exists($dbPath)) {
            chmod($dbPath, 0664);
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
    if ($folder_id === null || $folder_id === 0) {
        return 'Default';
    }
    
    $path = [];
    $currentId = $folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && $depth < $maxDepth) {
        $stmt = $con->prepare("SELECT name, parent_id FROM folders WHERE id = ?");
        $stmt->execute([$currentId]);
        $folder = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$folder) {
            break;
        }
        
        // Add folder name to the beginning of the path
        array_unshift($path, $folder['name']);
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    return !empty($path) ? implode('/', $path) : 'Default';
}
?>
