<?php
/**
 * Get current version from Git repository
 * Returns the current commit hash (short form) or fallback to file modification date
 */
function getCurrentVersion() {
    try {
        // Try to get version from Git
        $git_command = 'git rev-parse HEAD 2>/dev/null';
        $git_hash = shell_exec($git_command);
        
        if ($git_hash && strlen(trim($git_hash)) >= 8) {
            return substr(trim($git_hash), 0, 8);
        }
    } catch (Exception $e) {
        // Git command failed, continue to fallback
    }
    
    // Fallback 1: Try to read from version.txt if it exists
    $version_file = __DIR__ . '/version.txt';
    if (file_exists($version_file)) {
        $version = trim(file_get_contents($version_file));
        if (!empty($version)) {
            return $version;
        }
    }
    
    // Fallback 2: Use modification date of index.php
    $index_file = __DIR__ . '/index.php';
    if (file_exists($index_file)) {
        return date('Ymd-His', filemtime($index_file));
    }
    
    // Last resort: current timestamp
    return date('Ymd-His');
}

/**
 * Check if we're in a Git repository
 */
function isGitRepository() {
    $git_dir = __DIR__ . '/../.git';
    return is_dir($git_dir) || file_exists($git_dir);
}
?>
