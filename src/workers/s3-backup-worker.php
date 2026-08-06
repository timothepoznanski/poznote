<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../S3BackupService.php';

const S3_BACKUP_WORKER_INTERVAL_SECONDS = 300;

$runOnce = in_array('--once', $argv ?? [], true);
$forceRun = in_array('--force', $argv ?? [], true);

function poznoteS3BackupWorkerLog(string $message): void {
    fwrite(STDOUT, '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message . PHP_EOL);
}

poznoteS3BackupWorkerLog('S3 backup worker started');

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

    if ($runOnce) {
        break;
    }

    sleep(S3_BACKUP_WORKER_INTERVAL_SECONDS);
} while (true);
