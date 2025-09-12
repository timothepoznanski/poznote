<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

header('Content-Type: application/json');

// Get POST parameters
$note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
$subheading = isset($_POST['subheading']) ? trim($_POST['subheading']) : '';

if (!$note_id) {
    echo json_encode(['success' => false, 'message' => 'Invalid note ID']);
    exit;
}

try {
    // Update the subheading in the database
    $stmt = $con->prepare("UPDATE entries SET subheading = ?, updated = datetime('now') WHERE id = ?");
    $result = $stmt->execute([$subheading, $note_id]);

    if ($result) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to update subheading']);
    }
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
