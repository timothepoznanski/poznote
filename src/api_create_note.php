<?php
// API to create a new note
header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

// Check that the request is POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get the JSON data sent
$input = json_decode(file_get_contents('php://input'), true);

$heading = isset($input['heading']) ? trim($input['heading']) : '';
$tags = isset($input['tags']) ? trim($input['tags']) : '';
$folder = isset($input['folder']) ? trim($input['folder']) : 'Uncategorized';

if ($heading === '') {
    http_response_code(400);
    echo json_encode(['error' => 'The heading field is required']);
    exit;
}

$stmt = $con->prepare("INSERT INTO entries (heading, tags, folder, updated) VALUES (?, ?, ?, NOW())");
$stmt->bind_param('sss', $heading, $tags, $folder);

if ($stmt->execute()) {
    echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Error while creating the note']);
}
$stmt->close();
