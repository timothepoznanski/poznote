<?php
require 'auth.php';
require 'db_connect.php';

// Verify authentication
if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Verify HTTP method
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use DELETE.']);
    exit;
}

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Validate data
if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['error' => 'folder_name is required']);
    exit;
}

$folder_name = trim($data['folder_name']);

// Verify that folder is not protected
if ($folder_name === 'Uncategorized') {
    http_response_code(400);
    echo json_encode(['error' => 'Cannot delete the Uncategorized folder']);
    exit;
}

try {
    // Check if folder exists
    $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
    $stmt->execute([$folder_name]);
    $folder_exists_in_table = $stmt->fetchColumn() > 0;
    
    // Check if folder contains notes
    $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND trash = 0");
    $stmt->execute([$folder_name]);
    $stmt->execute();
    $notes_count = $stmt->fetchColumn();
    
    // Check if folder contains notes dans la corbeille
    $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND trash = 1");
    $stmt->execute([$folder_name]);
    $trash_notes_count = $stmt->fetchColumn();
    
    $total_notes = $notes_count + $trash_notes_count;
    
    // If folder exists neither in folders table nor as used folder
    if (!$folder_exists_in_table && $total_notes == 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Folder not found']);
        exit;
    }
    
    // Start transaction
    $con->beginTransaction();
    
    try {
        // Move all notes from this folder to Uncategorized
        if ($total_notes > 0) {
            $stmt = $con->prepare("UPDATE entries SET folder = 'Uncategorized', updated = datetime('now') WHERE folder = ?");
            $stmt->execute([$folder_name]);
        }
        
        // Delete folder from folders table
        if ($folder_exists_in_table) {
            $stmt = $con->prepare("DELETE FROM folders WHERE name = ?");
            $stmt->execute([$folder_name]);
        }
        
        // Delete physical folder
        $folder_path = __DIR__ . '/entries/' . $folder_name;
        $folder_deleted = false;
        
        if (is_dir($folder_path)) {
            // Verify that folder is empty (except hidden files)
            $files = array_diff(scandir($folder_path), array('.', '..'));
            
            if (empty($files)) {
                $folder_deleted = rmdir($folder_path);
            } else {
                // Folder still contains files, do not delete physically
                $folder_deleted = false;
            }
        }
        
        // Commit transaction
        $con->commit();
        $con->commit();
        
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Folder deleted successfully',
            'folder' => [
                'name' => $folder_name,
                'notes_moved' => $total_notes,
                'notes_in_active' => $notes_count,
                'notes_in_trash' => $trash_notes_count,
                'physical_folder_deleted' => $folder_deleted,
                'folder_path' => $folder_path
            ]
        ]);
        
    } catch (Exception $e) {
        // Rollback transaction on error
        $con->rollback();
        $con->commit();
        throw $e;
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>
