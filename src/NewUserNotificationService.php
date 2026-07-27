<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/SmtpMailer.php';
require_once __DIR__ . '/ReminderEmailService.php';

/**
 * Notifies opted-in admins when a new user profile is auto-created via OIDC.
 *
 * Delivery is best-effort: a failing SMTP server must never break the signup
 * that triggered the notification, so every error is logged and swallowed.
 */
class NewUserNotificationService {

    /**
     * @return array{sent:int,failed:int,skipped:bool}
     */
    public function notifyNewUser(int $userId, string $username, ?string $email = null, string $source = 'oidc'): array {
        $result = ['sent' => 0, 'failed' => 0, 'skipped' => true];

        try {
            $reminderService = new ReminderEmailService();
            $config = $reminderService->getSmtpConfig();
            if (empty($config['enabled'])) {
                return $result;
            }

            $recipients = listNewUserNotificationRecipients();
            if (empty($recipients)) {
                return $result;
            }

            $result['skipped'] = false;

            foreach ($recipients as $recipient) {
                $recipientEmail = trim((string)($recipient['email'] ?? ''));
                if (!filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
                    continue;
                }

                $lang = $this->recipientLanguage((int)($recipient['id'] ?? 0));
                $message = $this->buildMessage($username, $email, $source, $config, $lang);

                try {
                    $mailer = new SmtpMailer($config);
                    $mailer->send(
                        $recipientEmail,
                        $this->recipientName($recipient),
                        $message['subject'],
                        $message['text'],
                        $message['html']
                    );
                    $result['sent']++;
                } catch (Throwable $e) {
                    $result['failed']++;
                    error_log('New user notification failed for ' . $recipientEmail . ': ' . $e->getMessage());
                }
            }
        } catch (Throwable $e) {
            error_log('New user notification aborted for user ' . $userId . ': ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * Each admin reads the email in their own interface language, which lives
     * in their personal database rather than in the master one.
     */
    private function recipientLanguage(int $userId): string {
        try {
            $manager = new UserDataManager($userId);
            $dbPath = $manager->getUserDatabasePath();
            if (!is_file($dbPath)) {
                return 'en';
            }
            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $stmt = $con->prepare("SELECT value FROM settings WHERE key = 'language'");
            $stmt->execute();
            $lang = strtolower(trim((string)$stmt->fetchColumn()));
            return preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang) ? $lang : 'en';
        } catch (Throwable $e) {
            return 'en';
        }
    }

    private function recipientName(array $recipient): string {
        $first = trim((string)($recipient['first_name'] ?? ''));
        $last = trim((string)($recipient['last_name'] ?? ''));
        $full = trim($first . ' ' . $last);
        return $full !== '' ? $full : trim((string)($recipient['username'] ?? ''));
    }

    /**
     * @return array{subject:string,text:string,html:string}
     */
    private function buildMessage(string $username, ?string $email, string $source, array $config, string $lang = 'en'): array {
        $emailValue = trim((string)$email);
        $sourceLabel = $source === 'oidc'
            ? t('new_user_email.source_oidc', [], 'Single sign-on (OIDC)', $lang)
            : t('new_user_email.source_other', [], 'Administration', $lang);
        $createdAt = gmdate('Y-m-d H:i') . ' UTC';

        $intro = t('new_user_email.intro', [], 'A new user account was created in Poznote.', $lang);
        $subject = t('new_user_email.subject', ['user' => $username], 'New Poznote user: {{user}}', $lang);

        $usernameLabel = t('new_user_email.username_label', [], 'Username', $lang);
        $emailLabel = t('new_user_email.email_label', [], 'Email', $lang);
        $sourceLabelText = t('new_user_email.source_label', [], 'Created via', $lang);
        $createdLabel = t('new_user_email.created_label', [], 'Created at', $lang);
        $noEmail = t('new_user_email.no_email', [], 'Not provided', $lang);

        $lines = [
            $intro,
            '',
            $usernameLabel . ': ' . $username,
            $emailLabel . ': ' . ($emailValue !== '' ? $emailValue : $noEmail),
            $sourceLabelText . ': ' . $sourceLabel,
            $createdLabel . ': ' . $createdAt,
        ];

        $appUrl = trim((string)($config['app_url'] ?? ''));
        if ($appUrl !== '') {
            $lines[] = '';
            $lines[] = t('new_user_email.manage_link', ['url' => $appUrl . '/admin/users.php'], 'Manage users: {{url}}', $lang);
        }

        $html = $this->buildHtml(
            $intro,
            $username,
            $emailValue !== '' ? $emailValue : $noEmail,
            $sourceLabel,
            $createdAt,
            $usernameLabel,
            $emailLabel,
            $sourceLabelText,
            $createdLabel,
            $appUrl,
            $lang
        );

        return [
            'subject' => $subject,
            'text' => trim(implode("\n", $lines)),
            'html' => trim($html),
        ];
    }

    private function buildHtml(
        string $intro,
        string $username,
        string $email,
        string $sourceLabel,
        string $createdAt,
        string $usernameLabel,
        string $emailLabel,
        string $sourceLabelText,
        string $createdLabel,
        string $appUrl,
        string $lang = 'en'
    ): string {
        $heading = $this->esc(t('new_user_email.heading', [], 'New user', $lang));
        $rows = [
            [$usernameLabel, $username],
            [$emailLabel, $email],
            [$sourceLabelText, $sourceLabel],
            [$createdLabel, $createdAt],
        ];

        $rowsHtml = '';
        foreach ($rows as [$label, $value]) {
            $rowsHtml .= '<tr>'
                . '<td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">' . $this->esc($label) . '</td>'
                . '<td style="padding:6px 0;font-size:15px;color:#111827;font-weight:600;">' . $this->esc($value) . '</td>'
                . '</tr>';
        }

        $buttonHtml = '';
        if ($appUrl !== '') {
            $manageUrl = $this->esc($appUrl . '/admin/users.php');
            $buttonHtml = '<tr><td style="padding:24px 24px 0;">'
                . '<a href="' . $manageUrl . '" style="display:inline-block;background-color:#2563eb;color:#ffffff;'
                . 'text-decoration:none;padding:11px 22px;border-radius:8px;font-size:15px;font-weight:600;">'
                . $this->esc(t('new_user_email.manage_button', [], 'Manage users', $lang))
                . '</a></td></tr>';
        }

        return '<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#f3f4f6;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">'
            . '<tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">'
            . '<tr><td style="padding:24px 24px 0;font-size:19px;font-weight:700;color:#111827;">' . $heading . '</td></tr>'
            . '<tr><td style="padding:12px 24px 0;font-size:15px;line-height:23px;color:#374151;">' . $this->esc($intro) . '</td></tr>'
            . '<tr><td style="padding:16px 24px 0;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $rowsHtml . '</table>'
            . '</td></tr>'
            . $buttonHtml
            . '<tr><td style="padding:24px;font-size:13px;color:#9ca3af;">'
            . $this->esc(t('new_user_email.footer', [], 'You receive this email because new-user notifications are enabled for your admin account.', $lang))
            . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    private function esc(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
