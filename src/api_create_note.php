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
$folder = isset($input['folder_name']) ? trim($input['folder_name']) : 'Default';
$workspace = isset($input['workspace']) ? trim($input['workspace']) : 'Poznote';

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

if ($originalHeading === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'The heading field is required']);
    exit;
}

// Enforce uniqueness of heading within the workspace: reject if same heading exists (non-trashed)
$check = $con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
$check->execute([$originalHeading, $workspace, $workspace]);
if ($check->fetchColumn() > 0) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'A note with the same title already exists in this workspace']);
    exit;
}

// Use the original heading (no auto-rename) since duplicates are disallowed
$heading = $originalHeading;

$stmt = $con->prepare("INSERT INTO entries (heading, tags, folder, workspace, updated) VALUES (?, ?, ?, ?, datetime('now'))");

if ($stmt->execute([$heading, $tags, $folder, $workspace])) {
    echo json_encode(['success' => true, 'id' => $con->lastInsertId()]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while creating the note']);
}
