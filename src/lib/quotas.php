<?php
/**
 * Per-user storage and note quotas, and the notice sent when one is reached.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * Total bytes of the attachments recorded in the active user's database.
 * Used for quotas and stats in S3 mode, where nothing is on disk to scan.
 */
function poznoteSumDbAttachmentBytes(): int {
    global $con;
    if (!isset($con)) {
        return 0;
    }
    $total = 0;
    try {
        $stmt = $con->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach (poznoteDecodeAttachments($row['attachments'] ?? '') as $attachment) {
                $total += max(0, (int)($attachment['file_size'] ?? 0));
            }
        }
    } catch (Exception $e) {
        // Stats/quota input only: never break the caller
        error_log('functions: poznoteSumDbAttachmentBytes() failed: ' . $e->getMessage());
    }
    return $total;
}

/**
 * Per-user quota limits: the administrator's global settings, overridden by
 * the active user's per-user values when set (admin storage-stats page).
 * 0 means no limit.
 * @return array Keys: max_notes (int), max_storage_bytes (int),
 *               max_storage_s3_bytes (int), max_backups_s3_bytes (int)
 */
function poznoteGetUserQuotaLimits(): array {
    static $limits = null;
    if ($limits !== null) {
        return $limits;
    }

    global $activeUserId;
    $limits = ['max_notes' => 0, 'max_storage_bytes' => 0, 'max_storage_s3_bytes' => 0, 'max_backups_s3_bytes' => 0];
    try {
        require_once __DIR__ . '/../users/db_master.php';
        if (function_exists('getGlobalSetting')) {
            $limits['max_notes'] = max(0, (int) getGlobalSetting('user_max_notes', '0'));
            $limits['max_storage_bytes'] = max(0, (int) getGlobalSetting('user_max_storage_mb', '0')) * 1024 * 1024;
            $limits['max_storage_s3_bytes'] = max(0, (int) getGlobalSetting('user_max_storage_s3_mb', '0')) * 1024 * 1024;
            $limits['max_backups_s3_bytes'] = max(0, (int) getGlobalSetting('user_max_backups_s3_mb', '0')) * 1024 * 1024;
        }

        $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
        if ($userId > 0 && function_exists('getUserQuotaOverrides')) {
            $overrides = getUserQuotaOverrides($userId);
            if ($overrides['max_notes'] !== null) {
                $limits['max_notes'] = max(0, (int) $overrides['max_notes']);
            }
            if ($overrides['max_storage_mb'] !== null) {
                $limits['max_storage_bytes'] = max(0, (int) $overrides['max_storage_mb']) * 1024 * 1024;
            }
            if ($overrides['max_storage_s3_mb'] !== null) {
                $limits['max_storage_s3_bytes'] = max(0, (int) $overrides['max_storage_s3_mb']) * 1024 * 1024;
            }
            if ($overrides['max_backups_s3_mb'] !== null) {
                $limits['max_backups_s3_bytes'] = max(0, (int) $overrides['max_backups_s3_mb']) * 1024 * 1024;
            }
        }
    } catch (Exception $e) {
        // Master database unavailable: fail open, quotas are an admin comfort
        // feature and must never take the app down.
        error_log('functions: poznoteGetUserQuotaLimits() failed: ' . $e->getMessage());
    }
    return $limits;
}

/**
 * True when S3 backups are switched on and their bucket is configured.
 *
 * Mirrors S3BackupService::isEnabled() from the global settings alone, for
 * callers that only need the visibility flag: loading the service pulls in the
 * complete backup ZIP builder, too heavy for a page that merely shows or hides
 * a field. Keep both in sync.
 */
function poznoteS3BackupConfigured(): bool {
    try {
        require_once __DIR__ . '/../users/db_master.php';
        if (!function_exists('getGlobalSetting') || getGlobalSetting('s3_backup_enabled', '1') !== '1') {
            return false;
        }
        foreach (['s3_backup_endpoint', 's3_backup_bucket', 's3_backup_access_key', 's3_backup_secret_key'] as $key) {
            if ((string) getGlobalSetting($key, '') === '') {
                return false;
            }
        }
        return true;
    } catch (Exception $e) {
        // Visibility check only: hide the feature rather than break the page
        return false;
    }
}

