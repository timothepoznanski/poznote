<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../ReminderEmailService.php';

const REMINDER_EMAIL_WORKER_INTERVAL_SECONDS = 60;

$runOnce = in_array('--once', $argv ?? [], true);

function poznoteReminderWorkerLog(string $message): void {
    fwrite(STDOUT, '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message . PHP_EOL);
}

poznoteReminderWorkerLog('Reminder email worker started');

do {
    try {
        $service = new ReminderEmailService();
        $result = $service->processDueReminders();

        if (!empty($result['errors']) || (int)$result['sent'] > 0 || (int)$result['failed'] > 0) {
            poznoteReminderWorkerLog(
                'enabled=' . ($result['enabled'] ? '1' : '0')
                . ' sent=' . (int)$result['sent']
                . ' failed=' . (int)$result['failed']
                . ' users_checked=' . (int)$result['users_checked']
                . ' skipped_users=' . (int)$result['skipped_users']
            );
            foreach (array_slice($result['errors'] ?? [], 0, 10) as $error) {
                poznoteReminderWorkerLog('error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteReminderWorkerLog('fatal: ' . $e->getMessage());
    }

    if ($runOnce) {
        break;
    }

    sleep(REMINDER_EMAIL_WORKER_INTERVAL_SECONDS);
} while (true);
