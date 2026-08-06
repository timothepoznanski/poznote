<?php
/**
 * S3 backup service: uploads each user's complete backup ZIP (the same
 * archive as the "Complete Backup" download) to an S3-compatible bucket.
 *
 * Two entry points share this class:
 *   - api_s3_backup.php  manual backups triggered from the settings page
 *   - workers/s3-backup-worker.php  automatic scheduled backups
 *
 * The bucket configuration is independent from the attachment storage one
 * (s3_storage_*), so backups can target a different provider or bucket.
 * Objects live under backups/{userId}/poznote_backup_{username}_{date}.zip
 * and old archives are pruned per user beyond the configured retention.
 */

if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/config.php';
}
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/users/db_master.php';
require_once __DIR__ . '/storage/S3Client.php';
require_once __DIR__ . '/backup_zip.php';

class S3BackupService {
    const KEY_PREFIX = 'backups/';

    const FREQUENCIES = [
        'daily' => 86400,
        'weekly' => 604800,
        'monthly' => 2592000, // 30 days
    ];

    /**
     * Backup configuration from master.db global_settings.
     */
    public static function getConfig(): array {
        $frequency = (string)getGlobalSetting('s3_backup_frequency', 'daily');
        if (!isset(self::FREQUENCIES[$frequency])) {
            $frequency = 'daily';
        }
        $retention = (int)getGlobalSetting('s3_backup_retention', '7');
        if ($retention < 0) {
            $retention = 0;
        }

        // Empty setting = back up every user, including future ones; otherwise
        // a comma-separated allowlist of user ids
        $userIdsRaw = trim((string)getGlobalSetting('s3_backup_user_ids', ''));
        $userIds = null;
        if ($userIdsRaw !== '') {
            $userIds = array_values(array_unique(array_map('intval', explode(',', $userIdsRaw))));
        }

        return [
            // Master switch: when off the whole feature is disabled (worker,
            // user-facing sections, self-service API), whatever the automatic
            // toggle says. Defaults to on so pre-existing setups keep working.
            'enabled' => getGlobalSetting('s3_backup_enabled', '1') === '1',
            'auto_enabled' => getGlobalSetting('s3_backup_auto_enabled', '0') === '1',
            'endpoint' => (string)getGlobalSetting('s3_backup_endpoint', ''),
            'region' => (string)getGlobalSetting('s3_backup_region', 'us-east-1'),
            'bucket' => (string)getGlobalSetting('s3_backup_bucket', ''),
            'access_key' => (string)getGlobalSetting('s3_backup_access_key', ''),
            'secret_key' => (string)getGlobalSetting('s3_backup_secret_key', ''),
            'path_style' => getGlobalSetting('s3_backup_path_style', '1') === '1',
            'frequency' => $frequency,
            'retention' => $retention,
            'skip_s3_attachments' => getGlobalSetting('s3_backup_skip_s3_attachments', '0') === '1',
            'user_ids' => $userIds,
        ];
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

    public static function isConfigured(?array $config = null): bool {
        $config = $config ?? self::getConfig();
        return $config['endpoint'] !== '' && $config['bucket'] !== ''
            && $config['access_key'] !== '' && $config['secret_key'] !== '';
    }

    /**
     * Feature usable: master switch on and bucket configured. Drives the
     * settings card status and the user-facing backup/restore sections.
     */
    public static function isEnabled(?array $config = null): bool {
        $config = $config ?? self::getConfig();
        return $config['enabled'] && self::isConfigured($config);
    }

    public static function makeClient(?array $config = null): S3Client {
        return new S3Client($config ?? self::getConfig());
    }

    public static function keyPrefixForUser(int $userId): string {
        return self::KEY_PREFIX . $userId . '/';
    }

    /**
     * True when the automatic backup should run now. A small slack keeps the
     * schedule from drifting by one worker tick on every run.
     */
    public static function isAutoDue(?array $config = null): bool {
        $config = $config ?? self::getConfig();
        if (!$config['enabled'] || !$config['auto_enabled'] || !self::isConfigured($config)) {
            return false;
        }
        $lastRun = (int)getGlobalSetting('s3_backup_last_auto_run', '0');
        $interval = self::FREQUENCIES[$config['frequency']];
        return time() >= $lastRun + $interval - 150;
    }

    /**
     * Build and upload the backup ZIP of one user, then prune old archives.
     *
     * @return array ['success' => bool, 'key' => ?string, 'size' => int, 'error' => ?string]
     */
    public static function backupUser(int $userId, ?S3Client $client = null, ?array $config = null): array {
        $config = $config ?? self::getConfig();
        try {
            $client = $client ?? self::makeClient($config);
        } catch (Exception $e) {
            return ['success' => false, 'key' => null, 'size' => 0, 'error' => $e->getMessage()];
        }

        $build = buildUserBackupZip($userId, $config['skip_s3_attachments']);
        if (!$build['success']) {
            return ['success' => false, 'key' => null, 'size' => 0, 'error' => (string)$build['error']];
        }

        $zipPath = $build['zip_path'];
        $key = self::keyPrefixForUser($userId) . $build['filename'];
        $size = (int)(@filesize($zipPath) ?: 0);

        try {
            $client->putObject($key, $zipPath, 'application/zip');
            // Only trust the backup once the object is confirmed in the
            // bucket with the expected size
            $head = $client->headObject($key);
            if ($head === null || $head['size'] !== $size) {
                throw new S3StorageException('Uploaded backup size mismatch for ' . $key);
            }
        } catch (Exception $e) {
            @unlink($zipPath);
            return ['success' => false, 'key' => $key, 'size' => $size, 'error' => $e->getMessage()];
        }
        @unlink($zipPath);

        $pruneError = null;
        try {
            self::pruneUserBackups($client, $userId, $config['retention']);
        } catch (Exception $e) {
            // A failed prune must not fail the backup itself
            $pruneError = $e->getMessage();
        }

        return ['success' => true, 'key' => $key, 'size' => $size, 'error' => $pruneError];
    }

    /**
     * Keep only the most recent $retention archives of a user (0 = keep all).
     */
    public static function pruneUserBackups(S3Client $client, int $userId, int $retention): int {
        if ($retention <= 0) {
            return 0;
        }
        $objects = $client->listObjects(self::keyPrefixForUser($userId));
        usort($objects, function ($a, $b) {
            return strcmp(self::sortStamp($b['key']), self::sortStamp($a['key']));
        });

        $deleted = 0;
        foreach (array_slice($objects, $retention) as $object) {
            $client->deleteObject($object['key']);
            $deleted++;
        }
        return $deleted;
    }

    /**
     * Chronological sort key for a backup object: the timestamp embedded in
     * the filename when present (robust across username changes), otherwise
     * the raw key.
     */
    private static function sortStamp(string $key): string {
        if (preg_match('/_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.zip$/', $key, $m)) {
            return $m[1];
        }
        return $key;
    }

    /**
     * Back up every user of the instance. Used by the automatic worker; the
     * settings page backs up user by user through the API instead, to stay
     * within web timeouts.
     *
     * @return array ['success' => bool, 'users' => int, 'uploaded' => int, 'errors' => string[]]
     */
    public static function runAll(string $trigger = 'auto'): array {
        $config = self::getConfig();
        $summary = ['success' => false, 'users' => 0, 'uploaded' => 0, 'errors' => []];

        if (!self::isConfigured($config)) {
            $summary['errors'][] = 'S3 backup is not configured';
            self::recordRun($trigger, $summary);
            return $summary;
        }

        try {
            $client = self::makeClient($config);
        } catch (Exception $e) {
            $summary['errors'][] = $e->getMessage();
            self::recordRun($trigger, $summary);
            return $summary;
        }

        foreach (self::selectedUserProfiles($config) as $user) {
            $summary['users']++;
            $result = self::backupUser((int)$user['id'], $client, $config);
            if ($result['success']) {
                $summary['uploaded']++;
                if ($result['error'] !== null) {
                    $summary['errors'][] = $user['username'] . ' (prune): ' . $result['error'];
                }
            } else {
                $summary['errors'][] = $user['username'] . ': ' . $result['error'];
            }
        }

        $summary['success'] = $summary['uploaded'] > 0 && empty($summary['errors']);
        self::recordRun($trigger, $summary);
        return $summary;
    }

    /**
     * Persist when and how the last run went, for the settings page status.
     */
    public static function recordRun(string $trigger, array $summary): void {
        if ($trigger === 'auto') {
            setGlobalSetting('s3_backup_last_auto_run', (string)time());
        }
        setGlobalSetting('s3_backup_last_run_summary', json_encode([
            'trigger' => $trigger,
            'finished_at' => time(),
            'success' => (bool)$summary['success'],
            'users' => (int)($summary['users'] ?? 0),
            'uploaded' => (int)($summary['uploaded'] ?? 0),
            'errors' => array_slice($summary['errors'] ?? [], 0, 10),
        ]));
    }

    /**
     * Every backup archive in the bucket, newest first, with its owner.
     *
     * @return array List of ['key', 'size', 'user_id', 'filename']
     */
    public static function listBackups(S3Client $client): array {
        $backups = [];
        foreach ($client->listObjects(self::KEY_PREFIX) as $object) {
            if (!preg_match('#^backups/(\d+)/([^/]+)$#', $object['key'], $m)) {
                continue;
            }
            $backups[] = [
                'key' => $object['key'],
                'size' => $object['size'],
                'user_id' => (int)$m[1],
                'filename' => $m[2],
            ];
        }
        usort($backups, function ($a, $b) {
            return strcmp(self::sortStamp($b['key']), self::sortStamp($a['key']));
        });
        return $backups;
    }
}
