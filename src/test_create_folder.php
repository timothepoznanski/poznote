<?php
// Version simplifiée pour test
header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

// Verify HTTP method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON', 'received' => $json]);
    exit;
}

// Validate data
if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['error' => 'folder_name is required', 'data' => $data]);
    exit;
}

$folder_name = trim($data['folder_name']);
$workspace = isset($data['workspace']) ? trim($data['workspace']) : 'Poznote';

try {
    // Simple insert
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, created) VALUES (?, ?, datetime('now'))");
    $result = $stmt->execute([$folder_name, $workspace]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'message' => 'Folder created successfully',
            'folder_name' => $folder_name,
            'workspace' => $workspace
        ]);
    } else {
        echo json_encode(['error' => 'Failed to insert folder']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>
