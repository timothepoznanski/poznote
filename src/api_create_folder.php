<?php
require 'auth.php';
requireApiAuth();

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
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Validate data
if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['error' => 'folder_name is required']);
    exit;
}

$folder_name = trim($data['folder_name']);

// Verify that folder name is valid
if (strlen($folder_name) > 255) {
    http_response_code(400);
    echo json_encode(['error' => 'Folder name too long (max 255 characters)']);
    exit;
}

// Forbidden characters in folder names
$forbidden_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
foreach ($forbidden_chars as $char) {
    if (strpos($folder_name, $char) !== false) {
        http_response_code(400);
        echo json_encode(['error' => "Folder name contains forbidden character: $char"]);
        exit;
    }
}

// Prevent creating folders with reserved system names
$reserved_names = ['Favorites', 'Tags', 'Trash'];
if (in_array($folder_name, $reserved_names)) {
    http_response_code(400);
    echo json_encode(['error' => 'Cannot create folder with reserved name: ' . $folder_name]);
    exit;
}

try {
    // Check if folder already exists
    $workspace = isset($data['workspace']) ? trim($data['workspace']) : 'Poznote';

    $checkStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ?");
    $checkStmt->execute([$folder_name, $workspace]);
    $count = $checkStmt->fetchColumn();
    
    if ($count > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'A folder with this name already exists in this workspace']);
        exit;
    }
    
    // Create folder in database
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, created) VALUES (?, ?, datetime('now'))");
    $result = $stmt->execute([$folder_name, $workspace]);
    
    if (!$result) {
        echo json_encode(['success' => false, 'error' => 'Failed to insert folder']);
        exit;
    }
    
    $folder_id = $con->lastInsertId();
    
    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder' => [
            'id' => $folder_id,
            'name' => $folder_name,
            'workspace' => $workspace
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
?>
