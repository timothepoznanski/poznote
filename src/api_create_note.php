<?php
// API to create a new note
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

$originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
$tags = isset($input['tags']) ? trim($input['tags']) : '';
$folder = isset($input['folder_name']) ? trim($input['folder_name']) : null;
$workspace = isset($input['workspace']) ? trim($input['workspace']) : getFirstWorkspaceName();
$entry = isset($input['entry']) ? $input['entry'] : ''; // HTML content for the file
$entrycontent = isset($input['entrycontent']) ? $input['entrycontent'] : ''; // Text content for database
$type = isset($input['type']) ? trim($input['type']) : 'note'; // Note type

// If a workspace was provided, verify it exists
if (!empty($workspace)) {
    $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
    $wsStmt->execute([$workspace]);
    if ($wsStmt->fetchColumn() == 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
        exit;
    }
}

// Validation des tags : supprimer les tags qui contiennent des espaces
if (!empty($tags)) {
    $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
    $validTags = [];
    foreach ($tagsArray as $tag) {
        if (!empty($tag)) {
            // Remplacer les espaces par des underscores si nécessaire
            $tag = str_replace(' ', '_', $tag);
            $validTags[] = $tag;
        }
    }
    $tags = implode(',', $validTags);
}

// Get folder_id if needed
$folder_id = null;
// Try to get folder_id from folders table if folder is specified
if ($workspace) {
    $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
    $fStmt->execute([$folder, $workspace]);
} else {
    $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
    $fStmt->execute([$folder]);
}
$folderData = $fStmt->fetch(PDO::FETCH_ASSOC);

if ($folderData) {
    $folder_id = (int)$folderData['id'];
}
// Note: If folder not found in folders table, folder_id remains null which is acceptable

// If heading is empty, default to "New note". Otherwise trim input.
$originalHeading = trim($originalHeading);
if ($originalHeading === '') {
    $heading = generateUniqueTitle('New note', null, $workspace, $folder_id);
} else {
    // If the provided heading already exists in the same folder, auto-rename using generateUniqueTitle
    // Check uniqueness within the same folder (folder_id) and workspace
    if ($folder_id !== null) {
        $check = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id = ? AND workspace = ?");
        $check->execute([$originalHeading, $folder_id, $workspace]);
    } else {
        // For notes without folder, check among other notes without folder in the same workspace
        $check = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id IS NULL AND workspace = ?");
        $check->execute([$originalHeading, $workspace]);
    }
    if ($check->fetchColumn() > 0) {
        // Generate a unique variant based on the requested heading
        $heading = generateUniqueTitle($originalHeading, null, $workspace, $folder_id);
    } else {
        $heading = $originalHeading;
    }
}

// Get current UTC timestamp
$now = time();
$now_utc = gmdate('Y-m-d H:i:s', $now);

$stmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

if ($stmt->execute([$heading, $entrycontent, $tags, $folder, $folder_id, $workspace, $type, $now_utc, $now_utc])) {
    $id = $con->lastInsertId();
    
    // Create the file for the note content with appropriate extension
    $filename = getEntryFilename($id, $type);
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Write content to file with appropriate format
    if (!empty($entry)) {
        $write_result = file_put_contents($filename, $entry);
        if ($write_result === false) {
            // Log error but don't fail the creation since DB entry was successful
            error_log("Failed to write file for note ID $id: $filename");
        }
    }
    
    echo json_encode(['success' => true, 'id' => $id]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while creating the note']);
}
