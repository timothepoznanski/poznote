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
 * Now unified: always use 'entries' directory in webroot
 */
function getEntriesPath() {
    // Always use the same path - Docker volumes handle the mapping
    $path = realpath('entries');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create entries directory in current location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('entries')) {
        mkdir('entries', 0755, true);
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('entries', 'www-data');
            chgrp('entries', 'www-data');
        }
    }
    return realpath('entries');
}

/**
 * Get the correct attachments directory path (dev or prod environment)
 * Now unified: always use 'attachments' directory in webroot
 */
function getAttachmentsPath() {
    // Always use the same path - Docker volumes handle the mapping
    $path = realpath('attachments');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create attachments directory in current location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('attachments')) {
        mkdir('attachments', 0755, true);
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('attachments', 'www-data');
            chgrp('attachments', 'www-data');
        }
    }
    return realpath('attachments');
}

/**
 * Get the relative path for entries (for file operations)
 * Now unified: always use 'entries/' 
 */
function getEntriesRelativePath() {
    return 'entries/';
}

/**
 * Get the relative path for attachments (for file operations)
 * Now unified: always use 'attachments/'
 */
function getAttachmentsRelativePath() {
    return 'attachments/';
}
?>
