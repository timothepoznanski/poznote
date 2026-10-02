<?php

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}

require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/SmtpMailer.php';
require_once __DIR__ . '/ReminderEmailService.php';
require_once __DIR__ . '/share_passwords.php';
require_once __DIR__ . '/lib/workspace-activity.php';

/**
 * Emails the members of a shared workspace about what the others changed in
 * it (discussion #1545). A member is the owner of a workspace shared with at
 * least one account, or one of those accounts. Each chooses, in their own
 * settings, no email (the default), one as the changes happen, or a daily or
 * weekly summary; the choice covers every shared workspace they are part of.
 *
 * Called once a minute by workers/reminder-email-worker.php. The rules that
 * need no database are in lib/workspace-activity.php.
 *
 * What an email may hold: titles of notes of a workspace its reader can open
 * today (the shares are read again on every run), who wrote last and when.
 * Never the content of a note.
 */
class WorkspaceActivityEmailService {
    private const MAX_ATTEMPTS = 5;
    private const RETRY_DELAY_SECONDS = 300;

    /**
     * A write stamps its row before it commits: the last seconds are left to
     * the next run so a change still being committed is not skipped for good.
     */
    private const COMMIT_MARGIN_SECONDS = 15;

    private const MAX_NOTES_PER_WORKSPACE = 30;
    private const MAX_ROWS_PER_WORKSPACE = 500;

    private ReminderEmailService $reminderService;
    /** @var callable|null */
    private $sender;
    /** @var array<string,mixed>|null */
    private ?array $smtpConfig;
    /** @var array<int,string> */
    private array $usernames = [];
    /** @var array<int,PDO|null> */
    private array $userConnections = [];

    /**
     * @param callable|null $sender replaces the SMTP delivery, for checks that
     *        must not send anything: fn(string $email, string $name, array $message)
     * @param array<string,mixed>|null $smtpConfig replaces the stored SMTP
     *        configuration, with the keys getSmtpConfig() returns
     */
    public function __construct(?callable $sender = null, ?array $smtpConfig = null) {
        $this->reminderService = new ReminderEmailService();
        $this->sender = $sender;
        $this->smtpConfig = $smtpConfig;
    }

    /**
     * Key of the signature the links of an email carry, derived from the
     * instance secret (see poznoteWorkspaceActivityLinkSignature()).
     */
    public static function linkKey(): string {
        return hash_hmac('sha256', 'workspace-activity-link', poznoteSharePasswordEncryptionKey());
    }

