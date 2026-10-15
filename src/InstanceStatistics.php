<?php
/**
 * Instance statistics for dashboards: GET /api/v1/public/statistics.
 *
 * The why, the token format and the parts that need no database are in
 * lib/statistics.php. This class stores the token in master.db
 * (global_settings), collects the summary across every account, and serves
 * the public route.
 *
 * Collecting opens every user database and walks every data folder, and a
 * dashboard may poll every ten seconds, so the summary is cached for a
 * minute. The update check asks GitHub at most every six hours, well under
 * its 60 requests an hour limit.
 */

require_once __DIR__ . '/lib/statistics.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/version_helper.php';
require_once __DIR__ . '/ActivityLog.php';

class InstanceStatistics {

    private const SETTING_HASH = 'statistics_token_hash';
    private const SETTING_HINT = 'statistics_token_hint';
    private const SETTING_CREATED = 'statistics_token_created_at';
    private const SETTING_LAST_USED = 'statistics_token_last_used_at';
    /** '1' = served to anyone, no token needed. Off by default, an admin's choice. */
    private const SETTING_PUBLIC = 'statistics_public';

    /** How long a collected summary is served before it is collected again. */
    private const CACHE_TTL = 60;

    /** How long a release lookup is trusted, and how long after a failed one to wait. */
    private const RELEASE_TTL = 21600;
    private const RELEASE_RETRY_TTL = 3600;

    /** "Last used" is written at most this often, not on every poll. */
    private const LAST_USED_RESOLUTION = 300;

    // ========== Token ==========

    /**
     * What the Settings card shows: whether a token exists, its first
     * characters, when it was made and last used. Never the token.
     *
     * @return array{enabled:bool,public:bool,hint:?string,created_at:?string,last_used_at:?string}
     */
    public static function tokenStatus(): array {
        $hash = (string)getGlobalSetting(self::SETTING_HASH, '');
        $public = self::isPublic();
        if ($hash === '') {
            return ['enabled' => false, 'public' => $public, 'hint' => null, 'created_at' => null, 'last_used_at' => null];
        }
        return [
            'enabled' => true,
            'public' => $public,
            'hint' => (string)getGlobalSetting(self::SETTING_HINT, '') ?: null,
            'created_at' => statisticsIsoDate(getGlobalSetting(self::SETTING_CREATED, '')),
            'last_used_at' => statisticsIsoDate(getGlobalSetting(self::SETTING_LAST_USED, '')),
        ];
    }

    public static function isPublic(): bool {
        return getGlobalSetting(self::SETTING_PUBLIC, '0') === '1';
    }

    /**
     * Serve the summary to anyone, without a token. The admin opts in; the
     * token, if there is one, keeps working either way.
     */
    public static function setPublic(bool $public): void {
        setGlobalSetting(self::SETTING_PUBLIC, $public ? '1' : '0');
    }

    /**
     * Replace the token with a new one and return it. The previous token
     * stops working at once.
     */
    public static function generateToken(): string {
        $token = generateStatisticsToken();
        setGlobalSetting(self::SETTING_HASH, hashStatisticsToken($token));
        setGlobalSetting(self::SETTING_HINT, statisticsTokenHint($token));
        setGlobalSetting(self::SETTING_CREATED, (string)time());
        setGlobalSetting(self::SETTING_LAST_USED, '');
        return $token;
    }

    public static function revokeToken(): void {
        foreach ([self::SETTING_HASH, self::SETTING_HINT, self::SETTING_CREATED, self::SETTING_LAST_USED] as $key) {
            setGlobalSetting($key, '');
        }
        self::dropCache();
    }

    private static function tokenMatches(string $token): bool {
        $hash = (string)getGlobalSetting(self::SETTING_HASH, '');
        return $hash !== '' && isStatisticsToken($token) && hash_equals($hash, hashStatisticsToken($token));
    }

    private static function touchLastUsed(): void {
        $last = (int)getGlobalSetting(self::SETTING_LAST_USED, '0');
        if (time() - $last >= self::LAST_USED_RESOLUTION) {
            setGlobalSetting(self::SETTING_LAST_USED, (string)time());
        }
    }

    // ========== Public route ==========

