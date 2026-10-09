<?php

declare(strict_types=1);

// Scheduled backups worker. Despite its name (kept so existing supervisor
// configurations keep working) it drives both automatic backup targets: the
// S3 bucket and the local backup folder, each on its own schedule.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../S3BackupService.php';
require_once __DIR__ . '/../LocalBackupService.php';

const S3_BACKUP_WORKER_INTERVAL_SECONDS = 300;

$runOnce = in_array('--once', $argv ?? [], true);
$forceRun = in_array('--force', $argv ?? [], true);

function poznoteS3BackupWorkerLog(string $message): void {
    fwrite(STDOUT, '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message . PHP_EOL);
}

poznoteS3BackupWorkerLog('Backup worker started');

do {
    try {
        if ($forceRun || S3BackupService::isAutoDue()) {
            poznoteS3BackupWorkerLog('automatic backup starting');
            $result = S3BackupService::runAll('auto');
            poznoteS3BackupWorkerLog(
                'automatic backup finished success=' . ($result['success'] ? '1' : '0')
                . ' users=' . (int)$result['users']
                . ' uploaded=' . (int)$result['uploaded']
            );
            foreach (array_slice($result['errors'] ?? [], 0, 10) as $error) {
                poznoteS3BackupWorkerLog('error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteS3BackupWorkerLog('fatal: ' . $e->getMessage());
    }

    try {
        if ($forceRun || LocalBackupService::isAutoDue()) {
            poznoteS3BackupWorkerLog('automatic local backup starting');
            $result = LocalBackupService::runAll('auto');
            poznoteS3BackupWorkerLog(
                'automatic local backup finished success=' . ($result['success'] ? '1' : '0')
                . ' users=' . (int)$result['users']
                . ' saved=' . (int)$result['saved']
            );
            foreach (array_slice($result['errors'] ?? [], 0, 10) as $error) {
                poznoteS3BackupWorkerLog('local error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteS3BackupWorkerLog('local fatal: ' . $e->getMessage());
    }

    if ($runOnce) {
        break;
    }

    sleep(S3_BACKUP_WORKER_INTERVAL_SECONDS);
} while (true);