/**
 * Quotas restrict regular users; administrators are exempt.
 */
function poznoteUserQuotasApply(): bool {
    return !(function_exists('isCurrentUserAdmin') && isCurrentUserAdmin());
}

/**
 * Disk usage of the active account, same perimeter as the admin storage-stats
 * page: database + note files + attachments. Backups are excluded.
 * Cached per request; pass $addBytes to keep the cache accurate after a write.
 */
function poznoteGetActiveUserStorageUsageBytes(int $addBytes = 0): int {
    global $poznoteQuotaUsageCache, $activeUserId;

    if (isset($poznoteQuotaUsageCache)) {
        $poznoteQuotaUsageCache += max(0, $addBytes);
        return $poznoteQuotaUsageCache;
    }

    $poznoteQuotaUsageCache = 0;
    $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
    if ($userId <= 0) {
        return $poznoteQuotaUsageCache;
    }

    require_once __DIR__ . '/../users/UserDataManager.php';
    $dataManager = new UserDataManager($userId);
    $dirs = [
        dirname($dataManager->getUserDatabasePath()),
        $dataManager->getUserEntriesPath(),
        $dataManager->getUserAttachmentsPath(),
    ];
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)
            );
            foreach ($it as $file) {
                if ($file->isFile()) {
                    $poznoteQuotaUsageCache += $file->getSize();
                }
            }
        } catch (Exception $e) {
            // Unreadable directory: count as 0
            error_log('functions: poznoteGetActiveUserStorageUsageBytes() failed: ' . $e->getMessage());
        }
    }

    $poznoteQuotaUsageCache += max(0, $addBytes);
    return $poznoteQuotaUsageCache;
}

/**
 * Bytes of the active user's attachments stored in the S3 bucket: the sizes
 * recorded in the database for files that are not on the local disk (those
 * still on disk belong to the local storage perimeter above).
 * Cached per request; pass $addBytes to keep the cache accurate after a write.
 */
function poznoteGetActiveUserS3UsageBytes(int $addBytes = 0): int {
    global $poznoteQuotaS3UsageCache;

    if (isset($poznoteQuotaS3UsageCache)) {
        $poznoteQuotaS3UsageCache += max(0, $addBytes);
        return $poznoteQuotaS3UsageCache;
    }

    $poznoteQuotaS3UsageCache = 0;
    global $con;
    if (!isset($con) || !poznoteAttachmentsAreRemote()) {
        return $poznoteQuotaS3UsageCache;
    }

    $attachmentsPath = getAttachmentsPath();
    try {
        $stmt = $con->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach (poznoteDecodeAttachments($row['attachments'] ?? '') as $attachment) {
                $filename = (string)($attachment['filename'] ?? '');
                if ($filename === '' || file_exists($attachmentsPath . '/' . basename($filename))) {
                    continue;
                }
                $poznoteQuotaS3UsageCache += max(0, (int)($attachment['file_size'] ?? 0));
            }
        }
    } catch (Exception $e) {
        // Quota input only: never break the caller
        error_log('functions: poznoteGetActiveUserS3UsageBytes() failed: ' . $e->getMessage());
    }

    $poznoteQuotaS3UsageCache += max(0, $addBytes);
    return $poznoteQuotaS3UsageCache;
}

/**
 * Best-effort quota.* webhook when an action is refused by a quota, so the
 * operator learns which users are blocked. Throttled to one delivery per
 * user, event and hour: a blocked autosave or bulk import retries the same
 * refused action many times in a row. Must never break the caller.
 */
