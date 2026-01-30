<?php
require 'auth.php';
requireAuth();

require 'config.php';
require 'db_connect.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$folderId = isset($input['folder_id']) ? (int)$input['folder_id'] : null;
$sortType = isset($input['sort_type']) ? $input['sort_type'] : null;

if (!$folderId || !$sortType) {
    echo json_encode(['success' => false, 'error' => 'Missing folder_id or sort_type']);
    exit;
}

$allowedSorts = ['alphabet', 'created', 'modified'];
if (!in_array($sortType, $allowedSorts)) {
    echo json_encode(['success' => false, 'error' => 'Invalid sort type']);
    exit;
}

try {
    // Verify folder exists
    $stmt = $con->prepare("SELECT id FROM folders WHERE id = ?");
    $stmt->execute([$folderId]);
    if (!$stmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Folder not found']);
        exit;
    }

    $updateStmt = $con->prepare("UPDATE folders SET sort_setting = ? WHERE id = ?");
    $result = $updateStmt->execute([$sortType, $folderId]);

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
