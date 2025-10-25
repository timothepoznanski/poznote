<?php
// API to save Excalidraw diagram data
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

$note_id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
$workspace = isset($_POST['workspace']) ? trim($_POST['workspace']) : 'Poznote';
$scene_data = isset($_POST['scene_data']) ? $_POST['scene_data'] : '';
$preview_image = isset($_POST['preview_image']) ? $_POST['preview_image'] : '';

// If note_id is 0, we need to create a new note
if ($note_id === 0) {
    // Get folder from POST or use default
    $folder = isset($_POST['folder']) ? trim($_POST['folder']) : getDefaultFolderForNewNotes($workspace);
    
    // Validate workspace exists
    if (!empty($workspace)) {
        $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $wsStmt->execute([$workspace]);
        if ($wsStmt->fetchColumn() == 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Workspace not found']);
            exit;
        }
    }
    
    // Generate unique title
    $uniqueTitle = generateUniqueTitle('New Excalidraw Diagram', null, $workspace);
    
    // Create new note
    $created_date = date("Y-m-d H:i:s");
    $query = "INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, ?, ?, ?, 'excalidraw', ?, ?)";
    $stmt = $con->prepare($query);
    
    if ($stmt->execute([$uniqueTitle, $scene_data, $folder, $workspace, $created_date, $created_date])) {
        $note_id = $con->lastInsertId();
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error creating note']);
        exit;
    }
} else {
    // Update existing note
    $stmt = $con->prepare('UPDATE entries SET entry = ?, updated = datetime("now") WHERE id = ?');
    if (!$stmt->execute([$scene_data, $note_id])) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error updating note']);
        exit;
    }
}

// Save preview image if provided
if (!empty($preview_image) && $note_id > 0) {
    // Decode base64 image
    $image_data = $preview_image;
    if (preg_match('/^data:image\/(\w+);base64,/', $image_data, $type)) {
        $image_data = substr($image_data, strpos($image_data, ',') + 1);
        $type = strtolower($type[1]); // jpg, png, gif
        
        if (!in_array($type, ['jpg', 'jpeg', 'gif', 'png'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid image type']);
            exit;
        }
        
        $image_data = base64_decode($image_data);
        
        if ($image_data === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Base64 decode failed']);
            exit;
        }
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid image data']);
        exit;
    }
    
    // Save to entries directory as PNG
    $filename = getEntriesRelativePath() . $note_id . ".png";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    $write_result = file_put_contents($filename, $image_data);
    if ($write_result === false) {
        error_log("Failed to write PNG file for note ID $note_id: $filename");
    }
}

echo json_encode([
    'success' => true,
    'note_id' => $note_id,
    'message' => 'Diagram saved successfully'
]);
