<?php
/**
 * Local backup service: writes each user's complete backup ZIP (the same
 * archive as the "Complete Backup" download) into a folder of the server's
 * filesystem, on a schedule, and keeps only the most recent ones.
 *
 * Two entry points share this class:
 *   - api_local_backup.php  manual backups triggered from the settings page
 *   - workers/s3-backup-worker.php  automatic scheduled backups
 *
 * It is the filesystem counterpart of S3BackupService and deliberately keeps
 * the same layout: archives live under {directory}/{userId}/ with the name
 * poznote_backup_{username}_{date}.zip, and old ones are pruned per user
 * beyond the configured retention. The configuration lives in master.db
 * (global_settings) and applies to the whole instance.
 */

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/backup_zip.php';

class LocalBackupService {
    const FREQUENCIES = [
        'daily' => 86400,
        'weekly' => 604800,
        'monthly' => 2592000, // 30 days
    ];

    // Only files with this shape are ever listed, served or deleted, so a
    // folder shared with something else is never touched beyond our archives.
    const FILENAME_PATTERN = '/^poznote_backup_.+_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.zip$/';

    /**
     * Folder used when none is configured: data/backups, next to the users'
     * data, so it is covered by the volume every installation already mounts.
     */
    public static function defaultDirectory(): string {
        return dirname(SQLITE_DATABASE, 2) . '/backups';
    }

    /**
     * Backup configuration from master.db global_settings.
     */
    public static function getConfig(): array {
        $frequency = (string)getGlobalSetting('local_backup_frequency', 'daily');
        if (!isset(self::FREQUENCIES[$frequency])) {
            $frequency = 'daily';
        }
        $retention = (int)getGlobalSetting('local_backup_retention', '7');
        if ($retention < 0) {
            $retention = 0;
        }

        // Empty setting = back up every user, including future ones; otherwise
        // a comma-separated allowlist of user ids
        $userIdsRaw = trim((string)getGlobalSetting('local_backup_user_ids', ''));
        $userIds = null;
        if ($userIdsRaw !== '') {
            $userIds = array_values(array_unique(array_map('intval', explode(',', $userIdsRaw))));
        }

        $customDirectory = trim((string)getGlobalSetting('local_backup_directory', ''));

        return [
            'auto_enabled' => getGlobalSetting('local_backup_auto_enabled', '0') === '1',
            // What the admin typed ('' = default), and the folder actually used
            'custom_directory' => $customDirectory,
            'directory' => $customDirectory !== '' ? $customDirectory : self::defaultDirectory(),
            'frequency' => $frequency,
            'retention' => $retention,
            'user_ids' => $userIds,
        ];
    }

    /**
     * Normalise a folder typed by the admin and say why it cannot be used.
     *
     * Only the shape is checked here (whether it can be written to is checked
     * by ensureDirectory(), which may have to create it). The application's
     * own tree is refused apart from data/backups: an archive dropped under
     * the document root would be downloadable by anyone who guesses its name.
     *
     * @return array ['path' => string, 'error' => ?string] with error one of
     *         'not_absolute', 'inside_app'
     */
    public static function normalizeDirectory(string $path): array {
        $path = trim($path);
        if ($path === '') {
            return ['path' => '', 'error' => null];
        }
        if ($path[0] !== '/' || strpos($path, "\0") !== false) {
            return ['path' => $path, 'error' => 'not_absolute'];
        }

        // Collapse "//", "." and ".." without touching the filesystem (the
        // folder may not exist yet)
        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }
        $path = '/' . implode('/', $segments);

        $appRoot = rtrim((string)(realpath(__DIR__) ?: __DIR__), '/');
        $dataRoot = dirname(SQLITE_DATABASE, 2);
        $dataRoot = rtrim((string)(realpath($dataRoot) ?: $dataRoot), '/');
        $resolved = self::resolveExistingPrefix($path);
        $inside = function (string $root) use ($resolved): bool {
            return strpos($resolved . '/', $root . '/') === 0;
        };
        // data/backups is the one place of our own tree that may hold them:
        // anywhere else under data/ would mix archives with live user data
        if ($path === '/' || (($inside($appRoot) || $inside($dataRoot)) && !$inside($dataRoot . '/backups'))) {
            return ['path' => $path, 'error' => 'inside_app'];
        }

