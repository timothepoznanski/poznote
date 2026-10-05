<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../ReminderEmailService.php';
require_once __DIR__ . '/../ReminderWebhookService.php';
require_once __DIR__ . '/../ReminderPushService.php';
require_once __DIR__ . '/../WorkspaceActivityEmailService.php';

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
                'email enabled=' . ($result['enabled'] ? '1' : '0')
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

    try {
        $webhookService = new ReminderWebhookService();
        $webhookResult = $webhookService->processDueReminders();

        if (!empty($webhookResult['errors']) || (int)$webhookResult['sent'] > 0 || (int)$webhookResult['failed'] > 0) {
            poznoteReminderWorkerLog(
                'webhook enabled=' . ($webhookResult['enabled'] ? '1' : '0')
                . ' sent=' . (int)$webhookResult['sent']
                . ' failed=' . (int)$webhookResult['failed']
                . ' users_checked=' . (int)$webhookResult['users_checked']
                . ' skipped_users=' . (int)$webhookResult['skipped_users']
            );
            foreach (array_slice($webhookResult['errors'] ?? [], 0, 10) as $error) {
                poznoteReminderWorkerLog('webhook error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteReminderWorkerLog('webhook fatal: ' . $e->getMessage());
    }

    try {
        $pushService = new ReminderPushService();
        $pushResult = $pushService->processDueReminders();

        if (!empty($pushResult['errors']) || (int)$pushResult['sent'] > 0 || (int)$pushResult['failed'] > 0) {
            poznoteReminderWorkerLog(
                'push enabled=' . ($pushResult['enabled'] ? '1' : '0')
                . ' sent=' . (int)$pushResult['sent']
                . ' failed=' . (int)$pushResult['failed']
                . ' users_checked=' . (int)$pushResult['users_checked']
                . ' skipped_users=' . (int)$pushResult['skipped_users']
            );
            foreach (array_slice($pushResult['errors'] ?? [], 0, 10) as $error) {
                poznoteReminderWorkerLog('push error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteReminderWorkerLog('push fatal: ' . $e->getMessage());
    }

    // Shared workspace emails ride on the same minute tick: "instant" needs
    // it, and a daily or weekly summary only checks whether its slot passed.
    try {
        $activityService = new WorkspaceActivityEmailService();
        $activityResult = $activityService->processDue();

        if (!empty($activityResult['errors']) || (int)$activityResult['sent'] > 0 || (int)$activityResult['failed'] > 0) {
            poznoteReminderWorkerLog(
                'workspace activity enabled=' . ($activityResult['enabled'] ? '1' : '0')
                . ' sent=' . (int)$activityResult['sent']
                . ' failed=' . (int)$activityResult['failed']
                . ' users_checked=' . (int)$activityResult['users_checked']
                . ' skipped_users=' . (int)$activityResult['skipped_users']
            );
            foreach (array_slice($activityResult['errors'] ?? [], 0, 10) as $error) {
                poznoteReminderWorkerLog('workspace activity error: ' . $error);
            }
        }
    } catch (Throwable $e) {
        poznoteReminderWorkerLog('workspace activity fatal: ' . $e->getMessage());
    }

    if ($runOnce) {
        break;
    }

    sleep(REMINDER_EMAIL_WORKER_INTERVAL_SECONDS);
} while (true);
