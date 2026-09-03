<?php
/**
 * Notes Controller for Poznote REST API v1
 * 
 * Handles all CRUD operations for notes.
 */

require_once __DIR__ . '/../../../note_loader.php';
require_once __DIR__ . '/../../../users/db_master.php';

class NotesController {
    private PDO $con;
    private const DEFAULT_NOTE_ICON = 'lucide-file-text';

    public function __construct(PDO $con) {
        $this->con = $con;
    }

    private function appendPublicWorkspaceAgeFilter(string &$sql, array &$params, string $column = 'updated'): void {
        if (!function_exists('isPublicWorkspaceAccessActive') || !isPublicWorkspaceAccessActive()) {
            return;
        }

        $cutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($this->con));
        if ($cutoff === null) {
            return;
        }

        $sql .= " AND $column >= ?";
        $params[] = $cutoff;
    }

    private function getNoteLockTargetUserId(): int {
        return (int) (getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0));
    }

    private function getNoteLockHolderUserId(): int {
        return (int) (getAuthenticatedUserId() ?? getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0));
    }

    private function getActorUserId(): int {
        return $this->getNoteLockHolderUserId();
    }

    /**
     * Best-effort note.created webhook: never let a webhook failure break the
     * note creation that already succeeded and was answered.
     */
    private function dispatchNoteCreatedWebhook(array $note): void {
        try {
            require_once __DIR__ . '/../../../WebhookDispatcher.php';
            $ownerUserId = (int)(getCurrentUserId() ?? 0);
            // Bearer/Basic credentials mean an external API client; the web UI
            // reaches the same endpoint through its session cookie.
            $source = (function_exists('hasApiAuthCredentials') && hasApiAuthCredentials()) ? 'api' : 'ui';
            (new WebhookDispatcher())->dispatchNoteCreated($ownerUserId, $note, $source);
        } catch (Throwable $e) {
            error_log('note.created webhook failed: ' . $e->getMessage());
        }
    }

    private function getEditorSessionId(?array $input = null): string {
        if (is_array($input) && isset($input['editor_session_id'])) {
            return trim((string) $input['editor_session_id']);
        }

        if (isset($_POST['editor_session_id'])) {
            return trim((string) $_POST['editor_session_id']);
        }

        if (isset($_SERVER['HTTP_X_EDITOR_SESSION_ID'])) {
            return trim((string) $_SERVER['HTTP_X_EDITOR_SESSION_ID']);
        }

        return '';
    }

    private function decodeOptionalJsonBody(): ?array {
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        $input = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
            return null;
        }

        return $input;
    }

    private function normalizeNoteIcon(?string $icon): ?string {
        if (!is_string($icon)) {
            return null;
        }

        $icon = trim($icon);
        if ($icon === '') {
            return null;
        }

        if (function_exists('convertFontAwesomeToLucide')) {
            return convertFontAwesomeToLucide($icon);
        }

        return $icon;
    }

    /**
     * Optimistic-concurrency token for a note. Built from the last-write
     * timestamp, the heading and a hash of the content, so two writes landing
     * within the same second still yield distinct tokens.
     */
    private function computeNoteVersion(string $updated, string $heading, string $content): string {
        return md5($updated . '|' . $heading . '|' . md5($content));
    }

    /**
     * Load a note's current content the same way show() serves it (file first,
     * DB entry column as fallback, tasklist resolution), so version tokens
     * computed here and in show() always agree.
     */
    private function loadNoteContentForVersion(int $noteId, string $noteType, ?string $entryColumn): string {
        $content = '';
        $filename = getEntryFilename($noteId, $noteType);
        if (file_exists($filename) && is_readable($filename)) {
            $read = file_get_contents($filename);
            if ($read !== false) {
                $content = $read;
            }
        }
        if ($noteType === 'tasklist') {
            $content = resolveTasklistStoredContent($content, $entryColumn ?? '');
        } elseif ($content === '' && $entryColumn !== null) {
            $content = (string)$entryColumn;
        }
        return $content;
    }

    /**
     * Version expected by the caller, from the "if_version" body field or an
     * If-Match header. Returns '' when none was supplied ('*' means any).
     */
    private function getExpectedNoteVersion(?array $input): string {
        $ifVersion = isset($input['if_version']) ? trim((string)$input['if_version']) : '';
        if ($ifVersion === '' && isset($_SERVER['HTTP_IF_MATCH'])) {
            $ifVersion = trim($_SERVER['HTTP_IF_MATCH']);
            if (strpos($ifVersion, 'W/') === 0) {
                $ifVersion = substr($ifVersion, 2);
            }
            $ifVersion = trim($ifVersion, '"');
        }
        return $ifVersion === '*' ? '' : $ifVersion;
    }

    private function noteExistsForEditing(int $noteId): bool {
        $stmt = $this->con->prepare("SELECT COUNT(*) FROM entries WHERE id = ? AND trash = 0");
        $stmt->execute([$noteId]);
        return (int) $stmt->fetchColumn() > 0;
    }

    private function buildNoteEditLockPayload(?array $lock, ?string $editorSessionId = null): ?array {
        if (!$lock) {
            return null;
        }

        $currentHolderUserId = $this->getNoteLockHolderUserId();
        $currentEditorSessionId = $editorSessionId !== null
            ? trim($editorSessionId)
            : $this->getEditorSessionId();

        // Public-share locks store the share owner's id as holder, but the
        // actual editor is an anonymous visitor: never present them as the
        // current (or any known) user.
        $holderIsPublic = (($lock['holder_kind'] ?? 'user') === 'public');

        return [
            'target_user_id' => (int) ($lock['target_user_id'] ?? 0),
            'note_id' => (int) ($lock['note_id'] ?? 0),
            'holder_login_user_id' => $holderIsPublic ? 0 : (int) ($lock['holder_login_user_id'] ?? 0),
            'holder_username' => $holderIsPublic ? '' : (string) ($lock['holder_username'] ?? ''),
            'holder_is_public' => $holderIsPublic,
            'holder_is_current_user' => !$holderIsPublic
                && (int) ($lock['holder_login_user_id'] ?? 0) === $currentHolderUserId,
            'holder_is_current_editor_session' => !$holderIsPublic
                && (int) ($lock['holder_login_user_id'] ?? 0) === $currentHolderUserId
                && $currentEditorSessionId !== ''
                && (string) ($lock['holder_session_id'] ?? '') === $currentEditorSessionId,
            'expires_at' => (string) ($lock['expires_at'] ?? ''),
            'last_seen_at' => (string) ($lock['last_seen_at'] ?? ''),
        ];
    }

    private function sendLockConflict(string $message, ?array $lock = null, ?string $editorSessionId = null): void {
        http_response_code(423);
        echo json_encode([
            'success' => false,
            'error' => $message,
            'lock' => $this->buildNoteEditLockPayload($lock, $editorSessionId),
        ]);
    }

    private function validateCurrentNoteEditLock(int $noteId, string $editorSessionId): bool {
        $targetUserId = $this->getNoteLockTargetUserId();
        $holderUserId = $this->getNoteLockHolderUserId();

        if ($targetUserId <= 0 || $holderUserId <= 0) {
            $this->sendLockConflict('Missing edit lock for this note', getNoteEditLock($targetUserId, $noteId), $editorSessionId);
            return false;
        }

        if ($editorSessionId === '') {
            $lock = getNoteEditLock($targetUserId, $noteId);
            if (!$lock) {
                return true;
            }

            $this->sendLockConflict('This note is currently locked for editing', $lock, $editorSessionId);
            return false;
        }

        if (noteEditLockBelongsTo($targetUserId, $noteId, $holderUserId, $editorSessionId)) {
            return true;
        }

        $lock = getNoteEditLock($targetUserId, $noteId);
        if (!$lock) {
            $result = acquireNoteEditLock($targetUserId, $noteId, $holderUserId, $editorSessionId);
            if (!empty($result['success'])) {
                return true;
            }

            $lock = $result['lock'] ?? null;
        }

        $message = $lock
            ? 'This note is currently locked for editing'
            : 'You no longer hold the edit lock for this note';

        $this->sendLockConflict($message, $lock, $editorSessionId);
        return false;
    }

    public function acquireLock(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int) $id;
        $input = $this->decodeOptionalJsonBody();
        if ($input === null) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        if (!$this->noteExistsForEditing($noteId)) {
            $this->sendError(404, 'Note not found');
            return;
        }

        $editorSessionId = $this->getEditorSessionId($input);
        if ($editorSessionId === '') {
            $this->sendError(400, 'Missing editor session');
            return;
        }

        $result = acquireNoteEditLock(
            $this->getNoteLockTargetUserId(),
            $noteId,
            $this->getNoteLockHolderUserId(),
            $editorSessionId
        );

        if (!empty($result['success'])) {
            $this->sendSuccess([
                'lock' => $this->buildNoteEditLockPayload($result['lock'] ?? null, $editorSessionId),
            ]);
            return;
        }

        $this->sendLockConflict($result['error'] ?? 'This note is currently locked for editing', $result['lock'] ?? null, $editorSessionId);
    }

    public function lockStatus(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int) $id;
        if (!$this->noteExistsForEditing($noteId)) {
            $this->sendError(404, 'Note not found');
            return;
        }

        $this->sendSuccess([
            'lock' => $this->buildNoteEditLockPayload(getNoteEditLock($this->getNoteLockTargetUserId(), $noteId)),
        ]);
    }

    public function heartbeatLock(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int) $id;
        $input = $this->decodeOptionalJsonBody();
        if ($input === null) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $editorSessionId = $this->getEditorSessionId($input);
        if ($editorSessionId === '') {
            $this->sendError(400, 'Missing editor session');
            return;
        }

        $result = refreshNoteEditLock(
            $this->getNoteLockTargetUserId(),
            $noteId,
            $this->getNoteLockHolderUserId(),
            $editorSessionId
        );

        if (!empty($result['success'])) {
            $this->sendSuccess([
                'lock' => $this->buildNoteEditLockPayload($result['lock'] ?? null, $editorSessionId),
            ]);
            return;
        }

        $this->sendLockConflict($result['error'] ?? 'This note is currently locked for editing', $result['lock'] ?? null, $editorSessionId);
    }

    public function releaseLock(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int) $id;
        $input = $this->decodeOptionalJsonBody();
        if ($input === null) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $editorSessionId = $this->getEditorSessionId($input);
        if ($editorSessionId === '') {
            $this->sendError(400, 'Missing editor session');
            return;
        }

        $released = releaseNoteEditLock(
            $this->getNoteLockTargetUserId(),
            $noteId,
            $this->getNoteLockHolderUserId(),
            $editorSessionId
        );

        $this->sendSuccess(['released' => $released]);
    }
    
    /**
     * GET /api/v1/notes
     * List all notes with optional filtering
     * 
     * Query params:
     *   - workspace: Filter by workspace name
     *   - folder: Filter by folder name
     *   - folder_id: Filter by folder ID
     *   - sort: Sort order (updated_desc, created_desc, heading_asc)
     *   - get_folders: If set, return folders instead of notes
    *   - favorite: Filter by favorite status (0 or 1)
     *   - search: Search query to filter notes by heading or content
     *   - created_from: Filter notes created on or after this date (YYYY-MM-DD)
     *   - created_to: Filter notes created on or before this date (YYYY-MM-DD)
     */
    public function index(): void {
        $workspace = $_GET['workspace'] ?? null;
        $folder = $_GET['folder'] ?? null;
        $folderId = $_GET['folder_id'] ?? null;
        $getFolders = $_GET['get_folders'] ?? null;
        $sort = $_GET['sort'] ?? null;
        $favorite = isset($_GET['favorite']) ? (int)$_GET['favorite'] : null;
        $search = $_GET['search'] ?? null;
        $createdFromRaw = trim((string)($_GET['created_from'] ?? ''));
        $createdToRaw = trim((string)($_GET['created_to'] ?? ''));
        $createdFrom = normalizeDateOnlyFilter($createdFromRaw);
        $createdTo = normalizeDateOnlyFilter($createdToRaw);
        
        try {
            if ($createdFromRaw !== '' && $createdFrom === '') {
                $this->sendError(400, 'created_from must use YYYY-MM-DD format');
                return;
            }

            if ($createdToRaw !== '' && $createdTo === '') {
                $this->sendError(400, 'created_to must use YYYY-MM-DD format');
                return;
            }

            if ($createdFrom !== '' && $createdTo !== '' && $createdFrom > $createdTo) {
                $this->sendError(400, 'created_from must be before or equal to created_to');
                return;
            }

            // Validate workspace if provided
            if ($workspace) {
                $chk = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $chk->execute([$workspace]);
                if ((int)$chk->fetchColumn() === 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // If get_folders is set, return folders list
            if ($getFolders) {
                $this->listFolders($workspace);
                return;
            }
            
            // Build query for notes
            $sql = "SELECT id, heading, type, tags, folder, folder_id, workspace, updated, created, favorite, icon, icon_color, color, content_width, display_order FROM entries WHERE trash = 0";
            $params = [];
            
            if ($workspace) {
                $sql .= " AND workspace = ?";
                $params[] = $workspace;
            }
            
            if ($folder) {
                $sql .= " AND folder = ?";
                $params[] = $folder;
            }
            
            if ($folderId) {
                $sql .= " AND folder_id = ?";
                $params[] = $folderId;
            }

            if ($favorite !== null) {
                $sql .= " AND favorite = ?";
                $params[] = $favorite;
            }
            
            // Add search filter if provided
            if ($search !== null && $search !== '') {
                $sql .= " AND (remove_accents(heading) LIKE remove_accents(?) 
                         OR remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?))";
                $params[] = '%' . $search . '%';
                $params[] = '%' . $search . '%';
            }

            $createdFromUtc = dateOnlyFilterToUtcBoundary($createdFrom, false);
            if ($createdFromUtc !== null) {
                $sql .= " AND created >= ?";
                $params[] = $createdFromUtc;
            }

            $createdToUtc = dateOnlyFilterToUtcBoundary($createdTo, true);
            if ($createdToUtc !== null) {
                $sql .= " AND created <= ?";
                $params[] = $createdToUtc;
            }

            $this->appendPublicWorkspaceAgeFilter($sql, $params);
            
            // Handle sorting
            $notes_without_folders_after = false;
            try {
                $stmtSetting = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmtSetting->execute(['notes_without_folders_after_folders']);
                $settingValue = $stmtSetting->fetchColumn();
                $notes_without_folders_after = ($settingValue !== '0' && $settingValue !== 'false' && $settingValue !== false);
            } catch (Exception $e) {
                // ignore
                $notes_without_folders_after = true; // default
            }
            
            $folder_null_case = $notes_without_folders_after ? '1' : '0';
            $folder_case = $notes_without_folders_after ? '0' : '1';
            
            $allowed = [
                'updated_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, updated DESC",
                'created_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, created DESC",
                'heading_asc'  => 'folder, heading COLLATE NOCASE ASC',
                // Drag-and-drop order: unplaced notes (display_order 0) first,
                // newest update first, then the saved positions
                'manual'       => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, CASE WHEN display_order > 0 THEN 1 ELSE 0 END, display_order, updated DESC"
            ];
            
            $order_by = $allowed['updated_desc'];
            
            if ($sort && isset($allowed[$sort])) {
                $order_by = $allowed[$sort];
            } else if (!$sort) {
                try {
                    $stmtPref = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                    $stmtPref->execute(['note_list_sort']);
                    $pref = $stmtPref->fetchColumn();
                    if ($pref && isset($allowed[$pref])) {
                        $order_by = $allowed[$pref];
                    }
                } catch (Exception $e) {
                    // ignore
                }
            }
            
            $sql .= " ORDER BY " . $order_by;
            
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            
            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $row['icon'] = $this->normalizeNoteIcon($row['icon'] ?? null) ?? self::DEFAULT_NOTE_ICON;
                $row['icon_color'] = $row['icon_color'] ?? null;
                $row['color'] = $row['color'] ?? null;
                $row['color_hex'] = $row['color'] !== null ? (resolveNoteColorHex($row['color']) ?: null) : null;
                $notes[] = $row;
            }
            
            $this->sendSuccess(['notes' => $notes]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * Helper to list folders (used when get_folders param is set)
     */
    private function listFolders(?string $workspace): void {
        $sql = "SELECT id, name, parent_id, display_order FROM folders";
        $params = [];
        
        if ($workspace) {
            $sql .= " WHERE workspace = ?";
            $params[] = $workspace;
        }
        
        $sql .= " ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE";
        
        $stmt = $this->con->prepare($sql);
        $stmt->execute($params);
        
        $folderData = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['id'];
            $folderData[$folderId] = [
                'id' => $folderId,
                'name' => $row['name'],
                'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null
            ];
        }
        
        // Build folder paths recursively
        $folders = [];
        foreach ($folderData as $folderId => $folder) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folder['name'],
                'path' => $this->buildFolderPath($folderId, $folderData)
            ];
        }
        
        echo json_encode(['success' => true, 'folders' => $folders], JSON_FORCE_OBJECT);
    }
    
    /**
     * Build folder path recursively
     */
    private function buildFolderPath(int $folderId, array $folderData): string {
        if (!isset($folderData[$folderId])) {
            return '';
        }
        $folder = $folderData[$folderId];
        if ($folder['parent_id']) {
            $parentPath = $this->buildFolderPath($folder['parent_id'], $folderData);
            return $parentPath . '/' . $folder['name'];
        }
        return $folder['name'];
    }
    
    /**
     * GET /api/v1/notes/{id}
     * Get a specific note with its content
     * 
     * Query params:
     *   - workspace: Optional workspace filter
     *   - reference: Alternative to ID - search by title
     */
    public function show(string $id): void {
        $workspace = $_GET['workspace'] ?? null;
        $reference = $_GET['reference'] ?? null;
        
        // If ID is not numeric and reference isn't provided, treat ID as reference
        if (!is_numeric($id) && $reference === null) {
            $reference = $id;
            $id = null;
        }
        
        try {
            $row = null;
            $useWorkspaceFilter = ($workspace !== null && $workspace !== '');
            
            if ($id !== null && is_numeric($id)) {
                $noteId = (int)$id;
                if ($useWorkspaceFilter) {
                    $sql = "SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id, reminder_at, icon, icon_color, color, content_width, display_order, entry FROM entries WHERE id = ? AND trash = 0 AND workspace = ?";
                    $params = [$noteId, $workspace];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                } else {
                    $sql = "SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id, reminder_at, icon, icon_color, color, content_width, display_order, entry FROM entries WHERE id = ? AND trash = 0";
                    $params = [$noteId];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                }
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
            } else {
                // Reference-based lookup requires workspace
                if (!$useWorkspaceFilter) {
                    $this->sendError(400, 'workspace is required when using reference');
                    return;
                }
                
                $reference = trim((string)$reference);
                
                if (is_numeric($reference)) {
                    $refId = (int)$reference;
                    $sql = "SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id, reminder_at, icon, icon_color, color, content_width, display_order, entry FROM entries WHERE id = ? AND trash = 0 AND workspace = ?";
                    $params = [$refId, $workspace];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                } else {
                    $sql = "SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id, reminder_at, icon, icon_color, color, content_width, display_order, entry FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) AND workspace = ?";
                    $params = ['%' . $reference . '%', $workspace];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $sql .= " ORDER BY updated DESC LIMIT 1";
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                }
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            
            if (!$row) {
                $this->sendError(404, 'Note not found or has been deleted');
                return;
            }
            
            $noteType = !empty($row['type']) ? $row['type'] : 'note';
            $noteId = (int)$row['id'];
            
            // Get file content
            $content = '';
            $filename = getEntryFilename($noteId, $noteType);
            
            // Security check - only check realpath if file exists
            if (file_exists($filename)) {
                $realPath = realpath($filename);
                $expectedDir = realpath(getEntriesPath());
                
                if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
                    $this->sendError(403, 'Invalid file path');
                    return;
                }
                
                if (is_readable($filename)) {
                    $content = file_get_contents($filename);
                    if ($content === false) {
                        $content = '';
                    }
                }
            }

            if ($noteType === 'tasklist') {
                $content = resolveTasklistStoredContent($content, $row['entry'] ?? '');
            } elseif ($content === '' && isset($row['entry'])) {
                $content = (string) ($row['entry'] ?? '');
            }

            $version = $this->computeNoteVersion((string)($row['updated'] ?? ''), (string)($row['heading'] ?? ''), $content);
            header('ETag: "' . $version . '"');

            echo json_encode([
                'success' => true,
                'note' => [
                    'id' => $noteId,
                    'heading' => $row['heading'] ?? '',
                    'workspace' => $row['workspace'] ?? null,
                    'type' => $noteType,
                    'tags' => $row['tags'] ?? '',
                    'folder' => $row['folder'] ?? null,
                    'folder_id' => $row['folder_id'] ? (int)$row['folder_id'] : null,
                    'linked_note_id' => $row['linked_note_id'] ? (int)$row['linked_note_id'] : null,
                    'icon' => $this->normalizeNoteIcon($row['icon'] ?? null) ?? self::DEFAULT_NOTE_ICON,
                    'icon_color' => $row['icon_color'] ?? null,
                    'color' => $row['color'] ?? null,
                    'color_hex' => !empty($row['color']) ? (resolveNoteColorHex($row['color']) ?: null) : null,
                    'created' => $row['created'] ?? null,
                    'updated' => $row['updated'] ?? null,
                    'version' => $version,
                    'reminder_at' => $row['reminder_at'] ?? null,
                    'content_width' => isset($row['content_width']) ? (int)$row['content_width'] : null,
                    'display_order' => (int)($row['display_order'] ?? 0),
                    'content' => $content
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * POST /api/v1/notes
     * Create a new note
     * 
     * Body (JSON):
     *   - heading: Note title (optional, defaults to "New note")
     *   - content: Note content (HTML or Markdown)
     *   - tags: Comma-separated tags
     *   - folder_name: Folder name
     *   - folder_id: Folder ID (alternative to folder_name)
     *   - workspace: Workspace name
     *   - type: Note type (note, markdown, excalidraw)
     *   - created_date: Optional YYYY-MM-DD date to backdate the note to
     *     (stored at midday UTC so DATE(created) matches that day in the
     *     calendar endpoints). Used by diary entry creation.
     */
    public function create(): void {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }
        
        $originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
        $tags = isset($input['tags']) ? trim($input['tags']) : '';
        $folder = isset($input['folder_name']) ? trim($input['folder_name']) : null;
        
        // Handle workspace - use provided value or fallback to first workspace
        $workspace = isset($input['workspace']) && trim($input['workspace']) !== '' 
            ? trim($input['workspace']) 
            : getFirstWorkspaceName();
        
        $entry = $input['content'] ?? $input['entry'] ?? '';
        $entrycontent = $input['entrycontent'] ?? $entry;
        $type = isset($input['type']) ? trim($input['type']) : 'note';
        $linked_note_id = isset($input['linked_note_id']) ? (int)$input['linked_note_id'] : null;
        
        try {
            $quotaError = poznoteCheckNoteQuota($this->con)
                ?? poznoteCheckStorageQuota(strlen((string)$entry));
            if ($quotaError !== null) {
                $this->sendError(403, $quotaError);
                return;
            }

            // Validate workspace if provided
            if (!empty($workspace)) {
                $wsStmt = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $wsStmt->execute([$workspace]);
                if ($wsStmt->fetchColumn() == 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // Validate and clean tags
            if (!empty($tags)) {
                $tags = $this->sanitizeTags($tags);
            }
            
            // Get folder_id if folder name is provided
            $folder_id = isset($input['folder_id']) ? (int)$input['folder_id'] : null;
            if ($folder_id === 0) $folder_id = null;
            
            if ($folder && !$folder_id) {
                // Robust path resolution and automatic creation of missing subfolders
                $resolvedId = resolveFolderPathToId($workspace, $folder, true, $this->con);
                if ($resolvedId) {
                    $folder_id = $resolvedId;
                    
                    // Update folder name to only the last segment for database consistency if needed
                    // Actually, Poznote uses the 'folder' column for legacy/display, but folder_id is primary.
                    // We'll keep the full path in 'folder' for now as it's common in this codebase.
                    $segments = explode('/', $folder);
                    $folder = end($segments);
                }
            }
            
            // Generate unique heading if needed
            if ($originalHeading === '') {
                $heading = generateUniqueTitle(t('index.note.new_note', [], 'New note'), null, $workspace, $folder_id);
            } else {
                // For linked notes, don't check uniqueness - multiple links can have the same title
                if ($type === 'linked') {
                    $heading = $originalHeading;
                } else {
                    // Check uniqueness for regular notes
                    if ($folder_id !== null) {
                        $check = $this->con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id = ? AND workspace = ?");
                        $check->execute([$originalHeading, $folder_id, $workspace]);
                    } else {
                        $check = $this->con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id IS NULL AND workspace = ?");
                        $check->execute([$originalHeading, $workspace]);
                    }
                    if ($check->fetchColumn() > 0) {
                        $heading = generateUniqueTitle($originalHeading, null, $workspace, $folder_id);
                    } else {
                        $heading = $originalHeading;
                    }
                }
            }
            
            // Create the note
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $created_utc = $now_utc;
            if (isset($input['created_date'])
                && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', trim($input['created_date']), $cd)
                && checkdate((int)$cd[2], (int)$cd[3], (int)$cd[1])) {
                $created_utc = trim($input['created_date']) . ' 12:00:00';
            }
            
            // Validate linked_note_id if provided
            if ($linked_note_id !== null) {
                $checkLinkedNote = $this->con->prepare("SELECT id FROM entries WHERE id = ? AND trash = 0");
                $checkLinkedNote->execute([$linked_note_id]);
                if (!$checkLinkedNote->fetch()) {
                    $this->sendError(404, 'Shortcut not found');
                    return;
                }
                
                // Check if a linked note already exists for this target
                $checkExistingLink = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0");
                $checkExistingLink->execute([$linked_note_id]);
                $existingLink = $checkExistingLink->fetch();
                if ($existingLink) {
                    $this->sendError(400, 'A shortcut already exists for this note');
                    return;
                }
            }
            
            $actorUserId = $this->getActorUserId();
            $stmt = $this->con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, linked_note_id, created, updated, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            if ($stmt->execute([$heading, $entrycontent, $tags, $folder, $folder_id, $workspace, $type, $linked_note_id, $created_utc, $now_utc, $actorUserId, $actorUserId])) {
                $id = $this->con->lastInsertId();
                
                // Notes in a shared folder inherit access through the folder only.
                // They get their own share link only if explicitly shared later.
                $wasShared = false;
                
                // Create the file
                $filename = getEntryFilename($id, $type);
                $entriesDir = dirname($filename);
                createDirectoryWithPermissions($entriesDir);
                
                if (!empty($entry)) {
                    // Sanitize content to prevent stored XSS. Fail closed: only
                    // markdown and a *valid* JSON tasklist payload (rendered with
                    // htmlspecialchars) skip HTML sanitization. Everything else —
                    // including excalidraw, an unknown type, or a tasklist whose
                    // content is not valid JSON — is sanitized as HTML, because a
                    // syntactically valid JSON string can still embed markup.
                    if ($type === 'markdown') {
                        $contentToSave = sanitizeMarkdownContent($entry);
                    } elseif ($type === 'tasklist'
                        && $this->isStructuredJsonPayload($entry)) {
                        $contentToSave = $entry;
                    } else {
                        $contentToSave = sanitizeHtml($entry);
                    }

                    $write_result = file_put_contents($filename, $contentToSave);
                    
                    // Update the entry content in database with sanitized version
                    $updateStmt = $this->con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$contentToSave, $id]);
                }
                
                http_response_code(201);
                echo json_encode([
                    'success' => true,
                    'note' => [
                        'id' => (int)$id,
                        'heading' => $heading,
                        'workspace' => $workspace,
                        'type' => $type,
                        'folder_id' => $folder_id,
                        'created' => $created_utc
                    ],
                    'share_delta' => $wasShared ? 1 : 0
                ]);

                // Trigger auto Git sync
                $this->triggerGitSync((int)$id, 'push');

                // note.created webhook. Keyed on the account the note belongs
                // to (getCurrentUserId), not the authenticated actor: an admin
                // working inside another account must not emit to their own
                // endpoints. Delivery is scoped to that account's webhooks.
                $this->dispatchNoteCreatedWebhook([
                    'id' => (int)$id,
                    'heading' => $heading,
                    'type' => $type,
                    'workspace' => $workspace,
                    'folder' => $folder,
                    'created' => $created_utc,
                ]);
            } else {
                $this->sendError(500, 'Error while creating the note');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * PATCH /api/v1/notes/{id}
     * Update an existing note
     * 
     * Body (JSON):
     *   - heading: Note title
     *   - content: Note content
     *   - tags: Comma-separated tags
     *   - folder_id: Folder ID
     *   - workspace: Workspace name
     *   - git_push: If true, push note to Git after saving
     */
    public function update(string $id, bool $triggerSync = false): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $editorSessionId = $this->getEditorSessionId($input);
        if (!$this->validateCurrentNoteEditLock($noteId, $editorSessionId)) {
            return;
        }
        
        try {
            // Get current note (including attachments for base64 image conversion)
            $stmt = $this->con->prepare("SELECT id, heading, type, workspace, folder, folder_id, attachments, updated, entry FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }

            // Optimistic concurrency: when the caller declares which version it
            // read (body "if_version" or an If-Match header), reject the write
            // with a 409 if the note changed since. The response carries the
            // current version and content so the caller can merge and retry
            // without an extra read.
            $expectedVersion = $this->getExpectedNoteVersion($input);
            if ($expectedVersion !== '') {
                $currentContent = $this->loadNoteContentForVersion($noteId, $note['type'] ?? 'note', $note['entry'] ?? null);
                $currentVersion = $this->computeNoteVersion((string)($note['updated'] ?? ''), (string)$note['heading'], $currentContent);
                if (!hash_equals($currentVersion, $expectedVersion)) {
                    http_response_code(409);
                    echo json_encode([
                        'success' => false,
                        'error' => 'Version conflict: the note was modified since the version you provided',
                        'code' => 'version_conflict',
                        'current' => [
                            'version' => $currentVersion,
                            'updated' => $note['updated'] ?? null,
                            'heading' => $note['heading'],
                            'content' => $currentContent
                        ]
                    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                    return;
                }
            }

            // Prepare update data (only update provided fields)
            $heading = isset($input['heading']) ? trim($input['heading']) : $note['heading'];
            $entry = $input['content'] ?? $input['entry'] ?? null;
            $tags = isset($input['tags']) ? trim($input['tags']) : null;
            $folder_id = isset($input['folder_id']) ? (int)$input['folder_id'] : (int)$note['folder_id'];
            if ($folder_id === 0) $folder_id = null;
            $workspace = isset($input['workspace']) ? trim($input['workspace']) : $note['workspace'];
            $folder = $note['folder'];
            $gitPushRequested = !empty($input['git_push']);
            
            // Check if auto-push is enabled on the server
            $autoPushEnabled = false;
            try {
                require_once dirname(__DIR__, 3) . '/GitSync.php';
                $gitSync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
                $autoPushEnabled = $gitSync->isAutoPushEnabled();
            } catch (Exception $e) {
                // Silently fail if GitSync is not available
            }
            
            // Validate workspace if changed
            if ($workspace && $workspace !== $note['workspace']) {
                $wsStmt = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $wsStmt->execute([$workspace]);
                if ($wsStmt->fetchColumn() == 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // Get folder name from folder_id if changed
            if (isset($input['folder_id'])) {
                if ($folder_id !== null) {
                    $fStmt = $this->con->prepare("SELECT name FROM folders WHERE id = ?");
                    $fStmt->execute([$folder_id]);
                    $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
                    if ($folderData) {
                        $folder = $folderData['name'];
                    }
                } else {
                    $folder = null;
                }
            }
            
            // Validate tags
            if ($tags !== null && !empty($tags)) {
                $tags = $this->sanitizeTags($tags);
            }

            // Diary entries follow their date title: renaming one to another
            // date (in any supported diary date format) moves it into the
            // matching Diary/YYYY/MM folder (created on demand) of the diary it
            // lives in. Skipped when the request itself moves the note to a
            // different folder.
            $diaryFolderMoved = false;
            $currentFolderId = $note['folder_id'] !== null ? (int)$note['folder_id'] : null;
            $headingDate = $heading !== $note['heading'] ? parseDiaryEntryTitle($heading) : null;
            if ($headingDate !== null
                && (!isset($input['folder_id']) || $folder_id === $currentFolderId)
                && $currentFolderId !== null
                && ($noteDiaryRoot = findDiaryRootForFolder($this->con, $note['workspace'], $currentFolderId)) !== null) {
                $dm = explode('-', $headingDate); // [YYYY, MM, DD]
                $targetPath = $noteDiaryRoot['name'] . '/' . $dm[0] . '/' . $dm[1];
                $targetId = resolveFolderPathToId($workspace, $targetPath, true, $this->con);
                if ($targetId && (int)$targetId !== $currentFolderId) {
                    $folder_id = (int)$targetId;
                    $folder = $dm[1]; // month folder name
                    $diaryFolderMoved = true;
                }
            }

            // Check heading uniqueness if changed
            if ($heading !== $note['heading']) {
                $checkQuery = "SELECT id FROM entries WHERE heading = ? AND trash = 0 AND id != ?";
                $params = [$heading, $noteId];
                
                if ($folder_id !== null) {
                    $checkQuery .= " AND folder_id = ?";
                    $params[] = $folder_id;
                } else {
                    $checkQuery .= " AND folder_id IS NULL";
                }
                
                if ($workspace) {
                    $checkQuery .= " AND workspace = ?";
                    $params[] = $workspace;
                }
                
                $checkStmt = $this->con->prepare($checkQuery);
                $checkStmt->execute($params);
                if ($checkStmt->fetchColumn()) {
                    $heading = generateUniqueTitle($heading, $noteId, $workspace, $folder_id);
                }
            }
            
            // Update file content if provided
            $noteType = $note['type'] ?? 'note';
            if ($entry !== null) {
                $filename = getEntryFilename($noteId, $noteType);
                $entriesDir = dirname($filename);
                createDirectoryWithPermissions($entriesDir);

                // Only the growth of the note file counts against the storage
                // quota, so a user over quota can still shrink their notes.
                $existingEntryBytes = is_file($filename) ? (int)filesize($filename) : 0;
                $quotaError = poznoteCheckStorageQuota(strlen((string)$entry) - $existingEntryBytes);
                if ($quotaError !== null) {
                    $this->sendError(403, $quotaError);
                    return;
                }

                // Sanitize HTML content to prevent XSS attacks
                $contentToSave = $entry;
                
                // For HTML notes (type='note'), sanitize and convert base64 images to attachments
                if ($noteType === 'note' && !empty($entry)) {
                    $contentToSave = sanitizeHtml($entry);
                    
                    // Convert any base64 images to attachments for performance
                    $existingAttachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
                    if (!is_array($existingAttachments)) $existingAttachments = [];
                    
                    $conversionResult = $this->convertBase64ImagesToAttachments($contentToSave, $noteId, $existingAttachments);
                    $contentToSave = $conversionResult['content'];
                    
                    // Update attachments in database if new images were converted
                    if (!empty($conversionResult['new_attachments'])) {
                        $updatedAttachments = array_merge($existingAttachments, $conversionResult['new_attachments']);
                        $attachmentsJson = json_encode($updatedAttachments);
                        $attachStmt = $this->con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
                        $attachStmt->execute([$attachmentsJson, $noteId]);
                    }
                }
                
                // For markdown notes, clean HTML if needed
                if ($noteType === 'markdown' && !empty($entry)) {
                    if (strpos($entry, '<div class="markdown-editor"') !== false) {
                        if (preg_match('/<div class="markdown-editor"[^>]*>(.*?)<\/div>/', $entry, $matches)) {
                            $contentToSave = strip_tags($matches[1]);
                            $contentToSave = html_entity_decode($contentToSave, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        }
                    }
                    // Sanitize markdown content with markdown-specific sanitizer to preserve syntax
                    $contentToSave = sanitizeMarkdownContent($contentToSave);
                }
                
                // Fail closed: only markdown and a *valid* JSON tasklist payload
                // skip HTML sanitization. Every other note type — including
                // excalidraw, an unknown type, or a tasklist whose stored content
                // is not valid JSON — must be sanitized as HTML to prevent stored
                // XSS (a valid JSON string can still embed markup, and
                // non-markdown/tasklist notes are rendered as raw HTML elsewhere).
                if (!empty($entry) && $noteType !== 'note' && $noteType !== 'markdown') {
                    $isStructuredJson = $noteType === 'tasklist'
                        && $this->isStructuredJsonPayload($entry);
                    if (!$isStructuredJson) {
                        $contentToSave = sanitizeHtml($entry);
                    }
                }

                $write_result = file_put_contents($filename, $contentToSave);
                if ($write_result === false) {
                    $this->sendError(500, 'Failed to write file');
                    return;
                }
                
                // Update the entry variable with sanitized content for database storage
                $entry = $contentToSave;
            }
            
            // Update database
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $entrycontent = $entry ?? '';
            
            $updateFields = ["heading = ?", "updated = ?"];
            $updateParams = [$heading, $now_utc];
            $updateFields[] = "updated_by_user_id = ?";
            $updateParams[] = $this->getActorUserId();
            
            if ($entry !== null) {
                $updateFields[] = "entry = ?";
                $updateParams[] = $entrycontent;
            }
            
            if ($tags !== null) {
                $updateFields[] = "tags = ?";
                $updateParams[] = $tags;
            }
            
            $updateFields[] = "folder = ?";
            $updateParams[] = $folder;
            
            $updateFields[] = "folder_id = ?";
            $updateParams[] = $folder_id;
            
            $updateFields[] = "workspace = ?";
            $updateParams[] = $workspace;
            
            $updateParams[] = $noteId;
            
            $sql = "UPDATE entries SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmt = $this->con->prepare($sql);
            
            if ($stmt->execute($updateParams)) {
                $updatedLinkedNotes = [];
                
                // If the heading changed, update linked notes that point to this note
                if ($heading !== $note['heading']) {
                    // Get IDs of linked notes before updating
                    $linkIdsStmt = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0");
                    $linkIdsStmt->execute([$noteId]);
                    $linkedNoteIds = $linkIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                    
                    if (!empty($linkedNoteIds)) {
                        $linkStmt = $this->con->prepare("UPDATE entries SET heading = ?, updated = ?, updated_by_user_id = ? WHERE linked_note_id = ? AND trash = 0");
                        $linkStmt->execute([$heading, $now_utc, $this->getActorUserId(), $noteId]);
                        $updatedLinkedNotes = $linkedNoteIds;
                    }
                }
                
                // New version token so the caller can chain conditional writes
                // without re-reading the note. Content is reloaded through the
                // same path show() uses, keeping both tokens consistent.
                $newContent = $this->loadNoteContentForVersion($noteId, $noteType, $entry !== null ? $entrycontent : ($note['entry'] ?? null));
                $newVersion = $this->computeNoteVersion($now_utc, $heading, $newContent);
                header('ETag: "' . $newVersion . '"');

                // Prepare response
                $response = [
                    'note' => [
                        'id' => $noteId,
                        'heading' => $heading,
                        'updated' => $now_utc,
                        'version' => $newVersion
                    ]
                ];
                if ($diaryFolderMoved) {
                    // The client must adopt the new folder id, otherwise its
                    // next autosave would move the note back.
                    $response['note']['folder_id'] = $folder_id;
                    $response['note']['folder_moved'] = true;
                }

                // Include updated linked note IDs if any
                if (!empty($updatedLinkedNotes)) {
                    $response['updated_linked_notes'] = $updatedLinkedNotes;
                }

                // If git_push was explicitly requested, do synchronous push and include result
                if ($gitPushRequested) {
                    $gitPushResult = $this->triggerGitSyncWithResult($noteId, 'push');
                    $response['git_push'] = $gitPushResult ?? ['triggered' => false, 'reason' => 'not configured or disabled'];
                    $this->sendSuccess($response);
                }
                // If auto-push is enabled, send response first then push in background
                else if ($autoPushEnabled) {
                    $this->sendSuccess($response);
                    $this->triggerGitSyncAsync($noteId, 'push');
                }
                // No git push needed
                else {
                    $this->sendSuccess($response);
                }
            } else {
                $this->sendError(500, 'Database error while updating note');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }

    /**
     * PUT /api/v1/notes/{id}/icon - Update note icon metadata
     */
    public function updateIcon(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $icon = isset($input['icon']) ? trim((string)$input['icon']) : '';
        $iconColor = isset($input['icon_color']) ? trim((string)$input['icon_color']) : '';
        $iconValue = $this->normalizeNoteIcon($icon);
        $iconColorValue = $iconColor === '' ? null : $iconColor;

        try {
            $existsStmt = $this->con->prepare('SELECT id FROM entries WHERE id = ? AND trash = 0');
            $existsStmt->execute([$noteId]);
            if (!$existsStmt->fetchColumn()) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $stmt = $this->con->prepare('UPDATE entries SET icon = ?, icon_color = ? WHERE id = ?');
            $success = $stmt->execute([$iconValue, $iconColorValue, $noteId]);

            if (!$success) {
                $this->sendError(500, 'Database error while updating note icon');
                return;
            }

            $this->sendSuccess([
                'message' => 'Note icon updated successfully',
                'icon' => $iconValue ?? self::DEFAULT_NOTE_ICON,
                'icon_color' => $iconColorValue
            ]);

            $this->triggerGitSync($noteId, 'push');
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }

    /**
     * PUT /api/v1/notes/{id}/color - Set or clear the note color.
     *
     * Accepts a palette id ('blue') or a custom '#rrggbb' literal.
     * An empty value clears the color.
     */
    public function updateColor(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $rawColor = isset($input['color']) ? trim((string)$input['color']) : '';
        $colorValue = normalizeStoredNoteColor($rawColor);
        if ($rawColor !== '' && $colorValue === null) {
            $this->sendError(400, 'Invalid color: expected a palette id or a #rrggbb value');
            return;
        }

        try {
            $existsStmt = $this->con->prepare('SELECT id FROM entries WHERE id = ? AND trash = 0');
            $existsStmt->execute([$noteId]);
            if (!$existsStmt->fetchColumn()) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $stmt = $this->con->prepare('UPDATE entries SET color = ? WHERE id = ?');
            $success = $stmt->execute([$colorValue, $noteId]);

            if (!$success) {
                $this->sendError(500, 'Database error while updating note color');
                return;
            }

            $this->sendSuccess([
                'message' => 'Note color updated successfully',
                'color' => $colorValue,
                'color_hex' => $colorValue !== null ? resolveNoteColorHex($colorValue) : null
            ]);

            $this->triggerGitSync($noteId, 'push');
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }

    /**
     * PUT /api/v1/notes/{id}/pinned
     * Pin or unpin a note. Pinned notes sort first on the dashboard board.
     *
     * Body: { "pinned": true|false }
     *
     * The caller sends the desired state rather than toggling, so two boards
     * open at once cannot flip each other's result.
     * Pinning is board presentation state, so it is deliberately not pushed to Git.
     */
    public function updatePinned(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input) || !array_key_exists('pinned', $input)) {
            $this->sendError(400, 'Invalid JSON in request body: expected a "pinned" boolean');
            return;
        }

        $pinned = filter_var($input['pinned'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($pinned === null) {
            $this->sendError(400, 'Invalid value for "pinned": expected a boolean');
            return;
        }

        try {
            $existsStmt = $this->con->prepare('SELECT id FROM entries WHERE id = ? AND trash = 0');
            $existsStmt->execute([$noteId]);
            if (!$existsStmt->fetchColumn()) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $stmt = $this->con->prepare('UPDATE entries SET pinned = ? WHERE id = ?');
            if (!$stmt->execute([$pinned ? 1 : 0, $noteId])) {
                $this->sendError(500, 'Database error while updating pinned state');
                return;
            }

            $this->sendSuccess([
                'message' => 'Note pinned state updated successfully',
                'pinned'  => $pinned
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }

    /**
     * PUT /api/v1/notes/{id}/content-width
     * Set the per-note content width override.
     * Body: { "content_width": 60 }     max width as a percentage of the note
     *                                   column (10 to 100, 100 = full width),
     *       { "content_width": null }   follow the global setting again.
     *
     * Presentation state like pinning, so it is not pushed to Git.
     */
    public function updateContentWidth(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input) || !array_key_exists('content_width', $input)) {
            $this->sendError(400, 'Invalid JSON in request body: expected a "content_width" percentage or null');
            return;
        }

        $contentWidth = $input['content_width'];
        if ($contentWidth !== null) {
            $contentWidth = filter_var($contentWidth, FILTER_VALIDATE_INT, ['options' => ['min_range' => 10, 'max_range' => 100]]);
            if ($contentWidth === false) {
                $this->sendError(400, 'Invalid value for "content_width": expected a percentage between 10 and 100, or null');
                return;
            }
        }

        try {
            $existsStmt = $this->con->prepare('SELECT id FROM entries WHERE id = ? AND trash = 0');
            $existsStmt->execute([$noteId]);
            if (!$existsStmt->fetchColumn()) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $stmt = $this->con->prepare('UPDATE entries SET content_width = ? WHERE id = ?');
            if (!$stmt->execute([$contentWidth, $noteId])) {
                $this->sendError(500, 'Database error while updating content width');
                return;
            }

            $this->sendSuccess([
                'message' => 'Note content width updated successfully',
                'content_width' => $contentWidth
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }

    /**
     * DELETE /api/v1/notes/{id}
     * Delete a note (soft delete by default)
     * 
     * Query params:
     *   - permanent: If true, permanently delete the note
     *   - workspace: Optional workspace filter
     */
    public function delete(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $permanent = filter_var($_GET['permanent'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $workspace = $_GET['workspace'] ?? null;
        
        try {
            // Get the note
            if ($workspace) {
                $stmt = $this->con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ? AND workspace = ?");
                $stmt->execute([$noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }

            // Never trash or delete a note out from under someone editing it
            $blockingLock = getBlockingNoteEditLock(
                $this->getNoteLockTargetUserId(),
                $noteId,
                $this->getNoteLockHolderUserId()
            );
            if ($blockingLock !== null) {
                $this->sendLockConflict(
                    'This note is currently being edited by ' . describeNoteEditLockHolder($blockingLock),
                    $blockingLock,
                    $this->getEditorSessionId()
                );
                return;
            }

            if ($permanent) {
                // Permanent deletion
                $this->permanentDelete($noteId, $note, $workspace);
            } else {
                // Soft delete (move to trash)
                if ($note['trash'] == 1) {
                    $this->sendError(400, 'Note is already in trash');
                    return;
                }
                
                // First, find and delete all linked notes that reference this note
                $linkedNotesStmt = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ?");
                $linkedNotesStmt->execute([$noteId]);
                $linkedNotes = $linkedNotesStmt->fetchAll(PDO::FETCH_ASSOC);
                
                $deletedLinkedCount = 0;
                foreach ($linkedNotes as $linkedNote) {
                    $linkedId = $linkedNote['id'];
                    if ($workspace) {
                        $delStmt = $this->con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now'), updated = datetime('now'), updated_by_user_id = ? WHERE id = ? AND workspace = ?");
                        $delStmt->execute([$this->getActorUserId(), $linkedId, $workspace]);
                    } else {
                        $delStmt = $this->con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now'), updated = datetime('now'), updated_by_user_id = ? WHERE id = ?");
                        $delStmt->execute([$this->getActorUserId(), $linkedId]);
                    }
                    $deletedLinkedCount++;
                }
                
                // Then delete the main note
                if ($workspace) {
                    $stmt = $this->con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now'), updated = datetime('now'), updated_by_user_id = ? WHERE id = ? AND workspace = ?");
                    $success = $stmt->execute([$this->getActorUserId(), $noteId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now'), updated = datetime('now'), updated_by_user_id = ? WHERE id = ?");
                    $success = $stmt->execute([$this->getActorUserId(), $noteId]);
                }
                
                if ($success) {
                    $this->sendSuccess([
                        'message' => 'Note moved to trash',
                        'note' => [
                            'id' => $noteId,
                            'heading' => $note['heading'],
                            'action' => 'moved_to_trash',
                            'deleted_linked_count' => $deletedLinkedCount
                        ]
                    ]);

                    // Trigger auto Git sync (delete from Git because it's in trash)
                    $this->triggerGitSync($noteId, 'delete');
                } else {
                    $this->sendError(500, 'Failed to move note to trash');
                }
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * Helper for permanent deletion
     */
    private function permanentDelete(int $noteId, array $note, ?string $workspace): void {
        // First, find and permanently delete all linked notes that reference this note
        $linkedNotesStmt = $this->con->prepare("SELECT id, type, attachments FROM entries WHERE linked_note_id = ?");
        $linkedNotesStmt->execute([$noteId]);
        $linkedNotes = $linkedNotesStmt->fetchAll(PDO::FETCH_ASSOC);

        // Free any share tokens in the master registry before the entries are
        // deleted (the ON DELETE CASCADE only removes the shared_notes rows)
        require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
        unregisterSharedLinksForNotes($this->con, array_merge([$noteId], array_column($linkedNotes, 'id')));

        $deletedLinkedCount = 0;
        foreach ($linkedNotes as $linkedNote) {
            $linkedId = $linkedNote['id'];
            
            // Delete linked note's file
            $linkedNoteType = $linkedNote['type'] ?? 'note';
            $linked_file_path = getEntryFilename($linkedId, $linkedNoteType);
            if (file_exists($linked_file_path)) {
                unlink($linked_file_path);
            }
            
            // Delete linked note's attachments
            $linkedAttachments = $linkedNote['attachments'] ? json_decode($linkedNote['attachments'], true) : [];
            if (is_array($linkedAttachments) && !empty($linkedAttachments)) {
                foreach ($linkedAttachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        // Local disk or S3 bucket
                        poznoteDeleteAttachmentFile($attachment['filename']);
                    }
                }
            }

            deleteNoteSnapshots($linkedId);
            
            // Delete linked note from database
            if ($workspace) {
                $delStmt = $this->con->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
                $delStmt->execute([$linkedId, $workspace]);
            } else {
                $delStmt = $this->con->prepare("DELETE FROM entries WHERE id = ?");
                $delStmt->execute([$linkedId]);
            }
            $deletedLinkedCount++;
        }
        
        // Delete attachments of the main note
        $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
        $deleted_attachments = [];
        
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    // Local disk or S3 bucket
                    poznoteDeleteAttachmentFile($attachment['filename']);
                    $deleted_attachments[] = $attachment['filename'];
                }
            }
        }
        
        // Delete note file
        $noteType = $note['type'] ?? 'note';
        $note_file_path = getEntryFilename($noteId, $noteType);
        
        $file_deleted = false;
        if (file_exists($note_file_path)) {
            $file_deleted = unlink($note_file_path);
        }
        
        // Delete PNG file for Excalidraw
        $png_file_path = getEntriesPath() . '/' . $noteId . '.png';
        $png_deleted = false;
        if (file_exists($png_file_path)) {
            $png_deleted = unlink($png_file_path);
        }

        deleteNoteSnapshots($noteId);

        // Delete database entry
        if ($workspace) {
            $stmt = $this->con->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
            $success = $stmt->execute([$noteId, $workspace]);
        } else {
            $stmt = $this->con->prepare("DELETE FROM entries WHERE id = ?");
            $success = $stmt->execute([$noteId]);
        }
        
        if ($success) {
            require_once dirname(__DIR__, 3) . '/ActivityLog.php';
            logActivity(ACTIVITY_NOTE_DELETED, [
                'note_id' => $noteId,
                'title' => $note['heading'] ?? null,
                'workspace' => $workspace,
                'linked_notes_deleted' => $deletedLinkedCount,
            ]);

            $this->sendSuccess([
                'message' => 'Note permanently deleted',
                'note' => [
                    'id' => $noteId,
                    'heading' => $note['heading'],
                    'file_deleted' => $file_deleted,
                    'png_file_deleted' => $png_deleted,
                    'attachments_deleted' => $deleted_attachments,
                    'linked_notes_deleted' => $deletedLinkedCount
                ]
            ]);
            
            // Trigger auto Git sync (after response is sent)
            $this->triggerGitSync($noteId, 'delete');
        } else {
            $this->sendError(500, 'Failed to delete note from database');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/restore
     * Restore a note from trash
     */
    public function restore(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $workspace = $input['workspace'] ?? $_GET['workspace'] ?? null;
        
        try {
            // Check if note exists and is in trash
            $checkSql = "SELECT id, heading, trash FROM entries WHERE id = ?";
            $checkParams = [$noteId];
            
            if ($workspace) {
                $checkSql .= " AND workspace = ?";
                $checkParams[] = $workspace;
            }
            
            $checkStmt = $this->con->prepare($checkSql);
            $checkStmt->execute($checkParams);
            $note = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            if ($note['trash'] == 0) {
                $this->sendError(400, 'Note is not in trash');
                return;
            }
            
            // Restore the note
            $updateSql = "UPDATE entries SET trash = 0, trashed_at = NULL WHERE id = ?";
            $updateParams = [$noteId];
            
            if ($workspace) {
                $updateSql .= " AND workspace = ?";
                $updateParams[] = $workspace;
            }
            
            $updateStmt = $this->con->prepare($updateSql);
            $result = $updateStmt->execute($updateParams);
            
            if ($result) {
                $this->sendSuccess([
                    'message' => 'Note restored successfully',
                    'note' => [
                        'id' => $noteId,
                        'heading' => $note['heading']
                    ]
                ]);

                // Trigger auto Git sync
                $this->triggerGitSync($noteId, 'push');
            } else {
                $this->sendError(500, 'Failed to restore note');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * PUT /api/v1/notes/{id}/tags
     * Apply/replace tags on a note
     * 
     * Body (JSON):
     *   - tags: Array of tag strings
     *   - workspace: Optional workspace filter
     */
    public function updateTags(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['tags'])) {
            $this->sendError(400, 'tags field is required');
            return;
        }
        
        $workspace = $input['workspace'] ?? null;
        $tags = $input['tags'];
        
        try {
            // Verify note exists
            if ($workspace) {
                $stmt = $this->con->prepare("SELECT id FROM entries WHERE id = ? AND workspace = ?");
                $stmt->execute([$noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("SELECT id FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
            if (!$stmt->fetch()) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Convert tags array to string
            $tags_string = $this->sanitizeTags($tags);
            
            // Update tags
            if ($workspace) {
                $stmt = $this->con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ? AND workspace = ?");
                $stmt->execute([$tags_string, $this->getActorUserId(), $noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ?");
                $stmt->execute([$tags_string, $this->getActorUserId(), $noteId]);
            }
            
            $this->sendSuccess([
                'message' => 'Tags updated successfully',
                'note' => [
                    'id' => $noteId,
                    'tags' => $tags_string
                ]
            ]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/beacon
     * Emergency save via sendBeacon (accepts FormData, not JSON)
     * Used when user closes the page and we need to save immediately
     */
    public function beaconSave(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        
        // sendBeacon sends FormData, not JSON
        $content = $_POST['content'] ?? '';
        $workspace = $_POST['workspace'] ?? null;
        $editorSessionId = $this->getEditorSessionId();
        
        if (empty($content)) {
            $this->sendError(400, 'Content is required');
            return;
        }

        if (!$this->validateCurrentNoteEditLock($noteId, $editorSessionId)) {
            return;
        }
        
        try {
            // Get note type
            $typeStmt = $this->con->prepare("SELECT type FROM entries WHERE id = ?");
            $typeStmt->execute([$noteId]);
            $noteType = $typeStmt->fetchColumn();
            
            if ($noteType === false) {
                $this->sendError(404, 'Note not found');
                return;
            }

            if ($noteType === 'note' && $content !== '') {
                $content = sanitizeHtml($content);
            }
            
            // Write file
            $filename = getEntryFilename($noteId, $noteType);
            $entriesDir = dirname($filename);
            createDirectoryWithPermissions($entriesDir);

            $existingEntryBytes = is_file($filename) ? (int)filesize($filename) : 0;
            $quotaError = poznoteCheckStorageQuota(strlen((string)$content) - $existingEntryBytes);
            if ($quotaError !== null) {
                $this->sendError(403, $quotaError);
                return;
            }

            $write_result = file_put_contents($filename, $content);
            if ($write_result === false) {
                $this->sendError(500, 'Failed to write file');
                return;
            }
            
            // Update database
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $stmt = $this->con->prepare("UPDATE entries SET entry = ?, updated = ?, updated_by_user_id = ? WHERE id = ?");
            
            if ($stmt->execute([$content, $now_utc, $this->getActorUserId(), $noteId])) {
                $this->sendSuccess(['id' => $noteId]);
                
                // Trigger auto Git sync on emergency save (leaving page)
                $this->triggerGitSync($noteId, 'push');
            } else {
                $this->sendError(500, 'Database error');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Server error');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/favorite
     * Toggle favorite status for a note
     */
    public function toggleFavorite($id) {
        $workspace = $_GET['workspace'] ?? null;
        
        // Also check JSON body for workspace
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$workspace && isset($input['workspace'])) {
            $workspace = $input['workspace'];
        }
        
        if (empty($id)) {
            $this->sendError(400, 'note_id is required');
            return;
        }
        
        try {
            // Get current favorite status
            if ($workspace) {
                $query = "SELECT favorite FROM entries WHERE id = ? AND workspace = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$id, $workspace]);
            } else {
                $query = "SELECT favorite FROM entries WHERE id = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$id]);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$result) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            $currentFavorite = $result['favorite'];
            $newFavorite = $currentFavorite ? 0 : 1;
            
            // Update database
            if ($workspace) {
                $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ? AND workspace = ?";
                $updateStmt = $this->con->prepare($updateQuery);
                $success = $updateStmt->execute([$newFavorite, $id, $workspace]);
            } else {
                $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ?";
                $updateStmt = $this->con->prepare($updateQuery);
                $success = $updateStmt->execute([$newFavorite, $id]);
            }
            
            if ($success) {
                $this->sendSuccess(['is_favorite' => $newFavorite]);
            } else {
                $this->sendError(500, 'Error updating database');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Error toggling favorite: ' . $e->getMessage());
        }
    }
    
    /**
     * Clone a note with optional overrides for folder, heading prefix, etc.
     * Backs duplicate().
     *
     * @param string $id         Source note ID
     * @param array  $options    Optional overrides:
     *   'headingPrefix'  => string  Prefix prepended to heading (default: '')
     *   'folderId'       => int     Override target folder_id (omit to keep original)
     *   'folderName'     => string  Override target folder name (omit to keep original)
     *   'autoShare'      => bool    Auto-share if folder is shared (default: true)
     *   'successMessage' => string  Message in response
     *   'extraResponse'  => array   Extra keys merged into response
     */
    private function cloneNote(string $id, array $options = []): void {
        $headingPrefix  = $options['headingPrefix'] ?? '';
        $overrideFolder = array_key_exists('folderId', $options);
        $autoShare      = $options['autoShare'] ?? true;
        $successMessage = $options['successMessage'] ?? 'Note cloned successfully';
        $extraResponse  = $options['extraResponse'] ?? [];

        try {
            $stmt = $this->con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments, icon, icon_color, color, content_width FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$id]);
            $originalNote = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$originalNote) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $cloneAttachmentsBytes = 0;
            foreach ((json_decode($originalNote['attachments'] ?? '', true) ?: []) as $originalAttachment) {
                $cloneAttachmentsBytes += (int)($originalAttachment['file_size'] ?? 0);
            }
            $quotaError = poznoteCheckNoteQuota($this->con)
                ?? poznoteCheckStorageQuota($cloneAttachmentsBytes + strlen((string)$originalNote['entry']));
            if ($quotaError !== null) {
                $this->sendError(403, $quotaError);
                return;
            }

            $cloned = poznoteCloneNoteRecord($this->con, (int)$id, [
                'headingPrefix' => $headingPrefix,
                'actorUserId'   => $this->getActorUserId(),
            ] + ($overrideFolder ? [
                'folderId'   => $options['folderId'] ?? null,
                'folderName' => $options['folderName'] ?? null,
            ] : []));
            if ($cloned === null) {
                $this->sendError(404, 'Note not found');
                return;
            }
            $newId = $cloned['id'];
            $newHeading = $cloned['heading'];

            // Notes duplicated into a shared folder inherit access through the folder only.
            $wasShared = false;

            http_response_code(201);
            $this->sendSuccess(array_merge([
                'id' => $newId,
                'heading' => $newHeading,
                'message' => $successMessage,
                'share_delta' => $wasShared ? 1 : 0
            ], $extraResponse));

        } catch (Exception $e) {
            $this->sendError(500, $successMessage . ' failed: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/v1/notes/{id}/duplicate
     * Duplicate a note
     *
     * Body (JSON, optional):
     *   - folder_id: target folder for the copy; '' or 0 for the root.
     *                Omit to leave the copy next to the original.
     *   - workspace: workspace the target folder must belong to
     */
    public function duplicate(string $id): void {
        $options = ['successMessage' => 'Note duplicated successfully'];

        $input = json_decode(file_get_contents('php://input'), true);
        if (is_array($input) && array_key_exists('folder_id', $input)) {
            $targetFolderId = $input['folder_id'];
            $targetFolderId = ($targetFolderId === null || $targetFolderId === '') ? 0 : (int)$targetFolderId;
            if ($targetFolderId > 0) {
                $workspace = isset($input['workspace']) ? trim((string)$input['workspace']) : '';
                if ($workspace !== '') {
                    $stmt = $this->con->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
                    $stmt->execute([$targetFolderId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT name FROM folders WHERE id = ?");
                    $stmt->execute([$targetFolderId]);
                }
                $folderName = $stmt->fetchColumn();
                if ($folderName === false) {
                    $this->sendError(404, 'Target folder not found');
                    return;
                }
                $options['folderId'] = $targetFolderId;
                $options['folderName'] = (string)$folderName;
            } else {
                $options['folderId'] = null;
                $options['folderName'] = null;
            }
        }

        $this->cloneNote($id, $options);
    }
    
    /**
     * GET /api/v1/notes/resolve
     * Resolve a note reference by ID or heading
     */
    public function resolveReference(): void {
        $reference = $_GET['reference'] ?? null;
        $workspace = $_GET['workspace'] ?? null;
        
        if (!$reference) {
            $this->sendError(400, 'No reference provided');
            return;
        }
        
        try {
            if (is_numeric($reference)) {
                $noteId = intval($reference);
                if ($workspace) {
                    $sql = "SELECT id, heading FROM entries WHERE trash = 0 AND id = ? AND workspace = ?";
                    $params = [$noteId, $workspace];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                } else {
                    $sql = "SELECT id, heading FROM entries WHERE trash = 0 AND id = ?";
                    $params = [$noteId];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                }
            } else {
                if ($workspace) {
                    $sql = "SELECT id, heading FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) AND workspace = ?";
                    $params = ['%' . $reference . '%', $workspace];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $sql .= " ORDER BY updated DESC LIMIT 1";
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                } else {
                    $sql = "SELECT id, heading FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?)";
                    $params = ['%' . $reference . '%'];
                    $this->appendPublicWorkspaceAgeFilter($sql, $params);
                    $sql .= " ORDER BY updated DESC LIMIT 1";
                    $stmt = $this->con->prepare($sql);
                    $stmt->execute($params);
                }
            }
            
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($note) {
                $this->sendSuccess([
                    'id' => $note['id'],
                    'heading' => $note['heading']
                ]);
            } else {
                $this->sendError(404, 'Note not found');
            }
        } catch (Exception $e) {
            $this->sendError(500, 'Database error: ' . $e->getMessage());
        }
    }
    
    /**
     * GET /api/v1/notes/with-attachments
     * List notes that have attachments
     */
    public function listWithAttachments(): void {
        $workspace = $_GET['workspace'] ?? null;
        
        try {
            $query = "SELECT id, heading, entry, attachments, updated 
                      FROM entries 
                      WHERE trash = 0 
                      AND attachments IS NOT NULL 
                      AND attachments != '' 
                      AND attachments != '[]'";
            
            $params = [];
            
            if ($workspace !== null && $workspace !== '') {
                $query .= " AND workspace = ?";
                $params[] = $workspace;
            }

            $this->appendPublicWorkspaceAgeFilter($query, $params);
            
            $query .= " ORDER BY updated DESC";
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            
            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $attachments = json_decode($row['attachments'], true);
                if (is_array($attachments) && count($attachments) > 0) {
                    $notes[] = [
                        'id' => $row['id'],
                        'heading' => $row['heading'],
                        'entry' => $row['entry'],
                        'attachments' => $attachments,
                        'updated' => $row['updated']
                    ];
                }
            }
            
            $this->sendSuccess([
                'notes' => $notes,
                'count' => count($notes)
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Database error: ' . $e->getMessage());
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/convert
     * Convert note between markdown and HTML
     */
    public function convert(string $id): void {
        $input = json_decode(file_get_contents('php://input'), true);
        $targetType = isset($input['target']) ? strtolower(trim($input['target'])) : '';
        
        if (!in_array($targetType, ['html', 'markdown'], true)) {
            $this->sendError(400, 'Invalid target type. Use "html" or "markdown"');
            return;
        }
        
        try {
            $stmt = $this->con->prepare('SELECT id, heading, type, attachments, folder_id FROM entries WHERE id = ? AND trash = 0');
            $stmt->execute([$id]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            $currentType = $note['type'] ?? 'note';
            
            // Validate conversion
            if ($targetType === 'html' && $currentType !== 'markdown') {
                $this->sendError(400, 'Only markdown notes can be converted to HTML');
                return;
            }
            
            if ($targetType === 'markdown' && !in_array($currentType, ['note', 'html'], true)) {
                $this->sendError(400, 'Only HTML notes can be converted to markdown');
                return;
            }
            
            $currentFilePath = getEntryFilename($id, $currentType);
            
            if (!file_exists($currentFilePath) || !is_readable($currentFilePath)) {
                $this->sendError(404, 'Note file not found');
                return;
            }
            
            $content = file_get_contents($currentFilePath);
            $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
            $attachmentsDir = getAttachmentsPath();
            
            // Convert content
            if ($targetType === 'markdown') {
                // Converting HTML to markdown: extract base64 images and save as attachments
                
                // Find all base64 images in HTML: <img src="data:image/...;base64,...">
                $content = preg_replace_callback(
                    '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
                    function($matches) use ($id, $attachmentsDir, &$attachments) {
                        $imageType = strtolower($matches[1]);
                        $base64Data = $matches[2];
                        $altText = isset($matches[3]) ? $matches[3] : '';
                        
                        $extensionMap = [
                            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
                            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) return $matches[0];
                        
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;

                        // Local disk or S3 bucket
                        if (!poznoteStoreAttachmentContent($imageData, $filename, $mimeType)) return $matches[0];

                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $attachments[] = [
                            'id' => $attachmentId, 'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData), 'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        
                        return '<img src="/api/v1/notes/' . $id . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '">';
                    },
                    $content
                );
                
                // Also handle case where alt comes before src
                $content = preg_replace_callback(
                    '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
                    function($matches) use ($id, $attachmentsDir, &$attachments) {
                        $altText = $matches[1];
                        $imageType = strtolower($matches[2]);
                        $base64Data = $matches[3];
                        
                        $extensionMap = [
                            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
                            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) return $matches[0];
                        
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;

                        // Local disk or S3 bucket
                        if (!poznoteStoreAttachmentContent($imageData, $filename, $mimeType)) return $matches[0];

                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $attachments[] = [
                            'id' => $attachmentId, 'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData), 'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        
                        return '<img src="/api/v1/notes/' . $id . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '">';
                    },
                    $content
                );
                
                $convertedContent = $this->htmlToMarkdown($content);
                $newType = 'markdown';
            } else {
                // Converting markdown to HTML: keep attachments as attachments (don't convert to base64)
                // The parseMarkdown function will convert markdown image syntax to HTML img tags
                // and keep the attachment URLs intact
                
                require_once __DIR__ . '/../../../markdown_parser.php';
                $convertedContent = parseMarkdown($content);
                $newType = 'note';
                
                // Note: Attachments are preserved during conversion
                // No files are deleted, all attachments remain available
            }
            
            // Create new file with converted content
            $newFilePath = getEntryFilename($id, $newType);
            if (file_put_contents($newFilePath, $convertedContent) === false) {
                $this->sendError(500, 'Failed to save converted note');
                return;
            }
            chmod($newFilePath, 0644);
            
            // Update database
            $attachmentsJson = !empty($attachments) ? json_encode($attachments) : null;
            $updateStmt = $this->con->prepare("UPDATE entries SET type = ?, attachments = ?, updated = datetime('now'), updated_by_user_id = ? WHERE id = ?");
            $updateStmt->execute([$newType, $attachmentsJson, $this->getActorUserId(), $id]);
            
            // Delete old file if extension changed
            if ($currentFilePath !== $newFilePath && file_exists($currentFilePath)) {
                unlink($currentFilePath);
            }
            
            $this->sendSuccess([
                'id' => $id,
                'type' => $newType,
                'message' => 'Note converted successfully'
            ]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Error converting note: ' . $e->getMessage());
        }
    }
    
    /**
     * Convert an HTML fragment to Markdown without touching any note.
     *
     * Backs the "Paste as Markdown" modal: the browser can only read the
     * clipboard's text/html flavour during a real paste event, so the editor
     * sends that markup here and inserts the Markdown that comes back. Reusing
     * htmlToMarkdown() keeps a single converter for both this and whole-note
     * conversion, so the two can never drift apart.
     */
    public function convertHtml(): void {
        $input = json_decode(file_get_contents('php://input'), true);
        $html = isset($input['html']) ? (string) $input['html'] : '';

        if (trim($html) === '') {
            $this->sendError(400, 'Missing "html" field');
            return;
        }

        // Bounded so a runaway paste cannot tie up the regex pipeline.
        if (strlen($html) > 2000000) {
            $this->sendError(413, 'HTML content too large');
            return;
        }

        try {
            $this->sendSuccess(['markdown' => $this->htmlToMarkdown($html)]);
        } catch (Exception $e) {
            error_log('convertHtml error: ' . $e->getMessage());
            $this->sendError(500, 'Conversion failed');
        }
    }

    /**
     * Convert HTML to Markdown. The converter lives in html_to_markdown.php,
     * shared with the AI assistant (which reads rich-text notes through it),
     * so the two can never drift apart.
     */
    private function htmlToMarkdown(string $html): string {
        require_once __DIR__ . '/../../../html_to_markdown.php';
        return poznoteHtmlToMarkdown($html);
    }
    
    /**
     * GET /api/v1/notes/search
     * Search notes by text query
     * 
     * Query params:
     *   - q: Search query (required)
     *   - limit: Maximum number of results (default: 10)
     *   - workspace: Filter by workspace
     *   - created_from: Filter notes created on or after this date (YYYY-MM-DD)
     *   - created_to: Filter notes created on or before this date (YYYY-MM-DD)
     */
    public function search(): void {
        $query = $_GET['q'] ?? '';
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
        $workspace = $_GET['workspace'] ?? null;
        $createdFromRaw = trim((string)($_GET['created_from'] ?? ''));
        $createdToRaw = trim((string)($_GET['created_to'] ?? ''));
        $createdFrom = normalizeDateOnlyFilter($createdFromRaw);
        $createdTo = normalizeDateOnlyFilter($createdToRaw);
        
        if (empty($query)) {
            $this->sendError(400, 'Search query (q) is required');
            return;
        }

        if ($createdFromRaw !== '' && $createdFrom === '') {
            $this->sendError(400, 'created_from must use YYYY-MM-DD format');
            return;
        }

        if ($createdToRaw !== '' && $createdTo === '') {
            $this->sendError(400, 'created_to must use YYYY-MM-DD format');
            return;
        }

        if ($createdFrom !== '' && $createdTo !== '' && $createdFrom > $createdTo) {
            $this->sendError(400, 'created_from must be before or equal to created_to');
            return;
        }
        
        try {
            // Build search query using accent-insensitive search
            $sql = "SELECT id, heading, tags, folder, folder_id, workspace, updated, created, 
                                                     SUBSTR(search_clean_entry(entry, type), 1, 300) as excerpt
                    FROM entries 
                    WHERE trash = 0 
                    AND (remove_accents(heading) LIKE remove_accents(?) 
                                                 OR remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?))";
            
            $params = ['%' . $query . '%', '%' . $query . '%'];
            
            if ($workspace) {
                $sql .= " AND workspace = ?";
                $params[] = $workspace;
            }

            $createdFromUtc = dateOnlyFilterToUtcBoundary($createdFrom, false);
            if ($createdFromUtc !== null) {
                $sql .= " AND created >= ?";
                $params[] = $createdFromUtc;
            }

            $createdToUtc = dateOnlyFilterToUtcBoundary($createdTo, true);
            if ($createdToUtc !== null) {
                $sql .= " AND created <= ?";
                $params[] = $createdToUtc;
            }

            $this->appendPublicWorkspaceAgeFilter($sql, $params);
            
            $sql .= " ORDER BY 
                        CASE WHEN remove_accents(heading) LIKE remove_accents(?) THEN 0 ELSE 1 END,
                        updated DESC
                      LIMIT ?";
            $params[] = '%' . $query . '%';
            $params[] = $limit;
            
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            
            $results = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                // Highlight query in excerpt
                $excerpt = $row['excerpt'] ?? '';
                if (!empty($excerpt) && strlen($excerpt) >= 300) {
                    $excerpt .= '...';
                }
                
                $results[] = [
                    'id' => (int)$row['id'],
                    'heading' => $row['heading'] ?? 'Untitled',
                    'tags' => $row['tags'] ?? '',
                    'folder' => $row['folder'],
                    'folder_id' => $row['folder_id'] ? (int)$row['folder_id'] : null,
                    'workspace' => $row['workspace'],
                    'excerpt' => $excerpt,
                    'updated' => $row['updated'],
                    'created' => $row['created'],
                ];
            }
            
            $this->sendSuccess([
                'query' => $query,
                'count' => count($results),
                'results' => $results
            ]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Search error occurred');
        }
    }
    
    /**
     * Determine whether a structured-note payload (tasklist/excalidraw) is
     * actually valid JSON. Used to fail closed: a structured note whose stored
     * content is not valid JSON is treated as untrusted HTML and sanitized.
     *
     * @param string $content Raw note content to validate.
     * @return bool True only when $content decodes to a JSON array/object.
     */
    private function isStructuredJsonPayload(string $content): bool {
        $trimmed = trim($content);
        if ($trimmed === '') {
            return false;
        }
        // Structured payloads are JSON arrays or objects, never bare scalars.
        if ($trimmed[0] !== '[' && $trimmed[0] !== '{') {
            return false;
        }
        $decoded = json_decode($trimmed, true);
        return json_last_error() === JSON_ERROR_NONE && is_array($decoded);
    }

    /**
     * Sanitize and normalize a tags value (string or array) into a clean comma-separated string.
     */
    private function sanitizeTags($tags): string {
        if (empty($tags)) return '';
        if (is_array($tags)) {
            $tagsArray = $tags;
        } else {
            $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
        }
        $validTags = [];
        foreach ($tagsArray as $tag) {
            $tag = is_string($tag) ? trim($tag) : '';
            if (!empty($tag)) {
                $tag = str_replace(' ', '_', $tag);
                $validTags[] = $tag;
            }
        }
        return implode(', ', $validTags);
    }
    
    /**
     * Convert base64 images in HTML content to attachments
     * @param string $content HTML content with potential base64 images
     * @param int $noteId Note ID for attachment URLs
     * @param array $existingAttachments Existing attachments array
     * @return array ['content' => modified HTML, 'new_attachments' => array of new attachments]
     */
    private function convertBase64ImagesToAttachments(string $content, int $noteId, array $existingAttachments): array {
        $newAttachments = [];
        $attachmentsDir = getAttachmentsPath();
        
        // Pattern 1: src before alt - <img src="data:image/...;base64,..." alt="...">
        $content = preg_replace_callback(
            '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
            function($matches) use ($noteId, $attachmentsDir, &$newAttachments) {
                return $this->processBase64Image($matches[1], $matches[2], $matches[3] ?? '', $noteId, $attachmentsDir, $newAttachments);
            },
            $content
        );
        
        // Pattern 2: alt before src - <img alt="..." src="data:image/...;base64,...">
        $content = preg_replace_callback(
            '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
            function($matches) use ($noteId, $attachmentsDir, &$newAttachments) {
                return $this->processBase64Image($matches[2], $matches[3], $matches[1], $noteId, $attachmentsDir, $newAttachments);
            },
            $content
        );
        
        return [
            'content' => $content,
            'new_attachments' => $newAttachments
        ];
    }
    
    /**
     * Process a single base64 image and convert to attachment
     */
    private function processBase64Image(string $imageType, string $base64Data, string $altText, int $noteId, string $attachmentsDir, array &$newAttachments): string {
        $imageType = strtolower($imageType);
        
        $extensionMap = [
            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
        ];
        $extension = $extensionMap[$imageType] ?? 'png';
        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
        
        $imageData = base64_decode($base64Data);
        if ($imageData === false) {
            // Return original if decode fails
            return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
        }
        
        $attachmentId = uniqid();
        $filename = $attachmentId . '_' . time() . '.' . $extension;

        if (!poznoteStoreAttachmentContent($imageData, $filename, $mimeType)) {
            // Return original if write fails
            return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
        }

        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
        $newAttachments[] = [
            'id' => $attachmentId,
            'filename' => $filename,
            'original_filename' => $originalFilename,
            'file_size' => strlen($imageData),
            'file_type' => $mimeType,
            'uploaded_at' => date('Y-m-d H:i:s')
        ];
        
        return '<img src="/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '" loading="lazy" decoding="async">';
    }

    /**
     * Send a success response
     */
    private function sendSuccess(array $data): void {
        echo json_encode(array_merge(['success' => true], $data));
    }
    
    /**
     * Send an error response
     */
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message
        ]);
    }

    /**
     * Trigger automatic Git synchronization if enabled (asynchronously)
     * This method is called after responses are sent to avoid blocking the UI.
     */
    private function triggerGitSync(int $noteId, string $action = 'push'): void {
        // Delegate to async method - no HTTP response needed
        $this->triggerGitSyncAsync($noteId, $action);
    }

    /**
     * Trigger Git sync and return a result array for inclusion in the API response.
     */
    private function triggerGitSyncWithResult(int $noteId, string $action = 'push'): array {
        try {
            $gitSyncFile = dirname(__DIR__, 3) . '/GitSync.php';
            if (!file_exists($gitSyncFile)) {
                return ['triggered' => false, 'reason' => 'GitSync not found'];
            }
            require_once $gitSyncFile;
            $gitSync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
            if (!$gitSync->isAutoPushEnabled()) {
                return ['triggered' => false, 'reason' => 'not configured or disabled'];
            }
            if ($action === 'push') {
                $result = $gitSync->pushNote($noteId);
                return [
                    'triggered' => true,
                    'success'   => $result['success'] ?? false,
                    'error'     => $result['error'] ?? null,
                ];
            } elseif ($action === 'delete') {
                $stmt = $this->con->prepare("SELECT heading, folder_id, workspace, type FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
                $note = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($note) {
                    $gitSync->deleteNoteInGit($noteId, $note['folder_id'], $note['workspace'], $note['type'], $note['heading']);
                }
                return ['triggered' => true, 'success' => true];
            }
            return ['triggered' => false, 'reason' => 'unknown action'];
        } catch (Exception $e) {
            error_log("Git auto-sync error: " . $e->getMessage());
            return ['triggered' => true, 'success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Trigger Git sync asynchronously (in background after HTTP response is sent)
     * This prevents blocking the user interface during automatic pushes.
     */
    private function triggerGitSyncAsync(int $noteId, string $action = 'push'): void {
        // Close the HTTP connection so the client doesn't wait
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } else {
            // Fallback for non-FastCGI environments
            // Flush all output buffers and close connection
            if (ob_get_level() > 0) {
                ob_end_flush();
            }
            flush();
            if (function_exists('session_write_close')) {
                session_write_close();
            }
        }

        // Continue executing in background - push to Git
        try {
            $gitSyncFile = dirname(__DIR__, 3) . '/GitSync.php';
            if (!file_exists($gitSyncFile)) {
                error_log("Git auto-sync: GitSync.php not found");
                return;
            }
            require_once $gitSyncFile;
            $gitSync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
            if (!$gitSync->isAutoPushEnabled()) {
                return; // Silently skip if auto-push is not enabled
            }
            if ($action === 'push') {
                $result = $gitSync->pushNote($noteId);
                if (!$result['success']) {
                    error_log("Git auto-sync push failed for note {$noteId}: " . ($result['error'] ?? 'unknown error'));
                }
            } elseif ($action === 'delete') {
                $stmt = $this->con->prepare("SELECT heading, folder_id, workspace, type FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
                $note = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($note) {
                    $result = $gitSync->deleteNoteInGit($noteId, $note['folder_id'], $note['workspace'], $note['type'], $note['heading']);
                    if (!$result['success']) {
                        error_log("Git auto-sync delete failed for note {$noteId}: " . ($result['error'] ?? 'unknown error'));
                    }
                }
            }
        } catch (Exception $e) {
            error_log("Git auto-sync error: " . $e->getMessage());
        }
    }
}
