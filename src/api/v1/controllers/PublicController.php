<?php
/**
 * Public Controller for Poznote REST API v1
 * 
 * Handles public interactions with shared notes (like checking tasks).
 */

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
        
        $noteId = $sharedNote['note_id'];
        $input = json_decode(file_get_contents('php://input'), true);
        if ($input === null) {
            $this->sendError(400, 'Invalid JSON body');
            return;
        }

        $note = $this->getNote($noteId);
        if (!$note) return;
        
        $type = $note['type'] ?? 'note';
        $content = $this->getNoteContent($noteId, $type);
        $updatedContent = $content;
        
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

    private function validateTokenAndGetNote(string $token): ?array {
        $stmt = $this->con->prepare('SELECT note_id, password FROM shared_notes WHERE token = ?');
        $stmt->execute([$token]);
        $sharedNote = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedNote) {
            $this->sendError(404, 'Shared note not found');
            return null;
        }
        if (!empty($sharedNote['password'])) {
            $sessionKey = 'public_note_auth_' . $token;
            if (!isset($_SESSION[$sessionKey]) || $_SESSION[$sessionKey] !== true) {
                $this->sendError(401, 'Authentication required');
                return null;
            }
        }
        return $sharedNote;
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

    private function getNoteContent(int $noteId, string $type): string {
        $filename = getEntryFilename($noteId, $type);
        if (file_exists($filename) && is_readable($filename)) {
            return file_get_contents($filename);
        }
        
        // Fallback to DB
        $stmt = $this->con->prepare('SELECT entry FROM entries WHERE id = ?');
        $stmt->execute([$noteId]);
        return $stmt->fetchColumn() ?: '';
    }

    private function saveNote(int $noteId, string $type, string $content): void {
        $filename = getEntryFilename($noteId, $type);
        $entriesDir = dirname($filename);
        if (!is_dir($entriesDir)) {
            mkdir($entriesDir, 0755, true);
        }
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
