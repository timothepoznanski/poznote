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
    private const ASYNC_STALE_AFTER = 7200;

    private $con;
    
    public function __construct($con) {
        $this->con = $con;
    }

    private function requireActiveAccountOwner(): bool {
        if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Settings are only available for your own account']);
            return false;
        }

        return true;
    }
    
    /**
     * GET /api/v1/git-sync/status
     * Get sync status and configuration (without sensitive data)
     */
    public function status() {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

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
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

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
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

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
        if (!is_array($input)) $input = [];
        $workspace = isset($input['workspace']) ? $input['workspace'] : null;
        if ($workspace === '') $workspace = null;

        if (!empty($input['async'])) {
            $this->startAsyncSync('push', $workspace);
            return;
        }
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pushNotes($workspace);
        
        // Store result in session for display after page reload if requested
        if (session_status() === PHP_SESSION_NONE) session_start();
        $_SESSION['last_sync_result'] = [
            'action' => 'push',
            'workspace' => $workspace,
            'result' => $result
        ];
        
        echo json_encode($result);
    }
    
    /**
     * POST /api/v1/git-sync/pull
     * Pull notes from Git
     * Body: { "workspace": "target_workspace" }
     */
    public function pull() {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

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
        if (!is_array($input)) $input = [];
        $workspace = isset($input['workspace']) ? $input['workspace'] : null;
        if ($workspace === '') $workspace = null;

        if (!empty($input['async'])) {
            $this->startAsyncSync('pull', $workspace);
            return;
        }
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->pullNotes($workspace);
        
        // Store result in session for display after page reload if requested
        if (session_status() === PHP_SESSION_NONE) session_start();
        $_SESSION['last_sync_result'] = [
            'action' => 'pull',
            'workspace' => $workspace,
            'result' => $result
        ];
        
        echo json_encode($result);
    }
    
    /**
     * GET /api/v1/git-sync/progress
     * Get current sync progress from session
     */
    public function progress() {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        $progress = $_SESSION['git_sync_progress'] ?? null;
        $running = $_SESSION['git_sync_running'] ?? null;
        $result = $_SESSION['git_sync_async_result'] ?? null;

        $stateFile = $_SESSION['git_sync_state_file'] ?? null;
        if (is_string($stateFile) && is_file($stateFile)) {
            $state = $this->readAsyncStateFile($stateFile);
            if (is_array($state)) {
                $progress = array_key_exists('progress', $state) ? $state['progress'] : $progress;
                $running = array_key_exists('running', $state) ? $state['running'] : $running;
                $result = array_key_exists('result', $state) ? $state['result'] : $result;

                if ($running && $this->isAsyncStateStale($state)) {
                    $running = null;
                    $result = [
                        'id' => $state['running']['id'] ?? null,
                        'action' => $state['running']['action'] ?? 'sync',
                        'workspace' => $state['running']['workspace'] ?? null,
                        'result' => [
                            'success' => false,
                            'errors' => [['error' => 'Git sync was interrupted or timed out.']]
                        ],
                        'finished' => time()
                    ];
                    $state['running'] = null;
                    $state['result'] = $result;
                    $this->writeAsyncStateFile($stateFile, $state);
                }

                if ($result && isset($result['action'], $result['result']) && array_key_exists('workspace', $result)) {
                    $_SESSION['last_sync_result'] = [
                        'action' => $result['action'],
                        'workspace' => $result['workspace'],
                        'result' => $result['result']
                    ];
                    $_SESSION['git_sync_async_result'] = $result;
                    unset($_SESSION['git_sync_running'], $_SESSION['git_sync_state_file']);
                    @unlink($stateFile);
                }
            }
        }
        
        // If progress is older than 5 minutes and no async job is marked running, consider it stale.
        if (!$running && $progress && (time() - ($progress['timestamp'] ?? 0) > 300)) {
            unset($_SESSION['git_sync_progress']);
            $progress = null;
        }
        
        echo json_encode([
            'success' => true,
            'progress' => $progress,
            'running' => $running,
            'result' => $result
        ]);
        
        session_write_close();
    }

    private function startAsyncSync(string $action, ?string $workspace): void {
        if (!function_exists('fastcgi_finish_request')) {
            $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
            $result = $action === 'push' ? $sync->pushNotes($workspace) : $sync->pullNotes($workspace);
            $this->storeSyncResult($action, $workspace, $result);
            echo json_encode($result);
            return;
        }

        ignore_user_abort(true);
        set_time_limit(0);

        if (session_status() === PHP_SESSION_NONE) session_start();
        $stateFile = $this->getAsyncStateFile();

        $existingState = $this->readAsyncStateFile($stateFile);
        if ($existingState && !empty($existingState['running']) && !$this->isAsyncStateStale($existingState)) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'error' => 'A Git sync is already running.',
                'running' => $existingState['running']
            ]);
            session_write_close();
            return;
        }

        $jobId = bin2hex(random_bytes(12));
        $running = [
            'id' => $jobId,
            'action' => $action,
            'workspace' => $workspace,
            'started' => time()
        ];

        $this->writeAsyncStateFile($stateFile, [
            'running' => $running,
            'progress' => null,
            'result' => null
        ]);
        unset($_SESSION['git_sync_progress'], $_SESSION['git_sync_async_result']);
        $_SESSION['git_sync_state_file'] = $stateFile;
        $_SESSION['git_sync_running'] = $running;
        session_write_close();

        echo json_encode([
            'success' => true,
            'started' => true,
            'action' => $action,
            'id' => $jobId
        ]);
        fastcgi_finish_request();

        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $sync->setProgressStateFile($stateFile);
        $result = $action === 'push' ? $sync->pushNotes($workspace) : $sync->pullNotes($workspace);
        $this->storeAsyncFileResult($stateFile, $jobId, $action, $workspace, $result);
    }

    private function storeSyncResult(string $action, ?string $workspace, array $result): void {
        if (session_status() === PHP_SESSION_NONE) session_start();
        $_SESSION['last_sync_result'] = [
            'action' => $action,
            'workspace' => $workspace,
            'result' => $result
        ];
        $_SESSION['git_sync_async_result'] = [
            'action' => $action,
            'workspace' => $workspace,
            'result' => $result,
            'finished' => time()
        ];
        unset($_SESSION['git_sync_running']);
        session_write_close();
    }

    private function storeAsyncFileResult(string $stateFile, string $jobId, string $action, ?string $workspace, array $result): void {
        $state = $this->readAsyncStateFile($stateFile) ?: [];

        $state['running'] = null;
        $state['result'] = [
            'id' => $jobId,
            'action' => $action,
            'workspace' => $workspace,
            'result' => $result,
            'finished' => time()
        ];
        $this->writeAsyncStateFile($stateFile, $state);
    }

    private function getAsyncStateFile(): string {
        $sessionId = session_id() ?: bin2hex(random_bytes(16));
        return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'poznote_git_sync_' . hash('sha256', $sessionId) . '.json';
    }

    private function readAsyncStateFile(string $stateFile): array {
        if (!is_file($stateFile)) return [];
        $decoded = json_decode((string) @file_get_contents($stateFile), true);
        return is_array($decoded) ? $decoded : [];
    }

    private function writeAsyncStateFile(string $stateFile, array $state): void {
        $tmpFile = $stateFile . '.' . getmypid() . '.tmp';
        @file_put_contents($tmpFile, json_encode($state), LOCK_EX);
        @rename($tmpFile, $stateFile);
    }

    private function isAsyncStateStale(array $state): bool {
        $progressTimestamp = (int) ($state['progress']['timestamp'] ?? 0);
        $startedTimestamp = (int) ($state['running']['started'] ?? 0);
        $lastActivity = max($progressTimestamp, $startedTimestamp);
        return $lastActivity > 0 && (time() - $lastActivity) > self::ASYNC_STALE_AFTER;
    }
    
    /**
     * PUT /api/v1/git-sync/config
     * Save per-user Git sync configuration
     * Body: { "provider": "github", "repo": "owner/repo", "token": "...", "branch": "main", "api_base": "", "author_name": "...", "author_email": "..." }
     */
    public function saveConfig() {
        if (!$this->requireActiveAccountOwner()) {
            return;
        }

        require_once dirname(__DIR__, 3) . '/GitSync.php';
        
        if (!GitSync::isEnabled()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Git sync is not enabled']);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
            return;
        }
        
        $sync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
        $result = $sync->saveUserGitConfig($input);
        
        echo json_encode([
            'success' => $result,
            'config' => $sync->getConfigStatus()
        ]);
    }
}