function poznoteNotifyQuotaReached(string $event, array $quota): void {
    global $activeUserId;
    static $sentThisRequest = [];

    $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
    if ($userId <= 0 || isset($sentThisRequest[$event])) {
        return;
    }
    $sentThisRequest[$event] = true;

    try {
        require_once __DIR__ . '/../users/db_master.php';
        if (empty(listActiveWebhooksForEvent($event))) {
            return;
        }

        $throttleKey = 'webhook_last_' . str_replace('.', '_', $event) . '_user_' . $userId;
        if (time() - (int) getGlobalSetting($throttleKey, '0') < 3600) {
            return;
        }
        setGlobalSetting($throttleKey, (string) time());

        require_once __DIR__ . '/../WebhookDispatcher.php';
        (new WebhookDispatcher())->dispatchQuotaReached($event, $userId, $quota);
    } catch (Throwable $e) {
        error_log('Webhook dispatch failed for ' . $event . ': ' . $e->getMessage());
    }
}

/**
 * Check the per-user note count limit before creating $newNotes more notes.
 * Trashed notes count too: they still exist and can be restored.
 * @return string|null A user-facing error message, or null when allowed.
 */
function poznoteCheckNoteQuota(PDO $con, int $newNotes = 1): ?string {
    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_notes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }

    try {
        $count = (int) $con->query('SELECT COUNT(*) FROM entries')->fetchColumn();
    } catch (Exception $e) {
        return null;
    }

    if ($count + $newNotes > $limits['max_notes']) {
        poznoteNotifyQuotaReached('quota.notes_reached', [
            'max_notes' => $limits['max_notes'],
            'note_count' => $count,
        ]);
        return t('api.errors.note_quota_reached', ['max' => $limits['max_notes']],
            'Note limit reached: this instance allows at most ' . $limits['max_notes'] . ' notes for this user (trash included).');
    }
    return null;
}

/**
 * Check the per-user storage limit before writing $additionalBytes more bytes.
 * Negative deltas (content shrinking) are always allowed so a user over quota
 * can still edit notes to free space.
 * @return string|null A user-facing error message, or null when allowed.
 */
function poznoteCheckStorageQuota(int $additionalBytes = 0): ?string {
    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_storage_bytes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }
    if ($additionalBytes <= 0) {
        return null;
    }

    if (poznoteGetActiveUserStorageUsageBytes() + $additionalBytes > $limits['max_storage_bytes']) {
        $maxMb = (int) round($limits['max_storage_bytes'] / (1024 * 1024));
        poznoteNotifyQuotaReached('quota.storage_reached', [
            'max_storage_bytes' => $limits['max_storage_bytes'],
            'used_bytes' => poznoteGetActiveUserStorageUsageBytes(),
            'requested_bytes' => $additionalBytes,
        ]);
        return t('api.errors.storage_quota_reached', ['max' => $maxMb],
            'Storage limit reached: this instance allows at most ' . $maxMb . ' MB of storage for this user.');
    }
    return null;
}

/**
 * Quota check for an attachment upload. Attachments count against the S3
 * quota when they are stored in the bucket, against the local storage quota
 * otherwise. Returns an error message, or null when the upload is allowed.
 */
function poznoteCheckAttachmentStorageQuota(int $additionalBytes = 0): ?string {
    if (!poznoteAttachmentsAreRemote()) {
        return poznoteCheckStorageQuota($additionalBytes);
    }

    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_storage_s3_bytes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }
    if ($additionalBytes <= 0) {
        return null;
    }

    if (poznoteGetActiveUserS3UsageBytes() + $additionalBytes > $limits['max_storage_s3_bytes']) {
        $maxMb = (int) round($limits['max_storage_s3_bytes'] / (1024 * 1024));
        poznoteNotifyQuotaReached('quota.storage_reached', [
            'pool' => 's3',
            'max_storage_bytes' => $limits['max_storage_s3_bytes'],
            'used_bytes' => poznoteGetActiveUserS3UsageBytes(),
            'requested_bytes' => $additionalBytes,
        ]);
        return t('api.errors.storage_s3_quota_reached', ['max' => $maxMb],
            'S3 storage limit reached: this instance allows at most ' . $maxMb . ' MB of S3 storage for this user.');
    }
    return null;
}
