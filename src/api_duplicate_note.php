<?php
// API to duplicate an existing note
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'default_folder_settings.php';

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
$stmt = $con->prepare("SELECT heading, entry, tags, folder, workspace, type, attachments FROM entries WHERE id = ? AND trash = 0");
$stmt->execute([$noteId]);
$originalNote = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$originalNote) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Note not found']);
    exit;
}

// Generate a unique heading for the duplicate
$originalHeading = $originalNote['heading'];
$newHeading = generateUniqueTitle($originalHeading, null, $originalNote['workspace']);

// Insert the duplicate note
$insertStmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, workspace, type, attachments, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");

$attachments = $originalNote['attachments'] ?? null;

if ($insertStmt->execute([$newHeading, $originalNote['entry'], $originalNote['tags'], $originalNote['folder'], $originalNote['workspace'], $originalNote['type'], $attachments])) {
    $newId = $con->lastInsertId();
    
    // Copy the HTML file content and handle Excalidraw notes
    $originalFilename = getEntriesRelativePath() . $noteId . ".html";
    $newFilename = getEntriesRelativePath() . $newId . ".html";
    
    // For Excalidraw notes, copy the PNG file (independent of HTML file existence)
    if ($originalNote['type'] === 'excalidraw') {
        $originalPngPath = getEntriesRelativePath() . $noteId . ".png";
        $newPngPath = getEntriesRelativePath() . $newId . ".png";
        
        error_log("Duplicating Excalidraw note: $noteId -> $newId");
        error_log("Original PNG: $originalPngPath - " . (file_exists($originalPngPath) ? 'EXISTS' : 'MISSING'));
        error_log("Target PNG: $newPngPath");
        
        // Copy the PNG file if it exists
        if (file_exists($originalPngPath)) {
            // Ensure the entries directory exists
            $entriesDir = getEntriesRelativePath();
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            $copyResult = copy($originalPngPath, $newPngPath);
            error_log("PNG copy result: " . ($copyResult ? 'SUCCESS' : 'FAILED'));
            if (!$copyResult) {
                error_log("Failed to copy PNG file for duplicated Excalidraw note ID $newId");
            } else {
                error_log("PNG successfully copied to: $newPngPath");
            }
        } else {
            error_log("Original PNG file not found: $originalPngPath");
        }
    }
    
    // Copy HTML file content if it exists (for regular notes)
    if (file_exists($originalFilename)) {
        $content = file_get_contents($originalFilename);
        if ($content !== false) {
            // Ensure the entries directory exists
            $entriesDir = dirname($newFilename);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            // For Excalidraw notes, update HTML references (if HTML exists)
            if ($originalNote['type'] === 'excalidraw') {
                // Update the HTML content to reference the new PNG file
                $content = str_replace(
                    "data/entries/$noteId.png", 
                    "data/entries/$newId.png", 
                    $content
                );
                
                // Also update any onclick references to the new note ID
                $content = str_replace(
                    "openExcalidrawNote($noteId)",
                    "openExcalidrawNote($newId)",
                    $content
                );
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