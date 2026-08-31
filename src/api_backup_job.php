<?php

/**
 * Background complete-export endpoint (job flow, see background_jobs.php).
 *
 * The archive is built by a detached CLI worker instead of inside this HTTP
 * request: building can take many minutes for large accounts and no proxy in
 * front of the instance will keep a response-less request alive that long.
 * The browser starts the job, polls its status, then downloads the finished
 * file, whose streaming begins immediately and therefore passes proxies.
 *
 *   POST ?action=start     Queue an export job ({selected_user_id}, admin
 *                          only for other users; {skip_s3_attachments})
 *   GET  ?action=status    State of one job (job_id), or of the newest
 *                          export job when job_id is omitted
 *   GET  ?action=download  Stream a finished job's archive (job_id)
 *   POST ?action=discard   Delete a finished/failed job and its file (job_id)
 */

require 'auth.php';
requireAuth();
requireActiveAccountOwner();

// A public-workspace session borrows the owner's identity (user_id ==
// login_user_id == owner), so requireActiveAccountOwner() alone lets it
// through; this endpoint would then hand an anonymous visitor the owner's
// full backup. Deny it the same way the admin API gate does.
if (isPublicWorkspaceAccessActive()) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'This endpoint is not available in public workspace mode']);
    exit;
}

require_once 'config.php';
require_once 'functions.php';
require_once 'users/db_master.php';
require_once 'background_jobs.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$currentUserId = (int)getCurrentUserId();

// Same gate as the Backup page itself, but as JSON: this endpoint is only
// called from a page that already passed the settings password.
if (defined('SETTINGS_PASSWORD') && SETTINGS_PASSWORD !== ''
    && empty($_SESSION['settings_password_authenticated'])) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Settings authentication required']);
    exit;
}

if ($action !== 'download') {
    header('Content-Type: application/json');
}

// State-changing actions carry the page's CSRF token
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $expected = (string)($_SESSION['backup_export_csrf_token'] ?? '');
    $posted = (string)($_POST['csrf_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, $posted)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid form submission. Please reload the page.']);
        exit;
    }
}

switch ($action) {
    case 'start': {
        poznoteJobCleanup($currentUserId);

        // One export at a time per user: a second click while a build runs
        // returns the running job instead of stacking another worker. A job
        // whose worker died (no state update for a long time) is not treated
        // as active, so a new export can replace it.
        $active = poznoteJobFindActive($currentUserId, POZNOTE_JOB_TYPE_EXPORT);
        if ($active !== null && !poznoteJobIsWorkerStale($currentUserId, $active)) {
            echo json_encode(['success' => true, 'already_running' => true, 'job' => poznoteJobPublicState($active)]);
            exit;
        }

        // A new export replaces the previous one: drop finished/failed export
        // jobs so at most one archive per user sits on disk.
        foreach (poznoteJobList($currentUserId, POZNOTE_JOB_TYPE_EXPORT) as $old) {
            poznoteJobDelete($currentUserId, (string)$old['id']);
        }

        $targetUserId = isset($_POST['selected_user_id']) ? (int)$_POST['selected_user_id'] : $currentUserId;
        if ($targetUserId !== $currentUserId && !isCurrentUserAdmin()) {
            $targetUserId = $currentUserId;
        }
        if (!getUserProfileById($targetUserId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Unknown user']);
            exit;
        }

        try {
            $job = poznoteJobCreate($currentUserId, POZNOTE_JOB_TYPE_EXPORT, [
                'target_user_id' => $targetUserId,
                'skip_s3_attachments' => !empty($_POST['skip_s3_attachments']),
            ]);
            poznoteJobSpawnRunner($currentUserId, (string)$job['id']);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
        echo json_encode(['success' => true, 'job' => poznoteJobPublicState($job)]);
        exit;
    }

    case 'status': {
        $jobId = $_GET['job_id'] ?? '';
        if ($jobId !== '') {
            $job = poznoteJobRead($currentUserId, $jobId);
        } else {
            // No id: the newest export job, so a reloaded page can pick a
            // running build (or a ready archive) back up.
            $jobs = poznoteJobList($currentUserId, POZNOTE_JOB_TYPE_EXPORT);
            $job = $jobs[0] ?? null;
        }
        if ($job === null || ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_EXPORT) {
            echo json_encode(['success' => true, 'job' => null]);
            exit;
        }
        echo json_encode(['success' => true, 'job' => poznoteJobPublicState($job)]);
        exit;
    }

    case 'download': {
        $jobId = $_GET['job_id'] ?? '';
        $job = poznoteJobRead($currentUserId, $jobId);
        $file = poznoteJobIdIsValid($jobId) ? poznoteJobDir($currentUserId, $jobId) . '/export.zip' : '';
        if ($job === null || ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_EXPORT
            || ($job['status'] ?? '') !== 'done' || !is_file($file)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'No finished export to download']);
            exit;
        }
        $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
        $downloadName = (string)($payload['filename'] ?? 'poznote_backup.zip');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $downloadName . '"');
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: no-cache, must-revalidate');
        header('Expires: 0');
        // The file is kept after the download: an interrupted transfer can be
        // retried until the job is discarded or expires.
        readfile($file);
        exit;
    }

    case 'discard': {
        $jobId = $_POST['job_id'] ?? '';
        $job = poznoteJobRead($currentUserId, $jobId);
        if ($job !== null && ($job['type'] ?? '') === POZNOTE_JOB_TYPE_EXPORT) {
            // Finished/failed jobs are freely removable; a queued/running one
            // only when its worker looks dead, so an in-progress build is not
            // deleted from under itself.
            $status = $job['status'] ?? '';
            $removable = !in_array($status, ['queued', 'running'], true)
                || poznoteJobIsWorkerStale($currentUserId, $job);
            if ($removable) {
                poznoteJobDelete($currentUserId, (string)$job['id']);
            }
        }
        echo json_encode(['success' => true]);
        exit;
    }

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        exit;
}
