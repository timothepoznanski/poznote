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
        try {
            $now = gmdate('Y-m-d H:i:s');
            
            $stmt = $this->con->prepare("
                SELECT n.id, n.note_id, n.type, n.message, n.is_read, n.created, n.trigger_at,
                       e.heading AS note_heading
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0
                  AND n.trigger_at <= ?
                ORDER BY n.trigger_at DESC
                LIMIT 50
            ");
            $stmt->execute([$now]);
            $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Also count triggered notifications (read or unread) and triggered unread notifications
                $countStmt = $this->con->prepare("
                    SELECT
                        COUNT(*) as total_count,
                        COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread_count
                    FROM notifications
                    WHERE dismissed = 0 AND trigger_at <= ?
                ");
                $countStmt->execute([$now]);
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
        try {
            $now = gmdate('Y-m-d H:i:s');
                $stmt = $this->con->prepare("
                    SELECT
                        COUNT(*) as total_count,
                        COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread_count
                    FROM notifications
                    WHERE dismissed = 0 AND trigger_at <= ?
                ");
                $stmt->execute([$now]);
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
     */
    public function setReminder(string $id): void {
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
        
        $reminderAt = $input['reminder_at'] ?? null;
        $message = isset($input['message']) ? trim($input['message']) : '';
        
        if (empty($reminderAt)) {
            $this->sendError(400, 'reminder_at is required');
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
            $stmt = $this->con->prepare("UPDATE entries SET reminder_at = ? WHERE id = ?");
            $stmt->execute([$reminderAtUtc, $noteId]);
            
            // Remove any existing pending (non-triggered) notification for this note
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND dismissed = 0")->execute([$noteId]);
            
            // Create notification entry
            $notifMessage = $message ?: $note['heading'];
            $stmt = $this->con->prepare("
                INSERT INTO notifications (note_id, type, message, trigger_at, created)
                VALUES (?, 'reminder', ?, ?, datetime('now'))
            ");
            $stmt->execute([$noteId, $notifMessage, $reminderAtUtc]);
            
            $this->sendSuccess([
                'note_id' => $noteId,
                'reminder_at' => $reminderAtUtc
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
            $stmt = $this->con->prepare("UPDATE entries SET reminder_at = NULL WHERE id = ?");
            $stmt->execute([$noteId]);
            
            // Remove pending notifications for this note
            $this->con->prepare("DELETE FROM notifications WHERE note_id = ? AND dismissed = 0")->execute([$noteId]);
            
            $this->sendSuccess(['note_id' => $noteId]);
        } catch (Exception $e) {
            error_log('RemindersController::removeReminder error: ' . $e->getMessage());
            $this->sendError(500, 'Failed to remove reminder');
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
        
        $noteId = (int)$id;
        
        try {
            $stmt = $this->con->prepare("SELECT reminder_at FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            $this->sendSuccess([
                'note_id' => $noteId,
                'reminder_at' => $row['reminder_at']
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
            
            // Also clear the reminder_at on the associated note
            $noteStmt = $this->con->prepare("SELECT note_id FROM notifications WHERE id = ?");
            $noteStmt->execute([(int)$id]);
            $noteId = $noteStmt->fetchColumn();
            if ($noteId) {
                $this->con->prepare("UPDATE entries SET reminder_at = NULL WHERE id = ?")->execute([$noteId]);
            }
            
            $this->sendSuccess(['id' => (int)$id]);
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
            $this->con->prepare("
                UPDATE notifications SET dismissed = 1
                WHERE dismissed = 0 AND trigger_at <= ?
            ")->execute([$now]);
            
            // Clear reminder_at on all notes that had dismissed reminders
            $this->con->exec("
                UPDATE entries SET reminder_at = NULL
                WHERE reminder_at IS NOT NULL
                  AND reminder_at <= '" . $now . "'
            ");
            
            $this->sendSuccess([]);
        } catch (Exception $e) {
            $this->sendError(500, 'Failed to dismiss all notifications');
        }
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
