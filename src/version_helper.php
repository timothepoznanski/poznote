<?php
/**
 * Utility function to get application version
 * This function tries multiple sources to determine the current version:
 * 1. Version file (version.txt) - primary source
 * 2. Build-time file (Docker) - fallback for containers
 * 3. Git tags - fallback for development
 * 4. Default version
 */
function getAppVersion() {
    // Primary source: version.txt file
    $version_file = __DIR__ . '/version.txt';
    if (file_exists($version_file)) {
        $version = trim(file_get_contents($version_file));
        if (!empty($version)) {
            return $version;
        }
    }

    // Fallback: Version file created during Docker build
    $build_version_file = __DIR__ . '/version.php';
    if (file_exists($build_version_file)) {
        include_once $build_version_file;
        if (defined('APP_VERSION') && APP_VERSION !== 'unknown') {
            return APP_VERSION;
        }
    }

    // Fallback: try to get version from git (development environment)
    try {
        $gitVersion = shell_exec('git describe --tags --abbrev=0 2>/dev/null');
        if ($gitVersion && !empty(trim($gitVersion))) {
            return ltrim(trim($gitVersion), 'v');
        }
    } catch (Exception $e) {
        // Git not available or no tags
    }

    // Ultimate fallback
    return '1.0.0';
}

/**
 * Get version with 'v' prefix for display
 */
function getAppVersionWithPrefix() {
    $version = getAppVersion();
    return (strpos($version, 'v') === 0) ? $version : 'v' . $version;
}
?>