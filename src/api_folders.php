<?php
// Disable error display to avoid corrupting JSON
error_reporting(E_ERROR | E_PARSE);
ini_set('display_errors', 0);

// Ensure we never respond with an empty body (which breaks response.json())
// even if a fatal error occurs.
ob_start();
register_shutdown_function(function () {
    $error = error_get_last();
    if (!$error) {
        return;
    }
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array($error['type'], $fatalTypes, true)) {
        return;
    }

    while (ob_get_level() > 0) {
        @ob_end_clean();
    }

    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error'
    ]);
});

require 'auth.php';
requireApiAuth();

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
    
    // Sort folders at each level alphabetically
    function sortFolders(&$folders) {
        usort($folders, function($a, $b) {
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

try {
switch($action) {
    case 'create':
        $folderName = trim($_POST['folder_name'] ?? '');
        if (empty($folderName)) {
            echo json_encode(['success' => false, 'error' => 'Folder name is required']);
            exit;
        }
        
        // Prevent creating folders with reserved system names
        $reserved_names = ['Favorites', 'Tags', 'Trash', 'Public'];
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
                $checkParent = $con->prepare("SELECT id FROM folders WHERE id = ? AND workspace = ?");
                $checkParent->execute([$parentId, $workspace]);
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
            $check2 = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND parent_id IS NOT DISTINCT FROM ? AND workspace = ?");
            $check2->execute([$folderName, $parentId, $workspace]);
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
            $wsValue = $workspace;
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
        
        // Do not allow renaming special system folders
        if (in_array($oldName, ['Favorites', 'Tags', 'Trash', 'Public'])) {
            echo json_encode(['success' => false, 'error' => 'Renaming system folders is not allowed']);
            exit;
        }
        
        // Don't allow renaming TO reserved system folder names
        if (in_array($newName, ['Favorites', 'Tags', 'Trash', 'Public'])) {
            echo json_encode(['success' => false, 'error' => 'Cannot rename to reserved system folder name']);
            exit;
        }

        // Ensure target name does not already exist in the same workspace (but allow same name in other workspaces)
        if ($workspace !== null) {
            $check = $con->prepare("SELECT COUNT(*) as count FROM folders WHERE name = ? AND workspace = ?");
            $check->execute([$newName, $workspace]);
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
                $query1 = "UPDATE entries SET folder = ? WHERE folder = ? AND workspace = ?";
                $query2 = "UPDATE folders SET name = ? WHERE name = ? AND workspace = ?";
                $stmt1 = $con->prepare($query1);
                $stmt2 = $con->prepare($query2);
                $exec1 = $stmt1->execute([$newName, $oldName, $workspace]);
                $exec2 = $stmt2->execute([$newName, $oldName, $workspace]);
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
        // Accept either folder_id or folder_name (preferring folder_id)
        $folderId = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
        $folderName = $_POST['folder_name'] ?? '';
        
        // If folder_id is provided, use it to find the folder
        if ($folderId !== null && $folderId > 0) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
                $stmt->execute([$folderId, $workspace]);
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
        } elseif (!empty($folderName)) {
            // If folder_name is provided instead, verify it exists and get its ID
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$folderName, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$folderName]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folderId = (int)$folderData['id'];
            } else {
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                exit;
            }
        } else {
            echo json_encode(['success' => false, 'error' => 'Folder ID or name is required']);
            exit;
        }
        
        // Function to get all folder IDs recursively (including the folder itself and all subfolders)
        function getAllFolderIds($con, $folderId, $workspace) {
            $folderIds = [$folderId];
            
            // Get all subfolders
            if ($workspace !== null) {
                $query = "SELECT id FROM folders WHERE parent_id = ? AND workspace = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId, $workspace]);
            } else {
                $query = "SELECT id FROM folders WHERE parent_id = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId]);
            }
            
            // Recursively get subfolder IDs
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderIds = array_merge($folderIds, getAllFolderIds($con, (int)$row['id'], $workspace));
            }
            
            return $folderIds;
        }
        
        // Get all folder IDs that will be deleted (folder + all subfolders)
        $allFolderIds = getAllFolderIds($con, $folderId, $workspace);
        
        // Move all notes from this folder AND all subfolders to trash
        if (!empty($allFolderIds)) {
            $placeholders = implode(',', array_fill(0, count($allFolderIds), '?'));
            
            if ($workspace !== null) {
                $query1 = "UPDATE entries SET trash = 1 WHERE folder_id IN ($placeholders) AND workspace = ?";
                $stmt1 = $con->prepare($query1);
                $params = array_merge($allFolderIds, [$workspace]);
                $exec1 = $stmt1->execute($params);
            } else {
                $query1 = "UPDATE entries SET trash = 1 WHERE folder_id IN ($placeholders)";
                $stmt1 = $con->prepare($query1);
                $exec1 = $stmt1->execute($allFolderIds);
            }
        } else {
            $exec1 = true; // No notes to move
        }
        
        // Delete the folder (CASCADE will automatically delete all subfolders)
        if ($workspace !== null) {
            $query2 = "DELETE FROM folders WHERE id = ? AND workspace = ?";
            $stmt2 = $con->prepare($query2);
            $exec2 = $stmt2->execute([$folderId, $workspace]);
        } else {
            $query2 = "DELETE FROM folders WHERE id = ?";
            $stmt2 = $con->prepare($query2);
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
            $noteId = $_POST['note_id'] ?? '';
            $targetFolderId = isset($_POST['folder_id']) ? ($_POST['folder_id'] === '' ? null : intval($_POST['folder_id'])) : null;
            $targetFolder = $_POST['folder'] ?? $_POST['target_folder'] ?? null;
            
            if (empty($noteId)) {
                echo json_encode(['success' => false, 'error' => 'Note ID is required']);
                exit;
            }
            
            // If folder_id is empty string or 0, treat as "no folder"
            if ($targetFolderId === null || $targetFolderId === 0) {
                $targetFolder = null;
                $targetFolderId = null;
            }
            // If folder_id is provided and > 0, fetch the folder name
            elseif ($targetFolderId > 0) {
                if ($workspace) {
                    $stmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
                    $stmt->execute([$targetFolderId, $workspace]);
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
                    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                    $stmt->execute([$targetFolder, $workspace]);
                } else {
                    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                    $stmt->execute([$targetFolder]);
                }
                $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($folderData) {
                    $targetFolderId = (int)$folderData['id'];
                } else {
                    // Folder doesn't exist, create it
                    $createStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                    $createStmt->execute([$targetFolder, $workspace]);
                    $targetFolderId = (int)$con->lastInsertId();
                }
            }
            
            // Get current note info to know what we're moving
            $checkStmt = $con->prepare("SELECT id, heading, folder, folder_id, workspace FROM entries WHERE id = ?");
            $checkStmt->execute([$noteId]);
            $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$currentNote) {
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                exit;
            }
            
            // Check for duplicate heading in target folder (scoped uniqueness)
            $targetWorkspace = $workspace ?? $currentNote['workspace'];
            $duplicateCheckQuery = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ?";
            $duplicateCheckParams = [$currentNote['heading'], $noteId];
            
            // Add folder constraint
            if ($targetFolderId !== null) {
                $duplicateCheckQuery .= " AND folder_id = ?";
                $duplicateCheckParams[] = $targetFolderId;
            } else {
                $duplicateCheckQuery .= " AND folder_id IS NULL";
            }
            
            // Add workspace constraint
            if ($targetWorkspace !== null) {
                $duplicateCheckQuery .= " AND workspace = ?";
                $duplicateCheckParams[] = $targetWorkspace;
            }
            
            $duplicateCheckStmt = $con->prepare($duplicateCheckQuery);
            $duplicateCheckStmt->execute($duplicateCheckParams);
            
            if ($duplicateCheckStmt->fetchColumn() > 0) {
                echo json_encode([
                    'success' => false, 
                    'error' => t('folders.move_note.errors.duplicate_title', [], 'A note with the same title already exists in the destination folder.')
                ]);
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
        $hierarchical = isset($_POST['hierarchical']) && $_POST['hierarchical'] === 'true';
        
        $query = "SELECT id, name, parent_id FROM folders";
        $params = [];
        if ($workspace !== null) {
            $query .= " WHERE workspace = ?";
            $params = [$workspace];
        }
        $query .= " ORDER BY name";

        $stmt = $con->prepare($query);
        if (!$stmt || !$stmt->execute($params)) {
            echo json_encode(['success' => false, 'error' => 'Database query failed']);
            break;
        }

        $folders = [];

        // Add folders from folders table with IDs
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folders[] = [
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null
            ];
        }
        
        if ($hierarchical) {
            // Build hierarchical structure
            $folders = buildFolderHierarchy($folders);
        } else {
            // Sort folders alphabetically
            usort($folders, function($a, $b) {
                return strcasecmp($a['name'], $b['name']);
            });
        }
        
        echo json_encode(['success' => true, 'folders' => $folders]);
        break;
        
    case 'get_suggested_folders':
        // Get the most recently used folders with their IDs
        $recentQuery = "SELECT e.folder_id, f.name, MAX(e.updated) as last_used 
                        FROM entries e 
                        LEFT JOIN folders f ON e.folder_id = f.id 
                        WHERE e.folder_id IS NOT NULL AND e.trash = 0";
        if ($workspace !== null) {
            $recentQuery .= " AND e.workspace = '" . addslashes($workspace) . "'";
        }
        $recentQuery .= " GROUP BY e.folder_id ORDER BY last_used DESC LIMIT 5";
        $recentResult = $con->query($recentQuery);
        
        $suggestedFolders = [];
        
        while($row = $recentResult->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['folder_id'];
            $folderName = $row['name'] ?: 'Unknown';
            $suggestedFolders[] = [
                'id' => $folderId,
                'name' => $folderName
            ];
        }
        
        // If we don't have enough, add some popular folders
        if (count($suggestedFolders) < 5) {
            $popularQuery = "SELECT e.folder_id, f.name, COUNT(*) as count 
                            FROM entries e 
                            LEFT JOIN folders f ON e.folder_id = f.id 
                            WHERE e.folder_id IS NOT NULL AND e.trash = 0";
            if ($workspace !== null) {
                $popularQuery .= " AND e.workspace = '" . addslashes($workspace) . "'";
            }
            $popularQuery .= " GROUP BY e.folder_id ORDER BY count DESC LIMIT 5";
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
                
                if (!$alreadyAdded && count($suggestedFolders) < 5) {
                    $suggestedFolders[] = [
                        'id' => $folderId,
                        'name' => $folderName
                    ];
                }
            }
        }
        
        echo json_encode(['success' => true, 'folders' => $suggestedFolders]);
        break;
        
    case 'get_folder_counts':
        // Get note counts for each folder (using folder_id)
        $query = "SELECT folder_id, COUNT(*) as count FROM entries WHERE trash = 0 AND folder_id IS NOT NULL";
        if ($workspace !== null) {
            $query .= " AND workspace = '" . addslashes($workspace) . "'";
        }
        $query .= " GROUP BY folder_id";
        $result = $con->query($query);
        
        $counts = [];
        while($row = $result->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['folder_id'];
            $counts[$folderId] = (int)$row['count'];
        }
        
        // Get uncategorized notes count (notes with no folder)
        $uncategorizedQuery = "SELECT COUNT(*) as count FROM entries WHERE trash = 0 AND folder_id IS NULL";
        if ($workspace !== null) {
            $uncategorizedQuery .= " AND workspace = '" . addslashes($workspace) . "'";
        }
        $uncategorizedResult = $con->query($uncategorizedQuery);
        $uncategorizedRow = $uncategorizedResult->fetch(PDO::FETCH_ASSOC);
        $counts['uncategorized'] = (int)$uncategorizedRow['count'];
        
        // Get favorite count
        $favoriteQuery = "SELECT COUNT(*) as count FROM entries WHERE trash = 0 AND favorite = 1";
        if ($workspace !== null) {
            $favoriteQuery .= " AND workspace = '" . addslashes($workspace) . "'";
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
                $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0 AND workspace = ?";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderId, $workspace]);
            } else {
                $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderId]);
            }
        } else {
            // Fallback to folder_name
            if ($workspace !== null) {
                $query = "UPDATE entries SET trash = 1 WHERE folder = ? AND trash = 0 AND workspace = ?";
                $stmt = $con->prepare($query);
                $successExec = $stmt->execute([$folderName, $workspace]);
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
        
        // Get folder ID from name if needed
        if ($folderId === null && !empty($folderName)) {
            if ($workspace !== null) {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$folderName, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$folderName]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folderId = (int)$folderData['id'];
            }
        }
        
        // Function to recursively count notes in folder and all subfolders
        function countNotesRecursive($con, $folderId, $workspace) {
            $count = 0;
            
            // Count notes directly in this folder
            if ($workspace !== null) {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder_id = ? AND trash = 0 AND workspace = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId, $workspace]);
            } else {
                $query = "SELECT COUNT(*) as count FROM entries WHERE folder_id = ? AND trash = 0";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId]);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            $count += (int)$result['count'];
            
            // Get all subfolders
            if ($workspace !== null) {
                $query = "SELECT id FROM folders WHERE parent_id = ? AND workspace = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId, $workspace]);
            } else {
                $query = "SELECT id FROM folders WHERE parent_id = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId]);
            }
            
            // Recursively count notes in each subfolder
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $count += countNotesRecursive($con, (int)$row['id'], $workspace);
            }
            
            return $count;
        }
        
        // Function to count subfolders recursively
        function countSubfoldersRecursive($con, $folderId, $workspace) {
            $count = 0;
            
            // Get all direct subfolders
            if ($workspace !== null) {
                $query = "SELECT id FROM folders WHERE parent_id = ? AND workspace = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId, $workspace]);
            } else {
                $query = "SELECT id FROM folders WHERE parent_id = ?";
                $stmt = $con->prepare($query);
                $stmt->execute([$folderId]);
            }
            
            $subfolders = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $count += count($subfolders);
            
            // Recursively count subfolders of each subfolder
            foreach ($subfolders as $row) {
                $count += countSubfoldersRecursive($con, (int)$row['id'], $workspace);
            }
            
            return $count;
        }
        
        $totalCount = countNotesRecursive($con, $folderId, $workspace);
        $subfolderCount = countSubfoldersRecursive($con, $folderId, $workspace);
        
        echo json_encode([
            'success' => true, 
            'count' => $totalCount,
            'subfolder_count' => $subfolderCount
        ]);
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
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$folderName, $workspace]);
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
                $stmt = $con->prepare("SELECT name, parent_id FROM folders WHERE id = ? AND workspace = ?");
                $stmt->execute([$currentId, $workspace]);
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
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$folderName, $workspace]);
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
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$newParent, $workspace]);
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
                    $stmt = $con->prepare("SELECT parent_id FROM folders WHERE id = ? AND workspace = ?");
                    $stmt->execute([$checkId, $workspace]);
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
            $stmt = $con->prepare("UPDATE folders SET parent_id = ? WHERE id = ? AND workspace = ?");
            $success = $stmt->execute([$newParentId, $folderId, $workspace]);
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
    
    case 'remove_from_folder':
        try {
            $noteId = $_POST['note_id'] ?? '';
            
            if (empty($noteId)) {
                echo json_encode(['success' => false, 'error' => 'Note ID is required']);
                exit;
            }
            
            // Get current note info
            $checkStmt = $con->prepare("SELECT heading, workspace FROM entries WHERE id = ?");
            $checkStmt->execute([$noteId]);
            $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$currentNote) {
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                exit;
            }
            
            // Check for duplicate heading at root (folder_id IS NULL)
            $duplicateCheckQuery = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ? AND folder_id IS NULL";
            $duplicateCheckParams = [$currentNote['heading'], $noteId];
            
            // Add workspace constraint
            if ($workspace !== null) {
                $duplicateCheckQuery .= " AND workspace = ?";
                $duplicateCheckParams[] = $workspace;
            } elseif ($currentNote['workspace'] !== null) {
                $duplicateCheckQuery .= " AND workspace = ?";
                $duplicateCheckParams[] = $currentNote['workspace'];
            }
            
            $duplicateCheckStmt = $con->prepare($duplicateCheckQuery);
            $duplicateCheckStmt->execute($duplicateCheckParams);
            
            if ($duplicateCheckStmt->fetchColumn() > 0) {
                echo json_encode([
                    'success' => false, 
                    'error' => t('folders.move_note.errors.duplicate_title_root', [], 'A note with the same title already exists at the root level.')
                ]);
                exit;
            }
            
            // Move note to root (no folder) by setting folder and folder_id to null
            $query = "UPDATE entries SET folder = NULL, folder_id = NULL, updated = datetime('now') WHERE id = ?";
            $stmt = $con->prepare($query);
            $success = $stmt->execute([$noteId]);
            
            if ($success) {
                echo json_encode([
                    'success' => true, 
                    'message' => 'Note removed from folder successfully'
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Database error']);
            }
        } catch (Exception $e) {
            error_log("Remove from folder error: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Internal server error: ' . $e->getMessage()]);
        }
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
} catch (Throwable $e) {
    error_log('api_folders.php fatal: ' . $e->getMessage());
    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(500);
    }
    echo json_encode(['success' => false, 'error' => 'Internal server error']);
}
?>
