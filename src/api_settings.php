<?php
require 'auth.php';

// Debug log for troubleshooting 500 errors (append-only) - run before auth check so we always capture the request
try {
    $dbg = [ 'ts'=>date('c'), 'remote'=>$_SERVER['REMOTE_ADDR'] ?? '', 'method'=>$_SERVER['REQUEST_METHOD'] ?? '', 'uri'=>$_SERVER['REQUEST_URI'] ?? '', 'post'=>$_POST ];
    @file_put_contents('/tmp/poznote_api_settings_debug.log', json_encode($dbg) . PHP_EOL, FILE_APPEND | LOCK_EX);
} catch (Exception $e) {
    // ignore logging failures
}

// Do not require full session auth for read (get) because `login_display_name` is public
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
header('Content-Type: application/json');

$action = $_POST['action'] ?? '';
$key = $_POST['key'] ?? '';
try {
if ($action === 'get') {
    if ($key === '') { echo json_encode(['success'=>false, 'error'=>t('api.settings.key_required')]); exit; }
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute([$key]);
        $v = $stmt->fetchColumn();
        if ($v === false) $v = '';
        echo json_encode(['success'=>true, 'key'=>$key, 'value'=>$v]);
    } catch (Exception $e) {
        echo json_encode(['success'=>false, 'error'=>$e->getMessage()]);
    }
    exit;
} elseif ($action === 'set') {
    $value = $_POST['value'] ?? '';
    if ($key === '') { echo json_encode(['success'=>false, 'error'=>t('api.settings.key_required')]); exit; }
    try {
    // Require user authentication for changes
    requireAuth();

    $up = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $up->execute([$key, $value]);
        echo json_encode(['success'=>true, 'key'=>$key, 'value'=>$value]);
    } catch (Exception $e) {
        @file_put_contents('/tmp/poznote_api_settings_debug.log', "ERROR: " . $e->getMessage() . PHP_EOL, FILE_APPEND | LOCK_EX);
        echo json_encode(['success'=>false, 'error'=>$e->getMessage()]);
    }
    exit;
}

echo json_encode(['success'=>false, 'error'=>t('api.settings.invalid_action')]);
} catch (Exception $e) {
    @file_put_contents('/tmp/poznote_api_settings_debug.log', "FATAL: " . $e->getMessage() . PHP_EOL, FILE_APPEND | LOCK_EX);
    http_response_code(500);
    echo json_encode(['success'=>false, 'error'=>t('api.settings.internal_error'), 'message'=>$e->getMessage()]);
}
