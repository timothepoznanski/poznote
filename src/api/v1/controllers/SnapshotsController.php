<?php
/**
 * Snapshots Controller for Poznote REST API v1
 * 
 * Manages automatic daily snapshots and extra manual snapshots of note content.
 * A snapshot captures the note content at first open of the day,
 * and users can also add more snapshots manually during the same day.
 * Keeps up to 7 snapshots of history per note.
 */

class SnapshotsController {
    private PDO $con;
     private int $maxSnapshots = 7;
    
    public function __construct(PDO $con) {
        $this->con = $con;
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
     * Purge snapshots beyond the newest $maxSnapshots for a given note.
     */
    private function purgeOldSnapshots(string $noteSnapshotDir): void {
        if (!is_dir($noteSnapshotDir)) return;

        $this->normalizeMalformedSnapshotFiles($noteSnapshotDir);

        $files = scandir($noteSnapshotDir);
        if ($files === false) return;

        $snapshots = [];

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

            $snapshots[] = [
                'key' => $parsed['key'],
                'snapshot_file' => $snapshotFile,
                'meta_file' => $paths['meta'],
                'created_at_raw' => (string) ($meta['created_at'] ?? ''),
                'date' => $parsed['date']
            ];
        }

        if (count($snapshots) <= $this->maxSnapshots) {
            return;
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

        foreach (array_slice($snapshots, $this->maxSnapshots) as $snapshot) {
            @unlink((string) $snapshot['snapshot_file']);
            @unlink((string) $snapshot['meta_file']);
        }
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
                'type' => $meta['type'] ?? 'note',
                'manual' => (bool) ($meta['manual'] ?? $parsed['manual']),
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
    public function createSnapshotForNote(int $noteId, bool $manual = false): array {
        if ($noteId <= 0) {
            return [
                'success' => false,
                'status' => 400,
                'error' => t('snapshot.api.invalid_note_id', [], 'Invalid note ID')
            ];
        }
        
        try {
            // Get note data
            $stmt = $this->con->prepare("SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0");
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
            
            if ($snapshotExists && !$manual) {
                return [
                    'success' => true,
                    'exists' => true,
                    'message' => t('snapshot.api.already_exists', [], 'Snapshot already exists for today')
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
            
            // Get current note content from file
            $entriesPath = getEntriesPath();
            $noteExtension = ($noteType === 'markdown') ? '.md' : '.html';
            $noteFile = $entriesPath . '/' . $noteId . $noteExtension;
            
            $content = '';
            if (file_exists($noteFile) && is_readable($noteFile)) {
                $content = file_get_contents($noteFile);
                if ($content === false) {
                    $content = '';
                }
            }
            
            // If no file content, fallback to database entry
            if ($content === '' && !empty($note['entry'])) {
                $content = $note['entry'];
            }

            if ($noteType === 'tasklist') {
                $content = resolveTasklistStoredContent($content, $note['entry'] ?? '');
            }

            $snapshotKey = $manual ? $this->buildManualSnapshotKey($today) : $today;
            $snapshotPaths = $this->getSnapshotPaths($noteSnapshotDir, $snapshotKey, $extension);
            
            // Also save heading metadata
            $meta = [
                'note_id' => $noteId,
                'snapshot_key' => $snapshotKey,
                'heading' => $note['heading'] ?? '',
                'type' => $noteType,
                'snapshot_date' => $today,
                'manual' => $manual,
                'created_at' => gmdate('Y-m-d H:i:s')
            ];
            
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
            
            // Purge snapshots older than 7 days
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
     * Ensure the automatic daily snapshot exists for a note.
     */
    public function ensureAutomaticSnapshot(int $noteId): array {
        return $this->createSnapshotForNote($noteId, false);
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
    * List all available snapshots for a note (latest 7 snapshots max).
     */
    public function listSnapshots(string $id): void {
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
            $expectedExtension = ($noteType === 'markdown') ? 'md' : 'html';
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            // Purge old snapshots first
            $this->purgeOldSnapshots($noteSnapshotDir);
            
            $snapshots = $this->collectSnapshots($noteSnapshotDir, $expectedExtension);
            $publicSnapshots = array_map(function (array $snapshot): array {
                return [
                    'snapshot_key' => $snapshot['key'],
                    'date' => $snapshot['date'],
                    'heading' => $snapshot['heading'],
                    'type' => $snapshot['type'],
                    'manual' => $snapshot['manual'],
                    'created_at' => $snapshot['created_at']
                ];
            }, $snapshots);
            
            echo json_encode([
                'success' => true,
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
            
            echo json_encode([
                'success' => true,
                'exists' => true,
                'snapshot' => [
                    'note_id' => $noteId,
                    'snapshot_key' => $snapshotRecord['key'],
                    'date' => $snapshotRecord['date'],
                    'heading' => $meta['heading'] ?? ($snapshotRecord['heading'] ?? ''),
                    'type' => $meta['type'] ?? ($snapshotRecord['type'] ?? $noteType),
                    'manual' => (bool) ($meta['manual'] ?? ($snapshotRecord['manual'] ?? false)),
                    'content' => $content,
                    'created_at' => $this->formatSnapshotCreatedAt((string) ($meta['created_at'] ?? ''))
                ]
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
            $stmt = $this->con->prepare("SELECT id, heading, type FROM entries WHERE id = ? AND trash = 0");
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
            $stmt = $this->con->prepare("UPDATE entries SET entry = ?, updated = datetime('now') WHERE id = ?");
            $stmt->execute([$snapshotContent, $noteId]);
            
            echo json_encode([
                'success' => true,
                'message' => t('snapshot.api.restore_success', [], 'Note restored to snapshot state')
            ]);
            
        } catch (Exception $e) {
            error_log("Snapshot restore error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.restore_failed', [], 'Failed to restore snapshot'));
        }
    }
    
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message
        ]);
    }
}
