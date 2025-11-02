<?php
require 'auth.php';
requireApiAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON request body']);
        exit;
    }
    
    $action = $input['action'] ?? '';
    
    if ($action === 'toggle_favorite') {
        $noteId = $input['note_id'] ?? '';
        
        if (empty($noteId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'note_id is required']);
            exit;
        }
        
        // Get workspace from request (to prevent cross-workspace toggles)
        $workspace = $input['workspace'] ?? null;

        // Get current favorite status limited to workspace if provided
        if ($workspace) {
            $query = "SELECT favorite FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $stmt = $con->prepare($query);
            $stmt->execute([$noteId, $workspace, $workspace]);
        } else {
            $query = "SELECT favorite FROM entries WHERE id = ?";
            $stmt = $con->prepare($query);
            $stmt->execute([$noteId]);
        }
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result) {
            echo json_encode(['success' => false, 'message' => 'Note not found']);
            exit;
        }
        
        $currentFavorite = $result['favorite'];
        
        // Toggle favorite status
        $newFavorite = $currentFavorite ? 0 : 1;
        
        // Update database (respect workspace if provided)
        if ($workspace) {
            $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $updateStmt = $con->prepare($updateQuery);
            $success = $updateStmt->execute([$newFavorite, $noteId, $workspace, $workspace]);
        } else {
            $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ?";
            $updateStmt = $con->prepare($updateQuery);
            $success = $updateStmt->execute([$newFavorite, $noteId]);
        }
        
        if ($success) {
            echo json_encode([
                'success' => true, 
                'is_favorite' => $newFavorite
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error updating database']);
        }
        
        // Close statements if available
        if (isset($stmt) && method_exists($stmt, 'close')) $stmt->close();
        if (isset($updateStmt) && method_exists($updateStmt, 'close')) $updateStmt->close();
    }
}

$con->close();
?>
