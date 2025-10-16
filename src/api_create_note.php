<?php
// API to create a new note
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

$originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
$tags = isset($input['tags']) ? trim($input['tags']) : '';
$folder = isset($input['folder_name']) ? trim($input['folder_name']) : 'Default';
$workspace = isset($input['workspace']) ? trim($input['workspace']) : 'Poznote';
$entry = isset($input['entry']) ? $input['entry'] : ''; // HTML content for the file
$entrycontent = isset($input['entrycontent']) ? $input['entrycontent'] : ''; // Text content for database
$type = isset($input['type']) ? trim($input['type']) : 'note'; // Note type

// If a workspace was provided, verify it exists
if (!empty($workspace)) {
    $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
    $wsStmt->execute([$workspace]);
    if ($wsStmt->fetchColumn() == 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Workspace not found']);
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

// If heading is empty, default to "New note". Otherwise trim input.
$originalHeading = trim($originalHeading);
if ($originalHeading === '') {
    $heading = generateUniqueTitle('New note', null, $workspace);
} else {
    // If the provided heading already exists, auto-rename using generateUniqueTitle
    $check = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
    $check->execute([$originalHeading, $workspace, $workspace]);
    if ($check->fetchColumn() > 0) {
        // Generate a unique variant based on the requested heading
        $heading = generateUniqueTitle($originalHeading, null, $workspace);
    } else {
        $heading = $originalHeading;
    }
}

// Validate folder existence: if a non-default folder is provided, ensure it exists
if (!isDefaultFolder($folder, $workspace)) {
    // First check the folders table scoped by workspace (if provided)
    if ($workspace) {
        $fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $fStmt->execute([$folder, $workspace, $workspace]);
    } else {
        $fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
        $fStmt->execute([$folder]);
    }
    $folderExists = $fStmt->fetchColumn() > 0;

    // Optionally allow folders that already exist as values in entries table
    if (!$folderExists) {
        if ($workspace) {
            $eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $eStmt->execute([$folder, $workspace, $workspace]);
        } else {
            $eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
            $eStmt->execute([$folder]);
        }
        $folderExists = $eStmt->fetchColumn() > 0;
    }

    if (!$folderExists) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Folder not found']);
        exit;
    }
}

$stmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, workspace, type, created, updated) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))");

if ($stmt->execute([$heading, $entrycontent, $tags, $folder, $workspace, $type])) {
    $id = $con->lastInsertId();
    
    // Create the HTML file for the note content
    $filename = getEntriesRelativePath() . $id . ".html";
    
    // Ensure the entries directory exists
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    
    // Write HTML content to file
    if (!empty($entry)) {
        $write_result = file_put_contents($filename, $entry);
        if ($write_result === false) {
            // Log error but don't fail the creation since DB entry was successful
            error_log("Failed to write HTML file for note ID $id: $filename");
        }
    }
    
    echo json_encode(['success' => true, 'id' => $id]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while creating the note']);
}
