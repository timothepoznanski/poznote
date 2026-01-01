<?php
/**
 * API Endpoint: Convert HTML Note to Markdown
 *
 * Converts an HTML note to a Markdown note type
 * 
 * Method: POST
 * Parameters:
 *   - note_id: Note ID (required)
 *
 * Response (JSON):
 *   - success: boolean
 *   - message: string
 */

require_once 'auth.php';
requireApiAuth();

header('Content-Type: application/json; charset=utf-8');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'html_to_markdown_parser.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

$noteId = $_POST['note_id'] ?? null;

if (!$noteId || !is_numeric($noteId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid or missing note_id']);
    exit;
}

$noteId = (int)$noteId;

try {
    // Get the note details
    $stmt = $con->prepare('SELECT id, type FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note not found or has been deleted']);
        exit;
    }
    
    $noteType = $note['type'] ?? 'note';
    
    // Check if note is markdown or not HTML
    if ($noteType !== 'note') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Note is not an HTML note']);
        exit;
    }
    
    // Get file paths
    $oldFilename = getEntryFilename($noteId, 'note');
    $newFilename = getEntryFilename($noteId, 'markdown');
    
    // Security: ensure the paths are within the entries directory
    $oldRealPath = realpath($oldFilename);
    $newRealPath = dirname($oldFilename) . '/' . basename($newFilename);
    $expectedDir = realpath(getEntriesPath());
    
    if ($oldRealPath === false || $expectedDir === false || strpos($oldRealPath, $expectedDir) !== 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid file path']);
        exit;
    }
    
    // Check if old file exists
    if (!file_exists($oldFilename)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note file not found']);
        exit;
    }
    
    // Read HTML content
    $htmlContent = file_get_contents($oldFilename);
    
    if ($htmlContent === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to read note content']);
        exit;
    }
    
    // Convert HTML to Markdown
    $markdownContent = parseHTMLToMarkdown($htmlContent);
    
    // Write new markdown file
    if (file_put_contents($newFilename, $markdownContent) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to write markdown file']);
        exit;
    }
    
    // Update database
    $stmt = $con->prepare('UPDATE entries SET type = ? WHERE id = ?');
    $stmt->execute(['markdown', $noteId]);
    
    // Remove old HTML file
    if (!unlink($oldFilename)) {
        // Non-critical error - file will be orphaned but conversion succeeded
        error_log("Warning: Failed to delete old HTML file: $oldFilename");
    }
    
    // Success
    echo json_encode([
        'success' => true,
        'message' => 'Note successfully converted to Markdown'
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'An error occurred: ' . $e->getMessage()
    ]);
}
?>
