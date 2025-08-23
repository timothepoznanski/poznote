<?php
require_once 'config.php';
include 'db_connect.php';

/**
 * Get the custom name for the default folder (previously "Uncategorized")
 */
function getDefaultFolderName() {
    global $con;
    try {
        $stmt = $con->prepare("SELECT value FROM settings WHERE key = 'default_folder_name'");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return $result ? $result['value'] : 'Uncategorized';
    } catch (Exception $e) {
        return 'Uncategorized'; // Fallback to original name
    }
}

/**
 * Set the custom name for the default folder
 */
function setDefaultFolderName($newName) {
    global $con;
    try {
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_folder_name', ?)");
        return $stmt->execute([$newName]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Check if a folder name is the default folder (handles both current custom name and "Uncategorized")
 */
function isDefaultFolder($folderName) {
    if (!$folderName) return true; // Empty/null folder is considered default
    if ($folderName === 'Uncategorized') return true; // Original default name
    return $folderName === getDefaultFolderName(); // Current custom name
}

/**
 * Get the default folder name to use for new notes or when moving from deleted folders
 */
function getDefaultFolderForNewNotes() {
    return getDefaultFolderName();
}

/**
 * Update all references from old default folder name to new one
 */
function updateDefaultFolderReferences($oldName, $newName) {
    global $con;
    try {
        // Update entries table
        $stmt1 = $con->prepare("UPDATE entries SET folder = ? WHERE folder = ? OR folder IS NULL OR folder = ''");
        $result1 = $stmt1->execute([$newName, $oldName]);
        
        // Update folders table if the folder exists there
        $stmt2 = $con->prepare("UPDATE folders SET name = ? WHERE name = ?");
        $result2 = $stmt2->execute([$newName, $oldName]);
        
        return $result1;
    } catch (Exception $e) {
        return false;
    }
}
?>
