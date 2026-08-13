<?php
/**
 * Tasks Controller
 *
 * Aggregates the tasks of every tasklist note in a workspace for the
 * global tasks page (tasks.php), and exposes per-task CRUD so API/MCP
 * clients can manage a single task without rewriting the whole note.
 *
 * Task content is stored as a JSON array in the note body. The on-disk
 * entry file is the source of truth; the database `entry` column is only
 * used as a fallback (it can be stale, see kanban_content.php).
 */

class TasksController
{
    private PDO $con;

    public function __construct(PDO $con)
    {
        $this->con = $con;
    }

    private function appendPublicWorkspaceAgeFilter(string &$sql, array &$params, string $column = 'updated'): void
    {
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

    /**
     * GET /api/v1/tasks
     *
     * Returns every non-trash tasklist note of the workspace with its
     * decoded task array:
     *   { success: true, notes: [{ id, heading, folder, workspace, updated, tasks: [...] }] }
     */
    public function index(): void
    {
        try {
            $workspace = '';
            if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
                $workspace = (string) (function_exists('getPublicWorkspaceName') ? getPublicWorkspaceName() : '');
            } elseif (isset($_GET['workspace']) && is_string($_GET['workspace'])) {
                $workspace = trim($_GET['workspace']);
            }

            $sql = "SELECT id, heading, folder, folder_id, workspace, updated, favorite, entry
                      FROM entries
                     WHERE trash = 0
                       AND type = 'tasklist'";
            $params = [];
            if ($workspace !== '') {
                $sql .= ' AND workspace = ?';
                $params[] = $workspace;
            }
            $this->appendPublicWorkspaceAgeFilter($sql, $params);
            $sql .= ' ORDER BY updated DESC';

            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $notes = [];
            foreach ($rows as $row) {
                $fileContent = '';
                $filename = getEntryFilename((int) $row['id'], 'tasklist');
                if (is_file($filename)) {
                    $fileContent = (string) @file_get_contents($filename);
                }

                $notes[] = [
                    'id'        => (int) $row['id'],
                    'heading'   => (string) ($row['heading'] ?? ''),
                    'folder'    => (string) ($row['folder'] ?? ''),
                    'folder_id' => $row['folder_id'] !== null ? (int) $row['folder_id'] : null,
                    'workspace' => (string) ($row['workspace'] ?? ''),
                    'updated'   => (string) ($row['updated'] ?? ''),
                    'favorite'  => (int) ($row['favorite'] ?? 0) === 1,
                    'tasks'     => $this->decodeTasks($fileContent, (string) ($row['entry'] ?? '')),
                ];
            }

            echo json_encode(['success' => true, 'notes' => $notes], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to load tasks']);
        }
    }

    /**
     * GET /api/v1/notes/{id}/tasks
     *
     * List the tasks of a single tasklist note.
     */
    public function listForNote(string $id): void
    {
        $note = $this->loadTasklistNote($id);
        if ($note === null) {
            return;
        }

        $this->sendSuccess([
            'note_id' => $note['id'],
            'heading' => $note['heading'],
            'tasks'   => $this->decodeTasks($note['fileContent'], $note['dbContent']),
        ]);
    }

    /**
     * POST /api/v1/notes/{id}/tasks
     *
     * Append a task to a tasklist note.
     *
     * Body (JSON):
     *   - text: task label (required)
     *   - completed / important: booleans (optional, default false)
     *   - due_at: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' local time (optional)
     *   - reminder: whether the due date raises a notification (optional)
     *   - reminder_email: email opt-in for that notification (optional)
     *   - recurrence: '<count><unit>' with unit i/h/d/w/m/y (optional)
     */
    public function createForNote(string $id): void
    {
        $note = $this->loadTasklistNote($id);
        if ($note === null) {
            return;
        }

        $input = $this->readJsonBody();
        if ($input === null) {
            return;
        }

        $text = isset($input['text']) && is_scalar($input['text']) ? trim((string) $input['text']) : '';
        if ($text === '') {
            $this->sendError(400, 'text is required');
            return;
        }

        $fields = $this->readTaskFields($input, true);
        if ($fields === null) {
            return;
        }

        $tasks = $this->decodeRawTasks($note);
        $task = array_merge([
            'id'        => $this->generateTaskId($tasks),
            'text'      => $text,
            'noteId'    => $note['id'],
            'completed' => false,
            'important' => false,
            'dueAt'     => null,
        ], $fields);

        $tasks[] = $task;
        $tasks = $this->regroupTasks($tasks);

        if (!$this->persistTasks($note['id'], $tasks)) {
            return;
        }
        // The id is freshly allocated, so there is no pending reminder to replace.
        if (!empty($task['dueReminder'])) {
            $this->syncTaskReminder($note['id'], $task);
        }

        $this->sendSuccess(['note_id' => $note['id'], 'task' => $task]);
    }

    /**
     * PATCH /api/v1/notes/{id}/tasks/{taskId}
     *
     * Update one task. Only the provided fields change; passing due_at as null
     * clears the due date and its pending reminder.
     */
    public function updateForNote(string $id, string $taskId): void
    {
        $note = $this->loadTasklistNote($id);
        if ($note === null) {
            return;
        }

        $input = $this->readJsonBody();
        if ($input === null) {
            return;
        }

        $tasks = $this->decodeRawTasks($note);
        $index = $this->findTaskIndex($tasks, $taskId);
        if ($index === null) {
            $this->sendError(404, 'Task not found');
            return;
        }

        $fields = $this->readTaskFields($input, false);
        if ($fields === null) {
            return;
        }

        if (array_key_exists('text', $input)) {
            if (!is_scalar($input['text']) || trim((string) $input['text']) === '') {
                $this->sendError(400, 'text cannot be empty');
                return;
            }
            $fields['text'] = trim((string) $input['text']);
        }

        $previous = $tasks[$index];
        $task = array_merge($previous, $fields);

        // Completing a task retires its pending reminder, mirroring the UI.
        if (!empty($task['completed'])) {
            $task['dueReminder'] = false;
        }

        if (!$this->requireReminderHasDueDate($task)) {
            return;
        }

        $tasks[$index] = $task;
        $tasks = $this->regroupTasks($tasks);

        if (!$this->persistTasks($note['id'], $tasks)) {
            return;
        }
        if ($this->reminderNeedsSync($previous, $task)) {
            $this->syncTaskReminder($note['id'], $task);
        }

        $this->sendSuccess(['note_id' => $note['id'], 'task' => $task]);
    }

    /**
     * DELETE /api/v1/notes/{id}/tasks/{taskId}
     */
    public function deleteForNote(string $id, string $taskId): void
    {
        $note = $this->loadTasklistNote($id);
        if ($note === null) {
            return;
        }

        $tasks = $this->decodeRawTasks($note);
        $index = $this->findTaskIndex($tasks, $taskId);
        if ($index === null) {
            $this->sendError(404, 'Task not found');
            return;
        }

        array_splice($tasks, $index, 1);

        if (!$this->persistTasks($note['id'], $tasks)) {
            return;
        }
        $this->deleteTaskReminder($note['id'], $taskId);

        $this->sendSuccess(['note_id' => $note['id'], 'task_id' => $taskId]);
    }

    /**
     * Load a non-trashed tasklist note, or emit the matching error response.
     * Returns null when the caller should stop (response already sent).
     */
    private function loadTasklistNote(string $id): ?array
    {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return null;
        }
        $noteId = (int) $id;

        $sql = 'SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0';
        $params = [$noteId];
        if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
            $sql .= ' AND workspace = ?';
            $params[] = (string) (function_exists('getPublicWorkspaceName') ? getPublicWorkspaceName() : '');
        }