    /**
     * Answer GET /api/v1/public/statistics and stop. Called by the API router
     * before it loads db_connect.php, so no user database is opened on
     * behalf of an anonymous caller.
     */
    public static function serveRequest(): void {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if ($method !== 'GET') {
            header('Allow: GET');
            self::respond(405, ['success' => false, 'error' => 'Method not allowed. Use GET.']);
            return;
        }

        $token = statisticsTokenFromRequest($_SERVER, $_GET);
        if (self::isPublic()) {
            if ($token !== null && self::tokenMatches($token)) {
                self::touchLastUsed();
            }
            self::respond(200, ['success' => true] + self::cached());
            return;
        }

        if ((string)getGlobalSetting(self::SETTING_HASH, '') === '') {
            self::respond(403, ['success' => false, 'error' => 'Statistics are disabled. An administrator can generate a statistics token in Settings.']);
            return;
        }

        // No login throttling: 160 random bits cannot be guessed, and its
        // per-IP counter would let a dashboard still polling with a revoked
        // token lock the people behind the same address out of the login page
        if ($token === null || !self::tokenMatches($token)) {
            header('WWW-Authenticate: Bearer realm="Poznote statistics"');
            self::respond(401, ['success' => false, 'error' => 'Missing or invalid statistics token.']);
            return;
        }

        self::touchLastUsed();
        self::respond(200, ['success' => true] + self::cached());
    }

    /**
     * @param array<string,mixed> $body
     */
    private static function respond(int $status, array $body): void {
        http_response_code($status);
        echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }

    // ========== Collection ==========

    private static function cachePath(): string {
        // One file per data folder: several instances can share a /tmp
        return sys_get_temp_dir() . '/poznote_statistics_' . substr(hash('sha256', dirname(SQLITE_DATABASE, 2)), 0, 12) . '.json';
    }

