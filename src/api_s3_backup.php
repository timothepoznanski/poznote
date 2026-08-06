<?php
/**
 * S3 backup admin endpoint (admin only).
 *
 * Actions:
 *   POST ?action=test           Test a connection with the submitted (or saved) config
 *   GET  ?action=status         Configuration state, schedule info and user list
 *   GET  ?action=list           Backup archives currently in the bucket
 *   POST ?action=run            Back up one user (user_id) to the bucket
 *   POST ?action=record_manual  Store the summary of a finished manual run
 *   POST ?action=delete         Delete one backup archive (key)
 *   GET  ?action=download       Stream one backup archive to the browser (key)
 *
 * Self-service actions (any authenticated user, own account only, unless the
 * user_s3_backups tenant isolation feature blocks them for non-admins):
 *   GET  ?action=self_status    Own archives in the bucket and schedule info
 *   POST ?action=self_run       Back up the current user's account
 *   GET  ?action=self_download  Stream one of the current user's archives (key)
 *   POST ?action=self_delete    Delete one of the current user's archives (key)
 *
 * Manual backups are run one user per call: the settings page loops over the
 * users, which keeps every request short and shows progress, like the
 * attachment migration does.
 */
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'users/db_master.php';
require_once 'S3BackupService.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$selfActions = ['self_status', 'self_run', 'self_download', 'self_delete'];

// Self-service actions require the feature to be enabled (master switch);
// admin actions stay available so the feature can be configured and inspected
if (in_array($action, $selfActions, true) && !S3BackupService::isEnabled()) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'S3 backups are disabled']);
    exit;
}

if (!isCurrentUserAdmin()) {
    $backupsBlocked = in_array('user_s3_backups', TENANT_ISOLATION_FEATURES, true);
    $restoreBlocked = in_array('user_s3_restore', TENANT_ISOLATION_FEATURES, true);
    $allowed = in_array($action, $selfActions, true);
    if ($allowed) {
        // self_status feeds both the Backup page section and the Restore from
        // S3 one, so it stays available while either capability is allowed
        $allowed = $action === 'self_status'
            ? !($backupsBlocked && $restoreBlocked)
            : !$backupsBlocked;
    }
    if (!$allowed) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Admin access required']);
        exit;
    }
}

/** Validated bucket key of a backup archive, or null. */
function s3BackupKeyParam(): ?string {
    $key = (string)($_GET['key'] ?? $_POST['key'] ?? '');
    return preg_match('#^backups/\d+/[^/]+\.zip$#', $key) ? $key : null;
}

if ($action !== 'download' && $action !== 'self_download') {
    header('Content-Type: application/json');
}

/** Stream one backup archive to the browser (key must be pre-validated). */
function s3BackupStreamArchive(string $key): void {
    try {
        $client = S3BackupService::makeClient();
        $head = $client->headObject($key);
        if ($head === null) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Backup not found']);
            return;
        }
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . basename($key) . '"');
        header('Content-Length: ' . $head['size']);
        header('Cache-Control: no-cache, must-revalidate');
        $client->streamObject($key);
    } catch (Exception $e) {
        if (!headers_sent()) {
            http_response_code(502);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    }
}