        return ['path' => $path, 'error' => null];
    }

    /**
     * realpath() of the deepest existing ancestor of $path, with the missing
     * tail appended: a symlink pointing back into the application is resolved
     * even when the final folder does not exist yet.
     */
    private static function resolveExistingPrefix(string $path): string {
        $tail = [];
        $current = $path;
        while ($current !== '/' && $current !== '' && !file_exists($current)) {
            array_unshift($tail, basename($current));
            $current = dirname($current);
        }
        $real = realpath($current);
        if ($real === false) {
            $real = $current;
        }
        return rtrim($real, '/') . ($tail ? '/' . implode('/', $tail) : '');
    }

    /**
     * Create the folder if needed and check it can be written to.
     *
     * @return ?string Error message, or null when the folder is usable
     */
    public static function ensureDirectory(string $directory): ?string {
        if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) {
            return 'Cannot create the backup folder ' . $directory;
        }
        if (!is_writable($directory)) {
            return 'The backup folder ' . $directory . ' is not writable by the web server user';
        }
        return null;
    }

    public static function userDirectory(int $userId, ?array $config = null): string {
        $config = $config ?? self::getConfig();
        return rtrim($config['directory'], '/') . '/' . $userId;
    }

    /**
     * Profiles of the users covered by the backup selection (all users when
     * no explicit selection is stored).
     */
    public static function selectedUserProfiles(?array $config = null): array {
        $config = $config ?? self::getConfig();
        $profiles = listAllUserProfiles();
        if ($config['user_ids'] === null) {
            return $profiles;
        }
        return array_values(array_filter($profiles, function ($user) use ($config) {
            return in_array((int)$user['id'], $config['user_ids'], true);
        }));
    }

    /**
     * True when the automatic backup should run now. A small slack keeps the
     * schedule from drifting by one worker tick on every run.
     */
    public static function isAutoDue(?array $config = null): bool {
        $config = $config ?? self::getConfig();
        if (!$config['auto_enabled']) {
            return false;
        }
        $lastRun = (int)getGlobalSetting('local_backup_last_auto_run', '0');
        $interval = self::FREQUENCIES[$config['frequency']];
        return time() >= $lastRun + $interval - 150;
    }

    /**
     * Build the backup ZIP of one user, move it into the backup folder, then
     * prune old archives.
     *
     * $trigger is recorded in the activity log as the entry's source: 'manual'
     * for an admin run, 'auto' when runAll() passes its own scheduled trigger
     * down.
     *
     * @return array ['success' => bool, 'filename' => ?string, 'size' => int, 'error' => ?string]
     */
    public static function backupUser(int $userId, ?array $config = null, string $trigger = 'manual'): array {
        $config = $config ?? self::getConfig();
        $userDir = self::userDirectory($userId, $config);
        $dirError = self::ensureDirectory($userDir);
        if ($dirError !== null) {
            return ['success' => false, 'filename' => null, 'size' => 0, 'error' => $dirError];
        }

        // Leftovers of a run killed half-way through its copy
        foreach ((@glob($userDir . '/poznote_backup_*.zip.part') ?: []) as $stale) {
            if (time() - (int)@filemtime($stale) > 86400) {
                @unlink($stale);
            }
        }

        // Milestones for the background job runner (no-op in synchronous
        // contexts, see poznoteRestoreReportProgress)
        poznoteRestoreReportProgress('building');
        $build = buildUserBackupZip($userId);
        if (!$build['success']) {
            return ['success' => false, 'filename' => null, 'size' => 0, 'error' => (string)$build['error']];
        }

        $zipPath = $build['zip_path'];
        $filename = (string)$build['filename'];
        $size = (int)(@filesize($zipPath) ?: 0);
        $target = $userDir . '/' . $filename;
        // Written under a temporary name first: a half-copied archive must
        // never look like a finished backup, nor count toward the retention
        $partial = $target . '.part';

        poznoteRestoreReportProgress('uploading');
        // rename() fails across filesystems (the temp dir and a mounted
        // backup volume usually are), hence the copy fallback
        $moved = @rename($zipPath, $partial) || @copy($zipPath, $partial);
        @unlink($zipPath);
        clearstatcache(true, $partial);
        if (!$moved || (int)(@filesize($partial) ?: 0) !== $size || $size <= 0 || !@rename($partial, $target)) {
            @unlink($partial);
            return ['success' => false, 'filename' => $filename, 'size' => $size, 'error' => 'Cannot write the archive to ' . $userDir . ' (disk full or folder not writable)'];
        }

        $pruneError = null;
        try {
            self::pruneUserBackups($userId, $config['retention'], $config);
        } catch (Exception $e) {
            // A failed prune must not fail the backup itself
            $pruneError = $e->getMessage();
        }

        // Every local backup (manual and scheduled) funnels through this
        // method, so one log call here covers them all. The account is passed
        // explicitly because scheduled runs have no session.
        require_once __DIR__ . '/ActivityLog.php';
        logActivity(ACTIVITY_BACKUP_CREATED, [
            'filename' => $filename,
            'size' => $size,
            'destination' => 'local',
        ], $trigger, $userId);

        return ['success' => true, 'filename' => $filename, 'size' => $size, 'error' => $pruneError];
    }

    /**
     * Archives of one user, newest first.
     *
     * @return array List of ['filename', 'size', 'mtime', 'user_id']
     */
    public static function listUserBackups(int $userId, ?array $config = null): array {
        $userDir = self::userDirectory($userId, $config);
        $backups = [];
        foreach ((@scandir($userDir) ?: []) as $file) {
            $path = $userDir . '/' . $file;
            if (!preg_match(self::FILENAME_PATTERN, $file) || !is_file($path)) {
                continue;
            }
            $backups[] = [
                'filename' => $file,
                'size' => (int)(@filesize($path) ?: 0),
                'mtime' => (int)(@filemtime($path) ?: 0),
                'user_id' => $userId,
            ];
        }
        usort($backups, function ($a, $b) {
            return strcmp(self::sortStamp($b['filename']), self::sortStamp($a['filename']));
        });
        return $backups;
    }

    /**
     * Every archive in the backup folder, newest first, with its owner.
     *
     * @return array List of ['filename', 'size', 'mtime', 'user_id']
     */
    public static function listBackups(?array $config = null): array {
        $config = $config ?? self::getConfig();
        $backups = [];
        foreach ((@scandir($config['directory']) ?: []) as $entry) {
            if (!ctype_digit((string)$entry) || !is_dir($config['directory'] . '/' . $entry)) {
                continue;
            }
            foreach (self::listUserBackups((int)$entry, $config) as $backup) {
                $backups[] = $backup;
            }
        }
        usort($backups, function ($a, $b) {
            return strcmp(self::sortStamp($b['filename']), self::sortStamp($a['filename']));
        });
        return $backups;
    }

    /**
     * Full path of one archive, or null when the name is not one of ours or
     * the file does not exist. The only way a request-supplied name reaches
     * the filesystem.
     */
    public static function backupPath(int $userId, string $filename, ?array $config = null): ?string {
        if ($userId <= 0 || $filename !== basename($filename) || !preg_match(self::FILENAME_PATTERN, $filename)) {
            return null;
        }
        $path = self::userDirectory($userId, $config) . '/' . $filename;
        return is_file($path) ? $path : null;
    }

    /**
     * Keep only the most recent $retention archives of a user (0 = keep all).
     */
    public static function pruneUserBackups(int $userId, int $retention, ?array $config = null): int {
        if ($retention <= 0) {
            return 0;
        }
        $userDir = self::userDirectory($userId, $config);
        $deleted = 0;
        foreach (array_slice(self::listUserBackups($userId, $config), $retention) as $backup) {
            if (!@unlink($userDir . '/' . $backup['filename'])) {
                throw new RuntimeException('Cannot delete the old archive ' . $backup['filename']);
            }
            $deleted++;
        }
        return $deleted;
    }

    /**
     * Chronological sort key: the timestamp embedded in the filename (robust
     * across username changes and copies that reset the file's mtime).
     */
    private static function sortStamp(string $filename): string {
        return preg_match(self::FILENAME_PATTERN, $filename, $m) ? $m[1] : $filename;
    }

    /**
     * Back up every selected user. Used by the automatic worker; the settings
     * page backs up user by user through the API instead, to show progress.
     *
     * @return array ['success' => bool, 'users' => int, 'saved' => int, 'errors' => string[]]
     */
    public static function runAll(string $trigger = 'auto'): array {
        $config = self::getConfig();
        $summary = ['success' => false, 'users' => 0, 'saved' => 0, 'errors' => []];

        $dirError = self::ensureDirectory($config['directory']);
        if ($dirError !== null) {
            $summary['errors'][] = $dirError;
            self::recordRun($trigger, $summary);
            return $summary;
        }

        foreach (self::selectedUserProfiles($config) as $user) {
            $summary['users']++;
            $result = self::backupUser((int)$user['id'], $config, $trigger);
            if ($result['success']) {
                $summary['saved']++;
                if ($result['error'] !== null) {
                    $summary['errors'][] = $user['username'] . ' (prune): ' . $result['error'];
                }
            } else {
                $summary['errors'][] = $user['username'] . ': ' . $result['error'];
            }
        }

        $summary['success'] = $summary['saved'] > 0 && empty($summary['errors']);
        self::recordRun($trigger, $summary);
        return $summary;
    }

    /**
     * Persist when and how the last run went, for the settings page status.
     */
    public static function recordRun(string $trigger, array $summary): void {
        if ($trigger === 'auto') {
            setGlobalSetting('local_backup_last_auto_run', (string)time());
        }
        setGlobalSetting('local_backup_last_run_summary', json_encode([
            'trigger' => $trigger,
            'finished_at' => time(),
            'success' => (bool)$summary['success'],
            'users' => (int)($summary['users'] ?? 0),
            'saved' => (int)($summary['saved'] ?? 0),
            'errors' => array_slice($summary['errors'] ?? [], 0, 10),
        ]));
    }

    /**
     * Remove every local backup archive of one user, on account deletion.
     * The folder itself goes too when nothing else is left in it.
     */
    public static function deleteAllUserBackups(int $userId, ?array $config = null): int {
        $userDir = self::userDirectory($userId, $config);
        $deleted = 0;
        foreach (self::listUserBackups($userId, $config) as $backup) {
            if (@unlink($userDir . '/' . $backup['filename'])) {
                $deleted++;
            }
        }
        @rmdir($userDir);
        return $deleted;
    }
}
