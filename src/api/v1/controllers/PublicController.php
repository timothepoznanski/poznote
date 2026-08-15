<?php
/**
 * Public Controller for Poznote REST API v1
 *
 * Handles public interactions with shared notes (like checking tasks).
 */

require_once __DIR__ . '/../../../users/db_master.php';

class PublicController {
    private PDO $con;
    
    public function __construct(PDO $con) {
        $this->con = $con;
    }
    
    /**
     * PATCH /api/v1/public/tasks/{id_or_index}
     * Query Params:
     *   - token: The shared note token
     * Body (JSON):
     *   - completed: Optional boolean status
     *   - text: Optional string for task text
     */
    public function updateTask(string $id_or_index): void {
        $token = $_GET['token'] ?? null;
        if (!$token) {
            $this->sendError(400, 'Token missing');
            return;
        }

        $sharedNote = $this->validateTokenAndGetNote($token);
        if (!$sharedNote) return;

        if (!$this->canToggleTasks($sharedNote['access_mode'] ?? 'full')) {
            $this->sendError(403, 'This shared task list is read-only');
            return;
        }
        
        $noteId = $sharedNote['note_id'];
        $input = json_decode(file_get_contents('php://input'), true);
        if ($input === null) {
            $this->sendError(400, 'Invalid JSON body');
            return;
        }

        $note = $this->getNote($noteId);
        if (!$note) return;
        
        $type = $note['type'] ?? 'note';
        $content = $this->getNoteContent($noteId, $type, $note['entry'] ?? '');
        $updatedContent = $content;

        if (!$this->canEditTaskText($sharedNote['access_mode'] ?? 'full') && array_key_exists('text', $input)) {
            $this->sendError(403, 'This shared task list only allows checking tasks');
            return;
        }
        
        if ($type === 'tasklist') {
            $index = (int)$id_or_index;
            $tasks = json_decode($content, true);
            if (!is_array($tasks) || !isset($tasks[$index])) {
                $this->sendError(400, 'Invalid task index');
                return;
            }
            if (isset($input['completed'])) $tasks[$index]['completed'] = (bool)$input['completed'];
            if (isset($input['text'])) $tasks[$index]['text'] = (string)$input['text'];
            
            // Re-sort: uncompleted first, then completed
            usort($tasks, function($a, $b) {
                $aComp = !empty($a['completed']) ? 1 : 0;
                $bComp = !empty($b['completed']) ? 1 : 0;
                return $aComp <=> $bComp;
            });
            
            $updatedContent = json_encode($tasks, JSON_UNESCAPED_UNICODE);
        } elseif ($type === 'markdown') {
            $lineIndex = (int)$id_or_index;
            $lines = explode("\n", $content);
            if (!isset($lines[$lineIndex])) {
                $this->sendError(400, 'Invalid line index');
                return;
            }
            $line = $lines[$lineIndex];
            if (isset($input['completed'])) {
                if ($input['completed']) {
                    $lines[$lineIndex] = preg_replace('/^(\s*[\*\-\+]\s+\[)[ xX](\])/', '$1x$2', $line);
                } else {
                    $lines[$lineIndex] = preg_replace('/^(\s*[\*\-\+]\s+\[)[ xX](\])/', '$1 $2', $line);
                }
            }
            // Editing text in markdown is trickier because we need to preserve the leading checkbox structure
            if (isset($input['text'])) {
                $newText = (string)$input['text'];
                // Match the prefix (indent + marker + checkbox)
                if (preg_match('/^(\s*[\*\-\+]\s+\[[ xX]\]\s+)(.*)$/', $line, $matches)) {
                    $lines[$lineIndex] = $matches[1] . $newText;
                } else {
                    // Fallback: if it's not a standard checkbox line, we might not want to edit it this way
                    $this->sendError(400, 'Target line is not a valid markdown checkbox');
                    return;
                }
            }
            $updatedContent = implode("\n", $lines);
        } else {
            $this->sendError(400, 'Note type does not support task updates');
            return;
        }
        
        $this->saveNote($noteId, $type, $updatedContent);
        $this->sendSuccess(['success' => true]);
    }

