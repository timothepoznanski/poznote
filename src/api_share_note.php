<?php
require 'auth.php';
requireAuth();
require_once 'config.php';
require_once 'db_connect.php';

// Only accept JSON POST
$body = file_get_contents('php://input');
$data = json_decode($body, true);
if (!$data || !isset($data['note_id'])) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => 'note_id required']);
    exit;
}

$note_id = intval($data['note_id']);

// Verify that the user has access to this note (owner or can view in workspace)
try {
    $stmt = $con->prepare('SELECT id FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $exists = $stmt->fetchColumn();
    if (!$exists) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }

    // Generate a token
    $token = bin2hex(random_bytes(16));

    // Insert or replace existing token for this note
    $stmt = $con->prepare('INSERT INTO shared_notes (note_id, token) VALUES (?, ?)');
    $stmt->execute([$note_id, $token]);

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
    $url = $protocol . '://' . $host . dirname($_SERVER['SCRIPT_NAME']) . '/public_note.php?token=' . $token;

    header('Content-Type: application/json');
    echo json_encode(['url' => $url]);
    exit;
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
    exit;
}
?>