<?php
/**
 * Trash Controller
 * 
 * Handles all trash-related API endpoints for the RESTful API.
 * 
 * Endpoints:
 *   GET    /api/v1/trash              - List all notes in trash
 *   DELETE /api/v1/trash              - Empty trash (delete all)
 *   DELETE /api/v1/trash/{id}         - Permanently delete a specific note
 *   POST   /api/v1/trash/{id}/restore - Restore a note from trash (delegated to NotesController)
 */

class TrashController {
    private PDO $db;
    
    public function __construct(PDO $db) {
        $this->db = $db;
    }
    
    /**
     * Send JSON response
     */
    private function sendJson(array $data, int $code = 200): void {
        http_response_code($code);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    }
    
    /**
     * Send error response
     */
    private function sendError(string $message, int $code = 400): void {
        $this->sendJson(['success' => false, 'error' => $message], $code);
    }
    
    /**
     * Get input data (from JSON body or form data)
     */
    private function getInputData(): array {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (strpos($contentType, 'application/json') !== false) {
            $json = file_get_contents('php://input');
            $data = json_decode($json, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return [];
            }
            return $data ?? [];
        }
        
        return $_POST;
    }
    
    /**
     * Get the path to an entry file
     */
    private function getEntryFilename(int $id, string $type = 'note'): string {
        if (function_exists('getEntryFilename')) {
            return getEntryFilename($id, $type);
        }
        
        // Fallback implementation
        $ext = match($type) {
            'tasklist' => '.json',
            'excalidraw' => '.excalidraw',
            'markdown' => '.md',
            default => '.html'
        };
        
        $entriesPath = defined('ENTRIES_PATH') ? ENTRIES_PATH : __DIR__ . '/../../../entries';
        return $entriesPath . '/' . $id . $ext;
    }
    
    /**
     * Get attachments path
     */
    private function getAttachmentsPath(): string {
        if (function_exists('getAttachmentsPath')) {
            return getAttachmentsPath();
        }
        return defined('ATTACHMENTS_PATH') ? ATTACHMENTS_PATH : __DIR__ . '/../../../attachments';
    }
    
    // ========================================
    // API Endpoints
    // ========================================
    
