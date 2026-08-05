<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/ReminderEmailService.php';
require_once __DIR__ . '/WebhookDispatcher.php';

/**
 * Webhook counterpart of ReminderEmailService: scans for due reminders and
 * emits the reminder.due* events to the registered webhooks. Runs from the
 * reminder worker, independently of the email channel, so webhooks fire even
 * when SMTP is not configured.
 *
 * Only the accounts that registered an active reminder webhook are scanned,
 * and each account's reminders only ever reach its own endpoints: relaying a
 * user's reminders through another user's webhooks would leak their activity.
 *
 * Delivery is at-least-once: a reminder is marked sent only when every
 * subscribed endpoint accepted it, otherwise the whole event is retried
 * (bounded attempts), so healthy endpoints may see duplicates and can dedupe
 * on the reminder id.
 */
class ReminderWebhookService {
    private const MAX_ATTEMPTS = 5;
    private const RETRY_DELAY_SECONDS = 300;

    /**
     * @return array{enabled:bool,sent:int,failed:int,users_checked:int,skipped_users:int,errors:string[]}
     */
    public function processDueReminders(int $limit = 100): array {
        $result = [
            'enabled' => false,
            'sent' => 0,
            'failed' => 0,
            'users_checked' => 0,
            'skipped_users' => 0,
            'errors' => [],
        ];

        $userIds = listWebhookUserIdsForEvents(WebhookDispatcher::REMINDER_EVENTS);
        if (empty($userIds)) {
            return $result;
        }
        $result['enabled'] = true;

        // Reminders already due when the first subscriber appears are skipped,
        // mirroring the email cutoff: enabling webhooks must not flood the
        // endpoint with the whole backlog.
        $cutoffAt = trim((string)getGlobalSetting('webhook_reminder_cutoff_at', ''));
        if ($cutoffAt === '') {
            $cutoffAt = gmdate('Y-m-d H:i:s');
            setGlobalSetting('webhook_reminder_cutoff_at', $cutoffAt);
        }

        $dispatcher = new WebhookDispatcher();
        $appUrl = $this->getAppUrl();
        $remaining = max(1, min(1000, $limit));

        foreach ($userIds as $userId) {
            if ($remaining <= 0) {
                break;
            }

            // Tenant isolation can block non-admin webhooks after they were
            // registered; a deleted account must not be scanned either.
            if (!WebhookDispatcher::userWebhooksAllowedFor($userId)
                || !getUserProfileById($userId)) {
                $result['skipped_users']++;
                continue;
            }

            $manager = new UserDataManager($userId);
            $dbPath = $manager->getUserDatabasePath();
            if (!is_file($dbPath)) {
                $result['skipped_users']++;
                continue;
            }

            $result['users_checked']++;

            try {
                $userCon = new PDO('sqlite:' . $dbPath);
                $userCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $userCon->exec('PRAGMA busy_timeout = 30000');
                ReminderEmailService::ensureUserReminderEmailSchema($userCon);

                $notifications = $this->loadDueNotifications($userCon, $cutoffAt, $remaining);

                foreach ($notifications as $notification) {
                    if (!$this->reserveNotification($userCon, (int)$notification['id'])) {
                        continue;
                    }

                    $noteUrl = $this->buildNoteUrl(
                        (int)($notification['note_id'] ?? 0),
                        (string)($notification['workspace'] ?? ''),
                        $appUrl
                    );
                    $sent = $dispatcher->dispatchReminderDue($notification, $noteUrl, $userId);

                    if ($sent['failed'] === 0) {
                        $this->markNotificationSent($userCon, (int)$notification['id']);
                        $result['sent']++;
                    } else {
                        $error = $sent['failed'] . ' webhook delivery(ies) failed';
                        $this->markNotificationFailed($userCon, (int)$notification['id'], $error);
                        $result['failed']++;
                        $result['errors'][] = 'User ' . $userId . ', notification ' . (int)$notification['id'] . ': ' . $error;
                    }

                    $remaining--;
                    if ($remaining <= 0) {
                        break;
                    }
                }
            } catch (Throwable $e) {
                $result['failed']++;
                $result['errors'][] = 'User ' . $userId . ': ' . $e->getMessage();
            }
        }

        return $result;
    }

    private function loadDueNotifications(PDO $con, string $cutoffAt, int $limit): array {
        $now = gmdate('Y-m-d H:i:s');
        $retryBefore = gmdate('Y-m-d H:i:s', time() - self::RETRY_DELAY_SECONDS);

        $stmt = $con->prepare("
            SELECT n.id, n.note_id, n.message, n.trigger_at, n.webhook_attempts,
                   e.heading AS note_heading, e.workspace AS workspace
            FROM notifications n
            LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
            WHERE n.dismissed = 0
              AND n.trigger_at <= ?
              AND n.trigger_at >= ?
              AND n.webhook_sent_at IS NULL
              AND COALESCE(n.webhook_attempts, 0) < ?
              AND (n.webhook_last_attempt_at IS NULL OR n.webhook_last_attempt_at <= ?)
            ORDER BY n.trigger_at ASC
            LIMIT ?
        ");
        $stmt->bindValue(1, $now, PDO::PARAM_STR);
        $stmt->bindValue(2, $cutoffAt, PDO::PARAM_STR);
        $stmt->bindValue(3, self::MAX_ATTEMPTS, PDO::PARAM_INT);
        $stmt->bindValue(4, $retryBefore, PDO::PARAM_STR);
        $stmt->bindValue(5, $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function reserveNotification(PDO $con, int $notificationId): bool {
        $stmt = $con->prepare("
            UPDATE notifications
            SET webhook_attempts = COALESCE(webhook_attempts, 0) + 1,
                webhook_last_attempt_at = ?,
                webhook_error = NULL
            WHERE id = ?
              AND webhook_sent_at IS NULL
              AND COALESCE(webhook_attempts, 0) < ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId, self::MAX_ATTEMPTS]);
        return $stmt->rowCount() > 0;
    }

    private function markNotificationSent(PDO $con, int $notificationId): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET webhook_sent_at = ?,
                webhook_error = NULL
            WHERE id = ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId]);
    }

    private function markNotificationFailed(PDO $con, int $notificationId, string $error): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET webhook_error = ?
            WHERE id = ?
        ");
        $stmt->execute([substr($error, 0, 1000), $notificationId]);
    }

    /**
     * Same source order as the email channel: the SMTP settings' app URL when
     * set, else the POZNOTE_APP_URL / APP_URL environment.
     */
    private function getAppUrl(): string {
        $appUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
        if ($appUrl === '' && function_exists('_env')) {
            $appUrl = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
        }
        return $appUrl;
    }

    private function buildNoteUrl(int $noteId, string $workspace, string $baseUrl): string {
        if ($noteId <= 0 || $baseUrl === '' || !filter_var($baseUrl, FILTER_VALIDATE_URL)) {
            return '';
        }
        $scheme = strtolower((string)parse_url($baseUrl, PHP_URL_SCHEME));
        if (!in_array($scheme, ['http', 'https'], true)) {
            return '';
        }

        $params = ['note' => $noteId];
        $workspace = trim($workspace);
        if ($workspace !== '') {
            $params['workspace'] = $workspace;
        }

        return $baseUrl . '/index.php?' . http_build_query($params);
    }
}
