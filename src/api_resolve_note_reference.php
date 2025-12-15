<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

try {
    $reference = $_GET['reference'] ?? $_POST['reference'] ?? null;
    $workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? null;
    
    if (!$reference) {
        echo json_encode(['success' => false, 'message' => 'No reference provided']);
        exit;
    }
    
    // Check if reference is a numeric ID
    if (is_numeric($reference)) {
        $note_id = intval($reference);
        $stmt = $con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        // Search by heading (title)
        $stmt = $con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND heading LIKE ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote')) ORDER BY updated DESC LIMIT 1");
        $stmt->execute(['%' . $reference . '%', $workspace, $workspace]);
    }
    
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($note) {
        echo json_encode([
            'success' => true, 
            'id' => $note['id'],
            'heading' => $note['heading']
        ]);
    } else {
        echo json_encode([
            'success' => false, 
            'message' => 'Note not found'
        ]);
    }
    
} catch (Exception $e) {
    error_log("Error in api_resolve_note_reference.php: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Database error occurred']);
}
?>
