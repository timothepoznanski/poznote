<?php
require 'auth.php';
requireApiAuth();
header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// For GET requests (list), use query params. For POST requests, require JSON.
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'list';
} else {
    // POST/PUT/DELETE require JSON body
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON request body']);
        exit;
    }
    $action = $input['action'] ?? '';
}

try {
    if ($action === 'list') {
        $stmt = $con->query("SELECT name, created FROM workspaces ORDER BY name");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'workspaces' => $rows]);
        exit;
    } else if ($action === 'create') {
        if (!isset($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'JSON body required for this action']);
            exit;
        }
        $name = trim($input['name'] ?? '');
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name is required']);
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
        if (!isset($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'JSON body required for this action']);
            exit;
        }
        $name = trim($input['name'] ?? '');
        if ($name === '' || $name === 'Poznote') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid workspace']);
            exit;
        }
        // Ensure workspace exists before trying to delete
        $check = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $check->execute([$name]);
        if ((int)$check->fetchColumn() === 0) {
            echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
            exit;
        }
        
        // Check if this workspace is set as the default workspace
        $currentDefaultWorkspace = null;
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $currentDefaultWorkspace = $stmt->fetchColumn();
        } catch (Exception $e) {
            // Settings table may not exist - ignore
        }
        
        // Move notes from this workspace to default before deleting
        $stmt = $con->prepare("UPDATE entries SET workspace = 'Poznote' WHERE workspace = ?");
        $stmt->execute([$name]);

        // If the deleted workspace was the default workspace, reset to "last opened"
        if ($currentDefaultWorkspace === $name) {
            try {
                $resetStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $resetStmt->execute(['default_workspace', '__last_opened__']);
            } catch (Exception $e) {
                // If settings update fails, continue - it's not critical for workspace deletion
            }
        }

        $stmt = $con->prepare("DELETE FROM workspaces WHERE name = ?");
        // Audit log: record delete attempts
        try {
            $logDir = __DIR__ . '/../data';
            if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
            $logFile = $logDir . '/workspace_actions.log';
            // Determine actor for log: prefer session auth, else basic auth username if present
            $who = 'unknown';
            if (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['authenticated'])) {
                $who = 'session_user';
            } elseif (!empty($_SERVER['PHP_AUTH_USER'])) {
                $who = $_SERVER['PHP_AUTH_USER'];
            }
            $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
            $entry = date('c') . "\tapi_workspaces.php\tDELETE\t$name\tby:$who\tfrom:$ip\n";
            @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
        } catch (Exception $e) {
            // ignore logging errors
        }

        if ($stmt->execute([$name])) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error deleting workspace']);
        }
        exit;
    } else if ($action === 'rename') {
        if (!isset($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'JSON body required for this action']);
            exit;
        }
        $old = trim($input['old_name'] ?? '');
        $new = trim($input['new_name'] ?? '');
        if ($old === '' || $new === '' || $old === 'Poznote' || $new === 'Poznote') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid names']);
            exit;
        }
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $new)) {
            echo json_encode(['success' => false, 'message' => 'Invalid new name: use letters, numbers, dash or underscore only']);
            exit;
        }
        // Ensure the source workspace exists
        $checkOld = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $checkOld->execute([$old]);
        if ((int)$checkOld->fetchColumn() === 0) {
            echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
            exit;
        }
        // Ensure the target name does not already exist
        $checkNew = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $checkNew->execute([$new]);
        if ((int)$checkNew->fetchColumn() > 0) {
            echo json_encode(['success' => false, 'message' => 'Target workspace name already exists']);
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
