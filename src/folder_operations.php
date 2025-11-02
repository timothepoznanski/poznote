<?php
// Disable error display to avoid corrupting JSON
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

/**
 * Build hierarchical folder structure from flat array
 */
function buildFolderHierarchy($folders) {
    $folderMap = [];
    $rootFolders = [];
    
    // Create a map of all folders by ID
    foreach ($folders as $folder) {
        $folder['children'] = [];
        $folderMap[$folder['id']] = $folder;
    }
    
    // Build the hierarchy
    foreach ($folderMap as $id => $folder) {
        if ($folder['parent_id'] === null) {
            $rootFolders[] = &$folderMap[$id];
        } else {
            if (isset($folderMap[$folder['parent_id']])) {
                $folderMap[$folder['parent_id']]['children'][] = &$folderMap[$id];
            }
        }
    }
    
    // Sort folders at each level
    function sortFolders(&$folders) {
        usort($folders, function($a, $b) {
            if ($a['is_default']) return -1;
            if ($b['is_default']) return 1;
            return strcasecmp($a['name'], $b['name']);
        });
        
        foreach ($folders as &$folder) {
            if (!empty($folder['children'])) {
                sortFolders($folder['children']);
            }
        }
    }
    
    sortFolders($rootFolders);
    
    return $rootFolders;
}

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
        
        // Get parent_id from parent_folder_key if provided
        $parentId = null;
        $parentFolderKey = $_POST['parent_folder_key'] ?? null;
        
        if ($parentFolderKey && strpos($parentFolderKey, 'folder_') === 0) {
            // Extract folder ID from folder_123 format
            $parentId = (int)substr($parentFolderKey, 7);
            
            // Verify parent folder exists
            if ($workspace !== null) {
                $checkParent = $con->prepare("SELECT id FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $checkParent->execute([$parentId, $workspace, $workspace]);
            } else {
                $checkParent = $con->prepare("SELECT id FROM folders WHERE id = ?");
                $checkParent->execute([$parentId]);
            }
            
            if (!$checkParent->fetch()) {
                echo json_encode(['success' => false, 'error' => 'Parent folder not found']);
                exit;
            }
        }
        
        // Check if folder with same name exists in same parent
        if ($workspace !== null) {
            $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND parent_id IS NOT DISTINCT FROM ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $check2->execute([$folderName, $parentId, $workspace, $workspace]);
        } else {
            $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND parent_id IS NOT DISTINCT FROM ?");
            $check2->execute([$folderName, $parentId]);
        }
        $result2 = $check2->fetch(PDO::FETCH_ASSOC);
        
        if ($result2['count'] > 0) {
            echo json_encode(['success' => false, 'error' => 'Folder already exists in this location']);
        } else {
            // Create folder (store workspace and parent_id)
            $query = "INSERT INTO folders (name, workspace, parent_id) VALUES (?, ?, ?)";
            $stmt = $con->prepare($query);
            $wsValue = $workspace ?? 'Poznote';
            if ($stmt->execute([$folderName, $wsValue, $parentId])) {
                $folder_id = $con->lastInsertId();
                echo json_encode(['success' => true, 'folder_id' => (int)$folder_id, 'folder_name' => $folderName, 'parent_id' => $parentId]);
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
        
        // Accept either folder_id or folder_name (preferring folder_id)
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        
        // If folder_id is provided, use it to find the folder
        if ($folderId !== null && $folderId > 0) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$folderId, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT name FROM folders WHERE id = ?");
                $stmt->execute([$folderId]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folderData) {
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                exit;
            }
            $folderName = $folderData['name'];
        }
        
        if (empty($folderName) || isDefaultFolder($folderName, $workspace)) {
            echo json_encode(['success' => false, 'error' => 'Cannot delete the default folder']);
            exit;
        }
        
        $defaultFolderName = getDefaultFolderForNewNotes($workspace);
        
        // Get default folder ID
        if ($workspace !== null) {
            $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$defaultFolderName, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
            $stmt->execute([$defaultFolderName]);
        }
        $defaultFolderData = $stmt->fetch(PDO::FETCH_ASSOC);
        $defaultFolderId = $defaultFolderData ? (int)$defaultFolderData['id'] : null;
        
        // Move all notes from this folder to default folder (using folder_id)
        if ($workspace !== null) {
            $query1 = "UPDATE entries SET folder = ?, folder_id = ? WHERE folder_id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt1 = $con->prepare($query1);
            $exec1 = $stmt1->execute([$defaultFolderName, $defaultFolderId, $folderId, $workspace, $workspace]);
            $query2 = "DELETE FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt2 = $con->prepare($query2);
            $exec2 = $stmt2->execute([$folderId, $workspace, $workspace]);
        } else {
            $query1 = "UPDATE entries SET folder = ?, folder_id = ? WHERE folder_id = ?";
            $query2 = "DELETE FROM folders WHERE id = ?";
            $stmt1 = $con->prepare($query1);
            $stmt2 = $con->prepare($query2);
            $exec1 = $stmt1->execute([$defaultFolderName, $defaultFolderId, $folderId]);
            $exec2 = $stmt2->execute([$folderId]);
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
            $targetFolderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
            $targetFolder = $_POST['folder'] ?? $_POST['target_folder'] ?? null;
            
            if (empty($noteId)) {
                echo json_encode(['success' => false, 'error' => 'Note ID is required']);
                exit;
            }
            
            // If no folder_id or folder name provided, use default
            if ($targetFolderId === null && ($targetFolder === null || $targetFolder === '')) {
                $targetFolder = getDefaultFolderForNewNotes($workspace);
            }
            
            // If folder_id is provided, fetch the folder name
            if ($targetFolderId !== null && $targetFolderId > 0) {
                if ($workspace) {
                    $stmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                    $stmt->execute([$targetFolderId, $workspace, $workspace]);
                } else {
                    $stmt = $con->prepare("SELECT name FROM folders WHERE id = ?");
                    $stmt->execute([$targetFolderId]);
                }
                $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$folderData) {
                    echo json_encode(['success' => false, 'error' => 'Folder not found']);
                    exit;
                }
                $targetFolder = $folderData['name'];
            } elseif ($targetFolder !== null) {
                // If folder name is provided, get folder_id
                if ($workspace) {
                    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                    $stmt->execute([$targetFolder, $workspace, $workspace]);
                } else {
                    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                    $stmt->execute([$targetFolder]);
                }
                $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($folderData) {
                    $targetFolderId = (int)$folderData['id'];
                } else if (!isDefaultFolder($targetFolder, $workspace)) {
                    // Folder doesn't exist, create it
                    $createStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                    $createStmt->execute([$targetFolder, $workspace ?? 'Poznote']);
                    $targetFolderId = (int)$con->lastInsertId();
                }
            }
            
            // Get current note info to know what we're moving
            $checkStmt = $con->prepare("SELECT id, folder, folder_id, workspace FROM entries WHERE id = ?");
            $checkStmt->execute([$noteId]);
            $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$currentNote) {
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                exit;
            }
            
            // Update both folder, folder_id and workspace
            if ($workspace) {
                $query = "UPDATE entries SET folder = ?, folder_id = ?, workspace = ?, updated = datetime('now') WHERE id = ?";
                $stmt = $con->prepare($query);
                $success = $stmt->execute([$targetFolder, $targetFolderId, $workspace, $noteId]);
            } else {
                // If no workspace specified, just update folder and folder_id
                $query = "UPDATE entries SET folder = ?, folder_id = ?, updated = datetime('now') WHERE id = ?";
                $stmt = $con->prepare($query);
                $success = $stmt->execute([$targetFolder, $targetFolderId, $noteId]);
            }
            
            if ($success) {
                echo json_encode([
                    'success' => true, 
                    'message' => 'Note moved successfully',
                    'old_folder' => $currentNote['folder'],
                    'old_folder_id' => $currentNote['folder_id'],
                    'new_folder' => $targetFolder,
                    'new_folder_id' => $targetFolderId,
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
        
        $hierarchical = isset($_POST['hierarchical']) && $_POST['hierarchical'] === 'true';
        
        $query = "SELECT id, name, parent_id FROM folders";
        if ($workspace !== null) {
            $query .= " WHERE (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        $query .= " ORDER BY name";
        
        $result = $con->query($query);
        
        $defaultFolderName = getDefaultFolderName($workspace);
        $folders = [];
        
        // Add folders from folders table with IDs
        while($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $folders[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null,
                'is_default' => isDefaultFolder($row['name'], $workspace)
            ];
        }
        
        // Ensure default folder is included
        $hasDefault = false;
        foreach ($folders as $f) {
            if ($f['is_default']) {
                $hasDefault = true;
                break;
            }
        }
        if (!$hasDefault) {
            array_unshift($folders, [
                'id' => 0,
                'name' => $defaultFolderName,
                'parent_id' => null,
                'is_default' => true
            ]);
        }
        
        if ($hierarchical) {
            // Build hierarchical structure
            $folders = buildFolderHierarchy($folders);
        } else {
            // Sort folders (default folder first, then alphabetically)
            usort($folders, function($a, $b) {
                if ($a['is_default']) return -1;
                if ($b['is_default']) return 1;
                return strcasecmp($a['name'], $b['name']);
            });
        }
        
        echo json_encode(['success' => true, 'folders' => $folders]);
        break;
        
    case 'get_suggested_folders':
        require_once 'default_folder_settings.php';
        
        // Get the most recently used folders with their IDs
        $recentQuery = "SELECT e.folder_id, f.name, MAX(e.updated) as last_used 
                        FROM entries e 
                        LEFT JOIN folders f ON e.folder_id = f.id 
                        WHERE e.folder_id IS NOT NULL AND e.trash = 0";
        if ($workspace !== null) {
            $recentQuery .= " AND (e.workspace = '" . addslashes($workspace) . "' OR (e.workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
        }
        $recentQuery .= " GROUP BY e.folder_id ORDER BY last_used DESC LIMIT 3";
        $recentResult = $con->query($recentQuery);
        
        $defaultFolderName = getDefaultFolderName($workspace);
        
        // Get default folder ID
        $defaultFolderId = 0;
        $query = "SELECT id FROM folders WHERE name = ?";
        $params = [$defaultFolderName];
        if ($workspace !== null) {
            $query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $params[] = $workspace;
            $params[] = $workspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $defaultData = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($defaultData) {
            $defaultFolderId = (int)$defaultData['id'];
        }
        
        $suggestedFolders = [[
            'id' => $defaultFolderId,
            'name' => $defaultFolderName,
            'is_default' => true
        ]]; // Always include default folder first
        
        while($row = $recentResult->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['folder_id'];
            $folderName = $row['name'] ?: 'Unknown';
            if ($folderId !== $defaultFolderId && !isDefaultFolder($folderName, $workspace)) {
                $suggestedFolders[] = [
                    'id' => $folderId,
                    'name' => $folderName,
                    'is_default' => false
                ];
            }
        }
        
        // If we don't have enough, add some popular folders
        if (count($suggestedFolders) < 4) {
            $popularQuery = "SELECT e.folder_id, f.name, COUNT(*) as count 
                            FROM entries e 
                            LEFT JOIN folders f ON e.folder_id = f.id 
                            WHERE e.folder_id IS NOT NULL AND e.trash = 0";
            if ($workspace !== null) {
                $popularQuery .= " AND (e.workspace = '" . addslashes($workspace) . "' OR (e.workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
            }
            $popularQuery .= " GROUP BY e.folder_id ORDER BY count DESC LIMIT 3";
            $popularResult = $con->query($popularQuery);
            
            while($row = $popularResult->fetch(PDO::FETCH_ASSOC)) {
                $folderId = (int)$row['folder_id'];
                $folderName = $row['name'] ?: 'Unknown';
                
                // Check if already in suggestions
                $alreadyAdded = false;
                foreach ($suggestedFolders as $sf) {
                    if ($sf['id'] === $folderId) {
                        $alreadyAdded = true;
                        break;
                    }
                }
                
                if (!$alreadyAdded && count($suggestedFolders) < 4 && !isDefaultFolder($folderName, $workspace)) {
                    $suggestedFolders[] = [
                        'id' => $folderId,
                        'name' => $folderName,
                        'is_default' => false
                    ];
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
        // Accept either folder_id or folder_name (preferring folder_id)
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        
        if ($folderId === null && empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder ID or name is required']);
            exit;
        }
        
        // If folder_id is provided, use it
        if ($folderId !== null && $folderId > 0) {
            // Move all notes from this folder to trash (workspace-scoped)
            if ($workspace !== null) {
                $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderId, $workspace, $workspace]);
            } else {
                $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderId]);
            }
        } else {
            // Fallback to folder_name
            if ($workspace !== null) {
                $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderName, $workspace, $workspace]);
            } else {
                $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderName]);
            }
        }
        
        if ($successExec) {
            $affected_rows = $stmt->rowCount();
            echo json_encode(['success' => true, 'message' => "Moved $affected_rows notes to trash"]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error occurred']);
        }
        break;
        
    case 'count_notes_in_folder':
        // Accept either folder_id or folder_name (preferring folder_id)
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        
        if ($folderId === null && empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder ID or name is required']);
            exit;
        }
        
        if ($folderId !== null && $folderId > 0) {
            if ($workspace !== null) {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder_id = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId, $workspace, $workspace]);
            } else {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder_id = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId]);
            }
        } else {
            if ($workspace !== null) {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderName, $workspace, $workspace]);
            } else {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderName]);
            }
        }
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        echo json_encode(['success' => true, 'count' => (int)$result['count']]);
        break;
        
    case 'get_folder_path':
        // Get the full path of a folder (for breadcrumb)
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        
        if ($folderId === null && empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder ID or name is required']);
            exit;
        }
        
        // Get folder by name if needed
        if ($folderId === null && !empty($folderName)) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$folderName, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$folderName]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folderId = (int)$folderData['id'];
            }
        }
        
        if ($folderId === null) {
            echo json_encode(['success' => false, 'error' => 'Folder not found']);
            exit;
        }
        
        // Build path by traversing up the hierarchy
        $path = [];
        $currentId = $folderId;
        $depth = 0;
        
        while ($currentId !== null && $depth < 10) { // Limit depth to prevent infinite loops
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT name, parent_id FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$currentId, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT name, parent_id FROM folders WHERE id = ?");
                $stmt->execute([$currentId]);
            }
            
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folder) break;
            
            array_unshift($path, $folder['name']);
            $currentId = $folder['parent_id'] ? (int)$folder['parent_id'] : null;
            $depth++;
        }
        
        echo json_encode([
            'success' => true,
            'path' => implode('/', $path),
            'depth' => $depth
        ]);
        break;
        
    case 'move_folder':
        // Move a folder to a new parent
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        $newParentId = isset($_POST['new_parent_id']) ? intval($_POST['new_parent_id']) : null;
        $newParent = $_POST['new_parent'] ?? null;
        
        if ($folderId === null && empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder ID or name is required']);
            exit;
        }
        
        // Get folder ID from name if needed
        if ($folderId === null && !empty($folderName)) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$folderName, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$folderName]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folderId = (int)$folderData['id'];
            }
        }
        
        // Get new parent ID from name if provided
        if ($newParentId === null && !empty($newParent)) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$newParent, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$newParent]);
            }
            $parentData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($parentData) {
                $newParentId = (int)$parentData['id'];
            }
        }
        
        // Verify we're not creating a circular reference
        if ($newParentId !== null) {
            $checkId = $newParentId;
            $depth = 0;
            while ($checkId !== null && $depth < 10) {
                if ($checkId === $folderId) {
                    echo json_encode(['success' => false, 'error' => 'Cannot move folder into itself or its subfolder']);
                    exit;
                }
                
                if ($workspace !== null) {
                    $stmt = $con->prepare("SELECT parent_id FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                    $stmt->execute([$checkId, $workspace, $workspace]);
                } else {
                    $stmt = $con->prepare("SELECT parent_id FROM folders WHERE id = ?");
                    $stmt->execute([$checkId]);
                }
                
                $parent = $stmt->fetch(PDO::FETCH_ASSOC);
                $checkId = $parent && $parent['parent_id'] ? (int)$parent['parent_id'] : null;
                $depth++;
            }
        }
        
        // Update folder's parent_id
        if ($workspace !== null) {
            $stmt = $con->prepare("UPDATE folders SET parent_id = ? WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $success = $stmt->execute([$newParentId, $folderId, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare("UPDATE folders SET parent_id = ? WHERE id = ?");
            $success = $stmt->execute([$newParentId, $folderId]);
        }
        
        if ($success) {
            echo json_encode(['success' => true, 'message' => 'Folder moved successfully']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Database error']);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>
