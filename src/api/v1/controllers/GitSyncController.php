<?php
/**
 * GitSyncController - RESTful API controller for Git sync operations
 * 
 * Endpoints:
 *   GET  /api/v1/git-sync/status   - Get sync status and configuration
 *   POST /api/v1/git-sync/test     - Test Git connection
 *   POST /api/v1/git-sync/push     - Push notes to Git
 *   POST /api/v1/git-sync/pull     - Pull notes from Git
 */

class GitSyncController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/git-sync/status
     * Get sync status and configuration (without sensitive data)
     */
    public function status() {
        require_once dirname(__DIR__, 3) . '/GitSync.php';
        
        if (!GitSync::isEnabled()) {
            echo json_encode([
                'success' => true,
                'enabled' => false,
                'message' => 'Git sync is not enabled'
            ]);
            return;
        }
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $config = $sync->getConfigStatus();
        $lastSync = $sync->getLastSyncInfo();
        
        echo json_encode([
            'success' => true,
            'enabled' => true,
            'config' => $config,
            'lastSync' => $lastSync
        ]);
    }
    
    /**
     * POST /api/v1/git-sync/test
     * Test Git connection
     */
    public function test() {
        require_once dirname(__DIR__, 3) . '/GitSync.php';
        
        if (!GitSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Git sync is not enabled'
            ]);
            return;
        }
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->testConnection();
        
        echo json_encode($result);
    }
    
    /**
     * POST /api/v1/git-sync/push
     * Push notes to Git
     * Body: { "workspace": "optional_workspace_filter" }
     */
    public function push() {
        require_once dirname(__DIR__, 3) . '/GitSync.php';
        
        if (!GitSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Git sync is not enabled'
            ]);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $workspace = $input['workspace'] ?? null;
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pushNotes($workspace);
        
        echo json_encode($result);
    }
    
    /**
     * POST /api/v1/git-sync/pull
     * Pull notes from Git
     * Body: { "workspace": "target_workspace" }
     */
    public function pull() {
        require_once dirname(__DIR__, 3) . '/GitSync.php';
        
        if (!GitSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Git sync is not enabled'
            ]);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $workspace = $input['workspace'] ?? 'Poznote';
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pullNotes($workspace);
        
        echo json_encode($result);
    }
}
