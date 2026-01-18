<?php
/**
 * ShareController - RESTful API controller for note sharing
 * 
 * Endpoints:
 *   GET    /api/v1/notes/{noteId}/share          - Get share status
 *   POST   /api/v1/notes/{noteId}/share          - Create/update share link
 *   DELETE /api/v1/notes/{noteId}/share          - Revoke share link
 *   PATCH  /api/v1/notes/{noteId}/share          - Update share settings (indexable, password)
 */

class ShareController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/notes/{noteId}/share
     * Get share status for a note
     */
    public function show($noteId) {
        try {
            // Verify note exists
            $stmt = $this->con->prepare('SELECT id, workspace FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
            $noteRow = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$noteRow) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                return;
            }
            
            $noteWorkspace = $noteRow['workspace'] ?? '';
            
            // Get share info
            $stmt = $this->con->prepare('SELECT token, indexable, password FROM shared_notes WHERE note_id = ? LIMIT 1');
            $stmt->execute([$noteId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                echo json_encode(['success' => true, 'public' => false]);
                return;
            }
            
            $token = $row['token'];
            $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
            $hasPassword = !empty($row['password']);
            
            $urls = $this->buildUrls($token);
            
            echo json_encode([
                'success' => true,
                'public' => true,
                'url' => $urls['path'],
                'url_query' => $urls['query'],
                'url_workspace' => $urls['workspace'],
                'indexable' => $indexable,
                'hasPassword' => $hasPassword,
                'workspace' => $noteWorkspace
            ]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * POST /api/v1/notes/{noteId}/share
     * Create or renew share link
     * Body: { custom_token?, theme?, indexable?, password? }
     */
    public function store($noteId) {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        
        try {
            // Verify note exists
            $stmt = $this->con->prepare('SELECT id, workspace FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
            $noteRow = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$noteRow) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                return;
            }
            
            $noteWorkspace = $noteRow['workspace'] ?? '';
            
            // Handle custom token
            $custom = isset($input['custom_token']) ? trim($input['custom_token']) : '';
            if ($custom !== '') {
                if (!preg_match('/^[A-Za-z0-9\-_.]{4,128}$/', $custom)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Invalid custom token. Allowed: letters, numbers, -, _, . (4-128 chars)']);
                    return;
                }
                
                // Check uniqueness
                $stmt = $this->con->prepare('SELECT note_id FROM shared_notes WHERE token = ? LIMIT 1');
                $stmt->execute([$custom]);
                $existing = $stmt->fetchColumn();
                if ($existing && intval($existing) !== (int)$noteId) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'Token already in use']);
                    return;
                }
                $token = $custom;
            } else {
                $token = bin2hex(random_bytes(16));
            }
            
            $theme = isset($input['theme']) ? trim($input['theme']) : null;
            $indexable = isset($input['indexable']) ? (int)$input['indexable'] : 0;
            $password = isset($input['password']) ? trim($input['password']) : '';
            $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
            
            // Check if share already exists
            $stmt = $this->con->prepare('SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1');
            $stmt->execute([$noteId]);
            $existsRow = $stmt->fetchColumn();
            
            // Register in global registry (master.db)
            require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
            
            $oldToken = null;
            if ($existsRow) {
                $stmt = $this->con->prepare('SELECT token FROM shared_notes WHERE note_id = ?');
                $stmt->execute([$noteId]);
                $oldToken = $stmt->fetchColumn();
            }

            if ($existsRow) {
                $stmt = $this->con->prepare('UPDATE shared_notes SET token = ?, theme = ?, indexable = ?, password = ?, created = CURRENT_TIMESTAMP WHERE note_id = ?');
                $stmt->execute([$token, $theme, $indexable, $hashedPassword, $noteId]);
                
                if ($oldToken && $oldToken !== $token) {
                    unregisterSharedLink($oldToken);
                }
            } else {
                $stmt = $this->con->prepare('INSERT INTO shared_notes (note_id, token, theme, indexable, password) VALUES (?, ?, ?, ?, ?)');
                $stmt->execute([$noteId, $token, $theme, $indexable, $hashedPassword]);
            }
            
            registerSharedLink($token, $_SESSION['user_id'], 'note', (int)$noteId);
            
            $urls = $this->buildUrls($token);
            
            http_response_code($existsRow ? 200 : 201);
            echo json_encode([
                'success' => true,
                'public' => true,
                'url' => $urls['path'],
                'url_query' => $urls['query'],
                'url_workspace' => $urls['workspace'],
                'workspace' => $noteWorkspace
            ]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * DELETE /api/v1/notes/{noteId}/share
     * Revoke share link
     */
    public function destroy($noteId) {
        try {
            // Verify note exists
            $stmt = $this->con->prepare('SELECT id FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
            if (!$stmt->fetch()) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                return;
            }
            
            // Remove from global registry first
            $stmtToken = $this->con->prepare('SELECT token FROM shared_notes WHERE note_id = ?');
            $stmtToken->execute([$noteId]);
            $token = $stmtToken->fetchColumn();
            if ($token) {
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                unregisterSharedLink($token);
            }

            $stmt = $this->con->prepare('DELETE FROM shared_notes WHERE note_id = ?');
            $stmt->execute([$noteId]);
            
            echo json_encode(['success' => true, 'revoked' => true]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * PATCH /api/v1/notes/{noteId}/share
     * Update share settings (indexable, password)
     * Body: { indexable?, password? }
     */
    public function update($noteId) {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        
        try {
            // Verify note exists
            $stmt = $this->con->prepare('SELECT id FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
            if (!$stmt->fetch()) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Note not found']);
                return;
            }
            
            $updates = [];
            $params = [];
            
            if (isset($input['indexable'])) {
                $updates[] = 'indexable = ?';
                $params[] = (int)$input['indexable'];
            }
            
            if (array_key_exists('password', $input)) {
                $password = trim($input['password'] ?? '');
                $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
                $updates[] = 'password = ?';
                $params[] = $hashedPassword;
            }
            
            if (empty($updates)) {
                echo json_encode(['success' => true, 'message' => 'No changes']);
                return;
            }
            
            $params[] = $noteId;
            $sql = 'UPDATE shared_notes SET ' . implode(', ', $updates) . ' WHERE note_id = ?';
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            
            $response = ['success' => true];
            if (isset($input['indexable'])) {
                $response['indexable'] = (int)$input['indexable'];
            }
            if (array_key_exists('password', $input)) {
                $response['hasPassword'] = trim($input['password'] ?? '') !== '';
            }
            
            echo json_encode($response);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * Build public URLs from token
     */
    private function buildUrls($token) {
        $host = $_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost');
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
            $scriptDir = '';
        }
        // Go up from /api/v1 to root
        $scriptDir = dirname(dirname($scriptDir));
        if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
            $scriptDir = '';
        }
        $scriptDir = rtrim($scriptDir, '/\\');
        $base = '//' . $host . ($scriptDir ? '/' . ltrim($scriptDir, '/\\') : '');
        
        return [
            'query' => $base . '/public_note.php?token=' . rawurlencode($token),
            'path' => $base . '/' . rawurlencode($token),
            'workspace' => $base . '/workspace/' . rawurlencode($token)
        ];
    }
}
