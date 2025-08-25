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

try {
    // Check if folder already exists
    // Optional workspace
    $workspace = isset($data['workspace']) ? trim($data['workspace']) : null;

    if ($workspace) {
        $checkStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $checkStmt->execute([$folder_name, $workspace, $workspace]);
        $count = $checkStmt->fetchColumn();
    } else {
        $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
        $stmt->execute([$folder_name]);
        $count = $stmt->fetchColumn();
    }
    
    if ($count > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'Folder already exists']);
        exit;
    }
    
    // Create folder in database
    if ($workspace) {
        $stmt = $con->prepare("INSERT INTO folders (name, workspace, created) VALUES (?, ?, datetime('now'))");
        $stmt->execute([$folder_name, $workspace]);
    } else {
        $stmt = $con->prepare("INSERT INTO folders (name, created) VALUES (?, datetime('now'))");
        $stmt->execute([$folder_name]);
    }
    
    $folder_id = $con->lastInsertId();
    
    // Create physical folder
    // Store physical folders under workspace-specific path to avoid collisions
    $wsSegment = $workspace ? ('workspace_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($workspace))) : 'workspace_default';
    $folder_path = __DIR__ . '/entries/' . $wsSegment . '/' . $folder_name;
    if (!file_exists($folder_path)) {
        if (!mkdir($folder_path, 0755, true)) {
            // Database rollback if folder creation fails
            $stmt = $con->prepare("DELETE FROM folders WHERE id = ?");
            $stmt->execute([$folder_id]);
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create folder directory']);
            exit;
        }
    }
    
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder' => [
            'id' => $folder_id,
            'name' => $folder_name,
            'path' => $folder_path
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>