    /**
     * GET /api/v1/trash - List all notes in trash
     * 
     * Query params:
     *   - workspace: string (optional)
     *   - search: string (optional)
     */
    public function index(): void {
        try {
            $workspace = $_GET['workspace'] ?? null;
            $search = $_GET['search'] ?? null;
            
            // Base query - only trash notes
            $sql = "SELECT id, heading, subheading, tags, folder, folder_id, workspace, type, updated, created 
                    FROM entries WHERE trash = 1";
            
            $params = [];
            
            // Add workspace filter
            if ($workspace) {
                $sql .= " AND workspace = ?";
                $params[] = $workspace;
            }
            
            // Add search filter
            if ($search) {
                $sql .= " AND (heading LIKE ? OR subheading LIKE ? OR tags LIKE ?)";
                $searchTerm = "%$search%";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
            
            // Order by most recently updated
            $sql .= " ORDER BY updated DESC";
            
            // Execute query
            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Format notes
            foreach ($notes as &$note) {
                $note['id'] = (int)$note['id'];
                $note['folder_id'] = $note['folder_id'] !== null ? (int)$note['folder_id'] : null;
            }
            
            // Get trash count
            $countSql = "SELECT COUNT(*) as total FROM entries WHERE trash = 1";
            $countParams = [];
            
            if ($workspace) {
                $countSql .= " AND workspace = ?";
                $countParams[] = $workspace;
            }
            
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($countParams);
            $total = (int)$countStmt->fetchColumn();
            
            $this->sendJson([
                'success' => true,
                'total' => $total,
                'count' => count($notes),
                'notes' => $notes,
                'filters' => [
                    'workspace' => $workspace,
                    'search' => $search
                ]
            ]);
            
        } catch (PDOException $e) {
            $this->sendError('Database error: ' . $e->getMessage(), 500);
        } catch (Exception $e) {
            $this->sendError($e->getMessage(), 500);
        }
    }
    
    /**
     * DELETE /api/v1/trash - Empty trash (delete all notes in trash)
     * 
     * Query/Body params:
     *   - workspace: string (optional, scope to workspace)
     */
    public function empty(): void {
        try {
            $data = $this->getInputData();
            $workspace = $data['workspace'] ?? $_GET['workspace'] ?? null;
            
            // Get all trash entries to delete files
            if ($workspace) {
                $stmt = $this->db->prepare('SELECT id, attachments, type FROM entries WHERE trash = 1 AND workspace = ?');
                $stmt->execute([$workspace]);
            } else {
                $stmt = $this->db->query('SELECT id, attachments, type FROM entries WHERE trash = 1');
            }
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $deletedCount = 0;
            
            // Delete files and attachments
            foreach ($rows as $row) {
                // Delete note file
                $filePath = $this->getEntryFilename((int)$row['id'], $row['type'] ?? 'note');
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
                
                // Delete attachment files
                $attachments = $row['attachments'] ? json_decode($row['attachments'], true) : [];
                if (is_array($attachments) && !empty($attachments)) {
                    foreach ($attachments as $attachment) {
                        if (isset($attachment['filename'])) {
                            $attachmentFile = $this->getAttachmentsPath() . '/' . $attachment['filename'];
                            if (file_exists($attachmentFile)) {
                                @unlink($attachmentFile);
                            }
                        }
                    }
                }
                
                $deletedCount++;
            }
            
            // Delete all trash entries from database
            if ($workspace) {
                $delStmt = $this->db->prepare("DELETE FROM entries WHERE trash = 1 AND workspace = ?");
                $success = $delStmt->execute([$workspace]);
            } else {
                $delStmt = $this->db->prepare("DELETE FROM entries WHERE trash = 1");
                $success = $delStmt->execute();
            }
            
            if ($success) {
                $this->sendJson([
                    'success' => true,
                    'message' => 'Trash emptied successfully',
                    'deleted_count' => $deletedCount
                ]);
            } else {
                $this->sendError('Failed to empty trash', 500);
            }
            
        } catch (Exception $e) {
            $this->sendError('Error emptying trash: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * DELETE /api/v1/trash/{id} - Permanently delete a specific note
     */
    public function destroy(string $id): void {
        try {
            $noteId = (int)$id;
            $data = $this->getInputData();
            $workspace = $data['workspace'] ?? $_GET['workspace'] ?? null;
            
            // Get note data before deletion
            if ($workspace) {
                $stmt = $this->db->prepare("SELECT id, attachments, type, trash FROM entries WHERE id = ? AND workspace = ?");
                $stmt->execute([$noteId, $workspace]);
            } else {
                $stmt = $this->db->prepare("SELECT id, attachments, type, trash FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError('Note not found', 404);
                return;
            }
            
            // Optional: Check if note is in trash (safety check)
            // if (!$note['trash']) {
            //     $this->sendError('Note is not in trash', 400);
            //     return;
            // }
            
            $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
            $noteType = $note['type'] ?? 'note';
            
            // Delete attachment files
            if (is_array($attachments) && !empty($attachments)) {
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $attachmentFile = $this->getAttachmentsPath() . '/' . $attachment['filename'];
                        if (file_exists($attachmentFile)) {
                            @unlink($attachmentFile);
                        }
                    }
                }
            }
            
            // Delete note file
            $filename = $this->getEntryFilename($noteId, $noteType);
            if (file_exists($filename)) {
                @unlink($filename);
            }
            
            // Delete database entry
            if ($workspace) {
                $delStmt = $this->db->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
                $success = $delStmt->execute([$noteId, $workspace]);
            } else {
                $delStmt = $this->db->prepare("DELETE FROM entries WHERE id = ?");
                $success = $delStmt->execute([$noteId]);
            }
            
            if ($success) {
                $this->sendJson([
                    'success' => true,
                    'message' => 'Note permanently deleted'
                ]);
            } else {
                $this->sendError('Failed to delete note', 500);
            }
            
        } catch (Exception $e) {
            $this->sendError('Error deleting note: ' . $e->getMessage(), 500);
        }
    }
}
