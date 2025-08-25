<?php
require 'auth.php';
requireApiAuth();
header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

try {
    if ($action === 'list') {
        $stmt = $con->query("SELECT name, created FROM workspaces ORDER BY name");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'workspaces' => $rows]);
        exit;
    } else if ($action === 'create') {
        $name = trim($_POST['name'] ?? '');
        if ($name === '') {
            echo json_encode(['success' => false, 'message' => 'Name required']);
            exit;
        }
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) {
            echo json_encode(['success' => false, 'message' => 'Invalid name: use letters, numbers, dash or underscore only']);
            exit;
        }
        $stmt = $con->prepare("INSERT INTO workspaces (name) VALUES (?)");
        if ($stmt->execute([$name])) {
            echo json_encode(['success' => true, 'name' => $name]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error creating workspace']);
        }
        exit;
    } else if ($action === 'delete') {
        $name = trim($_POST['name'] ?? '');
        if ($name === '' || $name === 'Poznote') {
            echo json_encode(['success' => false, 'message' => 'Invalid workspace']);
            exit;
        }
        // Move notes from this workspace to default before deleting
        $stmt = $con->prepare("UPDATE entries SET workspace = 'Poznote' WHERE workspace = ?");
        $stmt->execute([$name]);

        // Remove workspace-scoped default folder setting, if present
        try {
            $delSetting = $con->prepare("DELETE FROM settings WHERE key = ?");
            $delSetting->execute(['default_folder_name::' . $name]);
        } catch (Exception $e) {
            // non-fatal: continue with workspace deletion
        }

        $stmt = $con->prepare("DELETE FROM workspaces WHERE name = ?");
        if ($stmt->execute([$name])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error deleting workspace']);
        }
        exit;
    } else if ($action === 'rename') {
        $old = trim($_POST['old_name'] ?? '');
        $new = trim($_POST['new_name'] ?? '');
        if ($old === '' || $new === '' || $old === 'Poznote' || $new === 'Poznote') {
            echo json_encode(['success' => false, 'message' => 'Invalid names']);
            exit;
        }
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $new)) {
            echo json_encode(['success' => false, 'message' => 'Invalid new name: use letters, numbers, dash or underscore only']);
            exit;
        }
        // Update entries workspace and workspaces table
        $stmt = $con->prepare("UPDATE entries SET workspace = ? WHERE workspace = ?");
        $stmt->execute([$new, $old]);
        $stmt = $con->prepare("UPDATE workspaces SET name = ? WHERE name = ?");
        if ($stmt->execute([$new, $old])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error renaming workspace']);
        }
        exit;
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

echo json_encode(['success' => false, 'message' => 'Unknown action']);

?>
