<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';
include 'functions.php';

// Verify HTTP method
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use DELETE.']);
    exit;
}

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

// Validate data
if (!isset($data['note_id']) || empty(trim($data['note_id']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'note_id is required']);
    exit;
}

$note_id = trim($data['note_id']);
$permanent = isset($data['permanent']) ? (bool)$data['permanent'] : false;

try {
    // First, check if this is the protected note by getting its heading
    $workspace = isset($data['workspace']) ? trim($data['workspace']) : null;

    if ($workspace) {
        $checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $checkStmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
        $checkStmt->execute([$note_id]);
    }
    $heading = $checkStmt->fetchColumn();

    // Vérifier que la note existe
    $workspace = isset($data['workspace']) ? trim($data['workspace']) : null;

    if ($workspace) {
        $stmt = $con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ?");
        $stmt->execute([$note_id]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        exit;
    }
    
    if ($permanent) {
        // Suppression permanente
        
        // Delete attachment files
        $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
        $deleted_attachments = [];
        
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $attachment_file = getAttachmentsPath() . '/' . $attachment['filename'];
                    if (file_exists($attachment_file)) {
                        if (unlink($attachment_file)) {
                            $deleted_attachments[] = $attachment['filename'];
                        }
                    }
                }
            }
        }
        
        // Delete note file (HTML or Markdown based on type)
        $noteType = $note['type'] ?? 'note';
        $fileExtension = ($noteType === 'markdown') ? '.md' : '.html';
        
        // Build file path with workspace support
        $wsSegment = $workspace ? ('workspace_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($workspace))) : 'workspace_default';
        $note_file_path = __DIR__ . '/entries/' . $wsSegment . '/';
        
        // If note has a folder, include it in the path
        if (!empty($note['folder'])) {
            $note_file_path .= $note['folder'] . '/';
        }
        $note_file_path .= $note_id . $fileExtension;
        
        $file_deleted = false;
        if (file_exists($note_file_path)) {
            $file_deleted = unlink($note_file_path);
        }
        
        // For Excalidraw notes, also delete the PNG file
        $png_deleted = false;
        $png_file_path = getEntriesPath() . '/' . $note_id . '.png';
        if (file_exists($png_file_path)) {
            $png_deleted = unlink($png_file_path);
        }
        
        // Delete database entry (respect workspace if provided)
        if ($workspace) {
            $stmt = $con->prepare("DELETE FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $success = $stmt->execute([$note_id, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
            $success = $stmt->execute([$note_id]);
        }
        
        if ($success) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Note permanently deleted',
                'note' => [
                    'id' => $note_id,
                    'title' => $note['heading'],
                    'html_file_deleted' => $html_deleted,
                    'png_file_deleted' => $png_deleted,
                    'attachments_deleted' => $deleted_attachments
                ]
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to delete note from database']);
        }
        
    } else {
        // Trashing the note
        
        if ($note['trash'] == 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Note is already in trash']);
            exit;
        }
        
        if ($workspace) {
            $stmt = $con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $success = $stmt->execute([$note_id, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ?");
            $success = $stmt->execute([$note_id]);
        }
        
        if ($success) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Note moved to trash',
                'note' => [
                    'id' => $note_id,
                    'title' => $note['heading'],
                    'action' => 'moved_to_trash'
                ]
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to move note to trash']);
        }
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