        $stmt = $this->con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            $this->sendError(404, 'Note not found');
            return null;
        }
        if (($row['type'] ?? '') !== 'tasklist') {
            $this->sendError(400, 'Note is not a tasklist');
            return null;
        }

        $filename = getEntryFilename($noteId, 'tasklist');
        $fileContent = is_file($filename) ? (string) @file_get_contents($filename) : '';

        return [
            'id'          => $noteId,
            'heading'     => (string) ($row['heading'] ?? ''),
            'fileContent' => $fileContent,
            'dbContent'   => (string) ($row['entry'] ?? ''),
        ];
    }

    /**
     * Decode the stored tasks without the response whitelist, so keys the
     * interface writes but the API does not expose (noteId, and anything a
     * future version adds) survive a write. decodeTasks() is for responses;
     * this is what the mutating endpoints must read and write back.
     */
    private function decodeRawTasks(array $note): array
    {
        $tasks = json_decode(resolveTasklistStoredContent($note['fileContent'], $note['dbContent']), true);

        if (!is_array($tasks)) {
            return [];
        }
        if (isset($tasks['tasks']) && is_array($tasks['tasks'])) {
            $tasks = $tasks['tasks'];
        }
        if ($tasks !== [] && !isset($tasks[0])) {
            return [];
        }

        return array_values(array_filter($tasks, 'is_array'));
    }

    /**
     * Decode the JSON request body, or emit a 400 and return null.
     */
    private function readJsonBody(): ?array
    {
        $input = json_decode((string) file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($input)) {
            $this->sendError(400, 'Invalid JSON in request body');
            return null;
        }
        return $input;
    }

    /**
     * Translate the public task fields of a request body into stored keys.
     * Returns null when a value is invalid (response already sent).
     */
    private function readTaskFields(array $input, bool $isCreate): ?array
    {
        $fields = [];

        foreach ([
            'completed'      => 'completed',
            'important'      => 'important',
            'reminder'       => 'dueReminder',
            'reminder_email' => 'dueReminderEmail',
        ] as $key => $storedKey) {
            if (array_key_exists($key, $input)) {
                $fields[$storedKey] = (bool) filter_var($input[$key], FILTER_VALIDATE_BOOLEAN);
            }
        }

        if (array_key_exists('due_at', $input)) {
            $dueAt = $input['due_at'];
            if ($dueAt === null || $dueAt === '') {
                $fields['dueAt'] = null;
                // A cleared due date cannot keep raising a reminder.
                $fields['dueReminder'] = false;
            } elseif (is_string($dueAt) && preg_match('/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2})?$/', trim($dueAt), $m)) {
                $normalized = $m[1] . ($m[2] ?? '');
                if (strtotime($m[1]) === false) {
                    $this->sendError(400, 'Invalid due_at date');
                    return null;
                }
                $fields['dueAt'] = $normalized;
            } else {
                $this->sendError(400, "Invalid due_at format (expected 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM')");
                return null;
            }
        }

        if (array_key_exists('recurrence', $input)) {
            $recurrence = $input['recurrence'];
            if ($recurrence === null || $recurrence === '' || $recurrence === 'none') {
                $fields['dueRecurrence'] = null;
            } elseif (is_string($recurrence) && preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', strtolower(trim($recurrence)))) {
                $fields['dueRecurrence'] = strtolower(trim($recurrence));
            } else {
                $this->sendError(400, 'Invalid recurrence format (expected e.g. "30i", "1h", "1d", "2w", "3m", "1y")');
                return null;
            }
        }

        // A reminder without a due date has nothing to trigger on. On update the
        // due date may come from the stored task, so the caller validates the
        // merged state through requireReminderHasDueDate() instead.
        if ($isCreate && !empty($fields['dueReminder']) && empty($fields['dueAt'])) {
            $this->sendError(400, 'reminder requires due_at');
            return null;
        }

        return $fields;
    }

    /**
     * Reject a task whose reminder would never fire. Applied to the merged task
     * so an update can enable the reminder on an existing due date.
     */
    private function requireReminderHasDueDate(array $task): bool
    {
        $dueAt = $task['dueAt'] ?? null;
        if (!empty($task['dueReminder']) && (!is_string($dueAt) || $dueAt === '')) {
            $this->sendError(400, 'reminder requires due_at');
            return false;
        }
        return true;
    }

    /**
     * Whether an update touches anything the pending notification is built from.
     * Reminders are only rewritten when it does, so an unrelated change (for
     * instance the important flag) cannot resurrect an already-dismissed one.
     */
    private function reminderNeedsSync(array $before, array $after): bool
    {
        foreach (['dueAt', 'dueReminder', 'dueReminderEmail', 'dueRecurrence', 'completed', 'text'] as $key) {
            $old = $before[$key] ?? null;
            $new = $after[$key] ?? null;
            if (in_array($key, ['dueReminder', 'completed'], true)) {
                $old = !empty($old);
                $new = !empty($new);
            }
            if ($old !== $new) {
                return true;
            }
        }
        return false;
    }

    /**
     * Restore the order the UI maintains: important-incomplete, then normal
     * incomplete, then completed. Order inside each group is preserved, so a
     * manual drag-and-drop arrangement survives untouched groups.
     * Mirrors groupTasksByStatus() in js/tasklist.js.
     */
    private function regroupTasks(array $tasks): array
    {
        $important = [];
        $normal = [];
        $completed = [];

        foreach ($tasks as $task) {
            if (!empty($task['completed'])) {
                $completed[] = $task;
            } elseif (!empty($task['important'])) {
                $important[] = $task;
            } else {
                $normal[] = $task;
            }
        }

        return array_merge($important, $normal, $completed);
    }

    /**
     * Allocate a task id in the format the frontend uses (float timestamp),
     * guaranteed not to collide with an existing one.
     */
    private function generateTaskId(array $tasks)
    {
        $existing = [];
        foreach ($tasks as $task) {
            if (isset($task['id'])) {
                $existing[$this->taskIdToString($task['id'])] = true;
            }
        }

        do {
            $candidate = round(microtime(true) * 1000) + (mt_rand(1, 999999) / 1000000);
        } while (isset($existing[$this->taskIdToString($candidate)]));

        return $candidate;
    }

    /**
     * Render a task id the way it appears in the stored JSON.
     *
     * Task ids are JS floats such as 1786657214842.3545. A plain (string) cast
     * goes through PHP's precision=14 setting and yields "1786657214842.4",
     * which would never match the id the client holds, so the value has to be
     * formatted with the same full precision json_encode uses.
     */
    private function taskIdToString($id): string
    {
        if (is_float($id)) {
            return json_encode($id);
        }
        return is_scalar($id) ? (string) $id : '';
    }

    /**
     * Locate a task by its id, comparing as strings so 1.5 and "1.5" match.
     */
    private function findTaskIndex(array $tasks, string $taskId): ?int
    {
        $needle = trim($taskId);
        foreach ($tasks as $i => $task) {
            if (isset($task['id']) && $this->taskIdToString($task['id']) === $needle) {
                return (int) $i;
            }
        }
        return null;
    }

    /**
     * Write the task array back to the entry file and the database.
     * Returns false when the response has already been sent (quota error).
     */
    private function persistTasks(int $noteId, array $tasks): bool
    {
        $content = json_encode(array_values($tasks), JSON_UNESCAPED_UNICODE);
        if ($content === false) {
            $this->sendError(500, 'Failed to encode tasks');
            return false;
        }

        $filename = getEntryFilename($noteId, 'tasklist');
        $existingBytes = is_file($filename) ? (int) filesize($filename) : 0;
        if (function_exists('poznoteCheckStorageQuota')) {
            $quotaError = poznoteCheckStorageQuota(strlen($content) - $existingBytes);
            if ($quotaError !== null) {
                $this->sendError(403, $quotaError);
                return false;
            }
        }

        createDirectoryWithPermissions(dirname($filename));
        file_put_contents($filename, $content);

        $stmt = $this->con->prepare("UPDATE entries SET entry = ?, updated = datetime('now') WHERE id = ?");
        $stmt->execute([$content, $noteId]);

        return true;
    }

    /**
     * Keep the notifications table in step with a task's due date/reminder,
     * the same way the due-date modal does in the UI. The stored dueAt is a
     * naive local datetime, so it is resolved through the user's timezone.
     */
    private function syncTaskReminder(int $noteId, array $task): void
    {
        $taskId = isset($task['id']) ? $this->taskIdToString($task['id']) : '';
        if ($taskId === '') {
            return;
        }

        $dueAt = $task['dueAt'] ?? null;
        $wantsReminder = !empty($task['dueReminder']) && is_string($dueAt) && $dueAt !== '' && empty($task['completed']);

        // A task that no longer wants a reminder still needs its pending one dropped.
        if (!$wantsReminder) {
            $this->deleteTaskReminder($noteId, $taskId);
            return;
        }

        // A date-only due date fires at 09:00 local, matching the UI default.
        $local = strlen($dueAt) > 10 ? $dueAt . ':00' : $dueAt . 'T09:00:00';
        try {
            $timezone = new DateTimeZone(function_exists('getUserTimezone') ? getUserTimezone() : 'UTC');
            $triggerAt = (new DateTime($local, $timezone))
                ->setTimezone(new DateTimeZone('UTC'))
                ->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            return;
        }

        $recurrence = $task['dueRecurrence'] ?? null;
        if (!is_string($recurrence) || !preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', $recurrence)) {
            $recurrence = null;
        }

        // Email delivery is an explicit opt-in gated on SMTP actually being
        // usable, the same way RemindersController::setTaskReminder does.
        $emailEnabled = !empty($task['dueReminderEmail']) && $this->isReminderEmailAvailable();

        // Replace any pending reminder of this task
        $this->deleteTaskReminder($noteId, $taskId);

        $stmt = $this->con->prepare("
            INSERT INTO notifications (note_id, task_id, type, message, trigger_at, email_enabled, recurrence, created)
            VALUES (?, ?, 'reminder', ?, ?, ?, ?, datetime('now'))
        ");
        $stmt->execute([
            $noteId,
            $taskId,
            (string) ($task['text'] ?? ''),
            $triggerAt,
            $emailEnabled ? 1 : 0,
            $recurrence,
        ]);
    }

    /**
     * Whether reminder emails can actually be sent (SMTP configured and the
     * user has a valid address). Mirrors RemindersController.
     */
    private function isReminderEmailAvailable(): bool
    {
        if (!function_exists('getGlobalSetting')) {
            require_once dirname(__DIR__, 3) . '/users/db_master.php';
        }
        if (!function_exists('getGlobalSetting')) {
            return false;
        }

        $enabledSetting = getGlobalSetting('smtp_enabled', null);
        if ($enabledSetting !== null && $enabledSetting !== '' && !filter_var($enabledSetting, FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        $host = trim((string) getGlobalSetting('smtp_host', ''));
        $fromEmail = trim((string) getGlobalSetting('smtp_from_email', ''));
        if ($host === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        if (function_exists('getCurrentUser')) {
            $user = getCurrentUser();
            return filter_var(trim((string) ($user['email'] ?? '')), FILTER_VALIDATE_EMAIL) !== false;
        }

        return true;
    }

    /**
     * Drop the pending notification of a task (if any).
     */
    private function deleteTaskReminder(int $noteId, string $taskId): void
    {
        $this->con->prepare('DELETE FROM notifications WHERE note_id = ? AND task_id = ? AND dismissed = 0')
            ->execute([$noteId, $taskId]);
    }

    private function sendSuccess(array $data): void
    {
        echo json_encode(array_merge(['success' => true], $data), JSON_UNESCAPED_UNICODE);
    }

    private function sendError(int $code, string $message): void
    {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $message]);
    }

    /**
     * Decode normalized tasklist content into a clean task array.
     */
    private function decodeTasks(string $fileContent, string $dbContent): array
    {
        $normalized = resolveTasklistStoredContent($fileContent, $dbContent);
        $tasks = json_decode($normalized, true);

        if (json_last_error() !== JSON_ERROR_NONE || !is_array($tasks)) {
            return [];
        }

        if (isset($tasks['tasks']) && is_array($tasks['tasks'])) {
            $tasks = $tasks['tasks'];
        }

        if ($tasks !== [] && !isset($tasks[0])) {
            return [];
        }

        $clean = [];
        foreach ($tasks as $task) {
            if (!is_array($task)) {
                continue;
            }

            $text = $task['text'] ?? ($task['content'] ?? '');
            $dueAt = $task['dueAt'] ?? null;
            // 'YYYY-MM-DD' with an optional local time: 'YYYY-MM-DDTHH:MM'
            if (!is_string($dueAt) || !preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/', $dueAt, $dueMatch)) {
                $dueAt = null;
            } else {
                $dueAt = substr($dueAt, 0, empty($dueMatch[1]) ? 10 : 16);
            }

            $cleanTask = [
                'id'          => is_scalar($task['id'] ?? null) ? $task['id'] : null,
                'text'        => is_scalar($text) ? (string) $text : '',
                'completed'   => !empty($task['completed']),
                'important'   => !empty($task['important']),
                'dueAt'       => $dueAt,
                'dueReminder' => !empty($task['dueReminder']),
            ];
            // Only expose the email opt-in when it was actually stored; the
            // due-date modal defaults it to true for never-configured tasks
            if (array_key_exists('dueReminderEmail', $task)) {
                $cleanTask['dueReminderEmail'] = !empty($task['dueReminderEmail']);
            }
            $dueRecurrence = $task['dueRecurrence'] ?? null;
            if (is_string($dueRecurrence) && preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', $dueRecurrence)) {
                $cleanTask['dueRecurrence'] = $dueRecurrence;
            }
            $clean[] = $cleanTask;
        }

        return $clean;
    }
}
