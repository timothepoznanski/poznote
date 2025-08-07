<?php
require 'auth.php';
requireApiAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

require 'config.php';
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
        
        // Récupérer l'état actuel du favori
        $query = "SELECT favorite FROM entries WHERE id = ?";
        $stmt = $con->prepare($query);
        $stmt->bind_param("s", $noteId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            echo json_encode(['success' => false, 'message' => 'Note not found']);
            exit;
        }
        
        $row = $result->fetch_assoc();
        $currentFavorite = $row['favorite'];
        
        // Basculer l'état du favori
        $newFavorite = $currentFavorite ? 0 : 1;
        
        // Mettre à jour la base de données
        $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ?";
        $updateStmt = $con->prepare($updateQuery);
        $updateStmt->bind_param("is", $newFavorite, $noteId);
        
        if ($updateStmt->execute()) {
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
