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
    // Always use the data/entries path - Docker volumes handle the mapping
    $path = realpath('data/entries');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create entries directory in data location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('data/entries')) {
        if (!mkdir('data/entries', 0755, true)) {
            error_log("Failed to create data/entries directory");
            return false;
        }
        
        // Set proper permissions
        chmod('data/entries', 0755);
        
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('data/entries', 'www-data');
            chgrp('data/entries', 'www-data');
        }
    }
    return realpath('data/entries');
}

/**
 * Get the correct attachments directory path (dev or prod environment)
 * Now unified: always use 'data/attachments' directory in webroot
 */
function getAttachmentsPath() {
    // Always use the data/attachments path - Docker volumes handle the mapping
    $path = realpath('data/attachments');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create attachments directory in data location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('data/attachments')) {
        if (!mkdir('data/attachments', 0755, true)) {
            error_log("Failed to create data/attachments directory");
            return false;
        }
        
        // Set proper permissions
        chmod('data/attachments', 0755);
        
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('data/attachments', 'www-data');
            chgrp('data/attachments', 'www-data');
        }
        
        error_log("Created attachments directory: " . realpath('data/attachments'));
    }
    return realpath('data/attachments');
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
 * Get the current workspace filter from GET/POST parameters
 * @return string The workspace name, defaults to 'Poznote'
 */
function getWorkspaceFilter() {
    return $_GET['workspace'] ?? $_POST['workspace'] ?? 'Poznote';
}

 

/**
 * Check if AI features are enabled
 */
function isAIEnabled() {
    global $con;
    
    try {
        $stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute(['ai_enabled']);
        $ai_enabled = $stmt->fetchColumn();
        
        // Default to enabled (true) if setting doesn't exist
        return ($ai_enabled === null) ? true : ($ai_enabled === '1');
    } catch (Exception $e) {
        // Default to enabled if there's an error
        return true;
    }
}

/**
 * Generate a unique note title to prevent duplicates
 * For "Untitled note", adds date and time
 * For other titles, adds a suffix number if duplicate exists
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = 'Untitled note';
    }
    
    // For "Untitled note", always add date and time in YYMMddHHmmss format
    if ($title === 'Untitled note') {
        $dateTime = date('ymdHis'); // Format: YYMMddHHmmss
        $title = 'Untitled-note-' . $dateTime;
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
        
        // Create the HTML file for the note content
        $filename = getEntriesRelativePath() . $noteId . ".html";
        
        // Ensure the entries directory exists
        $entriesDir = dirname($filename);
        if (!is_dir($entriesDir)) {
            mkdir($entriesDir, 0755, true);
        }
        
        // Write HTML content to file
        if (!empty($content)) {
            $write_result = file_put_contents($filename, $content);
            if ($write_result === false) {
                // Log error but don't fail since DB entry was successful
                error_log("Failed to write HTML file for note ID $noteId: $filename");
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
?>
