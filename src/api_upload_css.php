<?php
require 'auth.php';
requireAdmin();

require_once 'functions.php';
require_once __DIR__ . '/users/db_master.php';

header('Content-Type: application/json');

$css_dir = __DIR__ . '/data/css';

if (!createDirectoryWithPermissions($css_dir)) {
    echo json_encode(['success' => false, 'error' => 'Failed to create css directory']);
    exit;
}

// Handle GET - check if a custom CSS file is currently configured and exists
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $filename = getGlobalSetting('custom_css_path', '');
    if ($filename && preg_match('/^[A-Za-z0-9._-]+\.css$/', $filename)) {
        $path = $css_dir . '/' . $filename;
        if (is_file($path)) {
            $url = '/data/css/' . rawurlencode($filename) . '?v=' . filemtime($path);
            echo json_encode(['success' => true, 'exists' => true, 'filename' => $filename, 'url' => $url]);
            exit;
        }
    }
    echo json_encode(['success' => true, 'exists' => false]);
    exit;
}

// Handle POST - upload a CSS file
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['css_file'])) {
    $file = $_FILES['css_file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'error' => 'Upload failed with error code: ' . $file['error']]);
        exit;
    }

    $max_size = 1 * 1024 * 1024; // 1 MB
    if ($file['size'] > $max_size) {
        echo json_encode(['success' => false, 'error' => 'File too large. Maximum size is 1 MB.']);
        exit;
    }

    // Validate MIME type (not just extension, read the first bytes)
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowed_mimes = ['text/css', 'text/plain', 'application/octet-stream'];
    if (!in_array($mime, $allowed_mimes, true)) {
        echo json_encode(['success' => false, 'error' => 'Invalid file type. Only CSS files are allowed.']);
        exit;
    }

    // Sanitize filename: keep the original name if valid, otherwise use custom.css
    $original = pathinfo($file['name'], PATHINFO_FILENAME);
    $original = preg_replace('/[^A-Za-z0-9._-]/', '_', $original);
    $filename = ($original !== '' ? $original : 'custom') . '.css';
    // Cap length
    if (strlen($filename) > 64) {
        $filename = 'custom.css';
    }

    $destination = $css_dir . '/' . $filename;

    // Delete previous file if configured and exists to avoid accumulation
    $oldFilename = getGlobalSetting('custom_css_path', '');
    if ($oldFilename && $oldFilename !== $filename && preg_match('/^[A-Za-z0-9._-]+\.css$/', $oldFilename)) {
        $oldPath = $css_dir . '/' . $oldFilename;
        if (is_file($oldPath)) {
            @unlink($oldPath);
        }
    }

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        echo json_encode(['success' => false, 'error' => 'Failed to save file']);
        exit;
    }

    // Persist the filename in global settings
    setGlobalSetting('custom_css_path', $filename);

    $url = '/data/css/' . rawurlencode($filename) . '?v=' . time();
    echo json_encode(['success' => true, 'filename' => $filename, 'url' => $url]);
    exit;
}

// Handle DELETE - remove the CSS file and clear the setting
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $filename = getGlobalSetting('custom_css_path', '');
    if ($filename && preg_match('/^[A-Za-z0-9._-]+\.css$/', $filename)) {
        $path = $css_dir . '/' . $filename;
        if (is_file($path)) {
            @unlink($path);
        }
    }
    setGlobalSetting('custom_css_path', '');
    echo json_encode(['success' => true]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Invalid request']);
