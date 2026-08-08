<?php
/**
 * Attachment storage facade: local filesystem (default) or an S3-compatible
 * remote configured by the administrator (settings > S3 storage).
 *
 * The mode is exclusive and instance-wide: either every attachment lives on
 * disk under each user's attachments directory, or every attachment lives in
 * the bucket under attachments/{userId}/{filename}. The migration tooling in
 * api_s3_storage.php moves files between the two.
 *
 * Every consumer goes through the poznoteAttachment*() helpers in
 * functions.php; this class is the single place that knows where bytes live.
 */

require_once __DIR__ . '/S3Client.php';

class AttachmentStorage {
    private static $config = null;
    private static $instances = [];
    private static $tempFiles = [];
    private static $shutdownRegistered = false;

    private $userId;
    private $client = null;

    private function __construct(?int $userId) {
        $this->userId = $userId;
    }

    /**
     * Instance-wide S3 configuration from master.db global_settings.
     */
    public static function getConfig(): array {
        if (self::$config === null) {
            require_once __DIR__ . '/../users/db_master.php';
            self::$config = [
                'enabled' => getGlobalSetting('s3_storage_enabled', '0') === '1',
                'endpoint' => (string)getGlobalSetting('s3_storage_endpoint', ''),
                'region' => (string)getGlobalSetting('s3_storage_region', 'us-east-1'),
                'bucket' => (string)getGlobalSetting('s3_storage_bucket', ''),
                'access_key' => (string)getGlobalSetting('s3_storage_access_key', ''),
                'secret_key' => (string)getGlobalSetting('s3_storage_secret_key', ''),
                'path_style' => getGlobalSetting('s3_storage_path_style', '1') === '1',
            ];
        }
        return self::$config;
    }

    /**
     * Bucket credentials are present. Unlike isEnabled() this ignores the
     * master switch: objects uploaded while the feature was on must remain
     * reachable for cleanup after it has been turned off.
     */
    public static function isConfigured(): bool {
        $config = self::getConfig();
        return $config['endpoint'] !== '' && $config['bucket'] !== ''
            && $config['access_key'] !== '' && $config['secret_key'] !== '';
    }

    public static function isEnabled(): bool {
        return self::getConfig()['enabled'] && self::isConfigured();
    }

    /**
     * Build a client from an arbitrary config (settings page connection test).
     */
    public static function makeClient(array $config): S3Client {
        return new S3Client($config);
    }

    public static function forUser(?int $userId): self {
        $cacheKey = $userId === null ? 'anon' : (string)$userId;
        if (!isset(self::$instances[$cacheKey])) {
            self::$instances[$cacheKey] = new self($userId);
        }
        return self::$instances[$cacheKey];
    }

    /**
     * Storage for the active user, resolved the same way as getDataPath():
     * public share requests are routed to the share owner's data.
     */
    public static function current(): self {
        global $activeUserId, $forcePublicTokenRouting;
        $userId = !empty($forcePublicTokenRouting)
            ? $activeUserId
            : ($_SESSION['user_id'] ?? $activeUserId ?? null);
        return self::forUser($userId !== null ? (int)$userId : null);
    }

    public function isRemote(): bool {
        return $this->userId !== null && self::isEnabled();
    }

    private function client(): S3Client {
        if ($this->client === null) {
            $this->client = new S3Client(self::getConfig());
        }
        return $this->client;
    }

    /**
     * Bucket key for one of this user's attachments.
     */
    public function key(string $filename): string {
        return 'attachments/' . (int)$this->userId . '/' . basename($filename);
    }

    public static function keyPrefixForUser(int $userId): string {
        return 'attachments/' . $userId . '/';
    }

    private function localDir(): string {
        if ($this->userId !== null) {
            require_once __DIR__ . '/../users/UserDataManager.php';
            $dataManager = new UserDataManager($this->userId);
            return $dataManager->getUserAttachmentsPath();
        }
        return dirname(__DIR__) . '/data/attachments';
    }

    // ------------------------------------------------------------------
    // Read/write primitives
    // ------------------------------------------------------------------

    /**
     * Store a file that already exists on disk (uploaded temp file, extracted
     * archive member, generated file). Returns true on success.
     */
    public function storeFile(string $sourcePath, string $filename, string $contentType = 'application/octet-stream', bool $isUploadedFile = false): bool {
        if ($this->isRemote()) {
            try {
                $this->client()->putObject($this->key($filename), $sourcePath, $contentType);
                return true;
            } catch (Exception $e) {
                error_log('S3 attachment upload failed: ' . $e->getMessage());
                return false;
            }
        }

        $destination = $this->localDir() . '/' . basename($filename);
        // copy (not rename) for regular files: the source may be another
        // attachment being duplicated, and must survive
        $moved = $isUploadedFile
            ? move_uploaded_file($sourcePath, $destination)
            : @copy($sourcePath, $destination);
        if ($moved) {
            @chmod($destination, 0644);
        }
        return (bool)$moved;
    }

    public function storeContent(string $content, string $filename, string $contentType = 'application/octet-stream'): bool {
        if ($this->isRemote()) {
            try {
                $this->client()->putObjectContent($this->key($filename), $content, $contentType);
                return true;
            } catch (Exception $e) {
                error_log('S3 attachment upload failed: ' . $e->getMessage());
                return false;
            }
        }

        $destination = $this->localDir() . '/' . basename($filename);
        if (file_put_contents($destination, $content) === false) {
            return false;
        }
        @chmod($destination, 0644);
        return true;
    }

