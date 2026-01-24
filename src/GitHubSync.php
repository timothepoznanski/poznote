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
            'mode' => defined('GITHUB_SYNC_MODE') ? GITHUB_SYNC_MODE : 'manual',
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
            'errors' => [],
            'skipped' => 0
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
            
            foreach ($notes as $note) {
                $noteId = $note['id'];
                $noteType = $note['type'] ?? 'note';
                $extension = ($noteType === 'markdown') ? 'md' : 'html';
                $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
                
                if (!file_exists($filePath)) {
                    $results['skipped']++;
                    continue;
                }
                
                $content = file_get_contents($filePath);
                
                // Build the path in the repository
                $folderPath = $this->getFolderPath($note['folder_id']);
                $safeTitle = $this->sanitizeFileName($note['heading'] ?: 'Untitled');
                $repoPath = trim($folderPath . '/' . $safeTitle . '.' . $extension, '/');
                
                // Add front matter for markdown files
                if ($noteType === 'markdown') {
                    $content = $this->addFrontMatter($content, $note);
                }
                
                // Push to GitHub
                $pushResult = $this->pushFile($repoPath, $content, "Update: {$note['heading']}");
                
                if ($pushResult['success']) {
                    $results['pushed']++;
                } else {
                    $results['errors'][] = [
                        'note_id' => $noteId,
                        'title' => $note['heading'],
                        'error' => $pushResult['error']
                    ];
                }
            }
            
            // Save sync info
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action' => 'push',
                'pushed' => $results['pushed'],
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
    public function pullNotes($workspaceTarget = 'Poznote') {
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
            'errors' => []
        ];
        
        try {
            // Get repository tree
            $tree = $this->getRepoTree();
            
            if (isset($tree['error'])) {
                return ['success' => false, 'error' => $tree['error']];
            }
            
            require_once __DIR__ . '/functions.php';
            $entriesPath = getEntriesPath();
            
            foreach ($tree as $item) {
                if ($item['type'] !== 'blob') continue;
                
                $path = $item['path'];
                $extension = pathinfo($path, PATHINFO_EXTENSION);
                
                if (!in_array($extension, ['md', 'html'])) continue;
                
                // Get file content
                $content = $this->getFileContent($path);
                
                if (isset($content['error'])) {
                    $results['errors'][] = [
                        'path' => $path,
                        'error' => $content['error']
                    ];
                    continue;
                }
                
                // Parse content and metadata
                $noteData = $this->parseNoteFromGitHub($path, $content['content'], $extension);
                $noteData['workspace'] = $workspaceTarget;
                
                // Check if note already exists (by title and folder)
                $existingNote = $this->findExistingNote($noteData);
                
                if ($existingNote) {
                    // Update existing note
                    $this->updateNote($existingNote['id'], $noteData, $content['content'], $entriesPath);
                    $results['updated']++;
                } else {
                    // Create new note
                    $this->createNote($noteData, $content['content'], $entriesPath);
                    $results['pulled']++;
                }
            }
            
            // Save sync info
            $this->saveSyncInfo([
                'timestamp' => date('c'),
                'action' => 'pull',
                'pulled' => $results['pulled'],
                'updated' => $results['updated'],
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
        
        if ($method === 'PUT' || $method === 'POST') {
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
        $data = [
            'type' => ($extension === 'md') ? 'markdown' : 'note',
            'heading' => pathinfo(pathinfo($path, PATHINFO_FILENAME), PATHINFO_FILENAME),
            'tags' => '',
            'folder_path' => dirname($path)
        ];
        
        // Parse front matter for markdown files
        if ($extension === 'md' && preg_match('/^---\s*\n(.+?)\n---\s*\n/s', $content, $matches)) {
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
        
        $stmt = $this->con->prepare("
            INSERT INTO entries (heading, entry, type, tags, workspace, created, updated, trash, favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
        ");
        
        $stmt->execute([
            $noteData['heading'],
            $noteData['type'] === 'markdown' ? '' : $cleanContent,
            $noteData['type'],
            $noteData['tags'],
            $noteData['workspace'],
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
        
        $stmt = $this->con->prepare("
            UPDATE entries SET entry = ?, tags = ?, updated = ?
            WHERE id = ?
        ");
        
        $stmt->execute([
            $noteData['type'] === 'markdown' ? '' : $cleanContent,
            $noteData['tags'],
            $now,
            $noteId
        ]);
        
        // Update file
        $extension = ($noteData['type'] === 'markdown') ? 'md' : 'html';
        $filePath = $entriesPath . '/' . $noteId . '.' . $extension;
        file_put_contents($filePath, $cleanContent);
        
        return true;
    }
}
