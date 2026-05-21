<?php
require 'auth.php';
requireAuth();

require_once 'functions.php';

header('Content-Type: application/json');

$currentUser = getCurrentUser();
$user_id = $currentUser['id'];

// Get workspace from request (GET, POST, or DELETE body)
$workspace = null;
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $workspace = $_GET['workspace'] ?? null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $workspace = $_POST['workspace'] ?? null;
} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $workspace = $_GET['workspace'] ?? null;
    if (!$workspace) {
        parse_str(file_get_contents('php://input'), $delete_params);
        $workspace = $delete_params['workspace'] ?? null;
    }
}

$workspace = trim((string)($workspace ?? ''));
$workspaceSegment = getWorkspaceBackgroundSegment($workspace);
$responseWorkspace = $workspace !== '' ? $workspace : 'default';

// Create user backgrounds directory with workspace subdirectory if it doesn't exist
$user_dir = __DIR__ . '/data/users/' . $user_id;
$backgrounds_dir = $user_dir . '/backgrounds';
$workspace_backgrounds_dir = $backgrounds_dir . '/' . $workspaceSegment;

if (!createDirectoryWithPermissions($user_dir)) {
    echo json_encode(['success' => false, 'error' => 'Failed to prepare background storage']);
    exit;
}

if (!createDirectoryWithPermissions($backgrounds_dir)) {
    echo json_encode(['success' => false, 'error' => 'Failed to prepare background storage']);
    exit;
}

if (!createDirectoryWithPermissions($workspace_backgrounds_dir)) {
    echo json_encode(['success' => false, 'error' => 'Failed to prepare background storage']);
    exit;
}

// Handle upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['background'])) {
    $file = $_FILES['background'];
    
    // Validate file
    $allowedTypes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
    ];
    $max_size = 5 * 1024 * 1024; // 5MB
    
    if ($file['size'] > $max_size) {
        echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 5MB.']);
        exit;
    }
    
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'Upload failed with error code: ' . $file['error']]);
        exit;
    }

    if (!is_uploaded_file($file['tmp_name'])) {
        echo json_encode(['success' => false, 'error' => 'Invalid uploaded file.']);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) {
        finfo_close($finfo);
    }

    if (!is_string($mimeType) || !isset($allowedTypes[$mimeType])) {
        echo json_encode(['success' => false, 'error' => 'Invalid file type. Only JPG, PNG, GIF, and WebP are allowed.']);
        exit;
    }
    
    // Delete old background if exists
    $old_files = glob($workspace_backgrounds_dir . '/background.*');
    foreach ($old_files as $old_file) {
        @unlink($old_file);
    }
    
    // Save new background
    $filename = 'background.' . $allowedTypes[$mimeType];
    $destination = $workspace_backgrounds_dir . '/' . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $destination)) {
        $url = '/data/users/' . $user_id . '/backgrounds/' . rawurlencode($workspaceSegment) . '/' . $filename . '?v=' . time();
        echo json_encode(['success' => true, 'url' => $url, 'workspace' => $responseWorkspace]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
    }
    exit;
}

// Handle delete
if ($_SERVER['REQUEST_METHOD'] === 'DELETE' || (isset($_POST['_method']) && $_POST['_method'] === 'DELETE')) {
    $files = glob($workspace_backgrounds_dir . '/background.*');
    foreach ($files as $file) {
        @unlink($file);
    }
    echo json_encode(['success' => true, 'workspace' => $responseWorkspace]);
    exit;
}

// Handle GET - check if background exists
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $files = glob($workspace_backgrounds_dir . '/background.*');
    if (!empty($files)) {
        $file = basename($files[0]);
        $url = '/data/users/' . $user_id . '/backgrounds/' . rawurlencode($workspaceSegment) . '/' . $file . '?v=' . filemtime($files[0]);
        echo json_encode(['success' => true, 'url' => $url, 'exists' => true, 'workspace' => $responseWorkspace]);
    } else {
        echo json_encode(['success' => true, 'exists' => false, 'workspace' => $responseWorkspace]);
    }
    exit;
}

echo json_encode(['success' => false, 'error' => 'Invalid request method']);
