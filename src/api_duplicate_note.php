<?php
// API to duplicate an existing note
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Check that the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get the JSON data sent
$input = json_decode(file_get_contents('php://input'), true);

$noteId = isset($input['note_id']) ? trim($input['note_id']) : '';

if (empty($noteId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Note ID is required']);
    exit;
}

// Get the original note data
$stmt = $con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments FROM entries WHERE id = ? AND trash = 0");
$stmt->execute([$noteId]);
$originalNote = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$originalNote) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Note not found']);
    exit;
}

// Generate a unique heading for the duplicate (within the same folder)
$originalHeading = $originalNote['heading'];

// If original heading is empty, treat it as the default translated title
if (empty($originalHeading)) {
    $originalHeading = t('index.note.new_note', [], 'New note');
}

// Generate unique title (will add (1), (2), etc. at the end)
$newHeading = generateUniqueTitle($originalHeading, null, $originalNote['workspace'], $originalNote['folder_id']);

// Insert the duplicate note
$insertStmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, attachments, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");

$attachments = $originalNote['attachments'] ?? null;

if ($insertStmt->execute([$newHeading, $originalNote['entry'], $originalNote['tags'], $originalNote['folder'], $originalNote['folder_id'], $originalNote['workspace'], $originalNote['type'], $attachments])) {
    $newId = $con->lastInsertId();
    
    // Copy the file content for all note types
    $originalFilename = getEntryFilename($noteId, $originalNote['type']);
    $newFilename = getEntryFilename($newId, $originalNote['type']);
    
    // Copy file content if it exists
    if (file_exists($originalFilename)) {
        $content = file_get_contents($originalFilename);
        if ($content !== false) {
            // Ensure the entries directory exists
            $entriesDir = dirname($newFilename);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            $write_result = file_put_contents($newFilename, $content);
            if ($write_result === false) {
                error_log("Failed to write HTML file for duplicated note ID $newId: $newFilename");
            }
        }
    }
    
    echo json_encode(['success' => true, 'id' => $newId, 'heading' => $newHeading]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while duplicating the note']);
}
?>