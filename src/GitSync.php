<?php
/**
 * GitSync - Git synchronization for Poznote notes (GitHub, GitLab, Forgejo)
 * 
 * Handles pushing and pulling notes from a Git repository using the provider's API.
 * Per-user configuration is stored in the user's database settings table,
 * with environment variables as fallback defaults.
 */

class GitSync {
    // Supported file extensions
    const SUPPORTED_NOTE_EXTENSIONS = ['md', 'html', 'txt', 'markdown', 'json', 'excalidraw'];
    const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'txt'];
    // Supported providers; anything else falls back to GitHub
    const PROVIDERS = ['github', 'gitlab', 'forgejo'];
    
    private $token;
    private $repo;
    private $branch;
    private $authorName;
    private $authorEmail;
    private $provider;
    private $apiBase;
    private $con;
    private $progressStateFile = null;

    /**
     * Cached synced-workspaces setting.
     * false = not loaded yet, null = all workspaces, array = restricted list
     */
    private $syncedWorkspacesCache = false;

    /**
     * Get the configured git provider (github, gitlab, forgejo)
     */
    public function getProvider(): string {
        return $this->provider;
    }
    
    /**
     * @var int|null User ID for per-user Git sync configuration
     */
    private $userId;
    
    /**
     * Constructor
     * @param PDO|null $con Database connection (user's database)
     * @param int|null $userId User ID for per-user config
     */
    public function __construct($con = null, $userId = null) {
        require_once __DIR__ . '/config.php';
        
        $this->con = $con;
        $this->userId = $userId;

        // Load per-user settings from DB, falling back to env vars
        $userSettings = $this->loadUserGitSettings();
        
        // Critical settings: Token and Repo must BE SPECIFIC to each user.
        // We do NOT use global fallbacks from .env for these to prevent accidental cross-user synchronization.
        $this->token = trim($userSettings['git_token'] ?? '');
        $this->repo = trim($userSettings['git_repo'] ?? '');
        
        // Per-user settings — no global fallback needed
        $this->branch = trim($userSettings['git_branch'] ?? 'main');
        $this->authorName = $userSettings['git_author_name'] ?? 'Poznote';
        $this->authorEmail = $userSettings['git_author_email'] ?? 'poznote@localhost';
        $this->provider = $userSettings['git_provider'] ?? 'github';
        
        $userApiBase = $userSettings['git_api_base'] ?? null;
        $this->apiBase = !empty($userApiBase) ? trim($userApiBase) : $this->getDefaultApiBase();

        // Progress writes open the session only when needed. Keeping the constructor
        // session-free prevents async sync jobs from blocking progress polling.
    }
    
    /**
     * Derive a 32-byte encryption key from the instance secret.
     * Auto-generates and persists a key in data/.app_secret.
     * For backward compat, POZNOTE_APP_SECRET env var is still honoured
     * and its value is migrated to the key file so users can remove it.
     */
    private function getEncryptionKey(): string {
        $keyFile = __DIR__ . '/data/.app_secret';
        $envSecret = getenv('POZNOTE_APP_SECRET');

        if ($envSecret) {
            // Migrate env-var value to file so users can drop the env var later
            if (!file_exists($keyFile)) {
                file_put_contents($keyFile, $envSecret);
                chmod($keyFile, 0600);
            }
            return hash('sha256', $envSecret, true);
        }

        if (file_exists($keyFile)) {
            $secret = trim(file_get_contents($keyFile));
        } else {
            $secret = bin2hex(random_bytes(32));
            file_put_contents($keyFile, $secret);
            chmod($keyFile, 0600);
        }

        return hash('sha256', $secret, true);
    }

    private function encryptToken(string $plain): string {
        $key = $this->getEncryptionKey();
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return 'enc1:' . base64_encode($iv . $tag . $cipher);
    }

    private function decryptToken(string $stored): string {
        if (strncmp($stored, 'enc1:', 5) !== 0) {
            // Legacy plaintext value — return as-is (backward compat)
            return $stored;
        }
        $key = $this->getEncryptionKey();
        $data = base64_decode(substr($stored, 5));
        $iv   = substr($data, 0, 12);
        $tag  = substr($data, 12, 16);
        $cipher = substr($data, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return $plain !== false ? $plain : '';
    }

    /**
     * Load per-user Git settings from the user's database.
     * Returns an associative array of settings, empty if none found.
     */
    private function loadUserGitSettings() {
        if (!$this->con) return [];
        
        try {
            $keys = ['git_token', 'git_repo', 'git_branch', 'git_provider', 'git_api_base', 'git_author_name', 'git_author_email'];
            $placeholders = implode(',', array_fill(0, count($keys), '?'));
            $stmt = $this->con->prepare("SELECT key, value FROM settings WHERE key IN ($placeholders)");
            $stmt->execute($keys);
            
            $settings = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                if ($row['value'] !== null && $row['value'] !== '') {
                    $value = $row['value'];
                    if ($row['key'] === 'git_token') {
                        $value = $this->decryptToken($value);
                    }
                    $settings[$row['key']] = $value;
                }
            }
            return $settings;
        } catch (Exception $e) {
            return [];
        }
    }
    
    /**
     * Save per-user Git configuration to the user's database.
     * @param array $config Associative array with keys: token, repo, branch, provider, api_base, author_name, author_email
     * @return bool Success
     */
    public function saveUserGitConfig($config) {
        if (!$this->con) return false;
        
        $mapping = [
            'token' => 'git_token',
            'repo' => 'git_repo',
            'branch' => 'git_branch',
            'provider' => 'git_provider',
            'api_base' => 'git_api_base',
            'author_name' => 'git_author_name',
            'author_email' => 'git_author_email',
        ];
        
        try {
            $stmt = $this->con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            foreach ($mapping as $inputKey => $dbKey) {
                if (array_key_exists($inputKey, $config)) {
                    $value = trim((string) $config[$inputKey]);
                    if ($inputKey === 'token' && $value !== '') {
                        $value = $this->encryptToken($value);
                    }
                    if ($inputKey === 'provider' && !in_array($value, self::PROVIDERS, true)) {
                        $value = 'github';
                    }
                    $stmt->execute([$dbKey, $value]);
                }
            }
            
            // Reload instance properties from the saved config
            $userSettings = $this->loadUserGitSettings();
            $this->token = trim($userSettings['git_token'] ?? '');
            $this->repo = trim($userSettings['git_repo'] ?? '');
            $this->branch = trim($userSettings['git_branch'] ?? 'main');
            $this->authorName = $userSettings['git_author_name'] ?? 'Poznote';
            $this->authorEmail = $userSettings['git_author_email'] ?? 'poznote@localhost';
            $this->provider = $userSettings['git_provider'] ?? 'github';
            $userApiBase = $userSettings['git_api_base'] ?? null;
            $this->apiBase = !empty($userApiBase) ? trim($userApiBase) : $this->getDefaultApiBase();
            
            return true;
        } catch (Exception $e) {
            error_log("GitSync::saveUserGitConfig error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Check if current user has per-user Git config (as opposed to using env vars)
     * @return bool
     */
    public function hasUserConfig() {
        $settings = $this->loadUserGitSettings();
        return !empty($settings['git_token']) || !empty($settings['git_repo']);
    }

    public function setProgressStateFile(?string $path): void {
        $this->progressStateFile = $path;
    }

    private function writeProgressState(array $state): void {
        if (!$this->progressStateFile) return;
        $existing = [];
        if (is_file($this->progressStateFile)) {
            $decoded = json_decode((string) @file_get_contents($this->progressStateFile), true);
            if (is_array($decoded)) $existing = $decoded;
        }
        $tmpFile = $this->progressStateFile . '.' . getmypid() . '.tmp';
        @file_put_contents($tmpFile, json_encode(array_merge($existing, $state)), LOCK_EX);
        @rename($tmpFile, $this->progressStateFile);
    }

    /**
     * Update sync progress in session
     * @param int $current Current item being processed
     * @param int $total Total number of items
     * @param string $message Action message
     */
    public function updateProgress($current, $total, $message = '') {
        $progress = [
            'current' => $current,
            'total' => $total,
            'percentage' => $total > 0 ? min(100, round(($current / $total) * 100)) : 0,
            'message' => $message,
            'timestamp' => time()
        ];

        if ($this->progressStateFile) {
            $this->writeProgressState(['progress' => $progress]);
            return;
        }

        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        $_SESSION['git_sync_progress'] = $progress;
        
        // Write and close to release lock for other potential requests (polling)
        session_write_close();
    }

    /**
     * Clear progress from session
     */
    public function clearProgress() {
        if ($this->progressStateFile) {
            $this->writeProgressState(['progress' => null]);
            return;
        }

        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        unset($_SESSION['git_sync_progress']);
        session_write_close();
    }

    /**
     * Default API base URL of a provider. Public so the settings page can
     * avoid persisting a value that only restates the default.
     */
    public static function defaultApiBaseFor(string $provider): string {
        switch ($provider) {
            case 'forgejo':
                // Forgejo instances are often self-hosted
                return 'http://localhost:3000/api/v1';
            case 'gitlab':
                // Self-hosted instances use https://gitlab.example.com/api/v4
                return 'https://gitlab.com/api/v4';
            case 'github':
            default:
                return 'https://api.github.com';
        }
    }

    /**
     * Get default API base URL for the configured provider
     */
    private function getDefaultApiBase() {
        return self::defaultApiBaseFor($this->provider);
    }

    /**
     * GitLab addresses a project by its URL-encoded full path
     * (group/subgroup/project) or by numeric ID.
     */
    private function gitlabProjectId(): string {
        return rawurlencode(trim($this->repo, '/'));
    }

    /**
     * GitLab takes the whole file path as one URL-encoded segment, whereas
     * GitHub and Forgejo keep the slashes.
     */
    private function encodeRepoPath(string $path): string {
        if ($this->provider === 'gitlab') {
            return rawurlencode($path);
        }
        return implode('/', array_map('rawurlencode', explode('/', $path)));
    }
    
    /**
     * Check if Git sync is enabled and properly configured
     * @return bool True if Git sync is enabled
     */
    public static function isEnabled() {
        require_once __DIR__ . '/config.php';
        return defined('GIT_SYNC_ENABLED') && GIT_SYNC_ENABLED === true;
    }
    
    /**
     * Check if configuration is valid
     * @return bool True if token and repository are configured
     */
    public function isConfigured() {
        return !empty($this->token) && !empty($this->repo);
    }
    
    /**
     * Get current configuration status (without exposing sensitive data)
     * @return array Configuration status with repo, branch, etc.
     */
    public function getConfigStatus() {
        return [
            'enabled' => self::isEnabled(),
            'configured' => $this->isConfigured(),
            'repo' => $this->repo ?: null,
            'branch' => $this->branch,
            'hasToken' => !empty($this->token),
            'authorName' => $this->authorName,
            'authorEmail' => $this->authorEmail,
            'provider' => $this->provider,
            'apiBase' => $this->apiBase,
            'autoPush' => $this->isAutoPushEnabled(),
            'autoPull' => $this->isAutoPullEnabled(),
            'syncedWorkspaces' => $this->getSyncedWorkspaces(),
            'hasUserConfig' => $this->hasUserConfig()
        ];
    }
    
    /**
     * Test connection to API
     * @return array Result with success status and repository info or error message
     */
    public function testConnection() {
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'error' => 'Git sync is not properly configured. Check your .env file.'
            ];
        }
        
        // For Forgejo/Gitea, testing /user first can help diagnose token/user issues
        if ($this->provider === 'forgejo') {
            $userResponse = $this->apiRequest('GET', "/user");
            if (isset($userResponse['error'])) {
                $truncatedToken = substr($this->token, 0, 4) . '...' . substr($this->token, -4);
                return [
                    'success' => false,
                    'error' => "Auth failed: " . $userResponse['error'] . " (URL: " . $this->apiBase . ", Provider: " . $this->provider . ", Token starts with: " . substr($this->token, 0, 4) . ")"
                ];
            }
        }

        if ($this->provider === 'gitlab') {
            $response = $this->apiRequest('GET', '/projects/' . $this->gitlabProjectId());
            if (isset($response['error'])) {
                return ['success' => false, 'error' => $response['error']];
            }
            if (isset($response['id'])) {
                return [
                    'success' => true,
                    'repo' => $response['path_with_namespace'] ?? $this->repo,
                    'description' => $response['description'] ?? '',
                    'private' => ($response['visibility'] ?? 'private') !== 'public',
                    'default_branch' => $response['default_branch'] ?? 'main'
                ];
            }
            return [
                'success' => false,
                'error' => 'Unable to access project. Check your token and project path.'
            ];
        }

        // Test API access to repository
        $response = $this->apiRequest('GET', "/repos/{$this->repo}");
        
        if (isset($response['error'])) {
            return [
                'success' => false,
                'error' => $response['error']
            ];
        }
        
        if (isset($response['id'])) {
            return [
                'success' => true,
                'repo' => $response['full_name'],
                'description' => $response['description'] ?? '',
                'private' => $response['private'] ?? false,
                'default_branch' => $response['default_branch'] ?? 'main'
            ];
        }
        
        return [
            'success' => false,
            'error' => 'Unable to access repository. Check your token and repository name.'
        ];
    }
    
    /**
     * Get the latest sync status from database
     * @return array|null Sync information or null if not found
     */
    public function getLastSyncInfo() {
        if (!$this->con) {
            return null;
        }
        
        try {
            $stmt = $this->con->prepare("SELECT value FROM settings WHERE key = 'github_last_sync'");
            $stmt->execute();
            $result = $stmt->fetchColumn();
            
            if ($result) {
                return json_decode($result, true);
            }
        } catch (Exception $e) {
            error_log("GitSync::getLastSyncInfo error: " . $e->getMessage());
        }
        
        return null;
    }
    
    /**
     * Check if automatic push (on save) is enabled
     * @return bool
     */
    public function isAutoPushEnabled() {
        if (!$this->con) return false;
        try {
            $stmt = $this->con->prepare("SELECT value FROM settings WHERE key = 'git_sync_auto_push'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            return $val === '1' || $val === 'true';
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Check if automatic pull (on load) is enabled
     * @return bool
     */
    public function isAutoPullEnabled() {
        if (!$this->con) return false;
        try {
            $stmt = $this->con->prepare("SELECT value FROM settings WHERE key = 'git_sync_auto_pull'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            return $val === '1' || $val === 'true';
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Get the workspaces included in Git sync.
     * @return array|null Workspace names, or null when every workspace is synced
     */
    public function getSyncedWorkspaces() {
        if ($this->syncedWorkspacesCache !== false) return $this->syncedWorkspacesCache;

        $this->syncedWorkspacesCache = null;
        if (!$this->con) return null;
        try {
            $stmt = $this->con->prepare("SELECT value FROM settings WHERE key = 'git_sync_workspaces'");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            if ($val === false || $val === null || $val === '') return null;

            $list = json_decode($val, true);
            if (!is_array($list)) return null;
            $names = [];
            foreach ($list as $ws) {
                $ws = trim((string) $ws);
                if ($ws !== '') $names[$ws] = true;
            }
            if (!empty($names)) {
                // PHP turns numeric-string array keys into ints; force strings
                // back so the strict in_array() in isWorkspaceSynced() matches
                // a workspace named e.g. "2024".
                $this->syncedWorkspacesCache = array_map('strval', array_keys($names));
            }
        } catch (Exception $e) {
            // Fall through to "all workspaces"
        }
        return $this->syncedWorkspacesCache;
    }

    /**
     * Restrict Git sync to the given workspaces.
     * @param array|null $workspaces Workspace names; null or an empty list = sync all
     * @return bool Success
     */
    public function setSyncedWorkspaces($workspaces) {
        if (!$this->con) return false;
        try {
            $names = [];
            if (is_array($workspaces)) {
                foreach ($workspaces as $ws) {
                    $ws = trim((string) $ws);
                    if ($ws !== '') $names[$ws] = true;
                }
            }
            $stmt = $this->con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('git_sync_workspaces', ?)");
            $ok = $stmt->execute([empty($names) ? '' : json_encode(array_map('strval', array_keys($names)), JSON_UNESCAPED_UNICODE)]);
            $this->syncedWorkspacesCache = false;
            return $ok;
        } catch (Exception $e) {
            error_log('GitSync::setSyncedWorkspaces error: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Check whether a workspace is included in Git sync.
     * @param string|null $workspace Workspace name (null = default workspace)
     * @return bool
     */
    public function isWorkspaceSynced($workspace) {
        $list = $this->getSyncedWorkspaces();
        if ($list === null) return true;
        $workspace = ($workspace === null || $workspace === '') ? 'Poznote' : (string) $workspace;
        return in_array($workspace, $list, true);
    }

    /**
     * Check whether a note's workspace is included in Git sync.
     * Unknown notes are treated as synced so a bad lookup never blocks a push.
     * @param int $noteId
     * @return bool
     */
    private function isNoteWorkspaceSynced($noteId) {
        if ($this->getSyncedWorkspaces() === null) return true;
        if (!$this->con) return true;
        try {
            $stmt = $this->con->prepare('SELECT workspace FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return true;
            return $this->isWorkspaceSynced($row['workspace']);
        } catch (Exception $e) {
            return true;
        }
    }

    /**
     * Enable or disable automatic push
     * @param bool $enabled
     */
    public function setAutoPushEnabled($enabled) {
        if (!$this->con) return false;
        try {
            $stmt = $this->con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('git_sync_auto_push', ?)");
            return $stmt->execute([$enabled ? '1' : '0']);
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Enable or disable automatic pull
     * @param bool $enabled
     */
    public function setAutoPullEnabled($enabled) {
        if (!$this->con) return false;
        try {
            $stmt = $this->con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('git_sync_auto_pull', ?)");
            return $stmt->execute([$enabled ? '1' : '0']);
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Push a single note to Git repository
     * @param int $noteId Note ID to push
     * @return array Result
     */
    public function pushNote($noteId) {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Git sync is not configured'];
        }
        
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }
        
        try {
            $stmt = $this->con->prepare("SELECT id, heading, type, folder_id, tags, workspace, updated, attachments FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                return ['success' => false, 'error' => 'Note not found or in trash'];
            }

            if (!$this->isWorkspaceSynced($note['workspace'])) {
                return ['success' => true, 'skipped' => true, 'reason' => 'workspace_not_synced'];
            }

            require_once __DIR__ . '/functions.php';
            $entriesPath = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();
            
            $noteType = $note['type'] ?? 'note';
            $localExtension = ($noteType === 'markdown') ? 'md' : 'html';
            $repoExtension = $localExtension;
            if ($noteType === 'tasklist' || $noteType === 'excalidraw') {
                $repoExtension = 'json';
            }
            
            $filePath = $entriesPath . '/' . $noteId . '.' . $localExtension;
            if (!file_exists($filePath)) {
                return ['success' => false, 'error' => 'File not found on disk'];
            }
            
            $content = file_get_contents($filePath);
            
            // Transform attachment links for GitHub
            if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                $attachments = json_decode($note['attachments'], true);
                if (is_array($attachments)) {
                    $content = $this->transformLinksForGitHub($content, $noteId, $attachments);
                }
            }
            
            // Path = entries/{id}.{ext} — independent of title, workspace or folder
            $repoPath = 'entries/' . $noteId . '.' . $repoExtension;

            // Push to Git
            $pushResult = $this->pushFile($repoPath, $content, "Update note {$noteId}");

            if (!$pushResult['success']) {
                return $pushResult;
            }

            // Keep metadata.json in sync so tags/folder/workspace/type survive a pull
            $this->pushMetadata();

            return $pushResult;
            
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Delete a single note from Git repository
     * @param int $noteId Note ID
     * @param int|null $folderId Folder ID
     * @param string $workspace Workspace name
     * @param string $type Note type
     * @param string $heading Note heading (used only for the commit message)
     * @return array Result
     */
    public function deleteNoteInGit($noteId, $folderId, $workspace, $type, $heading = '') {
        if (!$this->isConfigured()) return ['success' => false, 'error' => 'not_configured'];
        if (!$this->isWorkspaceSynced($workspace)) return ['success' => true, 'skipped' => true, 'reason' => 'workspace_not_synced'];

        try {
            $localExtension = ($type === 'markdown') ? 'md' : 'html';
            $repoExtension  = ($type === 'tasklist' || $type === 'excalidraw') ? 'json' : $localExtension;

            $repoPath = 'entries/' . $noteId . '.' . $repoExtension;

            return $this->deleteFile($repoPath, 'Deleted: ' . ($heading ?: "note #{$noteId}"));
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Push a single attachment to Git repository
     * @param string $filename Attachment filename
     * @param string $message Commit message
     * @return array Result
     */
    /**
     * When attachments live in an S3 bucket, Git sync leaves them alone:
     * they are not on disk, and binary files do not belong in the repo.
     */
    private function attachmentsInS3(): bool {
        require_once __DIR__ . '/storage/AttachmentStorage.php';
        return AttachmentStorage::isEnabled();
    }

    public function pushAttachment($filename, $message = '', $noteId = null) {
        if (!$this->isConfigured()) return ['success' => false, 'error' => 'not_configured'];
        if ($this->attachmentsInS3()) return ['success' => true, 'skipped' => true, 'reason' => 's3_storage'];
        if ($noteId !== null && !$this->isNoteWorkspaceSynced($noteId)) return ['success' => true, 'skipped' => true, 'reason' => 'workspace_not_synced'];
        try {
            require_once __DIR__ . '/functions.php';
            $attachmentsPath = getAttachmentsPath();
            $filePath = $attachmentsPath . '/' . $filename;
            if (!file_exists($filePath)) return ['success' => false, 'error' => 'Attachment file not found'];
            $content = file_get_contents($filePath);
            return $this->pushFile('attachments/' . $filename, $content, $message ?: "Update attachment: {$filename}");
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Delete a single attachment from Git repository
     * @param string $filename Attachment filename
     * @param string $message Commit message
     * @return array Result
     */
    public function deleteAttachmentInGit($filename, $message = '', $noteId = null) {
        if (!$this->isConfigured()) return ['success' => false, 'error' => 'not_configured'];
        if ($this->attachmentsInS3()) return ['success' => true, 'skipped' => true, 'reason' => 's3_storage'];
        if ($noteId !== null && !$this->isNoteWorkspaceSynced($noteId)) return ['success' => true, 'skipped' => true, 'reason' => 'workspace_not_synced'];
        try {
            return $this->deleteFile('attachments/' . $filename, $message ?: "Deleted attachment: {$filename}");
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Save sync info to database
     * @param array $info Sync information to save
     * @return bool Success status
     */
    private function saveSyncInfo($info) {
        if (!$this->con) {
            return false;
        }
        
        try {
            $stmt = $this->con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('github_last_sync', ?)");
            $stmt->execute([json_encode($info)]);
            return true;
        } catch (Exception $e) {
            error_log("GitSync::saveSyncInfo error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Push all notes to Git repository
     * @return array Results with success status, counts, and errors
     */
    public function pushNotes() {
        set_time_limit(0); 

        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Git sync is not configured'];
        }
        
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }
        
        $results = [
            'success'            => true,
            'pushed'             => 0,
            'attachments_pushed' => 0,
            'deleted'            => 0,
            'skipped'            => 0,
            'errors'             => [],
            'debug'              => [],
        ];
        
        try {
            require_once __DIR__ . '/functions.php';
            $entriesPath     = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();

            // ── 1. Build remote SHA map ──
            $tree   = $this->getRepoTree();
            $shaMap = [];
            if (isset($tree['error'])) {
                $results['success'] = false;
                $results['errors'][] = ['path' => 'repository_tree', 'error' => $tree['error']];
                return $results;
            }

            foreach ($tree as $item) {
                if ($item['type'] === 'blob') $shaMap[$item['path']] = $item['sha'];
            }

            // ── 2. Scan local directories ──
            $entryFiles      = is_dir($entriesPath)     ? array_values(array_filter(array_diff(scandir($entriesPath),     ['.', '..']), fn($f) => is_file($entriesPath     . '/' . $f))) : [];
            $attachmentFiles = is_dir($attachmentsPath) ? array_values(array_filter(array_diff(scandir($attachmentsPath), ['.', '..']), fn($f) => is_file($attachmentsPath . '/' . $f))) : [];
            // S3 mode: attachments are out of Git sync's scope entirely
            $skipAttachments = $this->attachmentsInS3();
            if ($skipAttachments) $attachmentFiles = [];

            // Scope the disk listing through the DB: only non-trashed notes in
            // synced workspaces are pushed. A trashed note's file stays on disk,
            // so without the trash = 0 check a full push would re-add the note
            // right after its "Deleted" commit (#1314). Out-of-scope files
            // already in the repo become orphans below and get pruned, so the
            // repo always mirrors the synced set exactly.
            $syncedWorkspaces = $this->getSyncedWorkspaces();
            $workspaceFilter  = '';
            $workspaceParams  = [];
            if ($syncedWorkspaces !== null) {
                $placeholders    = implode(',', array_fill(0, count($syncedWorkspaces), '?'));
                $workspaceFilter = " WHERE COALESCE(workspace, 'Poznote') IN ($placeholders)";
                $workspaceParams = $syncedWorkspaces;
            }
            $stmt = $this->con->prepare("SELECT id, attachments, trash FROM entries" . $workspaceFilter);
            $stmt->execute($workspaceParams);
            $activeNoteIds         = [];
            $activeAttachmentNames = [];
            $syncedAttachmentNames = []; // trashed rows included: feeds the bucket-history protection below
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $attNames = [];
                if (!empty($row['attachments'])) {
                    $atts = json_decode($row['attachments'], true);
                    if (is_array($atts)) {
                        foreach ($atts as $att) {
                            if (!empty($att['filename'])) $attNames[] = $att['filename'];
                        }
                    }
                }
                foreach ($attNames as $name) $syncedAttachmentNames[$name] = true;
                if (empty($row['trash'])) {
                    $activeNoteIds[(int) $row['id']] = true;
                    foreach ($attNames as $name) $activeAttachmentNames[$name] = true;
                }
            }
            $entryFiles = array_values(array_filter($entryFiles, function ($f) use ($activeNoteIds) {
                return isset($activeNoteIds[(int) pathinfo($f, PATHINFO_FILENAME)]);
            }));
            $attachmentFiles = array_values(array_filter($attachmentFiles, function ($f) use ($activeAttachmentNames) {
                return isset($activeAttachmentNames[$f]);
            }));
            if ($syncedWorkspaces !== null) {
                $results['debug'][] = 'Workspace scope: ' . implode(', ', $syncedWorkspaces);
            }

            $expectedPathSet = ['metadata.json' => true];
            foreach ($entryFiles as $filename) {
                $expectedPathSet['entries/' . $filename] = true;
            }
            foreach ($attachmentFiles as $filename) {
                $expectedPathSet['attachments/' . $filename] = true;
            }

            $orphanPaths = [];
            foreach ($shaMap as $remotePath => $_sha) {
                // Repo attachments are not orphans while a bucket is in play:
                // the local directory is empty by design, and deleting them
                // would destroy the repo's history of pre-migration
                // attachments. Gated on the credentials rather than the S3
                // switch, because turning the switch off does not bring the
                // files back to disk: they stay in the bucket and Poznote
                // still serves them. Instances that never configured a bucket
                // are unaffected and keep pruning normally.
                if (strpos($remotePath, 'attachments/') === 0
                    && ($skipAttachments || AttachmentStorage::isConfigured())) {
                    // Workspace scope overrides the bucket protection: an
                    // attachment that belongs to no synced note must not stay
                    // in the repo. Bucket-served attachments of synced notes
                    // are still kept ($syncedAttachmentNames comes from the
                    // DB, which lists them whether they are on disk or not).
                    if ($syncedWorkspaces === null
                        || isset($syncedAttachmentNames[substr($remotePath, strlen('attachments/'))])) {
                        continue;
                    }
                }
                if (!isset($expectedPathSet[$remotePath])) {
                    $orphanPaths[$remotePath] = $_sha;
                }
            }

            $totalSteps  = count($entryFiles) + count($attachmentFiles) + count($orphanPaths) + 1;
            $currentStep = 0;
            $this->updateProgress(0, $totalSteps, 'Starting push...');

            // ── 3. Push entries/ ──
            foreach ($entryFiles as $filename) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Pushing: {$filename}");

                $repoPath = 'entries/' . $filename;
                $content  = file_get_contents($entriesPath . '/' . $filename);
                if ($content === false) {
                    $results['errors'][] = ['path' => $repoPath, 'error' => 'Unable to read local file'];
                    $results['debug'][]  = "  {$repoPath} → ERROR: unable to read local file";
                    continue;
                }

                $pushResult = $this->pushFile($repoPath, $content, "Update: {$filename}", $shaMap);
                if ($pushResult['success']) {
                    if (isset($pushResult['skipped']) && $pushResult['skipped']) {
                        $results['skipped']++;
                        $results['debug'][] = "  {$repoPath} → unchanged";
                    } else {
                        $results['pushed']++;
                        $results['debug'][] = "  {$repoPath} → pushed";
                    }
                } else {
                    $results['errors'][] = ['path' => $repoPath, 'error' => $pushResult['error']];
                    $results['debug'][]  = "  {$repoPath} → ERROR: " . $pushResult['error'];
                }
            }

            // ── 4. Push attachments/ ──
            foreach ($attachmentFiles as $filename) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Pushing attachment: {$filename}");

                $repoPath = 'attachments/' . $filename;
                $content  = file_get_contents($attachmentsPath . '/' . $filename);
                if ($content === false) {
                    $results['errors'][] = ['path' => $repoPath, 'error' => 'Unable to read local file'];
                    $results['debug'][]  = "  {$repoPath} → ERROR: unable to read local file";
                    continue;
                }

                $pushResult = $this->pushFile($repoPath, $content, "Update attachment: {$filename}", $shaMap);
                if ($pushResult['success']) {
                    if (!empty($pushResult['skipped'])) {
                        $results['skipped']++;
                        $results['debug'][] = "  {$repoPath} → unchanged";
                    } else {
                        $results['attachments_pushed']++;
                        $results['debug'][] = "  {$repoPath} → pushed";
                    }
                } else {
                    $results['errors'][] = ['path' => $repoPath, 'error' => $pushResult['error']];
                    $results['debug'][]  = "  {$repoPath} → ERROR: " . $pushResult['error'];
                }
                
                $results['debug'][] = "";
            }

            // ── 5. Push metadata.json ──
            $currentStep++;
            $this->updateProgress($currentStep, $totalSteps, 'Pushing metadata...');
            $metaResult = $this->pushMetadata($shaMap);
            if ($metaResult['success']) {
                if (empty($metaResult['skipped'])) {
                    $results['pushed']++;
                    $results['debug'][] = '  metadata.json → pushed';
                } else {
                    $results['debug'][] = '  metadata.json → unchanged';
                }
            } else {
                $results['errors'][] = ['path' => 'metadata.json', 'error' => $metaResult['error'] ?? 'unknown'];
                $results['debug'][]  = '  metadata.json → ERROR: ' . ($metaResult['error'] ?? 'unknown');
            }

            // ── 5b. Delete remote orphans ──
            $this->updateProgress($currentStep, $totalSteps, 'Cleaning up remote orphans...');
            foreach ($orphanPaths as $remotePath => $remoteSha) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Deleting: {$remotePath}");
                $delResult = $this->deleteFile($remotePath, 'Deleted from Poznote', $remoteSha);
                if ($delResult['success']) {
                    $results['deleted']++;
                    $results['debug'][] = "  {$remotePath} → deleted";
                } else {
                    $results['errors'][] = ['path' => $remotePath, 'error' => $delResult['error']];
                    $results['debug'][]  = "  {$remotePath} → delete ERROR: " . $delResult['error'];
                }
            }

            // ── 6. Save sync info ──
            $this->updateProgress($totalSteps, $totalSteps, 'Push complete!');
            $this->saveSyncInfo([
                'timestamp'   => date('c'),
                'action'      => 'push',
                'pushed'      => $results['pushed'],
                'attachments' => $results['attachments_pushed'],
                'deleted'     => $results['deleted'],
                'errors'      => count($results['errors']),
            ]);
            $this->clearProgress();

        } catch (Exception $e) {
            $this->clearProgress();
            $results['success']  = false;
            $results['errors'][] = ['error' => $e->getMessage()];
        }
        
        return $results;
    }
    
    /**
     * Pull notes from GitHub repository
     * All entries and attachments are pulled regardless of workspace.
     * @return array Results with success status, counts, and errors
     */
    public function pullNotes() {
        set_time_limit(0);

        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Git sync is not configured'];
        }

        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }

        $results = [
            'success' => true,
            'pulled' => 0,
            'updated' => 0,
            'deleted' => 0,
            'unchanged' => 0,
            'errors' => [],
            'debug' => []
        ];
        
        try {
            require_once __DIR__ . '/functions.php';
            $entriesPath     = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();

            // ── 1. Get remote tree ──
            $tree = $this->getRepoTree();
            
            if (isset($tree['error'])) {
                $results['success'] = false;
                $results['errors'][] = ['path' => 'repository_tree', 'error' => $tree['error']];
                return $results;
            }

            // ── 2. Categorise remote files ──
            $noteFiles       = [];   // ['entries/183.html', ...]
            $attachmentFiles = [];   // ['attachments/foo.png', ...]
            $remoteShaMap    = [];
            $hasMetadata     = false;

            // Filenames the bucket already holds. Copying those back to disk
            // would shadow the objects Poznote serves and take the space
            // twice, so they are skipped below. Deliberately a skip list
            // rather than a blanket "a bucket exists, pull nothing": an
            // attachment the bucket does NOT have must still be restored
            // from the repo. An unreachable bucket leaves the list empty,
            // which falls back to pulling everything — duplicated at worst,
            // never lost.
            $bucketFilenames = [];
            require_once __DIR__ . '/storage/AttachmentStorage.php';
            if (AttachmentStorage::isConfigured() && $this->userId !== null) {
                try {
                    foreach (AttachmentStorage::forUser((int)$this->userId)->listRemote() as $object) {
                        $bucketFilenames[$object['filename']] = true;
                    }
                } catch (Exception $e) {
                    error_log('Git pull: bucket listing failed, pulling every attachment: ' . $e->getMessage());
                }
            }
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                $path = $item['path'];
                if (isset($item['sha'])) $remoteShaMap[$path] = $item['sha'];
                if ($path === 'metadata.json') {
                    $hasMetadata = true;
                } elseif (strpos($path, 'entries/') === 0) {
                    $ext = pathinfo($path, PATHINFO_EXTENSION);
                    if (in_array($ext, self::SUPPORTED_NOTE_EXTENSIONS)) $noteFiles[] = $path;
                } elseif (strpos($path, 'attachments/') === 0) {
                    // S3 mode: do not pull attachments back onto local disk;
                    // otherwise skip only the ones the bucket already serves
                    if (!$this->attachmentsInS3() && !isset($bucketFilenames[basename($path)])) {
                        $attachmentFiles[] = $path;
                    }
                }
            }

            $this->updateProgress(0, 1, 'Starting pull...');

            // ── 2b. Download metadata.json ──
            $metadata         = [];   // note metadata keyed by note id
            $foldersSource    = [];   // folder list to recreate
            $remoteWorkspaces = null; // workspaces the remote knows about (null = no metadata)
            if ($hasMetadata) {
                $raw = $this->getFileContent('metadata.json');
                if (!isset($raw['error'])) {
                    $parsed = json_decode($raw['content'], true);
                    if (is_array($parsed)) {
                        // Support both old format (flat) and new format (notes + folders)
                        if (isset($parsed['notes'])) {
                            $metadata      = $parsed['notes'];
                            $foldersSource = $parsed['folders'] ?? [];
                        } else {
                            $metadata = $parsed; // legacy flat format
                        }
                        $results['debug'][] = 'Loaded metadata.json (' . count($metadata) . ' notes, ' . count($foldersSource) . ' folders)';

                        // Workspaces the remote is authoritative for: the explicit
                        // list written by newer pushes, plus everything derived
                        // from note/folder metadata (covers older repos).
                        $remoteWorkspaces = [];
                        if (isset($parsed['workspaces']) && is_array($parsed['workspaces'])) {
                            foreach ($parsed['workspaces'] as $ws) {
                                if (is_string($ws) && $ws !== '') $remoteWorkspaces[$ws] = true;
                            }
                        }
                        foreach ($metadata as $meta) {
                            $ws = (isset($meta['workspace']) && $meta['workspace'] !== '') ? $meta['workspace'] : 'Poznote';
                            $remoteWorkspaces[$ws] = true;
                        }
                        foreach ($foldersSource as $folder) {
                            $ws = (isset($folder['workspace']) && $folder['workspace'] !== '') ? $folder['workspace'] : 'Poznote';
                            $remoteWorkspaces[$ws] = true;
                        }

                        // Ensure workspaces listed in metadata exist (synced ones only)
                        $uniqueWorkspaces = [];
                        foreach (array_keys($remoteWorkspaces) as $ws) {
                            if ($this->isWorkspaceSynced($ws)) {
                                $uniqueWorkspaces[$ws] = true;
                            }
                        }
                        if (!empty($uniqueWorkspaces)) {
                            try {
                                $wsStmt = $this->con->prepare('INSERT OR IGNORE INTO workspaces (name) VALUES (?)');
                                foreach (array_keys($uniqueWorkspaces) as $ws) {
                                    $wsStmt->execute([$ws]);
                                }
                            } catch (Exception $e) {
                                $results['debug'][] = '  WARNING: Could not recreate workspaces: ' . $e->getMessage();
                            }
                        }
                    }
                }
            }

            // ── 2b2. Restrict the pull to synced workspaces ──
            $syncedWorkspaces = $this->getSyncedWorkspaces();
            if ($syncedWorkspaces !== null) {
                $results['debug'][] = 'Workspace scope: ' . implode(', ', $syncedWorkspaces);

                $keptNoteFiles = [];
                foreach ($noteFiles as $path) {
                    $noteKey   = (string) (int) pathinfo(basename($path), PATHINFO_FILENAME);
                    $workspace = $metadata[$noteKey]['workspace'] ?? 'Poznote';
                    if ($this->isWorkspaceSynced($workspace)) {
                        $keptNoteFiles[] = $path;
                    } else {
                        $results['debug'][] = "  Skipped {$path}: workspace '{$workspace}' is not synced";
                    }
                }
                $noteFiles = $keptNoteFiles;

                // Attachments belong to notes: keep only the ones referenced by a synced note
                if ($hasMetadata) {
                    $allowedAttachmentNames = [];
                    foreach ($metadata as $meta) {
                        if (!$this->isWorkspaceSynced($meta['workspace'] ?? 'Poznote')) continue;
                        $atts = $meta['attachments'] ?? null;
                        if (is_string($atts)) $atts = json_decode($atts, true);
                        if (!is_array($atts)) continue;
                        foreach ($atts as $att) {
                            if (!empty($att['filename'])) $allowedAttachmentNames[$att['filename']] = true;
                        }
                    }
                    $attachmentFiles = array_values(array_filter($attachmentFiles, function ($path) use ($allowedAttachmentNames) {
                        return isset($allowedAttachmentNames[basename($path)]);
                    }));
                } elseif (!$this->isWorkspaceSynced('Poznote')) {
                    // No metadata: the whole repo counts as the default workspace
                    $attachmentFiles = [];
                }

                // Only recreate folders that belong to synced workspaces
                $foldersSource = array_values(array_filter($foldersSource, function ($folder) {
                    return $this->isWorkspaceSynced($folder['workspace'] ?? 'Poznote');
                }));
            }

            $totalSteps  = count($noteFiles) + count($attachmentFiles) + 5;
            $currentStep = 0;

            // ── 2c. Recreate folders (parents before children) ──
            if (!empty($foldersSource)) {
                // Insert in multiple passes: root folders first, then children
                $toInsert = $foldersSource;
                $maxPasses = 10;
                $folderParentStmt = $this->con->prepare('SELECT id FROM folders WHERE id = ?');
                $folderInsertStmt = $this->con->prepare(
                    'INSERT OR IGNORE INTO folders (id, name, workspace, parent_id, icon, icon_color, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
                );
                while (!empty($toInsert) && $maxPasses-- > 0) {
                    $remaining = [];
                    foreach ($toInsert as $folder) {
                        // If it has a parent, make sure the parent exists first
                        if ($folder['parent_id'] !== null) {
                            $folderParentStmt->execute([$folder['parent_id']]);
                            if ($folderParentStmt->fetchColumn() === false) {
                                $remaining[] = $folder; // parent not yet inserted, retry later
                                continue;
                            }
                        }
                        // INSERT OR IGNORE preserves existing folders
                        $folderInsertStmt->execute([
                            $folder['id'],
                            $folder['name'],
                            $folder['workspace'] ?? 'Poznote',
                            $folder['parent_id'],
                            $folder['icon'],
                            $folder['icon_color'],
                            (int)($folder['display_order'] ?? 0),
                        ]);
                        $results['debug'][] = "  Folder #{$folder['id']} '{$folder['name']}' → restored";
                    }
                    $toInsert = $remaining;
                }
                if (!empty($toInsert)) {
                    $results['debug'][] = '  WARNING: ' . count($toInsert) . ' folder(s) could not be inserted (circular parent_id?)';
                }
            }

            $pulledNoteIds = [];

            // ── 3a. Download all entries (HTTP phase — no DB involvement) ──
            $downloadedNotes = []; // ['noteId' => int, 'filename' => string, 'filePath' => string]
            $unchangedNotes = []; // same shape, local content already matches remote SHA
            try {
                if (!is_dir($entriesPath)) mkdir($entriesPath, 0755, true);
                foreach ($noteFiles as $path) {
                    $currentStep++;
                    $filename = basename($path);
                    $this->updateProgress($currentStep, $totalSteps, "Checking: {$filename}");

                    $noteId = (int) pathinfo($filename, PATHINFO_FILENAME);
                    if ($noteId <= 0) {
                        $results['debug'][] = "  Skipped {$filename}: not an ID-based filename";
                        continue;
                    }

                    $localEntryFile = $entriesPath . '/' . $filename;
                    $remoteSha = $remoteShaMap[$path] ?? null;
                    if ($remoteSha && is_file($localEntryFile)) {
                        $localSha = $this->calculateGitFileSha($localEntryFile);
                        if ($localSha === $remoteSha) {
                            $this->updateProgress($currentStep, $totalSteps, "Unchanged: {$filename}");
                            $results['debug'][] = "  {$filename} → unchanged, using local copy";
                            $unchangedNotes[] = ['noteId' => $noteId, 'filename' => $filename, 'filePath' => $localEntryFile];
                            continue;
                        }
                    }

                    $this->updateProgress($currentStep, $totalSteps, "Downloading: {$filename}");
                    $raw = $this->getFileContent($path);
                    if (isset($raw['error'])) {
                        $results['errors'][] = ['path' => $path, 'error' => $raw['error']];
                        $results['debug'][]  = "  ERROR fetching {$filename}: " . $raw['error'];
                        continue;
                    }

                    // Write to disk immediately
                    file_put_contents($localEntryFile, $raw['content']);
                    $downloadedNotes[] = ['noteId' => $noteId, 'filename' => $filename, 'filePath' => $localEntryFile];
                }
            } catch (Exception $e) {
                $results['errors'][] = ['path' => 'download_loop', 'error' => $e->getMessage()];
                $results['debug'][]  = 'Error during download loop: ' . $e->getMessage();
            }

            // Populate pulledNoteIds from file lists before the transaction so that a
            // mid-transaction DB exception + ROLLBACK cannot cause existing notes to be
            // wrongly trashed in the cleanup step.
            $pulledNoteIds = array_merge(
                array_column($downloadedNotes, 'noteId'),
                array_column($unchangedNotes, 'noteId')
            );

            // ── 3b. Upsert all downloaded entries in a single transaction ──
            // A single BEGIN IMMEDIATE acquires the write lock once, avoiding hundreds of
            // lock-upgrade races that cause SQLITE_BUSY with many concurrent requests.
            if (!empty($downloadedNotes) || !empty($unchangedNotes)) {
                try {
                    $this->con->exec('BEGIN IMMEDIATE');

                    // Fetch all existing IDs in one query to avoid per-note SELECTs inside the loop
                    $existingIds = $this->con->query('SELECT id FROM entries')->fetchAll(PDO::FETCH_COLUMN, 0);
                    $existingIds = array_flip($existingIds); // key = id for O(1) lookup

                    $appendMetadataFields = function (array &$setClauses, array &$params, array $meta, bool $defaultUpdated): void {
                        if ($defaultUpdated || isset($meta['updated'])) { $setClauses[] = 'updated = ?'; $params[] = $meta['updated'] ?? gmdate('Y-m-d H:i:s'); }
                        if (isset($meta['heading']))     { $setClauses[] = 'heading = ?';     $params[] = $meta['heading']; }
                        if (isset($meta['tags']))        { $setClauses[] = 'tags = ?';        $params[] = $meta['tags']; }
                        if (isset($meta['folder_id']))   { $setClauses[] = 'folder_id = ?';   $params[] = $meta['folder_id']; }
                        if (isset($meta['folder']))      { $setClauses[] = 'folder = ?';      $params[] = $meta['folder']; }
                        if (isset($meta['workspace']))   { $setClauses[] = 'workspace = ?';   $params[] = $meta['workspace']; }
                        if (isset($meta['type']))        { $setClauses[] = 'type = ?';        $params[] = $meta['type']; }
                        if (isset($meta['attachments'])) { $setClauses[] = 'attachments = ?'; $params[] = $meta['attachments']; }
                        if (isset($meta['favorite']))    { $setClauses[] = 'favorite = ?';    $params[] = (int) $meta['favorite']; }
                        if (isset($meta['created']))     { $setClauses[] = 'created = ?';     $params[] = $meta['created']; }
                        if (array_key_exists('icon', $meta))       { $setClauses[] = 'icon = ?';       $params[] = $meta['icon']; }
                        if (array_key_exists('icon_color', $meta)) { $setClauses[] = 'icon_color = ?'; $params[] = $meta['icon_color']; }
                        if (array_key_exists('color', $meta))      { $setClauses[] = 'color = ?';      $params[] = $meta['color']; }
                    };

                    foreach ($downloadedNotes as $note) {
                        $noteId   = $note['noteId'];
                        $filename = $note['filename'];
                        $content  = file_get_contents($note['filePath']);
                        if ($content === false) {
                            throw new Exception("Unable to read downloaded note file: {$filename}");
                        }
                        $meta     = $metadata[(string) $noteId] ?? [];

                        if (isset($existingIds[$noteId])) {
                            $setClauses = ['entry = ?', 'trash = 0', 'trashed_at = NULL'];
                            $params     = [$content];
                            $appendMetadataFields($setClauses, $params, $meta, true);
                            $params[] = $noteId;
                            $this->con->prepare('UPDATE entries SET ' . implode(', ', $setClauses) . ' WHERE id = ?')
                                      ->execute($params);
                            $results['updated']++;
                            $results['debug'][] = "  {$filename} → updated";
                        } else {
                            $ext         = pathinfo($filename, PATHINFO_EXTENSION);
                            $type        = $meta['type']        ?? (($ext === 'md') ? 'markdown' : 'note');
                            $heading     = $meta['heading']     ?? $this->extractHeadingFromContent($content, $ext);
                            $tags        = $meta['tags']        ?? '';
                            $folderId    = $meta['folder_id']   ?? null;
                            $folder      = $meta['folder']      ?? 'Default';
                            $workspace   = $meta['workspace']   ?? 'Poznote';
                            $attachments = $meta['attachments'] ?? null;
                            $favorite    = (int) ($meta['favorite'] ?? 0);
                            $created     = $meta['created']     ?? gmdate('Y-m-d H:i:s');
                            $updated     = $meta['updated']     ?? gmdate('Y-m-d H:i:s');
                            $icon        = $meta['icon']        ?? null;
                            $iconColor   = $meta['icon_color']  ?? null;
                            $noteColor   = $meta['color']       ?? null;
                            $this->con->prepare(
                                'INSERT INTO entries (id, heading, entry, type, workspace, tags, folder_id, folder, attachments, favorite, created, updated, icon, icon_color, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                            )->execute([$noteId, $heading, $content, $type, $workspace, $tags, $folderId, $folder, $attachments, $favorite, $created, $updated, $icon, $iconColor, $noteColor]);
                            $results['pulled']++;
                            $results['debug'][] = "  {$filename} → created (heading: {$heading})";
                        }
                    }

                    foreach ($unchangedNotes as $note) {
                        $noteId   = $note['noteId'];
                        $filename = $note['filename'];
                        $meta     = $metadata[(string) $noteId] ?? [];

                        if (isset($existingIds[$noteId])) {
                            $setClauses = ['trash = 0', 'trashed_at = NULL'];
                            $params     = [];
                            $appendMetadataFields($setClauses, $params, $meta, false);
                            $params[] = $noteId;
                            $this->con->prepare('UPDATE entries SET ' . implode(', ', $setClauses) . ' WHERE id = ?')
                                      ->execute($params);
                            $results['unchanged']++;
                        } else {
                            $content = file_get_contents($note['filePath']);
                            if ($content === false) {
                                throw new Exception("Unable to read unchanged note file: {$filename}");
                            }
                            $ext         = pathinfo($filename, PATHINFO_EXTENSION);
                            $type        = $meta['type']        ?? (($ext === 'md') ? 'markdown' : 'note');
                            $heading     = $meta['heading']     ?? $this->extractHeadingFromContent($content, $ext);
                            $tags        = $meta['tags']        ?? '';
                            $folderId    = $meta['folder_id']   ?? null;
                            $folder      = $meta['folder']      ?? 'Default';
                            $workspace   = $meta['workspace']   ?? 'Poznote';
                            $attachments = $meta['attachments'] ?? null;
                            $favorite    = (int) ($meta['favorite'] ?? 0);
                            $created     = $meta['created']     ?? gmdate('Y-m-d H:i:s');
                            $updated     = $meta['updated']     ?? gmdate('Y-m-d H:i:s');
                            $icon        = $meta['icon']        ?? null;
                            $iconColor   = $meta['icon_color']  ?? null;
                            $noteColor   = $meta['color']       ?? null;
                            $this->con->prepare(
                                'INSERT INTO entries (id, heading, entry, type, workspace, tags, folder_id, folder, attachments, favorite, created, updated, icon, icon_color, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                            )->execute([$noteId, $heading, $content, $type, $workspace, $tags, $folderId, $folder, $attachments, $favorite, $created, $updated, $icon, $iconColor, $noteColor]);
                            $results['pulled']++;
                        }
                    }

                    $this->con->exec('COMMIT');
                } catch (Exception $transEx) {
                    try { $this->con->exec('ROLLBACK'); } catch (Exception $ignored) {}
                    $results['success']  = false;
                    $results['errors'][] = ['path' => 'db_upsert', 'error' => $transEx->getMessage()];
                    $results['debug'][]  = 'DB upsert transaction failed: ' . $transEx->getMessage();
                }
            }

            // ── 4. Download attachments ──
            if (!is_dir($attachmentsPath)) mkdir($attachmentsPath, 0755, true);
            foreach ($attachmentFiles as $path) {
                $currentStep++;
                $filename  = basename($path);
                $filenameValidation = poznoteValidateAttachmentFilename($filename);
                if (!$filenameValidation['success']) {
                    $results['errors'][] = ['attachment' => $filename, 'error' => $filenameValidation['error']];
                    $results['debug'][]  = "  Attachment SKIPPED {$filename}: " . $filenameValidation['error'];
                    continue;
                }

                $filename = $filenameValidation['filename'];
                $localFile = $attachmentsPath . '/' . $filename;
                if (file_exists($localFile)) {
                    $remoteSha = $remoteShaMap[$path] ?? null;
                    $localSha = $remoteSha ? $this->calculateGitFileSha($localFile) : null;
                    if ($remoteSha && $localSha === $remoteSha) {
                        $this->updateProgress($currentStep, $totalSteps, "Attachment unchanged: {$filename}");
                        $results['unchanged']++;
                        $results['debug'][] = "  Attachment unchanged: {$filename}";
                        continue;
                    }
                }
                $this->updateProgress($currentStep, $totalSteps, "Downloading attachment: {$filename}");
                $raw = $this->getFileContent($path);
                if (isset($raw['error'])) {
                    $results['errors'][] = ['attachment' => $filename, 'error' => $raw['error']];
                    $results['debug'][]  = "  Attachment ERROR {$filename}: " . $raw['error'];
                    continue;
                }

                $attachmentValidation = poznoteValidateAttachmentFile($filename, null, $raw['content']);
                if (!$attachmentValidation['success']) {
                    $results['errors'][] = ['attachment' => $filename, 'error' => $attachmentValidation['error']];
                    $results['debug'][]  = "  Attachment SKIPPED {$filename}: " . $attachmentValidation['error'];
                    continue;
                }

                file_put_contents($localFile, $raw['content']);
                $results['debug'][] = "  Attachment saved: {$filename}";
            }

            // ── 5. Trash local notes not on remote ──
            // A pull may only trash notes in workspaces the remote is
            // authoritative for: workspaces that are both synced AND known to
            // the remote metadata. Notes in workspaces excluded from Git sync,
            // or never pushed (e.g. freshly created or freshly added to the
            // sync scope), must never be trashed by a pull.
            $this->updateProgress($currentStep, $totalSteps, 'Cleaning up local notes...');
            try {
                $cleanupWorkspaces = $syncedWorkspaces; // null = no restriction
                if ($remoteWorkspaces !== null) {
                    $remoteNames = array_keys($remoteWorkspaces);
                    $cleanupWorkspaces = ($syncedWorkspaces === null)
                        ? $remoteNames
                        : array_values(array_intersect($syncedWorkspaces, $remoteNames));
                }
                if ($cleanupWorkspaces === null) {
                    $localIds = $this->con->query('SELECT id FROM entries WHERE trash = 0')->fetchAll(PDO::FETCH_COLUMN);
                } elseif (empty($cleanupWorkspaces)) {
                    $localIds = [];
                } else {
                    $placeholders = implode(',', array_fill(0, count($cleanupWorkspaces), '?'));
                    $localStmt = $this->con->prepare("SELECT id FROM entries WHERE trash = 0 AND COALESCE(workspace, 'Poznote') IN ($placeholders)");
                    $localStmt->execute($cleanupWorkspaces);
                    $localIds = $localStmt->fetchAll(PDO::FETCH_COLUMN);
                }
                $pulledNoteSet = array_fill_keys(array_map('intval', $pulledNoteIds), true);
                $toTrash = [];
                foreach ($localIds as $localId) {
                    if (!isset($pulledNoteSet[(int) $localId])) {
                        $toTrash[] = (int) $localId;
                    }
                }
                if (!empty($toTrash)) {
                    $this->con->exec('BEGIN IMMEDIATE');
                    $trashStmt = $this->con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now') WHERE id = ?");
                    foreach ($toTrash as $trashId) {
                        $trashStmt->execute([$trashId]);
                        $results['deleted']++;
                        $results['debug'][] = "  Trashed local note id={$trashId} (not on remote)";
                    }
                    $this->con->exec('COMMIT');
                }
            } catch (Exception $trashEx) {
                try { $this->con->exec('ROLLBACK'); } catch (Exception $ignored) {}
                $results['errors'][] = ['path' => 'trash_cleanup', 'error' => $trashEx->getMessage()];
                $results['debug'][]  = 'Trash cleanup failed: ' . $trashEx->getMessage();
            }

            // ── 6. Save sync info ──
            $this->updateProgress($totalSteps, $totalSteps, 'Pull complete!');
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action'    => 'pull',
                'pulled'    => $results['pulled'],
                'updated'   => $results['updated'],
                'deleted'   => $results['deleted'],
                'unchanged' => $results['unchanged'],
                'errors'    => count($results['errors']),
            ]);
            $this->clearProgress();

        } catch (Exception $e) {
            $this->clearProgress();
            $results['success']  = false;
            $results['errors'][] = ['error' => $e->getMessage()];
        }
        
        return $results;
    }
    
    /**
     * Delete a file from GitHub repository
     * @param string $path File path in repository
     * @param string $message Commit message
     * @return array Result with success status and error if applicable
     */
    private function deleteFile($path, $message, $sha = null) {
        $encodedPath = $this->encodeRepoPath($path);

        if ($this->provider === 'gitlab') {
            // GitLab deletes by path alone, no blob SHA needed, and answers 204
            $response = $this->apiRequest('DELETE', '/projects/' . $this->gitlabProjectId() . "/repository/files/{$encodedPath}", [
                'branch' => $this->branch,
                'commit_message' => $message,
                'author_name' => $this->authorName,
                'author_email' => $this->authorEmail
            ]);
            if (isset($response['error'])) {
                return ['success' => false, 'error' => $response['error']];
            }
            return ['success' => true];
        }

        // Get the file to retrieve its SHA (required for deletion)
        if ($sha === null) {
            $existingFile = $this->apiRequest('GET', "/repos/{$this->repo}/contents/{$encodedPath}?ref={$this->branch}");
            
            if (!isset($existingFile['sha'])) {
                return [
                    'success' => false,
                    'error' => 'File not found or unable to get SHA'
                ];
            }

            $sha = $existingFile['sha'];
        }
        
        $body = [
            'message' => $message,
            'sha' => $sha,
            'branch' => $this->branch,
            'committer' => [
                'name' => $this->authorName,
                'email' => $this->authorEmail
            ]
        ];
        
        $response = $this->apiRequest('DELETE', "/repos/{$this->repo}/contents/{$encodedPath}", $body);
        
        if (isset($response['commit'])) {
            return ['success' => true];
        }
        
        return [
            'success' => false,
            'error' => $response['message'] ?? $response['error'] ?? 'Unknown error'
        ];
    }
    
    /**
     * Calculate Git blob SHA1 for content
     */
    private function calculateGitSha($content) {
        return sha1("blob " . strlen($content) . "\0" . $content);
    }

    private function calculateGitFileSha($filePath) {
        $size = filesize($filePath);
        if ($size === false) return null;

        $handle = fopen($filePath, 'rb');
        if ($handle === false) return null;

        $context = hash_init('sha1');
        hash_update($context, "blob " . $size . "\0");
        while (!feof($handle)) {
            $chunk = fread($handle, 1024 * 1024);
            if ($chunk === false) {
                fclose($handle);
                return null;
            }
            hash_update($context, $chunk);
        }
        fclose($handle);

        return hash_final($context);
    }
    
    /**
     * Push a single file to Git provider

     * @param string $path File path in repository
     * @param string $content File content
     * @param string $message Commit message
     * @return array Result with success status, SHA, and error if applicable
     */
    private function pushFile($path, $content, $message, $shaMap = null) {

        $encodedPath = $this->encodeRepoPath($path);
        $isGitLab = ($this->provider === 'gitlab');
        $endpoint = $isGitLab
            ? '/projects/' . $this->gitlabProjectId() . "/repository/files/{$encodedPath}"
            : "/repos/{$this->repo}/contents/{$encodedPath}";
        
        // Determine if file exists (has a SHA) or is new
        $sha = null;
        $fileExists = false;
        
        if ($shaMap !== null) {
            // Use the provided tree map to avoid GET requests
            if (isset($shaMap[$path])) {
                $sha = $shaMap[$path];
                $fileExists = true;
                
                // Compare content SHA to skip unnecessary pushes
                $localSha = $this->calculateGitSha($content);
                if ($localSha === $sha) {
                    return ['success' => true, 'sha' => $sha, 'skipped' => true];
                }
            }
        } else {
            // Fallback to manual check if map not provided
            $existingFile = $this->apiRequest('GET', $endpoint . '?ref=' . rawurlencode($this->branch));
            // GitLab reports the blob SHA as blob_id
            if ($isGitLab && isset($existingFile['blob_id']) && !isset($existingFile['sha'])) {
                $existingFile['sha'] = $existingFile['blob_id'];
            }
            
            if (isset($existingFile['sha']) && is_string($existingFile['sha'])) {
                $sha = $existingFile['sha'];
                $fileExists = true;

                // Skip push if content is identical
                $localSha = $this->calculateGitSha($content);
                if ($localSha === $sha) {
                    return ['success' => true, 'sha' => $sha, 'skipped' => true];
                }
            } elseif (isset($existingFile['error']) && ($existingFile['status'] ?? 0) != 404) {
                // Non-404 error on the check → real problem
                return [
                    'success' => false,
                    'error' => "Pre-check failed: " . $existingFile['error'] . " (HTTP " . ($existingFile['status'] ?? '?') . ")"
                ];
            }
        }

        if ($isGitLab) {
            // GitLab: POST creates, PUT updates, and neither returns the blob
            // SHA, so it is computed locally (git blob SHAs are deterministic).
            $response = $this->apiRequest($fileExists ? 'PUT' : 'POST', $endpoint, [
                'branch' => $this->branch,
                'content' => base64_encode($content),
                'encoding' => 'base64',
                'commit_message' => $message,
                'author_name' => $this->authorName,
                'author_email' => $this->authorEmail
            ]);
            if (isset($response['file_path'])) {
                return ['success' => true, 'sha' => $this->calculateGitSha($content)];
            }
            return [
                'success' => false,
                'error' => $response['error'] ?? "API error: GitLab didn't confirm the file write"
            ];
        }

        $body = [
            'message' => $message,
            'content' => base64_encode($content),
            'branch' => $this->branch,
            'committer' => [
                'name' => $this->authorName,
                'email' => $this->authorEmail
            ]
        ];
        
        if ($fileExists && $sha) {
            // File exists → PUT with SHA (works for both GitHub and Forgejo)
            $body['sha'] = $sha;
            $response = $this->apiRequest('PUT', $endpoint, $body);
        } else {
            // File does not exist → create it
            // Forgejo/Gitea uses POST for creation, GitHub uses PUT
            if ($this->provider === 'forgejo') {
                $response = $this->apiRequest('POST', $endpoint, $body);
            } else {
                $response = $this->apiRequest('PUT', $endpoint, $body);
            }
        }

        
        // Extract SHA from response
        if (isset($response['content']['sha'])) {
            return ['success' => true, 'sha' => $response['content']['sha']];
        } elseif (isset($response['commit']['sha'])) {
            return ['success' => true, 'sha' => $response['commit']['sha']];
        }
        
        return [
            'success' => false,
            'error' => $response['error'] ?? ($response['message'] ?? "API error: provider didn't return a SHA after push")
        ];
    }
    
    /**
     * Get repository tree (list of all files)
     * @return array Tree array or error array
     */
    private function getRepoTree() {
        if ($this->provider === 'gitlab') {
            return $this->getGitLabRepoTree();
        }

        $response = $this->apiRequest('GET', "/repos/{$this->repo}/git/trees/{$this->branch}?recursive=1");
        
        if (isset($response['tree'])) {
            return $response['tree'];
        }
        
        return ['error' => $response['message'] ?? 'Unable to get repository tree'];
    }
    
    /**
     * GitLab paginates the tree endpoint (at most 100 entries per page), so
     * the pages are stitched into the GitHub-shaped list the sync code reads:
     * type / path / sha.
     * @return array Tree array or error array
     */
    private function getGitLabRepoTree() {
        $project = $this->gitlabProjectId();
        $perPage = 100;
        $base = "/projects/{$project}/repository/tree?ref=" . rawurlencode($this->branch) . "&recursive=true&per_page={$perPage}";
        $tree = [];

        for ($page = 1; $page <= 1000; $page++) {
            $response = $this->apiRequest('GET', $base . "&page={$page}");
            if (isset($response['error'])) {
                // A project without any commit has no tree yet: treat it as
                // empty so the first push creates the branch instead of failing.
                if ($page === 1 && ($response['status'] ?? 0) == 404) {
                    $info = $this->apiRequest('GET', "/projects/{$project}");
                    if (!empty($info['empty_repo'])) return [];
                }
                return ['error' => $response['error']];
            }
            if (!is_array($response) || ($response !== [] && !isset($response[0]))) {
                return ['error' => 'Unexpected response from the GitLab tree API'];
            }
            foreach ($response as $item) {
                if (!isset($item['path'], $item['type'])) continue;
                $tree[] = ['type' => $item['type'], 'path' => $item['path'], 'sha' => $item['id'] ?? null];
            }
            if (count($response) < $perPage) break;
        }

        return $tree;
    }

    /**
     * Get file content from repository
     * @param string $path File path in repository
     * @return array Result with content or error
     */
    private function getFileContent($path) {
        $encodedPath = $this->encodeRepoPath($path);
        $endpoint = ($this->provider === 'gitlab')
            ? '/projects/' . $this->gitlabProjectId() . "/repository/files/{$encodedPath}"
            : "/repos/{$this->repo}/contents/{$encodedPath}";
        $response = $this->apiRequest('GET', $endpoint . '?ref=' . rawurlencode($this->branch));
        
        if (isset($response['content'])) {
            $content = base64_decode($response['content']);
            return ['success' => true, 'content' => $content];
        }
        
        return ['error' => $response['message'] ?? $response['error'] ?? 'Unable to get file content'];
    }
    
    /**
     * Make API request to Git provider
     */
    private function apiRequest($method, $endpoint, $body = null) {
        $url = rtrim($this->apiBase, '/') . '/' . ltrim($endpoint, '/');
        
        $headers = [
            'User-Agent: Poznote'
        ];

        if ($this->provider === 'github') {
            $headers[] = 'Authorization: Bearer ' . $this->token;
            $headers[] = 'Accept: application/vnd.github.v3+json';
            $headers[] = 'X-GitHub-Api-Version: 2022-11-28';
        } elseif ($this->provider === 'gitlab') {
            // Accepted for personal, project and group access tokens
            $headers[] = 'PRIVATE-TOKEN: ' . $this->token;
            $headers[] = 'Accept: application/json';
        } else {
            $headers[] = 'Authorization: token ' . $this->token;
            $headers[] = 'Token: ' . $this->token;
            $headers[] = 'Accept: application/json';
        }
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        
        if ($method === 'PUT' || $method === 'POST' || $method === 'DELETE') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($body) {
                $headers[] = 'Content-Type: application/json';
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
            }
        }
        
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            return ['error' => 'cURL error: ' . $error, 'status' => 0];
        }
        
        $data = json_decode($response, true);
        
        if ($httpCode >= 400) {
            $errorMessage = $data['message'] ?? (is_string($data) ? $data : "HTTP error: $httpCode");
            
            // Special handling for Forgejo/Gitea errors that might be encoded differently
            if ($this->provider === 'forgejo' && isset($data['error'])) {
                $errorMessage = $data['error'];
            }
            // GitLab: OAuth-style errors carry error/error_description instead of message
            if ($this->provider === 'gitlab' && !isset($data['message']) && isset($data['error'])) {
                $errorMessage = $data['error_description'] ?? $data['error'];
            }
            // Validation errors can be nested objects; keep them readable
            if (is_array($errorMessage)) {
                $errorMessage = json_encode($errorMessage, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            }
            
            return [
                'error' => $errorMessage,
                'status' => $httpCode,
                'response_raw' => substr($response, 0, 200) // Keep some for debug
            ];
        }
        
        if (json_last_error() !== JSON_ERROR_NONE && !empty($response)) {
            // Not a JSON response, maybe raw content?
            return [
                'success' => true,
                'content_raw' => $response,
                'is_raw' => true
            ];
        }
        
        return $data ?: [];
    }

    /**
     * Build the full metadata array from the DB (all non-trashed notes).
     */
    private function buildMetadata() {
        if (!$this->con) return [];

        // Per-workspace scope: metadata must not leak headings/tags/folders of
        // workspaces excluded from sync.
        $syncedWorkspaces = $this->getSyncedWorkspaces();
        $workspaceFilter  = '';
        $workspaceParams  = [];
        if ($syncedWorkspaces !== null) {
            $placeholders    = implode(',', array_fill(0, count($syncedWorkspaces), '?'));
            $workspaceFilter = "COALESCE(workspace, 'Poznote') IN ($placeholders)";
            $workspaceParams = $syncedWorkspaces;
        }

        // Notes
        $stmt = $this->con->prepare(
            'SELECT id, heading, tags, folder_id, folder, workspace, type, attachments, favorite, created, updated, icon, icon_color, color FROM entries WHERE trash = 0'
            . ($workspaceFilter !== '' ? " AND $workspaceFilter" : '')
        );
        $stmt->execute($workspaceParams);
        $notes = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $notes[(string) $row['id']] = [
                'heading'     => $row['heading']     ?? '',
                'tags'        => $row['tags']         ?? '',
                'folder_id'   => $row['folder_id'] !== null ? (int) $row['folder_id'] : null,
                'folder'      => $row['folder']       ?? '',
                'workspace'   => $row['workspace']    ?? 'Poznote',
                'type'        => $row['type']          ?? 'note',
                'attachments' => $row['attachments']  ?? null,
                'favorite'    => (int) ($row['favorite'] ?? 0),
                'created'     => $row['created']      ?? null,
                'updated'     => $row['updated']      ?? null,
                'icon'        => $row['icon']         ?? null,
                'icon_color'  => $row['icon_color']   ?? null,
                'color'       => $row['color']        ?? null,
            ];
        }

        // Folders (full list so the hierarchy can be restored)
        $fstmt = $this->con->prepare(
            'SELECT id, name, workspace, parent_id, icon, icon_color, display_order FROM folders'
            . ($workspaceFilter !== '' ? " WHERE $workspaceFilter" : '')
            . ' ORDER BY id'
        );
        $fstmt->execute($workspaceParams);
        $folders = [];
        foreach ($fstmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $folders[] = [
                'id'         => (int)  $row['id'],
                'name'       => $row['name'],
                'workspace'  => $row['workspace'],
                'parent_id'  => $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
                'icon'       => $row['icon'],
                'icon_color' => $row['icon_color'],
                'display_order' => (int)($row['display_order'] ?? 0),
            ];
        }

        // Workspace names (scoped) so a pull can tell which workspaces the
        // repo is authoritative for, even ones holding no notes or folders
        $wsql    = 'SELECT name FROM workspaces';
        $wparams = [];
        if ($syncedWorkspaces !== null) {
            $wsql   .= ' WHERE name IN (' . implode(',', array_fill(0, count($syncedWorkspaces), '?')) . ')';
            $wparams = $syncedWorkspaces;
        }
        $wstmt = $this->con->prepare($wsql . ' ORDER BY name');
        $wstmt->execute($wparams);
        $workspaces = $wstmt->fetchAll(PDO::FETCH_COLUMN);

        return ['notes' => $notes, 'folders' => $folders, 'workspaces' => $workspaces];
    }

    /**
     * Push metadata.json to the repository.
     * @param array|null $shaMap Optional SHA map for skip-if-unchanged optimisation.
     */
    private function pushMetadata($shaMap = null) {
        $content = json_encode($this->buildMetadata(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        return $this->pushFile('metadata.json', $content, 'Update metadata', $shaMap);
    }

    /**
     * Extract a heading from note content for use when creating notes pulled from remote.
     */
    private function extractHeadingFromContent($content, $ext) {
        if ($ext === 'md') {
            foreach (explode("\n", $content) as $line) {
                $line = trim($line);
                if ($line !== '') return ltrim($line, '# ');
            }
            return 'Untitled';
        }
        if (preg_match('/<h1[^>]*>(.*?)<\/h1>/si', $content, $m)) return strip_tags($m[1]);
        if (preg_match('/<title[^>]*>(.*?)<\/title>/si', $content, $m)) return strip_tags($m[1]);
        return 'Untitled';
    }

    /**
     * Transform attachment links from local format to GitHub format
     * Converts: /api/v1/notes/{noteId}/attachments/{attachmentId} → ../attachments/{filename}
     * @param string $content Note content
     * @param int $noteId Note ID
     * @param array $attachments Attachments array from database
     * @return string Transformed content
     */
    private function transformLinksForGitHub($content, $noteId, $attachments) {
        // Build a map of attachment_id => filename
        $idToFilename = [];
        foreach ($attachments as $attachment) {
            if (isset($attachment['id']) && isset($attachment['filename'])) {
                $idToFilename[$attachment['id']] = $attachment['filename'];
            }
        }
        
        if (empty($idToFilename)) {
            return $content;
        }
        
        // Transform links
        $content = preg_replace_callback(
            '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9._-]+)#',
            function($matches) use ($idToFilename) {
                $attachmentId = $matches[1];
                if (isset($idToFilename[$attachmentId])) {
                    return '../attachments/' . $idToFilename[$attachmentId];
                }
                return $matches[0]; // Keep original if not found
            },
            $content
        );
        
        return $content;
    }
    
}
