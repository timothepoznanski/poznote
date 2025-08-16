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
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

// Validate data
if (!isset($data['note_id']) || empty(trim($data['note_id']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'note_id is required']);
    exit;
}

if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'folder_name is required']);
    exit;
}

$note_id = trim($data['note_id']);
$folder_name = trim($data['folder_name']);

try {
    // Verify that note exists
    $stmt = $con->prepare("SELECT heading, folder FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        exit;
    }
    
    $current_folder = $note['folder'];
    
    // Verify that destination folder exists (dans la table folders ou comme dossier utilisé dans entries)
    $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
    $stmt->execute([$folder_name]);
    $folder_exists = $stmt->fetchColumn() > 0;
    
    if (!$folder_exists) {
        // Check if folder already exists in entries
        $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
        $stmt->execute([$folder_name]);
        $folder_exists = $stmt->fetchColumn() > 0;
        
        if (!$folder_exists && $folder_name !== 'Uncategorized') {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Folder not found']);
            exit;
        }
    }
    
    // Determine file paths
    $old_file_path = __DIR__ . '/entries/' . ($current_folder !== 'Uncategorized' ? $current_folder . '/' : '') . $note_id . '.html';
    $new_folder_path = __DIR__ . '/entries/' . ($folder_name !== 'Uncategorized' ? $folder_name : '');
    $new_file_path = $new_folder_path . '/' . $note_id . '.html';
    
    // If destination folder is Uncategorized, place file at root
    if ($folder_name === 'Uncategorized') {
        $new_file_path = __DIR__ . '/entries/' . $note_id . '.html';
    }
    
    // Verify that note file exists
    if (!file_exists($old_file_path)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note file not found at: ' . $old_file_path]);
        exit;
    }
    
    // Create destination folder if it does not exist physically
    if ($folder_name !== 'Uncategorized' && !file_exists($new_folder_path)) {
        if (!mkdir($new_folder_path, 0755, true)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to create destination folder directory']);
            exit;
        }
    }
    
    // Move file
    if (!rename($old_file_path, $new_file_path)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to move note file']);
        exit;
    }
    
    // Mettre à jour la base de données
    $stmt = $con->prepare("UPDATE entries SET folder = ?, updated = datetime('now') WHERE id = ?");
    $stmt->execute([$folder_name, $note_id]);
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Note moved successfully',
        'note' => [
            'id' => $note_id,
            'title' => $note['heading'],
            'old_folder' => $current_folder,
            'new_folder' => $folder_name,
            'old_path' => $old_file_path,
            'new_path' => $new_file_path
        ]
    ]);
    
} catch (Exception $e) {
    // In case of error, try to put file back in place
    if (isset($new_file_path) && isset($old_file_path) && file_exists($new_file_path) && !file_exists($old_file_path)) {
        rename($new_file_path, $old_file_path);
    }
    
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
