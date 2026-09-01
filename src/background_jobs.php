<?php

/**
 * Background job plumbing for the long-running backup flows: the complete
 * export (archive built by a CLI worker process, downloaded once ready) and
 * the chunked restore (archive uploaded in slices, then assembled and
 * restored by a CLI worker process).
 *
 * Both flows exist because building or restoring a large archive takes far
 * longer than an HTTP request is allowed to live once a proxy (Cloudflare,
 * a PaaS edge) sits in front of the instance, and because a synchronous
 * build holds one php-fpm worker for its whole duration. The worker process
 * runs outside php-fpm entirely, so the instance stays responsive and no
 * proxy timeout can interrupt the work.
 *
 * Jobs live under the system temp dir (the same disk the synchronous flows
 * already used for their archives): one directory per job holding a job.json
 * state file plus the job's working files (uploaded chunks, assembled zip,
 * finished export). Directories are keyed by the owning user id and job ids
 * are unguessable random tokens. State files are written atomically
 * (tmp + rename) so the status endpoint never reads a half-written JSON.
 */

// Jobs and their files are pruned after this long, however they ended.
const POZNOTE_JOB_MAX_AGE_SECONDS = 86400;

// Job types
const POZNOTE_JOB_TYPE_EXPORT = 'complete_export';
const POZNOTE_JOB_TYPE_RESTORE = 'chunked_restore';
const POZNOTE_JOB_TYPE_NOTES_IMPORT = 'notes_import';
const POZNOTE_JOB_TYPE_S3_BACKUP = 's3_backup';

function poznoteJobsRootDir(): string {
    return rtrim(sys_get_temp_dir(), '/') . '/poznote_jobs';
}

function poznoteJobUserDir(int $userId): string {
    return poznoteJobsRootDir() . '/' . $userId;
}

function poznoteJobDir(int $userId, string $jobId): string {
    return poznoteJobUserDir($userId) . '/' . $jobId;
}

function poznoteJobIdIsValid($jobId): bool {
    return is_string($jobId) && preg_match('/^[a-f0-9]{32}$/', $jobId) === 1;
}

/**
 * Create a job directory with its initial state file.
 *
 * @return array The job state
 */
function poznoteJobCreate(int $userId, string $type, array $payload = [], string $status = 'queued'): array {
    $jobId = bin2hex(random_bytes(16));
    $dir = poznoteJobDir($userId, $jobId);
    if (!is_dir($dir) && !mkdir($dir, 0770, true)) {
        throw new RuntimeException('Cannot create the job directory');
    }
    $job = [
        'id' => $jobId,
        'user_id' => $userId,
        'type' => $type,
        'status' => $status,
        'phase' => '',
        'error' => '',
        'message' => '',
        'created_at' => time(),
        'started_at' => null,
        'finished_at' => null,
        'payload' => $payload,
    ];
    poznoteJobWrite($job);
    return $job;
}

/**
 * Atomic write of the state file (tmp + rename).
 *
 * JSON_INVALID_UTF8_SUBSTITUTE: the payload carries a user-supplied
 * filename, and json_encode() returns false on a single invalid byte, which
 * would truncate the state file and lose the job.
 */
