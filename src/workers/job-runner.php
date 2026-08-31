<?php

declare(strict_types=1);

/**
 * One-shot CLI runner for a single background job (see background_jobs.php):
 *
 *   php workers/job-runner.php <userId> <jobId>
 *
 * Spawned detached from the HTTP request that created the job, so the work
 * survives any client or proxy timeout and never occupies a php-fpm worker.
 * The CLI SAPI has no execution time limit, which matters for accounts whose
 * archive takes many minutes to build or restore.
 *
 * complete_export  Builds the complete backup zip of the target user (the
 *                  job owner, or another user when an admin asked) and
 *                  leaves it in the job directory for the download endpoint.
 *
 * chunked_restore  Concatenates the uploaded chunks into the backup zip,
 *                  then runs the same restoreCompleteBackup() pipeline as
 *                  the synchronous flows, with the job owner as the session
 *                  user so every path helper resolves to their data.
 */

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$userId = isset($argv[1]) ? (int)$argv[1] : 0;
$jobId = isset($argv[2]) ? (string)$argv[2] : '';

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../background_jobs.php';

if ($userId <= 0 || !poznoteJobIdIsValid($jobId)) {
    fwrite(STDERR, "job-runner: invalid arguments\n");
    exit(1);
}

$job = poznoteJobRead($userId, $jobId);
if ($job === null || ($job['status'] ?? '') !== 'queued') {
    fwrite(STDERR, "job-runner: job not found or not queued\n");
    exit(1);
}

// A fatal error (OOM, uncaught throwable) must not leave the job stuck in
// "running" forever: the browser polls this state file.
register_shutdown_function(function () use ($userId, $jobId) {
    $job = poznoteJobRead($userId, $jobId);
    if ($job !== null && ($job['status'] ?? '') === 'running') {
        $lastError = error_get_last();
        poznoteJobUpdate($userId, $jobId, [
            'status' => 'error',
            'error' => 'The worker process stopped unexpectedly'
                . ($lastError ? ': ' . $lastError['message'] : '')
                . '. Check the server logs.',
            'finished_at' => time(),
        ]);
    }
});

$job = poznoteJobUpdate($userId, $jobId, ['status' => 'running', 'started_at' => time()]);
$payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];

try {
    switch ($job['type'] ?? '') {
        case POZNOTE_JOB_TYPE_EXPORT:
            runCompleteExportJob($userId, $jobId, $payload);
            break;
        case POZNOTE_JOB_TYPE_RESTORE:
            runChunkedRestoreJob($userId, $jobId, $payload);
            break;
        default:
            throw new RuntimeException('Unknown job type');
    }
} catch (Throwable $e) {
    poznoteJobUpdate($userId, $jobId, [
        'status' => 'error',
        'error' => $e->getMessage(),
        'finished_at' => time(),
    ]);
    exit(1);
}

exit(0);

/**
 * Build the complete backup zip and park it in the job directory.
 */
function runCompleteExportJob(int $userId, string $jobId, array $payload): void {
    require_once __DIR__ . '/../functions.php';
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../users/UserDataManager.php';
    require_once __DIR__ . '/../storage/AttachmentStorage.php';
    require_once __DIR__ . '/../backup_zip.php';

    // The admin check happened when the job was created; here the payload is
    // trusted (job files are only writable by the server itself).
    $targetUserId = (int)($payload['target_user_id'] ?? $userId);
    $skipS3 = !empty($payload['skip_s3_attachments']);

    poznoteJobUpdate($userId, $jobId, ['phase' => 'building']);

    $build = buildUserBackupZip($targetUserId, $skipS3);
    if (empty($build['success'])) {
        throw new RuntimeException((string)($build['error'] ?? 'Backup build failed'));
    }

    $target = poznoteJobDir($userId, $jobId) . '/export.zip';
    if (!rename($build['zip_path'], $target)) {
        @unlink($build['zip_path']);
        throw new RuntimeException('Cannot move the finished archive into the job directory');
    }

    $job = poznoteJobRead($userId, $jobId);
    $jobPayload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
    $jobPayload['filename'] = (string)$build['filename'];
    $jobPayload['size'] = (int)(@filesize($target) ?: 0);
    poznoteJobUpdate($userId, $jobId, [
        'status' => 'done',
        'phase' => '',
        'finished_at' => time(),
        'payload' => $jobPayload,
    ]);

    require_once __DIR__ . '/../ActivityLog.php';
    logActivity(ACTIVITY_BACKUP_CREATED, [
        'filename' => (string)$build['filename'],
        'size' => $jobPayload['size'],
        'destination' => 'download',
    ], 'web', $userId);
}

/**
 * Assemble the uploaded chunks, then restore the resulting archive as the
 * job owner.
 */
