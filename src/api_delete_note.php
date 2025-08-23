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
    // Vérifier que la note existe
    $stmt = $con->prepare("SELECT heading, trash, attachments, folder FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
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
                    $attachment_file = getAttachmentsRelativePath() . $attachment['filename'];
                    if (file_exists($attachment_file)) {
                        if (unlink($attachment_file)) {
                            $deleted_attachments[] = $attachment['filename'];
                        }
                    }
                }
            }
        }
        
        // Delete HTML file
        $html_file_path = __DIR__ . '/entries/';
        if ($note['folder'] && $note['folder'] !== 'Uncategorized') {
            $html_file_path .= $note['folder'] . '/';
        }
        $html_file_path .= $note_id . '.html';
        
        $html_deleted = false;
        if (file_exists($html_file_path)) {
            $html_deleted = unlink($html_file_path);
        }
        
        // Delete database entry
        $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
        // PDO uses execute with array -  $note_id);
        $success = $stmt->execute();
        
        if ($success) {
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'message' => 'Note permanently deleted',
                'note' => [
                    'id' => $note_id,
                    'title' => $note['heading'],
                    'html_file_deleted' => $html_deleted,
                    'attachments_deleted' => $deleted_attachments
                ]
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to delete note from database']);
        }
        
    } else {
        // Suppression douce (déplacer vers la corbeille)
        
        if ($note['trash'] == 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Note is already in trash']);
            exit;
        }
        
        $stmt = $con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ?");
        $success = $stmt->execute([$note_id]);
        
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
