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
 *   POST ?action=restore        Queue a restore of one archive (user_id,
 *                               filename) into the account it belongs to,
 *                               returns the job id
 *   GET  ?action=restore_status State of a restore job (user_id, job_id)
 *
 * Self-service actions (any user, own account only, once the admin allowed
 * users to back up their account, see LocalBackupService::canCurrentUserBackup;
 * they feed the "Local Backups" section of the Backup / Export page):
 *   GET  ?action=self_status    Own archives in the folder and backup policy
 *   POST ?action=self_run       Queue a background job backing up the current
 *                               user's account, returns the job id
 *   GET  ?action=run_status     State of a backup job (job_id; without it,
 *                               the caller's newest backup job). Only ever
 *                               reads the caller's own jobs.
 *   GET  ?action=self_download  Stream one of the current user's archives (filename)
 *   POST ?action=self_delete    Delete one of the current user's archives
 *                               (filename), when the admin allows it
 *
 * Manual backups are run one user per call, each as a background job (see
 * background_jobs.php): building a large account takes longer than a proxied
 * request may live. The settings page loops over the users and polls
 * run_status, like the S3 backups page does.
 *
 * A restore is the same background job as "Restore from S3" on the Restore
 * page, owned by the account being restored (the worker runs as that user,
 * and the one-restore-per-account lock is shared with the Restore page).
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
$selfActions = ['self_status', 'self_run', 'run_status', 'self_download', 'self_delete'];

if (in_array($action, $selfActions, true) && !isCurrentUserAdmin()) {
    // Admins always pass: run_status also serves the admin page's manual
    // runs. The Elements visibility rule reads the user's settings table.
    require_once __DIR__ . '/../db_connect.php';
    if (!LocalBackupService::canCurrentUserBackup()) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Backing up to the local folder is not enabled for your account. Contact your administrator.']);
        exit;
    }
} elseif (!isCurrentUserAdmin()) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Admin access required']);
    exit;
}

if ($action !== 'download' && $action !== 'self_download') {
    header('Content-Type: application/json');
}

/** Path of the archive named by the request, or null when it is not one. */
function localBackupPathParam(): ?string {
    $userId = (int)($_GET['user_id'] ?? $_POST['user_id'] ?? 0);
    $filename = (string)($_GET['filename'] ?? $_POST['filename'] ?? '');
    return LocalBackupService::backupPath($userId, $filename);
}

/** Path of one of the current user's own archives named by the request, or null. */
function localBackupOwnPathParam(): ?string {
    $filename = (string)($_GET['filename'] ?? $_POST['filename'] ?? '');
    return LocalBackupService::backupPath((int)getCurrentUserId(), $filename);
}

/** Stream one archive to the browser (path must be pre-validated). */
function localBackupStreamArchive(string $path): void {
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . str_replace(['"', '\\'], '', basename($path)) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-cache, must-revalidate');
    // Unbuffered: the archive must not be copied into memory on its way out.
    poznoteSendFile($path);
}

/**
 * Queue the background job backing up $targetUserId into the folder, owned
 * by the caller. One local backup job at a time per caller: the admin page
 * runs its users sequentially anyway, and a dead worker's job is replaced
 * rather than blocking until the daily cleanup.
 */
