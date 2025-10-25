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
$heading = isset($_POST['heading']) ? trim($_POST['heading']) : 'New Excalidraw Diagram';
$diagram_data = isset($_POST['diagram_data']) ? $_POST['diagram_data'] : '';
$preview_image = isset($_FILES['preview_image']) ? $_FILES['preview_image'] : null;

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
    $uniqueTitle = generateUniqueTitle($heading, null, $workspace);
    
    // Create new note
    $created_date = date("Y-m-d H:i:s");
    $query = "INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, ?, ?, ?, 'excalidraw', ?, ?)";
    $stmt = $con->prepare($query);
    
    if ($stmt->execute([$uniqueTitle, $diagram_data, $folder, $workspace, $created_date, $created_date])) {
        $note_id = $con->lastInsertId();
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error creating note']);
        exit;
    }
} else {
    // Update existing note
    $stmt = $con->prepare('UPDATE entries SET heading = ?, entry = ?, updated = datetime("now") WHERE id = ?');
    if (!$stmt->execute([$heading, $diagram_data, $note_id])) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Error updating note']);
        exit;
    }
}

// Save preview image if provided
if ($preview_image && $preview_image['error'] === UPLOAD_ERR_OK && $note_id > 0) {
    // Validate it's an image
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime_type = finfo_file($finfo, $preview_image['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mime_type, ['image/png', 'image/jpeg', 'image/gif'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid image type']);
        exit;
    }
    
    // Save to entries directory as PNG
    $filename = getEntriesRelativePath() . $note_id . ".png";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Move uploaded file
    if (!move_uploaded_file($preview_image['tmp_name'], $filename)) {
        error_log("Failed to save PNG file for note ID $note_id: $filename");
    }
}

echo json_encode([
    'success' => true,
    'note_id' => $note_id,
    'message' => 'Diagram saved successfully'
]);
