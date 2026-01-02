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

// Duplicate attachments if they exist and update references in content
$newAttachments = null;
$attachmentIdMapping = []; // Map old attachment IDs to new ones
$originalAttachments = $originalNote['attachments'] ? json_decode($originalNote['attachments'], true) : [];

if (!empty($originalAttachments)) {
    $attachmentsDir = getAttachmentsPath();
    $duplicatedAttachments = [];
    
    foreach ($originalAttachments as $attachment) {
        $originalFilePath = $attachmentsDir . '/' . $attachment['filename'];
        
        // Check if the original attachment file exists
        if (file_exists($originalFilePath)) {
            // Generate new unique filename and ID
            $fileExtension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
            $newFilename = uniqid() . '_' . time() . '.' . $fileExtension;
            $newFilePath = $attachmentsDir . '/' . $newFilename;
            $oldAttachmentId = $attachment['id'];
            $newAttachmentId = uniqid();
            
            // Copy the file
            if (copy($originalFilePath, $newFilePath)) {
                chmod($newFilePath, 0644);
                
                // Store the mapping of old ID to new ID
                $attachmentIdMapping[$oldAttachmentId] = $newAttachmentId;
                
                // Create new attachment entry with new filename but keep original data
                $newAttachment = [
                    'id' => $newAttachmentId,
                    'filename' => $newFilename,
                    'original_filename' => $attachment['original_filename'],
                    'file_size' => $attachment['file_size'],
                    'file_type' => $attachment['file_type'],
                    'uploaded_at' => date('Y-m-d H:i:s')
                ];
                
                $duplicatedAttachments[] = $newAttachment;
            } else {
                error_log("Failed to copy attachment file: $originalFilePath to $newFilePath");
            }
        } else {
            error_log("Attachment file not found during duplication: $originalFilePath");
        }
    }
    
    $newAttachments = !empty($duplicatedAttachments) ? json_encode($duplicatedAttachments) : null;
}

// Update attachment references in the entry content (will be updated again after getting new note ID)
$newEntryContent = $originalNote['entry'];

// Insert the duplicate note with temporary content
$insertStmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, attachments, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");

if ($insertStmt->execute([$newHeading, $newEntryContent, $originalNote['tags'], $originalNote['folder'], $originalNote['folder_id'], $originalNote['workspace'], $originalNote['type'], $newAttachments])) {
    $newNoteId = $con->lastInsertId();
    
    // Now update all references in the content (both note_id and attachment_id)
    if (!empty($attachmentIdMapping)) {
        foreach ($attachmentIdMapping as $oldAttachmentId => $newAttachmentId) {
            // Replace attachment_id references
            $newEntryContent = str_replace(
                'attachment_id=' . $oldAttachmentId,
                'attachment_id=' . $newAttachmentId,
                $newEntryContent
            );
        }
    }
    
    // Replace note_id references from old note to new note
    $newEntryContent = str_replace(
        'note_id=' . $noteId,
        'note_id=' . $newNoteId,
        $newEntryContent
    );
    
    // Update the database entry with corrected content
    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
    $updateStmt->execute([$newEntryContent, $newNoteId]);
    
    // Copy the file content for all note types
    $originalFilename = getEntryFilename($noteId, $originalNote['type']);
    $newFilename = getEntryFilename($newNoteId, $originalNote['type']);
    
    // Copy file content if it exists
    if (file_exists($originalFilename)) {
        $content = file_get_contents($originalFilename);
        if ($content !== false) {
            // Update attachment references in file content
            if (!empty($attachmentIdMapping)) {
                foreach ($attachmentIdMapping as $oldAttachmentId => $newAttachmentId) {
                    $content = str_replace(
                        'attachment_id=' . $oldAttachmentId,
                        'attachment_id=' . $newAttachmentId,
                        $content
                    );
                }
            }
            
            // Replace note_id references from old note to new note
            $content = str_replace(
                'note_id=' . $noteId,
                'note_id=' . $newNoteId,
                $content
            );
            
            // Ensure the entries directory exists
            $entriesDir = dirname($newFilename);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            $write_result = file_put_contents($newFilename, $content);
            if ($write_result === false) {
                error_log("Failed to write HTML file for duplicated note ID $newNoteId: $newFilename");
            }
        }
    }
    
    echo json_encode(['success' => true, 'id' => $newNoteId, 'heading' => $newHeading]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while duplicating the note']);
}
?>