<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/ReminderEmailService.php';
require_once __DIR__ . '/lib/web-push.php';

/**
 * Web Push counterpart of ReminderEmailService: scans for due reminders and
 * pushes them to the devices the account subscribed, so a reminder reaches a
 * phone or a desktop with Poznote closed. Runs from the reminder worker.
 *
 * Only the accounts with a subscribed device are scanned, and a reminder only
 * ever goes to its own account's devices. A reminder counts as pushed once
 * one device accepted it; a device its push service no longer knows is
 * forgotten on the spot.
 */
class ReminderPushService {
    private const MAX_ATTEMPTS = 3;
    private const RETRY_DELAY_SECONDS = 60;
    private const TIMEOUT_SECONDS = 10;
    // A reminder older than this is no longer worth waking a phone for: the
    // bell still lists it. Also what a push service is asked to hold on to.
    private const MAX_AGE_SECONDS = 3600;
    private const TEXT_LIMIT = 200;

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

        $userIds = listPushSubscriptionUserIds();
        if (empty($userIds) || !function_exists('curl_init')) {
            return $result;
        }
        $privateKey = getPushVapidPrivateKey();
        if ($privateKey === null) {
            return $result;
        }
        $result['enabled'] = true;

        $subject = webPushVapidSubject($this->getAppUrl());
        $remaining = max(1, min(1000, $limit));