    private static function dropCache(): void {
        $path = self::cachePath();
        if (is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * The summary, from the one-minute cache when it is fresh.
     *
     * @return array<string,mixed>
     */
    public static function cached(): array {
        $path = self::cachePath();
        if (is_file($path) && time() - (int)@filemtime($path) < self::CACHE_TTL) {
            $cached = json_decode((string)@file_get_contents($path), true);
            if (is_array($cached)) {
                return $cached;
            }
        }
        $stats = self::collect();
        @file_put_contents($path, json_encode($stats), LOCK_EX);
        return $stats;
    }

    /**
     * Walk every account and build the summary.
     *
     * @return array<string,mixed>
     */
    public static function collect(): array {
        require_once __DIR__ . '/users/UserDataManager.php';

        $version = getAppVersion();
        $latest = self::latestRelease();

        $users = ['total' => 0, 'active' => 0, 'admins' => 0];
        $notes = ['total' => 0, 'trash' => 0];
        $workspaces = 0;
        $folders = 0;
        $attachments = 0;
        $storage = ['total_bytes' => 0, 'database_bytes' => 0, 'notes_bytes' => 0, 'attachments_bytes' => 0, 'backups_bytes' => 0];
        $git = ['configured_users' => 0, 'last_sync_at' => null, 'last_sync_errors' => 0];
        $lastSyncTime = 0;

        foreach (listAllUserProfiles() as $profile) {
            $userId = (int)$profile['id'];
            $users['total']++;
            if (!empty($profile['active'])) $users['active']++;
            if (!empty($profile['is_admin'])) $users['admins']++;

            $manager = new UserDataManager($userId);
            $sizes = $manager->getStorageStats();
            $storage['total_bytes'] += (int)$sizes['total'];
            $storage['database_bytes'] += (int)$sizes['database'];
            $storage['notes_bytes'] += (int)$sizes['entries'];
            $storage['attachments_bytes'] += (int)$sizes['attachments'];
            $storage['backups_bytes'] += (int)$sizes['backups'];

            $counts = self::countUserDatabase($manager->getUserDatabasePath());
            if ($counts === null) {
                continue;
            }
            $notes['total'] += $counts['notes'];
            $notes['trash'] += $counts['trash'];
            $workspaces += $counts['workspaces'];
            $folders += $counts['folders'];
            $attachments += $counts['attachments'];

            if ($counts['git_configured']) {
                $git['configured_users']++;
            }
            if ($counts['git_last_sync'] !== null) {
                $syncTime = strtotime((string)($counts['git_last_sync']['timestamp'] ?? '')) ?: 0;
                if ($syncTime > $lastSyncTime) {
                    $lastSyncTime = $syncTime;
                }
                $git['last_sync_errors'] += (int)($counts['git_last_sync']['errors'] ?? 0);
            }
        }
        $git['last_sync_at'] = $lastSyncTime > 0 ? statisticsIsoDate($lastSyncTime) : null;

        $dataDir = dirname(SQLITE_DATABASE, 2);
        $diskFree = @disk_free_space($dataDir);
        $diskTotal = @disk_total_space($dataDir);
        $storage['disk_free_bytes'] = $diskFree === false ? null : (int)$diskFree;
        $storage['disk_total_bytes'] = $diskTotal === false ? null : (int)$diskTotal;

        $stats = [
            'version' => $version,
            'latest_version' => $latest,
            'update_available' => statisticsIsNewerRelease($version, $latest),
            'users' => $users,
            'notes' => $notes,
            'workspaces' => $workspaces,
            'folders' => $folders,
            'attachments' => $attachments,
            'storage' => $storage,
            'backups' => self::backupSummary(),
            'git_sync' => ['enabled' => defined('GIT_SYNC_ENABLED') && GIT_SYNC_ENABLED] + $git,
        ];
        $stats['warnings'] = statisticsWarnings($stats);
        $stats['status'] = $stats['warnings'] === [] ? 'ok' : 'warning';
        $stats['generated_at'] = statisticsIsoDate(time());
        return $stats;
    }

    /**
     * Counts from one user database, opened read-only so a missing or
     * half-created account is never initialised from here.
     *
     * @return array{notes:int,trash:int,workspaces:int,folders:int,attachments:int,git_configured:bool,git_last_sync:?array}|null
     */
    private static function countUserDatabase(string $path): ?array {
        if (!is_file($path)) {
            return null;
        }
        try {
            $db = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY,
            ]);
            $db->exec('PRAGMA busy_timeout = 2000');

            $row = $db->query('SELECT COALESCE(SUM(trash = 0), 0) AS notes, COALESCE(SUM(trash = 1), 0) AS trash FROM entries')->fetch(PDO::FETCH_ASSOC);
            $counts = [
                'notes' => (int)($row['notes'] ?? 0),
                'trash' => (int)($row['trash'] ?? 0),
                'workspaces' => self::countTable($db, 'workspaces'),
                'folders' => self::countTable($db, 'folders'),
                'attachments' => 0,
                'git_configured' => false,
                'git_last_sync' => null,
            ];

            // Attachments are listed in each note's JSON column, which also
            // covers the ones stored in an S3 bucket rather than on disk
            try {
                $counts['attachments'] = (int)$db->query("SELECT COALESCE(SUM(json_array_length(attachments)), 0) FROM entries WHERE trash = 0 AND attachments LIKE '[%'")->fetchColumn();
            } catch (Throwable $e) {
                $counts['attachments'] = 0;
            }

            $settings = $db->query("SELECT key, value FROM settings WHERE key IN ('git_repo', 'git_token', 'github_last_sync')")->fetchAll(PDO::FETCH_KEY_PAIR);
            $counts['git_configured'] = trim((string)($settings['git_repo'] ?? '')) !== '' && trim((string)($settings['git_token'] ?? '')) !== '';
            $lastSync = json_decode((string)($settings['github_last_sync'] ?? ''), true);
            $counts['git_last_sync'] = is_array($lastSync) ? $lastSync : null;

            return $counts;
        } catch (Throwable $e) {
            error_log('InstanceStatistics: cannot read ' . basename(dirname($path, 2)) . ': ' . $e->getMessage());
            return null;
        }
    }

    private static function countTable(PDO $db, string $table): int {
        try {
            return (int)$db->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn();
        } catch (Throwable $e) {
            return 0;
        }
    }