    public function delete(string $filename): bool {
        if ($this->isRemote()) {
            try {
                $this->client()->deleteObject($this->key($filename));
            } catch (Exception $e) {
                error_log('S3 attachment delete failed: ' . $e->getMessage());
            }
        }

        // Always clear a leftover local copy too: files uploaded before the
        // switch to S3 (or not yet migrated) must not linger on disk.
        $localPath = $this->localDir() . '/' . basename($filename);
        if (file_exists($localPath)) {
            return @unlink($localPath);
        }
        return true;
    }

    public function exists(string $filename): bool {
        // Local first: cheap, and a not-yet-migrated file must stay served
        // even when the bucket is unreachable
        if (file_exists($this->localDir() . '/' . basename($filename))) {
            return true;
        }
        if (!$this->isRemote()) {
            return false;
        }
        try {
            return $this->client()->headObject($this->key($filename)) !== null;
        } catch (Exception $e) {
            error_log('S3 attachment head failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * A readable local path for the attachment, or null when unavailable.
     * In remote mode this downloads to a per-request temp file (cleaned up at
     * shutdown); exports and previews keep working unchanged on the result.
     */
    public function localFile(string $filename): ?string {
        $localPath = $this->localDir() . '/' . basename($filename);
        if (file_exists($localPath) && is_readable($localPath)) {
            return $localPath;
        }

        if (!$this->isRemote()) {
            return null;
        }

        $key = $this->key($filename);
        if (isset(self::$tempFiles[$key]) && file_exists(self::$tempFiles[$key])) {
            return self::$tempFiles[$key];
        }

        $tempPath = tempnam(sys_get_temp_dir(), 'pozatt_');
        if ($tempPath === false) {
            return null;
        }

        try {
            $this->client()->getObjectToFile($key, $tempPath);
        } catch (Exception $e) {
            @unlink($tempPath);
            if (!($e instanceof S3StorageException) || $e->getCode() !== 404) {
                error_log('S3 attachment download failed: ' . $e->getMessage());
            }
            return null;
        }

        self::$tempFiles[$key] = $tempPath;
        if (!self::$shutdownRegistered) {
            self::$shutdownRegistered = true;
            register_shutdown_function(function () {
                foreach (self::$tempFiles as $path) {
                    @unlink($path);
                }
            });
        }
        return $tempPath;
    }

    /**
     * A readable local path only when the file is on disk; bucket-stored
     * files return null. Backup zips use this so S3 attachments stay out of
     * the archives (the dedicated attachments export still fetches them).
     */
    public function localFileIfOnDisk(string $filename): ?string {
        $localPath = $this->localDir() . '/' . basename($filename);
        return (file_exists($localPath) && is_readable($localPath)) ? $localPath : null;
    }

    /**
     * Stream the attachment body to the output. Returns false when absent.
     * In remote mode a local leftover copy still wins: it serves not-yet
     * migrated files without a network round-trip.
     */
    public function stream(string $filename): bool {
        $localPath = $this->localDir() . '/' . basename($filename);
        if (file_exists($localPath) && is_readable($localPath)) {
            readfile($localPath);
            return true;
        }

        if (!$this->isRemote()) {
            return false;
        }

        try {
            $this->client()->streamObject($this->key($filename));
            return true;
        } catch (Exception $e) {
            error_log('S3 attachment stream failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Size and mtime for HTTP caching. Falls back to the DB metadata carried
     * in the attachment array so no HEAD request is needed on the hot path.
     */
    public function statForHeaders(array $attachment): array {
        $filename = (string)($attachment['filename'] ?? '');
        $localPath = $this->localDir() . '/' . basename($filename);
        if ($filename !== '' && file_exists($localPath)) {
            return [
                'size' => (int)(@filesize($localPath) ?: 0),
                'mtime' => (int)(@filemtime($localPath) ?: time()),
            ];
        }

        return [
            'size' => (int)($attachment['file_size'] ?? 0),
            'mtime' => isset($attachment['uploaded_at']) ? (strtotime((string)$attachment['uploaded_at']) ?: time()) : time(),
        ];
    }

    /**
     * Remove every remote object belonging to this user (full restore wipe).
     */
    public function deleteAllRemote(): int {
        if (!$this->isRemote()) {
            return 0;
        }
        return self::purgeUserObjects((int)$this->userId)['deleted'];
    }

    /**
     * Remove every remote attachment of one user, reporting failures.
     *
     * Used on every account deletion: the caller shows the outcome to a
     * human, so a bucket error must surface instead of being logged and
     * swallowed. Gated on isConfigured() only, not isEnabled(): objects
     * uploaded while S3 storage was on must still be removable after the
     * instance has been switched back to local storage.
     *
     * @return array ['deleted' => int, 'error' => ?string]
     */
    public static function purgeUserObjects(int $userId): array {
        if (!self::isConfigured()) {
            return ['deleted' => 0, 'error' => null];
        }

        $deleted = 0;
        try {
            self::makeClient(self::getConfig())->deletePrefix(self::keyPrefixForUser($userId), $deleted);
        } catch (Exception $e) {
            error_log('S3 attachment purge failed for user ' . $userId . ': ' . $e->getMessage());
            return ['deleted' => $deleted, 'error' => $e->getMessage()];
        }
        return ['deleted' => $deleted, 'error' => null];
    }

    /**
     * @return array List of ['key' => ..., 'size' => ..., 'filename' => ...]
     */
    public function listRemote(): array {
        if ($this->userId === null || !self::isEnabled()) {
            return [];
        }
        $prefix = self::keyPrefixForUser((int)$this->userId);
        $objects = $this->client()->listObjects($prefix);
        foreach ($objects as &$object) {
            $object['filename'] = substr($object['key'], strlen($prefix));
        }
        unset($object);
        return $objects;
    }
}
