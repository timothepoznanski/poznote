<?php
/**
 * GitSync - Git synchronization for Poznote notes (GitHub, Forgejo)
 * 
 * Handles pushing and pulling notes from a Git repository using the provider's API.
 * All configuration is stored in environment variables for security.
 */

class GitSync {
    // Supported file extensions
    const SUPPORTED_NOTE_EXTENSIONS = ['md', 'html', 'txt', 'markdown', 'json', 'excalidraw'];
    const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'txt'];
    
    private $token;
    private $repo;
    private $branch;
    private $authorName;
    private $authorEmail;
    private $provider;
    private $apiBase;
    private $con;
    
    /**
     * @var int|null User ID - Reserved for future multi-user support
     */
    private $userId;
    
    /**
     * Constructor
     * @param PDO|null $con Database connection
     * @param int|null $userId User ID (reserved for future use)
     */
    public function __construct($con = null, $userId = null) {
        require_once __DIR__ . '/config.php';
        
        $this->token = trim(defined('GIT_TOKEN') ? GIT_TOKEN : '');
        $this->repo = trim(defined('GIT_REPO') ? GIT_REPO : '');
        $this->branch = trim(defined('GIT_BRANCH') ? GIT_BRANCH : 'main');
        $this->authorName = defined('GIT_AUTHOR_NAME') ? GIT_AUTHOR_NAME : 'Poznote';
        $this->authorEmail = defined('GIT_AUTHOR_EMAIL') ? GIT_AUTHOR_EMAIL : 'poznote@localhost';
        $this->provider = defined('GIT_PROVIDER') ? GIT_PROVIDER : 'github';
        
        $this->apiBase = trim(defined('GIT_API_BASE') && !empty(GIT_API_BASE) ? GIT_API_BASE : $this->getDefaultApiBase());
        
        $this->con = $con;
        $this->userId = $userId;

        // Initialize progress only if it doesn't exist to avoid resetting on mid-sync requests
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    /**
     * Update sync progress in session
     * @param int $current Current item being processed
     * @param int $total Total number of items
     * @param string $message Action message
     */
    public function updateProgress($current, $total, $message = '') {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        $_SESSION['git_sync_progress'] = [
            'current' => $current,
            'total' => $total,
            'percentage' => $total > 0 ? min(100, round(($current / $total) * 100)) : 0,
            'message' => $message,
            'timestamp' => time()
        ];
        
        // Write and close to release lock for other potential requests (polling)
        session_write_close();
    }

    /**
     * Clear progress from session
     */
    public function clearProgress() {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        unset($_SESSION['git_sync_progress']);
        session_write_close();
    }

    /**
     * Get default API base URL for the provider
     */
    private function getDefaultApiBase() {
        switch ($this->provider) {
            case 'forgejo':
                // Forgejo instances are often self-hosted
                return 'http://localhost:3000/api/v1'; 
            case 'github':
            default:
                return 'https://api.github.com';
        }
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
            'provider' => $this->provider,
            'apiBase' => $this->apiBase,
            'autoPush' => $this->isAutoPushEnabled(),
            'autoPull' => $this->isAutoPullEnabled()
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
    public function pushAttachment($filename, $message = '') {
        if (!$this->isConfigured()) return ['success' => false, 'error' => 'not_configured'];
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
    public function deleteAttachmentInGit($filename, $message = '') {
        if (!$this->isConfigured()) return ['success' => false, 'error' => 'not_configured'];
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
     * Push all notes to Git repository repository
     * @param string|null $workspaceFilter Optional workspace to filter by
     * @return array Results with success status, counts, and errors
     */
    public function pushNotes($workspaceFilter = null) {
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
            if (isset($tree) && is_array($tree) && !isset($tree['error'])) {
                foreach ($tree as $item) {
                    if ($item['type'] === 'blob') $shaMap[$item['path']] = $item['sha'];
                }
            }

            // ── 2. Scan local directories ──
            $entryFiles      = is_dir($entriesPath)     ? array_values(array_filter(array_diff(scandir($entriesPath),     ['.', '..']), fn($f) => is_file($entriesPath     . '/' . $f))) : [];
            $attachmentFiles = is_dir($attachmentsPath) ? array_values(array_filter(array_diff(scandir($attachmentsPath), ['.', '..']), fn($f) => is_file($attachmentsPath . '/' . $f))) : [];

            $totalSteps  = count($entryFiles) + count($attachmentFiles) + 5;
            $currentStep = 0;
            $this->updateProgress(0, $totalSteps, 'Starting push...');

            $expectedPaths = [];

            // ── 3. Push entries/ ──
            foreach ($entryFiles as $filename) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Pushing: {$filename}");

                $repoPath        = 'entries/' . $filename;
                $expectedPaths[] = $repoPath;
                $content         = file_get_contents($entriesPath . '/' . $filename);

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

                $repoPath        = 'attachments/' . $filename;
                $expectedPaths[] = $repoPath;
                $content         = file_get_contents($attachmentsPath . '/' . $filename);

                $pushResult = $this->pushFile($repoPath, $content, "Update attachment: {$filename}", $shaMap);
                if ($pushResult['success']) {
                    if (!empty($pushResult['skipped'])) {
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
            $this->updateProgress($currentStep, $totalSteps, 'Pushing metadata...');
            $expectedPaths[] = 'metadata.json';
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

            // ── 6. Delete remote orphans ──
            $this->updateProgress($currentStep, $totalSteps, 'Cleaning up remote orphans...');
            foreach ($shaMap as $remotePath => $_sha) {
                if (!in_array($remotePath, $expectedPaths)) {
                    $currentStep++;
                    $this->updateProgress($currentStep, $totalSteps, "Deleting: {$remotePath}");
                    $delResult = $this->deleteFile($remotePath, 'Deleted from Poznote');
                    if ($delResult['success']) {
                        $results['deleted']++;
                        $results['debug'][] = "  {$remotePath} → deleted";
                    } else {
                        $results['errors'][] = ['path' => $remotePath, 'error' => $delResult['error']];
                        $results['debug'][]  = "  {$remotePath} → delete ERROR: " . $delResult['error'];
                    }
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
     * @param string|null $workspaceTarget Optional workspace to pull into
     * @return array Results with success status, counts, and errors
     */
    public function pullNotes($workspaceTarget = null) {
        set_time_limit(0);

        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Git sync is not configured'];
        }
        
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }

        // Note: $workspaceTarget is kept for API compatibility but ignored —
        // all entries and attachments are pulled regardless of workspace.

        $results = [
            'success' => true,
            'pulled' => 0,
            'updated' => 0,
            'deleted' => 0,
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
                return ['success' => false, 'error' => $tree['error']];
            }

            // ── 2. Categorise remote files ──
            $noteFiles       = [];   // ['entries/183.html', ...]
            $attachmentFiles = [];   // ['attachments/foo.png', ...]
            $hasMetadata     = false;
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                $path = $item['path'];
                if ($path === 'metadata.json') {
                    $hasMetadata = true;
                } elseif (strpos($path, 'entries/') === 0) {
                    $ext = pathinfo($path, PATHINFO_EXTENSION);
                    if (in_array($ext, self::SUPPORTED_NOTE_EXTENSIONS)) $noteFiles[] = $path;
                } elseif (strpos($path, 'attachments/') === 0) {
                    $attachmentFiles[] = $path;
                }
            }

            $totalSteps  = count($noteFiles) + count($attachmentFiles) + 5;
            $currentStep = 0;
            $this->updateProgress(0, $totalSteps, 'Starting pull...');

            // ── 2b. Download metadata.json ──
            $metadata      = [];   // note metadata keyed by note id
            $foldersSource = [];   // folder list to recreate
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
                        
                        // Ensure workspaces listed in metadata exist
                        $uniqueWorkspaces = [];
                        foreach ($metadata as $meta) {
                            if (!empty($meta['workspace'])) {
                                $uniqueWorkspaces[$meta['workspace']] = true;
                            }
                        }
                        foreach ($foldersSource as $folder) {
                            if (!empty($folder['workspace'])) {
                                $uniqueWorkspaces[$folder['workspace']] = true;
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

            // ── 2c. Recreate folders (parents before children) ──
            if (!empty($foldersSource)) {
                // Insert in multiple passes: root folders first, then children
                $toInsert = $foldersSource;
                $maxPasses = 10;
                while (!empty($toInsert) && $maxPasses-- > 0) {
                    $remaining = [];
                    foreach ($toInsert as $folder) {
                        // If it has a parent, make sure the parent exists first
                        if ($folder['parent_id'] !== null) {
                            $chk = $this->con->prepare('SELECT id FROM folders WHERE id = ?');
                            $chk->execute([$folder['parent_id']]);
                            if ($chk->fetchColumn() === false) {
                                $remaining[] = $folder; // parent not yet inserted, retry later
                                continue;
                            }
                        }
                        // INSERT OR IGNORE preserves existing folders
                        $this->con->prepare(
                            'INSERT OR IGNORE INTO folders (id, name, workspace, parent_id, icon, icon_color) VALUES (?, ?, ?, ?, ?, ?)'
                        )->execute([
                            $folder['id'],
                            $folder['name'],
                            $folder['workspace'] ?? 'Poznote',
                            $folder['parent_id'],
                            $folder['icon'],
                            $folder['icon_color'],
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

            // ── 3. Download & upsert entries ──
            try {
                foreach ($noteFiles as $path) {
                    $currentStep++;
                    $filename = basename($path);
                    $this->updateProgress($currentStep, $totalSteps, "Downloading: {$filename}");

                    $noteId = (int) pathinfo($filename, PATHINFO_FILENAME);
                    if ($noteId <= 0) {
                        $results['debug'][] = "  Skipped {$filename}: not an ID-based filename";
                        continue;
                    }

                    $raw = $this->getFileContent($path);
                    if (isset($raw['error'])) {
                        $results['errors'][] = ['path' => $path, 'error' => $raw['error']];
                        $results['debug'][]  = "  ERROR fetching {$filename}: " . $raw['error'];
                        continue;
                    }

                    $content = $raw['content'];

                    // Write to disk
                    if (!is_dir($entriesPath)) mkdir($entriesPath, 0755, true);
                    file_put_contents($entriesPath . '/' . $filename, $content);

                    // Upsert DB
                    try {
                        $this->con->beginTransaction();
                        $meta      = $metadata[(string) $noteId] ?? [];
                        $checkStmt = $this->con->prepare('SELECT id FROM entries WHERE id = ?');
                        $checkStmt->execute([$noteId]);
                        if ($checkStmt->fetch()) {
                            // Build dynamic UPDATE — apply metadata fields whenever available
                            $setClauses = ['entry = ?', 'trash = 0', 'updated = ?'];
                            $params     = [$content, $meta['updated'] ?? gmdate('Y-m-d H:i:s')];
                            if (isset($meta['heading']))     { $setClauses[] = 'heading = ?';     $params[] = $meta['heading']; }
                            if (isset($meta['tags']))        { $setClauses[] = 'tags = ?';        $params[] = $meta['tags']; }
                            if (isset($meta['folder_id']))   { $setClauses[] = 'folder_id = ?';   $params[] = $meta['folder_id']; }
                            if (isset($meta['folder']))      { $setClauses[] = 'folder = ?';      $params[] = $meta['folder']; }
                            if (isset($meta['workspace']))   { $setClauses[] = 'workspace = ?';   $params[] = $meta['workspace']; }
                            if (isset($meta['type']))        { $setClauses[] = 'type = ?';        $params[] = $meta['type']; }
                            if (isset($meta['attachments'])) { $setClauses[] = 'attachments = ?'; $params[] = $meta['attachments']; }
                            if (isset($meta['favorite']))    { $setClauses[] = 'favorite = ?';    $params[] = (int) $meta['favorite']; }
                            if (isset($meta['created']))     { $setClauses[] = 'created = ?';     $params[] = $meta['created']; }
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
                            $this->con->prepare(
                                'INSERT INTO entries (id, heading, entry, type, workspace, tags, folder_id, folder, attachments, favorite, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                            )->execute([$noteId, $heading, $content, $type, $workspace, $tags, $folderId, $folder, $attachments, $favorite, $created, $updated]);
                            $results['pulled']++;
                            $results['debug'][] = "  {$filename} → created (heading: {$heading})";
                        }

                        $pulledNoteIds[] = $noteId;
                        $this->con->commit();
                    } catch (Exception $transEx) {
                        $this->con->rollBack();
                        $results['errors'][] = ['path' => $filename, 'error' => $transEx->getMessage()];
                        $results['debug'][]  = "  Transaction rolled back for $filename: " . $transEx->getMessage();
                    }
                }
            } catch (Exception $e) {
                // Handle any general exceptions from HTTP requests or loops
                $results['errors'][] = ['path' => 'loop', 'error' => $e->getMessage()];
                $results['debug'][]  = 'Error during pull loop: ' . $e->getMessage();
            }

            // ── 4. Download attachments ──
            if (!is_dir($attachmentsPath)) mkdir($attachmentsPath, 0755, true);
            foreach ($attachmentFiles as $path) {
                $currentStep++;
                $filename  = basename($path);
                $localFile = $attachmentsPath . '/' . $filename;
                if (file_exists($localFile)) {
                    $this->updateProgress($currentStep, $totalSteps, "Attachment exists: {$filename}");
                    $results['debug'][] = "  Attachment already exists: {$filename}";
                    continue;
                }
                $this->updateProgress($currentStep, $totalSteps, "Downloading attachment: {$filename}");
                $raw = $this->getFileContent($path);
                if (isset($raw['error'])) {
                    $results['errors'][] = ['attachment' => $filename, 'error' => $raw['error']];
                    $results['debug'][]  = "  Attachment ERROR {$filename}: " . $raw['error'];
                    continue;
                }
                file_put_contents($localFile, $raw['content']);
                $results['debug'][] = "  Attachment saved: {$filename}";
            }

            // ── 5. Trash local notes not on remote ──
            $this->updateProgress($currentStep, $totalSteps, 'Cleaning up local notes...');
            $localIds = $this->con->query('SELECT id FROM entries WHERE trash = 0')->fetchAll(PDO::FETCH_COLUMN);
            foreach ($localIds as $localId) {
                if (!in_array((int) $localId, $pulledNoteIds)) {
                    $this->con->prepare('UPDATE entries SET trash = 1 WHERE id = ?')->execute([$localId]);
                    $results['deleted']++;
                    $results['debug'][] = "  Trashed local note id={$localId} (not on remote)";
                }
            }

            // ── 6. Save sync info ──
            $this->updateProgress($totalSteps, $totalSteps, 'Pull complete!');
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action'    => 'pull',
                'pulled'    => $results['pulled'],
                'updated'   => $results['updated'],
                'deleted'   => $results['deleted'],
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
    private function deleteFile($path, $message) {
        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $path)));
        
        // Get the file to retrieve its SHA (required for deletion)
        $existingFile = $this->apiRequest('GET', "/repos/{$this->repo}/contents/{$encodedPath}?ref={$this->branch}");
        
        if (!isset($existingFile['sha'])) {
            return [
                'success' => false,
                'error' => 'File not found or unable to get SHA'
            ];
        }
        
        $body = [
            'message' => $message,
            'sha' => $existingFile['sha'],
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
    
    /**
     * Push a single file to Git provider

     * @param string $path File path in repository
     * @param string $content File content
     * @param string $message Commit message
     * @return array Result with success status, SHA, and error if applicable
     */
    private function pushFile($path, $content, $message, $shaMap = null) {

        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $path)));
        $endpoint = "/repos/{$this->repo}/contents/{$encodedPath}";
        
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
            $existingFile = $this->apiRequest('GET', $endpoint . "?ref={$this->branch}");
            
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
        $response = $this->apiRequest('GET', "/repos/{$this->repo}/git/trees/{$this->branch}?recursive=1");
        
        if (isset($response['tree'])) {
            return $response['tree'];
        }
        
        return ['error' => $response['message'] ?? 'Unable to get repository tree'];
    }
    
    /**
     * Get file content from repository
     * @param string $path File path in repository
     * @return array Result with content or error
     */
    private function getFileContent($path) {
        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $path)));
        $response = $this->apiRequest('GET', "/repos/{$this->repo}/contents/{$encodedPath}?ref={$this->branch}");
        
        if (isset($response['content'])) {
            $content = base64_decode($response['content']);
            return ['success' => true, 'content' => $content];
        }
        
        return ['error' => $response['message'] ?? 'Unable to get file content'];
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

        // Notes
        $stmt  = $this->con->query(
            'SELECT id, heading, tags, folder_id, folder, workspace, type, attachments, favorite, created, updated FROM entries WHERE trash = 0'
        );
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
            ];
        }

        // Folders (full list so the hierarchy can be restored)
        $fstmt   = $this->con->query(
            'SELECT id, name, workspace, parent_id, icon, icon_color FROM folders ORDER BY id'
        );
        $folders = [];
        foreach ($fstmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $folders[] = [
                'id'         => (int)  $row['id'],
                'name'       => $row['name'],
                'workspace'  => $row['workspace'],
                'parent_id'  => $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
                'icon'       => $row['icon'],
                'icon_color' => $row['icon_color'],
            ];
        }

        return ['notes' => $notes, 'folders' => $folders];
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
            '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_-]+)#',
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
