<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/SmtpMailer.php';

class ReminderEmailService {
    private const MAX_ATTEMPTS = 5;
    private const RETRY_DELAY_SECONDS = 300;

    public function getSmtpConfig(): array {
        $security = strtolower(trim((string)getGlobalSetting('smtp_security', 'tls')));
        if (!in_array($security, ['none', 'tls', 'ssl'], true)) {
            $security = 'tls';
        }

        $port = (int)getGlobalSetting('smtp_port', $security === 'ssl' ? '465' : '587');
        if ($port < 1 || $port > 65535) {
            $port = $security === 'ssl' ? 465 : 587;
        }

        $host = trim((string)getGlobalSetting('smtp_host', ''));
        $fromEmail = trim((string)getGlobalSetting('smtp_from_email', ''));
        $configured = $host !== '' && filter_var($fromEmail, FILTER_VALIDATE_EMAIL);

        $appUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
        if ($appUrl === '' && function_exists('_env')) {
            $appUrl = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
        }

        return [
            'enabled' => $configured,
            'host' => $host,
            'port' => $port,
            'security' => $security,
            'username' => (string)getGlobalSetting('smtp_username', ''),
            'password' => (string)getGlobalSetting('smtp_password', ''),
            'from_email' => $fromEmail,
            'from_name' => trim((string)getGlobalSetting('smtp_from_name', 'Poznote')),
            'app_url' => $appUrl,
            'reminder_cutoff_at' => trim((string)getGlobalSetting('smtp_reminder_cutoff_at', '')),
            'timeout' => 15,
        ];
    }

