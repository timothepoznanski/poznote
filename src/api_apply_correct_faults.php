<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors in output, but log them

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

if (!$input || !isset($input['note_id']) || !isset($input['corrected_content'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Note ID and corrected content are required']);
    exit;
}

$note_id = $input['note_id'];
$corrected_content = $input['corrected_content'];

try {
    // Verify note exists
    $stmt = $con->prepare("SELECT id FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    // Get entries path
    include_once 'functions.php';
    $entries_path = getEntriesPath();
    $html_file = $entries_path . '/' . $note_id . '.html';
    
    if (!file_exists($html_file)) {
        http_response_code(404);
        echo json_encode(['error' => 'Note content file not found']);
        exit;
    }
    
    // Convert text content to HTML with preserved line breaks
    $html_content = nl2br(htmlspecialchars($corrected_content, ENT_QUOTES, 'UTF-8'));
    
    // Write the corrected content to the HTML file
    $result = file_put_contents($html_file, $html_content);
    
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save corrected content']);
        exit;
    }
    
    // Update the last modified timestamp
    $stmt = $con->prepare("UPDATE entries SET updated = CURRENT_TIMESTAMP WHERE id = ?");
    $stmt->execute([$note_id]);
    
    echo json_encode([
        'success' => true,
        'message' => 'Corrections applied successfully'
    ]);
    
} catch (PDOException $e) {
    error_log("Database error in api_apply_correct_faults.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    error_log("General error in api_apply_correct_faults.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>
