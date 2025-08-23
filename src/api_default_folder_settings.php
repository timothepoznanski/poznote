<?php
require 'auth.php';
requireAuth();

require_once 'default_folder_settings.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';

switch($action) {
    case 'get_default_folder_name':
        $defaultName = getDefaultFolderName();
        echo json_encode(['success' => true, 'default_folder_name' => $defaultName]);
        break;
        
    case 'set_default_folder_name':
        $newName = trim($_POST['new_name'] ?? '');
        
        if (empty($newName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name cannot be empty']);
            exit;
        }
        
        if (strlen($newName) > 255) {
            echo json_encode(['success' => false, 'error' => 'Folder name too long (max 255 characters)']);
            exit;
        }
        
        // Forbidden characters in folder names
        $forbidden_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
        foreach ($forbidden_chars as $char) {
            if (strpos($newName, $char) !== false) {
                echo json_encode(['success' => false, 'error' => "Folder name contains forbidden character: $char"]);
                exit;
            }
        }
        
        // Don't allow setting to 'Favorites' as it's a special folder
        if ($newName === 'Favorites') {
            echo json_encode(['success' => false, 'error' => 'Cannot use "Favorites" as default folder name']);
            exit;
        }
        
        $currentName = getDefaultFolderName();
        
        // Check if another folder already uses this name (and it's not the current default)
        if ($newName !== $currentName) {
            $checkStmt = $con->prepare("SELECT COUNT(*) as count FROM entries WHERE folder = ? AND folder != ?");
            $checkStmt->execute([$newName, $currentName]);
            $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            $checkStmt2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND name != ?");
            $checkStmt2->execute([$newName, $currentName]);
            $result2 = $checkStmt2->fetch(PDO::FETCH_ASSOC);
            
            if ($result['count'] > 0 || $result2['count'] > 0) {
                echo json_encode(['success' => false, 'error' => 'A folder with this name already exists']);
                exit;
            }
        }
        
        // Update the setting
        if (setDefaultFolderName($newName)) {
            // Update all references to the old default folder name
            if ($currentName !== $newName) {
                updateDefaultFolderReferences($currentName, $newName);
            }
            echo json_encode(['success' => true, 'message' => 'Default folder name updated successfully']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Failed to update default folder name']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>