function localBackupStartJob(int $callerUserId, int $targetUserId): array {
    poznoteJobCleanup($callerUserId);
    $active = poznoteJobFindActive($callerUserId, POZNOTE_JOB_TYPE_LOCAL_BACKUP);
    if ($active !== null) {
        if (!poznoteJobIsWorkerStale($callerUserId, $active)) {
            return ['success' => false, 'error' => 'A local backup is already running. Wait for it to finish before starting a new one.'];
        }
        poznoteJobDelete($callerUserId, (string)$active['id']);
    }
    try {
        $job = poznoteJobCreate($callerUserId, POZNOTE_JOB_TYPE_LOCAL_BACKUP, [
            'target_user_id' => $targetUserId,
        ], 'queued');
        poznoteJobSpawnRunner($callerUserId, (string)$job['id']);
    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
    return ['success' => true, 'job_id' => (string)$job['id']];
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

        echo json_encode(localBackupStartJob((int)getCurrentUserId(), $targetUserId));
        break;
    }

    case 'run_status': {
        $currentUserId = (int)getCurrentUserId();
        $jobId = (string)($_GET['job_id'] ?? '');
        if ($jobId !== '') {
            $job = poznoteJobRead($currentUserId, $jobId);
            if ($job !== null && ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_LOCAL_BACKUP) {
                $job = null;
            }
        } else {
            // No id given: the caller's newest backup job, so a reloaded
            // page can pick a running backup back up
            $jobs = poznoteJobList($currentUserId, POZNOTE_JOB_TYPE_LOCAL_BACKUP);
            $job = $jobs[0] ?? null;
        }
        echo json_encode(['success' => true, 'job' => $job !== null ? poznoteJobPublicState($job) : null]);
        break;
    }

    case 'self_status': {
        $config = LocalBackupService::getConfig();
        $userId = (int)getCurrentUserId();
        echo json_encode([
            'success' => true,
            'auto_enabled' => $config['auto_enabled'],
            'frequency' => $config['frequency'],
            'retention' => $config['retention'],
            'included' => $config['user_ids'] === null || in_array($userId, $config['user_ids'], true),
            'can_delete' => LocalBackupService::canCurrentUserDeleteBackups(),
            'backups' => LocalBackupService::listUserBackups($userId, $config),
        ]);
        break;
    }

    case 'self_run': {
        if (!localBackupRequirePost()) {
            break;
        }
        $config = LocalBackupService::getConfig();
        $dirError = LocalBackupService::ensureDirectory($config['directory']);
        if ($dirError !== null) {
            echo json_encode(['success' => false, 'error' => $dirError]);
            break;
        }
        echo json_encode(localBackupStartJob((int)getCurrentUserId(), (int)getCurrentUserId()));
        break;
    }

    case 'self_download': {
        $path = localBackupOwnPathParam();
        if ($path === null || !is_readable($path)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Backup not found']);
            break;
        }
        localBackupStreamArchive($path);
        break;
    }

    case 'self_delete': {
        if (!localBackupRequirePost()) {
            break;
        }
        if (!LocalBackupService::canCurrentUserDeleteBackups()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Deleting backups is disabled by your administrator.']);
            break;
        }
        $path = localBackupOwnPathParam();
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
        localBackupStreamArchive($path);
        break;
    }

    case 'restore': {
        if (!localBackupRequirePost()) {
            break;
        }
        $path = localBackupPathParam();
        $targetUserId = (int)($_POST['user_id'] ?? 0);
        if ($path === null || !is_readable($path)) {
            echo json_encode(['success' => false, 'error' => 'Backup not found']);
            break;
        }
        // The archive goes back into the account it was taken from: its
        // folder names that account, and the user must still exist.
        if (!getUserProfileById($targetUserId)) {
            echo json_encode(['success' => false, 'error' => 'Unknown user']);
            break;
        }

        poznoteJobCleanup($targetUserId);
        $active = poznoteJobFindActiveRestoreFamily($targetUserId);
        if ($active !== null) {
            echo json_encode([
                'success' => false,
                'error' => ($active['type'] ?? '') === POZNOTE_JOB_TYPE_NOTES_IMPORT
                    ? 'An import is already running for this account. Wait for it to finish before starting a restore.'
                    : 'A restore is already running for this account. Wait for it to finish before starting a new one.',
            ]);
            break;
        }

        try {
            $filename = basename($path);
            $job = poznoteJobCreate($targetUserId, POZNOTE_JOB_TYPE_RESTORE, [
                'local_backup_user_id' => $targetUserId,
                'local_backup_filename' => $filename,
                'original_name' => $filename,
            ], 'queued');
            poznoteJobSpawnRunner($targetUserId, (string)$job['id']);
            echo json_encode(['success' => true, 'job_id' => (string)$job['id']]);
        } catch (Throwable $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'restore_status': {
        $targetUserId = (int)($_GET['user_id'] ?? 0);
        $job = $targetUserId > 0 ? poznoteJobRead($targetUserId, (string)($_GET['job_id'] ?? '')) : null;
        if ($job !== null && ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_RESTORE) {
            $job = null;
        }
        $state = null;
        if ($job !== null) {
            $state = poznoteJobPublicState($job);
            // A worker that died (no state update for a long time) is
            // reported so the page stops polling instead of spinning forever.
            $state['stale'] = in_array($job['status'] ?? '', ['queued', 'running'], true)
                && poznoteJobIsWorkerStale($targetUserId, $job);
        }
        echo json_encode(['success' => true, 'job' => $state]);
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}