    /**
     * Send every email that is due.
     *
     * @param int|null $now the current time, for checks that need another one
     * @return array{enabled:bool,sent:int,failed:int,users_checked:int,skipped_users:int,errors:string[]}
     */
    public function processDue(int $limit = 50, ?int $now = null): array {
        $result = [
            'enabled' => false,
            'sent' => 0,
            'failed' => 0,
            'users_checked' => 0,
            'skipped_users' => 0,
            'errors' => [],
        ];

        $config = $this->smtpConfig ?? $this->reminderService->getSmtpConfig();
        $result['enabled'] = !empty($config['enabled']);
        if (!$result['enabled']) {
            return $result;
        }

        if ($this->smtpConfig === null) {
            $errors = $this->reminderService->validateSmtpConfig($config, true);
            if (!empty($errors)) {
                $result['errors'] = $errors;
                return $result;
            }
        }

        $now = $now ?? time();
        $this->userConnections = [];
        $this->usernames = [];

        $master = getMasterConnection();
        self::ensureStateTable($master);

        $memberships = $this->membershipsByUser(listActiveWorkspaceShares());
        $this->forgetStatesExcept($master, array_keys($memberships));

        $remaining = max(1, min(500, $limit));
        $untilTs = $now - self::COMMIT_MARGIN_SECONDS;
        $until = gmdate('Y-m-d H:i:s', $untilTs);

        foreach ($memberships as $userId => $workspaces) {
            if ($remaining <= 0) {
                break;
            }

            try {
                $profile = getUserProfileById($userId);
                $email = trim((string)($profile['email'] ?? ''));
                $settings = $this->loadUserSettings($userId);
                if (!$profile || $settings === null || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $result['skipped_users']++;
                    continue;
                }

                $state = $this->loadState($master, $userId);
                $frequency = poznoteNormalizeWorkspaceActivityFrequency($settings['workspace_activity_emails'] ?? '');
                if ($frequency === 'off') {
                    // Turning the emails back on starts from that moment
                    if ($state !== null) {
                        $this->forgetState($master, $userId);
                    }
                    continue;
                }

                $result['users_checked']++;

                if ($state === null) {
                    // First run after the emails were turned on: nothing
                    // older than this is ever reported
                    $this->saveReportedUntil($master, $userId, $until);
                    continue;
                }

                if ((int)$state['attempts'] > 0
                    && self::utcToTimestamp((string)$state['last_attempt_at']) > $now - self::RETRY_DELAY_SECONDS) {
                    continue;
                }

                $reportedTs = self::utcToTimestamp((string)$state['reported_until']);
                $sinceTs = max($reportedTs, $now - POZNOTE_WORKSPACE_ACTIVITY_MAX_LOOKBACK_SECONDS);
                if ($sinceTs >= $untilTs) {
                    continue;
                }

                $timezone = trim((string)($settings['timezone'] ?? ''));
                if ($timezone === '') {
                    $timezone = defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
                }

                // The slot is compared with the end of the window, so the
                // email that crosses it also moves the mark past it
                if ($frequency !== 'instant'
                    && !poznoteWorkspaceActivitySummaryDue($frequency, $untilTs, $reportedTs, $timezone)) {
                    continue;
                }

                $since = gmdate('Y-m-d H:i:s', $sinceTs);
                $sections = $this->collectChanges($userId, $workspaces, $since, $until);
                if (empty($sections)) {
                    $this->saveReportedUntil($master, $userId, $until);
                    continue;
                }

                if ($frequency === 'instant') {
                    [$newest, $oldest] = $this->changeBounds($sections);
                    if (!poznoteWorkspaceActivityInstantReady($now, $newest, $oldest)) {
                        continue;
                    }
                }

                $message = $this->buildMessage($userId, $sections, $since, $settings, $config);

                try {
                    $this->send($config, $email, trim((string)($profile['username'] ?? '')), $message);
                    $this->saveReportedUntil($master, $userId, $until);
                    $result['sent']++;
                } catch (Throwable $e) {
                    $result['failed']++;
                    $result['errors'][] = 'User ' . $userId . ': ' . $e->getMessage();
                    $attempts = (int)$state['attempts'] + 1;
                    if ($attempts >= self::MAX_ATTEMPTS) {
                        // Given up: these changes are dropped rather than
                        // retried every five minutes for ever
                        $this->saveReportedUntil($master, $userId, $until);
                    } else {
                        $this->saveFailure($master, $userId, $attempts, gmdate('Y-m-d H:i:s', $now), $e->getMessage());
                    }
                }

                $remaining--;
            } catch (Throwable $e) {
                $result['failed']++;
                $result['errors'][] = 'User ' . $userId . ': ' . $e->getMessage();
            }
        }

        $this->userConnections = [];

        return $result;
    }

