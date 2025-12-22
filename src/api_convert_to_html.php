<?php
/**
 * API Endpoint: Convert Markdown Note to HTML
 *
 * Converts a markdown note to an HTML note type
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
require_once 'markdown_parser.php';

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
    
    // Check if note is already HTML or not markdown
    if ($noteType !== 'markdown') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Note is not a markdown note']);
        exit;
    }
    
    // Get file paths
    $oldFilename = getEntryFilename($noteId, 'markdown');
    $newFilename = getEntryFilename($noteId, 'note');
    
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
    
    // Read the markdown content
    $markdownContent = file_get_contents($oldFilename);
    if ($markdownContent === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cannot read note file']);
        exit;
    }
    
    // Convert markdown to HTML
    $htmlContent = parseMarkdown($markdownContent);
    
    // Begin transaction
    $con->beginTransaction();
    
    try {
        // Update the database to change the note type
        $stmt = $con->prepare('UPDATE entries SET type = ? WHERE id = ?');
        $stmt->execute(['note', $noteId]);
        
        // Write the HTML content to the new file
        if (file_put_contents($newFilename, $htmlContent) === false) {
            throw new Exception('Failed to write HTML file');
        }
        
        // Delete the old markdown file
        if (!unlink($oldFilename)) {
            throw new Exception('Failed to delete old markdown file');
        }
        
        // Commit the transaction
        $con->commit();
        
        echo json_encode([
            'success' => true,
            'message' => 'Note successfully converted to HTML'
        ]);
        exit;
        
    } catch (Exception $e) {
        // Rollback on error
        $con->rollBack();
        
        // Try to cleanup: remove new file and restore old one if needed
        if (file_exists($newFilename)) {
            @unlink($newFilename);
        }
        // Restore original markdown content if old file was deleted
        if (!file_exists($oldFilename) && isset($markdownContent)) {
            @file_put_contents($oldFilename, $markdownContent);
        }
        
        throw $e;
    }
    
} catch (Exception $e) {
    error_log('Error in api_convert_to_html.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'An error occurred while converting the note']);
    exit;
}
