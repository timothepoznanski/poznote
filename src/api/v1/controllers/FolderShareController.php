<?php
/**
 * FolderShareController - RESTful API controller for folder sharing
 * 
 * Endpoints:
 *   GET    /api/v1/folders/{folderId}/share      - Get share status
 *   POST   /api/v1/folders/{folderId}/share      - Create/update share link
 *   DELETE /api/v1/folders/{folderId}/share      - Revoke share link
 *   PATCH  /api/v1/folders/{folderId}/share      - Update share settings (indexable, password)
 */

class FolderShareController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/folders/{folderId}/share
     * Get share status for a folder
     */
    public function show($folderId) {
        try {
            // Verify folder exists
            $stmt = $this->con->prepare('SELECT id, name, workspace FROM folders WHERE id = ?');
            $stmt->execute([$folderId]);
            $folderRow = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$folderRow) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                return;
            }
            
            $folderWorkspace = $folderRow['workspace'] ?? '';
            
            // Get share info
            $stmt = $this->con->prepare('SELECT token, indexable, password FROM shared_folders WHERE folder_id = ? LIMIT 1');
            $stmt->execute([$folderId]);
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
                'indexable' => $indexable,
                'hasPassword' => $hasPassword,
                'workspace' => $folderWorkspace
            ]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * POST /api/v1/folders/{folderId}/share
     * Create or renew share link
     * Body: { custom_token?, theme?, indexable?, password? }
     */
    public function store($folderId) {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        
        try {
            // Verify folder exists
            $stmt = $this->con->prepare('SELECT id, name, workspace FROM folders WHERE id = ?');
            $stmt->execute([$folderId]);
            $folderRow = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$folderRow) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                return;
            }
            
            $folderWorkspace = $folderRow['workspace'] ?? '';
            
            // Handle custom token
            $custom = isset($input['custom_token']) ? trim($input['custom_token']) : '';
            if ($custom !== '') {
                if (!preg_match('/^[A-Za-z0-9\-_.]{4,128}$/', $custom)) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'error' => 'Invalid custom token. Allowed: letters, numbers, -, _, . (4-128 chars)']);
                    return;
                }
                
                // Check uniqueness within shared_folders only (notes have different URL path)
                $stmt = $this->con->prepare('SELECT folder_id FROM shared_folders WHERE token = ? LIMIT 1');
                $stmt->execute([$custom]);
                $existing = $stmt->fetchColumn();
                if ($existing && intval($existing) !== (int)$folderId) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'Token already in use by another folder']);
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
            $stmt = $this->con->prepare('SELECT id FROM shared_folders WHERE folder_id = ? LIMIT 1');
            $stmt->execute([$folderId]);
            $existsRow = $stmt->fetchColumn();
            
            // Register in global registry (master.db)
            require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';

            $oldToken = null;
            if ($existsRow) {
                $stmt = $this->con->prepare('SELECT token FROM shared_folders WHERE folder_id = ?');
                $stmt->execute([$folderId]);
                $oldToken = $stmt->fetchColumn();
            }

            if ($existsRow) {
                $stmt = $this->con->prepare('UPDATE shared_folders SET token = ?, theme = ?, indexable = ?, password = ?, created = CURRENT_TIMESTAMP WHERE folder_id = ?');
                $stmt->execute([$token, $theme, $indexable, $hashedPassword, $folderId]);
                
                if ($oldToken && $oldToken !== $token) {
                    unregisterSharedLink($oldToken);
                }
            } else {
                $stmt = $this->con->prepare('INSERT INTO shared_folders (folder_id, token, theme, indexable, password) VALUES (?, ?, ?, ?, ?)');
                $stmt->execute([$folderId, $token, $theme, $indexable, $hashedPassword]);
            }
            
            registerSharedLink($token, $_SESSION['user_id'], 'folder', (int)$folderId);
            
            // Auto-share all notes in this folder
            $sharedCount = $this->shareNotesInFolder($folderId, $folderRow['name'], $theme, $indexable);
            
            $urls = $this->buildUrls($token);
            
            http_response_code($existsRow ? 200 : 201);
            echo json_encode([
                'success' => true,
                'public' => true,
                'url' => $urls['path'],
                'url_query' => $urls['query'],
                'workspace' => $folderWorkspace,
                'shared_notes_count' => $sharedCount
            ]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * DELETE /api/v1/folders/{folderId}/share
     * Revoke share link
     */
    public function destroy($folderId) {
        try {
            // Verify folder exists and get folder name
            $stmt = $this->con->prepare('SELECT id, name FROM folders WHERE id = ?');
            $stmt->execute([$folderId]);
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folder) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                return;
            }
            
            // Remove folder from global registry
            $stmtToken = $this->con->prepare('SELECT token FROM shared_folders WHERE folder_id = ?');
            $stmtToken->execute([$folderId]);
            $token = $stmtToken->fetchColumn();
            if ($token) {
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                unregisterSharedLink($token);
            }

            // Delete folder share
            $stmt = $this->con->prepare('DELETE FROM shared_folders WHERE folder_id = ?');
            $stmt->execute([$folderId]);
            
            // Unshare all notes in this folder
            $unsharedCount = $this->unshareNotesInFolder($folderId, $folder['name']);
            
            echo json_encode(['success' => true, 'revoked' => true, 'unshared_notes_count' => $unsharedCount]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * PATCH /api/v1/folders/{folderId}/share
     * Update share settings (indexable, password, token)
     * Body: { indexable?, password?, custom_token? }
     */
    public function update($folderId) {
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        
        try {
            // Verify folder exists
            $stmt = $this->con->prepare('SELECT id FROM folders WHERE id = ?');
            $stmt->execute([$folderId]);
            if (!$stmt->fetch()) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Folder not found']);
                return;
            }
            
            $updates = [];
            $params = [];
            
            // Handle custom token update
            if (isset($input['custom_token'])) {
                $custom = trim($input['custom_token']);
                if ($custom !== '') {
                    if (!preg_match('/^[A-Za-z0-9\-_.]{4,128}$/', $custom)) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'Invalid custom token. Allowed: letters, numbers, -, _, . (4-128 chars)']);
                        return;
                    }
                    
                    // Check uniqueness across both shared_notes and shared_folders
                    $stmt = $this->con->prepare('SELECT folder_id FROM shared_folders WHERE token = ? LIMIT 1');
                    $stmt->execute([$custom]);
                    $existing = $stmt->fetchColumn();
                    if ($existing && intval($existing) !== (int)$folderId) {
                        http_response_code(409);
                        echo json_encode(['success' => false, 'error' => 'Token already in use by another folder']);
                        return;
                    }
                    
                    $updates[] = 'token = ?';
                    $params[] = $custom;
                }
            }
            
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
            
            $oldToken = null;
            if (isset($input['custom_token'])) {
                $stmtToken = $this->con->prepare('SELECT token FROM shared_folders WHERE folder_id = ?');
                $stmtToken->execute([$folderId]);
                $oldToken = $stmtToken->fetchColumn();
            }

            $params[] = $folderId;
            $sql = 'UPDATE shared_folders SET ' . implode(', ', $updates) . ' WHERE folder_id = ?';
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);

            // Update global registry if token changed
            if (isset($input['custom_token'])) {
                $newToken = trim($input['custom_token']);
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                
                if ($oldToken && $oldToken !== $newToken) {
                    unregisterSharedLink($oldToken);
                }
                
                registerSharedLink($newToken, $_SESSION['user_id'], 'folder', (int)$folderId);
            }
            
            $response = ['success' => true];
            if (isset($input['custom_token'])) {
                $response['token'] = trim($input['custom_token']);
            }
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
     * Auto-share all notes in a folder
     * @return int Number of notes shared
     */
    private function shareNotesInFolder($folderId, $folderName, $theme, $indexable) {
        // Get all notes in this folder
        $stmt = $this->con->prepare('SELECT id FROM entries WHERE (folder_id = ? OR folder = ?) AND trash = 0');
        $stmt->execute([$folderId, $folderName]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $sharedCount = 0;
        foreach ($notes as $note) {
            $noteId = $note['id'];
            
            // Check if note is already shared
            $checkStmt = $this->con->prepare('SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1');
            $checkStmt->execute([$noteId]);
            
            if (!$checkStmt->fetchColumn()) {
                // Create a share for this note
                $noteToken = bin2hex(random_bytes(16));
                $insertStmt = $this->con->prepare('INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)');
                $insertStmt->execute([$noteId, $noteToken, $theme, $indexable]);

                // Register in global registry
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                registerSharedLink($noteToken, $_SESSION['user_id'], 'note', (int)$noteId);
                
                $sharedCount++;
            }
        }
        return $sharedCount;
    }
    
    /**
     * Unshare all notes in a folder
     * @return int Number of notes unshared
     */
    private function unshareNotesInFolder($folderId, $folderName) {
        // Get all notes in this folder
        $stmt = $this->con->prepare('SELECT id FROM entries WHERE (folder_id = ? OR folder = ?) AND trash = 0');
        $stmt->execute([$folderId, $folderName]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $unsharedCount = 0;
        foreach ($notes as $note) {
            // Check if note was shared before deleting
            $checkStmt = $this->con->prepare('SELECT token FROM shared_notes WHERE note_id = ? LIMIT 1');
            $checkStmt->execute([$note['id']]);
            $token = $checkStmt->fetchColumn();
            if ($token) {
                // Remove from global registry
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                unregisterSharedLink($token);

                $deleteStmt = $this->con->prepare('DELETE FROM shared_notes WHERE note_id = ?');
                $deleteStmt->execute([$note['id']]);
                $unsharedCount++;
            }
        }
        return $unsharedCount;
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
            'query' => $base . '/public_folder.php?token=' . rawurlencode($token),
            'path' => $base . '/folder/' . rawurlencode($token)
        ];
    }
}