    /**
     * One row per member: the end of the last email (changes up to there are
     * reported, or were deliberately left out) and the failed attempts since.
     * In the master database, so that restoring an account's backup does not
     * bring an old mark back and with it a week of changes already sent.
     */
    public static function ensureStateTable(PDO $con): void {
        $con->exec("
            CREATE TABLE IF NOT EXISTS workspace_activity_emails (
                user_id INTEGER PRIMARY KEY,
                reported_until DATETIME NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_attempt_at DATETIME,
                last_error TEXT
            )
        ");
    }

    /**
     * The shared workspaces each account is a member of, as owner or as
     * grantee: [user id => [['owner_user_id' => int, 'workspace_name' => string], ...]].
     *
     * @param array<int,array{owner_user_id:int,workspace_name:string,grantee_user_id:int}> $shares
     * @return array<int,array<int,array{owner_user_id:int,workspace_name:string}>>
     */
    private function membershipsByUser(array $shares): array {
        $byUser = [];
        foreach ($shares as $share) {
            $workspace = ['owner_user_id' => $share['owner_user_id'], 'workspace_name' => $share['workspace_name']];
            $key = $share['owner_user_id'] . "\n" . $share['workspace_name'];
            $byUser[$share['owner_user_id']][$key] = $workspace;
            $byUser[$share['grantee_user_id']][$key] = $workspace;
        }

        return array_map('array_values', $byUser);
    }

    /**
     * @param array<int,array{owner_user_id:int,workspace_name:string}> $workspaces
     * @return array<int,array<string,mixed>> one section per workspace that
     *         has something to report, in the order of $workspaces
     */
    private function collectChanges(int $readerUserId, array $workspaces, string $since, string $until): array {
        $sections = [];

        foreach ($workspaces as $workspace) {
            $ownerUserId = $workspace['owner_user_id'];
            $name = $workspace['workspace_name'];

            try {
                $con = $this->userConnection($ownerUserId);
                if ($con === null) {
                    continue;
                }

                // A share can outlive its workspace (see forgetStaleWorkspaceShares())
                $exists = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $exists->execute([$name]);
                if ((int)$exists->fetchColumn() === 0) {
                    continue;
                }

                $stmt = $con->prepare('
                    SELECT id, heading, created, updated, trash, created_by_user_id, updated_by_user_id
                    FROM entries
                    WHERE workspace = ? AND updated > ? AND updated <= ?
                    ORDER BY updated DESC, id DESC
                    LIMIT ' . self::MAX_ROWS_PER_WORKSPACE);
                $stmt->execute([$name, $since, $until]);

                $items = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $change = poznoteClassifyWorkspaceActivity($row, $readerUserId, $ownerUserId, $since);
                    if ($change === null) {
                        continue;
                    }
                    $items[] = [
                        'id' => (int)$row['id'],
                        'title' => trim((string)($row['heading'] ?? '')),
                        'kind' => $change['kind'],
                        'actor' => $this->username($change['actor']),
                        'updated' => (string)$row['updated'],
                    ];
                }
            } catch (Throwable $e) {
                // An account whose database predates the writer columns, or
                // is locked: its workspace is left out of this email
                error_log('Workspace activity email: cannot read workspace of user ' . $ownerUserId . ': ' . $e->getMessage());
                continue;
            }

            if (empty($items)) {
                continue;
            }

            $sections[] = [
                'owner_user_id' => $ownerUserId,
                'owner_username' => $this->username($ownerUserId),
                'workspace' => $name,
                'items' => array_slice($items, 0, self::MAX_NOTES_PER_WORKSPACE),
                'more' => max(0, count($items) - self::MAX_NOTES_PER_WORKSPACE),
                'newest' => self::utcToTimestamp($items[0]['updated']),
                'oldest' => self::utcToTimestamp($items[count($items) - 1]['updated']),
            ];
        }

        return $sections;
    }

    /**
     * @param array<int,array<string,mixed>> $sections
     * @return array{0:int,1:int} timestamps of the most recent and of the oldest change
     */
    private function changeBounds(array $sections): array {
        $newest = 0;
        $oldest = PHP_INT_MAX;
        foreach ($sections as $section) {
            $newest = max($newest, (int)$section['newest']);
            $oldest = min($oldest, (int)$section['oldest']);
        }

        return [$newest, $oldest];
    }

    /**
     * @param array<int,array<string,mixed>> $sections
     * @param array<string,string> $settings the reader's language, timezone and date format
     * @param array<string,mixed> $config
     * @return array{subject:string,text:string,html:string}
     */
    private function buildMessage(int $readerUserId, array $sections, string $since, array $settings, array $config): array {
        $lang = strtolower(trim((string)($settings['language'] ?? 'en')));
        if (!preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
            $lang = 'en';
        }

        $appUrl = rtrim(trim((string)($config['app_url'] ?? '')), '/');
        if ($appUrl !== '' && !preg_match('#^https?://#i', $appUrl)) {
            $appUrl = '';
        }
        $linkKey = $appUrl !== '' ? self::linkKey() : '';
        $link = static function (int $ownerUserId, string $workspace, int $noteId) use ($appUrl, $linkKey, $readerUserId): string {
            if ($appUrl === '') {
                return '';
            }
            return $appUrl . '/open_shared.php?'
                . poznoteWorkspaceActivityLinkQuery($linkKey, $readerUserId, $ownerUserId, $workspace, $noteId);
        };

        $subject = count($sections) === 1
            ? t('workspace_activity_email.subject_one', ['workspace' => $sections[0]['workspace']], 'Changes in the shared workspace {{workspace}}', $lang)
            : t('workspace_activity_email.subject_many', ['count' => count($sections)], 'Changes in {{count}} shared workspaces', $lang);
        $heading = t('workspace_activity_email.heading', [], 'Shared workspace activity', $lang);
        $intro = t(
            'workspace_activity_email.intro',
            ['date' => $this->reminderService->formatUserDateTime($since, $settings)],
            'Changes made by others since {{date}}.',
            $lang
        );
        $untitled = t('workspace_activity_email.untitled_note', [], 'Untitled note', $lang);
        $footer = t('workspace_activity_email.footer', [], 'You receive this email because shared workspace emails are turned on in your Poznote settings.', $lang);
        $settingsUrl = $appUrl !== '' ? $appUrl . '/settings.php' : '';

        $lines = [$intro];
        $sectionsHtml = '';

        foreach ($sections as $section) {
            $ownerUserId = (int)$section['owner_user_id'];
            $workspace = (string)$section['workspace'];
            $sharedBy = $ownerUserId === $readerUserId
                ? t('workspace_activity_email.shared_by_you', [], 'Shared by you', $lang)
                : t('workspace_activity_email.shared_by', ['user' => $section['owner_username']], 'Shared by {{user}}', $lang);
            $workspaceUrl = $link($ownerUserId, $workspace, 0);

            $lines[] = '';
            $lines[] = $workspace . ' (' . $sharedBy . ')';
            if ($workspaceUrl !== '') {
                $lines[] = $workspaceUrl;
            }

            $rowsHtml = '';
            foreach ($section['items'] as $item) {
                $title = $item['title'] !== '' ? $item['title'] : $untitled;
                $action = $this->actionLabel((string)$item['kind'], (string)$item['actor'], $lang);
                $date = $this->reminderService->formatUserDateTime((string)$item['updated'], $settings);
                // A deleted note is in the trash, which a workspace shared
                // with the reader does not open
                $noteUrl = $item['kind'] === 'deleted' ? '' : $link($ownerUserId, $workspace, (int)$item['id']);

                $lines[] = '- ' . $title . ' (' . $action . ', ' . $date . ')';

                $titleHtml = $noteUrl !== ''
                    ? '<a href="' . $this->esc($noteUrl) . '" style="color:#2563eb;text-decoration:none;">' . $this->esc($title) . '</a>'
                    : $this->esc($title);
                $rowsHtml .= '<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;">'
                    . '<div style="color:#111827;font-size:15px;line-height:21px;">' . $titleHtml . '</div>'
                    . '<div style="margin-top:2px;color:#6b7280;font-size:13px;line-height:18px;">' . $this->esc($action . ' · ' . $date) . '</div>'
                    . '</td></tr>';
            }

            if ((int)$section['more'] > 0) {
                $more = t('workspace_activity_email.more', ['count' => (int)$section['more']], 'and {{count}} more', $lang);
                $lines[] = '- ' . $more;
                $rowsHtml .= '<tr><td style="padding:10px 0;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:18px;">'
                    . $this->esc($more) . '</td></tr>';
            }

            $workspaceHtml = $workspaceUrl !== ''
                ? '<a href="' . $this->esc($workspaceUrl) . '" style="color:#111827;text-decoration:none;">' . $this->esc($workspace) . '</a>'
                : $this->esc($workspace);
            $sectionsHtml .= '<tr><td style="padding:22px 24px 0;">'
                . '<div style="color:#111827;font-size:18px;font-weight:700;line-height:25px;">' . $workspaceHtml . '</div>'
                . '<div style="margin:2px 0 10px;color:#6b7280;font-size:13px;line-height:18px;">' . $this->esc($sharedBy) . '</div>'
                . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $rowsHtml . '</table>'
                . '</td></tr>';
        }

        $lines[] = '';
        $lines[] = $footer;
        if ($settingsUrl !== '') {
            $lines[] = $settingsUrl;
        }

        $footerHtml = $this->esc($footer);
        if ($settingsUrl !== '') {
            $footerHtml .= ' <a href="' . $this->esc($settingsUrl) . '" style="color:#6b7280;">'
                . $this->esc(t('workspace_activity_email.settings_link', [], 'Open settings', $lang)) . '</a>';
        }

        $html = '<!doctype html>'
            . '<html lang="' . $this->esc($lang) . '">'
            . '<head>'
            . '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            . '</head>'
            . '<body style="margin:0;padding:0;background-color:#f4f6fb;color:#111827;font-family:Arial,Helvetica,sans-serif;">'
            . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' . $this->esc($intro) . '</div>'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#f4f6fb;margin:0;padding:0;">'
            . '<tr><td align="center" style="padding:28px 16px;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">'
            . '<tr><td style="padding:22px 24px 14px;border-bottom:1px solid #e5e7eb;background-color:#ffffff;">'
            . '<div style="font-size:13px;font-weight:700;line-height:18px;color:#2563eb;text-transform:uppercase;">Poznote</div>'
            . '<h1 style="margin:8px 0 0;color:#111827;font-size:22px;font-weight:700;line-height:29px;">' . $this->esc($heading) . '</h1>'
            . '<p style="margin:8px 0 0;color:#4b5563;font-size:15px;line-height:22px;">' . $this->esc($intro) . '</p>'
            . '</td></tr>'
            . $sectionsHtml
            . '<tr><td style="padding:22px 24px;">'
            . '<div style="height:1px;background-color:#e5e7eb;font-size:1px;line-height:1px;">&nbsp;</div>'
            . '<p style="margin:14px 0 0;color:#6b7280;font-size:12px;line-height:18px;">' . $footerHtml . '</p>'
            . '</td></tr>'
            . '</table>'
            . '</td></tr>'
            . '</table>'
            . '</body>'
            . '</html>';

        return [
            'subject' => $subject,
            'text' => trim(implode("\n", $lines)),
            'html' => $html,
        ];
    }

    private function actionLabel(string $kind, string $actor, string $lang): string {
        if ($kind === 'created') {
            return t('workspace_activity_email.created_by', ['user' => $actor], 'Created by {{user}}', $lang);
        }
        if ($kind === 'deleted') {
            return t('workspace_activity_email.deleted_by', ['user' => $actor], 'Deleted by {{user}}', $lang);
        }
        return t('workspace_activity_email.edited_by', ['user' => $actor], 'Edited by {{user}}', $lang);
    }

    /**
     * @param array<string,mixed> $config
     * @param array{subject:string,text:string,html:string} $message
     */
    private function send(array $config, string $email, string $name, array $message): void {
        if ($this->sender !== null) {
            ($this->sender)($email, $name, $message);
            return;
        }

        $mailer = new SmtpMailer($config);
        $mailer->send($email, $name, $message['subject'], $message['text'], $message['html']);
    }

    /**
     * The settings of an account the emails depend on, or null when the
     * account has no database yet (it never signed in).
     *
     * @return array<string,string>|null
     */
    private function loadUserSettings(int $userId): ?array {
        $con = $this->userConnection($userId);
        if ($con === null) {
            return null;
        }

        $settings = [];
        try {
            $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('workspace_activity_emails', 'language', 'timezone', 'date_time_format')");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $settings[(string)$row['key']] = (string)$row['value'];
            }
        } catch (Throwable $e) {
            return null;
        }

        return $settings;
    }

