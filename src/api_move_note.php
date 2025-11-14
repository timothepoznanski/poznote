<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

// Verify HTTP method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

// Validate data
if (!isset($data['note_id']) || empty(trim($data['note_id']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'note_id is required']);
    exit;
}

// Accept either folder_id or folder_name (preferring folder_id)
$folder_id = isset($data['folder_id']) ? intval($data['folder_id']) : null;
$folder_name = isset($data['folder_name']) ? trim($data['folder_name']) : null;

$note_id = trim($data['note_id']);
$workspace = isset($data['workspace']) ? trim($data['workspace']) : null;

// If folder_id is provided, fetch the folder name
if ($folder_id !== null && $folder_id > 0) {
    if ($workspace) {
        $stmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$folder_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT name FROM folders WHERE id = ?");
        $stmt->execute([$folder_id]);
    }
    $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$folderData) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Folder not found']);
        exit;
    }
    $folder_name = $folderData['name'];
} elseif ($folder_name !== null && $folder_name !== '') {
    // If folder_name is provided, get folder_id
    if ($workspace) {
        $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$folder_name, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
        $stmt->execute([$folder_name]);
    }
    $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($folderData) {
        $folder_id = (int)$folderData['id'];
    } else {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Folder not found']);
        exit;
    }
} else {
    // No folder specified - note will have no folder
    $folder_name = null;
    $folder_id = null;
}

