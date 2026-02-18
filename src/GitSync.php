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
            
            // Build the path in the repository — keyed by note ID so renames never create duplicates
            $workspace = $note['workspace'] ?? 'Poznote';
            $folderPath = $this->getFolderPath($note['folder_id']);
            $repoPath = $workspace . '/' . ltrim(($folderPath ? $folderPath . '/' : '') . $noteId . '.' . $repoExtension, '/');

            // Add front matter
            if ($noteType === 'markdown' || $noteType === 'tasklist' || $noteType === 'excalidraw') {
                $content = $this->addFrontMatter($content, $note);
            }

            // Push to Git
            $pushResult = $this->pushFile($repoPath, $content, "Update: {$note['heading']}");

            if (!$pushResult['success']) {
                return $pushResult;
            }
            
            // Push attachments if any
            if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                $attachments = json_decode($note['attachments'], true);
                if (is_array($attachments) && count($attachments) > 0) {
                    $workspaceMetadata = []; // We might want to update the metadata file too
                    
                    foreach ($attachments as $attachment) {
                        if (!isset($attachment['filename'])) continue;
                        
                        $attachmentFile = $attachmentsPath . '/' . $attachment['filename'];
                        if (!file_exists($attachmentFile)) continue;
                        
                        $attachmentContent = file_get_contents($attachmentFile);
                        $attachmentRepoPath = $workspace . '/attachments/' . $attachment['filename'];
                        
                        $this->pushFile($attachmentRepoPath, $attachmentContent, "Update attachment: {$attachment['original_filename']}");
                        
                        $workspaceMetadata[$attachment['filename']] = [
                            'id' => $attachment['id'] ?? uniqid(),
                            'original_filename' => $attachment['original_filename'] ?? $attachment['filename'],
                            'file_size' => $attachment['file_size'] ?? filesize($attachmentFile),
                            'file_type' => $attachment['file_type'] ?? 'application/octet-stream',
                            'uploaded_at' => $attachment['uploaded_at'] ?? date('Y-m-d H:i:s')
                        ];
                    }
                    
                    // Update metadata file for this workspace
                    if (!empty($workspaceMetadata)) {
                        // Actually, we'd need to download existing metadata first to merge...
                        // For now let's just push the note. Full manual sync will fix metadata.
                    }
                }
            }
            
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

            $folderPath = $this->getFolderPath($folderId);
            $repoPath   = ($workspace ?: 'Poznote') . '/' . ltrim(($folderPath ? $folderPath . '/' : '') . $noteId . '.' . $repoExtension, '/');

            return $this->deleteFile($repoPath, 'Deleted: ' . ($heading ?: "note #{$noteId}"));
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
    
    // =========================================================================
    // PUSH  — overwrite remote with local
    // =========================================================================

    /**
     * Push all local notes and attachments to Git.
     * Strategy: local is the source of truth.
     *   1. Build the full set of files that SHOULD exist on remote.
     *   2. Push every file (skip if SHA unchanged to save API calls).
     *   3. Delete every remote file that is no longer in the local set.
     *
     * @param string|null $workspaceFilter Only push this workspace (null = all)
     * @return array Results
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
            'success'             => true,
            'pushed'              => 0,
            'attachments_pushed'  => 0,
            'deleted'             => 0,
            'skipped'             => 0,
            'errors'              => [],
            'debug'               => [],
        ];

        try {
            require_once __DIR__ . '/functions.php';
            $entriesPath     = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();

            // ── 1. Get current remote tree (SHA map for skip optimisation) ──
            $tree   = $this->getRepoTree();
            $shaMap = [];
            if (is_array($tree) && !isset($tree['error'])) {
                foreach ($tree as $item) {
                    if ($item['type'] === 'blob') {
                        $shaMap[$item['path']] = $item['sha'];
                    }
                }
            }

            // ── 2. Fetch all local notes ──
            $query  = "SELECT id, heading, type, folder_id, tags, workspace, created, updated, favorite, attachments
                       FROM entries WHERE trash = 0";
            $params = [];
            if ($workspaceFilter) {
                $query   .= " AND workspace = ?";
                $params[] = $workspaceFilter;
            }
            $stmt  = $this->con->prepare($query);
            $stmt->execute($params);
            $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // ── 3. Calculate totals for progress ──
            $totalNotes = count($notes);
            $totalAttachments = 0;
            foreach ($notes as $note) {
                if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                    $atts = json_decode($note['attachments'], true);
                    if (is_array($atts)) {
                        $totalAttachments += count($atts);
                    }
                }
            }
            
            // Estimates (notes + attachments + cleanup phase)
            $totalSteps = $totalNotes + $totalAttachments + 5; 
            $currentStep = 0;
            $this->updateProgress(0, $totalSteps, "Starting push...");

            // ── 4. Push every note + its attachments ──
            $expectedPaths = [];                    // every path that SHOULD be on remote
            $metadataByWs  = [];                    // workspace → filename → metadata

            foreach ($notes as $note) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Pushing: " . ($note['heading'] ?: 'Untitled'));
                
                $noteId   = $note['id'];
                $noteType = $note['type'] ?? 'note';

                // Local file extension
                $localExt = ($noteType === 'markdown') ? 'md' : 'html';
                // Repository file extension
                $repoExt  = ($noteType === 'tasklist' || $noteType === 'excalidraw') ? 'json' : $localExt;

                $filePath = $entriesPath . '/' . $noteId . '.' . $localExt;

                if (!file_exists($filePath)) {
                    $results['debug'][]  = "Skipped note {$noteId} ({$note['heading']}): file not found on disk";
                    $results['skipped']++;
                    continue;
                }

                $content   = file_get_contents($filePath);
                $workspace = $note['workspace'] ?? 'Poznote';
                $folder    = $this->getFolderPath($note['folder_id']);
                // Path keyed by note ID — immune to title renames
                $repoPath  = $workspace . '/' . ltrim(($folder ? $folder . '/' : '') . $noteId . '.' . $repoExt, '/');

                // Transform local attachment links → relative Git links
                if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                    $atts = json_decode($note['attachments'], true);
                    if (is_array($atts)) {
                        $content = $this->transformLinksForGitHub($content, $noteId, $atts);
                    }
                }

                // Add front matter / metadata comment for all note types
                $content = $this->addFrontMatter($content, $note);

                $expectedPaths[] = $repoPath;
                $results['debug'][] = "Pushing note: {$repoPath}";

                $pushResult = $this->pushFile($repoPath, $content, "Update: {$note['heading']}", $shaMap);
                if ($pushResult['success']) {
                    if (!empty($pushResult['skipped'])) {
                        $results['skipped']++;
                        $results['debug'][] = "  → unchanged (skipped)";
                    } else {
                        $results['pushed']++;
                        $results['debug'][] = "  → pushed";
                    }
                } else {
                    $results['errors'][] = ['note_id' => $noteId, 'path' => $repoPath, 'error' => $pushResult['error']];
                    $results['debug'][]  = "  → ERROR: " . $pushResult['error'];
                }

                // ── Attachments for this note ──
                if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                    $atts = json_decode($note['attachments'], true);
                    if (is_array($atts)) {
                        if (!isset($metadataByWs[$workspace])) {
                            $metadataByWs[$workspace] = [];
                        }
                        foreach ($atts as $att) {
                            if (empty($att['filename'])) continue;
                            
                            $currentStep++;
                            $this->updateProgress($currentStep, $totalSteps, "Pushing attachment: " . $att['filename']);

                            $attFile = $attachmentsPath . '/' . $att['filename'];
                            if (!file_exists($attFile)) {
                                $results['debug'][] = "  Attachment not found on disk: {$att['filename']}";
                                continue;
                            }
                            $attRepoPath     = $workspace . '/attachments/' . $att['filename'];
                            $expectedPaths[] = $attRepoPath;

                            // Store metadata (note_path for pull reconstruction — stable across re-creations)
                            $metadataByWs[$workspace][$att['filename']] = [
                                'id'                => $att['id']                ?? uniqid(),
                                'original_filename' => $att['original_filename'] ?? $att['filename'],
                                'file_size'         => $att['file_size']         ?? filesize($attFile),
                                'file_type'         => $att['file_type']         ?? 'application/octet-stream',
                                'uploaded_at'       => $att['uploaded_at']       ?? date('Y-m-d H:i:s'),
                                'note_path'         => $repoPath,
                            ];

                            $attContent    = file_get_contents($attFile);
                            $attPushResult = $this->pushFile($attRepoPath, $attContent,
                                "Update attachment: {$att['original_filename']}", $shaMap);

                            if ($attPushResult['success']) {
                                if (!empty($attPushResult['skipped'])) {
                                    $results['debug'][] = "  Attachment unchanged: {$att['filename']}";
                                } else {
                                    $results['attachments_pushed']++;
                                    $results['debug'][] = "  Attachment pushed: {$att['filename']}";
                                }
                            } else {
                                $results['debug'][]  = "  Attachment ERROR: {$att['filename']} — " . $attPushResult['error'];
                                $results['errors'][] = ['attachment' => $att['filename'], 'error' => $attPushResult['error']];
                            }
                        }
                    }
                }
            }

            // ── 4. Push .metadata.json for each workspace ──
            foreach ($metadataByWs as $ws => $meta) {
                $metaPath        = $ws . '/attachments/.metadata.json';
                $expectedPaths[] = $metaPath;
                $metaContent     = json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                $metaResult      = $this->pushFile($metaPath, $metaContent, "Update attachments metadata", $shaMap);
                $results['debug'][] = "Metadata for {$ws}: " . ($metaResult['success'] ? (empty($metaResult['skipped']) ? 'pushed' : 'unchanged') : 'ERROR: ' . $metaResult['error']);
            }

            // ── 5. Delete remote files that no longer exist locally ──
            $this->updateProgress($currentStep, $totalSteps, "Cleaning up remote orphans...");
            foreach ($shaMap as $remotePath => $_sha) {
                // If a workspace filter is active, only touch files in that workspace
                if ($workspaceFilter && strpos($remotePath, $workspaceFilter . '/') !== 0) {
                    continue;
                }
                if (!in_array($remotePath, $expectedPaths)) {
                    $currentStep++;
                    $this->updateProgress($currentStep, $totalSteps, "Deleting: " . $remotePath);
                    $results['debug'][] = "Deleting orphan: {$remotePath}";
                    $delResult = $this->deleteFile($remotePath, "Deleted from Poznote");
                    if ($delResult['success']) {
                        $results['deleted']++;
                        $results['debug'][] = "  → deleted";
                    } else {
                        $results['debug'][]  = "  → delete ERROR: " . $delResult['error'];
                        $results['errors'][] = ['path' => $remotePath, 'error' => $delResult['error']];
                    }
                }
            }

            // ── 6. Save sync info ──
            $this->updateProgress($totalSteps, $totalSteps, "Push complete!");
            $this->saveSyncInfo([
                'timestamp'   => date('c'),
                'action'      => 'push',
                'pushed'      => $results['pushed'],
                'attachments' => $results['attachments_pushed'],
                'deleted'     => $results['deleted'],
                'errors'      => count($results['errors']),
                'workspace'   => $workspaceFilter,
            ]);
            
            $this->clearProgress();

        } catch (Exception $e) {
            $this->clearProgress();
            $results['success']    = false;
            $results['errors'][]   = ['error' => $e->getMessage()];
        }

        return $results;
    }

    // =========================================================================
    // PULL  — overwrite local with remote
    // =========================================================================

    /**
     * Pull all notes and attachments from Git.
     * Strategy: remote is the source of truth.
     *   1. Download every note file → upsert in DB + disk.
     *   2. Download every attachment file → save to disk.
     *   3. Trash every local note whose path no longer exists on remote.
     *
     * @param string|null $workspaceTarget Only pull into this workspace (null = all)
     * @return array Results
     */
    public function pullNotes($workspaceTarget = null) {
        set_time_limit(0);

        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'Git sync is not configured'];
        }
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }

        $results = [
            'success' => true,
            'pulled'  => 0,
            'updated' => 0,
            'deleted' => 0,
            'errors'  => [],
            'debug'   => [],
        ];

        try {
            require_once __DIR__ . '/functions.php';
            $entriesPath     = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();

            // ── 1. Get full remote tree ──
            $tree = $this->getRepoTree();
            if (isset($tree['error'])) {
                return ['success' => false, 'error' => $tree['error']];
            }

            // ── 2. Categorise remote files ──
            $noteFiles       = [];   // path → extension
            $attachmentFiles = [];   // workspace → [ {path, filename} ]
            $metadataByWs    = [];   // workspace → parsed metadata array

            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                $path = $item['path'];

                // .metadata.json
                if (preg_match('#^([^/]+)/attachments/\.metadata\.json$#', $path, $m)) {
                    $ws = $m[1];
                    if ($workspaceTarget && $ws !== $workspaceTarget) continue;
                    $raw = $this->getFileContent($path);
                    if (!isset($raw['error'])) {
                        $parsed = json_decode($raw['content'], true);
                        if (is_array($parsed)) {
                            $metadataByWs[$ws] = $parsed;
                            $results['debug'][] = "Loaded metadata for workspace {$ws}: " . count($parsed) . " entries";
                        }
                    }
                    continue;
                }

                // Attachment file
                if (preg_match('#^([^/]+)/attachments/(.+)$#', $path, $m)) {
                    $ws       = $m[1];
                    $filename = $m[2];
                    if ($workspaceTarget && $ws !== $workspaceTarget) continue;
                    $attachmentFiles[$ws][] = ['path' => $path, 'filename' => $filename];
                    continue;
                }

                // Note file
                $ext = pathinfo($path, PATHINFO_EXTENSION);
                if (in_array($ext, self::SUPPORTED_NOTE_EXTENSIONS)) {
                    // Determine workspace from first path segment
                    $ws = explode('/', $path)[0];
                    if ($workspaceTarget && $ws !== $workspaceTarget) continue;
                    $noteFiles[$path] = $ext;
                }
            }

            // ── 3. Download & upsert every note ──
            $pulledPaths = [];   // track which paths we processed (for deletion step)

            // Calculate totals for progress reporting
            $totalNotes = count($noteFiles);
            $totalAttachments = 0;
            foreach ($attachmentFiles as $ws => $atts) {
                $totalAttachments += count($atts);
            }
            $totalSteps = $totalNotes + $totalAttachments + 10; // estimates
            $currentStep = 0;
            $this->updateProgress(0, $totalSteps, "Starting pull...");

            // ── 3. Download & upsert every note (single transaction for performance + lock reduction) ──
            $this->con->beginTransaction();
            try {
            foreach ($noteFiles as $path => $ext) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Downloading note: " . basename($path));
                $results['debug'][] = "Processing note: {$path}";

                $raw = $this->getFileContent($path);
                if (isset($raw['error'])) {
                    $results['debug'][]  = "  ERROR fetching: " . $raw['error'];
                    $results['errors'][] = ['path' => $path, 'error' => $raw['error']];
                    continue;
                }

                $noteData = $this->parseNoteFromGitHub($path, $raw['content'], $ext);
                if (empty($noteData['workspace'])) {
                    $noteData['workspace'] = $workspaceTarget ?: 'Poznote';
                }

                $ws       = $noteData['workspace'];
                $wsMeta   = $metadataByWs[$ws] ?? [];

                $existing = $this->findExistingNote($noteData);
                try {
                    if ($existing) {
                        // Restore from trash if it was deleted locally but exists on remote
                        if (!empty($existing['trash'])) {
                            $stmtRestore = $this->con->prepare("UPDATE entries SET trash = 0 WHERE id = ?");
                            $stmtRestore->execute([$existing['id']]);
                            $results['debug'][] = "  → restored from trash (id={$existing['id']})";
                        }
                        $this->updateNote($existing['id'], $noteData, $raw['content'], $entriesPath, $wsMeta, $path);
                        $results['updated']++;
                        $results['debug'][] = "  → updated (id={$existing['id']})";
                        $pulledPaths[] = $path;
                    } else {
                        $newId = $this->createNote($noteData, $raw['content'], $entriesPath, $wsMeta, $path);
                        $results['pulled']++;
                        $results['debug'][] = "  → created (id={$newId})";
                        $pulledPaths[] = $path;
                    }
                } catch (Exception $e) {
                    $results['debug'][]  = "  → EXCEPTION: " . $e->getMessage();
                    $results['errors'][] = ['path' => $path, 'error' => $e->getMessage()];
                }
            }
                $this->con->commit();
            } catch (Exception $transactionEx) {
                $this->con->rollBack();
                $results['debug'][]  = "Transaction rolled back: " . $transactionEx->getMessage();
                $results['errors'][] = ['path' => 'transaction', 'error' => $transactionEx->getMessage()];
            }

            // ── 4. Download every attachment (before note upsert so files exist on disk) ──
            foreach ($attachmentFiles as $ws => $atts) {
                if (!is_dir($attachmentsPath)) {
                    mkdir($attachmentsPath, 0755, true);
                }
                foreach ($atts as $attInfo) {
                    $currentStep++;
                    $localFile = $attachmentsPath . '/' . $attInfo['filename'];
                    // Skip download if file already exists locally
                    if (file_exists($localFile)) {
                        $this->updateProgress($currentStep, $totalSteps, "Attachment already exists: " . $attInfo['filename']);
                        $results['debug'][] = "Attachment already exists, skipping: {$attInfo['filename']}";
                        continue;
                    }
                    $this->updateProgress($currentStep, $totalSteps, "Downloading attachment: " . $attInfo['filename']);
                    $raw = $this->getFileContent($attInfo['path']);
                    if (isset($raw['error'])) {
                        $results['debug'][]  = "Attachment ERROR {$attInfo['filename']}: " . $raw['error'];
                        $results['errors'][] = ['attachment' => $attInfo['filename'], 'error' => $raw['error']];
                        continue;
                    }
                    file_put_contents($localFile, $raw['content']);
                    $results['debug'][] = "Attachment saved: {$attInfo['filename']}";
                }
            }

            // ── 5. Trash local notes not present on remote ──
            $query  = "SELECT id, heading, type, folder_id, workspace FROM entries WHERE trash = 0";
            $params = [];
            if ($workspaceTarget) {
                $query   .= " AND workspace = ?";
                $params[] = $workspaceTarget;
            }
            $stmt       = $this->con->prepare($query);
            $stmt->execute($params);
            $localNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $this->updateProgress($currentStep, $totalSteps, "Cleaning up local notes...");
            foreach ($localNotes as $note) {
                $currentStep++;
                $this->updateProgress($currentStep, $totalSteps, "Checking local note: " . ($note['heading'] ?: 'Untitled'));
                $noteType  = $note['type'] ?? 'note';
                $localExt  = ($noteType === 'markdown') ? 'md' : 'html';
                $repoExt   = ($noteType === 'tasklist' || $noteType === 'excalidraw') ? 'json' : $localExt;
                $ws        = $note['workspace'] ?? 'Poznote';
                $folder    = $this->getFolderPath($note['folder_id']);
                $safeTitle = $this->sanitizeFileName($note['heading'] ?: 'Untitled');
                $expected  = $ws . '/' . ltrim(($folder ? $folder . '/' : '') . $safeTitle . '.' . $repoExt, '/');

                if (!in_array($expected, $pulledPaths)) {
                    $delStmt = $this->con->prepare("UPDATE entries SET trash = 1 WHERE id = ?");
                    $delStmt->execute([$note['id']]);
                    $results['deleted']++;
                    $results['debug'][] = "Trashed local note not on remote: {$expected} (id={$note['id']})";
                }
            }

            // ── 6. Save sync info ──
            $this->updateProgress($totalSteps, $totalSteps, "Pull complete!");
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action'    => 'pull',
                'pulled'    => $results['pulled'],
                'updated'   => $results['updated'],
                'deleted'   => $results['deleted'],
                'errors'    => count($results['errors']),
                'workspace' => $workspaceTarget,
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
     * Get folder path for a note by building path from folder hierarchy
     * @param int|null $folderId Folder ID to build path from
     * @return string Folder path (e.g., "parent/child")
     */
    private function getFolderPath($folderId) {
        if (!$folderId || !$this->con) {
            return '';
        }

        $path = [];
        $currentId = $folderId;

        while ($currentId) {
            $stmt = $this->con->prepare("SELECT id, parent_id FROM folders WHERE id = ?");
            $stmt->execute([$currentId]);
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($folder) {
                array_unshift($path, (string)$folder['id']);
                $currentId = $folder['parent_id'];
            } else {
                break;
            }
        }

        return implode('/', $path);
    }
    
    /**
     * Sanitize file name for use in repository
     * Removes invalid characters and limits length
     * @param string $name Original file name
     * @return string Sanitized file name
     */
    private function sanitizeFileName($name) {
        // Remove/replace invalid characters
        $name = preg_replace('/[<>:"\\/|?*]/', '-', $name);
        $name = preg_replace('/\s+/', ' ', $name);
        $name = trim($name, '.- ');
        
        if (empty($name)) {
            $name = 'Untitled';
        }
        
        // Limit length
        if (strlen($name) > 100) {
            $name = substr($name, 0, 100);
        }
        
        return $name;
    }
    
    /**
     * Get or create folder ID from a folder path
     * Creates all folders in hierarchy if they don't exist
     * @param string $folderPath Folder path (e.g., "parent/child")
     * @param string $workspace Workspace name
     * @return int|null Folder ID of the deepest folder in path
     */
    private function getOrCreateFolderFromPath($folderPath, $workspace) {
        if (empty($folderPath) || !$this->con) {
            return null;
        }
        
        // Split path into folder names
        $folders = explode('/', trim($folderPath, '/'));
        $parentId = null;
        
        // Create each folder in the hierarchy
        foreach ($folders as $folderName) {
            if (empty($folderName)) continue;
            
            // Check if folder exists
            $stmt = $this->con->prepare("
                SELECT id FROM folders 
                WHERE name = ? AND workspace = ? AND " . 
                ($parentId ? "parent_id = ?" : "parent_id IS NULL")
            );
            
            if ($parentId) {
                $stmt->execute([$folderName, $workspace, $parentId]);
            } else {
                $stmt->execute([$folderName, $workspace]);
            }
            
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                $parentId = $folder['id'];
            } else {
                // Create folder
                $stmt = $this->con->prepare("
                    INSERT INTO folders (name, workspace, parent_id, created) 
                    VALUES (?, ?, ?, ?)
                ");
                $stmt->execute([$folderName, $workspace, $parentId, date('Y-m-d H:i:s')]);
                $parentId = $this->con->lastInsertId();
            }
        }
        
        return $parentId;
    }
    
    /**
     * Add front matter to markdown content
     * @param string $content Original markdown content
     * @param array $note Note data (heading, tags, updated, id)
     * @return string Content with front matter prepended
     */
    private function addFrontMatter($content, $note) {
        $noteType = $note['type'] ?? 'note';

        if ($noteType === 'note') {
            // HTML notes: use an HTML comment block so the file stays valid HTML
            // Strip any existing comment front matter first
            $content = preg_replace('/^<!--poznote\n.*?\n-->\n*/s', '', $content);

            $meta  = "<!--poznote\n";
            $meta .= "title: " . json_encode($note['heading'] ?: 'Untitled') . "\n";
            if (!empty($note['tags'])) {
                $tags  = array_map('trim', explode(',', $note['tags']));
                $meta .= "tags: [" . implode(', ', array_map('json_encode', $tags)) . "]\n";
            }
            $meta .= "created: " . ($note['created'] ?? date('Y-m-d H:i:s')) . "\n";
            $meta .= "updated: " . ($note['updated'] ?? date('Y-m-d H:i:s')) . "\n";
            $meta .= "favorite: " . (empty($note['favorite']) ? '0' : '1') . "\n";
            $meta .= "poznote_id: " . $note['id'] . "\n";
            $meta .= "type: note\n";
            $meta .= "-->\n";
            return $meta . $content;
        }

        // Markdown / tasklist / excalidraw: YAML front matter
        // Check if content already has front matter
        if (preg_match('/^---\s*\n/', $content)) {
            return $content;
        }

        $frontMatter  = "---\n";
        $frontMatter .= "title: " . json_encode($note['heading'] ?: 'Untitled') . "\n";
        if (!empty($note['tags'])) {
            $tags         = array_map('trim', explode(',', $note['tags']));
            $frontMatter .= "tags: [" . implode(', ', array_map('json_encode', $tags)) . "]\n";
        }
        $frontMatter .= "created: " . ($note['created'] ?? date('Y-m-d H:i:s')) . "\n";
        $frontMatter .= "updated: " . ($note['updated'] ?? date('Y-m-d H:i:s')) . "\n";
        $frontMatter .= "favorite: " . (empty($note['favorite']) ? '0' : '1') . "\n";
        $frontMatter .= "poznote_id: " . $note['id'] . "\n";
        $frontMatter .= "type: " . $noteType . "\n";
        $frontMatter .= "---\n\n";

        return $frontMatter . $content;
    }
    
    /**
     * Parse note data from GitHub file
     * 
     * Path structure: Workspace/Folder1/Folder2/filename.ext
     * - First segment = workspace
     * - Middle segments = folder hierarchy
     * - Last segment = filename
     * 
     * @param string $path File path in repository
     * @param string $content File content
     * @param string $extension File extension
     * @return array Parsed note data with workspace, folder, title, etc.
     */
    private function parseNoteFromGitHub($path, $content, $extension) {
        $pathParts = explode('/', $path);

        if (count($pathParts) === 1) {
            $workspace  = 'Poznote';
            $folderPath = '';
        } else {
            $workspace = $pathParts[0];
            $folderPath = count($pathParts) > 2
                ? implode('/', array_slice($pathParts, 1, -1))
                : '';
        }

        $filename = pathinfo($path, PATHINFO_FILENAME);

        $data = [
            'type'        => in_array($extension, self::MARKDOWN_EXTENSIONS) ? 'markdown' : ($extension === 'json' ? 'tasklist' : 'note'),
            'heading'     => $filename,
            'tags'        => '',
            'folder_path' => $folderPath,
            'workspace'   => $workspace,
        ];

        // ── YAML front matter (markdown / tasklist / excalidraw) ──
        if (preg_match('/^---\s*\n(.+?)\n---\s*\n/s', $content, $matches)) {
            $this->parseFrontMatterBlock($matches[1], $data);
        }

        // ── HTML comment front matter (HTML notes) ──
        if (preg_match('/^<!--poznote\n(.+?)\n-->/s', $content, $matches)) {
            $this->parseFrontMatterBlock($matches[1], $data);
        }

        return $data;
    }

    /**
     * Parse a YAML-like front matter block (key: value lines) into $data.
     */
    private function parseFrontMatterBlock($block, array &$data) {
        if (preg_match('/^title:\s*(.+)$/m', $block, $m)) {
            $data['heading'] = trim($m[1], "\" '\n");
        }
        if (preg_match('/^tags:\s*\[(.+)\]$/m', $block, $m)) {
            $tags = array_map(function($t) {
                return trim($t, "\" '\n");
            }, explode(',', $m[1]));
            $data['tags'] = implode(', ', array_filter($tags));
        }
        if (preg_match('/^created:\s*(.+)$/m', $block, $m)) {
            $data['created'] = trim($m[1]);
        }
        if (preg_match('/^updated:\s*(.+)$/m', $block, $m)) {
            $data['updated'] = trim($m[1]);
        }
        if (preg_match('/^favorite:\s*(\d)$/m', $block, $m)) {
            $data['favorite'] = (int)$m[1];
        }
        if (preg_match('/^poznote_id:\s*(\d+)$/m', $block, $m)) {
            $data['poznote_id'] = intval($m[1]);
        }
        if (preg_match('/^type:\s*(\w+)$/m', $block, $m)) {
            $data['type'] = trim($m[1]);
        }
    }
    
    /**
     * Find existing note by poznote_id or title
     * 
     * Search strategy:
     * 1. First try by poznote_id from front matter (most reliable)
     * 2. Then try by title and workspace (may match multiple notes)
     * 
     * @param array $noteData Note data with poznote_id, heading, workspace
     * @return array|false Note data if found, false otherwise
     */
    private function findExistingNote($noteData) {
        if (!$this->con) {
            return false;
        }
        
        // First try by poznote_id if available (most reliable method)
        // Search in both active and trashed notes
        if (isset($noteData['poznote_id'])) {
            $stmt = $this->con->prepare("SELECT id, heading, type, workspace, trash FROM entries WHERE id = ?");
            $stmt->execute([$noteData['poznote_id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }
        
        // Fallback: search by title and workspace (ordered by active first, then most recent)
        $stmt = $this->con->prepare("
            SELECT id, heading, type, workspace, trash
            FROM entries 
            WHERE heading = ? AND workspace = ?
            ORDER BY trash ASC, updated DESC 
            LIMIT 1
        ");
        $stmt->execute([$noteData['heading'], $noteData['workspace']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    /**
     * Extract folder name from folder path
     * @param string $folderPath Full folder path
     * @return string|null Last folder name in path
     */
    private function extractFolderName($folderPath) {
        if (empty($folderPath)) {
            return null;
        }
        $folderParts = explode('/', trim($folderPath, '/'));
        return end($folderParts);
    }
    
    /**
     * Remove YAML front matter from content
     * @param string $content Content with possible front matter
     * @return string Content without front matter
     */
    private function removeFrontMatter($content) {
        // Strip YAML front matter (--- ... ---)
        $content = preg_replace('/^---\s*\n.+?\n---\s*\n\n?/s', '', $content);
        // Strip HTML comment front matter (<!--poznote ... -->)
        $content = preg_replace('/^<!--poznote\n.*?\n-->\n*/s', '', $content);
        return $content;
    }
    
    /**
     * Create a new note from GitHub content
     * @param array $noteData Note data (heading, type, tags, workspace, folder_path)
     * @param string $content Note content (may include front matter)
     * @param string $entriesPath Path to entries directory
     * @param array $attachmentMetadata Attachment metadata from .metadata.json
     * @return int New note ID
     */
    private function createNote($noteData, $content, $entriesPath, $attachmentMetadata = [], $notePath = null) {
        $now = date('Y-m-d H:i:s');
        
        $cleanContent = $this->removeFrontMatter($content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderName = $this->extractFolderName($noteData['folder_path']);
        }
        
        // Reconstruct attachments column from content + metadata (matched by note_path)
        $attachmentsJson = $this->reconstructAttachmentsFromContent($cleanContent, $attachmentMetadata, $notePath);
        
        $stmt = $this->con->prepare("
            INSERT INTO entries (heading, entry, type, tags, workspace, folder, folder_id, created, updated, trash, favorite, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ");

        $created  = $noteData['created']  ?? $now;
        $updated  = $noteData['updated']  ?? $now;
        $favorite = $noteData['favorite'] ?? 0;

        $stmt->execute([
            $noteData['heading'],
            $noteData['type'] === 'markdown' ? '' : $cleanContent,
            $noteData['type'],
            $noteData['tags'],
            $noteData['workspace'],
            $folderName,
            $folderId,
            $created,
            $updated,
            $favorite,
            $attachmentsJson
        ]);
        
        $noteId = $this->con->lastInsertId();
        
        // Re-reconstruct attachments now that we have the real noteId (note_path matching is stable)
        $attachmentsJson = $this->reconstructAttachmentsFromContent($cleanContent, $attachmentMetadata, $notePath);
        if ($attachmentsJson !== null) {
            $attStmt = $this->con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
            $attStmt->execute([$attachmentsJson, $noteId]);
        }
        
        // Transform attachment links from GitHub to local format
        $transformedContent = $this->transformLinksForLocal($cleanContent, $noteId, $attachmentMetadata);
        
        // Update the entry column with transformed content (only for HTML notes)
        if ($noteData['type'] !== 'markdown') {
            $updateStmt = $this->con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
            $updateStmt->execute([$transformedContent, $noteId]);
        }
        
        // Save file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath  = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $transformedContent);
        
        return $noteId;
    }
    
    /**
     * Update an existing note from GitHub content
     * Updates all fields including heading, type, workspace, and content
     * @param int $noteId Note ID to update
     * @param array $noteData Note data (heading, type, tags, workspace, folder_path)
     * @param string $content Note content (may include front matter)
     * @param string $entriesPath Path to entries directory
     * @param array $attachmentMetadata Attachment metadata from .metadata.json
     * @return bool Success status
     */
    private function updateNote($noteId, $noteData, $content, $entriesPath, $attachmentMetadata = [], $notePath = null) {
        $now = date('Y-m-d H:i:s');
        
        $cleanContent = $this->removeFrontMatter($content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderName = $this->extractFolderName($noteData['folder_path']);
        }

        // Reconstruct attachments column from content + metadata (matched by note_path)
        $attachmentsJson = $this->reconstructAttachmentsFromContent($cleanContent, $attachmentMetadata, $notePath);
        
        // Transform attachment links from GitHub to local format
        $transformedContent = $this->transformLinksForLocal($cleanContent, $noteId, $attachmentMetadata);

        // Update all necessary fields including heading, type, workspace, attachments, favorite and ensure note is not in trash
        $stmt = $this->con->prepare("
            UPDATE entries SET heading = ?, entry = ?, type = ?, tags = ?, workspace = ?, updated = ?, folder = ?, folder_id = ?, attachments = ?, favorite = ?, trash = 0
            WHERE id = ?
        ");
        
        $updated  = $noteData['updated']  ?? $now;
        $favorite = $noteData['favorite'] ?? 0;

        $stmt->execute([
            $noteData['heading'],
            $noteData['type'] === 'markdown' ? '' : $transformedContent,
            $noteData['type'],
            $noteData['tags'],
            $noteData['workspace'],
            $updated,
            $folderName,
            $folderId,
            $attachmentsJson,
            $favorite,
            $noteId
        ]);
        
        // Update file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath  = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $transformedContent);
        
        return true;
    }
    
    /**
     * Reconstruct attachments column from note content and metadata.
     * Matches attachments by:
     *   1. Filename referenced in the note content (src/href/markdown links)
     *   2. note_path stored in metadata (stable key — survives note deletion/re-creation)
     *
     * @param string      $content            Note content (local links, front matter stripped)
     * @param array       $attachmentMetadata Metadata from .metadata.json
     * @param string|null $notePath           Repo path of the note (e.g. "Poznote/My Note.html")
     * @return string|null JSON encoded attachments array, or null if none found
     */
    private function reconstructAttachmentsFromContent($content, $attachmentMetadata, $notePath = null) {
        if (empty($attachmentMetadata)) {
            return null;
        }
        
        $attachments = [];
        $addedFilenames = [];
        
        // Extract all unique filenames referenced in the content
        // Match both HTML src/href and Markdown image syntax
        $patterns = [
            // HTML: <img src="..." or <a href="...
            '#(?:src|href)=["\'](?:\.\.\/)?attachments\/([^"\']+)["\']#i',
            // Markdown: ![alt](../attachments/filename)
            '#!\[([^\]]*)\]\((?:\.\.\/)?attachments\/([^)]+)\)#i',
        ];
        
        $referencedFiles = [];
        foreach ($patterns as $pattern) {
            if (preg_match_all($pattern, $content, $matches)) {
                // For HTML pattern, matches are in group 1
                // For Markdown pattern, matches are in group 2
                $fileMatches = isset($matches[2]) && !empty($matches[2][0]) ? $matches[2] : $matches[1];
                foreach ($fileMatches as $filename) {
                    if (!empty($filename)) {
                        $referencedFiles[$filename] = true;
                    }
                }
            }
        }
        
        // Build attachments array using metadata for content-referenced files
        foreach ($referencedFiles as $filename => $unused) {
            if (isset($attachmentMetadata[$filename])) {
                $metadata = $attachmentMetadata[$filename];
                $attachments[] = [
                    'id' => $metadata['id'],
                    'filename' => $filename,
                    'original_filename' => $metadata['original_filename'],
                    'file_size' => $metadata['file_size'],
                    'file_type' => $metadata['file_type'],
                    'uploaded_at' => $metadata['uploaded_at']
                ];
                $addedFilenames[$filename] = true;
            }
        }
        
        // Also include attachments linked to this note by note_path in metadata.
        // note_path is stable across note deletion/re-creation (unlike note_id which changes).
        if ($notePath !== null) {
            foreach ($attachmentMetadata as $filename => $metadata) {
                if (isset($addedFilenames[$filename])) continue;
                if (isset($metadata['note_path']) && $metadata['note_path'] === $notePath) {
                    $attachments[] = [
                        'id'                => $metadata['id'],
                        'filename'          => $filename,
                        'original_filename' => $metadata['original_filename'],
                        'file_size'         => $metadata['file_size'],
                        'file_type'         => $metadata['file_type'],
                        'uploaded_at'       => $metadata['uploaded_at']
                    ];
                    $addedFilenames[$filename] = true;
                }
            }
        }
        
        return empty($attachments) ? null : json_encode($attachments);
    }
    
    /**
     * Sync attachments from GitHub
     * Downloads attachment files from GitHub and saves them locally
     * Note: Does not update the database attachments column - that's managed per note during pull
     * @param array $githubAttachments Array of attachment info from GitHub tree
     * @param string $attachmentsPath Local attachments directory path
     * @param array &$results Results array to append debug messages
     * @return bool Success status
     */
    private function syncAttachmentsFromGitHub($githubAttachments, $attachmentsPath, &$results) {
        if (!is_dir($attachmentsPath)) {
            if (!mkdir($attachmentsPath, 0755, true)) {
                throw new Exception("Could not create attachments directory");
            }
        }
        
        foreach ($githubAttachments as $attachmentInfo) {
            $githubPath = $attachmentInfo['path'];
            $filename = $attachmentInfo['filename'];
            $localFilePath = $attachmentsPath . '/' . $filename;
            
            // Skip if file already exists locally
            if (file_exists($localFilePath)) {
                $results['debug'][] = "Attachment already exists: " . $filename;
                continue;
            }
            
            // Get file content from GitHub
            $fileContent = $this->getFileContent($githubPath);
            
            if (isset($fileContent['error'])) {
                $results['debug'][] = "Failed to download attachment: " . $fileContent['error'];
                continue;
            }
            
            // Save file to local attachments directory
            if (file_put_contents($localFilePath, $fileContent['content']) === false) {
                $results['debug'][] = "Failed to save attachment file: " . $filename;
                continue;
            }
            
            $results['debug'][] = "Downloaded attachment: " . $filename;
        }
        
        return true;
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
    
    /**
     * Transform attachment links from GitHub format to local format
     * Converts: ../attachments/{filename} → /api/v1/notes/{noteId}/attachments/{attachmentId}
     * @param string $content Note content
     * @param int $noteId Note ID
     * @param array $attachmentMetadata Metadata from .metadata.json
     * @return string Transformed content
     */
    private function transformLinksForLocal($content, $noteId, $attachmentMetadata) {
        if (empty($attachmentMetadata)) {
            return $content;
        }
        
        // Build a map of filename => attachment_id
        $filenameToId = [];
        foreach ($attachmentMetadata as $filename => $metadata) {
            if (isset($metadata['id'])) {
                $filenameToId[$filename] = $metadata['id'];
            }
        }
        
        if (empty($filenameToId)) {
            return $content;
        }
        
        // Transform links - handle both ../attachments/ and attachments/
        $content = preg_replace_callback(
            '#(?:\.\.\/)?attachments\/([^"\'\s)]+)#',
            function($matches) use ($filenameToId, $noteId) {
                $filename = $matches[1];
                if (isset($filenameToId[$filename])) {
                    return '/api/v1/notes/' . $noteId . '/attachments/' . $filenameToId[$filename];
                }
                return $matches[0]; // Keep original if not found
            },
            $content
        );
        
        return $content;
    }
}
