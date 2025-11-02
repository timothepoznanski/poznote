<?php
require_once 'config.php';
include 'db_connect.php';

/**
 * Get the custom name for the default folder (previously "Uncategorized")
 */
function getDefaultFolderName($workspace = null) {
    global $con;
    try {
        $key = 'default_folder_name';
        if ($workspace) $key .= '::' . $workspace;
        $stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([$key]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($result && $result['value']) return $result['value'];
        // Fallback to global default if per-workspace not set
        if ($workspace) {
            $stmt2 = $con->prepare("SELECT value FROM settings WHERE key = 'default_folder_name'");
            $stmt2->execute();
            $res2 = $stmt2->fetch(PDO::FETCH_ASSOC);
            return $res2 ? $res2['value'] : 'Default';
        }
    return 'Default';
    } catch (Exception $e) {
    return 'Default'; // Fallback to original name
    }
}

/**
 * Set the custom name for the default folder
 */
function setDefaultFolderName($newName, $workspace = null) {
    global $con;
    try {
        $key = 'default_folder_name';
        if ($workspace) $key .= '::' . $workspace;
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        return $stmt->execute([$key, $newName]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Check if a folder name is the default folder (handles both current custom name and "Uncategorized")
 */
function isDefaultFolder($folderName, $workspace = null) {
    if (!$folderName) return true; // Empty/null folder is considered default
    // Accept both legacy and new default names
    if ($folderName === 'Uncategorized' || $folderName === 'Default') return true;
    return $folderName === getDefaultFolderName($workspace); // Current custom name
}

/**
 * Get the default folder name to use for new notes or when moving from deleted folders
 */
function getDefaultFolderForNewNotes($workspace = null) {
    return getDefaultFolderName($workspace);
}

/**
 * Update all references from old default folder name to new one
 */
function updateDefaultFolderReferences($oldName, $newName, $workspace = null) {
    global $con;
    try {
        // Get the folder_id for the default folder (should be NULL for default)
        // Update entries table - using folder_id for better performance
        if ($workspace) {
            $stmt1 = $con->prepare("UPDATE entries SET folder = ? WHERE (folder = ? OR folder IS NULL OR folder = '' OR folder_id IS NULL) AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $result1 = $stmt1->execute([$newName, $oldName, $workspace, $workspace]);
        } else {
            $stmt1 = $con->prepare("UPDATE entries SET folder = ? WHERE folder = ? OR folder IS NULL OR folder = '' OR folder_id IS NULL");
            $result1 = $stmt1->execute([$newName, $oldName]);
        }
        
        // Update folders table if the folder exists there
        if ($workspace) {
            $stmt2 = $con->prepare("UPDATE folders SET name = ? WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $result2 = $stmt2->execute([$newName, $oldName, $workspace, $workspace]);
        } else {
            $stmt2 = $con->prepare("UPDATE folders SET name = ? WHERE name = ?");
            $result2 = $stmt2->execute([$newName, $oldName]);
        }
        
        return $result1;
    } catch (Exception $e) {
        return false;
    }
}
?>
