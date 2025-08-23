<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';

switch($action) {
    case 'create':
        require_once 'default_folder_settings.php';
        
        $folderName = trim($_POST['folder_name'] ?? '');
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
        $defaultFolderName = getDefaultFolderName();
        
        if ($folderName === $defaultFolderName) {
            echo json_encode(['success' => false, 'error' => 'Cannot create folder with the same name as the default folder']);
            exit;
        }
        
        // Check if folder already exists in entries or folders table
        $check1 = $con->prepare("SELECT COUNT(*) as count FROM entries WHERE folder = ?");
        $check1->execute([$folderName]);
        $result1 = $check1->fetch(PDO::FETCH_ASSOC);
        
        $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ?");
        $check2->execute([$folderName]);
        $result2 = $check2->fetch(PDO::FETCH_ASSOC);
        
        if ($result1['count'] > 0 || $result2['count'] > 0) {
            echo json_encode(['success' => false, 'error' => 'Folder already exists']);
        } else {
            // Create folder
            $query = "INSERT INTO folders (name) VALUES (?)";
            $stmt = $con->prepare($query);
            if ($stmt->execute([$folderName])) {
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Database error']);
            }
        }
        break;
        
    case 'rename':
        $oldName = $_POST['old_name'] ?? '';
        $newName = trim($_POST['new_name'] ?? '');
        
        if (empty($oldName) || empty($newName)) {
            echo json_encode(['success' => false, 'error' => 'Both old and new names are required']);
            exit;
        }
        
        // Load default folder settings
        require_once 'default_folder_settings.php';
        
        $defaultFolderName = getDefaultFolderName();
        
        // Allow renaming the default folder
        if (isDefaultFolder($oldName)) {
            // This is renaming the default folder
            if (setDefaultFolderName($newName)) {
                // Update all references
                updateDefaultFolderReferences($oldName, $newName);
                echo json_encode(['success' => true]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Failed to update default folder name']);
            }
            exit;
        }
        
        // Don't allow renaming TO the current default folder name
        if ($newName === $defaultFolderName) {
            echo json_encode(['success' => false, 'error' => 'Cannot rename to default folder name']);
            exit;
        }
        
        // Update entries and folders table
        $query1 = "UPDATE entries SET folder = ? WHERE folder = ?";
        $query2 = "UPDATE folders SET name = ? WHERE name = ?";
        
        $stmt1 = $con->prepare($query1);
        $stmt2 = $con->prepare($query2);
        
        if ($stmt1->execute([$newName, $oldName]) && $stmt2->execute([$newName, $oldName])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;

    case 'delete':
        require_once 'default_folder_settings.php';
        
        $folderName = $_POST['folder_name'] ?? '';
        if (empty($folderName) || isDefaultFolder($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Cannot delete the default folder']);
            exit;
        }
        
        $defaultFolderName = getDefaultFolderForNewNotes();
        
        // Move all notes from this folder to default folder
        $query1 = "UPDATE entries SET folder = ? WHERE folder = ?";
        // Delete folder from folders table
        $query2 = "DELETE FROM folders WHERE name = ?";
        
        $stmt1 = $con->prepare($query1);
        $stmt2 = $con->prepare($query2);
        
        if ($stmt1->execute([$defaultFolderName, $folderName]) && $stmt2->execute([$folderName])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    case 'move_to':
        require_once 'default_folder_settings.php';
        
        $noteId = $_POST['note_id'] ?? '';
        $targetFolder = $_POST['folder'] ?? $_POST['target_folder'] ?? getDefaultFolderForNewNotes();
        
        if (empty($noteId)) {
            echo json_encode(['success' => false, 'error' => 'Note ID is required']);
            exit;
        }
        
        $query = "UPDATE entries SET folder = ? WHERE id = ?";
        $stmt = $con->prepare($query);
        if ($stmt->execute([$targetFolder, $noteId])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    case 'list':
        require_once 'default_folder_settings.php';
        
        $query1 = "SELECT DISTINCT folder as name FROM entries WHERE folder IS NOT NULL AND folder != ''";
        $query2 = "SELECT name FROM folders";
        
        $result1 = $con->query($query1);
        $result2 = $con->query($query2);
        
        $defaultFolderName = getDefaultFolderName();
        $folders = [$defaultFolderName];
        
        // Add folders from entries
        while($row = $result1->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['name']) && !in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Add folders from folders table
        while($row = $result2->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['name']) && !in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Sort folders alphabetically (default folder first)
        usort($folders, function($a, $b) use ($defaultFolderName) {
            if ($a === $defaultFolderName) return -1;
            if ($b === $defaultFolderName) return 1;
            return strcasecmp($a, $b);
        });
        
        echo json_encode(['success' => true, 'folders' => $folders]);
        break;
        
    case 'get_suggested_folders':
        require_once 'default_folder_settings.php';
        
        // Get the most recently used folders and always include the default folder
        $recentQuery = "SELECT folder, MAX(updated) as last_used FROM entries WHERE folder IS NOT NULL AND folder != '' AND trash = 0 GROUP BY folder ORDER BY last_used DESC LIMIT 3";
        $recentResult = $con->query($recentQuery);
        
        $defaultFolderName = getDefaultFolderName();
        $suggestedFolders = [$defaultFolderName]; // Always include default folder first
        
        // Add recent folders
        while($row = $recentResult->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['folder']) && !in_array($row['folder'], $suggestedFolders)) {
                $suggestedFolders[] = $row['folder'];
            }
        }
        
        // If we don't have enough, add some popular folders
        if (count($suggestedFolders) < 4) {
            $popularQuery = "SELECT folder, COUNT(*) as count FROM entries WHERE folder IS NOT NULL AND folder != '' AND trash = 0 GROUP BY folder ORDER BY count DESC LIMIT 3";
            $popularResult = $con->query($popularQuery);
            
            while($row = $popularResult->fetch(PDO::FETCH_ASSOC)) {
                if (!in_array($row['folder'], $suggestedFolders) && count($suggestedFolders) < 4) {
                    if (!isDefaultFolder($row['folder'])) {
                        $suggestedFolders[] = $row['folder'];
                    }
                }
            }
        }
        
        echo json_encode(['success' => true, 'folders' => $suggestedFolders]);
        break;
        
    case 'get_folder_counts':
        require_once 'default_folder_settings.php';
        
        // Get note counts for each folder
        $query = "SELECT folder, COUNT(*) as count FROM entries WHERE trash = 0 GROUP BY folder";
        $result = $con->query($query);
        
        $defaultFolderName = getDefaultFolderName();
        $counts = [];
        while($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $folder = $row['folder'] ?: $defaultFolderName;
            $counts[$folder] = (int)$row['count'];
        }
        
        // Get favorite count
        $favoriteQuery = "SELECT COUNT(*) as count FROM entries WHERE trash = 0 AND favorite = 1";
        $favoriteResult = $con->query($favoriteQuery);
        if ($favoriteResult) {
            $favoriteData = $favoriteResult->fetch(PDO::FETCH_ASSOC);
            $counts['Favorites'] = (int)$favoriteData['count'];
        }
        
        echo json_encode(['success' => true, 'counts' => $counts]);
        break;
        
    case 'empty_folder':
        $folderName = $_POST['folder_name'] ?? '';
        
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
        // Move all notes from this folder to trash
        $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0";
        $stmt = $con->prepare($query);
        
        if ($stmt->execute([$folderName])) {
            $affected_rows = $stmt->rowCount();
            echo json_encode(['success' => true, 'message' => "Moved $affected_rows notes to trash"]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error occurred']);
        }
        break;
        
    case 'count_notes_in_folder':
        $folderName = $_POST['folder_name'] ?? '';
        
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
        $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0";
        $stmt = $con->prepare($query);
        $stmt->execute([$folderName]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'count' => (int)$result['count']]);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>
