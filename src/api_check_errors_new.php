<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
require_once 'AIHelper.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get the note ID from the POST data
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['note_id']) || !is_numeric($input['note_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid or missing note_id']);
    exit;
}

$note_id = intval($input['note_id']);

// Use AIHelper to check errors
$result = AIHelper::checkErrors($note_id, $con);

if (isset($result['error'])) {
    http_response_code(400);
    echo json_encode(['error' => $result['error']]);
    exit;
}

// Return the corrections
echo json_encode([
    'success' => true,
    'error_check' => $result['corrections']
]);
?>
