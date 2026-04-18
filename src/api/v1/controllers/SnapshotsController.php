<?php
/**
 * Snapshots Controller for Poznote REST API v1
 * 
 * Manages daily snapshots of note content.
 * A snapshot captures the note content at first open of the day,
 * allowing users to revert to the state before any edits were made that day.
 */

class SnapshotsController {
    private PDO $con;
    
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
     * POST /api/v1/notes/{id}/snapshot
     * Create a daily snapshot for a note.
     * When ?force=1 is provided, today's snapshot is overwritten.
     */
    public function create(string $id): void {
        $noteId = (int)$id;
        $forceParam = strtolower((string) ($_GET['force'] ?? '0'));
        $force = in_array($forceParam, ['1', 'true', 'yes'], true);

        if ($noteId <= 0) {
            $this->sendError(400, t('snapshot.api.invalid_note_id', [], 'Invalid note ID'));
            return;
        }
        
        try {
            // Get note data
            $stmt = $this->con->prepare("SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, t('snapshot.api.note_not_found', [], 'Note not found'));
                return;
            }
            
            $noteType = $note['type'] ?? 'note';
            $today = date('Y-m-d');
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            // Check if snapshot already exists for today
            $extension = ($noteType === 'markdown') ? '.md' : '.html';
            $snapshotFile = $noteSnapshotDir . '/' . $today . $extension;
            $snapshotExists = file_exists($snapshotFile);
            
            if ($snapshotExists && !$force) {
                echo json_encode(['success' => true, 'exists' => true, 'message' => t('snapshot.api.already_exists', [], 'Snapshot already exists for today')]);
                return;
            }
            
            // Create directories if needed
            if (!is_dir($noteSnapshotDir)) {
                if (!mkdir($noteSnapshotDir, 0755, true)) {
                    $this->sendError(500, t('snapshot.api.create_directory_failed', [], 'Failed to create snapshot directory'));
                    return;
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
            
            // Also save heading metadata
            $metaFile = $noteSnapshotDir . '/' . $today . '.meta.json';
            $meta = [
                'note_id' => $noteId,
                'heading' => $note['heading'] ?? '',
                'type' => $noteType,
                'snapshot_date' => $today,
                'created_at' => date('Y-m-d H:i:s')
            ];
            
            // Write snapshot file
            if (file_put_contents($snapshotFile, $content) === false) {
                $this->sendError(500, t('snapshot.api.write_file_failed', [], 'Failed to write snapshot file'));
                return;
            }
            
            // Write meta file
            file_put_contents($metaFile, json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            
            echo json_encode([
                'success' => true,
                'created' => !$snapshotExists,
                'updated' => $snapshotExists,
                'date' => $today
            ]);
            
        } catch (Exception $e) {
            error_log("Snapshot create error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.create_failed', [], 'Failed to create snapshot'));
        }
    }
    
    /**
     * GET /api/v1/notes/{id}/snapshot
     * Get the latest snapshot for a note (today's snapshot)
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
            $today = date('Y-m-d');
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            $extension = ($noteType === 'markdown') ? '.md' : '.html';
            $snapshotFile = $noteSnapshotDir . '/' . $today . $extension;
            $metaFile = $noteSnapshotDir . '/' . $today . '.meta.json';
            
            if (!file_exists($snapshotFile)) {
                echo json_encode([
                    'success' => true,
                    'exists' => false,
                    'message' => t('snapshot.api.not_found_today', [], 'No snapshot found for today'),
                    'snapshot' => null
                ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                return;
            }
            
            $content = file_get_contents($snapshotFile);
            if ($content === false) {
                $this->sendError(500, t('snapshot.api.read_failed', [], 'Failed to read snapshot'));
                return;
            }

            if ($noteType === 'tasklist') {
                $content = resolveTasklistStoredContent($content, $content);
            }
            
            $meta = [];
            if (file_exists($metaFile)) {
                $metaContent = file_get_contents($metaFile);
                if ($metaContent !== false) {
                    $meta = json_decode($metaContent, true) ?: [];
                }
            }
            
            echo json_encode([
                'success' => true,
                'exists' => true,
                'snapshot' => [
                    'note_id' => $noteId,
                    'date' => $today,
                    'heading' => $meta['heading'] ?? '',
                    'type' => $noteType,
                    'content' => $content,
                    'created_at' => $meta['created_at'] ?? ''
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            
        } catch (Exception $e) {
            error_log("Snapshot show error: " . $e->getMessage());
            $this->sendError(500, t('snapshot.api.retrieve_failed', [], 'Failed to retrieve snapshot'));
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/snapshot/restore
     * Restore a note to its snapshot state
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
            $today = date('Y-m-d');
            $snapshotsDir = $this->getSnapshotsPath();
            $noteSnapshotDir = $snapshotsDir . '/' . $noteId;
            
            $extension = ($noteType === 'markdown') ? '.md' : '.html';
            $snapshotFile = $noteSnapshotDir . '/' . $today . $extension;
            
            if (!file_exists($snapshotFile)) {
                $this->sendError(404, t('snapshot.api.not_found_today', [], 'No snapshot found for today'));
                return;
            }
            
            $snapshotContent = file_get_contents($snapshotFile);
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
