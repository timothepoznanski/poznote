<?php
date_default_timezone_set('UTC');

function formatDate($t) {
	return date('j M Y',$t);
}

function formatDateTime($t) {
	return formatDate($t)." à ".date('H:i',$t);
}

/**
 * Get the correct entries directory path (dev or prod environment)
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
        mkdir('data/entries', 0755, true);
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
        if (!mkdir('data/attachments', 0777, true)) {
            error_log("Failed to create data/attachments directory");
            return false;
        }
        
        // Set proper permissions
        chmod('data/attachments', 0777);
        
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
?>