try {
    // Verify that note exists (respect workspace if provided)
    if ($workspace) {
        $stmt = $con->prepare("SELECT heading, folder, workspace, type FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading, folder, workspace, type FROM entries WHERE id = ?");
        $stmt->execute([$note_id]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        exit;
    }
    
    $current_folder = $note['folder'];
    
    // Verify that destination folder exists (in folders table or as a folder used in entries)
    // Only check if a folder is specified (allow moving to workspace root with null folder)
    if ($folder_name !== null && $folder_name !== '') {
        // Check folders table respecting workspace
        if ($workspace) {
            $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$folder_name, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
            $stmt->execute([$folder_name]);
        }
        $folder_exists = $stmt->fetchColumn() > 0;
        
        if (!$folder_exists) {
            // Check if folder already exists in entries
            if ($workspace) {
                $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $stmt->execute([$folder_name, $workspace, $workspace]);
            } else {
                $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
                $stmt->execute([$folder_name]);
            }
            $folder_exists = $stmt->fetchColumn() > 0;
            
            if (!$folder_exists) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Folder not found']);
                exit;
            }
        }
    }
    
    // Determine file paths
    // Handle workspace-specific file paths
    $note_workspace = $note['workspace'] ?? null;
    // Determine file extension based on note type
    $noteType = $note['type'] ?? 'note';
    $fileExtension = ($noteType === 'markdown') ? '.md' : '.html';
    
    // Workspace-specific filesystem segments
    $oldWsSegment = $note_workspace ? ('workspace_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($note_workspace))) : 'workspace_default';
    $newWsSegment = $workspace ? ('workspace_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($workspace))) : 'workspace_default';

    // Determine old file path
    if ($current_folder && $current_folder !== '') {
        $old_file_path = __DIR__ . '/entries/' . $oldWsSegment . '/' . $current_folder . '/' . $note_id . $fileExtension;
    } else {
        $old_file_path = __DIR__ . '/entries/' . $oldWsSegment . '/' . $note_id . $fileExtension;
    }
    
    // Determine new file path
    if ($folder_name && $folder_name !== '') {
        $new_folder_path = __DIR__ . '/entries/' . $newWsSegment . '/' . $folder_name;
        $new_file_path = $new_folder_path . '/' . $note_id . $fileExtension;
    } else {
        $new_file_path = __DIR__ . '/entries/' . $newWsSegment . '/' . $note_id . $fileExtension;
    }
    
    // Verify that note file exists
    if (!file_exists($old_file_path)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note file not found at: ' . $old_file_path]);
        exit;
    }

    // If moving between workspaces (source workspace differs from destination),
    // check for a title conflict in the destination workspace and rename the
    // source note by appending " (1)", " (2)", ... until unique.
    $original_heading = $note['heading'] ?? '';
    $renamed_heading = null;
    // Only consider workspace-aware rename when $workspace (destination) is provided
    // and it's different from the note's current workspace
    if ($workspace && ($note['workspace'] ?? null) !== $workspace) {
        $checkStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $checkStmt->execute([$original_heading, $workspace, $workspace]);
        if ($checkStmt->fetchColumn() > 0) {
            // Find a unique heading by appending (1), (2), ...
            $base = $original_heading;
            $i = 1;
            do {
                $candidate = $base . ' (' . $i . ')';
                $checkStmt->execute([$candidate, $workspace, $workspace]);
                $exists = $checkStmt->fetchColumn() > 0;
                $i++;
            } while ($exists);

            $renamed_heading = $candidate;

            // Update the DB heading for this note (respecting the note's current workspace)
            if ($note['workspace']) {
                $upd = $con->prepare("UPDATE entries SET heading = ? WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $updSuccess = $upd->execute([$renamed_heading, $note_id, $note['workspace'], $note['workspace']]);
            } else {
                $upd = $con->prepare("UPDATE entries SET heading = ? WHERE id = ?");
                $updSuccess = $upd->execute([$renamed_heading, $note_id]);
            }

            if (!$updSuccess) {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to update note heading for rename']);
                exit;
            }

            // Reflect the change locally for the response
            $note['heading'] = $renamed_heading;
        }
    }
    
    // Create destination folder if it does not exist physically
    if ($folder_name && $folder_name !== '' && isset($new_folder_path) && !file_exists($new_folder_path)) {
        if (!mkdir($new_folder_path, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to create destination folder directory']);
            exit;
        }
    }
    
    // Move file
    if (!rename($old_file_path, $new_file_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to move note file']);
        exit;
    }
    
    // Mettre à jour la base de données (inclure workspace si fourni)
    if ($workspace) {
        // When moving to a different workspace, need to remap folder_id to the target workspace's folder
        // The folder_id we have might be from the source workspace
        $target_folder_id = null;
        
        // Find or create the folder in the target workspace
        $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$folder_name, $workspace, $workspace]);
        $targetFolderData = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($targetFolderData) {
            $target_folder_id = (int)$targetFolderData['id'];
        } else {
            // Folder doesn't exist in target workspace, create it
            $insertStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
            $insertStmt->execute([$folder_name, $workspace]);
            $target_folder_id = (int)$con->lastInsertId();
            
            // Verify the folder was created
            if ($target_folder_id === 0) {
                // Failed to get last insert ID, query for it
                $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$folder_name, $workspace]);
                $verifyData = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($verifyData) {
                    $target_folder_id = (int)$verifyData['id'];
                } else {
                    // Still couldn't find it, set to null
                    $target_folder_id = null;
                }
            }
        }
        
        // Note: Don't convert valid IDs to null - only use null if folder creation failed
        if ($target_folder_id === 0 || $target_folder_id === null) {
            $target_folder_id = null;
        }
        
        // set folder, folder_id and workspace for the moved note
        $stmt = $con->prepare("UPDATE entries SET folder = ?, folder_id = ?, workspace = ?, updated = datetime('now') WHERE id = ?");
        $stmt->execute([$folder_name, $target_folder_id, $workspace, $note_id]);
    } else {
        // Convert 0 to null for foreign key constraint
        if ($folder_id === 0) {
            $folder_id = null;
        }
        
        $stmt = $con->prepare("UPDATE entries SET folder = ?, folder_id = ?, updated = datetime('now') WHERE id = ?");
        $stmt->execute([$folder_name, $folder_id, $note_id]);
    }
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Note moved successfully',
        'note' => [
            'id' => $note_id,
            'title' => $note['heading'],
            'old_folder' => $current_folder,
            'new_folder' => $folder_name,
            'old_path' => $old_file_path,
            'new_path' => $new_file_path
        ]
    ]);
    
} catch (Exception $e) {
    // In case of error, try to put file back in place
    if (isset($new_file_path) && isset($old_file_path) && file_exists($new_file_path) && !file_exists($old_file_path)) {
        rename($new_file_path, $old_file_path);
    }
    
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
