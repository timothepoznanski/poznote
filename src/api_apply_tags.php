<?php
header('Content-Type: application/json');

require 'auth.php';
requireApiAuth();

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

if (!$input || !isset($input['note_id']) || !isset($input['tags'])) {
    http_response_code(400);
    echo json_encode(['error' => 'note_id and tags are required']);
    exit;
}

$note_id = $input['note_id'];
$workspace = $input['workspace'] ?? null;
$tags = $input['tags'];

try {
    // Verify note exists
    if ($workspace) {
        $stmt = $con->prepare("SELECT id FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT id FROM entries WHERE id = ?");
        $stmt->execute([$note_id]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    // Convert tags array to comma-separated string
    $tags_string = '';
    if (is_array($tags) && count($tags) > 0) {
        // Validate tags - remove any that contain spaces and replace spaces with underscores if needed
        $valid_tags = [];
        foreach ($tags as $tag) {
            $tag = trim($tag);
            if (!empty($tag)) {
                // If tag contains spaces, replace with underscores
                $tag = str_replace(' ', '_', $tag);
                $valid_tags[] = $tag;
            }
        }
        $tags_string = implode(', ', $valid_tags);
    }
    
    // Update the tags in the database (respect workspace if provided)
    if ($workspace) {
        $stmt = $con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$tags_string, $note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$tags_string, $note_id]);
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Tags updated successfully',
        'applied_tags' => $tags_string
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>
