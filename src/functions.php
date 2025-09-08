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
    // Try parent directory path first (for direct execution and to avoid empty src/data/entries)
    $parent_path = realpath(dirname(__DIR__) . '/data/entries');
    
    if ($parent_path && is_dir($parent_path)) {
        // Check if this directory actually contains files
        $files = scandir($parent_path);
        if (count($files) > 2) { // More than just . and ..
            return $parent_path;
        }
    }
    
    // Try relative path (for Docker context)
    $path = realpath('data/entries');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create entries directory in data location
    // This should rarely happen as Docker creates the directories
    $data_path = dirname(__DIR__) . '/data/entries';
    if (!is_dir($data_path)) {
        mkdir($data_path, 0755, true);
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown($data_path, 'www-data');
            chgrp($data_path, 'www-data');
        }
    }
    return realpath($data_path);
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
 * Detect the primary language of a text (French or English)
 * @param string $text The text to analyze
 * @return string 'fr' for French, 'en' for English, 'unknown' if unable to determine
 */
function detectLanguage($text) {
    if (empty($text)) {
        return 'unknown';
    }
    
    // Convert to lowercase for analysis
    $text = mb_strtolower($text);
    
    // French-specific patterns
    $french_patterns = [
        '/\b(je|tu|il|elle|nous|vous|ils|elles)\b/', // pronouns
        '/\b(et|ou|mais|donc|car|ni|soit)\b/', // conjunctions
        '/\b(le|la|les|un|une|des|du|de|d\'|à|a|au|aux)\b/', // articles
        '/\b(est|sont|était|étaient|sera|seront)\b/', // forms of être
        '/\b(avec|sans|chez|dans|sur|sous|pour|par|entre)\b/', // prepositions
        '/\b(que|qui|quoi|dont|où|comment|pourquoi|quand)\b/', // question words
        '/\b(ce|cette|ces|mon|ton|son|notre|votre|leur)\b/', // demonstratives/possessives
        '/à|é|è|ê|ë|ï|î|ô|ù|û|ü|ÿ|ç/', // French accented characters
    ];
    
    // English-specific patterns
    $english_patterns = [
        '/\b(i|you|he|she|it|we|they|me|him|her|us|them)\b/', // pronouns
        '/\b(and|or|but|so|because|although|though|while)\b/', // conjunctions
        '/\b(the|a|an|this|that|these|those|my|your|his|her|our|their)\b/', // articles/demonstratives
        '/\b(is|are|was|were|will|be|been|being|am)\b/', // forms of be
        '/\b(with|without|at|in|on|by|for|from|into|through)\b/', // prepositions
        '/\b(what|who|where|when|why|how|which|whose)\b/', // question words
        '/\b(this|that|these|those|my|your|his|her|its|our|their)\b/', // demonstratives/possessives
    ];
    
    $french_score = 0;
    $english_score = 0;
    
    // Count French patterns
    foreach ($french_patterns as $pattern) {
        if (preg_match_all($pattern, $text, $matches)) {
            $french_score += count($matches[0]);
        }
    }
    
    // Count English patterns
    foreach ($english_patterns as $pattern) {
        if (preg_match_all($pattern, $text, $matches)) {
            $english_score += count($matches[0]);
        }
    }
    
    // Simple heuristic: if French score is significantly higher, it's French
    // If English score is higher or similar, default to English
    if ($french_score > $english_score * 1.5) {
        return 'fr';
    } elseif ($english_score > 0 || $french_score > 0) {
        return 'en';
    }
    
    return 'unknown';
}
?>
