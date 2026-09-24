<?php
/**
 * OfflineController - what a browser keeps to open notes without a network
 *
 * Endpoints:
 *   GET /api/v1/offline/manifest        - The account's note list (metadata
 *                                         only, for the offline sidebar) and,
 *                                         for the notes kept offline, their
 *                                         version tokens
 *   GET /api/v1/offline/notes?ids=1,2,3 - Full content of up to 50 notes
 *
 * js/offline-sync.js compares the versions of the manifest with the copies it
 * already holds and downloads only the notes that changed. The notes kept
 * offline are the ones modified in the last `offline_notes_days` days (user
 * setting, 5 by default, 0 turns the feature off for the account).
 *
 * Only the account's owner gets a copy: an account opened through a grant
 * (Admin > User Management) or a workspace shared with this login is not
 * theirs to keep on a device.
 */

class OfflineController {
    public const DEFAULT_DAYS = 5;
    public const MAX_DAYS = 30;

    // A bulk import or a restore can touch thousands of notes at once: the
    // most recent ones are kept, the others stay online only.
    private const MAX_OFFLINE_NOTES = 300;
    private const MAX_NOTES_PER_REQUEST = 50;

    // Types the offline page can show and edit. Excalidraw drawings and the
    // other special types stay online only.
    private const OFFLINE_TYPES = ['note', 'markdown', 'tasklist'];

    private PDO $con;
    private NotesController $notes;

    public function __construct(PDO $con, NotesController $notes) {
        $this->con = $con;
        $this->notes = $notes;
    }

    /**
     * Number of days of notes kept offline for this account, 0 when off.
     */
    public static function getOfflineDays(): int {
        $raw = function_exists('getSetting') ? getSetting('offline_notes_days', null) : null;
        if ($raw === null || $raw === false || trim((string)$raw) === '') {
            return self::DEFAULT_DAYS;
        }
        $days = (int)$raw;
        return max(0, min(self::MAX_DAYS, $days));
    }

