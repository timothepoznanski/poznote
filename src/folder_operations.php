<?php
// Supprimer l'affichage des erreurs pour éviter de corrompre le JSON
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';
$workspace = $_POST['workspace'] ?? null;

switch($action) {
    case 'create':
        require_once 'default_folder_settings.php';
        
        $folderName = trim($_POST['folder_name'] ?? '');
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
    $defaultFolderName = getDefaultFolderName($workspace);
        
        if ($folderName === $defaultFolderName) {
            echo json_encode(['success' => false, 'error' => 'Cannot create folder with the same name as the default folder']);
            exit;
        }
        
        // Prevent creating folders with reserved system names
        $reserved_names = ['Favorites', 'Tags', 'Trash'];
        if (in_array($folderName, $reserved_names)) {
            echo json_encode(['success' => false, 'error' => 'Cannot create folder with reserved name: ' . $folderName]);
            exit;
        }
        
        if ($workspace !== null) {
            $check1 = $con->prepare("SELECT COUNT(*) as count FROM entries WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $check1->execute([$folderName, $workspace, $workspace]);
        } else {
            $check1 = $con->prepare("SELECT COUNT(*) as count FROM entries WHERE folder = ?");
            $check1->execute([$folderName]);
        }
        $result1 = $check1->fetch(PDO::FETCH_ASSOC);
        
        if ($workspace !== null) {
            $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $check2->execute([$folderName, $workspace, $workspace]);
        } else {
            $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ?");
            $check2->execute([$folderName]);
        }
        $result2 = $check2->fetch(PDO::FETCH_ASSOC);
        
        if ($result1['count'] > 0 || $result2['count'] > 0) {
            echo json_encode(['success' => false, 'error' => 'Folder already exists']);
        } else {
            // Create folder (store workspace)
            $query = "INSERT INTO folders (name, workspace) VALUES (?, ?)";
            $stmt = $con->prepare($query);
            $wsValue = $workspace ?? 'Poznote';
            if ($stmt->execute([$folderName, $wsValue])) {
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
        
        // Do not allow renaming the default folder
        if (isDefaultFolder($oldName, $workspace)) {
            echo json_encode(['success' => false, 'error' => 'Renaming the default folder is not allowed']);
            exit;
        }
        
        // Do not allow renaming special system folders
        if (in_array($oldName, ['Favorites', 'Tags', 'Trash'])) {
            echo json_encode(['success' => false, 'error' => 'Renaming system folders is not allowed']);
            exit;
        }
        
        // Don't allow renaming TO the current default folder name
        if ($newName === $defaultFolderName) {
            echo json_encode(['success' => false, 'error' => 'Cannot rename to default folder name']);
            exit;
        }
        
        // Don't allow renaming TO reserved system folder names
        if (in_array($newName, ['Favorites', 'Tags', 'Trash'])) {
            echo json_encode(['success' => false, 'error' => 'Cannot rename to reserved system folder name']);
            exit;
        }

        // Ensure target name does not already exist in the same workspace (but allow same name in other workspaces)
        if ($workspace !== null) {
            $check = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $check->execute([$newName, $workspace, $workspace]);
        } else {
            $check = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ?");
            $check->execute([$newName]);
        }
        $exists = $check->fetch(PDO::FETCH_ASSOC);
        if ($exists && $exists['count'] > 0) {
            echo json_encode(['success' => false, 'error' => 'Folder already exists in this workspace']);
            exit;
        }
        
        // Update entries and folders table (workspace-scoped)
            if ($workspace !== null) {
                $query1 = "UPDATE entries SET folder = ? WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $query2 = "UPDATE folders SET name = ? WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $stmt1 = $con->prepare($query1);
                $stmt2 = $con->prepare($query2);
                $exec1 = $stmt1->execute([$newName, $oldName, $workspace, $workspace]);
                $exec2 = $stmt2->execute([$newName, $oldName, $workspace, $workspace]);
            } else {
                $query1 = "UPDATE entries SET folder = ? WHERE folder = ?";
                $query2 = "UPDATE folders SET name = ? WHERE name = ?";
                $stmt1 = $con->prepare($query1);
                $stmt2 = $con->prepare($query2);
                $exec1 = $stmt1->execute([$newName, $oldName]);
                $exec2 = $stmt2->execute([$newName, $oldName]);
            }
        
        if ($exec1 && $exec2) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;

    case 'delete':
        require_once 'default_folder_settings.php';
        
        $folderName = $_POST['folder_name'] ?? '';
    if (empty($folderName) || isDefaultFolder($folderName, $workspace)) {
            echo json_encode(['success' => false, 'error' => 'Cannot delete the default folder']);
            exit;
        }
        
    $defaultFolderName = getDefaultFolderForNewNotes($workspace);
        
        // Move all notes from this folder to default folder
        if ($workspace !== null) {
            $query1 = "UPDATE entries SET folder = ? WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt1 = $con->prepare($query1);
            $exec1 = $stmt1->execute([$defaultFolderName, $folderName, $workspace, $workspace]);
            $query2 = "DELETE FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt2 = $con->prepare($query2);
            $exec2 = $stmt2->execute([$folderName, $workspace, $workspace]);
        } else {
            $query1 = "UPDATE entries SET folder = ? WHERE folder = ?";
            $query2 = "DELETE FROM folders WHERE name = ?";
            $stmt1 = $con->prepare($query1);
            $stmt2 = $con->prepare($query2);
            $exec1 = $stmt1->execute([$defaultFolderName, $folderName]);
            $exec2 = $stmt2->execute([$folderName]);
        }
        
        if ($exec1 && $exec2) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    case 'move_to':
        try {
            require_once 'default_folder_settings.php';
            
            $noteId = $_POST['note_id'] ?? '';
            $targetFolder = $_POST['folder'] ?? $_POST['target_folder'] ?? getDefaultFolderForNewNotes($workspace);
            
            if (empty($noteId)) {
                echo json_encode(['success' => false, 'error' => 'Note ID is required']);
                exit;
            }
            
            // Get current note info to know what we're moving
            $checkStmt = $con->prepare("SELECT id, folder, workspace FROM entries WHERE id = ?");
            $checkStmt->execute([$noteId]);
            $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$currentNote) {
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                exit;
            }
            
            // If workspace is specified and folder is not default, ensure folder exists in destination workspace
            if ($workspace && !isDefaultFolder($targetFolder, $workspace)) {
                try {
                    // Check if folder exists in destination workspace
                    $folderCheckStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                    $folderCheckStmt->execute([$targetFolder, $workspace, $workspace]);
                    $folderExists = $folderCheckStmt->fetchColumn() > 0;
                    
                    // If folder doesn't exist, create it in the destination workspace
                    if (!$folderExists) {
                        $createFolderStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                        $createFolderStmt->execute([$targetFolder, $workspace]);
                    }
                } catch (Exception $e) {
                    // If folder creation fails, continue anyway - the folder might exist in entries
                    error_log("Folder creation warning: " . $e->getMessage());
                }
            }
            
            // Update both folder and workspace
            if ($workspace) {
                $query = "UPDATE entries SET folder = ?, workspace = ?, updated = datetime('now') WHERE id = ?";
                $stmt = $con->prepare($query);
                $success = $stmt->execute([$targetFolder, $workspace, $noteId]);
            } else {
                // If no workspace specified, just update folder
                $query = "UPDATE entries SET folder = ?, updated = datetime('now') WHERE id = ?";
                $stmt = $con->prepare($query);
                $success = $stmt->execute([$targetFolder, $noteId]);
            }
            
            if ($success) {
                echo json_encode([
                    'success' => true, 
                    'message' => 'Note moved successfully',
                    'old_folder' => $currentNote['folder'],
                    'new_folder' => $targetFolder,
                    'old_workspace' => $currentNote['workspace'],
                    'new_workspace' => $workspace
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Database error']);
            }
        } catch (Exception $e) {
            error_log("Move note error: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Internal server error: ' . $e->getMessage()]);
        }
        break;
        
    case 'list':
        require_once 'default_folder_settings.php';
        
        $query1 = "SELECT DISTINCT folder as name FROM entries WHERE folder IS NOT NULL AND folder != ''";
        if ($workspace !== null) {
            $query1 .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        $query2 = "SELECT name FROM folders";
        if ($workspace !== null) {
            $query2 .= " WHERE (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        
        $result1 = $con->query($query1);
        $result2 = $con->query($query2);
        
    $defaultFolderName = getDefaultFolderName($workspace);
        $folders = [$defaultFolderName];
        
        // Add folders from entries
        while($row = $result1->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['name'], $workspace) && !in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Add folders from folders table
        while($row = $result2->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['name'], $workspace) && !in_array($row['name'], $folders)) {
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
        $recentQuery = "SELECT folder, MAX(updated) as last_used FROM entries WHERE folder IS NOT NULL AND folder != '' AND trash = 0";
        if ($workspace !== null) {
            $recentQuery .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        $recentQuery .= " GROUP BY folder ORDER BY last_used DESC LIMIT 3";
        $recentResult = $con->query($recentQuery);
        
    $defaultFolderName = getDefaultFolderName($workspace);
        $suggestedFolders = [$defaultFolderName]; // Always include default folder first
        
        // Add recent folders
        while($row = $recentResult->fetch(PDO::FETCH_ASSOC)) {
            if (!isDefaultFolder($row['folder'], $workspace) && !in_array($row['folder'], $suggestedFolders)) {
                $suggestedFolders[] = $row['folder'];
            }
        }
        
        // If we don't have enough, add some popular folders
        if (count($suggestedFolders) < 4) {
            $popularQuery = "SELECT folder, COUNT(*) as count FROM entries WHERE folder IS NOT NULL AND folder != '' AND trash = 0";
            if ($workspace !== null) {
                $popularQuery .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
            }
            $popularQuery .= " GROUP BY folder ORDER BY count DESC LIMIT 3";
            $popularResult = $con->query($popularQuery);
            
            while($row = $popularResult->fetch(PDO::FETCH_ASSOC)) {
                if (!in_array($row['folder'], $suggestedFolders) && count($suggestedFolders) < 4) {
                    if (!isDefaultFolder($row['folder'], $workspace)) {
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
        $query = "SELECT folder, COUNT(*) as count FROM entries WHERE trash = 0";
        if ($workspace !== null) {
            $query .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        $query .= " GROUP BY folder";
        $result = $con->query($query);
        
        $defaultFolderName = getDefaultFolderName();
        $counts = [];
        while($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $folder = $row['folder'] ?: $defaultFolderName;
            $counts[$folder] = (int)$row['count'];
        }
        
        // Get favorite count
        $favoriteQuery = "SELECT COUNT(*) as count FROM entries WHERE trash = 0 AND favorite = 1";
        if ($workspace !== null) {
            $favoriteQuery .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
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
        
        // Move all notes from this folder to trash (workspace-scoped)
        if ($workspace !== null) {
            $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt = $con->prepare($query);
            $successExec = $stmt->execute([$folderName, $workspace, $workspace]);
        } else {
            $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0";
            $stmt = $con->prepare($query);
            $successExec = $stmt->execute([$folderName]);
        }
        
        if ($successExec) {
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
        
        if ($workspace !== null) {
            $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt = $con->prepare($query);
            $stmt->execute([$folderName, $workspace, $workspace]);
        } else {
            $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0";
            $stmt = $con->prepare($query);
            $stmt->execute([$folderName]);
        }
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'count' => (int)$result['count']]);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>
