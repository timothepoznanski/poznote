<?php
require 'auth.php';
require 'db_connect.php';
include 'functions.php';

// Vérifier l'authentification
if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Vérifier la méthode HTTP
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use DELETE.']);
    exit;
}

// Lire les données JSON
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Valider les données
if (!isset($data['note_id']) || empty(trim($data['note_id']))) {
    http_response_code(400);
    echo json_encode(['error' => 'note_id is required']);
    exit;
}

$note_id = trim($data['note_id']);
$permanent = isset($data['permanent']) ? (bool)$data['permanent'] : false;

try {
    // Vérifier que la note existe
    $stmt = $con->prepare("SELECT heading, trash, attachments, folder FROM entries WHERE id = ?");
    $stmt->bind_param("s", $note_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $note = $result->fetch_assoc();
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    if ($permanent) {
        // Suppression permanente
        
        // Supprimer les fichiers d'attachements
        $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
        $deleted_attachments = [];
        
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $attachment_file = __DIR__ . '/attachments/' . $attachment['filename'];
                    if (file_exists($attachment_file)) {
                        if (unlink($attachment_file)) {
                            $deleted_attachments[] = $attachment['filename'];
                        }
                    }
                }
            }
        }
        
        // Supprimer le fichier HTML
        $html_file_path = __DIR__ . '/entries/';
        if ($note['folder'] && $note['folder'] !== 'Uncategorized') {
            $html_file_path .= $note['folder'] . '/';
        }
        $html_file_path .= $note_id . '.html';
        
        $html_deleted = false;
        if (file_exists($html_file_path)) {
            $html_deleted = unlink($html_file_path);
        }
        
        // Supprimer l'entrée de la base de données
        $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
        $stmt->bind_param("s", $note_id);
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
            echo json_encode(['error' => 'Failed to delete note from database']);
        }
        
    } else {
        // Suppression douce (déplacer vers la corbeille)
        
        if ($note['trash'] == 1) {
            http_response_code(400);
            echo json_encode(['error' => 'Note is already in trash']);
            exit;
        }
        
        $stmt = $con->prepare("UPDATE entries SET trash = 1, updated = NOW() WHERE id = ?");
        $stmt->bind_param("s", $note_id);
        $success = $stmt->execute();
        
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
            echo json_encode(['error' => 'Failed to move note to trash']);
        }
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>
