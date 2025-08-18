<?php
// API to create a new note
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

// Check that the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get the JSON data sent
$input = json_decode(file_get_contents('php://input'), true);

$heading = isset($input['heading']) ? trim($input['heading']) : '';
$tags = isset($input['tags']) ? trim($input['tags']) : '';
$folder = isset($input['folder_name']) ? trim($input['folder_name']) : 'Uncategorized';

if ($heading === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'The heading field is required']);
    exit;
}

$stmt = $con->prepare("INSERT INTO entries (heading, tags, folder, updated) VALUES (?, ?, ?, datetime('now'))");

if ($stmt->execute([$heading, $tags, $folder])) {
    echo json_encode(['success' => true, 'id' => $con->lastInsertId()]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error while creating the note']);
}