    /**
     * Local and S3 backups: whether they run, how the last run went, and
     * when one last succeeded. Counts only: error texts name accounts and
     * folders.
     *
     * @return array<string,mixed>
     */
    private static function backupSummary(): array {
        require_once __DIR__ . '/LocalBackupService.php';
        require_once __DIR__ . '/S3BackupService.php';

        $lastCreated = self::lastBackupTimes();

        $local = LocalBackupService::getConfig();
        $s3Config = S3BackupService::getConfig();

        $summary = [
            'local' => self::destinationSummary(
                !empty($local['auto_enabled']),
                (string)getGlobalSetting('local_backup_last_run_summary', ''),
                $lastCreated['local'] ?? null
            ),
            's3' => self::destinationSummary(
                S3BackupService::isEnabled($s3Config) && !empty($s3Config['auto_enabled']),
                (string)getGlobalSetting('s3_backup_last_run_summary', ''),
                $lastCreated['s3'] ?? null
            ),
        ];

        $latest = 0;
        foreach ($lastCreated as $time) {
            $latest = max($latest, $time);
        }
        foreach (['local', 's3'] as $destination) {
            $time = strtotime((string)$summary[$destination]['last_success_at']) ?: 0;
            $latest = max($latest, $time);
        }
        return ['last_success_at' => $latest > 0 ? statisticsIsoDate($latest) : null] + $summary;
    }

    /**
     * @return array<string,mixed>
     */
    private static function destinationSummary(bool $enabled, string $lastRunJson, ?int $lastCreated): array {
        $run = json_decode($lastRunJson, true);
        $run = is_array($run) ? $run : null;
        $finishedAt = $run ? (int)($run['finished_at'] ?? 0) : 0;

        // A run that went through counts as a success even if the activity
        // log is off or was purged; the log adds the user-by-user backups
        $lastSuccess = $lastCreated ?? 0;
        if ($run && !empty($run['success'])) {
            $lastSuccess = max($lastSuccess, $finishedAt);
        }

        return [
            'enabled' => $enabled,
            'last_run_at' => $finishedAt > 0 ? statisticsIsoDate($finishedAt) : null,
            'last_run_success' => $run ? (bool)($run['success'] ?? false) : null,
            'last_run_errors' => $run ? count((array)($run['errors'] ?? [])) : 0,
            'last_success_at' => $lastSuccess > 0 ? statisticsIsoDate($lastSuccess) : null,
        ];
    }

    /**
     * Newest "backup.created" per destination in the activity log.
     *
     * @return array<string,int> destination => unix time
     */
    private static function lastBackupTimes(): array {
        try {
            $con = getMasterConnection();
            ensureActivityLogTable($con);
            $rows = $con->query("SELECT json_extract(details, '$.destination') AS destination, MAX(created_at) AS created_at
                FROM activity_log WHERE action = 'backup.created' GROUP BY destination")->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            return [];
        }
        $times = [];
        foreach ($rows as $row) {
            $time = strtotime((string)$row['created_at'] . ' UTC');
            if ($time !== false && $row['destination'] !== null) {
                $times[(string)$row['destination']] = $time;
            }
        }
        return $times;
    }

    // ========== Update check ==========

    /**
     * Newest stable release on GitHub, from a six-hour cache. Null when it
     * was never reached.
     */
    private static function latestRelease(): ?string {
        $path = sys_get_temp_dir() . '/poznote_latest_release.json';
        $cached = is_file($path) ? json_decode((string)@file_get_contents($path), true) : null;
        if (is_array($cached)) {
            $age = time() - (int)($cached['fetched_at'] ?? 0);
            $ttl = !empty($cached['ok']) ? self::RELEASE_TTL : self::RELEASE_RETRY_TTL;
            if ($age < $ttl) {
                return $cached['version'] ?? null;
            }
        }

        $context = stream_context_create(['http' => [
            'method' => 'GET',
            'header' => ['User-Agent: Poznote-App/1.0', 'Accept: application/vnd.github.v3+json'],
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);
        $response = @file_get_contents('https://api.github.com/repos/timothepoznanski/poznote/releases/latest', false, $context);
        $release = $response === false ? null : json_decode($response, true);
        $tag = is_array($release) ? ltrim((string)($release['tag_name'] ?? ''), 'v') : '';

        if ($tag !== '' && preg_match('/^\d+(\.\d+)*$/', $tag)) {
            $entry = ['ok' => true, 'fetched_at' => time(), 'version' => $tag];
        } else {
            // Keep the last known version through a failed lookup
            $entry = ['ok' => false, 'fetched_at' => time(), 'version' => is_array($cached) ? ($cached['version'] ?? null) : null];
        }
        @file_put_contents($path, json_encode($entry), LOCK_EX);
        return $entry['version'];
    }
}
