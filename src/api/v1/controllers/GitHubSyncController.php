<?php
/**
 * GitHubSyncController - RESTful API controller for GitHub sync operations
 * 
 * Endpoints:
 *   GET  /api/v1/github-sync/status   - Get sync status and configuration
 *   POST /api/v1/github-sync/test     - Test GitHub connection
 *   POST /api/v1/github-sync/push     - Push notes to GitHub
 *   POST /api/v1/github-sync/pull     - Pull notes from GitHub
 */

class GitHubSyncController {
    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/github-sync/status
     * Get sync status and configuration (without sensitive data)
     */
    public function status() {
        require_once dirname(__DIR__, 3) . '/GitHubSync.php';
        
        if (!GitHubSync::isEnabled()) {
            echo json_encode([
                'success' => true,
                'enabled' => false,
                'message' => 'GitHub sync is not enabled'
            ]);
            return;
        }
        
        $sync = new GitHubSync($this->con, $_SESSION['user_id'] ?? null);
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
     * POST /api/v1/github-sync/test
     * Test GitHub connection
     */
    public function test() {
        require_once dirname(__DIR__, 3) . '/GitHubSync.php';
        
        if (!GitHubSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'GitHub sync is not enabled'
            ]);
            return;
        }
        
        $sync = new GitHubSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->testConnection();
        
        echo json_encode($result);
    }
    
    /**
     * POST /api/v1/github-sync/push
     * Push notes to GitHub
     * Body: { "workspace": "optional_workspace_filter" }
     */
    public function push() {
        require_once dirname(__DIR__, 3) . '/GitHubSync.php';
        
        if (!GitHubSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'GitHub sync is not enabled'
            ]);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $workspace = $input['workspace'] ?? null;
        
        $sync = new GitHubSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pushNotes($workspace);
        
        echo json_encode($result);
    }
    
    /**
     * POST /api/v1/github-sync/pull
     * Pull notes from GitHub
     * Body: { "workspace": "target_workspace" }
     */
    public function pull() {
        require_once dirname(__DIR__, 3) . '/GitHubSync.php';
        
        if (!GitHubSync::isEnabled()) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'GitHub sync is not enabled'
            ]);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $workspace = $input['workspace'] ?? 'Poznote';
        
        $sync = new GitHubSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pullNotes($workspace);
        
        echo json_encode($result);
    }
}
