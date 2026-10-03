<?php
/**
 * Snapshots Controller for Poznote REST API v1
 * 
 * Manages the snapshots of note content, title and tags.
 * An automatic snapshot is taken right before a change to a note is saved,
 * at most every POZNOTE_SNAPSHOTS_AUTO_INTERVAL_SECONDS (createAutomaticSnapshot,
 * called through poznoteCreateAutomaticSnapshot() by everything that writes
 * a note). They are all kept for POZNOTE_SNAPSHOTS_DENSE_HOURS, then one per
 * day for getSnapshotsKeepCount() days (user setting snapshots_keep_count).
 * Users add manual snapshots, which are not limited. A manual snapshot is
 * also taken, tagged with its origin, right before the AI assistant or the
 * MCP server rewrites a note (see createSafetySnapshot);
 * getSafetySnapshotsKeepCount() of those are kept per note (user setting
 * snapshots_safety_keep_count, 20 by default). Every snapshot expires after
 * POZNOTE_SNAPSHOTS_MAX_AGE_DAYS. The interface calls them revisions
 * (revisions.php); the API, the storage and the MCP tools keep the snapshot
 * name. Earlier versions took one automatic snapshot per day, when a note
 * was first opened: POST /notes/{id}/snapshot without ?manual still does.
 * Attachments and images removed from a note stay on disk while a snapshot
 * references them (see poznotePruneSnapshotOnlyAttachments), so an older
 * state can be restored.
 */

class SnapshotsController {
    /**
     * Origins of the safety snapshots, taken by Poznote itself right before
     * an automated writer replaces the content of a note: the AI assistant
     * or the MCP server. They share the snapshots_safety_keep_count cap.
     */
    private const SAFETY_ORIGINS = ['ai', 'mcp'];

    private PDO $con;
    private int $maxSnapshots;
    private int $maxSafetySnapshots;

    public function __construct(PDO $con) {
        $this->con = $con;
        $this->maxSnapshots = getSnapshotsKeepCount();
        $this->maxSafetySnapshots = getSafetySnapshotsKeepCount();
    }
    
    /**
     * Get the snapshots directory path for the current user
     */
    private function getSnapshotsPath(): string {
        // getEntriesPath() returns e.g. data/users/{id}/entries
        // We want data/users/{id}/snapshots — go up one level from entries
        $entriesPath = getEntriesPath();
        return dirname($entriesPath) . '/snapshots';
    }
    
    /**
     * Expire snapshots older than POZNOTE_SNAPSHOTS_MAX_AGE_DAYS, thin the
     * automatic ones (see thinAutomaticSnapshots), and purge the safety
     * snapshots (taken before an AI or MCP edit) beyond the newest
     * $maxSafetySnapshots. User-made manual snapshots only expire and do not
     * count toward either limit.
     */
    private function purgeOldSnapshots(string $noteSnapshotDir): void {
        poznoteExpireNoteSnapshots($this->con, (int) basename($noteSnapshotDir));

        if (!is_dir($noteSnapshotDir)) return;

        $this->normalizeMalformedSnapshotFiles($noteSnapshotDir);

        $files = scandir($noteSnapshotDir);
        if ($files === false) return;

        $snapshots = [];
        $safetySnapshots = [];

        foreach ($files as $file) {
            if ($file === '.' || $file === '..') continue;

            $parsed = $this->parseSnapshotFilename($file);
            if ($parsed === null) {
                continue;
            }

            $snapshotFile = $noteSnapshotDir . '/' . $file;
            if (!is_file($snapshotFile)) {
                continue;
            }

            $paths = $this->getSnapshotPaths($noteSnapshotDir, $parsed['key'], $parsed['extension']);
            $meta = $this->readSnapshotMeta($paths['meta']);

            $record = [
                'key' => $parsed['key'],
                'snapshot_file' => $snapshotFile,
                'meta_file' => $paths['meta'],
                'created_at_raw' => (string) ($meta['created_at'] ?? ''),
                'date' => $parsed['date']
            ];

            if ((bool) ($meta['manual'] ?? $parsed['manual'])) {
                if (in_array((string) ($meta['origin'] ?? ''), self::SAFETY_ORIGINS, true)) {
                    $safetySnapshots[] = $record;
                }
                continue;
            }

            $snapshots[] = $record;
        }

        $removed = $this->thinAutomaticSnapshots($snapshots)
            + $this->deleteBeyondNewest($safetySnapshots, $this->maxSafetySnapshots);
        if ($removed === 0) {
            return;
        }

        poznotePruneSnapshotOnlyAttachments($this->con, (int) basename($noteSnapshotDir));
    }

    /**
     * Thin the automatic snapshots of a note the way a history is read: every
     * one of the last POZNOTE_SNAPSHOTS_DENSE_HOURS stays (the recent work,
     * one every ten minutes at most), then only the newest of each day, for
     * the $maxSnapshots most recent of those days. The daily snapshots taken
     * on first open by earlier versions are automatic ones and follow the
     * same rule. Returns the number of snapshots removed.
     */
    private function thinAutomaticSnapshots(array $snapshots): int {
        $cutoff = time() - POZNOTE_SNAPSHOTS_DENSE_HOURS * 3600;
        $older = [];

        foreach ($snapshots as $snapshot) {
            $createdAt = trim((string) ($snapshot['created_at_raw'] ?? ''));
            $timestamp = $createdAt !== '' ? strtotime($createdAt . ' UTC') : false;
            if ($timestamp === false) {
                $timestamp = strtotime((string) $snapshot['date'] . ' UTC');
            }
            if ($timestamp !== false && $timestamp >= $cutoff) {
                continue;
            }
            $snapshot['timestamp'] = (int) $timestamp;
            $older[] = $snapshot;
        }

        usort($older, static function (array $a, array $b): int {
            return [$b['timestamp'], (string) $b['key']] <=> [$a['timestamp'], (string) $a['key']];
        });

        $keptDays = [];
        $removed = 0;
        foreach ($older as $snapshot) {
            $day = (string) $snapshot['date'];
            if (!isset($keptDays[$day]) && count($keptDays) < $this->maxSnapshots) {
                $keptDays[$day] = true;
                continue;
            }
            @unlink((string) $snapshot['snapshot_file']);
            @unlink((string) $snapshot['meta_file']);
            $removed++;
        }

        return $removed;
    }