    private function userConnection(int $userId): ?PDO {
        if (array_key_exists($userId, $this->userConnections)) {
            return $this->userConnections[$userId];
        }

        $con = null;
        $dbPath = (new UserDataManager($userId))->getUserDatabasePath();
        if (is_file($dbPath)) {
            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $con->exec('PRAGMA busy_timeout = 5000');
        }

        return $this->userConnections[$userId] = $con;
    }

    private function username(int $userId): string {
        if (!isset($this->usernames[$userId])) {
            $profile = getUserProfileById($userId);
            $name = trim((string)($profile['username'] ?? ''));
            $this->usernames[$userId] = $name !== '' ? $name : '#' . $userId;
        }

        return $this->usernames[$userId];
    }

    /**
     * @return array{reported_until:string,attempts:int|string,last_attempt_at:?string}|null
     */
    private function loadState(PDO $master, int $userId): ?array {
        $stmt = $master->prepare('SELECT reported_until, attempts, last_attempt_at FROM workspace_activity_emails WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function saveReportedUntil(PDO $master, int $userId, string $until): void {
        $stmt = $master->prepare('
            INSERT INTO workspace_activity_emails (user_id, reported_until, attempts, last_attempt_at, last_error)
            VALUES (?, ?, 0, NULL, NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                reported_until = excluded.reported_until,
                attempts = 0,
                last_attempt_at = NULL,
                last_error = NULL
        ');
        $stmt->execute([$userId, $until]);
    }

    private function saveFailure(PDO $master, int $userId, int $attempts, string $attemptedAt, string $error): void {
        $stmt = $master->prepare('UPDATE workspace_activity_emails SET attempts = ?, last_attempt_at = ?, last_error = ? WHERE user_id = ?');
        $stmt->execute([$attempts, $attemptedAt, substr($error, 0, 1000), $userId]);
    }

    private function forgetState(PDO $master, int $userId): void {
        $stmt = $master->prepare('DELETE FROM workspace_activity_emails WHERE user_id = ?');
        $stmt->execute([$userId]);
    }

    /**
     * Drop the rows of accounts that are in no shared workspace any more
     * (unshared, deactivated, deleted): joining one again starts afresh.
     *
     * @param int[] $memberIds
     */
    private function forgetStatesExcept(PDO $master, array $memberIds): void {
        $known = array_map('intval', $master->query('SELECT user_id FROM workspace_activity_emails')->fetchAll(PDO::FETCH_COLUMN));
        foreach (array_diff($known, $memberIds) as $userId) {
            $this->forgetState($master, (int)$userId);
        }
    }

    private static function utcToTimestamp(string $utcDatetime): int {
        $timestamp = strtotime($utcDatetime . ' UTC');
        return $timestamp === false ? 0 : $timestamp;
    }

    private function esc(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
