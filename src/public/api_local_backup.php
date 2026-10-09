<?php
/**
 * Local backup admin endpoint (admin only).
 *
 * Actions:
 *   GET  ?action=status         Schedule info, backup folder state and user list
 *   GET  ?action=list           Backup archives currently in the backup folder
 *   POST ?action=run            Queue a background job backing up one user
 *                               (user_id) into the folder, returns the job id
 *   GET  ?action=run_status     State of a backup job (job_id)
 *   POST ?action=record_manual  Store the summary of a finished manual run
 *   POST ?action=delete         Delete one backup archive (user_id, filename)
 *   GET  ?action=download       Stream one backup archive (user_id, filename)
 *
 * Manual backups are run one user per call, each as a background job (see
 * background_jobs.php): building a large account takes longer than a proxied
 * request may live. The settings page loops over the users and polls
 * run_status, like the S3 backups page does.
 */
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../LocalBackupService.php';
require_once __DIR__ . '/../background_jobs.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);

$action = $_GET['action'] ?? $_POST['action'] ?? '';

if (!isCurrentUserAdmin()) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Admin access required']);
    exit;
}

if ($action !== 'download') {
    header('Content-Type: application/json');
}

/** Path of the archive named by the request, or null when it is not one. */
function localBackupPathParam(): ?string {
    $userId = (int)($_GET['user_id'] ?? $_POST['user_id'] ?? 0);
    $filename = (string)($_GET['filename'] ?? $_POST['filename'] ?? '');
    return LocalBackupService::backupPath($userId, $filename);
}

function localBackupRequirePost(): bool {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        return true;
    }
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'POST required']);
    return false;
}

switch ($action) {
    case 'status': {
        $config = LocalBackupService::getConfig();
        $users = [];
        foreach (listAllUserProfiles() as $user) {
            $users[] = [
                'id' => (int)$user['id'],
                'username' => $user['username'],
                'selected' => $config['user_ids'] === null || in_array((int)$user['id'], $config['user_ids'], true),
            ];
        }
        $summary = json_decode((string)getGlobalSetting('local_backup_last_run_summary', ''), true);
        $lastAutoRun = (int)getGlobalSetting('local_backup_last_auto_run', '0');
        echo json_encode([
            'success' => true,
            'auto_enabled' => $config['auto_enabled'],
            'directory' => $config['directory'],
            'directory_error' => LocalBackupService::ensureDirectory($config['directory']),
            'frequency' => $config['frequency'],
            'retention' => $config['retention'],
            'last_auto_run' => $lastAutoRun,
            'next_auto_run' => $config['auto_enabled'] && $lastAutoRun > 0
                ? $lastAutoRun + LocalBackupService::FREQUENCIES[$config['frequency']]
                : null,
            'last_run' => is_array($summary) ? $summary : null,
            'users' => $users,
        ]);
        break;
    }

    case 'list': {
        $usernames = [];
        foreach (listAllUserProfiles() as $user) {
            $usernames[(int)$user['id']] = $user['username'];
        }
        $backups = LocalBackupService::listBackups();
        foreach ($backups as &$backup) {
            $backup['username'] = $usernames[$backup['user_id']] ?? ('#' . $backup['user_id']);
        }
        unset($backup);

        echo json_encode(['success' => true, 'backups' => $backups]);
        break;
    }

    case 'run': {
        if (!localBackupRequirePost()) {
            break;
        }
        $targetUserId = (int)($_POST['user_id'] ?? 0);
        if ($targetUserId <= 0 || !getUserProfileById($targetUserId)) {
            echo json_encode(['success' => false, 'error' => 'Unknown user']);
            break;
        }

        // One local backup job at a time per caller: the page runs its users
        // sequentially anyway, and a dead worker's job is replaced rather
        // than blocking until the daily cleanup.
        $callerUserId = (int)getCurrentUserId();
        poznoteJobCleanup($callerUserId);
        $active = poznoteJobFindActive($callerUserId, POZNOTE_JOB_TYPE_LOCAL_BACKUP);
        if ($active !== null) {
            if (!poznoteJobIsWorkerStale($callerUserId, $active)) {
                echo json_encode(['success' => false, 'error' => 'A local backup is already running. Wait for it to finish before starting a new one.']);
                break;
            }
            poznoteJobDelete($callerUserId, (string)$active['id']);
        }
        try {
            $job = poznoteJobCreate($callerUserId, POZNOTE_JOB_TYPE_LOCAL_BACKUP, [
                'target_user_id' => $targetUserId,
            ], 'queued');
            poznoteJobSpawnRunner($callerUserId, (string)$job['id']);
            echo json_encode(['success' => true, 'job_id' => (string)$job['id']]);
        } catch (Throwable $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'run_status': {
        $job = poznoteJobRead((int)getCurrentUserId(), (string)($_GET['job_id'] ?? ''));
        if ($job !== null && ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_LOCAL_BACKUP) {
            $job = null;
        }
        echo json_encode(['success' => true, 'job' => $job !== null ? poznoteJobPublicState($job) : null]);
        break;
    }

    case 'record_manual': {
        if (!localBackupRequirePost()) {
            break;
        }
        $errors = json_decode((string)($_POST['errors'] ?? '[]'), true);
        if (!is_array($errors)) {
            $errors = [];
        }
        $errors = array_slice(array_map('strval', $errors), 0, 10);
        $users = (int)($_POST['users'] ?? 0);
        $saved = (int)($_POST['saved'] ?? 0);
        LocalBackupService::recordRun('manual', [
            'success' => $saved > 0 && $saved >= $users && empty($errors),
            'users' => $users,
            'saved' => $saved,
            'errors' => $errors,
        ]);
        echo json_encode(['success' => true]);
        break;
    }

    case 'delete': {
        if (!localBackupRequirePost()) {
            break;
        }
        $path = localBackupPathParam();
        if ($path === null) {
            echo json_encode(['success' => false, 'error' => 'Backup not found']);
            break;
        }
        if (@unlink($path)) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to delete backup file']);
        }
        break;
    }

    case 'download': {
        $path = localBackupPathParam();
        if ($path === null || !is_readable($path)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Backup not found']);
            break;
        }
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . str_replace(['"', '\\'], '', basename($path)) . '"');
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-cache, must-revalidate');
        // Unbuffered: the archive must not be copied into memory on its way out.
        poznoteSendFile($path);
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}
