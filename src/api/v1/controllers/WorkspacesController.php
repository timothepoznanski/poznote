<?php
/**
 * WorkspacesController - RESTful API controller for workspaces
 * 
 * Endpoints:
 *   GET    /api/v1/workspaces          - List all workspaces (with their tags)
 *   POST   /api/v1/workspaces          - Create a new workspace (optional tags)
 *   PATCH  /api/v1/workspaces/{name}   - Rename a workspace and/or set its tags
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
                    $stmt = $this->con->prepare('SELECT name, created, tags FROM workspaces WHERE name = ? ORDER BY name');
                    $stmt->execute([$publicWorkspaceName]);
                    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                }
            } else {
                $stmt = $this->con->query("SELECT name, created, tags FROM workspaces ORDER BY name");
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            // Tags are stored comma-separated; expose them as a list
            $rows = array_map(function ($row) {
                $row['tags'] = poznoteParseWorkspaceTags($row['tags'] ?? '');
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
     * Body: { "name": "workspace_name", "tags": ["school", "psycho"] }
     * (tags optional: an array or a comma-separated string)
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

            $stmt = $this->con->prepare("INSERT INTO workspaces (name, tags) VALUES (?, ?)");
            if ($stmt->execute([$name, poznoteSerializeWorkspaceTags($tags)])) {
                require_once dirname(__DIR__, 3) . '/ActivityLog.php';
                logActivity(ACTIVITY_WORKSPACE_CREATED, ['workspace' => $name], 'api');

                http_response_code(201);
                echo json_encode(['success' => true, 'name' => $name, 'tags' => $tags]);
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
     * Rename a workspace and/or replace its tags
     * Body: { "new_name": "new_workspace_name", "tags": ["school"] }
     * (both optional, at least one required; tags replace the whole list)
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

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Workspace name is required']);
            return;
        }

        if ($newName === '' && !$hasTags) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'new_name or tags is required']);
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
            
            // Tags only: no rename involved
            if ($newName === '' || $newName === $name) {
                $stmt = $this->con->prepare("UPDATE workspaces SET tags = ? WHERE name = ?");
                $stmt->execute([poznoteSerializeWorkspaceTags($tags ?? []), $name]);
                echo json_encode([
                    'success' => true,
                    'old_name' => $name,
                    'new_name' => $name,
                    'tags' => $tags ?? []
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
            }
            
            $stmt = $this->con->prepare("UPDATE workspaces SET name = ? WHERE name = ?");
            if ($stmt->execute([$newName, $name])) {
                if ($hasTags) {
                    $stmt = $this->con->prepare("UPDATE workspaces SET tags = ? WHERE name = ?");
                    $stmt->execute([poznoteSerializeWorkspaceTags($tags), $newName]);
                }
                echo json_encode([
                    'success' => true,
                    'old_name' => $name,
                    'new_name' => $newName,
                    'tags' => $hasTags ? $tags : null
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
            }
            
            // Check if this workspace is set as the last opened workspace
            $currentLastOpened = null;
            try {
                $stmt = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmt->execute(['last_opened_workspace']);
                $currentLastOpened = $stmt->fetchColumn();
            } catch (Exception $e) {
                // Settings table may not exist - ignore
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
                }
            }
            
            // If the deleted workspace was the last opened workspace, update to target workspace
            if ($currentLastOpened === $name) {
                try {
                    $resetStmt = $this->con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                    $resetStmt->execute(['last_opened_workspace', $targetWorkspace]);
                } catch (Exception $e) {
                    // If settings update fails, continue - it's not critical for workspace deletion
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