    public function validateSmtpConfig(array $config, bool $requireEnabled = false): array {
        $errors = [];

        if ($requireEnabled && empty($config['enabled'])) {
            $errors[] = 'SMTP reminder emails are disabled';
        }
        if (trim((string)($config['host'] ?? '')) === '') {
            $errors[] = 'SMTP host is required';
        }
        $port = (int)($config['port'] ?? 0);
        if ($port < 1 || $port > 65535) {
            $errors[] = 'SMTP port must be between 1 and 65535';
        }
        if (!in_array((string)($config['security'] ?? ''), ['none', 'tls', 'ssl'], true)) {
            $errors[] = 'SMTP security mode is invalid';
        }
        if (!filter_var((string)($config['from_email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Sender email is invalid';
        }

        $appUrl = trim((string)($config['app_url'] ?? ''));
        if ($appUrl !== '' && !$this->isValidHttpUrl($appUrl)) {
            $errors[] = 'Application URL must start with http:// or https://';
        }

        return $errors;
    }

    public function sendTestEmail(string $recipientEmail, string $recipientName = ''): array {
        $recipientEmail = trim($recipientEmail);
        if (!filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'error' => 'Invalid test recipient email'];
        }

        $config = $this->getSmtpConfig();
        $errors = $this->validateSmtpConfig($config, false);
        if (!empty($errors)) {
            return ['success' => false, 'error' => implode('; ', $errors)];
        }

        $subject = t('smtp_admin.test.subject', [], 'Poznote SMTP test');
        $text = t('smtp_admin.test.body_text', [], "This is a test email from Poznote.\n\nIf you received it, your SMTP configuration works.");
        $html = '<p>' . htmlspecialchars(t('smtp_admin.test.body_html_intro', [], 'This is a test email from Poznote.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
            . '<p>' . htmlspecialchars(t('smtp_admin.test.body_html_success', [], 'If you received it, your SMTP configuration works.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';

        try {
            $mailer = new SmtpMailer($config);
            $mailer->send($recipientEmail, $recipientName, $subject, $text, $html);
            return ['success' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    public function processDueReminders(int $limit = 100): array {
        $result = [
            'enabled' => false,
            'sent' => 0,
            'failed' => 0,
            'users_checked' => 0,
            'skipped_users' => 0,
            'errors' => [],
        ];

        $config = $this->getSmtpConfig();
        $result['enabled'] = (bool)$config['enabled'];
        if (!$config['enabled']) {
            return $result;
        }

        $errors = $this->validateSmtpConfig($config, true);
        if (!empty($errors)) {
            $result['errors'] = $errors;
            return $result;
        }

        if ($config['reminder_cutoff_at'] === '') {
            $cutoff = gmdate('Y-m-d H:i:s');
            setGlobalSetting('smtp_reminder_cutoff_at', $cutoff);
            $config['reminder_cutoff_at'] = $cutoff;
        }

        $profiles = getAllUserProfiles();
        $remaining = max(1, min(1000, $limit));

        foreach ($profiles as $profile) {
            if ($remaining <= 0) {
                break;
            }

            $userId = (int)($profile['id'] ?? 0);
            $email = trim((string)($profile['email'] ?? ''));
            $displayName = trim((string)($profile['username'] ?? ''));

            if ($userId <= 0 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
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
                self::ensureUserReminderEmailSchema($userCon);

                $settings = $this->loadUserSettings($userCon);
                $notifications = $this->loadDueNotifications($userCon, $config['reminder_cutoff_at'], $remaining);

                foreach ($notifications as $notification) {
                    if (!$this->reserveNotification($userCon, (int)$notification['id'])) {
                        continue;
                    }

                    try {
                        $message = $this->buildReminderMessage($notification, $settings, $config);
                        $mailer = new SmtpMailer($config);
                        $mailer->send($email, $displayName, $message['subject'], $message['text'], $message['html']);
                        $this->markNotificationSent($userCon, (int)$notification['id']);
                        $result['sent']++;
                    } catch (Throwable $e) {
                        $this->markNotificationFailed($userCon, (int)$notification['id'], $e->getMessage());
                        $result['failed']++;
                        $result['errors'][] = 'User ' . $userId . ', notification ' . (int)$notification['id'] . ': ' . $e->getMessage();
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

    public static function ensureUserReminderEmailSchema(PDO $con): void {
        $con->exec('CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER,
            type TEXT NOT NULL DEFAULT "reminder",
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created DATETIME DEFAULT CURRENT_TIMESTAMP,
            trigger_at DATETIME,
            dismissed INTEGER DEFAULT 0,
            email_enabled INTEGER DEFAULT 1,
            email_sent_at DATETIME,
            email_attempts INTEGER DEFAULT 0,
            email_last_attempt_at DATETIME,
            email_error TEXT,
            FOREIGN KEY(note_id) REFERENCES entries(id) ON DELETE CASCADE
        )');

        $cols = $con->query('PRAGMA table_info(notifications)')->fetchAll(PDO::FETCH_ASSOC);
        $existing = array_column($cols, 'name');

        $columns = [
            'email_enabled' => 'INTEGER DEFAULT 1',
            'email_sent_at' => 'DATETIME',
            'email_attempts' => 'INTEGER DEFAULT 0',
            'email_last_attempt_at' => 'DATETIME',
            'email_error' => 'TEXT',
        ];

        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                $con->exec('ALTER TABLE notifications ADD COLUMN ' . $name . ' ' . $definition);
            }
        }

        $con->exec('CREATE INDEX IF NOT EXISTS idx_notifications_email_due ON notifications(trigger_at, dismissed, email_sent_at, email_attempts)');
    }

    private function loadDueNotifications(PDO $con, string $cutoffAt, int $limit): array {
        $now = gmdate('Y-m-d H:i:s');
        $retryBefore = gmdate('Y-m-d H:i:s', time() - self::RETRY_DELAY_SECONDS);

        $stmt = $con->prepare("
            SELECT n.id, n.note_id, n.message, n.trigger_at, n.email_attempts,
                   e.heading AS note_heading, e.workspace AS workspace
            FROM notifications n
            LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
            WHERE n.dismissed = 0
              AND n.trigger_at <= ?
              AND n.trigger_at >= ?
              AND COALESCE(n.email_enabled, 1) = 1
              AND n.email_sent_at IS NULL
              AND COALESCE(n.email_attempts, 0) < ?
              AND (n.email_last_attempt_at IS NULL OR n.email_last_attempt_at <= ?)
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
            SET email_attempts = COALESCE(email_attempts, 0) + 1,
                email_last_attempt_at = ?,
                email_error = NULL
            WHERE id = ?
              AND email_sent_at IS NULL
              AND COALESCE(email_attempts, 0) < ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId, self::MAX_ATTEMPTS]);
        return $stmt->rowCount() > 0;
    }

    private function markNotificationSent(PDO $con, int $notificationId): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET email_sent_at = ?,
                email_error = NULL
            WHERE id = ?
        ");
        $stmt->execute([gmdate('Y-m-d H:i:s'), $notificationId]);
    }

    private function markNotificationFailed(PDO $con, int $notificationId, string $error): void {
        $stmt = $con->prepare("
            UPDATE notifications
            SET email_error = ?
            WHERE id = ?
        ");
        $stmt->execute([substr($error, 0, 1000), $notificationId]);
    }

    private function loadUserSettings(PDO $con): array {
        $settings = [];
        try {
            $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('language', 'timezone', 'date_time_format')");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $settings[$row['key']] = $row['value'];
            }
        } catch (Throwable $e) {
            return [];
        }

        return $settings;
    }

    private function buildReminderMessage(array $notification, array $settings, array $config): array {
        $lang = $this->normalizeLanguage($settings['language'] ?? 'en');
        $title = trim((string)($notification['note_heading'] ?? ''));
        $message = trim((string)($notification['message'] ?? ''));
        if ($title === '') {
            $title = $message !== '' ? $message : t('reminder.email.untitled_note', [], 'Untitled note', $lang);
        }

        $dueAt = $this->formatUserDateTime((string)($notification['trigger_at'] ?? ''), $settings);
        $noteUrl = $this->buildNoteUrl((int)($notification['note_id'] ?? 0), (string)($notification['workspace'] ?? ''), $config);

        $subject = t('reminder.email.subject', ['note' => $title], 'Reminder: {{note}}', $lang);
        $lines = [
            t('reminder.email.intro', [], 'A reminder is due in Poznote.', $lang),
            '',
            t('reminder.email.note', ['note' => $title], 'Note: {{note}}', $lang),
            t('reminder.email.due_at', ['date' => $dueAt], 'Due at: {{date}}', $lang),
        ];

        if ($message !== '' && $message !== $title) {
            $lines[] = t('reminder.email.message', ['message' => $message], 'Message: {{message}}', $lang);
        }

        if ($noteUrl !== '') {
            $lines[] = '';
            $lines[] = t('reminder.email.open_link', ['url' => $noteUrl], 'Open note: {{url}}', $lang);
        }

        $html = '<p>' . htmlspecialchars(t('reminder.email.intro', [], 'A reminder is due in Poznote.', $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
            . '<p><strong>' . htmlspecialchars(t('reminder.email.note_label', [], 'Note', $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . ':</strong> '
            . htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '<br>'
            . '<strong>' . htmlspecialchars(t('reminder.email.due_at_label', [], 'Due at', $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . ':</strong> '
            . htmlspecialchars($dueAt, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>';

        if ($message !== '' && $message !== $title) {
            $html .= '<p>' . nl2br(htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')) . '</p>';
        }

        if ($noteUrl !== '') {
            $safeUrl = htmlspecialchars($noteUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $html .= '<p><a href="' . $safeUrl . '">' . htmlspecialchars(t('reminder.email.open_button', [], 'Open note', $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</a><br>'
                . '<span style="font-size: 12px; color: #666;">' . $safeUrl . '</span></p>';
        }

        return [
            'subject' => $subject,
            'text' => implode("\n", $lines),
            'html' => $html,
        ];
    }

    private function buildNoteUrl(int $noteId, string $workspace, array $config): string {
        $baseUrl = trim((string)($config['app_url'] ?? ''));
        if ($noteId <= 0 || $baseUrl === '' || !$this->isValidHttpUrl($baseUrl)) {
            return '';
        }

        $params = ['note' => $noteId];
        $workspace = trim($workspace);
        if ($workspace !== '') {
            $params['workspace'] = $workspace;
        }

        return rtrim($baseUrl, '/') . '/index.php?' . http_build_query($params);
    }

    private function formatUserDateTime(string $utcDatetime, array $settings): string {
        if ($utcDatetime === '') {
            return '';
        }

        $timezone = trim((string)($settings['timezone'] ?? ''));
        if ($timezone === '') {
            $timezone = defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
        }

        try {
            $tz = new DateTimeZone($timezone);
        } catch (Throwable $e) {
            $tz = new DateTimeZone('UTC');
        }

        $format = $this->dateTimeFormatPattern((string)($settings['date_time_format'] ?? 'default'));

        try {
            $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
            $date->setTimezone($tz);
            return $date->format($format);
        } catch (Throwable $e) {
            return $utcDatetime;
        }
    }

    private function dateTimeFormatPattern(string $format): string {
        $patterns = [
            'default' => 'Y-m-d H:i',
            'ymd_hi' => 'Y-m-d H:i',
            'ymd_his' => 'Y-m-d H:i:s',
            'dmy_hi' => 'd/m/Y H:i',
            'mdy_hia' => 'm/d/Y h:i A',
        ];

        if (strpos($format, 'custom:') === 0 && function_exists('customDateTimePatternToPhpFormat')) {
            $custom = trim(substr($format, 7));
            if ($custom !== '') {
                return customDateTimePatternToPhpFormat($custom);
            }
        }

        return $patterns[$format] ?? $patterns['default'];
    }

    private function normalizeLanguage(string $lang): string {
        $lang = strtolower(trim($lang));
        return preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang) ? $lang : 'en';
    }

    private function isValidHttpUrl(string $url): bool {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }
        $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https'], true);
    }
}
