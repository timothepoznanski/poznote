<?php
/**
 * WorkspacesController - RESTful API controller for workspaces
 * 
 * Endpoints:
 *   GET    /api/v1/workspaces          - List all workspaces (with their tags and color)
 *   POST   /api/v1/workspaces          - Create a new workspace (optional tags and color)
 *   PATCH  /api/v1/workspaces/{name}   - Rename a workspace and/or set its tags or color
 *   DELETE /api/v1/workspaces/{name}   - Delete a workspace
 */

class WorkspacesController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }

    private function requireActiveAccountOwner(): bool {
        if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
            http_response_code(403);
            $message = function_exists('getActiveAccountOwnerRequiredMessage')
                ? getActiveAccountOwnerRequiredMessage()
                : 'This account\'s settings are not accessible because you are not the owner of this account.';
            echo json_encode(['success' => false, 'message' => $message]);
            return false;
        }

        return true;
    }
    
    /**
     * GET /api/v1/workspaces
     * List all workspaces
     */
    public function index() {
        try {
            if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
                $publicWorkspaceName = getPublicWorkspaceName();
                $rows = [];

                if (is_string($publicWorkspaceName) && $publicWorkspaceName !== '') {
                    $stmt = $this->con->prepare('SELECT name, created, tags, color FROM workspaces WHERE name = ? ORDER BY name');
                    $stmt->execute([$publicWorkspaceName]);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
            } else {
                $stmt = $this->con->query("SELECT name, created, tags, color FROM workspaces ORDER BY name");
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // Tags are stored comma-separated; expose them as a list. The
            // color is the stored value (palette id or '#rrggbb') plus the hex
            // it resolves to, null when the workspace has none.
            $rows = array_map(function ($row) {
                $row['tags'] = poznoteParseWorkspaceTags($row['tags'] ?? '');
                $row['color'] = ($row['color'] ?? '') !== '' ? (string)$row['color'] : null;
                $row['color_hex'] = $row['color'] !== null ? (resolveNoteColorHex($row['color']) ?: null) : null;
                return $row;
            }, $rows);
            
            // Get current user
            $currentUser = getCurrentUser();
            $username = (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive())
                ? null
                : ($currentUser['username'] ?? null);
            
            // Acting as
            $actingAs = null;
            if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
                 $authUser = getAuthenticatedUser();
                 if ($authUser) {
                     $actingAs = ($authUser['display_name'] ?? '') ?: $authUser['username'];
                 }
            }
            
            echo json_encode([
                'success' => true,
                'workspaces' => $rows,
                'username' => $username,
                'acting_as' => $actingAs
            ]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Error fetching workspaces: ' . $e->getMessage()
            ]);
        }
    }
    
    /**
     * POST /api/v1/workspaces
     * Create a new workspace
     * Body: { "name": "workspace_name", "tags": ["school", "psycho"], "color": "blue" }
     * (tags optional: an array or a comma-separated string; color optional: a
     * palette id or '#rrggbb')
     */
    public function store() {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid JSON request body']);
            return;
        }
        
        $name = trim($input['name'] ?? '');
        
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name is required']);
            return;
        }
        
        if (!preg_match('/^[\p{L}0-9 _-]+$/u', $name)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Invalid name: use letters (including accented), numbers, spaces, dash or underscore only'
            ]);
            return;
        }
        
        $hasColor = false;
        $color = self::parseColorInput($input, $hasColor);
        if ($color === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid color: use a palette id or #rrggbb']);
            return;
        }

        try {
            // Check if workspace already exists
            $check = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
            $check->execute([$name]);
            if ((int)$check->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Workspace already exists']);
                return;
            }
            
            $tags = poznoteParseWorkspaceTags($input['tags'] ?? []);

            $stmt = $this->con->prepare("INSERT INTO workspaces (name, tags, color) VALUES (?, ?, ?)");
            if ($stmt->execute([$name, poznoteSerializeWorkspaceTags($tags), $color])) {
                require_once dirname(__DIR__, 3) . '/ActivityLog.php';
                logActivity(ACTIVITY_WORKSPACE_CREATED, ['workspace' => $name], 'api');

                http_response_code(201);
                echo json_encode(['success' => true, 'name' => $name, 'tags' => $tags, 'color' => $color]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Error creating workspace']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error creating workspace: ' . $e->getMessage()]);
        }
    }
    
    /**
     * PATCH /api/v1/workspaces/{name}
     * Rename a workspace and/or replace its tags and/or set its color
     * Body: { "new_name": "new_workspace_name", "tags": ["school"], "color": "#3b82f6" }
     * (all optional, at least one required; tags replace the whole list, an
     * empty color clears it)
     */
    public function update($name) {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

        $name = urldecode($name);
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid JSON request body']);
            return;
        }
        
        $newName = trim($input['new_name'] ?? '');
        $hasTags = array_key_exists('tags', $input);
        $tags = $hasTags ? poznoteParseWorkspaceTags($input['tags']) : null;
        $hasColor = false;
        $color = self::parseColorInput($input, $hasColor);
        if ($color === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid color: use a palette id or #rrggbb']);
            return;
        }

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Workspace name is required']);
            return;
        }

        if ($newName === '' && !$hasTags && !$hasColor) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'new_name, tags or color is required']);
            return;
        }

        if ($newName !== '' && !preg_match('/^[\p{L}0-9 _-]+$/u', $newName)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Invalid new name: use letters (including accented), numbers, spaces, dash or underscore only'
            ]);
            return;
        }
        
        try {
            // Ensure the source workspace exists
            $checkOld = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
            $checkOld->execute([$name]);
            if ((int)$checkOld->fetchColumn() === 0) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => function_exists('t') ? t('api.errors.workspace_not_found', [], 'Workspace not found') : 'Workspace not found'
                ]);
                return;
            }
            
            // Tags and/or color only: no rename involved
            if ($newName === '' || $newName === $name) {
                if ($hasTags) {
                    $stmt = $this->con->prepare("UPDATE workspaces SET tags = ? WHERE name = ?");
                    $stmt->execute([poznoteSerializeWorkspaceTags($tags ?? []), $name]);
                }
                if ($hasColor) {
                    $stmt = $this->con->prepare("UPDATE workspaces SET color = ? WHERE name = ?");
                    $stmt->execute([$color, $name]);
                }
                echo json_encode([
                    'success' => true,
                    'old_name' => $name,
                    'new_name' => $name,
                    'tags' => $hasTags ? $tags : null,
                    'color' => $hasColor ? $color : null
                ]);
                return;
            }

            // Ensure the target name does not already exist
            $checkNew = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
            $checkNew->execute([$newName]);
            if ((int)$checkNew->fetchColumn() > 0) {
                http_response_code(409);
                echo json_encode(['success' => false, 'message' => 'Target workspace name already exists']);
                return;
            }
            
            // Update entries, folders and workspaces table
            $stmt = $this->con->prepare("UPDATE entries SET workspace = ? WHERE workspace = ?");
            $stmt->execute([$newName, $name]);
            
            $stmt = $this->con->prepare("UPDATE folders SET workspace = ? WHERE workspace = ?");
            $stmt->execute([$newName, $name]);
            
            // Update default_workspace setting if it references the old name
            try {
                $stmt = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmt->execute(['default_workspace']);
                $currentDefault = $stmt->fetchColumn();
                if ($currentDefault === $name) {
                    $stmt = $this->con->prepare('UPDATE settings SET value = ? WHERE key = ?');
                    $stmt->execute([$newName, 'default_workspace']);
                }
            } catch (Exception $e) {
                // Non-fatal
                error_log('WorkspacesController: update() failed: ' . $e->getMessage());
            }
            
            $stmt = $this->con->prepare("UPDATE workspaces SET name = ? WHERE name = ?");
            if ($stmt->execute([$newName, $name])) {
                if ($hasTags) {
                    $stmt = $this->con->prepare("UPDATE workspaces SET tags = ? WHERE name = ?");
                    $stmt->execute([poznoteSerializeWorkspaceTags($tags), $newName]);
                }
                if ($hasColor) {
                    $stmt = $this->con->prepare("UPDATE workspaces SET color = ? WHERE name = ?");
                    $stmt->execute([$color, $newName]);
                }
                echo json_encode([
                    'success' => true,
                    'old_name' => $name,
                    'new_name' => $newName,
                    'tags' => $hasTags ? $tags : null,
                    'color' => $hasColor ? $color : null
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Error renaming workspace']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error renaming workspace: ' . $e->getMessage()]);
        }
    }
    
    /**
     * Color field of a request body. Sets $present to whether the field was
     * sent at all. Returns null when absent or empty (clears the color), the
     * value to store (palette id or normalized '#rrggbb') otherwise, or false
     * when the value is not a color.
     */
    private static function parseColorInput(array $input, bool &$present) {
        $present = array_key_exists('color', $input);
        if (!$present) {
            return null;
        }
        $raw = trim((string)($input['color'] ?? ''));
        if ($raw === '') {
            return null;
        }
        $normalized = normalizeStoredNoteColor($raw);
        return $normalized === null ? false : $normalized;
    }

    /**
     * DELETE /api/v1/workspaces/{name}
     * Delete a workspace
     */
    public function destroy($name) {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

        $name = urldecode($name);
        
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid workspace']);
            return;
        }
        
        try {
            // Ensure workspace exists before trying to delete
            $check = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
            $check->execute([$name]);
            if ((int)$check->fetchColumn() === 0) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => function_exists('t') ? t('api.errors.workspace_not_found', [], 'Workspace not found') : 'Workspace not found'
                ]);
                return;
            }
            
            // Cannot delete the last workspace
            $countAll = $this->con->query("SELECT COUNT(*) FROM workspaces")->fetchColumn();
            if ((int)$countAll <= 1) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => function_exists('t') ? t('api.errors.cannot_delete_last_workspace', [], 'Cannot delete the last workspace') : 'Cannot delete the last workspace'
                ]);
                return;
            }
            
            // Check if this workspace is set as the default workspace
            $currentDefaultWorkspace = null;
            try {
                $stmt = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmt->execute(['default_workspace']);
                $currentDefaultWorkspace = $stmt->fetchColumn();
            } catch (Exception $e) {
                // Settings table may not exist - ignore
                error_log('WorkspacesController: destroy() failed: ' . $e->getMessage());
            }
            
            // Check if this workspace is set as the last opened workspace
            $currentLastOpened = null;
            try {
                $stmt = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmt->execute(['last_opened_workspace']);
                $currentLastOpened = $stmt->fetchColumn();
            } catch (Exception $e) {
                // Settings table may not exist - ignore
                error_log('WorkspacesController: destroy() failed: ' . $e->getMessage());
            }
            
            // Find another workspace to move notes to
            $otherWs = $this->con->prepare("SELECT name FROM workspaces WHERE name != ? ORDER BY name LIMIT 1");
            $otherWs->execute([$name]);
            $targetWorkspace = $otherWs->fetchColumn();
            
            // Move notes from this workspace to another before deleting
            $stmt = $this->con->prepare("UPDATE entries SET workspace = ? WHERE workspace = ?");
            $stmt->execute([$targetWorkspace, $name]);
            $movedNotes = $stmt->rowCount();
            
            // If the deleted workspace was the default workspace, reset to "last opened"
            if ($currentDefaultWorkspace === $name) {
                try {
                    $resetStmt = $this->con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                    $resetStmt->execute(['default_workspace', '__last_opened__']);
                } catch (Exception $e) {
                    // If settings update fails, continue - it's not critical for workspace deletion
                    error_log('WorkspacesController: destroy() failed: ' . $e->getMessage());
                }
            }
            
            // If the deleted workspace was the last opened workspace, update to target workspace
            if ($currentLastOpened === $name) {
                try {
                    $resetStmt = $this->con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                    $resetStmt->execute(['last_opened_workspace', $targetWorkspace]);
                } catch (Exception $e) {
                    // If settings update fails, continue - it's not critical for workspace deletion
                    error_log('WorkspacesController: destroy() failed: ' . $e->getMessage());
                }
            }
            
            $stmt = $this->con->prepare("DELETE FROM workspaces WHERE name = ?");
            if ($stmt->execute([$name])) {
                // notes_moved, not notes_deleted: this endpoint reassigns the
                // notes to $targetWorkspace instead of destroying them.
                require_once dirname(__DIR__, 3) . '/ActivityLog.php';
                logActivity(ACTIVITY_WORKSPACE_DELETED, [
                    'workspace' => $name,
                    'notes_moved' => $movedNotes,
                    'moved_to' => $targetWorkspace,
                ], 'api');

                echo json_encode(['success' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Error deleting workspace']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error deleting workspace: ' . $e->getMessage()]);
        }
    }
}
