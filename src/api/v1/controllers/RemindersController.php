<?php
/**
 * RemindersController - RESTful API controller for note reminders and notifications
 * 
 * Endpoints:
 *   GET    /api/v1/reminders              - List pending notifications (due reminders)
 *   POST   /api/v1/notes/{id}/reminder    - Set a reminder on a note
 *   DELETE /api/v1/notes/{id}/reminder    - Remove a reminder from a note
 *   POST   /api/v1/reminders/{id}/read    - Mark a notification as read
 *   POST   /api/v1/reminders/{id}/dismiss - Dismiss a notification
 *   POST   /api/v1/reminders/dismiss-all  - Dismiss all notifications
 */

class RemindersController {
    private PDO $con;
    
    public function __construct(PDO $con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/reminders
     * List pending notifications (triggered reminders that are not dismissed)
     */
    public function index(): void {
        $this->rememberDetectedAppUrl();

        try {
            $now = gmdate('Y-m-d H:i:s');
            $workspace = $_GET['workspace'] ?? null;
            $hasWorkspace = $workspace !== null && $workspace !== '';

            $workspaceClause = $hasWorkspace ? 'AND e.workspace = ?' : '';
            $params = $hasWorkspace ? [$now, $workspace] : [$now];

            $stmt = $this->con->prepare("
                SELECT n.id, n.note_id, n.type, n.message, n.is_read, n.created, n.trigger_at,
                       e.heading AS note_heading,
                       CASE WHEN n.task_id IS NOT NULL AND n.task_id != ''
                            THEN n.recurrence
                            ELSE e.reminder_recurrence END AS recurrence
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0
                  AND n.trigger_at <= ?
                  $workspaceClause
                ORDER BY n.trigger_at DESC
                LIMIT 50
            ");
            $stmt->execute($params);
            $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Also count triggered notifications (read or unread) and triggered unread notifications
            $countParams = $hasWorkspace ? [$now, $workspace] : [$now];
            $countStmt = $this->con->prepare("
                SELECT
                    COUNT(*) as total_count,
                    COALESCE(SUM(CASE WHEN n.is_read = 0 THEN 1 ELSE 0 END), 0) as unread_count
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0 AND n.trigger_at <= ?
                  $workspaceClause
            ");
            $countStmt->execute($countParams);
            $counts = $countStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $unreadCount = (int)($counts['unread_count'] ?? 0);
            $totalCount = (int)($counts['total_count'] ?? 0);
            
            $this->sendSuccess([
                'notifications' => $notifications,
                    'unread_count' => $unreadCount,
                    'total_count' => $totalCount
            ]);
        } catch (Exception $e) {
            error_log('RemindersController::index error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to fetch notifications');
        }
    }
    
    /**
     * GET /api/v1/reminders/count
     * Get triggered notification counters (lightweight polling endpoint)
     */
    public function count(): void {
        $this->rememberDetectedAppUrl();

        try {
            $now = gmdate('Y-m-d H:i:s');
            $workspace = $_GET['workspace'] ?? null;
            $hasWorkspace = $workspace !== null && $workspace !== '';
            $workspaceClause = $hasWorkspace ? 'AND e.workspace = ?' : '';
            $params = $hasWorkspace ? [$now, $workspace] : [$now];

            $stmt = $this->con->prepare("
                SELECT
                    COUNT(*) as total_count,
                    COALESCE(SUM(CASE WHEN n.is_read = 0 THEN 1 ELSE 0 END), 0) as unread_count
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0 AND n.trigger_at <= ?
                  $workspaceClause
            ");
            $stmt->execute($params);
                $counts = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
                $unreadCount = (int)($counts['unread_count'] ?? 0);
                $totalCount = (int)($counts['total_count'] ?? 0);
            
                $this->sendSuccess([
                    'unread_count' => $unreadCount,
                    'total_count' => $totalCount
                ]);
        } catch (Exception $e) {
                $this->sendSuccess([
                    'unread_count' => 0,
                    'total_count' => 0
                ]);
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/reminder
     * Set a reminder on a note
     * 
     * Body (JSON):
     *   - reminder_at: ISO datetime string (required)
     *   - message: Custom reminder message (optional)
     *   - email_enabled: Whether to send an email for this reminder (optional)
     *   - recurrence: Repeat interval as "<count><unit>" with unit i/h/d/w/m/y
     *     (minute/hour/day/week/month/year), e.g. "30i", "1h", "2w" (optional)
     */
    public function setReminder(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $this->rememberDetectedAppUrl();
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }
        
        $reminderAt = $input['reminder_at'] ?? null;
        $message = isset($input['message']) ? trim($input['message']) : '';
        $emailEnabled = !empty($input['email_enabled']) && $this->isReminderEmailAvailable();

        if (empty($reminderAt)) {
            $this->sendError(400, 'reminder_at is required');
            return;
        }

        $recurrence = $this->normalizeRecurrence($input['recurrence'] ?? null);
        if ($recurrence === false) {
            $this->sendError(400, 'Invalid recurrence format (expected e.g. "30i", "1h", "1d", "2w", "3m", "1y")');
            return;
        }
        
        // Validate and parse the datetime
        try {
            $dt = new DateTime($reminderAt);
            $reminderAtUtc = $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            $this->sendError(400, 'Invalid datetime format for reminder_at');
            return;
        }
        
        try {
            // Check note exists
            $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Update entries table
            $stmt = $this->con->prepare("UPDATE entries SET reminder_at = ?, reminder_recurrence = ? WHERE id = ?");
            $stmt->execute([$reminderAtUtc, $recurrence, $noteId]);
            
            // Remove any existing pending (non-triggered) note-level notification
            // (task-level reminders live in their own rows with a task_id)
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND dismissed = 0 AND task_id IS NULL")->execute([$noteId]);

            // Create notification entry
            $notifMessage = $message ?: $note['heading'];
            $stmt = $this->con->prepare("
                INSERT INTO notifications (note_id, type, message, trigger_at, email_enabled, created)
                VALUES (?, 'reminder', ?, ?, ?, datetime('now'))
            ");
            $stmt->execute([$noteId, $notifMessage, $reminderAtUtc, $emailEnabled ? 1 : 0]);
            
            $this->sendSuccess([
                'note_id' => $noteId,
                'reminder_at' => $reminderAtUtc,
                'email_enabled' => $emailEnabled,
                'recurrence' => $recurrence
            ]);
        } catch (Exception $e) {
            error_log('RemindersController::setReminder error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to set reminder');
        }
    }
    
    /**
     * DELETE /api/v1/notes/{id}/reminder
     * Remove a reminder from a note
     */
    public function removeReminder(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        
        try {
            // Clear reminder on the note
            $stmt = $this->con->prepare("UPDATE entries SET reminder_at = NULL, reminder_recurrence = NULL WHERE id = ?");
            $stmt->execute([$noteId]);

            // Remove pending note-level notifications (keep task reminders)
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND dismissed = 0 AND task_id IS NULL")->execute([$noteId]);
            
            $this->sendSuccess(['note_id' => $noteId]);
        } catch (Exception $e) {
            error_log('RemindersController::removeReminder error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to remove reminder');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/task-reminder
     * Set a reminder for one task of a tasklist note
     *
     * Body (JSON):
     *   - task_id: id of the task inside the note's task JSON (required)
     *   - reminder_at: ISO datetime string (required)
     *   - message: notification text, typically the task text (optional)
     *   - email_enabled: whether to send an email (optional)
     *   - recurrence: repeat interval as "<count><unit>" with unit i/h/d/w/m/y
     *     (optional; dismissing the notification schedules the next occurrence
     *     and advances the task's due date)
     */
    public function setTaskReminder(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $this->rememberDetectedAppUrl();

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }

        $taskId = isset($input['task_id']) && is_scalar($input['task_id']) ? trim((string)$input['task_id']) : '';
        $reminderAt = $input['reminder_at'] ?? null;
        $message = isset($input['message']) ? trim((string)$input['message']) : '';
        $emailEnabled = !empty($input['email_enabled']) && $this->isReminderEmailAvailable();
        $recurrence = $this->normalizeRecurrence($input['recurrence'] ?? null);
        if ($recurrence === false) {
            $this->sendError(400, 'Invalid recurrence format (expected e.g. "30i", "1h", "1d", "2w", "3m", "1y")');
            return;
        }

        if ($taskId === '') {
            $this->sendError(400, 'task_id is required');
            return;
        }
        if (empty($reminderAt)) {
            $this->sendError(400, 'reminder_at is required');
            return;
        }

        try {
            $dt = new DateTime($reminderAt);
            $reminderAtUtc = $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            $this->sendError(400, 'Invalid datetime format for reminder_at');
            return;
        }

        try {
            $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }

            // Replace any pending reminder of this task
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND task_id = ? AND dismissed = 0")
                ->execute([$noteId, $taskId]);

            $notifMessage = $message !== '' ? $message : (string)$note['heading'];
            $stmt = $this->con->prepare("
                INSERT INTO notifications (note_id, task_id, type, message, trigger_at, email_enabled, recurrence, created)
                VALUES (?, ?, 'reminder', ?, ?, ?, ?, datetime('now'))
            ");
            $stmt->execute([$noteId, $taskId, $notifMessage, $reminderAtUtc, $emailEnabled ? 1 : 0, $recurrence]);

            $this->sendSuccess([
                'note_id' => $noteId,
                'task_id' => $taskId,
                'reminder_at' => $reminderAtUtc,
                'email_enabled' => $emailEnabled,
                'recurrence' => $recurrence
            ]);
        } catch (Exception $e) {
            error_log('RemindersController::setTaskReminder error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to set task reminder');
        }
    }

    /**
     * DELETE /api/v1/notes/{id}/task-reminder
     * Remove the pending reminder of one task (body or query: task_id)
     */
    public function removeTaskReminder(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        $taskId = '';
        if (is_array($input) && isset($input['task_id']) && is_scalar($input['task_id'])) {
            $taskId = trim((string)$input['task_id']);
        } elseif (isset($_GET['task_id'])) {
            $taskId = trim((string)$_GET['task_id']);
        }

        if ($taskId === '') {
            $this->sendError(400, 'task_id is required');
            return;
        }

        try {
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND task_id = ? AND dismissed = 0")
                ->execute([$noteId, $taskId]);

            $this->sendSuccess(['note_id' => $noteId, 'task_id' => $taskId]);
        } catch (Exception $e) {
            error_log('RemindersController::removeTaskReminder error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to remove task reminder');
        }
    }

    /**
     * GET /api/v1/notes/{id}/reminder
     * Get the reminder status for a note
     */
    public function getReminder(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }

        $this->rememberDetectedAppUrl();
        
        $noteId = (int)$id;
        
        try {
            $stmt = $this->con->prepare("
                SELECT e.reminder_at, e.reminder_recurrence,
                       COALESCE(n.email_enabled, 1) AS email_enabled
                FROM entries e
                LEFT JOIN notifications n ON n.note_id = e.id AND n.dismissed = 0 AND n.task_id IS NULL
                WHERE e.id = ? AND e.trash = 0
                ORDER BY n.id DESC
                LIMIT 1
            ");
            $stmt->execute([$noteId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$row) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $this->sendSuccess([
                'note_id' => $noteId,
                'reminder_at' => $row['reminder_at'],
                'email_enabled' => !empty($row['email_enabled']),
                'recurrence' => $row['reminder_recurrence'] ?: null
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Failed to get reminder');
        }
    }
    
    /**
     * POST /api/v1/reminders/{id}/read
     * Mark a notification as read
     */
    public function markRead(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid notification ID');
            return;
        }
        
        try {
            $stmt = $this->con->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
            $stmt->execute([(int)$id]);
            
            $this->sendSuccess(['id' => (int)$id]);
        } catch (Exception $e) {
            $this->sendError(500, 'Failed to mark notification as read');
        }
    }
    
    /**
     * POST /api/v1/reminders/{id}/dismiss
     * Dismiss a notification
     */
    public function dismiss(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid notification ID');
            return;
        }
        
        try {
            $stmt = $this->con->prepare("UPDATE notifications SET dismissed = 1 WHERE id = ?");
            $stmt->execute([(int)$id]);

            // For recurring reminders, schedule the next occurrence; otherwise clear the reminder
            $infoStmt = $this->con->prepare("
                SELECT n.note_id, n.task_id, n.message, COALESCE(n.email_enabled, 1) AS email_enabled,
                       n.trigger_at, n.recurrence AS task_recurrence, e.reminder_at, e.reminder_recurrence
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.id = ?
            ");
            $infoStmt->execute([(int)$id]);
            $info = $infoStmt->fetch(PDO::FETCH_ASSOC);

            $nextReminderAt = null;
            // Task-level reminders are independent of the note's reminder:
            // never reschedule nor clear entries.reminder_at for them. Their
            // own recurrence (notifications.recurrence) is handled separately.
            if ($info && !empty($info['note_id']) && empty($info['task_id'])) {
                $nextReminderAt = $this->scheduleNextOccurrence($info);
                if ($nextReminderAt === null) {
                    $this->con->prepare("UPDATE entries SET reminder_at = NULL WHERE id = ?")->execute([$info['note_id']]);
                }
            } elseif ($info && !empty($info['note_id']) && !empty($info['task_id'])) {
                $nextReminderAt = $this->scheduleNextTaskOccurrence($info);
            }

            $this->sendSuccess(['id' => (int)$id, 'next_reminder_at' => $nextReminderAt]);
        } catch (Exception $e) {
            $this->sendError(500, 'Failed to dismiss notification');
        }
    }
    
    /**
     * POST /api/v1/reminders/dismiss-all
     * Dismiss all notifications
     */
    public function dismissAll(): void {
        try {
            $now = gmdate('Y-m-d H:i:s');

            // Collect due recurring notifications before dismissing them
            $recurringStmt = $this->con->prepare("
                SELECT n.note_id, n.message, COALESCE(n.email_enabled, 1) AS email_enabled,
                       n.trigger_at, e.reminder_at, e.reminder_recurrence
                FROM notifications n
                JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0 AND n.trigger_at <= ?
                  AND (n.task_id IS NULL OR n.task_id = '')
                  AND e.reminder_recurrence IS NOT NULL AND e.reminder_recurrence != ''
            ");
            $recurringStmt->execute([$now]);
            $recurring = $recurringStmt->fetchAll(PDO::FETCH_ASSOC);

            // Same collection for due recurring task reminders
            $recurringTasksStmt = $this->con->prepare("
                SELECT n.note_id, n.task_id, n.message, COALESCE(n.email_enabled, 1) AS email_enabled,
                       n.trigger_at, n.recurrence AS task_recurrence
                FROM notifications n
                WHERE n.dismissed = 0 AND n.trigger_at <= ?
                  AND n.task_id IS NOT NULL AND n.task_id != ''
                  AND n.recurrence IS NOT NULL AND n.recurrence != ''
            ");
            $recurringTasksStmt->execute([$now]);
            $recurringTasks = $recurringTasksStmt->fetchAll(PDO::FETCH_ASSOC);

            $this->con->prepare("
                UPDATE notifications SET dismissed = 1
                WHERE dismissed = 0 AND trigger_at <= ?
            ")->execute([$now]);

            // Schedule the next occurrence of each recurring reminder
            foreach ($recurring as $info) {
                $this->scheduleNextOccurrence($info);
            }
            foreach ($recurringTasks as $info) {
                $this->scheduleNextTaskOccurrence($info);
            }

            // Clear reminder_at on all notes whose reminder was not rolled forward
            $this->con->prepare("
                UPDATE entries SET reminder_at = NULL
                WHERE reminder_at IS NOT NULL
                  AND reminder_at <= ?
            ")->execute([$now]);

            $this->sendSuccess([]);
        } catch (Exception $e) {
            $this->sendError(500, 'Failed to dismiss all notifications');
        }
    }

    /**
     * Normalize a recurrence value from client input.
     * Returns the canonical string ("<count><unit>", unit i/h/d/w/m/y for
     * minute/hour/day/week/month/year), null when absent/none, or false when invalid.
     */
    private function normalizeRecurrence($value) {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            return false;
        }
        $value = strtolower(trim($value));
        if ($value === '' || $value === 'none') {
            return null;
        }
        return preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', $value) ? $value : false;
    }

    /**
     * Compute the next occurrence of a recurrence after now, anchored to the previous schedule.
     */
    private function nextOccurrenceUtc(string $fromUtc, string $recurrence): ?string {
        if (!preg_match('/^([1-9]\d{0,2})([ihdwmy])$/', $recurrence, $m)) {
            return null;
        }
        $count = (int)$m[1];
        $unit = $m[2];
        $nowTs = time();

        try {
            $from = new DateTime($fromUtc, new DateTimeZone('UTC'));
        } catch (Exception $e) {
            return null;
        }

        // Fixed-length units: jump straight to the first occurrence after now
        $seconds = ['i' => 60, 'h' => 3600, 'd' => 86400, 'w' => 604800];
        if (isset($seconds[$unit])) {
            $stepSec = $count * $seconds[$unit];
            $fromTs = $from->getTimestamp();
            $steps = max(1, (int)floor(($nowTs - $fromTs) / $stepSec) + 1);
            $nextTs = $fromTs + $steps * $stepSec;
            if ($nextTs <= $nowTs) {
                $nextTs += $stepSec;
            }
            return gmdate('Y-m-d H:i:s', $nextTs);
        }

        // Calendar units (month/year) advance step by step
        $step = '+' . $count . ' ' . ($unit === 'm' ? 'month' : 'year');
        $next = $from;
        $guard = 0;
        do {
            $next->modify($step);
        } while ($next->getTimestamp() <= $nowTs && ++$guard < 1000);

        return $next->getTimestamp() > $nowTs ? $next->format('Y-m-d H:i:s') : null;
    }

    /**
     * Re-arm a recurring reminder from a dismissed notification's data.
     * Expects keys: note_id, message, email_enabled, trigger_at, reminder_at, reminder_recurrence.
     * Returns the next reminder datetime (UTC) or null when the reminder does not recur.
     */
    private function scheduleNextOccurrence(array $info): ?string {
        $recurrence = trim((string)($info['reminder_recurrence'] ?? ''));
        $anchor = $info['reminder_at'] ?: $info['trigger_at'];
        if ($recurrence === '' || empty($info['note_id']) || empty($anchor)) {
            return null;
        }

        $next = $this->nextOccurrenceUtc((string)$anchor, $recurrence);
        if ($next === null) {
            return null;
        }

        $this->con->prepare("UPDATE entries SET reminder_at = ? WHERE id = ?")
            ->execute([$next, $info['note_id']]);
        $this->con->prepare("
            INSERT INTO notifications (note_id, type, message, trigger_at, email_enabled, created)
            VALUES (?, 'reminder', ?, ?, ?, datetime('now'))
        ")->execute([$info['note_id'], $info['message'], $next, (int)$info['email_enabled']]);

        return $next;
    }

    /**
     * Re-arm a recurring task reminder from a dismissed notification's data
     * and advance the task's due date inside the note content by the same
     * interval, so the tasks page and calendar stay in sync.
     * Expects keys: note_id, task_id, message, email_enabled, trigger_at, task_recurrence.
     * Returns the next trigger datetime (UTC) or null when the reminder does not recur.
     */
    private function scheduleNextTaskOccurrence(array $info): ?string {
        $recurrence = trim((string)($info['task_recurrence'] ?? ''));
        if ($recurrence === '' || empty($info['note_id']) || empty($info['task_id']) || empty($info['trigger_at'])) {
            return null;
        }

        $noteId = (int)$info['note_id'];
        $taskId = (string)$info['task_id'];

        // A trashed note, a deleted task or a completed task ends the recurrence
        $stmt = $this->con->prepare("SELECT entry FROM entries WHERE id = ? AND trash = 0 AND type = 'tasklist'");
        $stmt->execute([$noteId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        $filename = getEntryFilename($noteId, 'tasklist');
        $fileContent = is_file($filename) ? (string)@file_get_contents($filename) : '';
        $tasks = json_decode(resolveTasklistStoredContent($fileContent, (string)($row['entry'] ?? '')), true);
        if (!is_array($tasks)) {
            return null;
        }
        if (isset($tasks['tasks']) && is_array($tasks['tasks'])) {
            $tasks = $tasks['tasks'];
        }

        $targetIdx = null;
        foreach ($tasks as $i => $t) {
            if (is_array($t) && isset($t['id']) && (string)$t['id'] === $taskId) {
                $targetIdx = $i;
                break;
            }
        }
        if ($targetIdx === null || !empty($tasks[$targetIdx]['completed'])) {
            return null;
        }

        $next = $this->nextOccurrenceUtc((string)$info['trigger_at'], $recurrence);
        if ($next === null) {
            return null;
        }

        // Advance dueAt (naive local, 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM') by
        // the same amount the UTC trigger moved, preserving its wall time
        $dueAt = $tasks[$targetIdx]['dueAt'] ?? null;
        if (is_string($dueAt) && preg_match('/^\d{4}-\d{2}-\d{2}/', $dueAt)) {
            $hasTime = strlen($dueAt) > 10;
            $naiveTs = strtotime(substr($dueAt, 0, $hasTime ? 16 : 10) . ($hasTime ? ':00' : 'T09:00:00') . ' UTC');
            $triggerTs = strtotime((string)$info['trigger_at'] . ' UTC');
            $nextTs = strtotime($next . ' UTC');
            if ($naiveTs !== false && $triggerTs !== false && $nextTs !== false) {
                $nextNaiveTs = $nextTs + ($naiveTs - $triggerTs);
                $tasks[$targetIdx]['dueAt'] = $hasTime ? gmdate('Y-m-d\TH:i', $nextNaiveTs) : gmdate('Y-m-d', $nextNaiveTs);
                $newContent = json_encode($tasks, JSON_UNESCAPED_UNICODE);
                if ($newContent !== false) {
                    @file_put_contents($filename, $newContent);
                    $this->con->prepare('UPDATE entries SET entry = ?, updated = datetime(\'now\') WHERE id = ?')
                        ->execute([$newContent, $noteId]);
                }
            }
        }

        $this->con->prepare("
            INSERT INTO notifications (note_id, task_id, type, message, trigger_at, email_enabled, recurrence, created)
            VALUES (?, ?, 'reminder', ?, ?, ?, ?, datetime('now'))
        ")->execute([$noteId, $taskId, (string)$info['message'], $next, (int)$info['email_enabled'], $recurrence]);

        return $next;
    }

    private function isReminderEmailAvailable(): bool {
        if (!function_exists('getGlobalSetting')) {
            require_once dirname(__DIR__, 3) . '/users/db_master.php';
        }

        if (!function_exists('getGlobalSetting')) {
            return false;
        }

        $host = trim((string)getGlobalSetting('smtp_host', ''));
        $fromEmail = trim((string)getGlobalSetting('smtp_from_email', ''));
        $enabledSetting = getGlobalSetting('smtp_enabled', null);
        if ($enabledSetting !== null && $enabledSetting !== '' && !filter_var($enabledSetting, FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        if ($host === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            return false;
        }

        if (function_exists('getCurrentUser')) {
            $user = getCurrentUser();
            $email = trim((string)($user['email'] ?? ''));
            return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
        }

        return true;
    }

    private function rememberDetectedAppUrl(): void {
        if (!function_exists('setGlobalSetting') || !function_exists('getGlobalSetting')) {
            require_once dirname(__DIR__, 3) . '/users/db_master.php';
        }

        if (!function_exists('setGlobalSetting') || !function_exists('getGlobalSetting')) {
            return;
        }

        $detectedUrl = $this->detectAppUrl();
        if ($detectedUrl === '') {
            return;
        }

        $currentUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
        if ($currentUrl === $detectedUrl) {
            return;
        }

        setGlobalSetting('smtp_app_url', $detectedUrl);
    }

    private function detectAppUrl(): string {
        if (PHP_SAPI === 'cli') {
            return '';
        }

        $host = function_exists('getExternalHostWithPort')
            ? getExternalHostWithPort()
            : trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? '')));
        if ($host === '') {
            return '';
        }

        $protocol = function_exists('getProtocol') ? getProtocol() : 'http';
        $scriptDir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
        if ($scriptDir === '.' || $scriptDir === '/') {
            $scriptDir = '';
        }

        foreach (['/api/v1', '/admin'] as $suffix) {
            if ($scriptDir === $suffix || substr($scriptDir, -strlen($suffix)) === $suffix) {
                $scriptDir = substr($scriptDir, 0, -strlen($suffix));
                break;
            }
        }
        $scriptDir = rtrim((string)$scriptDir, '/');

        $url = $protocol . '://' . $host . $scriptDir;
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return '';
        }

        $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https'], true) ? $url : '';
    }

    private function sendSuccess(array $data): void {
        echo json_encode(array_merge(['success' => true], $data));
    }
    
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message
        ]);
    }
}
