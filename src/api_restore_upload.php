<?php

/**
 * Chunked complete-restore endpoint (job flow, see background_jobs.php).
 *
 * A large backup archive cannot travel as one POST: proxies in front of
 * self-hosted instances commonly cap the request body (Cloudflare Free/Pro
 * refuses anything over 100 MB) and PHP/nginx have their own limits. The
 * page JS slices the file into chunks of a few dozen MB, each one an
 * ordinary POST that passes everywhere, then a detached CLI worker
 * assembles the chunks and runs the standard restore pipeline, so the
 * restore itself cannot be interrupted by an HTTP timeout either.
 *
 *   POST ?action=init      Open an upload ({filename, total_size,
 *                          total_chunks}), returns the upload id
 *   POST ?action=chunk     One slice (multipart: upload_id, chunk_index,
 *                          chunk file)
 *   POST ?action=finalize  All chunks sent: queue the assemble+restore job
 *   POST ?action=start_s3  Queue a restore from an archive already in the
 *                          bucket (s3_backup_key), no upload involved
 *   GET  ?action=status    State of the job (upload_id)
 *   POST ?action=abort     Drop an unfinished upload and its chunks
 */

require 'auth.php';
requireAuth();
requireActiveAccountOwner();

// A public-workspace session borrows the owner's identity, so
// requireActiveAccountOwner() alone lets it through; this endpoint would
// then let an anonymous visitor overwrite the owner's whole account. Deny
// it the same way the admin API gate does.
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

header('Content-Type: application/json');

// Hard bound on one uploaded slice: far above the 32 MB the page JS uses,
// far below every body-size limit in the stack (Cloudflare's 100 MB
// included), so a chunk POST never hits a proxy or PHP refusal.
const POZNOTE_RESTORE_CHUNK_MAX_BYTES = 96 * 1024 * 1024;

// At most this many chunks per upload (bounds the directory size)
const POZNOTE_RESTORE_MAX_CHUNKS = 4096;

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$currentUserId = (int)getCurrentUserId();

// Same gate as the Restore page itself, but as JSON
if (defined('SETTINGS_PASSWORD') && SETTINGS_PASSWORD !== ''
    && empty($_SESSION['settings_password_authenticated'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Settings authentication required']);
    exit;
}

// Every state-changing action carries the Restore page's CSRF token
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $expected = (string)($_SESSION['restore_import_csrf_token'] ?? '');
    $posted = (string)($_POST['csrf_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, $posted)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid form submission. Please reload the page.']);
        exit;
    }
}

/** The restore job for a submitted upload_id, or null. */
function restoreUploadJob(int $userId): ?array {
    $jobId = $_GET['upload_id'] ?? $_POST['upload_id'] ?? '';
    $job = poznoteJobRead($userId, $jobId);
    if ($job === null || ($job['type'] ?? '') !== POZNOTE_JOB_TYPE_RESTORE) {
        return null;
    }
    return $job;
}

function restoreUploadFail(int $code, string $error): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $error]);
    exit;
}