    private function refuseBorrowedAccount(): bool {
        $borrowed = function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser();
        $scoped = function_exists('isSharedWorkspaceScopeActive') && isSharedWorkspaceScopeActive();
        if (!$borrowed && !$scoped) {
            return false;
        }
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'code' => 'offline_unavailable',
            'error' => 'Offline copies are only kept for your own account',
        ]);
        return true;
    }

    /**
     * GET /api/v1/offline/manifest
     */
    public function manifest(): void {
        if ($this->refuseBorrowedAccount()) {
            return;
        }

        require_once dirname(__DIR__, 3) . '/users/db_master.php';

        try {
            $userId = (int)(getCurrentUserId() ?? 0);
            $profile = $userId > 0 ? getUserProfileById($userId) : null;
            $days = self::getOfflineDays();

            $workspaces = $this->con->query('SELECT name FROM workspaces ORDER BY display_order, name COLLATE NOCASE')
                ->fetchAll(PDO::FETCH_COLUMN);

            $folders = [];
            $folderStmt = $this->con->query('SELECT id, name, parent_id, workspace FROM folders ORDER BY name COLLATE NOCASE');
            while ($row = $folderStmt->fetch(PDO::FETCH_ASSOC)) {
                $folders[] = [
                    'id' => (int)$row['id'],
                    'name' => (string)$row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
                    'workspace' => (string)($row['workspace'] ?? ''),
                ];
            }

            // Which notes get an offline copy: the most recently modified ones
            // of the last $days days, of a type the offline page can open.
            // Their version token is computed from the content, as show()
            // does, so it can be sent back as "if_version".
            $offlineVersions = [];
            if ($days > 0) {
                $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
                $placeholders = implode(',', array_fill(0, count(self::OFFLINE_TYPES), '?'));
                $stmt = $this->con->prepare(
                    "SELECT id, heading, type, updated, entry FROM entries WHERE trash = 0 AND updated >= ? AND COALESCE(type, 'note') IN ($placeholders)"
                    . ' ORDER BY updated DESC LIMIT ' . self::MAX_OFFLINE_NOTES
                );
                $stmt->execute(array_merge([$cutoff], self::OFFLINE_TYPES));
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $noteId = (int)$row['id'];
                    $content = $this->notes->loadNoteContentForVersion($noteId, !empty($row['type']) ? (string)$row['type'] : 'note', $row['entry'] ?? null);
                    $offlineVersions[$noteId] = $this->notes->computeNoteVersion((string)($row['updated'] ?? ''), (string)($row['heading'] ?? ''), $content);
                }
            }

            $notes = [];
            $stmt = $this->con->query(
                'SELECT id, heading, type, workspace, folder_id, updated, favorite, linked_note_id FROM entries WHERE trash = 0 ORDER BY updated DESC'
            );
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $noteId = (int)$row['id'];
                $noteType = !empty($row['type']) ? (string)$row['type'] : 'note';
                $note = [
                    'id' => $noteId,
                    'heading' => (string)($row['heading'] ?? ''),
                    'type' => $noteType,
                    'workspace' => (string)($row['workspace'] ?? ''),
                    'folder_id' => $row['folder_id'] !== null ? (int)$row['folder_id'] : null,
                    'updated' => $row['updated'] ?? null,
                ];
                if (!empty($row['favorite'])) {
                    $note['favorite'] = 1;
                }
                if (!empty($row['linked_note_id'])) {
                    $note['linked_note_id'] = (int)$row['linked_note_id'];
                }
                if (isset($offlineVersions[$noteId])) {
                    $note['offline'] = 1;
                    $note['version'] = $offlineVersions[$noteId];
                }
                $notes[] = $note;
            }

            $payload = [
                'success' => true,
                'user' => [
                    'id' => $userId,
                    'username' => (string)($profile['username'] ?? ''),
                    'email' => (string)($profile['email'] ?? ''),
                    'display_name' => (string)($profile['display_name'] ?? ($profile['username'] ?? '')),
                ],
                'days' => $days,
                'max_notes' => self::MAX_OFFLINE_NOTES,
                'workspaces' => array_values(array_map('strval', $workspaces)),
                'folders' => $folders,
                'notes' => $notes,
            ];

            // The manifest is polled every few minutes: answer 304 when
            // nothing in it changed since the copy the browser holds.
            $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            $etag = '"' . md5((string)$body) . '"';
            header('ETag: ' . $etag);
            header('Cache-Control: private, no-cache');
            $ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
            if ($ifNoneMatch !== '' && $ifNoneMatch === $etag) {
                http_response_code(304);
                return;
            }
            echo $body;
        } catch (Exception $e) {
            error_log('OfflineController: manifest() failed: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error occurred']);
        }
    }

    /**
     * GET /api/v1/offline/notes?ids=1,2,3
     */
    public function notes(): void {
        if ($this->refuseBorrowedAccount()) {
            return;
        }

        $ids = [];
        foreach (explode(',', (string)($_GET['ids'] ?? '')) as $rawId) {
            $rawId = trim($rawId);
            if ($rawId !== '' && ctype_digit($rawId)) {
                $ids[(int)$rawId] = true;
            }
        }
        $ids = array_keys($ids);
        if (empty($ids)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ids is required']);
            return;
        }
        if (count($ids) > self::MAX_NOTES_PER_REQUEST) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'At most ' . self::MAX_NOTES_PER_REQUEST . ' ids per request']);
            return;
        }

        try {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $this->con->prepare(
                "SELECT id, heading, type, workspace, folder_id, tags, updated, attachments, entry FROM entries WHERE trash = 0 AND id IN ($placeholders)"
            );
            $stmt->execute($ids);

            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $noteId = (int)$row['id'];
                $noteType = !empty($row['type']) ? (string)$row['type'] : 'note';
                $content = $this->notes->loadNoteContentForVersion($noteId, $noteType, $row['entry'] ?? null);

                // Only what the offline page needs to decide which pictures
                // of the note it can keep: id, type and size.
                $attachments = [];
                $decoded = !empty($row['attachments']) ? json_decode((string)$row['attachments'], true) : null;
                if (is_array($decoded)) {
                    foreach ($decoded as $attachment) {
                        if (!is_array($attachment) || empty($attachment['id'])) {
                            continue;
                        }
                        $attachments[] = [
                            'id' => (string)$attachment['id'],
                            'file_type' => (string)($attachment['file_type'] ?? ''),
                            'file_size' => (int)($attachment['file_size'] ?? 0),
                        ];
                    }
                }

                $notes[] = [
                    'id' => $noteId,
                    'heading' => (string)($row['heading'] ?? ''),
                    'type' => $noteType,
                    'workspace' => (string)($row['workspace'] ?? ''),
                    'folder_id' => $row['folder_id'] !== null ? (int)$row['folder_id'] : null,
                    'tags' => (string)($row['tags'] ?? ''),
                    'updated' => $row['updated'] ?? null,
                    'version' => $this->notes->computeNoteVersion((string)($row['updated'] ?? ''), (string)($row['heading'] ?? ''), $content),
                    'attachments' => $attachments,
                    'content' => $content,
                ];
            }

            header('Cache-Control: private, no-store');
            echo json_encode(['success' => true, 'notes' => $notes], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (Exception $e) {
            error_log('OfflineController: notes() failed: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Database error occurred']);
        }
    }
}
