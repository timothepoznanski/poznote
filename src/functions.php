<?php
date_default_timezone_set('UTC');

function formatDate($t) {
	return date('j M Y',$t);
}

function formatDateTime($t) {
	return formatDate($t)." à ".date('H:i',$t);
}

/**
 * Get the correct entries directory path
 * Now unified: always use 'data/entries' directory in webroot
 */
function getEntriesPath() {
    // Always use the data/entries path relative to the project root
    $path = realpath(dirname(__DIR__) . '/data/entries');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create entries directory in data location
    // This should rarely happen as Docker creates the directories
    $entriesDir = dirname(__DIR__) . '/data/entries';
    if (!is_dir($entriesDir)) {
        if (!mkdir($entriesDir, 0755, true)) {
            error_log("Failed to create data/entries directory");
            return false;
        }
        
        // Set proper permissions
        chmod($entriesDir, 0755);
        
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown($entriesDir, 'www-data');
            chgrp($entriesDir, 'www-data');
        }
    }
    return realpath($entriesDir);
}

/**
 * Get the correct attachments directory path (dev or prod environment)
 * Now unified: always use 'data/attachments' directory in webroot
 */
function getAttachmentsPath() {
    // Always use the data/attachments path relative to the project root
    $path = realpath(dirname(__DIR__) . '/data/attachments');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create attachments directory in data location
    // This should rarely happen as Docker creates the directories
    $attachmentsDir = dirname(__DIR__) . '/data/attachments';
    if (!is_dir($attachmentsDir)) {
        if (!mkdir($attachmentsDir, 0755, true)) {
            error_log("Failed to create data/attachments directory");
            return false;
        }
        
        // Set proper permissions
        chmod($attachmentsDir, 0755);
        
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown($attachmentsDir, 'www-data');
            chgrp($attachmentsDir, 'www-data');
        }
        
        error_log("Created attachments directory: " . realpath($attachmentsDir));
    }
    return realpath($attachmentsDir);
}

/**
 * Get the relative path for entries (for file operations)
 * Use relative path from webroot for Docker compatibility
 */
function getEntriesRelativePath() {
    return 'data/entries/';
}

/**
 * Get the relative path for attachments (for file operations)
 * Use relative path from webroot for Docker compatibility
 */
function getAttachmentsRelativePath() {
    return 'data/attachments/';
}

/**
 * Get absolute path for entries directory (for API operations)
 */
function getEntriesAbsolutePath() {
    // In container context, data is at /var/www/html/data
    $path = realpath(__DIR__ . '/data/entries');
    if ($path && is_dir($path)) {
        return $path;
    }
    // Fallback for development environment
    $path = realpath(dirname(__DIR__) . '/data/entries');
    return $path ?: __DIR__ . '/data/entries';
}

/**
 * Get absolute path for attachments directory (for API operations)
 */
function getAttachmentsAbsolutePath() {
    // In container context, data is at /var/www/html/data
    $path = realpath(__DIR__ . '/data/attachments');
    if ($path && is_dir($path)) {
        return $path;
    }
    // Fallback for development environment
    $path = realpath(dirname(__DIR__) . '/data/attachments');
    return $path ?: __DIR__ . '/data/attachments';
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
    return getEntriesRelativePath() . $id . $extension;
}

/**
 * Get the current workspace filter from GET/POST parameters
 * Priority order:
 * 1. GET/POST parameter (highest priority)
 * 2. Database setting 'default_workspace' (if set to a specific workspace name)
 *    Special value '__last_opened__' means use localStorage
 * 3. localStorage 'poznote_selected_workspace' (handled by index.php redirect)
 * 4. Fallback to 'Poznote' (default)
 * 
 * @return string The workspace name
 */
function getWorkspaceFilter() {
    // First check URL parameters
    if (isset($_GET['workspace'])) {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace'])) {
        return $_POST['workspace'];
    }
    
    // If no parameter, check for default workspace setting in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $defaultWorkspace = $stmt->fetchColumn();
            if ($defaultWorkspace !== false && $defaultWorkspace !== '') {
                return $defaultWorkspace;
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
        }
    }
    
    // Final fallback
    // Note: localStorage is checked by index.php before this function is called
    return 'Poznote';
}

/**
 * Generate a unique note title to prevent duplicates
 * Default to "New note" when empty.
 * If a title already exists, add a numeric suffix like " (1)", " (2)", ...
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = 'New note';
    }
    
    // Check if title already exists (excluding the current note if updating)
    $query = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0";
    $params = [$title];

    // If workspace specified, restrict uniqueness to that workspace
    if ($workspace !== null) {
        $query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $params[] = $workspace;
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
function createNote($con, $heading, $content, $folder = 'Default', $workspace = 'Poznote', $favorite = 0, $tags = '', $type = 'note') {
    try {
        // Insert note into database
        $stmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, workspace, type, favorite, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");
        
        if (!$stmt->execute([$heading, $content, $tags, $folder, $workspace, $type, $favorite])) {
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
        $entriesPath = getEntriesAbsolutePath();
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
        $attachmentsPath = getAttachmentsAbsolutePath();
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

/**
 * Restore entries from directory
 */
function restoreEntriesFromDir($sourceDir) {
    $entriesPath = getEntriesAbsolutePath();
    
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
    $attachmentsPath = getAttachmentsAbsolutePath();
    
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
?>
