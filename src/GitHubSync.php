<?php
/**
 * GitHubSync - GitHub synchronization for Poznote notes
 * 
 * Handles pushing and pulling notes from a GitHub repository using the GitHub API.
 * All configuration is stored in environment variables for security.
 */

class GitHubSync {
    // Supported file extensions
    const SUPPORTED_NOTE_EXTENSIONS = ['md', 'html', 'txt', 'markdown', 'json'];
    const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'txt'];
    
    private $token;
    private $repo;
    private $branch;
    private $authorName;
    private $authorEmail;
    private $apiBase = 'https://api.github.com';
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
        
        $this->token = defined('GITHUB_TOKEN') ? GITHUB_TOKEN : '';
        $this->repo = defined('GITHUB_REPO') ? GITHUB_REPO : '';
        $this->branch = defined('GITHUB_BRANCH') ? GITHUB_BRANCH : 'main';
        $this->authorName = defined('GITHUB_AUTHOR_NAME') ? GITHUB_AUTHOR_NAME : 'Poznote';
        $this->authorEmail = defined('GITHUB_AUTHOR_EMAIL') ? GITHUB_AUTHOR_EMAIL : 'poznote@localhost';
        $this->con = $con;
        $this->userId = $userId;
    }
    
    /**
     * Check if GitHub sync is enabled and properly configured
     * @return bool True if GitHub sync is enabled
     */
    public static function isEnabled() {
        require_once __DIR__ . '/config.php';
        return defined('GITHUB_SYNC_ENABLED') && GITHUB_SYNC_ENABLED === true;
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
        ];
    }
    
    /**
     * Test connection to GitHub API
     * @return array Result with success status and repository info or error message
     */
    public function testConnection() {
        if (!$this->isConfigured()) {
            return [
                'success' => false,
                'error' => 'GitHub sync is not properly configured. Check your .env file.'
            ];
        }
        
        // Test API access
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
            error_log("GitHubSync::getLastSyncInfo error: " . $e->getMessage());
        }
        
        return null;
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
            error_log("GitHubSync::saveSyncInfo error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Push all notes to GitHub repository
     * @param string|null $workspaceFilter Optional workspace to filter by
     * @return array Results with success status, counts, and errors
     */
    public function pushNotes($workspaceFilter = null) {
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'GitHub sync is not configured'];
        }
        
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }
        
        $results = [
            'success' => true,
            'pushed' => 0,
            'deleted' => 0,
            'errors' => [],
            'skipped' => 0,
            'debug' => []
        ];
        
        try {
            // Get all notes
            $query = "SELECT id, heading, type, folder_id, tags, workspace, updated, attachments FROM entries WHERE trash = 0";
            $params = [];
            
            if ($workspaceFilter) {
                $query .= " AND workspace = ?";
                $params[] = $workspaceFilter;
            }
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get entries and attachments paths
            require_once __DIR__ . '/functions.php';
            $entriesPath = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();
            
            // Build a map of expected paths in GitHub
            $expectedPaths = [];
            
            // Collect attachment metadata by workspace
            $attachmentMetadataByWorkspace = [];
            
            foreach ($notes as $note) {
                $noteId = $note['id'];
                $noteType = $note['type'] ?? 'note';
                $extension = ($noteType === 'markdown') ? 'md' : 'html';
                $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
                
                if (!file_exists($filePath)) {
                    $results['skipped']++;
                    $results['debug'][] = "Skipped note ID {$noteId}: file not found";
                    $results['debug'][] = "";
                    continue;
                }
                
                $content = file_get_contents($filePath);
                
                // Transform attachment links for GitHub
                if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                    $attachments = json_decode($note['attachments'], true);
                    if (is_array($attachments)) {
                        $content = $this->transformLinksForGitHub($content, $noteId, $attachments);
                    }
                }
                
                // Build the path in the repository
                $workspace = $note['workspace'] ?? 'Poznote';
                $folderPath = $this->getFolderPath($note['folder_id']);
                $safeTitle = $this->sanitizeFileName($note['heading'] ?: 'Untitled');
                
                // Add workspace as top-level folder
                $repoPath = $workspace . '/' . trim($folderPath . '/' . $safeTitle . '.' . $extension, '/');
                
                $results['debug'][] = "Pushing: " . $repoPath;
                $results['debug'][] = "Workspace: {$workspace}, Folder: {$folderPath}, Title: {$safeTitle}";
                
                // Track this path as expected
                $expectedPaths[] = $repoPath;
                
                // Add front matter for markdown files
                if ($noteType === 'markdown') {
                    $content = $this->addFrontMatter($content, $note);
                }
                
                // Push to GitHub
                $pushResult = $this->pushFile($repoPath, $content, "Update: {$note['heading']}");
                
                if ($pushResult['success']) {
                    $results['pushed']++;
                    $results['debug'][] = "Pushed successfully";
                } else {
                    $results['debug'][] = "Push failed: " . $pushResult['error'];
                    $results['errors'][] = [
                        'note_id' => $noteId,
                        'title' => $note['heading'],
                        'error' => $pushResult['error']
                    ];
                }
                
                // Push attachments if any
                if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
                    $attachments = json_decode($note['attachments'], true);
                    if (is_array($attachments) && count($attachments) > 0) {
                        $results['debug'][] = "Pushing " . count($attachments) . " attachment(s)...";
                        
                        // Initialize workspace metadata if not exists
                        if (!isset($attachmentMetadataByWorkspace[$workspace])) {
                            $attachmentMetadataByWorkspace[$workspace] = [];
                        }
                        
                        foreach ($attachments as $attachment) {
                            if (!isset($attachment['filename'])) continue;
                            
                            $attachmentFile = $attachmentsPath . '/' . $attachment['filename'];
                            if (!file_exists($attachmentFile)) {
                                $results['debug'][] = "Attachment file not found: " . $attachment['filename'];
                                continue;
                            }
                            
                            $attachmentContent = file_get_contents($attachmentFile);
                            $attachmentRepoPath = $workspace . '/attachments/' . $attachment['filename'];
                            $expectedPaths[] = $attachmentRepoPath;
                            
                            // Store metadata for this attachment
                            $attachmentMetadataByWorkspace[$workspace][$attachment['filename']] = [
                                'id' => $attachment['id'] ?? uniqid(),
                                'original_filename' => $attachment['original_filename'] ?? $attachment['filename'],
                                'file_size' => $attachment['file_size'] ?? filesize($attachmentFile),
                                'file_type' => $attachment['file_type'] ?? 'application/octet-stream',
                                'uploaded_at' => $attachment['uploaded_at'] ?? date('Y-m-d H:i:s')
                            ];
                            
                            $attachmentPushResult = $this->pushFile(
                                $attachmentRepoPath, 
                                $attachmentContent, 
                                "Update attachment: {$attachment['original_filename']}"
                            );
                            
                            if ($attachmentPushResult['success']) {
                                $results['debug'][] = "Pushed attachment: " . $attachment['filename'];
                            } else {
                                $results['debug'][] = "Failed to push attachment: " . $attachmentPushResult['error'];
                                $results['errors'][] = [
                                    'note_id' => $noteId,
                                    'attachment' => $attachment['filename'],
                                    'error' => $attachmentPushResult['error']
                                ];
                            }
                        }
                    }
                }
                
                $results['debug'][] = "";
            }
            
            // Push metadata files for each workspace
            foreach ($attachmentMetadataByWorkspace as $workspace => $metadata) {
                if (empty($metadata)) continue;
                
                $metadataPath = $workspace . '/attachments/.metadata.json';
                $metadataContent = json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
                $expectedPaths[] = $metadataPath;
                
                $results['debug'][] = "Pushing metadata file for workspace: " . $workspace;
                $metadataPushResult = $this->pushFile(
                    $metadataPath,
                    $metadataContent,
                    "Update attachments metadata"
                );
                
                if ($metadataPushResult['success']) {
                    $results['debug'][] = "Pushed metadata file successfully";
                } else {
                    $results['debug'][] = "Failed to push metadata file: " . $metadataPushResult['error'];
                    $results['errors'][] = [
                        'workspace' => $workspace,
                        'error' => $metadataPushResult['error']
                    ];
                }
                $results['debug'][] = "";
            }
            
            // Get all files currently on GitHub
            $tree = $this->getRepoTree();
            
            if (!isset($tree['error'])) {
                foreach ($tree as $item) {
                    if ($item['type'] !== 'blob') continue;
                    
                    $path = $item['path'];
                    
                    // If workspace filter is set, only process files in that workspace
                    if ($workspaceFilter) {
                        if (strpos($path, $workspaceFilter . '/') !== 0) {
                            continue;
                        }
                    }
                    
                    // Delete any file not in our expected paths (complete overwrite)
                    if (!in_array($path, $expectedPaths)) {
                        $extension = pathinfo($path, PATHINFO_EXTENSION);
                        $isNoteFile = in_array($extension, self::SUPPORTED_NOTE_EXTENSIONS);
                        $isAttachmentFile = strpos($path, '/attachments/') !== false;
                        $isMetadataFile = basename($path) === '.metadata.json';
                        
                        $fileType = $isNoteFile ? "note" : ($isAttachmentFile ? "attachment" : ($isMetadataFile ? "metadata" : "file"));
                        $results['debug'][] = "Deleting orphaned {$fileType}: " . $path;
                        $deleteResult = $this->deleteFile($path, "Deleted from Poznote");
                        
                        if ($deleteResult['success']) {
                            $results['deleted']++;
                            $results['debug'][] = "Deleted successfully";
                        } else {
                            $results['debug'][] = "Delete failed: " . $deleteResult['error'];
                            $results['errors'][] = [
                                'path' => $path,
                                'error' => $deleteResult['error']
                            ];
                        }
                        $results['debug'][] = "";
                    }
                }
            }
            
            // Save sync info
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action' => 'push',
                'pushed' => $results['pushed'],
                'deleted' => $results['deleted'],
                'errors' => count($results['errors']),
                'workspace' => $workspaceFilter
            ]);
            
            if (count($results['errors']) > 0) {
                $results['success'] = $results['pushed'] > 0;
            }
            
        } catch (Exception $e) {
            $results['success'] = false;
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
        if (!$this->isConfigured()) {
            return ['success' => false, 'error' => 'GitHub sync is not configured'];
        }
        
        if (!$this->con) {
            return ['success' => false, 'error' => 'Database connection required'];
        }
        
        $results = [
            'success' => true,
            'pulled' => 0,
            'updated' => 0,
            'deleted' => 0,
            'errors' => [],
            'debug' => []
        ];
        
        try {
            // Get repository tree
            $tree = $this->getRepoTree();
            
            if (isset($tree['error'])) {
                return ['success' => false, 'error' => $tree['error']];
            }
            
            require_once __DIR__ . '/functions.php';
            $entriesPath = getEntriesPath();
            $attachmentsPath = getAttachmentsPath();
            
            // Download and parse metadata files for each workspace
            $attachmentMetadataByWorkspace = [];
            
            // Track which notes from GitHub we've seen
            $githubNotePaths = [];
            
            // Build a map of attachment files from the tree
            $attachmentFiles = [];
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                $path = $item['path'];
                
                // Detect metadata files
                // Format: Workspace/attachments/.metadata.json
                if (preg_match('#^([^/]+)/attachments/\.metadata\.json$#', $path, $matches)) {
                    $workspace = $matches[1];
                    
                    // Download and parse metadata file
                    $results['debug'][] = "Downloading metadata file for workspace: " . $workspace;
                    $metadataContent = $this->getFileContent($path);
                    
                    if (!isset($metadataContent['error'])) {
                        $metadata = json_decode($metadataContent['content'], true);
                        if (is_array($metadata)) {
                            $attachmentMetadataByWorkspace[$workspace] = $metadata;
                            $results['debug'][] = "Loaded metadata for " . count($metadata) . " attachments";
                        }
                    } else {
                        $results['debug'][] = "Failed to download metadata: " . $metadataContent['error'];
                    }
                    continue;
                }
                
                // Detect attachment files (in attachments folders)
                // Format: Workspace/attachments/filename
                if (preg_match('#^([^/]+)/attachments/(.+)$#', $path, $matches)) {
                    $workspace = $matches[1];
                    $filename = $matches[2];
                    
                    // Skip metadata file (already processed above)
                    if ($filename === '.metadata.json') continue;
                    
                    if (!isset($attachmentFiles[$workspace])) {
                        $attachmentFiles[$workspace] = [];
                    }
                    $attachmentFiles[$workspace][] = [
                        'path' => $path,
                        'filename' => $filename
                    ];
                }
            }
            
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                
                $path = $item['path'];
                $extension = pathinfo($path, PATHINFO_EXTENSION);
                
                // Only consider note files
                if (!in_array($extension, self::SUPPORTED_NOTE_EXTENSIONS)) continue;
                
                $results['debug'][] = "Processing: " . $path;
                
                // Get file content
                $content = $this->getFileContent($path);
                
                if (isset($content['error'])) {
                    $results['debug'][] = "Error getting content: " . $content['error'];
                    $results['debug'][] = "";
                    $results['errors'][] = [
                        'path' => $path,
                        'error' => $content['error']
                    ];
                    continue;
                }
                
                // Parse content and metadata
                $noteData = $this->parseNoteFromGitHub($path, $content['content'], $extension);
                $results['debug'][] = "Parsed - workspace: " . $noteData['workspace'] . ", folder: " . $noteData['folder_path'] . ", title: " . $noteData['heading'];
                
                // Use workspace from path, or use Poznote as default
                if (empty($noteData['workspace'])) {
                    $noteData['workspace'] = $workspaceTarget ?: 'Poznote';
                    $results['debug'][] = "Empty workspace, using: " . $noteData['workspace'];
                }
                
                // If workspace filter is set and doesn't match, skip this note
                if ($workspaceTarget && $noteData['workspace'] !== $workspaceTarget) {
                    $results['debug'][] = "SKIPPED (workspace mismatch): " . $noteData['workspace'] . " != " . $workspaceTarget;
                    $results['debug'][] = "";
                    continue;
                }
                
                // Track this note path
                $githubNotePaths[] = $path;
                
                // Check if note already exists (by title and folder)
                $existingNote = $this->findExistingNote($noteData);
                
                // Get metadata for this workspace
                $workspaceMetadata = isset($attachmentMetadataByWorkspace[$noteData['workspace']]) 
                    ? $attachmentMetadataByWorkspace[$noteData['workspace']] 
                    : [];
                
                if ($existingNote) {
                    $results['debug'][] = "Found existing note ID: " . $existingNote['id'];
                    // Update existing note
                    try {
                        $this->updateNote($existingNote['id'], $noteData, $content['content'], $entriesPath, $workspaceMetadata);
                        $results['updated']++;
                        $results['debug'][] = "Updated successfully";
                    } catch (Exception $e) {
                        $results['debug'][] = "Update failed: " . $e->getMessage();
                        $results['errors'][] = [
                            'path' => $path,
                            'error' => 'Failed to update: ' . $e->getMessage()
                        ];
                    }
                } else {
                    $results['debug'][] = "Creating new note...";
                    // Create new note
                    try {
                        $this->createNote($noteData, $content['content'], $entriesPath, $workspaceMetadata);
                        $results['pulled']++;
                        $results['debug'][] = "Created successfully";
                    } catch (Exception $e) {
                        $results['debug'][] = "Create failed: " . $e->getMessage();
                        $results['errors'][] = [
                            'path' => $path,
                            'error' => 'Failed to create: ' . $e->getMessage()
                        ];
                    }
                }
                
                $results['debug'][] = "";
            }
            
            // Sync attachments for each workspace
            foreach ($attachmentFiles as $workspace => $attachments) {
                // Skip if workspace filter is set and doesn't match
                if ($workspaceTarget && $workspace !== $workspaceTarget) {
                    continue;
                }
                
                $results['debug'][] = "Syncing " . count($attachments) . " attachment(s) for workspace: " . $workspace;
                try {
                    $this->syncAttachmentsFromGitHub($attachments, $attachmentsPath, $results);
                } catch (Exception $e) {
                    $results['debug'][] = "Attachment sync failed: " . $e->getMessage();
                    $results['errors'][] = [
                        'workspace' => $workspace,
                        'error' => 'Failed to sync attachments: ' . $e->getMessage()
                    ];
                }
            }
            
            // Now delete notes in Poznote that no longer exist on GitHub
            // Get all notes (filtered by workspace if specified)
            $query = "SELECT id, heading, type, folder_id, workspace FROM entries WHERE trash = 0";
            $params = [];
            
            if ($workspaceTarget) {
                $query .= " AND workspace = ?";
                $params[] = $workspaceTarget;
            }
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            $localNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            foreach ($localNotes as $note) {
                $noteType = $note['type'] ?? 'note';
                $extension = ($noteType === 'markdown') ? 'md' : 'html';
                
                // Build expected path on GitHub
                $workspace = $note['workspace'] ?? 'Poznote';
                $folderPath = $this->getFolderPath($note['folder_id']);
                $safeTitle = $this->sanitizeFileName($note['heading'] ?: 'Untitled');
                $expectedPath = $workspace . '/' . trim($folderPath . '/' . $safeTitle . '.' . $extension, '/');
                
                // If this note's path is not in GitHub, move it to trash
                if (!in_array($expectedPath, $githubNotePaths)) {
                    try {
                        $deleteStmt = $this->con->prepare("UPDATE entries SET trash = 1 WHERE id = ?");
                        $deleteStmt->execute([$note['id']]);
                        $results['deleted']++;
                    } catch (Exception $e) {
                        $results['errors'][] = [
                            'note_id' => $note['id'],
                            'error' => 'Failed to delete: ' . $e->getMessage()
                        ];
                    }
                }
            }
            
            // Save sync info
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action' => 'pull',
                'pulled' => $results['pulled'],
                'updated' => $results['updated'],
                'deleted' => $results['deleted'],
                'errors' => count($results['errors']),
                'workspace' => $workspaceTarget
            ]);
            
        } catch (Exception $e) {
            $results['success'] = false;
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
     * Push a single file to GitHub
     * @param string $path File path in repository
     * @param string $content File content
     * @param string $message Commit message
     * @return array Result with success status, SHA, and error if applicable
     */
    private function pushFile($path, $content, $message) {
        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $path)));
        
        // Try to get the existing file to get its SHA
        $existingFile = $this->apiRequest('GET', "/repos/{$this->repo}/contents/{$encodedPath}?ref={$this->branch}");
        
        $body = [
            'message' => $message,
            'content' => base64_encode($content),
            'branch' => $this->branch,
            'committer' => [
                'name' => $this->authorName,
                'email' => $this->authorEmail
            ]
        ];
        
        // If file exists, include SHA for update
        if (isset($existingFile['sha'])) {
            $body['sha'] = $existingFile['sha'];
        }
        
        $response = $this->apiRequest('PUT', "/repos/{$this->repo}/contents/{$encodedPath}", $body);
        
        if (isset($response['content'])) {
            return ['success' => true, 'sha' => $response['content']['sha']];
        }
        
        return [
            'success' => false,
            'error' => $response['message'] ?? $response['error'] ?? 'Unknown error'
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
     * Make API request to GitHub
     */
    private function apiRequest($method, $endpoint, $body = null) {
        $url = $this->apiBase . $endpoint;
        
        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Accept: application/vnd.github.v3+json',
            'User-Agent: Poznote',
            'X-GitHub-Api-Version: 2022-11-28'
        ];
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
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
            return ['error' => 'cURL error: ' . $error];
        }
        
        $data = json_decode($response, true);
        
        if ($httpCode >= 400) {
            return [
                'error' => $data['message'] ?? "HTTP error: $httpCode",
                'status' => $httpCode
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
            $stmt = $this->con->prepare("SELECT name, parent_id FROM folders WHERE id = ?");
            $stmt->execute([$currentId]);
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                array_unshift($path, $this->sanitizeFileName($folder['name']));
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
        // Check if content already has front matter
        if (preg_match('/^---\s*\n/', $content)) {
            return $content;
        }
        
        $frontMatter = "---\n";
        $frontMatter .= "title: " . json_encode($note['heading'] ?: 'Untitled') . "\n";
        
        if (!empty($note['tags'])) {
            $tags = array_map('trim', explode(',', $note['tags']));
            $frontMatter .= "tags: [" . implode(', ', array_map('json_encode', $tags)) . "]\n";
        }
        
        $frontMatter .= "updated: " . ($note['updated'] ?? date('Y-m-d H:i:s')) . "\n";
        $frontMatter .= "poznote_id: " . $note['id'] . "\n";
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
        // Split path into segments
        $pathParts = explode('/', $path);
        
        // If file is at root (no slash), use default workspace
        if (count($pathParts) === 1) {
            $workspace = 'Poznote';
            $folderPath = '';
        } else {
            // First part is the workspace
            $workspace = $pathParts[0];
            
            // Build folder path from middle segments (exclude workspace and filename)
            if (count($pathParts) > 2) {
                // Get all parts except first (workspace) and last (filename)
                $folderPath = implode('/', array_slice($pathParts, 1, -1));
            } else {
                // File is directly in workspace folder
                $folderPath = '';
            }
        }
        
        // Extract filename without extension
        $filename = pathinfo($path, PATHINFO_FILENAME);
        
        $data = [
            'type' => in_array($extension, self::MARKDOWN_EXTENSIONS) ? 'markdown' : 'note',
            'heading' => $filename,
            'tags' => '',
            'folder_path' => $folderPath,
            'workspace' => $workspace
        ];
        
        // Parse front matter for markdown-like files
        if (in_array($extension, self::MARKDOWN_EXTENSIONS) && preg_match('/^---\s*\n(.+?)\n---\s*\n/s', $content, $matches)) {
            $frontMatter = $matches[1];
            
            if (preg_match('/^title:\s*(.+)$/m', $frontMatter, $m)) {
                $data['heading'] = trim($m[1], "\" '\n");
            }
            
            if (preg_match('/^tags:\s*\[(.+)\]$/m', $frontMatter, $m)) {
                $tags = array_map(function($t) {
                    return trim($t, "\" '\n");
                }, explode(',', $m[1]));
                $data['tags'] = implode(', ', $tags);
            }
            
            if (preg_match('/^poznote_id:\s*(\d+)$/m', $frontMatter, $m)) {
                $data['poznote_id'] = intval($m[1]);
            }
        }
        
        return $data;
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
        if (isset($noteData['poznote_id'])) {
            $stmt = $this->con->prepare("SELECT id, heading, type, workspace FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteData['poznote_id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }
        
        // Fallback: search by title and workspace (ordered by most recent)
        $stmt = $this->con->prepare("
            SELECT id, heading, type, workspace 
            FROM entries 
            WHERE heading = ? AND workspace = ? AND trash = 0 
            ORDER BY updated DESC 
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
        return preg_replace('/^---\s*\n.+?\n---\s*\n/s', '', $content);
    }
    
    /**
     * Create a new note from GitHub content
     * @param array $noteData Note data (heading, type, tags, workspace, folder_path)
     * @param string $content Note content (may include front matter)
     * @param string $entriesPath Path to entries directory
     * @param array $attachmentMetadata Attachment metadata from .metadata.json
     * @return int New note ID
     */
    private function createNote($noteData, $content, $entriesPath, $attachmentMetadata = []) {
        $now = date('Y-m-d H:i:s');
        
        $cleanContent = $this->removeFrontMatter($content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderName = $this->extractFolderName($noteData['folder_path']);
        }
        
        // Reconstruct attachments column from content
        $attachmentsJson = $this->reconstructAttachmentsFromContent($cleanContent, $attachmentMetadata);
        
        $stmt = $this->con->prepare("
            INSERT INTO entries (heading, entry, type, tags, workspace, folder, folder_id, created, updated, trash, favorite, attachments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
        ");
        
        $stmt->execute([
            $noteData['heading'],
            $noteData['type'] === 'markdown' ? '' : $cleanContent,
            $noteData['type'],
            $noteData['tags'],
            $noteData['workspace'],
            $folderName,
            $folderId,
            $now,
            $now,
            $attachmentsJson
        ]);
        
        $noteId = $this->con->lastInsertId();
        
        // Transform attachment links from GitHub to local format
        $transformedContent = $this->transformLinksForLocal($cleanContent, $noteId, $attachmentMetadata);
        
        // Update the entry column with transformed content (only for HTML notes)
        if ($noteData['type'] !== 'markdown') {
            $updateStmt = $this->con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
            $updateStmt->execute([$transformedContent, $noteId]);
        }
        
        // Save file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
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
    private function updateNote($noteId, $noteData, $content, $entriesPath, $attachmentMetadata = []) {
        $now = date('Y-m-d H:i:s');
        
        $cleanContent = $this->removeFrontMatter($content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderName = $this->extractFolderName($noteData['folder_path']);
        }

        // Reconstruct attachments column from content
        $attachmentsJson = $this->reconstructAttachmentsFromContent($cleanContent, $attachmentMetadata);
        
        // Transform attachment links from GitHub to local format
        $transformedContent = $this->transformLinksForLocal($cleanContent, $noteId, $attachmentMetadata);

        // Update all necessary fields including heading, type, workspace, and attachments
        $stmt = $this->con->prepare("
            UPDATE entries SET heading = ?, entry = ?, type = ?, tags = ?, workspace = ?, updated = ?, folder = ?, folder_id = ?, attachments = ?
            WHERE id = ?
        ");
        
        $stmt->execute([
            $noteData['heading'],
            $noteData['type'] === 'markdown' ? '' : $transformedContent,
            $noteData['type'],
            $noteData['tags'],
            $noteData['workspace'],
            $now,
            $folderName,
            $folderId,
            $attachmentsJson,
            $noteId
        ]);
        
        // Update file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $transformedContent);
        
        return true;
    }
    
    /**
     * Reconstruct attachments column from note content and metadata
     * Scans the note content for attachment references and rebuilds the attachments JSON
     * @param string $content Note content
     * @param array $attachmentMetadata Metadata from .metadata.json file
     * @return string JSON encoded attachments array
     */
    private function reconstructAttachmentsFromContent($content, $attachmentMetadata) {
        if (empty($attachmentMetadata)) {
            return null;
        }
        
        $attachments = [];
        
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
        
        // Build attachments array using metadata
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