function poznoteJobWrite(array $job): void {
    $dir = poznoteJobDir((int)$job['user_id'], (string)$job['id']);
    $tmp = $dir . '/job.json.tmp';
    $encoded = json_encode($job, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($encoded === false) {
        throw new RuntimeException('Cannot encode the job state');
    }
    if (file_put_contents($tmp, $encoded, LOCK_EX) === false || !rename($tmp, $dir . '/job.json')) {
        throw new RuntimeException('Cannot write the job state file');
    }
}

/** @return array|null The job state, or null when unknown/invalid. */
function poznoteJobRead(int $userId, $jobId): ?array {
    if (!poznoteJobIdIsValid($jobId)) {
        return null;
    }
    $file = poznoteJobDir($userId, $jobId) . '/job.json';
    if (!is_file($file)) {
        return null;
    }
    $job = json_decode((string)file_get_contents($file), true);
    return is_array($job) ? $job : null;
}

/** Merge fields into a job's state file and return the updated state. */
function poznoteJobUpdate(int $userId, string $jobId, array $fields): ?array {
    $job = poznoteJobRead($userId, $jobId);
    if ($job === null) {
        return null;
    }
    $job = array_merge($job, $fields);
    poznoteJobWrite($job);
    return $job;
}

/** Remove a job directory and everything in it. */
function poznoteJobDelete(int $userId, string $jobId): void {
    if (!poznoteJobIdIsValid($jobId)) {
        return;
    }
    poznoteJobDeleteDir(poznoteJobDir($userId, $jobId));
}

function poznoteJobDeleteDir(string $dir): void {
    if (!is_dir($dir)) {
        return;
    }
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($files as $fileinfo) {
        $fileinfo->isDir() ? @rmdir($fileinfo->getRealPath()) : @unlink($fileinfo->getRealPath());
    }
    @rmdir($dir);
}

/**
 * List a user's jobs, newest first. Optionally filtered by type.
 *
 * @return array[] Job states
 */
function poznoteJobList(int $userId, ?string $type = null): array {
    $userDir = poznoteJobUserDir($userId);
    if (!is_dir($userDir)) {
        return [];
    }
    $jobs = [];
    foreach (scandir($userDir) ?: [] as $entry) {
        if (!poznoteJobIdIsValid($entry)) {
            continue;
        }
        $job = poznoteJobRead($userId, $entry);
        if ($job === null || ($type !== null && ($job['type'] ?? '') !== $type)) {
            continue;
        }
        $jobs[] = $job;
    }
    usort($jobs, function ($a, $b) {
        return ((int)($b['created_at'] ?? 0)) <=> ((int)($a['created_at'] ?? 0));
    });
    return $jobs;
}

/** The newest not-yet-finished job of a type, or null. */
function poznoteJobFindActive(int $userId, string $type): ?array {
    foreach (poznoteJobList($userId, $type) as $job) {
        if (in_array($job['status'] ?? '', ['uploading', 'queued', 'running'], true)) {
            return $job;
        }
    }
    return null;
}

/**
 * Seconds since the job's state file was last written. Every chunk upload
 * and every progress update rewrites job.json, so this is a liveness signal:
 * a large gap means the driving page or the worker went away.
 */
function poznoteJobSecondsSinceActivity(int $userId, string $jobId): ?int {
    $file = poznoteJobDir($userId, $jobId) . '/job.json';
    // Clear BEFORE reading: an earlier is_file()/stat in this same request
    // would otherwise serve a cached mtime and make a live job look older
    // than it is.
    clearstatcache(true, $file);
    $mtime = @filemtime($file);
    if ($mtime === false) {
        return null;
    }
    return max(0, time() - (int)$mtime);
}

// An 'uploading' job whose page has not sent a chunk for this long is
// treated as abandoned (closed tab, dropped connection): a new upload may
// take over. Chunk POSTs are frequent, so this is comfortably above any
// single-chunk time.
const POZNOTE_JOB_UPLOAD_STALE_SECONDS = 180;

// A 'queued'/'running' job whose worker has not touched the state file for
// this long is treated as dead (SIGKILL, container restart): the user may
// start over instead of waiting for the 24 h cleanup. Set far above the
// slowest realistic gap between progress updates, since some stages report
// only once at their start (extracting a multi-GB archive, downloading one
// from the bucket): a false positive here would drop the state file of a
// still-running restore.
const POZNOTE_JOB_WORKER_STALE_SECONDS = 1800;

function poznoteJobIsUploadStale(int $userId, array $job): bool {
    $since = poznoteJobSecondsSinceActivity($userId, (string)$job['id']);
    return $since !== null && $since >= POZNOTE_JOB_UPLOAD_STALE_SECONDS;
}

function poznoteJobIsWorkerStale(int $userId, array $job): bool {
    $since = poznoteJobSecondsSinceActivity($userId, (string)$job['id']);
    return $since !== null && $since >= POZNOTE_JOB_WORKER_STALE_SECONDS;
}

/**
 * Prune this user's expired jobs. A running job past the age limit is
 * considered abandoned (worker killed, container restarted) and removed too.
 */
function poznoteJobCleanup(int $userId): void {
    foreach (poznoteJobList($userId) as $job) {
        if (time() - (int)($job['created_at'] ?? 0) > POZNOTE_JOB_MAX_AGE_SECONDS) {
            poznoteJobDelete($userId, (string)$job['id']);
        }
    }
}

/**
 * Launch the CLI worker for a queued job, detached from this php-fpm
 * request: the worker keeps running whatever happens to the HTTP client,
 * and consumes no php-fpm worker while it does.
 */
function poznoteJobSpawnRunner(int $userId, string $jobId): void {
    $runner = __DIR__ . '/workers/job-runner.php';
    $log = poznoteJobDir($userId, $jobId) . '/runner.log';
    $cmd = sprintf(
        'nohup php %s %d %s >> %s 2>&1 &',
        escapeshellarg($runner),
        $userId,
        escapeshellarg($jobId),
        escapeshellarg($log)
    );
    exec($cmd);
}

/** File name of an uploaded restore chunk inside its job directory. */
function poznoteRestoreChunkName(int $index): string {
    return sprintf('chunk_%06d', $index);
}

/**
 * The public subset of a job's state, safe to hand to the browser.
 */
function poznoteJobPublicState(array $job): array {
    $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
    return [
        'id' => (string)$job['id'],
        'type' => (string)$job['type'],
        'status' => (string)$job['status'],
        'phase' => (string)($job['phase'] ?? ''),
        'error' => (string)($job['error'] ?? ''),
        'message' => (string)($job['message'] ?? ''),
        'created_at' => (int)($job['created_at'] ?? 0),
        'started_at' => $job['started_at'] ?? null,
        'finished_at' => $job['finished_at'] ?? null,
        'stage' => (string)($job['stage'] ?? ''),
        'stage_done' => isset($job['stage_done']) ? (int)$job['stage_done'] : null,
        'stage_total' => isset($job['stage_total']) ? (int)$job['stage_total'] : null,
        'filename' => (string)($payload['filename'] ?? ''),
        'size' => isset($payload['size']) ? (int)$payload['size'] : null,
        'received_chunks' => isset($payload['received_chunks']) ? (int)$payload['received_chunks'] : null,
        'total_chunks' => isset($payload['total_chunks']) ? (int)$payload['total_chunks'] : null,
    ];
}