    /**
     * Delete every snapshot of the list but the $keep newest ones. Returns
     * the number of snapshots removed.
     */
    private function deleteBeyondNewest(array $snapshots, int $keep): int {
        if (count($snapshots) <= $keep) {
            return 0;
        }

        usort($snapshots, function (array $a, array $b): int {
            $sortA = trim((string) ($a['created_at_raw'] ?? ''));
            $sortB = trim((string) ($b['created_at_raw'] ?? ''));

            if ($sortA !== '' || $sortB !== '') {
                $createdCompare = strcmp($sortB, $sortA);
                if ($createdCompare !== 0) {
                    return $createdCompare;
                }
            }

            $dateCompare = strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? ''));
            if ($dateCompare !== 0) {
                return $dateCompare;
            }

            return strcmp((string) ($b['key'] ?? ''), (string) ($a['key'] ?? ''));
        });

        $removed = 0;
        foreach (array_slice($snapshots, $keep) as $snapshot) {
            @unlink((string) $snapshot['snapshot_file']);
            @unlink((string) $snapshot['meta_file']);
            $removed++;
        }

        return $removed;
    }

    /**
     * Get the current snapshot date in the user's configured timezone.
     */
    private function getSnapshotDateForUser(int $relativeDays = 0): string {
        try {
            $now = new DateTimeImmutable('now', new DateTimeZone(getUserTimezone()));
        } catch (Exception $e) {
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        }

        if ($relativeDays !== 0) {
            $modifier = ($relativeDays > 0 ? '+' : '') . $relativeDays . ' days';
            $now = $now->modify($modifier);
        }

        return $now->format('Y-m-d');
    }

    /**
     * Format a stored UTC snapshot timestamp for the user's timezone.
     */
    private function formatSnapshotCreatedAt(string $createdAt): string {
        $createdAt = trim($createdAt);
        if ($createdAt === '') {
            return '';
        }

        return convertUtcToUserTimezone($createdAt);
    }

    /**
     * Convert a stored UTC snapshot timestamp to the user's local day.
     */
    private function getUserDateFromSnapshotTimestamp(string $createdAt): string {
        $createdAt = trim($createdAt);
        if ($createdAt === '') {
            return '';
        }

        try {
            $date = new DateTimeImmutable($createdAt, new DateTimeZone('UTC'));
            return $date->setTimezone(new DateTimeZone(getUserTimezone()))->format('Y-m-d');
        } catch (Exception $e) {
            return '';
        }
    }

    /**
     * Determine whether a stored UTC datetime belongs to the current user-local day.
     */
    private function isCreatedTodayForUser(?string $createdAt): bool {
        $createdDate = $this->getUserDateFromSnapshotTimestamp((string) $createdAt);

        return $createdDate !== '' && $createdDate === $this->getSnapshotDateForUser();
    }

    private function isSnapshotContentEmpty(string $content, string $noteType): bool {
        $content = trim($content);
        if ($content === '') {
            return true;
        }

        if ($noteType === 'markdown') {
            return false;
        }

        if ($noteType === 'tasklist') {
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                foreach ($decoded as $task) {
                    if (is_array($task)) {
                        foreach (['text', 'content', 'title', 'label'] as $field) {
                            if (trim((string) ($task[$field] ?? '')) !== '') {
                                return false;
                            }
                        }
                    } elseif (trim((string) $task) !== '') {
                        return false;
                    }
                }

                return true;
            }
        }

        if (preg_match('/<(img|svg|canvas|video|audio|iframe|object|embed|table|ul|ol|li|input)\b/i', $content)) {
            return false;
        }

        $text = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/[\s\x{00A0}]+/u', '', $text);

        return $text === '';
    }

    private function getCurrentNoteContent(array $note): string {
        $noteType = $note['type'] ?? 'note';
        $entriesPath = getEntriesPath();
        $noteExtension = ($noteType === 'markdown') ? '.md' : '.html';
        $noteFile = $entriesPath . '/' . (int) ($note['id'] ?? 0) . $noteExtension;

        $content = '';
        if (file_exists($noteFile) && is_readable($noteFile)) {
            $content = file_get_contents($noteFile);
            if ($content === false) {
                $content = '';
            }
        }

        if ($content === '' && !empty($note['entry'])) {
            $content = $note['entry'];
        }

        if ($noteType === 'tasklist') {
            $content = resolveTasklistStoredContent($content, $note['entry'] ?? '');
        }

        return $content;
    }

    /**
     * Snapshot content as the show endpoint serves it, so a hash taken here
     * compares with the current note's.
     */
    private function normalizeSnapshotContent(string $content, string $noteType): string {
        if ($noteType === 'tasklist') {
            return resolveTasklistStoredContent($content, $content);
        }

        return $content;
    }

    /**
     * Tags as one canonical string (trimmed, no empty entry, ", " between
     * them as NotesController::sanitizeTags stores them), so two snapshots
     * compare whatever the stored spacing.
     */
    private function normalizeTags(string $tags): string {
        $list = array_filter(array_map('trim', explode(',', $tags)), static function (string $tag): bool {
            return $tag !== '';
        });

        return implode(', ', $list);
    }

    private function shouldSkipAutomaticSnapshotForEmptyNewNote(array $note, string $content): bool {
        $noteType = $note['type'] ?? 'note';

        return $this->isCreatedTodayForUser($note['created'] ?? '')
            && $this->isSnapshotContentEmpty($content, $noteType);
    }

    /**
     * Read snapshot metadata if present.
     */
    private function readSnapshotMeta(string $metaFile): array {
        if (!is_file($metaFile) || !is_readable($metaFile)) {
            return [];
        }

        $metaContent = file_get_contents($metaFile);
        if ($metaContent === false) {
            return [];
        }

        return json_decode($metaContent, true) ?: [];
    }

    /**
     * Validate a snapshot key from the request.
     */
    private function isValidSnapshotKey(string $snapshotKey): bool {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}(?:--[A-Za-z0-9_-]+)?$/', $snapshotKey);
    }

    /**
     * Normalize a snapshot file extension with or without a leading dot.
     */
    private function normalizeSnapshotExtension(string $extension): string {
        return ltrim($extension, '.');
    }

    /**
     * Parse a snapshot filename into its date/key components.
     */
    private function parseSnapshotFilename(string $file, ?string $expectedExtension = null): ?array {
        if (!preg_match('/^(\d{4}-\d{2}-\d{2})(?:--([A-Za-z0-9_-]+))?\.\.?(html|md)$/', $file, $matches)) {
            return null;
        }

        if ($expectedExtension !== null && $matches[3] !== $expectedExtension) {
            return null;
        }

        $key = $matches[1] . (!empty($matches[2]) ? '--' . $matches[2] : '');

        return [
            'date' => $matches[1],
            'key' => $key,
            'extension' => $matches[3],
            'manual' => !empty($matches[2])
        ];
    }

    /**
     * Build a unique key for an extra snapshot created manually.
     */
    private function buildManualSnapshotKey(string $date): string {
        try {
            $now = new DateTimeImmutable('now', new DateTimeZone(getUserTimezone()));
        } catch (Exception $e) {
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        }

        $suffix = $now->format('Hisv');

        try {
            $suffix .= '-' . bin2hex(random_bytes(2));
        } catch (Exception $e) {
            $suffix .= '-' . substr(str_replace('.', '', uniqid('', true)), -6);
        }

        return $date . '--' . $suffix;
    }

    /**
     * Get the data and metadata file paths for a snapshot key.
     */
    private function getSnapshotPaths(string $noteSnapshotDir, string $snapshotKey, string $extension): array {
        $normalizedExtension = $this->normalizeSnapshotExtension($extension);

        return [
            'snapshot' => $noteSnapshotDir . '/' . $snapshotKey . '.' . $normalizedExtension,
            'meta' => $noteSnapshotDir . '/' . $snapshotKey . '.meta.json'
        ];
    }

    /**
     * Rename legacy malformed snapshot files written with a double dot before the extension.
     */
    private function normalizeMalformedSnapshotFiles(string $noteSnapshotDir): void {
        if (!is_dir($noteSnapshotDir)) {
            return;
        }

        $files = scandir($noteSnapshotDir);
        if ($files === false) {
            return;
        }

        foreach ($files as $file) {
            if (!preg_match('/^(\d{4}-\d{2}-\d{2}(?:--[A-Za-z0-9_-]+)?)\.\.(html|md)$/', $file, $matches)) {
                continue;
            }

            $source = $noteSnapshotDir . '/' . $file;
            $target = $noteSnapshotDir . '/' . $matches[1] . '.' . $matches[2];

            if (!is_file($source) || is_file($target)) {
                continue;
            }

            @rename($source, $target);
        }
    }

    /**
     * Sort snapshots from newest to oldest.
     */
    private function sortSnapshotsNewestFirst(array &$snapshots): void {
        usort($snapshots, function (array $a, array $b): int {
            $sortA = trim((string) ($a['created_at_raw'] ?? ''));
            $sortB = trim((string) ($b['created_at_raw'] ?? ''));

            if ($sortA !== '' || $sortB !== '') {
                $createdCompare = strcmp($sortB, $sortA);
                if ($createdCompare !== 0) {
                    return $createdCompare;
                }
            }

            return strcmp((string) ($b['key'] ?? ''), (string) ($a['key'] ?? ''));
        });
    }

    /**
     * Collect snapshots for a note/type, including manual snapshots on the same day.
     */
    private function collectSnapshots(string $noteSnapshotDir, string $expectedExtension): array {
        $snapshots = [];

        $this->normalizeMalformedSnapshotFiles($noteSnapshotDir);

        if (!is_dir($noteSnapshotDir)) {
            return $snapshots;
        }

        $files = scandir($noteSnapshotDir);
        if ($files === false) {
            return $snapshots;
        }

        foreach ($files as $file) {
            $parsed = $this->parseSnapshotFilename($file, $expectedExtension);
            if ($parsed === null) {
                continue;
            }

            $snapshotFile = $noteSnapshotDir . '/' . $file;
            if (!is_file($snapshotFile) || !is_readable($snapshotFile)) {
                continue;
            }

            $paths = $this->getSnapshotPaths($noteSnapshotDir, $parsed['key'], $expectedExtension);
            $meta = $this->readSnapshotMeta($paths['meta']);

            $snapshots[] = [
                'key' => $parsed['key'],
                'snapshot_key' => $parsed['key'],
                'date' => $parsed['date'],
                'heading' => $meta['heading'] ?? '',
                // null: taken before tags were versioned
                'tags' => array_key_exists('tags', $meta) ? $this->normalizeTags((string) $meta['tags']) : null,
                'type' => $meta['type'] ?? 'note',
                'manual' => (bool) ($meta['manual'] ?? $parsed['manual']),
                'origin' => (string) ($meta['origin'] ?? ''),
                'created_at_raw' => (string) ($meta['created_at'] ?? ''),
                'created_at' => $this->formatSnapshotCreatedAt((string) ($meta['created_at'] ?? '')),
                'snapshot_file' => $paths['snapshot'],
                'meta_file' => $paths['meta']
            ];
        }

        $this->sortSnapshotsNewestFirst($snapshots);

        return $snapshots;
    }

    /**
     * Resolve a requested snapshot by key or by date.
     */
    private function findSnapshotRecord(string $noteSnapshotDir, string $expectedExtension, ?string $snapshotKey, ?string $date): ?array {
        $snapshots = $this->collectSnapshots($noteSnapshotDir, $expectedExtension);

        if ($snapshotKey !== null && $snapshotKey !== '') {
            foreach ($snapshots as $snapshot) {
                if (($snapshot['key'] ?? '') === $snapshotKey) {
                    return $snapshot;
                }
            }

            return null;
        }

        if ($date !== null && $date !== '') {
            foreach ($snapshots as $snapshot) {
                if (($snapshot['date'] ?? '') === $date) {
                    return $snapshot;
                }
            }
        }

        return null;
    }

    /**
     * Migrate legacy UTC-dated snapshots that belong to the same local day.
     */
    private function normalizeLegacySnapshotsForUserDate(string $noteSnapshotDir, string $extension, string $userDate): void {
        if (!is_dir($noteSnapshotDir)) {
            return;
        }

        $pattern = '/^(\d{4}-\d{2}-\d{2})' . preg_quote($extension, '/') . '$/';
        $files = scandir($noteSnapshotDir);
        if ($files === false) {
            return;
        }

        $canonicalSnapshotFile = $noteSnapshotDir . '/' . $userDate . $extension;
        $canonicalMetaFile = $noteSnapshotDir . '/' . $userDate . '.meta.json';
        $legacySnapshots = [];

        foreach ($files as $file) {
            if (!preg_match($pattern, $file, $matches)) {
                continue;
            }

            $fileDate = $matches[1];
            if ($fileDate === $userDate) {
                continue;
            }

            $metaFile = $noteSnapshotDir . '/' . $fileDate . '.meta.json';
            $meta = $this->readSnapshotMeta($metaFile);
            $effectiveDate = $this->getUserDateFromSnapshotTimestamp((string) ($meta['created_at'] ?? ''));

            if ($effectiveDate !== $userDate) {
                continue;
            }

            $legacySnapshots[] = [
                'file_date' => $fileDate,
                'snapshot_file' => $noteSnapshotDir . '/' . $file,
                'meta_file' => $metaFile,
                'meta' => $meta,
                'created_at' => (string) ($meta['created_at'] ?? '')
            ];
        }

        if (empty($legacySnapshots)) {
            return;
        }

        usort($legacySnapshots, function (array $a, array $b): int {
            $createdAtCompare = strcmp($b['created_at'], $a['created_at']);
            if ($createdAtCompare !== 0) {
                return $createdAtCompare;
            }

            return strcmp($b['file_date'], $a['file_date']);
        });

        $canonicalExists = is_file($canonicalSnapshotFile);

        if (!$canonicalExists) {
            $primary = array_shift($legacySnapshots);
            if ($primary && @rename($primary['snapshot_file'], $canonicalSnapshotFile)) {
                $canonicalExists = true;

                $meta = $primary['meta'];
                if (!empty($meta)) {
                    $meta['snapshot_date'] = $userDate;
                    file_put_contents($canonicalMetaFile, json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                } elseif (is_file($primary['meta_file']) && $primary['meta_file'] !== $canonicalMetaFile) {
                    @rename($primary['meta_file'], $canonicalMetaFile);
                }

                if ($primary['meta_file'] !== $canonicalMetaFile && is_file($primary['meta_file'])) {
                    @unlink($primary['meta_file']);
                }
            } elseif ($primary) {
                array_unshift($legacySnapshots, $primary);
            }
        }

        if (!$canonicalExists) {
            return;
        }

        foreach ($legacySnapshots as $legacy) {
            @unlink($legacy['snapshot_file']);
            if ($legacy['meta_file'] !== $canonicalMetaFile) {
                @unlink($legacy['meta_file']);
            }
        }
    }
    
    /**
     * Create a snapshot for a note and return an API-compatible result.
     */
    public function createSnapshotForNote(int $noteId, bool $manual = false, ?string $origin = null, bool $timed = false): array {
        if ($noteId <= 0) {
            return [
                'success' => false,
                'status' => 400,
                'error' => t('snapshot.api.invalid_note_id', [], 'Invalid note ID')
            ];
        }
        
        try {
            // Get note data
            $stmt = $this->con->prepare("SELECT id, heading, tags, type, entry, created FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                return [
                    'success' => false,
                    'status' => 404,
                    'error' => t('snapshot.api.note_not_found', [], 'Note not found')
                ];
            }
            
            $noteType = $note['type'] ?? 'note';
            $today = $this->getSnapshotDateForUser();
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            $extension = ($noteType === 'markdown') ? '.md' : '.html';

            $this->normalizeMalformedSnapshotFiles($noteSnapshotDir);

            $this->normalizeLegacySnapshotsForUserDate($noteSnapshotDir, $extension, $today);
            
            // Check if the automatic daily snapshot already exists for today.
            $dailyPaths = $this->getSnapshotPaths($noteSnapshotDir, $today, $extension);
            $snapshotExists = file_exists($dailyPaths['snapshot']);
            
            if ($snapshotExists && !$manual && !$timed) {
                return [
                    'success' => true,
                    'exists' => true,
                    'message' => t('snapshot.api.already_exists', [], 'Snapshot already exists for today')
                ];
            }

            // Get current note content from file
            $content = $this->getCurrentNoteContent($note);

            if (!$manual && !$timed && $this->shouldSkipAutomaticSnapshotForEmptyNewNote($note, $content)) {
                return [
                    'success' => true,
                    'skipped' => true,
                    'reason' => 'empty_new_note',
                    'empty_new_note' => true,
                    'message' => t('snapshot.api.skipped_empty_new_note', [], 'No automatic snapshot yet because this new note is empty')
                ];
            }
            
            // Create directories if needed
            if (!is_dir($noteSnapshotDir)) {
                if (!mkdir($noteSnapshotDir, 0755, true)) {
                    return [
                        'success' => false,
                        'status' => 500,
                        'error' => t('snapshot.api.create_directory_failed', [], 'Failed to create snapshot directory')
                    ];
                }
            }

            // A timed automatic snapshot gets a key of its own, like a manual
            // one: several are taken in a day. Only the legacy daily snapshot
            // is keyed by its date alone.
            $snapshotKey = ($manual || $timed) ? $this->buildManualSnapshotKey($today) : $today;
            $snapshotPaths = $this->getSnapshotPaths($noteSnapshotDir, $snapshotKey, $extension);
            
            // Also save heading metadata
            $meta = [
                'note_id' => $noteId,
                'snapshot_key' => $snapshotKey,
                'heading' => $note['heading'] ?? '',
                // Versioned with the content since the Revisions page; a
                // snapshot taken before that has no "tags" key
                'tags' => $this->normalizeTags((string) ($note['tags'] ?? '')),
                'type' => $noteType,
                'snapshot_date' => $today,
                'manual' => $manual,
                'created_at' => gmdate('Y-m-d H:i:s')
            ];
            if ($origin !== null && $origin !== '') {
                // Who asked for this manual snapshot: 'ai' (built-in assistant)
                // or 'mcp' (MCP server), taken right before they change the note
                $meta['origin'] = $origin;
            }
            
            // Write snapshot file
            if (file_put_contents($snapshotPaths['snapshot'], $content) === false) {
                return [
                    'success' => false,
                    'status' => 500,
                    'error' => t('snapshot.api.write_file_failed', [], 'Failed to write snapshot file')
                ];
            }
            
            // Write meta file
            file_put_contents($snapshotPaths['meta'], json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            
            $this->purgeOldSnapshots($noteSnapshotDir);
            
            return [
                'success' => true,
                'created' => true,
                'updated' => false,
                'date' => $today,
                'snapshot_key' => $snapshotKey,
                'manual' => $manual
            ];
            
        } catch (Exception $e) {
            error_log("Snapshot create error: " . $e->getMessage());
            return [
                'success' => false,
                'status' => 500,
                'error' => t('snapshot.api.create_failed', [], 'Failed to create snapshot')
            ];
        }
    }

    /**
     * Take a manual snapshot tagged with its origin ('ai' or 'mcp') right
     * before an automated writer replaces the content of a note, so the
     * previous version stays one click away in the Snapshots modal. At most
     * getSafetySnapshotsKeepCount() of them are kept per note (the
     * snapshots_safety_keep_count setting, 20 by default).
     * Skipped when the note is still empty, and when the newest snapshot
     * already holds the current content (the note was opened today and not
     * edited since, or the writer edits the same note repeatedly): nothing
     * would be gained by a duplicate.
     */
    public function createSafetySnapshot(int $noteId, string $origin): array {
        if ($noteId <= 0) {
            return [
                'success' => false,
                'status' => 400,
                'error' => t('snapshot.api.invalid_note_id', [], 'Invalid note ID')
            ];
        }

        try {
            $stmt = $this->con->prepare("SELECT id, heading, tags, type, entry, created FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$note) {
                return [
                    'success' => false,
                    'status' => 404,
                    'error' => t('snapshot.api.note_not_found', [], 'Note not found')
                ];
            }

            $noteType = $note['type'] ?? 'note';
            $expectedExtension = ($noteType === 'markdown') ? 'md' : 'html';
            $noteSnapshotDir = $this->getSnapshotsPath() . '/' . $noteId;
            $currentContent = $this->getCurrentNoteContent($note);
            if ($this->isSnapshotContentEmpty($currentContent, $noteType)) {
                // Nothing to protect (a note the assistant is filling in)
                return ['success' => true, 'skipped' => true, 'reason' => 'empty'];
            }

            $existing = $this->collectSnapshots($noteSnapshotDir, $expectedExtension);
            if ($existing !== [] && $this->snapshotHoldsState($existing[0], $note, $currentContent)) {
                return [
                    'success' => true,
                    'skipped' => true,
                    'reason' => 'unchanged',
                    'snapshot_key' => $existing[0]['key']
                ];
            }
        } catch (Exception $e) {
            error_log('Snapshot safety check error: ' . $e->getMessage());
        }

        return $this->createSnapshotForNote($noteId, true, $origin);
    }

    /**
     * Does a snapshot hold the note as it is now: same content, same title,
     * same tags (a snapshot taken before tags were versioned says nothing
     * about them).
     */
    private function snapshotHoldsState(array $snapshot, array $note, string $currentContent): bool {
        $content = @file_get_contents((string) $snapshot['snapshot_file']);

        return is_string($content)
            && $content === $currentContent
            && (string) $snapshot['heading'] === (string) ($note['heading'] ?? '')
            && ($snapshot['tags'] === null || $snapshot['tags'] === $this->normalizeTags((string) ($note['tags'] ?? '')));
    }

    /**
     * Take the automatic snapshot of a note right before a change to it is
     * saved. It holds the note as it was until that change, so the state a
     * note was left in is always caught by the next edit, however much later.
     * Skipped while the newest snapshot of the note, whatever its kind, is
     * younger than POZNOTE_SNAPSHOTS_AUTO_INTERVAL_SECONDS (an editing
     * session saves every few seconds), when the note is still empty, and
     * when the newest snapshot already holds this state.
     */
    public function createAutomaticSnapshot(int $noteId): array {
        if ($noteId <= 0) {
            return ['success' => false, 'status' => 400, 'error' => t('snapshot.api.invalid_note_id', [], 'Invalid note ID')];
        }

        $noteSnapshotDir = $this->getSnapshotsPath() . '/' . $noteId;

        // The usual answer, from one directory listing: too soon
        if (is_dir($noteSnapshotDir)) {
            $newest = 0;
            foreach (scandir($noteSnapshotDir) ?: [] as $file) {
                if ($this->parseSnapshotFilename($file) === null) {
                    continue;
                }
                $newest = max($newest, (int) @filemtime($noteSnapshotDir . '/' . $file));
            }
            if ($newest > 0 && time() - $newest < POZNOTE_SNAPSHOTS_AUTO_INTERVAL_SECONDS) {
                return ['success' => true, 'skipped' => true, 'reason' => 'too_soon'];
            }
        }

        $stmt = $this->con->prepare("SELECT id, heading, tags, type, entry, created FROM entries WHERE id = ? AND trash = 0");
        $stmt->execute([$noteId]);
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$note) {
            return ['success' => true, 'skipped' => true, 'reason' => 'not_found'];
        }

        $noteType = $note['type'] ?? 'note';
        $currentContent = $this->getCurrentNoteContent($note);
        if ($this->isSnapshotContentEmpty($currentContent, $noteType)) {
            // Nothing written yet: there is no earlier state to keep
            return ['success' => true, 'skipped' => true, 'reason' => 'empty'];
        }

        $existing = $this->collectSnapshots($noteSnapshotDir, ($noteType === 'markdown') ? 'md' : 'html');
        if ($existing !== [] && $this->snapshotHoldsState($existing[0], $note, $currentContent)) {
            // The state before this editing session is already kept. Start
            // the interval now, or the very next save, seconds away, would
            // snapshot the first keystrokes.
            @touch((string) $existing[0]['snapshot_file']);
            return ['success' => true, 'skipped' => true, 'reason' => 'unchanged', 'snapshot_key' => $existing[0]['key']];
        }

        return $this->createSnapshotForNote($noteId, false, null, true);
    }

    /**
     * POST /api/v1/notes/{id}/snapshot
      * Create a daily snapshot for a note.
      * When ?manual=1 is provided, an extra snapshot is added for today.
     */
    public function create(string $id): void {
        $noteId = (int)$id;
        $manualParam = strtolower((string) ($_GET['manual'] ?? $_GET['force'] ?? '0'));
        $manual = in_array($manualParam, ['1', 'true', 'yes'], true);

        $result = $this->createSnapshotForNote($noteId, $manual);

        if (empty($result['success'])) {
            $this->sendError((int) ($result['status'] ?? 500), (string) ($result['error'] ?? t('snapshot.api.create_failed', [], 'Failed to create snapshot')));
            return;
        }

        unset($result['status']);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    
    /**
     * GET /api/v1/notes/{id}/snapshots
    * List all available snapshots for a note (latest getSnapshotsKeepCount() automatic ones plus every manual one).
     */
    public function listSnapshots(string $id): void {
        $noteId = (int)$id;
        if ($noteId <= 0) {
            $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid note ID'));
            return;
        }
        
        try {
            $stmt = $this->con->prepare("SELECT id, heading, tags, type, entry, created FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$note) {
                $this->sendError(404, t('snapshot.api.note_not_found', [], 'Note not found'));
                return;
            }

            $noteType = $note['type'] ?? 'note';
            $expectedExtension = ($noteType === 'markdown') ? 'md' : 'html';
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            // Purge old snapshots first
            $this->purgeOldSnapshots($noteSnapshotDir);
            
            $snapshots = $this->collectSnapshots($noteSnapshotDir, $expectedExtension);
            $publicSnapshots = array_map(function (array $snapshot) use ($noteType): array {
                $content = @file_get_contents((string) $snapshot['snapshot_file']);
                $content = is_string($content) ? $this->normalizeSnapshotContent($content, $noteType) : '';

                return [
                    'snapshot_key' => $snapshot['key'],
                    'date' => $snapshot['date'],
                    'heading' => $snapshot['heading'],
                    'tags' => $snapshot['tags'],
                    'type' => $snapshot['type'],
                    'manual' => $snapshot['manual'],
                    'origin' => $snapshot['origin'],
                    'created_at' => $snapshot['created_at'],
                    // Lets a client tell identical versions apart without
                    // downloading each one (the Revisions page marks the
                    // revisions that match the current note)
                    'content_hash' => sha1($content),
                    'size' => strlen($content)
                ];
            }, $snapshots);
            $currentContent = $this->getCurrentNoteContent($note);
            $emptyNewNote = empty($publicSnapshots)
                && $this->shouldSkipAutomaticSnapshotForEmptyNewNote($note, $currentContent);
            
            echo json_encode([
                'success' => true,
                'empty_new_note' => $emptyNewNote,
                'current_hash' => sha1($this->normalizeSnapshotContent($currentContent, $noteType)),
                'current_heading' => (string) ($note['heading'] ?? ''),
                'current_tags' => $this->normalizeTags((string) ($note['tags'] ?? '')),
                'snapshots' => $publicSnapshots
            ], JSON_UNESCAPED_UNICODE);
            
        } catch (Exception $e) {
            error_log("Snapshot list error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.retrieve_failed', [], 'Failed to retrieve snapshot'));
        }
    }
    
    /**
     * GET /api/v1/notes/{id}/snapshot
    * Get a snapshot for a note. Accepts ?snapshot_key=... or ?date=YYYY-MM-DD.
     */
    public function show(string $id): void {
        $noteId = (int)$id;
        if ($noteId <= 0) {
            $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid note ID'));
            return;
        }
        
        try {
            // Get note type
            $stmt = $this->con->prepare("SELECT id, type FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, t('snapshot.api.note_not_found', [], 'Note not found'));
                return;
            }
            
            $noteType = $note['type'] ?? 'note';
            $snapshotKey = trim((string) ($_GET['snapshot_key'] ?? ''));
            $date = $_GET['date'] ?? $this->getSnapshotDateForUser();

            if ($snapshotKey !== '' && !$this->isValidSnapshotKey($snapshotKey)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid snapshot key'));
                return;
            }
            
            // Validate date format
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid date format'));
                return;
            }
            
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            $extension = ($noteType === 'markdown') ? '.md' : '.html';
            $snapshotRecord = $this->findSnapshotRecord(
                $noteSnapshotDir,
                ltrim($extension, '.'),
                $snapshotKey !== '' ? $snapshotKey : null,
                $date
            );
            
            if ($snapshotRecord === null || !file_exists((string) $snapshotRecord['snapshot_file'])) {
                echo json_encode([
                    'success' => true,
                    'exists' => false,
                    'message' => t('snapshot.api.not_found_today', [], 'No snapshot found for today'),
                    'snapshot' => null
                ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                return;
            }
            
            $content = file_get_contents((string) $snapshotRecord['snapshot_file']);
            if ($content === false) {
                $this->sendError(500, t('snapshot.api.read_failed', [], 'Failed to read snapshot'));
                return;
            }

            if ($noteType === 'tasklist') {
                $content = resolveTasklistStoredContent($content, $content);
            }
            
            $meta = $this->readSnapshotMeta((string) ($snapshotRecord['meta_file'] ?? ''));

            $snapshot = [
                'note_id' => $noteId,
                'snapshot_key' => $snapshotRecord['key'],
                'date' => $snapshotRecord['date'],
                'heading' => $meta['heading'] ?? ($snapshotRecord['heading'] ?? ''),
                'tags' => $snapshotRecord['tags'] ?? null,
                'type' => $meta['type'] ?? ($snapshotRecord['type'] ?? $noteType),
                'manual' => (bool) ($meta['manual'] ?? ($snapshotRecord['manual'] ?? false)),
                'origin' => (string) ($meta['origin'] ?? ($snapshotRecord['origin'] ?? '')),
                'content' => $content,
                'created_at' => $this->formatSnapshotCreatedAt((string) ($meta['created_at'] ?? ''))
            ];

            // ?render=1: a Markdown snapshot also comes as HTML, rendered by
            // the parser of the public pages, for the Revisions page preview
            $renderParam = strtolower((string) ($_GET['render'] ?? '0'));
            if ($noteType === 'markdown' && in_array($renderParam, ['1', 'true', 'yes'], true)) {
                require_once __DIR__ . '/../../../markdown_parser.php';
                $snapshot['html'] = parseMarkdown($content);
            }
            
            echo json_encode([
                'success' => true,
                'exists' => true,
                'snapshot' => $snapshot
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            
        } catch (Exception $e) {
            error_log("Snapshot show error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.retrieve_failed', [], 'Failed to retrieve snapshot'));
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/snapshot/restore
    * Restore a note to a snapshot state. Accepts ?snapshot_key=... or ?date=YYYY-MM-DD.
     */
    public function restore(string $id): void {
        $noteId = (int)$id;
        if ($noteId <= 0) {
            $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid note ID'));
            return;
        }
        
        try {
            // Get note data
            $stmt = $this->con->prepare("SELECT id, heading, tags, type, attachments, folder_id, workspace FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$note) {
                $this->sendError(404, t('snapshot.api.note_not_found', [], 'Note not found'));
                return;
            }

            $noteType = $note['type'] ?? 'note';
            $snapshotKey = trim((string) ($_GET['snapshot_key'] ?? ''));
            $date = $_GET['date'] ?? $this->getSnapshotDateForUser();

            if ($snapshotKey !== '' && !$this->isValidSnapshotKey($snapshotKey)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid snapshot key'));
                return;
            }

            // Validate date format
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid date format'));
                return;
            }

            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;

            $extension = ($noteType === 'markdown') ? '.md' : '.html';
            $snapshotRecord = $this->findSnapshotRecord(
                $noteSnapshotDir,
                ltrim($extension, '.'),
                $snapshotKey !== '' ? $snapshotKey : null,
                $date
            );

            if ($snapshotRecord === null || !file_exists((string) $snapshotRecord['snapshot_file'])) {
                $this->sendError(404, t('snapshot.api.not_found_today', [], 'No snapshot found for today'));
                return;
            }
            
            $snapshotContent = file_get_contents((string) $snapshotRecord['snapshot_file']);
            if ($snapshotContent === false) {
                $this->sendError(500, t('snapshot.api.read_failed', [], 'Failed to read snapshot'));
                return;
            }

            if ($noteType === 'tasklist') {
                $snapshotContent = resolveTasklistStoredContent($snapshotContent, $snapshotContent);
            }

            // Write snapshot content back to the note file
            $entriesPath = getEntriesPath();
            $noteExtension = ($noteType === 'markdown') ? '.md' : '.html';
            $noteFile = $entriesPath . '/' . $noteId . $noteExtension;
            
            // Security: validate path
            $realEntriesPath = realpath($entriesPath);
            if ($realEntriesPath === false) {
                $this->sendError(500, t('snapshot.api.invalid_entries_path', [], 'Invalid entries path'));
                return;
            }
            
            if (file_put_contents($noteFile, $snapshotContent) === false) {
                $this->sendError(500, t('snapshot.api.restore_note_file_failed', [], 'Failed to restore note file'));
                return;
            }
            
            // Also update the database entry column
            $stmt = $this->con->prepare("UPDATE entries SET entry = ?, updated = datetime('now'), updated_by_user_id = " . getWriteActorUserId() . " WHERE id = ?");
            $stmt->execute([$snapshotContent, $noteId]);

            $this->revealAttachmentsReferencedBy($noteId, $note['attachments'] ?? '', $snapshotContent);

            // ?meta=1: the title and the tags of the snapshot come back too
            $metaParam = strtolower((string) ($_GET['meta'] ?? '0'));
            $restoredMeta = in_array($metaParam, ['1', 'true', 'yes'], true)
                ? $this->restoreTitleAndTags($note, $snapshotRecord)
                : [];

            echo json_encode([
                'success' => true,
                'message' => t('snapshot.api.restore_success', [], 'Note restored to snapshot state'),
                // Present when ?meta=1 changed them
                'heading' => $restoredMeta['heading'] ?? null,
                'tags' => $restoredMeta['tags'] ?? null
            ], JSON_UNESCAPED_UNICODE);
            
        } catch (Exception $e) {
            error_log("Snapshot restore error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.restore_failed', [], 'Failed to restore snapshot'));
        }
    }
    
    /**
     * DELETE /api/v1/notes/{id}/snapshot
     * Delete one snapshot (manual or automatic). Accepts ?snapshot_key=... or ?date=YYYY-MM-DD.
     */
    public function destroy(string $id): void {
        $noteId = (int)$id;
        if ($noteId <= 0) {
            $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid note ID'));
            return;
        }

        try {
            $stmt = $this->con->prepare("SELECT id, type FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$note) {
                $this->sendError(404, t('snapshot.api.note_not_found', [], 'Note not found'));
                return;
            }

            $noteType = $note['type'] ?? 'note';
            $snapshotKey = trim((string) ($_GET['snapshot_key'] ?? ''));
            $date = trim((string) ($_GET['date'] ?? ''));

            if ($snapshotKey !== '' && !$this->isValidSnapshotKey($snapshotKey)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid snapshot key'));
                return;
            }

            if ($snapshotKey === '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid date format'));
                return;
            }

            $noteSnapshotDir = $this->getSnapshotsPath() . '/' . $noteId;
            $snapshotRecord = $this->findSnapshotRecord(
                $noteSnapshotDir,
                ($noteType === 'markdown') ? 'md' : 'html',
                $snapshotKey !== '' ? $snapshotKey : null,
                $date !== '' ? $date : null
            );

            if ($snapshotRecord === null || !is_file((string) $snapshotRecord['snapshot_file'])) {
                $this->sendError(404, t('snapshot.api.not_found', [], 'Snapshot not found'));
                return;
            }

            if (!@unlink((string) $snapshotRecord['snapshot_file'])) {
                $this->sendError(500, t('snapshot.api.delete_failed', [], 'Failed to delete snapshot'));
                return;
            }
            @unlink((string) $snapshotRecord['meta_file']);

            // Attachments this snapshot was the last to reference go with it
            poznotePruneSnapshotOnlyAttachments($this->con, $noteId);
            if (is_dir($noteSnapshotDir) && count(scandir($noteSnapshotDir) ?: []) <= 2) {
                @rmdir($noteSnapshotDir);
            }

            echo json_encode([
                'success' => true,
                'snapshot_key' => $snapshotRecord['key'],
                'message' => t('snapshot.api.deleted', [], 'Snapshot deleted')
            ], JSON_UNESCAPED_UNICODE);

        } catch (Exception $e) {
            error_log("Snapshot delete error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.delete_failed', [], 'Failed to delete snapshot'));
        }
    }

    /**
     * Give a note back the title and the tags a snapshot recorded. The title
     * follows the rules of a rename (NotesController::update): unique among
     * the notes of its folder, and carried over to the shortcuts that point
     * at the note. A snapshot without tags (taken before they were
     * versioned) leaves the note's tags alone. Returns what changed.
     */
    private function restoreTitleAndTags(array $note, array $snapshotRecord): array {
        $noteId = (int) $note['id'];
        $changed = [];

        $heading = trim((string) ($snapshotRecord['heading'] ?? ''));
        if ($heading !== '' && $heading !== (string) ($note['heading'] ?? '')) {
            $folderId = $note['folder_id'] !== null ? (int) $note['folder_id'] : null;
            $workspace = (string) ($note['workspace'] ?? '');

            $query = 'SELECT id FROM entries WHERE heading = ? AND trash = 0 AND id != ?';
            $params = [$heading, $noteId];
            if ($folderId !== null) {
                $query .= ' AND folder_id = ?';
                $params[] = $folderId;
            } else {
                $query .= ' AND folder_id IS NULL';
            }
            if ($workspace !== '') {
                $query .= ' AND workspace = ?';
                $params[] = $workspace;
            }
            $check = $this->con->prepare($query);
            $check->execute($params);
            if ($check->fetchColumn()) {
                $heading = generateUniqueTitle($heading, $noteId, $workspace !== '' ? $workspace : null, $folderId);
            }

            $stmt = $this->con->prepare('UPDATE entries SET heading = ? WHERE id = ?');
            $stmt->execute([$heading, $noteId]);
            $stmt = $this->con->prepare("UPDATE entries SET heading = ?, updated = datetime('now'), updated_by_user_id = " . getWriteActorUserId() . ' WHERE linked_note_id = ? AND trash = 0');
            $stmt->execute([$heading, $noteId]);
            $changed['heading'] = $heading;
        }

        $tags = $snapshotRecord['tags'] ?? null;
        if ($tags !== null && $tags !== $this->normalizeTags((string) ($note['tags'] ?? ''))) {
            $stmt = $this->con->prepare('UPDATE entries SET tags = ? WHERE id = ?');
            $stmt->execute([$tags, $noteId]);
            $changed['tags'] = $tags;
        }

        return $changed;
    }

    /**
     * Attachments that were removed from the note but kept for its snapshots
     * become regular attachments again once the restored content uses them.
     */
    private function revealAttachmentsReferencedBy(int $noteId, $attachmentsJson, string $content): void {
        $attachments = poznoteDecodeAttachments($attachmentsJson);
        $changed = false;

        foreach ($attachments as &$attachment) {
            if (poznoteAttachmentIsSnapshotOnly($attachment) && poznoteAttachmentIsReferencedInContent($attachment, $content)) {
                unset($attachment['snapshot_only']);
                $changed = true;
            }
        }
        unset($attachment);

        if ($changed) {
            $stmt = $this->con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
            $stmt->execute([json_encode($attachments), $noteId]);
        }
    }

    private function sendError(int $code, string $message): void {
        // Delegates to lib/api-response.php. Note that FoldersController and
        // TrashController declare the arguments the other way round; the
        // signatures are typed, so a call in the wrong order fails loudly.
        apiFail($message, $code);
    }
}
