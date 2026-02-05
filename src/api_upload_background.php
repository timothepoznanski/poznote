<?php
require 'auth.php';
requireAuth();

header('Content-Type: application/json');

$currentUser = getCurrentUser();
$user_id = $currentUser['id'];

// Get workspace from request (GET, POST, or DELETE body)
$workspace = null;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $workspace = isset($_GET['workspace']) ? $_GET['workspace'] : null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $workspace = isset($_POST['workspace']) ? $_POST['workspace'] : null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // For DELETE, try to parse from query string or body
    $workspace = isset($_GET['workspace']) ? $_GET['workspace'] : null;
    if (!$workspace) {
        parse_str(file_get_contents('php://input'), $delete_params);
        $workspace = isset($delete_params['workspace']) ? $delete_params['workspace'] : null;
    }
}

// Sanitize workspace name for filesystem use
if ($workspace) {
    $workspace = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $workspace);
} else {
    $workspace = 'default';
}

// Create user backgrounds directory with workspace subdirectory if it doesn't exist
$backgrounds_dir = __DIR__ . '/data/backgrounds';
$user_backgrounds_dir = $backgrounds_dir . '/' . $user_id;
$workspace_backgrounds_dir = $user_backgrounds_dir . '/' . $workspace;

if (!file_exists($backgrounds_dir)) {
    if (!mkdir($backgrounds_dir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create backgrounds directory: ' . $backgrounds_dir]);
        exit;
    }
}

if (!file_exists($user_backgrounds_dir)) {
    if (!mkdir($user_backgrounds_dir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create user backgrounds directory: ' . $user_backgrounds_dir]);
        exit;
    }
}

if (!file_exists($workspace_backgrounds_dir)) {
    if (!mkdir($workspace_backgrounds_dir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Failed to create workspace backgrounds directory: ' . $workspace_backgrounds_dir]);
        exit;
    }
}

// Handle upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['background'])) {
    $file = $_FILES['background'];
    
    // Validate file
    $allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    $max_size = 5 * 1024 * 1024; // 5MB
    
    if (!in_array($file['type'], $allowed_types)) {
        echo json_encode(['success' => false, 'error' => 'Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.']);
        exit;
    }
    
    if ($file['size'] > $max_size) {
        echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 5MB.']);
        exit;
    }
    
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'Upload failed with error code: ' . $file['error']]);
        exit;
    }
    
    // Delete old background if exists
    $old_files = glob($workspace_backgrounds_dir . '/background.*');
    foreach ($old_files as $old_file) {
        @unlink($old_file);
    }
    
    // Save new background
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'background.' . $extension;
    $destination = $workspace_backgrounds_dir . '/' . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $destination)) {
        $url = '/data/backgrounds/' . $user_id . '/' . $workspace . '/' . $filename . '?v=' . time();
        echo json_encode(['success' => true, 'url' => $url, 'workspace' => $workspace]);
    } else {
        $error_msg = 'Failed to save file';
        if (!is_writable($workspace_backgrounds_dir)) {
            $error_msg .= ': Directory not writable (' . $workspace_backgrounds_dir . ')';
        }
        echo json_encode(['success' => false, 'error' => $error_msg]);
    }
    exit;
}

// Handle delete
if ($_SERVER['REQUEST_METHOD'] === 'DELETE' || (isset($_POST['_method']) && $_POST['_method'] === 'DELETE')) {
    $files = glob($workspace_backgrounds_dir . '/background.*');
    foreach ($files as $file) {
        @unlink($file);
    }
    echo json_encode(['success' => true, 'workspace' => $workspace]);
    exit;
}

// Handle GET - check if background exists
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $files = glob($workspace_backgrounds_dir . '/background.*');
    if (!empty($files)) {
        $file = basename($files[0]);
        $url = '/data/backgrounds/' . $user_id . '/' . $workspace . '/' . $file . '?v=' . filemtime($files[0]);
        echo json_encode(['success' => true, 'url' => $url, 'exists' => true, 'workspace' => $workspace]);
    } else {
        echo json_encode(['success' => true, 'exists' => false, 'workspace' => $workspace]);
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Invalid request method']);
