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
            $stmt = $this->con->prepare('SELECT token, indexable, password, allowed_users FROM shared_folders WHERE folder_id = ? LIMIT 1');
            $stmt->execute([$folderId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$row) {
                echo json_encode(['success' => true, 'public' => false]);
                return;
            }
            
            $token = $row['token'];
            $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
            $hasPassword = !empty($row['password']);
            $allowedUsers = !empty($row['allowed_users']) ? json_decode($row['allowed_users'], true) : null;
            
            $urls = $this->buildUrls($token);
            
            echo json_encode([
                'success' => true,
                'public' => true,
                'url' => $urls['path'],
                'url_query' => $urls['query'],
                'indexable' => $indexable,
                'hasPassword' => $hasPassword,
                'workspace' => $folderWorkspace,
                'allowed_users' => $allowedUsers
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
                
                $token = $custom;
            } else {
                $token = bin2hex(random_bytes(16));
            }

            // Register in global registry (master.db)
            require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
            
            // Check global uniqueness (across all users)
            if (!isTokenAvailable($token, $_SESSION['user_id'], 'folder', (int)$folderId)) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Token already in use']);
                return;
            }
            
            $theme = isset($input['theme']) ? trim($input['theme']) : null;
            $indexable = isset($input['indexable']) ? (int)$input['indexable'] : 0;
            $password = isset($input['password']) ? trim($input['password']) : '';
            $hashedPassword = $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null;
            
            // Check if share already exists
            $stmt = $this->con->prepare('SELECT id FROM shared_folders WHERE folder_id = ? LIMIT 1');
            $stmt->execute([$folderId]);
            $existsRow = $stmt->fetchColumn();
            
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
            
            // Clean up legacy implicit note-share rows from previous folder-sharing behavior.
            $this->shareNotesInFolder($folderId, $folderRow['name'], $theme, $indexable);
            
            $urls = $this->buildUrls($token);
            
            http_response_code($existsRow ? 200 : 201);
            echo json_encode([
                'success' => true,
                'public' => true,
                'url' => $urls['path'],
                'url_query' => $urls['query'],
                'workspace' => $folderWorkspace,
                'shared_notes_count' => 0
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
            
            // Clean up legacy implicit note-share rows from previous folder-sharing behavior.
            $this->unshareNotesInFolder($folderId, $folder['name']);
            
            echo json_encode(['success' => true, 'revoked' => true, 'unshared_notes_count' => 0]);
            
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
                    
                    // Register in global registry (master.db)
                    require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';

                    // Check global uniqueness (across all users)
                    if (!isTokenAvailable($custom, $_SESSION['user_id'], 'folder', (int)$folderId)) {
                        http_response_code(409);
                        echo json_encode(['success' => false, 'error' => 'Token already in use']);
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

            if (array_key_exists('allowed_users', $input)) {
                $allowedUsersValue = $input['allowed_users'];
                if (is_array($allowedUsersValue) && !empty($allowedUsersValue)) {
                    $sanitized = array_values(array_unique(array_map('intval', $allowedUsersValue)));
                    $updates[] = 'allowed_users = ?';
                    $params[] = json_encode($sanitized);
                } else {
                    $updates[] = 'allowed_users = ?';
                    $params[] = null;
                }
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
            if (array_key_exists('allowed_users', $input)) {
                $au = $input['allowed_users'];
                $response['allowed_users'] = (is_array($au) && !empty($au))
                    ? array_values(array_unique(array_map('intval', $au)))
                    : null;
            }
            
            echo json_encode($response);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
        }
    }
    
    /**
     * Legacy cleanup for implicit note shares that used to be created from folder shares.
     * Explicit note shares are preserved.
     *
     * @return int Number of implicit rows removed
     */
    private function shareNotesInFolder($folderId, $folderName, $theme, $indexable) {
        $folderIds = $this->getFolderSubtreeIds($folderId);
        $placeholders = implode(', ', array_fill(0, count($folderIds), '?'));

        // Include legacy rows that still store the root folder name in `folder`.
        $stmt = $this->con->prepare('SELECT id FROM entries WHERE (folder_id IN (' . $placeholders . ') OR folder = ?) AND trash = 0');
        $stmt->execute(array_merge($folderIds, [$folderName]));
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $removedCount = 0;
        foreach ($notes as $note) {
            $noteId = $note['id'];

            $checkStmt = $this->con->prepare('SELECT token FROM shared_notes WHERE note_id = ? AND access_mode IS NULL LIMIT 1');
            $checkStmt->execute([$noteId]);
            $implicitToken = $checkStmt->fetchColumn();

            if ($implicitToken) {
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                unregisterSharedLink($implicitToken);

                $deleteStmt = $this->con->prepare('DELETE FROM shared_notes WHERE note_id = ? AND access_mode IS NULL');
                $deleteStmt->execute([$noteId]);
                $removedCount++;
            }
        }

        return $removedCount;
    }
    
    /**
     * Legacy cleanup for implicit note shares that used to be created from folder shares.
     * Explicit note shares are preserved.
     *
     * @return int Number of implicit rows removed
     */
    private function unshareNotesInFolder($folderId, $folderName) {
        $folderIds = $this->getFolderSubtreeIds($folderId);
        $placeholders = implode(', ', array_fill(0, count($folderIds), '?'));

        // Include legacy rows that still store the root folder name in `folder`.
        $stmt = $this->con->prepare('SELECT id FROM entries WHERE (folder_id IN (' . $placeholders . ') OR folder = ?) AND trash = 0');
        $stmt->execute(array_merge($folderIds, [$folderName]));
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $unsharedCount = 0;
        foreach ($notes as $note) {
            // Remove only legacy implicit shares; explicit note shares remain intact.
            $checkStmt = $this->con->prepare('SELECT token FROM shared_notes WHERE note_id = ? AND access_mode IS NULL LIMIT 1');
            $checkStmt->execute([$note['id']]);
            $token = $checkStmt->fetchColumn();
            if ($token) {
                require_once dirname(dirname(dirname(__DIR__))) . '/users/db_master.php';
                unregisterSharedLink($token);

                $deleteStmt = $this->con->prepare('DELETE FROM shared_notes WHERE note_id = ? AND access_mode IS NULL');
                $deleteStmt->execute([$note['id']]);
                $unsharedCount++;
            }
        }
        return $unsharedCount;
    }

    /**
     * Get a folder id plus all descendant folder ids.
     *
     * @return int[]
     */
    private function getFolderSubtreeIds($folderId) {
        $stmt = $this->con->prepare(
            'WITH RECURSIVE folder_tree(id) AS (
                SELECT id
                FROM folders
                WHERE id = ?
                UNION ALL
                SELECT child.id
                FROM folders child
                INNER JOIN folder_tree parent_tree ON child.parent_id = parent_tree.id
            )
            SELECT id FROM folder_tree'
        );
        $stmt->execute([$folderId]);

        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
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