switch ($action) {
    case 'test': {
        // Test with submitted values; a masked secret means "use the saved one"
        $saved = S3BackupService::getConfig();
        $secret = (string)($_POST['secret_key'] ?? '');
        if ($secret === '' || $secret === '••••••••') {
            $secret = $saved['secret_key'];
        }
        $config = [
            'endpoint' => trim((string)($_POST['endpoint'] ?? $saved['endpoint'])),
            'region' => trim((string)($_POST['region'] ?? $saved['region'])) ?: 'us-east-1',
            'bucket' => trim((string)($_POST['bucket'] ?? $saved['bucket'])),
            'access_key' => trim((string)($_POST['access_key'] ?? $saved['access_key'])),
            'secret_key' => $secret,
            'path_style' => (($_POST['path_style'] ?? ($saved['path_style'] ? '1' : '0')) === '1'),
        ];
        try {
            $client = S3BackupService::makeClient($config);
            echo json_encode($client->testConnection());
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'status': {
        $config = S3BackupService::getConfig();
        $users = [];
        foreach (listAllUserProfiles() as $user) {
            $users[] = [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'selected' => $config['user_ids'] === null || in_array((int)$user['id'], $config['user_ids'], true),
            ];
        }
        $summary = json_decode((string)getGlobalSetting('s3_backup_last_run_summary', ''), true);
        echo json_encode([
            'success' => true,
            'configured' => S3BackupService::isConfigured($config),
            'auto_enabled' => $config['auto_enabled'],
            'frequency' => $config['frequency'],
            'retention' => $config['retention'],
            'last_auto_run' => (int)getGlobalSetting('s3_backup_last_auto_run', '0'),
            'last_run' => is_array($summary) ? $summary : null,
            'users' => $users,
        ]);
        break;
    }

    case 'list': {
        try {
            $client = S3BackupService::makeClient();
            $backups = S3BackupService::listBackups($client);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            break;
        }

        $usernames = [];
        foreach (listAllUserProfiles() as $user) {
            $usernames[(int)$user['id']] = $user['username'];
        }
        foreach ($backups as &$backup) {
            $backup['username'] = $usernames[$backup['user_id']] ?? ('#' . $backup['user_id']);
        }
        unset($backup);

        echo json_encode(['success' => true, 'backups' => $backups]);
        break;
    }

    case 'run': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'POST required']);
            break;
        }
        $userId = (int)($_POST['user_id'] ?? 0);
        if ($userId <= 0 || !getUserProfileById($userId)) {
            echo json_encode(['success' => false, 'error' => 'Unknown user']);
            break;
        }
        set_time_limit(0);
        $result = S3BackupService::backupUser($userId);
        echo json_encode($result);
        break;
    }

    case 'record_manual': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'POST required']);
            break;
        }
        $errors = json_decode((string)($_POST['errors'] ?? '[]'), true);
        if (!is_array($errors)) {
            $errors = [];
        }
        $errors = array_slice(array_map('strval', $errors), 0, 10);
        $users = (int)($_POST['users'] ?? 0);
        $uploaded = (int)($_POST['uploaded'] ?? 0);
        S3BackupService::recordRun('manual', [
            'success' => $uploaded > 0 && $uploaded >= $users && empty($errors),
            'users' => $users,
            'uploaded' => $uploaded,
            'errors' => $errors,
        ]);
        echo json_encode(['success' => true]);
        break;
    }

    case 'delete': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'POST required']);
            break;
        }
        $key = s3BackupKeyParam();
        if ($key === null) {
            echo json_encode(['success' => false, 'error' => 'Invalid backup key']);
            break;
        }
        try {
            S3BackupService::makeClient()->deleteObject($key);
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'download': {
        $key = s3BackupKeyParam();
        if ($key === null) {
            http_response_code(400);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Invalid backup key']);
            break;
        }
        s3BackupStreamArchive($key);
        break;
    }

    case 'self_status': {
        $config = S3BackupService::getConfig();
        $userId = (int)getCurrentUserId();
        if (!S3BackupService::isConfigured($config)) {
            echo json_encode(['success' => true, 'configured' => false, 'backups' => []]);
            break;
        }
        try {
            $client = S3BackupService::makeClient($config);
            $backups = [];
            foreach ($client->listObjects(S3BackupService::keyPrefixForUser($userId)) as $object) {
                $backups[] = [
                    'key' => $object['key'],
                    'size' => $object['size'],
                    'filename' => basename($object['key']),
                ];
            }
            usort($backups, function ($a, $b) {
                return strcmp($b['filename'], $a['filename']);
            });
            echo json_encode([
                'success' => true,
                'configured' => true,
                'auto_enabled' => $config['auto_enabled'],
                'frequency' => $config['frequency'],
                'included' => $config['user_ids'] === null || in_array($userId, $config['user_ids'], true),
                'backups' => $backups,
            ]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'self_run': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'POST required']);
            break;
        }
        if (!S3BackupService::isConfigured()) {
            echo json_encode(['success' => false, 'error' => 'S3 backup is not configured']);
            break;
        }
        set_time_limit(0);
        echo json_encode(S3BackupService::backupUser((int)getCurrentUserId()));
        break;
    }

    case 'self_download': {
        $key = s3BackupKeyParam();
        // Only the current user's own archives can be streamed
        $ownPrefix = S3BackupService::keyPrefixForUser((int)getCurrentUserId());
        if ($key === null || strpos($key, $ownPrefix) !== 0) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Invalid backup key']);
            break;
        }
        s3BackupStreamArchive($key);
        break;
    }

    case 'self_delete': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'POST required']);
            break;
        }
        $key = s3BackupKeyParam();
        // Only the current user's own archives can be deleted
        $ownPrefix = S3BackupService::keyPrefixForUser((int)getCurrentUserId());
        if ($key === null || strpos($key, $ownPrefix) !== 0) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Invalid backup key']);
            break;
        }
        try {
            S3BackupService::makeClient()->deleteObject($key);
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}
