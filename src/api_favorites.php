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
    $action = $_POST['action'] ?? '';
    
    if ($action === 'toggle_favorite') {
        $noteId = $_POST['note_id'] ?? '';
        
        if (empty($noteId)) {
            echo json_encode(['success' => false, 'message' => 'Note ID is required']);
            exit;
        }
        
        // Get current favorite status
        $query = "SELECT favorite FROM entries WHERE id = ?";
        $stmt = $con->prepare($query);
        $stmt->execute([$noteId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result) {
            echo json_encode(['success' => false, 'message' => 'Note not found']);
            exit;
        }
        
        $currentFavorite = $result['favorite'];
        
        // Toggle favorite status
        $newFavorite = $currentFavorite ? 0 : 1;
        
        // Update database
        $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ?";
        $updateStmt = $con->prepare($updateQuery);
        
        if ($updateStmt->execute([$newFavorite, $noteId])) {
            echo json_encode([
                'success' => true, 
                'is_favorite' => $newFavorite
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error updating database']);
        }
        
        $stmt->close();
        $updateStmt->close();
    }
}

$con->close();
?>
