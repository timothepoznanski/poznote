<?php
header('Content-Type: application/json');

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Check request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['note_id']) || !isset($input['improved_content'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Note ID and improved content are required']);
    exit;
}

$note_id = $input['note_id'];
$improved_content = $input['improved_content'];

try {
    // Verify note exists
    $stmt = $con->prepare("SELECT id FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    // Get entries path
    include_once 'functions.php';
    $entries_path = getEntriesPath();
    $html_file = $entries_path . '/' . $note_id . '.html';
    
    // Preserve line breaks properly
    // First escape HTML characters, then convert newlines to <br> tags
    $escaped_content = htmlspecialchars($improved_content, ENT_QUOTES, 'UTF-8');
    $html_content = nl2br($escaped_content, false); // false means use <br> instead of <br />
    
    // Write the improved content to the HTML file
    if (file_put_contents($html_file, $html_content) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not write to note file']);
        exit;
    }
    
    // Update the modification timestamp in database
    $stmt = $con->prepare("UPDATE entries SET updated = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt->execute([$note_id]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Note updated successfully'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>
