<?php
/**
 * WorkspacesController - RESTful API controller for workspaces
 * 
 * Endpoints:
 *   GET    /api/v1/workspaces          - List all workspaces
 *   POST   /api/v1/workspaces          - Create a new workspace
 *   PATCH  /api/v1/workspaces/{name}   - Rename a workspace
 *   DELETE /api/v1/workspaces/{name}   - Delete a workspace
 */

class WorkspacesController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/workspaces
     * List all workspaces
     */
    public function index() {
        try {
            $stmt = $this->con->query("SELECT name, created FROM workspaces ORDER BY name");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'workspaces' => $rows
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
     * Body: { "name": "workspace_name" }
     */
    public function store() {
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
        
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Invalid name: use letters, numbers, dash or underscore only'
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
            
            $stmt = $this->con->prepare("INSERT INTO workspaces (name) VALUES (?)");
            if ($stmt->execute([$name])) {
                http_response_code(201);
                echo json_encode(['success' => true, 'name' => $name]);
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
     * Rename a workspace
     * Body: { "new_name": "new_workspace_name" }
     */
    public function update($name) {
        $name = urldecode($name);
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid JSON request body']);
            return;
        }
        
        $newName = trim($input['new_name'] ?? '');
        
        if ($name === '' || $newName === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Both old and new names are required']);
            return;
        }
        
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $newName)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Invalid new name: use letters, numbers, dash or underscore only'
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
                echo json_encode([
                    'success' => true,
                    'old_name' => $name,
                    'new_name' => $newName
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