function runChunkedRestoreJob(int $userId, string $jobId, array $payload): void {
    $dir = poznoteJobDir($userId, $jobId);
    $zipPath = $dir . '/backup_restore.zip';
    $totalChunks = (int)($payload['total_chunks'] ?? 0);
    $totalSize = (int)($payload['total_size'] ?? 0);
    $originalName = (string)($payload['original_name'] ?? 'backup.zip');
    $s3Key = (string)($payload['s3_key'] ?? '');

    // Two ways the archive gets here: uploaded in slices by the browser, or
    // already sitting in the bucket. Both then follow the same restore path.
    if ($s3Key !== '') {
        poznoteJobUpdate($userId, $jobId, [
            'phase' => 'downloading',
            'stage' => 'downloading',
            'stage_done' => null,
            'stage_total' => null,
        ]);
        require_once __DIR__ . '/../functions.php';
        require_once __DIR__ . '/../users/db_master.php';
        require_once __DIR__ . '/../S3BackupService.php';
        S3BackupService::makeClient()->getObjectToFile($s3Key, $zipPath);
        runRestoreOfArchive($userId, $jobId, $zipPath, $originalName);
        return;
    }

    poznoteJobUpdate($userId, $jobId, [
        'phase' => 'assembling',
        'stage' => 'assembling',
        'stage_done' => 0,
        'stage_total' => $totalSize,
    ]);

    // Concatenate the chunks in order. Each chunk is deleted as soon as it
    // is appended, so peak disk usage stays at ~1x the archive size instead
    // of 2x during assembly.
    $out = fopen($zipPath, 'wb');
    if ($out === false) {
        throw new RuntimeException('Cannot create the assembled archive');
    }
    $written = 0;
    $lastReported = 0;
    for ($i = 0; $i < $totalChunks; $i++) {
        $chunkFile = $dir . '/' . poznoteRestoreChunkName($i);
        $in = fopen($chunkFile, 'rb');
        if ($in === false) {
            fclose($out);
            throw new RuntimeException('Uploaded chunk ' . ($i + 1) . '/' . $totalChunks . ' is missing');
        }
        while (!feof($in)) {
            $data = fread($in, 1048576);
            if ($data === false) {
                fclose($in);
                fclose($out);
                throw new RuntimeException('Cannot read uploaded chunk ' . ($i + 1));
            }
            // On a full disk fwrite() returns a short count rather than
            // false, so compare what was actually written: a silently
            // truncated archive would fail much later, as a corrupt zip.
            if ($data !== '') {
                $put = fwrite($out, $data);
                if ($put === false || $put < strlen($data)) {
                    fclose($in);
                    fclose($out);
                    throw new RuntimeException('Cannot write the assembled archive (the server may be out of disk space)');
                }
            }
            $written += strlen($data);
        }
        fclose($in);
        @unlink($chunkFile);
        if ($written - $lastReported >= 32 * 1024 * 1024 || $i === $totalChunks - 1) {
            $lastReported = $written;
            poznoteJobUpdate($userId, $jobId, ['stage_done' => $written]);
        }
    }
    fclose($out);

    if ($totalSize > 0 && $written !== $totalSize) {
        throw new RuntimeException(sprintf(
            'Assembled archive is %d bytes but %d were announced; upload was incomplete',
            $written,
            $totalSize
        ));
    }

    runRestoreOfArchive($userId, $jobId, $zipPath, $originalName);
}

/**
 * Restore an archive already sitting on disk, whatever brought it there
 * (assembled chunks or a bucket download), reporting the pipeline's
 * milestones into the polled job state.
 */
function runRestoreOfArchive(int $userId, string $jobId, string $zipPath, string $originalName): void {
    poznoteJobUpdate($userId, $jobId, [
        'phase' => 'restoring',
        'stage' => 'extracting',
        'stage_done' => null,
        'stage_total' => null,
    ]);

    // Every helper in the restore pipeline (paths, per-user database,
    // attachment storage) resolves the target account through the session
    // user id, exactly like the synchronous web flows.
    $_SESSION['user_id'] = $userId;

    require_once __DIR__ . '/../functions.php';
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../users/UserDataManager.php';
    require_once __DIR__ . '/../storage/AttachmentStorage.php';
    require_once __DIR__ . '/../db_connect.php';

    // Surface the restore pipeline's milestones (see
    // poznoteRestoreReportProgress) into the polled job state, throttled so
    // a per-file stage does not rewrite job.json thousands of times.
    $progressLastStage = '';
    $progressLastWrite = 0.0;
    $GLOBALS['poznote_restore_progress_hook'] = function (string $stage, ?int $done, ?int $total) use ($userId, $jobId, &$progressLastStage, &$progressLastWrite) {
        $now = microtime(true);
        $stageChanged = $stage !== $progressLastStage;
        $stageFinished = $done !== null && $total !== null && $done >= $total;
        if (!$stageChanged && !$stageFinished && $now - $progressLastWrite < 0.4) {
            return;
        }
        $progressLastStage = $stage;
        $progressLastWrite = $now;
        poznoteJobUpdate($userId, $jobId, [
            'stage' => $stage,
            'stage_done' => $done,
            'stage_total' => $total,
        ]);
    };

    $result = restoreCompleteBackup(['tmp_name' => $zipPath, 'name' => $originalName], true);
    unset($GLOBALS['poznote_restore_progress_hook']);
    @unlink($zipPath);

    if (empty($result['success'])) {
        $details = trim((string)($result['message'] ?? ''));
        throw new RuntimeException(
            (string)($result['error'] ?? 'Restore failed') . ($details !== '' ? "\n" . $details : '')
        );
    }

    $job = poznoteJobRead($userId, $jobId);
    $jobPayload = is_array($job['payload'] ?? null) ? $job['payload'] : [];

    require_once __DIR__ . '/../ActivityLog.php';
    logActivity(ACTIVITY_BACKUP_RESTORED, [
        'filename' => $originalName,
        'source' => !empty($jobPayload['s3_key']) ? 's3' : 'chunked_upload',
    ], 'web', $userId);

    poznoteJobUpdate($userId, $jobId, [
        'status' => 'done',
        'phase' => '',
        'message' => (string)($result['message'] ?? ''),
        'finished_at' => time(),
    ]);
}
