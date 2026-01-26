<?php
/**
 * GitHubSync - GitHub synchronization for Poznote notes
 * 
 * Handles pushing and pulling notes from a GitHub repository using the GitHub API.
 * All configuration is stored in environment variables for security.
 */

class GitHubSync {
    private $token;
    private $repo;
    private $branch;
    private $authorName;
    private $authorEmail;
    private $apiBase = 'https://api.github.com';
    private $con;
    private $userId;
    
    /**
     * Constructor
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
     */
    public static function isEnabled() {
        require_once __DIR__ . '/config.php';
        return defined('GITHUB_SYNC_ENABLED') && GITHUB_SYNC_ENABLED === true;
    }
    
    /**
     * Check if configuration is valid
     */
    public function isConfigured() {
        return !empty($this->token) && !empty($this->repo);
    }
    
    /**
     * Get current configuration status (without exposing sensitive data)
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
            $query = "SELECT id, heading, type, folder_id, tags, workspace, updated FROM entries WHERE trash = 0";
            $params = [];
            
            if ($workspaceFilter) {
                $query .= " AND workspace = ?";
                $params[] = $workspaceFilter;
            }
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Get entries path
            require_once __DIR__ . '/functions.php';
            $entriesPath = getEntriesPath();
            
            // Build a map of expected paths in GitHub
            $expectedPaths = [];
            
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
                
                $results['debug'][] = "";
            }
            
            // Get all files currently on GitHub
            $tree = $this->getRepoTree();
            
            if (!isset($tree['error'])) {
                foreach ($tree as $item) {
                    if ($item['type'] !== 'blob') continue;
                    
                    $path = $item['path'];
                    $extension = pathinfo($path, PATHINFO_EXTENSION);
                    
                    // Only consider note files (.md, .html, .txt, .markdown, .json)
                    if (!in_array($extension, ['md', 'html', 'txt', 'markdown', 'json'])) continue;
                    
                    // If workspace filter is set, only delete files in that workspace
                    if ($workspaceFilter) {
                        if (strpos($path, $workspaceFilter . '/') !== 0) {
                            continue;
                        }
                    }
                    
                    // If this file is not in our expected paths, delete it
                    if (!in_array($path, $expectedPaths)) {
                        $results['debug'][] = "Deleting orphaned file: " . $path;
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
            
            // Track which notes from GitHub we've seen
            $githubNotePaths = [];
            
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                
                $path = $item['path'];
                $extension = pathinfo($path, PATHINFO_EXTENSION);
                
                if (!in_array($extension, ['md', 'html', 'txt', 'markdown', 'json'])) continue;
                
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
                
                if ($existingNote) {
                    $results['debug'][] = "Found existing note ID: " . $existingNote['id'];
                    // Update existing note
                    try {
                        $this->updateNote($existingNote['id'], $noteData, $content['content'], $entriesPath);
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
                        $this->createNote($noteData, $content['content'], $entriesPath);
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
     */
    private function deleteFile($path, $message) {
        // Encode the path for URL
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
     */
    private function pushFile($path, $content, $message) {
        // Encode the path for URL (each segment separately to preserve /)
        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $path)));
        
        // First, try to get the existing file to get its SHA
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
     */
    private function getFileContent($path) {
        // Encode the path for URL
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
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        if ($method === 'PUT' || $method === 'POST' || $method === 'DELETE') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            if ($body) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
                $headers[] = 'Content-Type: application/json';
                curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            }
        }
        
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
     * Get folder path for a note
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
     */
    private function parseNoteFromGitHub($path, $content, $extension) {
        // Extract workspace from path (first folder)
        $pathParts = explode('/', $path);
        
        // If file is at root (no slash), use default workspace
        if (count($pathParts) === 1) {
            $workspace = 'Poznote';
            $folderPath = '';
        } else {
            $workspace = $pathParts[0];
            
            // Remove workspace from folder path
            $folderPath = dirname($path);
            if (strpos($folderPath, $workspace . '/') === 0) {
                $folderPath = substr($folderPath, strlen($workspace) + 1);
            }
            if ($folderPath === $workspace) {
                $folderPath = '';
            }
        }
        
        $data = [
            'type' => (in_array($extension, ['md', 'markdown', 'txt'])) ? 'markdown' : 'note',
            'heading' => pathinfo(pathinfo($path, PATHINFO_FILENAME), PATHINFO_FILENAME),
            'tags' => '',
            'folder_path' => $folderPath,
            'workspace' => $workspace
        ];
        
        // Parse front matter for markdown-like files
        if (in_array($extension, ['md', 'markdown', 'txt']) && preg_match('/^---\s*\n(.+?)\n---\s*\n/s', $content, $matches)) {
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
     * Find existing note by title and folder
     */
    private function findExistingNote($noteData) {
        if (!$this->con) return null;
        
        // First try by poznote_id if available
        if (isset($noteData['poznote_id'])) {
            $stmt = $this->con->prepare("SELECT id FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteData['poznote_id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        }
        
        // Then try by title
        $stmt = $this->con->prepare("SELECT id FROM entries WHERE heading = ? AND workspace = ? AND trash = 0 LIMIT 1");
        $stmt->execute([$noteData['heading'], $noteData['workspace']]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
    
    /**
     * Create a new note from GitHub content
     */
    private function createNote($noteData, $content, $entriesPath) {
        $now = date('Y-m-d H:i:s');
        
        // Remove front matter from content
        $cleanContent = preg_replace('/^---\s*\n.+?\n---\s*\n/s', '', $content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderParts = explode('/', $noteData['folder_path']);
            $folderName = end($folderParts);
        }
        
        $stmt = $this->con->prepare("
            INSERT INTO entries (heading, entry, type, tags, workspace, folder, folder_id, created, updated, trash, favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
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
            $now
        ]);
        
        $noteId = $this->con->lastInsertId();
        
        // Save file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $cleanContent);
        
        return $noteId;
    }
    
    /**
     * Update an existing note from GitHub content
     */
    private function updateNote($noteId, $noteData, $content, $entriesPath) {
        $now = date('Y-m-d H:i:s');
        
        // Remove front matter from content
        $cleanContent = preg_replace('/^---\s*\n.+?\n---\s*\n/s', '', $content);
        
        // Get or create folder ID from folder path
        $folderId = null;
        $folderName = null;
        if (!empty($noteData['folder_path'])) {
            $folderId = $this->getOrCreateFolderFromPath($noteData['folder_path'], $noteData['workspace']);
            $folderParts = explode('/', $noteData['folder_path']);
            $folderName = end($folderParts);
        }

        $stmt = $this->con->prepare("
            UPDATE entries SET entry = ?, tags = ?, updated = ?, folder = ?, folder_id = ?
            WHERE id = ?
        ");
        
        $stmt->execute([
            $noteData['type'] === 'markdown' ? '' : $cleanContent,
            $noteData['tags'],
            $now,
            $folderName,
            $folderId,
            $noteId
        ]);
        
        // Update file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $cleanContent);
        
        return true;
    }
}