    /**
     * POST /api/v1/public/tasks
     * Query Params:
     *   - token: The shared note token
     * Body (JSON):
     *   - text: Task text
     */
    public function addTask(): void {
        $token = $_GET['token'] ?? null;
        if (!$token) {
            $this->sendError(400, 'Token missing');
            return;
        }

        $sharedNote = $this->validateTokenAndGetNote($token);
        if (!$sharedNote) return;

        if (!$this->canFullyEditTasks($sharedNote['access_mode'] ?? 'full')) {
            $this->sendError(403, 'This shared task list does not allow adding tasks');
            return;
        }
        
        $noteId = $sharedNote['note_id'];
        $input = json_decode(file_get_contents('php://input'), true);
        if (empty($input['text'])) {
            $this->sendError(400, 'Task text is required');
            return;
        }

        $note = $this->getNote($noteId);
        if (!$note) return;
        
        $type = $note['type'] ?? 'note';
        if ($type !== 'tasklist' && $type !== 'markdown') {
            $this->sendError(400, 'Note type does not support adding tasks publicly');
            return;
        }

        $content = $this->getNoteContent($noteId, $type);
        $updatedContent = $content;
        
        if ($type === 'tasklist') {
            $tasks = json_decode($content, true) ?: [];
            $tasks[] = [
                'text' => (string)$input['text'],
                'completed' => false,
                'important' => false
            ];
            $updatedContent = json_encode($tasks, JSON_UNESCAPED_UNICODE);
        } else {
            // Markdown: append a new checkbox at the end
            $prefix = "- [ ] ";
            $updatedContent = rtrim($content) . "\n" . $prefix . (string)$input['text'];
        }
        
        $this->saveNote($noteId, $type, $updatedContent);
        $this->sendSuccess(['success' => true]);
    }

    /**
     * DELETE /api/v1/public/tasks/{id_or_index}
     * Query Params:
     *   - token: The shared note token
     */
    public function deleteTask(string $id_or_index): void {
        $token = $_GET['token'] ?? null;
        if (!$token) {
            $this->sendError(400, 'Token missing');
            return;
        }

        $sharedNote = $this->validateTokenAndGetNote($token);
        if (!$sharedNote) return;

        if (!$this->canFullyEditTasks($sharedNote['access_mode'] ?? 'full')) {
            $this->sendError(403, 'This shared task list does not allow deleting tasks');
            return;
        }
        
        $noteId = $sharedNote['note_id'];
        $note = $this->getNote($noteId);
        if (!$note || ($note['type'] ?? 'note') !== 'tasklist') {
            $this->sendError(400, 'Only tasklist notes support public deletion of items');
            return;
        }

        $content = $this->getNoteContent($noteId, 'tasklist');
        $tasks = json_decode($content, true);
        $index = (int)$id_or_index;
        
        if (is_array($tasks) && isset($tasks[$index])) {
            array_splice($tasks, $index, 1);
            $updatedContent = json_encode($tasks, JSON_UNESCAPED_UNICODE);
            $this->saveNote($noteId, 'tasklist', $updatedContent);
            $this->sendSuccess(['success' => true]);
        } else {
            $this->sendError(400, 'Invalid task index');
        }
    }

    /**
     * PATCH /api/v1/public/notes/content
     * Replaces the text content of a publicly shared HTML or markdown note.
     * Only allowed when the share's access_mode is 'edit'.
     * Query Params:
     *   - token: The shared note token
     * Body (JSON):
     *   - content: The new note content (HTML for 'note', raw source for 'markdown')
     */
    public function updateNoteContent(): void {
        $token = $_GET['token'] ?? null;
        if (!$token) {
            $this->sendError(400, 'Token missing');
            return;
        }

        $sharedNote = $this->validateTokenAndGetNote($token);
        if (!$sharedNote) return;

        if (($sharedNote['access_mode'] ?? '') !== 'edit') {
            $this->sendError(403, 'This shared note is read-only');
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input) || !array_key_exists('content', $input) || !is_string($input['content'])) {
            $this->sendError(400, 'Content is required');
            return;
        }
        $content = $input['content'];

