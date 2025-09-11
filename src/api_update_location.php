<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

// Get POST parameters
$note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
$location = isset($_POST['location']) ? trim($_POST['location']) : '';

if (!$note_id) {
    echo json_encode(['success' => false, 'message' => 'Invalid note ID']);
    exit;
}

try {
    // Update the location in the database
    $stmt = $con->prepare("UPDATE entries SET location = ?, updated = datetime('now') WHERE id = ?");
    $result = $stmt->execute([$location, $note_id]);

    if ($result) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to update location']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
