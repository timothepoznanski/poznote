<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';

switch($action) {
    case 'create':
        $folderName = trim($_POST['folder_name'] ?? '');
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
        if ($folderName === 'Uncategorized') {
            echo json_encode(['success' => false, 'error' => 'Cannot create folder with this name']);
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
            // Create folder in folders table
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
        
        if ($oldName === 'Uncategorized' || $newName === 'Uncategorized') {
            echo json_encode(['success' => false, 'error' => 'Cannot rename to/from Uncategorized']);
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
        $folderName = $_POST['folder_name'] ?? '';
        if (empty($folderName) || $folderName === 'Uncategorized') {
            echo json_encode(['success' => false, 'error' => 'Cannot delete this folder']);
            exit;
        }
        
        // Move all notes from this folder to Uncategorized
        $query1 = "UPDATE entries SET folder = 'Uncategorized' WHERE folder = ?";
        // Delete folder from folders table
        $query2 = "DELETE FROM folders WHERE name = ?";
        
        $stmt1 = $con->prepare($query1);
        $stmt2 = $con->prepare($query2);
        
        if ($stmt1->execute([$folderName]) && $stmt2->execute([$folderName])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    case 'move_note':
        // Support both note_id (new) and note_heading (legacy) formats
        $noteId = $_POST['note_id'] ?? '';
        $noteHeading = $_POST['note_heading'] ?? '';
        
        // Support both folder and target_folder parameters
        $targetFolder = $_POST['folder'] ?? $_POST['target_folder'] ?? 'Uncategorized';
        
        if (!empty($noteId)) {
            // New ID-based approach
            $query = "UPDATE entries SET folder = ? WHERE id = ?";
            $stmt = $con->prepare($query);
            $success = $stmt->execute([$targetFolder, intval($noteId)]);
        } elseif (!empty($noteHeading)) {
            // Legacy heading-based approach
            $query = "UPDATE entries SET folder = ? WHERE heading = ?";
            $stmt = $con->prepare($query);
            $success = $stmt->execute([$targetFolder, $noteHeading]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Note ID or heading is required']);
            break;
        }
        
        if ($success) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    case 'get_folders':
        // Get folders from both entries and folders table
        $query1 = "SELECT DISTINCT folder as name FROM entries WHERE folder IS NOT NULL AND folder != ''";
        $query2 = "SELECT name FROM folders";
        
        $result1 = $con->query($query1);
        $result2 = $con->query($query2);
        
        $folders = ['Uncategorized'];
        
        // Add folders from entries
        while($row = $result1->fetch(PDO::FETCH_ASSOC)) {
            if ($row['name'] !== 'Uncategorized' && !in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Add folders from folders table
        while($row = $result2->fetch(PDO::FETCH_ASSOC)) {
            if ($row['name'] !== 'Uncategorized' && !in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Sort folders alphabetically (Uncategorized first)
        usort($folders, function($a, $b) {
            if ($a === 'Uncategorized') return -1;
            if ($b === 'Uncategorized') return 1;
            return strcasecmp($a, $b);
        });
        
        echo json_encode(['success' => true, 'folders' => $folders]);
        break;
        
    case 'get_suggested_folders':
        // Get the most recently used folders and always include Uncategorized
        $recentQuery = "SELECT folder, MAX(updated) as last_used FROM entries WHERE folder IS NOT NULL AND folder != '' AND trash = 0 GROUP BY folder ORDER BY last_used DESC LIMIT 3";
        $recentResult = $con->query($recentQuery);
        
        $suggestedFolders = ['Uncategorized']; // Always include Uncategorized first
        
        // Add recent folders
        while($row = $recentResult->fetch(PDO::FETCH_ASSOC)) {
            if ($row['folder'] !== 'Uncategorized' && !in_array($row['folder'], $suggestedFolders)) {
                $suggestedFolders[] = $row['folder'];
            }
        }
        
        // If we don't have enough, add some popular folders
        if (count($suggestedFolders) < 4) {
            $popularQuery = "SELECT folder, COUNT(*) as count FROM entries WHERE folder IS NOT NULL AND folder != '' AND folder != 'Uncategorized' AND trash = 0 GROUP BY folder ORDER BY count DESC LIMIT 3";
            $popularResult = $con->query($popularQuery);
            
            while($row = $popularResult->fetch(PDO::FETCH_ASSOC)) {
                if (!in_array($row['folder'], $suggestedFolders) && count($suggestedFolders) < 4) {
                    $suggestedFolders[] = $row['folder'];
                }
            }
        }
        
        echo json_encode(['success' => true, 'folders' => $suggestedFolders]);
        break;
        
    case 'get_folder_counts':
        // Get note counts for each folder
        $query = "SELECT folder, COUNT(*) as count FROM entries WHERE trash = 0 GROUP BY folder";
        $result = $con->query($query);
        
        $counts = [];
        while($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $folder = $row['folder'] ?: 'Uncategorized';
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
        
        // Count notes in this folder
        $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0";
        $stmt = $con->prepare($query);
        $stmt->execute([$folderName]);
        
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            echo json_encode(['success' => true, 'count' => intval($row['count'])]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error occurred']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}
?>