        $noteId = (int)$sharedNote['note_id'];
        $note = $this->getNote($noteId);
        if (!$note) return;

        $type = $note['type'] ?? 'note';
        if ($type !== 'note' && $type !== 'markdown') {
            $this->sendError(400, 'This note type does not support public text editing');
            return;
        }

        // Concurrent-edit guard: refuse the save while someone else (another
        // public visitor, or an account user inside the app) holds the note's
        // edit lock. Requests without an editor_session_id (one-shot API
        // clients) are still allowed when nobody is editing.
        if (!$this->currentRequestMayWriteNote($noteId, $this->getEditorSessionId($input))) {
            return;
        }

        // Same server-side sanitization as authenticated saves: never trust
        // the submitted markup, whoever holds the link.
        if ($type === 'note') {
            $content = $this->stripPublicUrlBase($content);
            $content = $this->stripShareTokensFromAttachmentUrls($content);
            $content = sanitizeHtml($content);
        } else {
            $content = sanitizeMarkdownContent($content);
        }

        $filename = getEntryFilename($noteId, $type);
        // Only the growth of the note file counts against the storage quota,
        // matching NotesController::update().
        $existingEntryBytes = is_file($filename) ? (int)filesize($filename) : 0;
        $quotaError = poznoteCheckStorageQuota(strlen($content) - $existingEntryBytes);
        if ($quotaError !== null) {
            $this->sendError(403, $quotaError);
            return;
        }

        // Best-effort daily snapshot of the pre-edit content (same protection
        // the app applies on authenticated edits), so a public editor cannot
        // silently destroy the owner's text.
        try {
            require_once __DIR__ . '/SnapshotsController.php';
            (new SnapshotsController($this->con))->createSnapshotForNote($noteId, false);
        } catch (Throwable $e) {
            error_log('Public edit snapshot failed: ' . $e->getMessage());
        }