switch ($action) {
    case 'init': {
        poznoteJobCleanup($currentUserId);

        $active = poznoteJobFindActive($currentUserId, POZNOTE_JOB_TYPE_RESTORE);
        if ($active !== null) {
            $status = $active['status'] ?? '';
            if ($status === 'uploading') {
                // Only take over an upload that has gone quiet: an active one
                // (another tab or device mid-upload) must not have its chunks
                // deleted out from under it. A stale one is abandoned and its
                // chunks can be dropped so this upload wins.
                if (poznoteJobIsUploadStale($currentUserId, $active)) {
                    poznoteJobDelete($currentUserId, (string)$active['id']);
                } else {
                    restoreUploadFail(409, 'An upload for this account is already in progress in another tab or window. Finish or cancel it before starting a new one.');
                }
            } elseif (poznoteJobIsWorkerStale($currentUserId, $active)) {
                // A queued/running job whose worker died (no state update for
                // a long time): let this new restore replace it rather than
                // blocking until the 24 h cleanup.
                poznoteJobDelete($currentUserId, (string)$active['id']);
            } else {
                restoreUploadFail(409, 'A restore is already running for this account. Wait for it to finish before starting a new one.');
            }
        }

        $filename = (string)($_POST['filename'] ?? '');
        $totalSize = (int)($_POST['total_size'] ?? 0);
        $totalChunks = (int)($_POST['total_chunks'] ?? 0);

        if (!preg_match('/\.zip$/i', $filename)) {
            restoreUploadFail(400, 'File type not allowed. Use a .zip file');
        }
        if ($totalSize <= 0 || $totalChunks <= 0 || $totalChunks > POZNOTE_RESTORE_MAX_CHUNKS) {
            restoreUploadFail(400, 'Invalid upload parameters');
        }

        $maxMb = (int)poznoteResolveGlobalSetting('restore_upload_max_mb', 'POZNOTE_RESTORE_UPLOAD_MAX_MB', '8192');
        if ($maxMb > 0 && $totalSize > $maxMb * 1024 * 1024) {
            restoreUploadFail(413, 'The archive exceeds the maximum restore size of ' . $maxMb . ' MB configured on this instance');
        }

        // Rough guard so an obviously impossible restore is refused up front
        // rather than failing halfway. The pipeline holds up to ~3x the
        // archive at once (assembled zip, the copy restoreCompleteBackup
        // makes, and the extracted tree), so ask for a margin above that.
        // Only a heuristic: it is measured before the chunks land, and the
        // data directory may live on another filesystem. The real safety net
        // is that extraction failures abort before anything is wiped.
        $free = @disk_free_space(sys_get_temp_dir());
        if (is_float($free) && $free > 0 && $free < $totalSize * 3.5) {
            restoreUploadFail(507, 'Not enough free disk space on the server to process this archive');
        }

        try {
            $job = poznoteJobCreate($currentUserId, POZNOTE_JOB_TYPE_RESTORE, [
                'original_name' => basename($filename),
                'total_size' => $totalSize,
                'total_chunks' => $totalChunks,
                'received_chunks' => 0,
            ], 'uploading');
        } catch (Throwable $e) {
            restoreUploadFail(500, $e->getMessage());
        }

        echo json_encode([
            'success' => true,
            'upload_id' => (string)$job['id'],
            'max_chunk_bytes' => POZNOTE_RESTORE_CHUNK_MAX_BYTES,
        ]);
        exit;
    }

    case 'chunk': {
        $job = restoreUploadJob($currentUserId);
        if ($job === null || ($job['status'] ?? '') !== 'uploading') {
            restoreUploadFail(404, 'Unknown or already finalized upload');
        }
        $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
        $totalChunks = (int)($payload['total_chunks'] ?? 0);

        $index = isset($_POST['chunk_index']) && preg_match('/^\d+$/', (string)$_POST['chunk_index'])
            ? (int)$_POST['chunk_index'] : -1;
        if ($index < 0 || $index >= $totalChunks) {
            restoreUploadFail(400, 'Invalid chunk index');
        }
        if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
            restoreUploadFail(400, 'Chunk upload failed (error ' . (int)($_FILES['chunk']['error'] ?? -1) . ')');
        }
        if ((int)$_FILES['chunk']['size'] > POZNOTE_RESTORE_CHUNK_MAX_BYTES) {
            restoreUploadFail(413, 'Chunk too large');
        }

        $target = poznoteJobDir($currentUserId, (string)$job['id']) . '/' . poznoteRestoreChunkName($index);
        if (!move_uploaded_file($_FILES['chunk']['tmp_name'], $target)) {
            restoreUploadFail(500, 'Cannot store the uploaded chunk (disk full?)');
        }

        // Count the files rather than incrementing, so a retried chunk is
        // not counted twice.
        $received = count(glob(poznoteJobDir($currentUserId, (string)$job['id']) . '/chunk_*') ?: []);
        $payload['received_chunks'] = $received;
        poznoteJobUpdate($currentUserId, (string)$job['id'], ['payload' => $payload]);

        echo json_encode(['success' => true, 'received_chunks' => $received]);
        exit;
    }

    case 'finalize': {
        $job = restoreUploadJob($currentUserId);
        if ($job === null || ($job['status'] ?? '') !== 'uploading') {
            restoreUploadFail(404, 'Unknown or already finalized upload');
        }
        $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
        $totalChunks = (int)($payload['total_chunks'] ?? 0);
        $totalSize = (int)($payload['total_size'] ?? 0);
        $dir = poznoteJobDir($currentUserId, (string)$job['id']);

        $sum = 0;
        for ($i = 0; $i < $totalChunks; $i++) {
            $chunkFile = $dir . '/' . poznoteRestoreChunkName($i);
            if (!is_file($chunkFile)) {
                restoreUploadFail(400, 'Chunk ' . ($i + 1) . '/' . $totalChunks . ' is missing; upload it again before finalizing');
            }
            $sum += (int)filesize($chunkFile);
        }
        if ($sum !== $totalSize) {
            restoreUploadFail(400, 'Uploaded size does not match the announced file size; restart the upload');
        }

        $job = poznoteJobUpdate($currentUserId, (string)$job['id'], ['status' => 'queued']);
        poznoteJobSpawnRunner($currentUserId, (string)$job['id']);

        echo json_encode(['success' => true, 'job' => poznoteJobPublicState($job)]);
        exit;
    }

    case 'start_s3': {
        // Restoring from the bucket has the same two long phases as an
        // uploaded archive (fetch, then restore), so it runs as the same
        // background job instead of a synchronous POST that a proxy would
        // cut off for a large archive.
        require_once __DIR__ . '/S3BackupService.php';

        $allowed = S3BackupService::isEnabled()
            && (isCurrentUserAdmin() || !in_array('user_s3_restore', TENANT_ISOLATION_FEATURES, true));
        if (!$allowed) {
            restoreUploadFail(403, 'Restoring from S3 is not allowed on this account.');
        }

        $key = (string)($_POST['s3_backup_key'] ?? '');
        $ownPrefix = S3BackupService::keyPrefixForUser($currentUserId);
        if (!preg_match('#^backups/\d+/[^/]+\.zip$#', $key) || strpos($key, $ownPrefix) !== 0) {
            restoreUploadFail(400, 'Invalid backup archive.');
        }

        poznoteJobCleanup($currentUserId);
        $active = poznoteJobFindActive($currentUserId, POZNOTE_JOB_TYPE_RESTORE);
        if ($active !== null) {
            $status = $active['status'] ?? '';
            $stale = $status === 'uploading'
                ? poznoteJobIsUploadStale($currentUserId, $active)
                : poznoteJobIsWorkerStale($currentUserId, $active);
            if (!$stale) {
                restoreUploadFail(409, 'A restore is already in progress for this account. Wait for it to finish before starting a new one.');
            }
            poznoteJobDelete($currentUserId, (string)$active['id']);
        }

        try {
            $job = poznoteJobCreate($currentUserId, POZNOTE_JOB_TYPE_RESTORE, [
                's3_key' => $key,
                'original_name' => basename($key),
            ], 'queued');
            poznoteJobSpawnRunner($currentUserId, (string)$job['id']);
        } catch (Throwable $e) {
            restoreUploadFail(500, $e->getMessage());
        }

        echo json_encode(['success' => true, 'job' => poznoteJobPublicState($job)]);
        exit;
    }

    case 'status': {
        $job = restoreUploadJob($currentUserId);
        if ($job === null) {
            // No id given: report the newest restore job, so a reloaded page
            // can pick a running restore back up.
            $jobs = poznoteJobList($currentUserId, POZNOTE_JOB_TYPE_RESTORE);
            $job = $jobs[0] ?? null;
        }
        echo json_encode(['success' => true, 'job' => $job !== null ? poznoteJobPublicState($job) : null]);
        exit;
    }

    case 'abort': {
        $job = restoreUploadJob($currentUserId);
        if ($job !== null) {
            // Removable while still uploading (this page owns it), or once
            // finished; a queued/running job is only removable when its
            // worker looks dead, so a live restore is never yanked away.
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