        foreach ($userIds as $userId) {
            if ($remaining <= 0) {
                break;
            }

            $manager = new UserDataManager($userId);
            $dbPath = $manager->getUserDatabasePath();
            if (!getUserProfileById($userId) || !is_file($dbPath)) {
                $result['skipped_users']++;
                continue;
            }

            $result['users_checked']++;

            try {
                $userCon = new PDO('sqlite:' . $dbPath);
                $userCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $userCon->exec('PRAGMA busy_timeout = 30000');
                ReminderEmailService::ensureUserReminderEmailSchema($userCon);

                $notifications = $this->loadDueNotifications($userCon, $this->cutoffFor($userId), $remaining);

                foreach ($notifications as $notification) {
                    if (!$this->reserveNotification($userCon, (int)$notification['id'])) {
                        continue;
                    }

                    $error = $this->pushToDevices($userId, $notification, $privateKey, $subject);
                    if ($error === null) {
                        $this->markNotificationSent($userCon, (int)$notification['id']);
                        $result['sent']++;
                    } else {
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

    /**
     * Reminders that fired before the account's first device subscribed are
     * not pushed: accepting notifications must not replay what is already
     * waiting behind the bell.
     */
    private function cutoffFor(int $userId): string {
        $cutoff = gmdate('Y-m-d H:i:s', time() - self::MAX_AGE_SECONDS);
        try {
            $stmt = getMasterConnection()->prepare('SELECT MIN(created_at) FROM push_subscriptions WHERE user_id = ?');
            $stmt->execute([$userId]);
            $firstDevice = (string)$stmt->fetchColumn();
            if ($firstDevice !== '' && $firstDevice > $cutoff) {
                $cutoff = $firstDevice;
            }
        } catch (Exception $e) {
            // The age limit alone still applies
        }
        return $cutoff;
    }

    private function loadDueNotifications(PDO $con, string $cutoffAt, int $limit): array {
        $now = gmdate('Y-m-d H:i:s');
        $retryBefore = gmdate('Y-m-d H:i:s', time() - self::RETRY_DELAY_SECONDS);

        $stmt = $con->prepare("
            SELECT n.id, n.note_id, n.message, n.trigger_at,
                   e.heading AS note_heading, e.workspace AS workspace
            FROM notifications n
            LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
            WHERE n.dismissed = 0
              AND n.is_read = 0
              AND n.trigger_at <= ?
              AND n.trigger_at >= ?
              AND n.push_sent_at IS NULL
              AND COALESCE(n.push_attempts, 0) < ?
              AND (n.push_last_attempt_at IS NULL OR n.push_last_attempt_at <= ?)
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

    /**
     * Push one reminder to every device of the account. Null when at least
     * one took it, the reason otherwise.
     */
    private function pushToDevices(int $userId, array $notification, string $privateKey, string $subject): ?string {
        $devices = listPushSubscriptions($userId);
        if (empty($devices)) {
            return 'no subscribed device';
        }

        $payload = (string)json_encode($this->buildPayload($notification), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $delivered = 0;
        $lastError = 'no subscribed device';

        foreach ($devices as $device) {
            $status = $this->send($device, $payload, $privateKey, $subject);
            if ($status >= 200 && $status < 300) {
                $delivered++;
                markPushSubscriptionResult((int)$device['id'], null);
            } elseif ($status === 404 || $status === 410) {
                // Unsubscribed, uninstalled, or signed out on that device
                deletePushSubscription((string)$device['endpoint']);
                $lastError = 'device no longer subscribed';
            } else {
                $lastError = $status > 0 ? 'push service answered HTTP ' . $status : 'push service unreachable';
                markPushSubscriptionResult((int)$device['id'], $lastError);
            }
        }

        return $delivered > 0 ? null : $lastError;
    }

    /**
     * What the service worker turns into a notification (sw.js, 'push').
     * The note address is relative: the worker resolves it against its own
     * scope, so it is right whatever URL the instance is reached through.
     */
    private function buildPayload(array $notification): array {
        $heading = trim((string)($notification['note_heading'] ?? ''));
        $title = trim((string)($notification['message'] ?? ''));
        if ($title === '') {
            $title = $heading !== '' ? $heading : 'Poznote';
        }

        $url = '';
        $noteId = (int)($notification['note_id'] ?? 0);
        if ($noteId > 0) {
            $params = ['note' => $noteId];
            $workspace = trim((string)($notification['workspace'] ?? ''));
            if ($workspace !== '') {
                $params['workspace'] = $workspace;
            }
            $url = 'index.php?' . http_build_query($params);
        }

        return [
            'id' => (int)$notification['id'],
            'title' => $this->shorten($title),
            'body' => $heading !== '' && $heading !== $title ? $this->shorten($heading) : '',
            'url' => $url,
        ];
    }

    private function shorten(string $text): string {
        if (function_exists('mb_strlen') && mb_strlen($text) > self::TEXT_LIMIT) {
            return mb_substr($text, 0, self::TEXT_LIMIT - 1) . '…';
        }
        return $text;
    }

    /** HTTP status of the push service, 0 when it could not be reached. */
    private function send(array $device, string $payload, string $privateKey, string $subject): int {
        $endpoint = (string)$device['endpoint'];
        // Checked when the device registered; checked again before every
        // request, since this is where the server actually connects.
        if (!webPushIsAllowedEndpoint($endpoint)) {
            return 404;
        }

        $body = webPushEncrypt($payload, (string)$device['p256dh'], (string)$device['auth']);
        $authorization = webPushVapidAuthorization($endpoint, $privateKey, $subject);
        if ($body === null || $authorization === null) {
            return 0;
        }

        $ch = curl_init($endpoint);
        if ($ch === false) {
            return 0;
        }
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'Content-Length: ' . strlen($body),
            'TTL: ' . self::MAX_AGE_SECONDS,
            'Urgency: high',
            'Authorization: ' . $authorization,
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, self::TIMEOUT_SECONDS);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, self::TIMEOUT_SECONDS);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return $status;
    }

    private function reserveNotification(PDO $con, int $notificationId): bool {
        $stmt = $con->prepare("
            UPDATE notifications
            SET push_attempts = COALESCE(push_attempts, 0) + 1,
                push_last_attempt_at = ?,
                push_error = NULL
            WHERE id = ?
              AND push_sent_at IS NULL
              AND COALESCE(push_attempts, 0) < ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId, self::MAX_ATTEMPTS]);
        return $stmt->rowCount() > 0;
    }

    private function markNotificationSent(PDO $con, int $notificationId): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET push_sent_at = ?,
                push_error = NULL
            WHERE id = ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId]);
    }

    private function markNotificationFailed(PDO $con, int $notificationId, string $error): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET push_error = ?
            WHERE id = ?
        ");
        $stmt->execute([substr($error, 0, 1000), $notificationId]);
    }

    /** Same source order as the email and webhook channels. */
    private function getAppUrl(): string {
        $appUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
        if ($appUrl === '' && function_exists('_env')) {
            $appUrl = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
        }
        return $appUrl;
    }
}