        $this->saveNote($noteId, $type, $content);
        $this->sendSuccess(['success' => true]);
    }

    /**
     * POST /api/v1/public/notes/lock
     * Acquires (or refreshes) the exclusive edit lock for a publicly shared
     * note on behalf of an anonymous visitor. Only allowed on 'edit' shares.
     * Query Params:
     *   - token: The shared note token
     * Body (JSON):
     *   - editor_session_id: Opaque per-tab editor session identifier
     */
    public function acquireEditLock(): void {
        $context = $this->resolveEditLockContext();
        if ($context === null) return;

        $result = acquireNoteEditLock(
            $context['owner_id'],
            $context['note_id'],
            $context['owner_id'],
            $context['editor_session_id'],
            90,
            'public'
        );

        if (!empty($result['success'])) {
            $this->sendSuccess(['success' => true]);
            return;
        }

        $this->sendError(423, 'This note is currently being edited by someone else');
    }

    /**
     * POST /api/v1/public/notes/lock/heartbeat
     * Keeps an acquired public edit lock alive (same semantics as acquire).
     */
    public function heartbeatEditLock(): void {
        $this->acquireEditLock();
    }

    /**
     * POST /api/v1/public/notes/lock/release
     * Releases the public edit lock held by this editor session.
     */
    public function releaseEditLock(): void {
        $context = $this->resolveEditLockContext();
        if ($context === null) return;

        releaseNoteEditLock(
            $context['owner_id'],
            $context['note_id'],
            $context['owner_id'],
            $context['editor_session_id'],
            'public'
        );

        $this->sendSuccess(['success' => true]);
    }

    /**
     * Shared validation for the public edit lock endpoints: the token must
     * resolve to an 'edit' share (password and allowed_users checks included)
     * and the request must carry an editor session id. Sends the error
     * response and returns null when any check fails.
     */
    private function resolveEditLockContext(): ?array {
        $token = $_GET['token'] ?? null;
        if (!$token) {
            $this->sendError(400, 'Token missing');
            return null;
        }

        $sharedNote = $this->validateTokenAndGetNote($token);
        if (!$sharedNote) return null;

        if (($sharedNote['access_mode'] ?? '') !== 'edit') {
            $this->sendError(403, 'This shared note is read-only');
            return null;
        }

        $ownerId = $this->getShareOwnerUserId();
        if ($ownerId <= 0) {
            $this->sendError(500, 'Unable to resolve the share owner');
            return null;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $editorSessionId = $this->getEditorSessionId(is_array($input) ? $input : null);
        if ($editorSessionId === '') {
            $this->sendError(400, 'editor_session_id is required');
            return null;
        }

        return [
            'note_id' => (int)$sharedNote['note_id'],
            'owner_id' => $ownerId,
            'editor_session_id' => $editorSessionId,
        ];
    }

    /**
     * The account whose note space the share token routed us to; edit locks
     * live in the master database keyed by this owner id, which makes them
     * shared with the in-app editor of the same note.
     */
    private function getShareOwnerUserId(): int {
        return (int)($GLOBALS['activeUserId'] ?? 0);
    }

    private function getEditorSessionId(?array $input): string {
        if (is_array($input) && isset($input['editor_session_id'])) {
            return trim((string)$input['editor_session_id']);
        }

        if (isset($_SERVER['HTTP_X_EDITOR_SESSION_ID'])) {
            return trim((string)$_SERVER['HTTP_X_EDITOR_SESSION_ID']);
        }

        return '';
    }

    /**
     * True when no other editor holds the note's edit lock. On conflict the
     * 423 error response is sent here.
     */
    private function currentRequestMayWriteNote(int $noteId, string $editorSessionId): bool {
        $ownerId = $this->getShareOwnerUserId();
        if ($ownerId <= 0) {
            return true;
        }

        $lock = getNoteEditLock($ownerId, $noteId);
        if (!$lock) {
            return true;
        }

        $holdsLock = ($lock['holder_kind'] ?? 'user') === 'public'
            && $editorSessionId !== ''
            && (string)$lock['holder_session_id'] === $editorSessionId;
        if ($holdsLock) {
            return true;
        }

        $this->sendError(423, 'This note is currently being edited by someone else');
        return false;
    }

    /**
     * public_note.php rewrites attachment URLs to absolute protocol-relative
     * form for display. Reverse that before saving so the stored note keeps
     * the same relative URLs the in-app editor produces.
     */
    private function stripPublicUrlBase(string $content): string {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if ($host === '') {
            return $content;
        }
        $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/\\');
        $scriptDir = preg_replace('#/api/v1$#', '', $scriptDir);
        $base = preg_quote($host . $scriptDir, '#');
        return preg_replace(
            '#(src|href)=(["\']?)(?:https?:)?//' . $base . '(/(?:api/v1/notes/\d+/attachments/|data/(?:users/\d+/)?attachments/))#i',
            '$1=$2$3',
            $content
        );
    }

    /**
     * Attachment URLs displayed on the public page carry the share token as a
     * query parameter. Never persist it into the note: the owner may renew the
     * token, and the stored note must keep working inside the app.
     */
    private function stripShareTokensFromAttachmentUrls(string $content): string {
        return preg_replace_callback(
            '#(src|href)=(["\']?)([^"\'\s>]*api/v1/notes/\d+/attachments/[^"\'\s>]*)#i',
            function ($m) {
                $url = preg_replace('/([?&])(?:token|folder_token)=[^&#"\'\s>]*/i', '$1', $m[3]);
                $url = str_replace('?&', '?', $url);
                $url = preg_replace('/&{2,}/', '&', $url);
                $url = rtrim($url, '?&');
                return $m[1] . '=' . $m[2] . $url;
            },
            $content
        );
    }

    private function validateTokenAndGetNote(string $token): ?array {
        $stmt = $this->con->prepare('SELECT note_id, password, access_mode, allowed_users FROM shared_notes WHERE token = ? AND access_mode IS NOT NULL');
        $stmt->execute([$token]);
        $sharedNote = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedNote) {
            $this->sendError(404, 'Shared note not found');
            return null;
        }
        if (!$this->passesUserRestriction($sharedNote['allowed_users'] ?? null)) {
            return null;
        }
        if (!empty($sharedNote['password'])) {
            $sessionKey = 'public_note_auth_' . $token;
            if (!isset($_SESSION[$sessionKey]) || $_SESSION[$sessionKey] !== true) {
                $this->sendError(401, 'Authentication required');
                return null;
            }
        }
        $sharedNote['access_mode'] = $this->normalizeAccessMode($sharedNote['access_mode'] ?? 'full');
        return $sharedNote;
    }

    /**
     * Mirror public_note.php's allowed_users gate for the write API: when the
     * share is restricted to specific users, the requester must be logged in
     * as the share owner or one of the listed users. The owner is the account
     * the token routed us to ($activeUserId in db_connect.php), never the
     * session user, because public token routing overrides the session.
     */
    private function passesUserRestriction($allowedUsersRaw): bool {
        if (empty($allowedUsersRaw)) {
            return true;
        }
        $allowedUserIds = is_array($allowedUsersRaw) ? $allowedUsersRaw : json_decode($allowedUsersRaw, true);
        if (!is_array($allowedUserIds) || empty($allowedUserIds)) {
            return true;
        }

        $currentUserId = $_SESSION['user_id'] ?? null;
        if ($currentUserId === null) {
            $this->sendError(401, 'Login required to access this shared note');
            return false;
        }

        $ownerId = $GLOBALS['activeUserId'] ?? null;
        if ($ownerId !== null && (int)$currentUserId === (int)$ownerId) {
            return true;
        }

        if (!in_array((int)$currentUserId, array_map('intval', $allowedUserIds), true)) {
            $this->sendError(403, 'You do not have permission to access this shared note');
            return false;
        }

        return true;
    }

    private function normalizeAccessMode(string $accessMode): string {
        return in_array($accessMode, ['read_only', 'check_only', 'full', 'edit'], true) ? $accessMode : 'full';
    }

    private function canToggleTasks(string $accessMode): bool {
        return in_array($this->normalizeAccessMode($accessMode), ['check_only', 'full', 'edit'], true);
    }

    private function canEditTaskText(string $accessMode): bool {
        return in_array($this->normalizeAccessMode($accessMode), ['full', 'edit'], true);
    }

    private function canFullyEditTasks(string $accessMode): bool {
        return in_array($this->normalizeAccessMode($accessMode), ['full', 'edit'], true);
    }

    private function getNote(int $noteId): ?array {
        $stmt = $this->con->prepare('SELECT type, entry FROM entries WHERE id = ? AND trash = 0');
        $stmt->execute([$noteId]);
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$note) {
            $this->sendError(404, 'Note not found');
            return null;
        }
        return $note;
    }

    private function getNoteContent(int $noteId, string $type, string $databaseContent = ''): string {
        $filename = getEntryFilename($noteId, $type);
        $fileContent = '';
        if (file_exists($filename) && is_readable($filename)) {
            $fileContent = file_get_contents($filename);
            if ($fileContent === false) {
                $fileContent = '';
            }
        }

        if ($type === 'tasklist') {
            if ($databaseContent === '') {
                $stmt = $this->con->prepare('SELECT entry FROM entries WHERE id = ?');
                $stmt->execute([$noteId]);
                $databaseContent = (string) ($stmt->fetchColumn() ?: '');
            }

            return resolveTasklistStoredContent($fileContent, $databaseContent);
        }

        if ($fileContent !== '') {
            return $fileContent;
        }

        if ($databaseContent !== '') {
            return $databaseContent;
        }

        $stmt = $this->con->prepare('SELECT entry FROM entries WHERE id = ?');
        $stmt->execute([$noteId]);
        return $stmt->fetchColumn() ?: '';
    }

    private function saveNote(int $noteId, string $type, string $content): void {
        $filename = getEntryFilename($noteId, $type);
        $entriesDir = dirname($filename);
        createDirectoryWithPermissions($entriesDir);
        file_put_contents($filename, $content);
        
        $stmt = $this->con->prepare('UPDATE entries SET entry = ?, updated = datetime("now") WHERE id = ?');
        $stmt->execute([$content, $noteId]);
    }
    
    private function sendSuccess(array $data): void {
        echo json_encode(array_merge(['success' => true], $data));
    }
    
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $message]);
    }
}
