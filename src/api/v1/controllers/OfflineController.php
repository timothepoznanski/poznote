<?php
/**
 * OfflineController - what a browser keeps to open notes without a network
 *
 * Endpoints:
 *   GET /api/v1/offline/manifest        - The notes kept offline (metadata
 *                                         and version token, no content)
 *   GET /api/v1/offline/list            - The notes and folders kept offline
 *                                         in a workspace (offline_notes.php)
 *   GET /api/v1/offline/notes?ids=1,2,3 - Full content of up to 50 notes
 *
 * js/offline-sync.js compares the versions of the manifest with the copies it
 * already holds and downloads only the notes that changed. The notes kept
 * offline are the ones modified in the last `offline_notes_days` days (user
 * setting, 5 by default, 0 turns the feature off for the account), the
 * favorites, and the notes and folders marked "Keep offline" whatever their
 * date; the rules are in lib/offline.php.
 *
 * Only the account's owner gets a copy: an account opened through a grant
 * (Admin > User Management) or a workspace shared with this login is not
 * theirs to keep on a device.
 */

require_once __DIR__ . '/../../../lib/offline.php';

class OfflineController {
    // A bulk import or a restore can touch thousands of notes at once: the
    // most recent ones are kept, the others stay online only. Two limits,
    // whichever comes first: POZNOTE_OFFLINE_MAX_NOTES notes and
    // POZNOTE_OFFLINE_MAX_TEXT_MB of text (functions.php). Pictures have their
    // own budget, applied by the browser (js/offline-sync.js).
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
     * Number of days of notes kept offline for this account, 0 when off
     * (offline mode turned off included: the browsers then forget their
     * copies, js/offline-sync.js).
     */
    public static function getOfflineDays(): int {
        if (function_exists('poznoteOfflineModeEnabled') && !poznoteOfflineModeEnabled()) {
            return 0;
        }
        $raw = function_exists('getSetting') ? getSetting('offline_notes_days', null) : null;
        return poznoteOfflineDays($raw, POZNOTE_OFFLINE_DEFAULT_DAYS, POZNOTE_OFFLINE_MAX_DAYS);
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
     * The notes this account keeps offline (lib/offline.php): the recent
     * ones, the favorites and the notes and folders marked "Keep offline", of
     * a type the offline page can open, within the budgets. Shared by the
     * manifest and the list of offline_notes.php, so both show the same notes.
     *
     * @return array{folders: array<int, array<string, mixed>>, kept_folders: array<int, true>, notes: array<int, array<string, mixed>>}
     */
    private function collectKeptNotes(int $days): array {
        $allFolders = [];
        $folderStmt = $this->con->query('SELECT id, name, parent_id, workspace, icon, icon_color, offline FROM folders');
        while ($row = $folderStmt->fetch(PDO::FETCH_ASSOC)) {
            $allFolders[(int)$row['id']] = [
                'id' => (int)$row['id'],
                'name' => (string)$row['name'],
                'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
                'workspace' => (string)($row['workspace'] ?? ''),
                'icon' => (string)($row['icon'] ?? ''),
                'icon_color' => (string)($row['icon_color'] ?? ''),
                'offline' => (int)($row['offline'] ?? 0),
            ];
        }

        $notes = [];
        $keptFolders = [];
        if ($days <= 0) {
            return ['folders' => $allFolders, 'kept_folders' => $keptFolders, 'notes' => $notes];
        }

        // Their version token is computed from the content, as show() does,
        // so it can be sent back as "if_version".
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $keptFolders = poznoteOfflineFolderIds($allFolders);
        $typeList = implode(',', array_fill(0, count(self::OFFLINE_TYPES), '?'));
        $where = "trash = 0 AND COALESCE(type, 'note') IN ($typeList) AND (updated >= ? OR favorite = 1 OR offline = 1";
        $params = array_merge(self::OFFLINE_TYPES, [$cutoff]);
        if (!empty($keptFolders)) {
            $where .= ' OR folder_id IN (' . implode(',', array_map('intval', array_keys($keptFolders))) . ')';
        }
        $where .= ')';
        $stmt = $this->con->prepare("SELECT id, heading, type, workspace, folder_id, updated, favorite, offline, attachments, icon, icon_color FROM entries WHERE $where");
        $stmt->execute($params);
        $candidates = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['reason'] = poznoteOfflineReason($row, $cutoff, $keptFolders);
            if ($row['reason'] !== null) {
                $candidates[] = $row;
            }
        }

        // The entry column repeats the file: selecting it for every note made
        // SQLite read the whole text twice (80% of the time at 100 MB). Read
        // only when the file is not the answer: task lists, notes without a
        // file.
        $entryStmt = $this->con->prepare('SELECT entry FROM entries WHERE id = ?');
        $contents = [];
        $loadContent = function (array $row) use ($entryStmt, &$contents): string {
            $noteId = (int)$row['id'];
            $noteType = !empty($row['type']) ? (string)$row['type'] : 'note';
            $content = $this->notes->loadNoteContentForVersion($noteId, $noteType, null);
            if ($noteType === 'tasklist' || $content === '') {
                $entryStmt->execute([$noteId]);
                $entry = $entryStmt->fetchColumn();
                $entryStmt->closeCursor();
                $content = $this->notes->loadNoteContentForVersion($noteId, $noteType, is_string($entry) ? $entry : null);
            }
            $contents[$noteId] = $content;
            return $content;
        };
        $kept = poznoteOfflineFit($candidates, POZNOTE_OFFLINE_MAX_NOTES, POZNOTE_OFFLINE_MAX_TEXT_MB * 1024 * 1024, function (array $row) use ($loadContent): int {
            return strlen($loadContent($row));
        });
        foreach ($kept as $row) {
            $noteId = (int)$row['id'];
            $notes[] = [
                'id' => $noteId,
                'heading' => (string)($row['heading'] ?? ''),
                'type' => !empty($row['type']) ? (string)$row['type'] : 'note',
                'workspace' => (string)($row['workspace'] ?? ''),
                'folder_id' => $row['folder_id'] !== null ? (int)$row['folder_id'] : null,
                'updated' => $row['updated'] ?? null,
                'reason' => $row['reason'],
                'icon' => (string)($row['icon'] ?? ''),
                'icon_color' => (string)($row['icon_color'] ?? ''),
                'version' => $this->notes->computeNoteVersion((string)($row['updated'] ?? ''), (string)($row['heading'] ?? ''), $contents[$noteId] ?? ''),
                'files' => poznoteOfflineFilesToken($row['attachments'] ?? ''),
            ];
        }

        return ['folders' => $allFolders, 'kept_folders' => $keptFolders, 'notes' => $notes];
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

            ['folders' => $allFolders, 'kept_folders' => $keptFolders, 'notes' => $keptNotes] = $this->collectKeptNotes($days);
            $notes = [];
            foreach ($keptNotes as $row) {
                $notes[] = [
                    'id' => $row['id'],
                    'heading' => $row['heading'],
                    'type' => $row['type'],
                    'workspace' => $row['workspace'],
                    'folder_id' => $row['folder_id'],
                    'updated' => $row['updated'],
                    'kept' => $row['reason'],
                    'version' => $row['version'],
                    'files' => $row['files'],
                ];
            }

            // Only the folders the offline page shows: those of these notes
            // and their parents, for the folder path under each title.
            $folders = [];
            foreach ($notes as $note) {
                $folderId = $note['folder_id'];
                while ($folderId !== null && isset($allFolders[$folderId]) && !isset($folders[$folderId])) {
                    $folder = $allFolders[$folderId];
                    $folders[$folderId] = [
                        'id' => $folder['id'],
                        'name' => $folder['name'],
                        'parent_id' => $folder['parent_id'],
                        'workspace' => $folder['workspace'],
                    ];
                    $folderId = $allFolders[$folderId]['parent_id'];
                }
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
                'limits' => [
                    'notes' => POZNOTE_OFFLINE_MAX_NOTES,
                    'text_mb' => POZNOTE_OFFLINE_MAX_TEXT_MB,
                    'picture_mb' => POZNOTE_OFFLINE_MAX_PICTURE_MB,
                    'pictures' => POZNOTE_OFFLINE_MAX_PICTURES,
                    'pictures_mb' => POZNOTE_OFFLINE_MAX_PICTURES_MB,
                ],
                'workspaces' => array_values(array_map('strval', $workspaces)),
                'folders' => array_values($folders),
                // Folders kept whole ("Keep offline", or under one), for the
                // marks of the note and folder lists (js/offline-marks.js)
                'kept_folders' => array_map('intval', array_keys($keptFolders)),
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
     * GET /api/v1/offline/list?workspace=
     *
     * The notes and folders kept offline, for the page that lists them
     * (offline_notes.php): the manifest's notes with why each one is kept,
     * and the folders kept whole ("Keep offline", or under one). Without a
     * workspace, every workspace.
     */
    public function listing(): void {
        if ($this->refuseBorrowedAccount()) {
            return;
        }

        try {
            $workspace = trim((string)($_GET['workspace'] ?? ''));
            $days = self::getOfflineDays();
            ['folders' => $allFolders, 'kept_folders' => $keptFolders, 'notes' => $keptNotes] = $this->collectKeptNotes($days);

            $folderPath = function (?int $folderId) use ($allFolders): string {
                $names = [];
                $seen = [];
                while ($folderId !== null && isset($allFolders[$folderId]) && !isset($seen[$folderId])) {
                    $seen[$folderId] = true;
                    array_unshift($names, $allFolders[$folderId]['name']);
                    $folderId = $allFolders[$folderId]['parent_id'];
                }
                return implode('/', $names);
            };

            $notes = [];
            $noteCounts = [];
            foreach ($keptNotes as $note) {
                if ($workspace !== '' && $note['workspace'] !== $workspace) {
                    continue;
                }
                if ($note['folder_id'] !== null) {
                    $noteCounts[$note['folder_id']] = ($noteCounts[$note['folder_id']] ?? 0) + 1;
                }
                $notes[] = [
                    'note_id' => $note['id'],
                    'heading' => $note['heading'],
                    'type' => $note['type'],
                    'workspace' => $note['workspace'],
                    'folder_id' => $note['folder_id'],
                    'folder_path' => $folderPath($note['folder_id']),
                    'updated' => $note['updated'],
                    'reason' => $note['reason'],
                    'icon' => $note['icon'],
                    'icon_color' => $note['icon_color'],
                ];
            }

            $folders = [];
            foreach (array_keys($keptFolders) as $folderId) {
                $folder = $allFolders[$folderId] ?? null;
                if ($folder === null || ($workspace !== '' && $folder['workspace'] !== $workspace)) {
                    continue;
                }
                $folders[] = [
                    'folder_id' => $folder['id'],
                    'folder_name' => $folder['name'],
                    'parent_id' => $folder['parent_id'],
                    'workspace' => $folder['workspace'],
                    'folder_path' => $folderPath($folder['id']),
                    'is_direct' => !empty($folder['offline']),
                    'note_count' => $noteCounts[$folder['id']] ?? 0,
                    'icon' => $folder['icon'],
                    'icon_color' => $folder['icon_color'],
                ];
            }

            echo json_encode([
                'success' => true,
                'days' => $days,
                'notes' => $notes,
                'folders' => $folders,
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (Exception $e) {
            error_log('OfflineController: listing() failed: ' . $e->getMessage());
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

                // What the offline page needs to keep the note's files and
                // list them under the note: id, name, type and size.
                $attachments = [];
                $decoded = !empty($row['attachments']) ? json_decode((string)$row['attachments'], true) : null;
                if (is_array($decoded)) {
                    foreach ($decoded as $attachment) {
                        if (!is_array($attachment) || empty($attachment['id'])) {
                            continue;
                        }
                        $attachments[] = [
                            'id' => (string)$attachment['id'],
                            'original_filename' => (string)($attachment['original_filename'] ?? ''),
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
                    'files' => poznoteOfflineFilesToken($row['attachments'] ?? ''),
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
