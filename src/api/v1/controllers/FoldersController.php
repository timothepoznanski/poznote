<?php
/**
 * Folders Controller
 * 
 * Handles all folder-related API endpoints for the RESTful API.
 * 
 * Endpoints:
 *   GET    /api/v1/folders              - List all folders
 *   GET    /api/v1/folders/{id}         - Get a specific folder
 *   POST   /api/v1/folders              - Create a new folder
 *   PATCH  /api/v1/folders/{id}         - Update/rename a folder
 *   DELETE /api/v1/folders/{id}         - Delete a folder
 *   POST   /api/v1/folders/{id}/move    - Move folder to new parent
 *   POST   /api/v1/folders/{id}/empty   - Empty folder (move all notes to trash)
 *   PUT    /api/v1/folders/{id}/icon    - Update folder icon
 *   GET    /api/v1/folders/{id}/notes   - Get note count in folder
 *   GET    /api/v1/folders/{id}/path    - Get folder path (breadcrumb)
 *   GET    /api/v1/folders/counts       - Get note counts for all folders
 *   GET    /api/v1/folders/suggested    - Get suggested folders
 *   POST   /api/v1/folders/move-files   - Move all files from one folder to another
 *   POST   /api/v1/notes/{id}/folder    - Move note to folder (in NotesController)
 */

class FoldersController {
    private PDO $db;
    
    public function __construct(PDO $db) {
        $this->db = $db;
    }
    
    /**
     * Get the first workspace name if none provided
     */
    private function getFirstWorkspaceName(): string {
        if (function_exists('getFirstWorkspaceName')) {
            return getFirstWorkspaceName();
        }
        $stmt = $this->db->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? $row['name'] : '';
    }
    
    /**
     * Validate workspace exists
     */
    private function validateWorkspace(string $workspace): bool {
        if ($workspace === '') return true;
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
        $stmt->execute([$workspace]);
        return (int)$stmt->fetchColumn() > 0;
    }
    
    /**
     * Compute folder path
     */
    private function computeFolderPath(int $folderId, array $foldersById): ?string {
        if (!isset($foldersById[$folderId])) return null;
        
        $parts = [];
        $cur = $folderId;
        $depth = 0;
        $maxDepth = 50;
        
        while ($cur !== null && $depth < $maxDepth) {
            if (!isset($foldersById[$cur])) break;
            array_unshift($parts, $foldersById[$cur]['name']);
            $cur = $foldersById[$cur]['parent_id'];
            $depth++;
        }
        
        return implode('/', $parts);
    }
    
    /**
     * Build hierarchical folder structure
     */
    private function buildHierarchy(array $folders): array {
        $folderMap = [];
        $rootFolders = [];
        
        // Create a map of all folders by ID
        foreach ($folders as $folder) {
            $folder['children'] = [];
            $folderMap[$folder['id']] = $folder;
        }
        
        // Build the hierarchy
        foreach ($folderMap as $id => &$folder) {
            if ($folder['parent_id'] === null) {
                $rootFolders[] = &$folderMap[$id];
            } else {
                if (isset($folderMap[$folder['parent_id']])) {
                    $folderMap[$folder['parent_id']]['children'][] = &$folderMap[$id];
                }
            }
        }
        unset($folder);
        
        // Sort folders at each level alphabetically
        $sortFolders = function(&$folders) use (&$sortFolders) {
            usort($folders, function($a, $b) {
                return strcasecmp($a['name'], $b['name']);
            });
            
            foreach ($folders as &$folder) {
                if (!empty($folder['children'])) {
                    $sortFolders($folder['children']);
                }
            }
        };
        
        $sortFolders($rootFolders);
        
        return $rootFolders;
    }
    
    /**
     * Validate folder segment name
     */
    private function validateFolderSegment(string $segment): ?string {
        $segment = trim($segment);
        if ($segment === '') return 'Folder name is required';
        if (strlen($segment) > 255) return 'Folder name too long (max 255 characters)';
        
        $forbidden = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
        foreach ($forbidden as $char) {
            if (strpos($segment, $char) !== false) {
                return "Folder name contains forbidden character: $char";
            }
        }
        
        $reserved = ['Favorites', 'Tags', 'Trash', 'Public'];
        if (in_array($segment, $reserved, true)) {
            return 'Cannot create folder with reserved name: ' . $segment;
        }
        
        if ($segment === '.' || $segment === '..') {
            return 'Invalid folder name';
        }
        
        return null;
    }
    
    /**
     * Resolve folder path to ID
     */
    private function resolveFolderPathToId(string $workspace, string $folderPath): ?int {
        $folderPath = trim($folderPath);
        if ($folderPath === '') return null;
        
        $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
        if (empty($segments)) return null;
        
        $parentId = null;
        foreach ($segments as $seg) {
            $stmt = $this->db->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS ?');
            $stmt->execute([$seg, $workspace, $parentId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) return null;
            $parentId = (int)$row['id'];
        }
        
        return $parentId;
    }
    
    /**
     * Get all descendant folder IDs recursively
     */
    private function getAllFolderIds(int $folderId, ?string $workspace): array {
        $folderIds = [$folderId];
        
        if ($workspace !== null) {
            $stmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ? AND workspace = ?");
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ?");
            $stmt->execute([$folderId]);
        }
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folderIds = array_merge($folderIds, $this->getAllFolderIds((int)$row['id'], $workspace));
        }
        
        return $folderIds;
    }
    
    /**
     * Count notes in folder recursively
     */
    private function countNotesRecursive(int $folderId, ?string $workspace): int {
        $count = 0;
        
        if ($workspace !== null) {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM entries WHERE folder_id = ? AND trash = 0 AND workspace = ?");
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM entries WHERE folder_id = ? AND trash = 0");
            $stmt->execute([$folderId]);
        }
        $count += (int)$stmt->fetchColumn();
        
        if ($workspace !== null) {
            $subStmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ? AND workspace = ?");
            $subStmt->execute([$folderId, $workspace]);
        } else {
            $subStmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ?");
            $subStmt->execute([$folderId]);
        }
        
        while ($row = $subStmt->fetch(PDO::FETCH_ASSOC)) {
            $count += $this->countNotesRecursive((int)$row['id'], $workspace);
        }
        
        return $count;
    }
    
    /**
     * Count subfolders recursively
     */
    private function countSubfoldersRecursive(int $folderId, ?string $workspace): int {
        $count = 0;
        
        if ($workspace !== null) {
            $stmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ? AND workspace = ?");
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare("SELECT id FROM folders WHERE parent_id = ?");
            $stmt->execute([$folderId]);
        }
        
        $subfolders = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $count += count($subfolders);
        
        foreach ($subfolders as $row) {
            $count += $this->countSubfoldersRecursive((int)$row['id'], $workspace);
        }
        
        return $count;
    }
    
    /**
     * Send JSON response
     */
    private function sendJson(array $data, int $code = 200): void {
        http_response_code($code);
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
    }
    
    /**
     * Send error response
     */
    private function sendError(string $message, int $code = 400): void {
        $this->sendJson(['success' => false, 'error' => $message], $code);
    }
    
    /**
     * Get input data (from JSON body or form data)
     */
    private function getInputData(): array {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (strpos($contentType, 'application/json') !== false) {
            $json = file_get_contents('php://input');
            $data = json_decode($json, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return [];
            }
            return $data ?? [];
        }
        
        // Form data (both POST and parsed body)
        return $_POST;
    }
    
    // ========================================
    // API Endpoints
    // ========================================
    
    /**
     * GET /api/v1/folders - List all folders
     * 
     * Query params:
     *   - workspace: string (optional, defaults to first workspace)
     *   - hierarchical: bool (optional, default false)
     */
    public function index(): void {
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : $this->getFirstWorkspaceName();
        $hierarchical = isset($_GET['hierarchical']) && filter_var($_GET['hierarchical'], FILTER_VALIDATE_BOOLEAN);
        
        if (!$this->validateWorkspace($workspace)) {
            $this->sendError('Workspace not found', 404);
            return;
        }
        
        $stmt = $this->db->prepare('SELECT id, name, parent_id, icon, icon_color, created FROM folders WHERE workspace = ?');
        $stmt->execute([$workspace]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $foldersById = [];
        foreach ($rows as $r) {
            $id = (int)$r['id'];
            $foldersById[$id] = [
                'id' => $id,
                'name' => (string)$r['name'],
                'parent_id' => $r['parent_id'] !== null ? (int)$r['parent_id'] : null,
                'icon' => $r['icon'] ?? null,
                'icon_color' => $r['icon_color'] ?? null,
                'created' => $r['created'] ?? null,
            ];
        }
        
        if ($hierarchical) {
            $folders = [];
            foreach ($foldersById as $id => $f) {
                $folders[] = [
                    'id' => $f['id'],
                    'name' => $f['name'],
                    'parent_id' => $f['parent_id'],
                    'icon' => $f['icon'],
                    'icon_color' => $f['icon_color'],
                    'path' => $this->computeFolderPath($id, $foldersById),
                ];
            }

            $tree = $this->buildHierarchy($folders);

            $this->sendJson([
                'success' => true,
                'workspace' => $workspace,
                'hierarchical' => true,
                'folders' => $tree,
            ]);
        } else {
            $flat = [];
            foreach ($foldersById as $id => $f) {
                $flat[] = [
                    'id' => $f['id'],
                    'name' => $f['name'],
                    'parent_id' => $f['parent_id'],
                    'icon' => $f['icon'],
                    'icon_color' => $f['icon_color'],
                    'path' => $this->computeFolderPath($id, $foldersById),
                ];
            }
            
            usort($flat, fn($a, $b) => strcasecmp($a['path'] ?? '', $b['path'] ?? ''));
            
            $this->sendJson([
                'success' => true,
                'workspace' => $workspace,
                'hierarchical' => false,
                'folders' => $flat,
            ]);
        }
    }
    
    /**
     * GET /api/v1/folders/{id} - Get a specific folder
     */
    public function show(string $id): void {
        $folderId = (int)$id;
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        if ($workspace !== null) {
            $stmt = $this->db->prepare('SELECT id, name, parent_id, icon, icon_color, created, workspace FROM folders WHERE id = ? AND workspace = ?');
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare('SELECT id, name, parent_id, icon, icon_color, created, workspace FROM folders WHERE id = ?');
            $stmt->execute([$folderId]);
        }

        $folder = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$folder) {
            $this->sendError('Folder not found', 404);
            return;
        }

        // Get path
        $ws = $folder['workspace'] ?? '';
        $pathStmt = $this->db->prepare('SELECT id, name, parent_id FROM folders WHERE workspace = ?');
        $pathStmt->execute([$ws]);
        $allFolders = $pathStmt->fetchAll(PDO::FETCH_ASSOC);

        $foldersById = [];
        foreach ($allFolders as $r) {
            $fid = (int)$r['id'];
            $foldersById[$fid] = [
                'id' => $fid,
                'name' => (string)$r['name'],
                'parent_id' => $r['parent_id'] !== null ? (int)$r['parent_id'] : null,
            ];
        }

        $this->sendJson([
            'success' => true,
            'folder' => [
                'id' => (int)$folder['id'],
                'name' => $folder['name'],
                'parent_id' => $folder['parent_id'] !== null ? (int)$folder['parent_id'] : null,
                'icon' => $folder['icon'],
                'icon_color' => $folder['icon_color'],
                'workspace' => $folder['workspace'],
                'path' => $this->computeFolderPath($folderId, $foldersById),
                'created' => $folder['created'],
            ]
        ]);
    }
    
    /**
     * POST /api/v1/folders - Create a new folder
     * 
     * Body params:
     *   - folder_name: string (required unless folder_path provided)
     *   - folder_path: string (optional, creates full path)
     *   - workspace: string (optional)
     *   - parent_folder_id: int (optional)
     *   - parent_folder: string (optional, path to parent)
     *   - parent_folder_key: string (optional, "folder_123" format)
     *   - create_parents: bool (optional, for folder_path)
     */
    public function create(): void {
        $data = $this->getInputData();
        
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : $this->getFirstWorkspaceName();
        $folderPath = isset($data['folder_path']) ? trim((string)$data['folder_path']) : null;
        $createParents = isset($data['create_parents']) ? (bool)$data['create_parents'] : false;
        $folderName = isset($data['folder_name']) ? trim((string)$data['folder_name']) : (isset($data['name']) ? trim((string)$data['name']) : null);
        $parentFolder = isset($data['parent_folder']) ? trim((string)$data['parent_folder']) : null;
        $parentFolderId = $data['parent_folder_id'] ?? $data['parent_id'] ?? null;
        if ($parentFolderId !== null) $parentFolderId = (int)$parentFolderId;
        $parentFolderKey = isset($data['parent_folder_key']) ? trim((string)$data['parent_folder_key']) : null;
        
        // Validate workspace
        if (!$this->validateWorkspace($workspace)) {
            $this->sendError('Workspace not found', 404);
            return;
        }
        
        // Require either folder_path OR folder_name
        if (($folderPath === null || $folderPath === '') && ($folderName === null || $folderName === '')) {
            $this->sendError('folder_name or folder_path is required', 400);
            return;
        }
        
        // Path-based creation
        if ($folderPath !== null && $folderPath !== '') {
            $folderPath = trim($folderPath, "/ \t\n\r\0\x0B");
            $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
            
            if (empty($segments)) {
                $this->sendError('Invalid folder_path', 400);
                return;
            }
            
            $parentId = null;
            $finalFolderId = null;
            $finalName = null;
            $createdParents = [];
            $finalWasCreated = false;
            
            foreach ($segments as $idx => $seg) {
                $err = $this->validateFolderSegment($seg);
                if ($err !== null) {
                    $this->sendError($err, 400);
                    return;
                }
                
                $isLast = ($idx === count($segments) - 1);
                
                $findStmt = $this->db->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS ?');
                $findStmt->execute([$seg, $workspace, $parentId]);
                $existing = $findStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($existing) {
                    if ($isLast) {
                        $this->sendJson([
                            'success' => false,
                            'error' => 'Folder already exists',
                            'folder' => ['id' => (int)$existing['id']]
                        ], 409);
                        return;
                    }
                    $parentId = (int)$existing['id'];
                    continue;
                }
                
                if (!$createParents && !$isLast) {
                    $this->sendJson([
                        'success' => false,
                        'error' => 'Parent folder does not exist',
                        'missing_segment' => $seg
                    ], 404);
                    return;
                }
                
                $insertStmt = $this->db->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
                $ok = $insertStmt->execute([$seg, $workspace, $parentId]);
                if (!$ok) {
                    $this->sendError('Failed to insert folder', 500);
                    return;
                }
                
                $newId = (int)$this->db->lastInsertId();
                if (!$isLast) {
                    $createdParents[] = ['id' => $newId, 'name' => $seg, 'parent_id' => $parentId];
                }
                if ($isLast) {
                    $finalWasCreated = true;
                }
                
                $parentId = $newId;
                $finalFolderId = $newId;
                $finalName = $seg;
            }
            
            if (!$finalWasCreated) {
                $this->sendJson(['success' => false, 'error' => 'Folder already exists'], 409);
                return;
            }
            
            $this->sendJson([
                'success' => true,
                'message' => 'Folder created successfully',
                'folder' => [
                    'id' => $finalFolderId,
                    'name' => $finalName,
                    'workspace' => $workspace,
                    'parent_id' => $parentId !== $finalFolderId ? $parentId : null,
                    'path' => $folderPath
                ],
                'folder_id' => $finalFolderId,
                'folder_name' => $finalName,
                'created_parents' => $createdParents
            ], 201);
            return;
        }
        
        // Name + parent creation
        $err = $this->validateFolderSegment($folderName);
        if ($err !== null) {
            $this->sendError($err, 400);
            return;
        }
        
        // Resolve parent ID
        $parentId = null;
        
        // Handle parent_folder_key (e.g., "folder_123")
        if ($parentFolderKey !== null && strpos($parentFolderKey, 'folder_') === 0) {
            $parentId = (int)substr($parentFolderKey, 7);
            
            if ($workspace !== null) {
                $checkParent = $this->db->prepare("SELECT id FROM folders WHERE id = ? AND workspace = ?");
                $checkParent->execute([$parentId, $workspace]);
            } else {
                $checkParent = $this->db->prepare("SELECT id FROM folders WHERE id = ?");
                $checkParent->execute([$parentId]);
            }
            
            if (!$checkParent->fetch()) {
                $this->sendError('Parent folder not found', 404);
                return;
            }
        } elseif ($parentFolderId !== null && $parentFolderId > 0) {
            $checkParent = $this->db->prepare('SELECT id FROM folders WHERE id = ? AND workspace = ?');
            $checkParent->execute([$parentFolderId, $workspace]);
            if (!$checkParent->fetch(PDO::FETCH_ASSOC)) {
                $this->sendError('Parent folder not found', 404);
                return;
            }
            $parentId = $parentFolderId;
        } elseif ($parentFolder !== null && $parentFolder !== '') {
            $resolvedParent = $this->resolveFolderPathToId($workspace, $parentFolder);
            if ($resolvedParent === null) {
                $this->sendError('Parent folder not found', 404);
                return;
            }
            $parentId = $resolvedParent;
        }
        
        // Check for duplicate
        if ($parentId === null) {
            $checkStmt = $this->db->prepare('SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL');
            $checkStmt->execute([$folderName, $workspace]);
        } else {
            $checkStmt = $this->db->prepare('SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ? AND parent_id = ?');
            $checkStmt->execute([$folderName, $workspace, $parentId]);
        }
        
        if ((int)$checkStmt->fetchColumn() > 0) {
            $this->sendJson(['success' => false, 'error' => 'Folder already exists in this location'], 409);
            return;
        }
        
        // Create folder
        $stmt = $this->db->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
        $result = $stmt->execute([$folderName, $workspace, $parentId]);
        
        if (!$result) {
            $this->sendError('Failed to insert folder', 500);
            return;
        }
        
        $folderId = (int)$this->db->lastInsertId();
        
        $this->sendJson([
            'success' => true,
            'message' => 'Folder created successfully',
            'folder' => [
                'id' => $folderId,
                'name' => $folderName,
                'workspace' => $workspace,
                'parent_id' => $parentId,
            ],
            'folder_id' => $folderId,
            'folder_name' => $folderName,
            'parent_id' => $parentId
        ], 201);
    }
    
    /**
     * PATCH /api/v1/folders/{id} - Update/rename a folder
     */
    public function update(string $id): void {
        $folderId = (int)$id;
        $data = $this->getInputData();
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;
        
        // Get current folder
        if ($workspace !== null) {
            $stmt = $this->db->prepare("SELECT id, name, workspace FROM folders WHERE id = ? AND workspace = ?");
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare("SELECT id, name, workspace FROM folders WHERE id = ?");
            $stmt->execute([$folderId]);
        }
        
        $folder = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$folder) {
            $this->sendError('Folder not found', 404);
            return;
        }
        
        $oldName = $folder['name'];
        $ws = $workspace ?? $folder['workspace'];
        
        // Handle rename
        if (isset($data['name']) || isset($data['new_name'])) {
            $newName = trim($data['name'] ?? $data['new_name'] ?? '');
            
            if (empty($newName)) {
                $this->sendError('Folder name is required', 400);
                return;
            }
            
            // Don't allow renaming system folders
            if (in_array($oldName, ['Favorites', 'Tags', 'Trash', 'Public'])) {
                $this->sendError('Renaming system folders is not allowed', 400);
                return;
            }
            
            // Don't allow renaming TO reserved names
            if (in_array($newName, ['Favorites', 'Tags', 'Trash', 'Public'])) {
                $this->sendError('Cannot rename to reserved system folder name', 400);
                return;
            }
            
            // Check if target name exists
            if ($ws !== null) {
                $check = $this->db->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ? AND id != ?");
                $check->execute([$newName, $ws, $folderId]);
            } else {
                $check = $this->db->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND id != ?");
                $check->execute([$newName, $folderId]);
            }
            
            if ((int)$check->fetchColumn() > 0) {
                $this->sendError('Folder already exists in this workspace', 409);
                return;
            }
            
            // Update entries and folders table
            if ($ws !== null) {
                $stmt1 = $this->db->prepare("UPDATE entries SET folder = ? WHERE folder = ? AND workspace = ?");
                $stmt2 = $this->db->prepare("UPDATE folders SET name = ? WHERE id = ? AND workspace = ?");
                $stmt1->execute([$newName, $oldName, $ws]);
                $stmt2->execute([$newName, $folderId, $ws]);
            } else {
                $stmt1 = $this->db->prepare("UPDATE entries SET folder = ? WHERE folder = ?");
                $stmt2 = $this->db->prepare("UPDATE folders SET name = ? WHERE id = ?");
                $stmt1->execute([$newName, $oldName]);
                $stmt2->execute([$newName, $folderId]);
            }
            
            $this->sendJson([
                'success' => true,
                'message' => 'Folder renamed successfully',
                'folder' => [
                    'id' => $folderId,
                    'old_name' => $oldName,
                    'name' => $newName
                ]
            ]);
            return;
        }
        
        $this->sendError('No update parameters provided', 400);
    }
    
    /**
     * DELETE /api/v1/folders/{id} - Delete a folder
     */
    public function delete(string $id): void {
        $folderId = (int)$id;
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        // Get folder info and its actual workspace
        if ($workspace !== null) {
            $stmt = $this->db->prepare("SELECT id, name, workspace FROM folders WHERE id = ? AND workspace = ?");
            $stmt->execute([$folderId, $workspace]);
        } else {
            $stmt = $this->db->prepare("SELECT id, name, workspace FROM folders WHERE id = ?");
            $stmt->execute([$folderId]);
        }
        
        $folder = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$folder) {
            $this->sendError('Folder not found', 404);
            return;
        }
        
        $actualWorkspace = $folder['workspace'];
        
        // Get all folder IDs (including subfolders)
        $allFolderIds = $this->getAllFolderIds($folderId, $actualWorkspace);
        
        try {
            $this->db->beginTransaction();

            // Move all notes from this folder AND all subfolders to trash
            if (!empty($allFolderIds)) {
                $placeholders = implode(',', array_fill(0, count($allFolderIds), '?'));
                
                // Trashing by folder_id is reliable. 
                // We don't reset entries.folder (TEXT) because it's used for restoration, 
                // but repairDatabaseEntries is now modified to ignore trashed notes.
                $query = "UPDATE entries SET trash = 1 WHERE folder_id IN ($placeholders) AND workspace = ?";
                $stmt = $this->db->prepare($query);
                $stmt->execute(array_merge($allFolderIds, [$actualWorkspace]));
            }
            
            // Explicitly delete ALL folders in the hierarchy to be safe (regardless of CASCADE)
            if (!empty($allFolderIds)) {
                $placeholders = implode(',', array_fill(0, count($allFolderIds), '?'));
                $delStmt = $this->db->prepare("DELETE FROM folders WHERE id IN ($placeholders) AND workspace = ?");
                $delStmt->execute(array_merge($allFolderIds, [$actualWorkspace]));
            } else {
                // Fallback for the main folder if something went wrong with recursion
                $delStmt = $this->db->prepare("DELETE FROM folders WHERE id = ? AND workspace = ?");
                $delStmt->execute([$folderId, $actualWorkspace]);
            }
            
            $this->db->commit();

            $this->sendJson([
                'success' => true,
                'message' => 'Folder and all subfolders deleted successfully'
            ]);
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            $this->sendError('Failed to delete folder: ' . $e->getMessage(), 500);
        }
    }
    
    /**
     * POST /api/v1/folders/{id}/move - Move folder to new parent
     */
    public function move(string $id): void {
        $folderId = (int)$id;
        $data = $this->getInputData();
        
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;
        $newParentId = $data['new_parent_folder_id'] ?? $data['new_parent_id'] ?? $data['parent_id'] ?? null;
        if ($newParentId !== null) $newParentId = (int)$newParentId;
        $newParentPath = isset($data['new_parent_folder']) ? trim((string)$data['new_parent_folder']) : null;
        
        // Get folder info
        $stmt = $this->db->prepare('SELECT id, name, workspace, parent_id FROM folders WHERE id = ?');
        $stmt->execute([$folderId]);
        $folder = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$folder) {
            $this->sendError('Folder not found', 404);
            return;
        }
        
        if ($workspace === null || $workspace === '') {
            $workspace = (string)$folder['workspace'];
        }
        
        // Validate workspace
        if (!$this->validateWorkspace($workspace)) {
            $this->sendError('Workspace not found', 404);
            return;
        }
        
        $folderName = (string)$folder['name'];
        
        // Resolve target parent
        $targetParentId = null;
        if ($newParentId !== null) {
            if ((int)$newParentId > 0) {
                $pStmt = $this->db->prepare('SELECT id, workspace FROM folders WHERE id = ?');
                $pStmt->execute([(int)$newParentId]);
                $pRow = $pStmt->fetch(PDO::FETCH_ASSOC);
                if (!$pRow) {
                    $this->sendError('New parent folder not found', 404);
                    return;
                }
                if ((string)$pRow['workspace'] !== $workspace) {
                    $this->sendError('New parent folder must be in the same workspace', 400);
                    return;
                }
                $targetParentId = (int)$pRow['id'];
            }
        } elseif ($newParentPath !== null && $newParentPath !== '') {
            $resolvedParent = $this->resolveFolderPathToId($workspace, $newParentPath);
            if ($resolvedParent === null) {
                $this->sendError('New parent folder not found', 404);
                return;
            }
            $targetParentId = $resolvedParent;
        }
        
        // Prevent moving folder to itself
        if ($targetParentId !== null && $targetParentId === $folderId) {
            $this->sendError('Folder cannot be its own parent', 400);
            return;
        }
        
        // Prevent cycles
        if ($targetParentId !== null) {
            $cur = $targetParentId;
            $depth = 0;
            while ($cur !== null && $depth < 50) {
                if ($cur === $folderId) {
                    $this->sendError('Invalid move: would create a cycle', 409);
                    return;
                }
                $q = $this->db->prepare('SELECT parent_id FROM folders WHERE id = ?');
                $q->execute([$cur]);
                $curParent = $q->fetchColumn();
                $cur = ($curParent !== null) ? (int)$curParent : null;
                $depth++;
            }
        }
        
        // Check uniqueness under target parent
        if ($targetParentId === null) {
            $cStmt = $this->db->prepare('SELECT COUNT(*) FROM folders WHERE workspace = ? AND parent_id IS NULL AND name = ? AND id != ?');
            $cStmt->execute([$workspace, $folderName, $folderId]);
        } else {
            $cStmt = $this->db->prepare('SELECT COUNT(*) FROM folders WHERE workspace = ? AND parent_id = ? AND name = ? AND id != ?');
            $cStmt->execute([$workspace, $targetParentId, $folderName, $folderId]);
        }
        
        if ((int)$cStmt->fetchColumn() > 0) {
            $this->sendError('A folder with this name already exists in the destination', 409);
            return;
        }
        
        // Update folder
        $uStmt = $this->db->prepare('UPDATE folders SET parent_id = ? WHERE id = ?');
        $uStmt->execute([$targetParentId, $folderId]);
        
        // Compute new path
        $pathStmt = $this->db->prepare('SELECT id, name, parent_id FROM folders WHERE workspace = ?');
        $pathStmt->execute([$workspace]);
        $rows = $pathStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $byId = [];
        foreach ($rows as $r) {
            $rid = (int)$r['id'];
            $byId[$rid] = [
                'id' => $rid,
                'name' => (string)$r['name'],
                'parent_id' => $r['parent_id'] !== null ? (int)$r['parent_id'] : null,
            ];
        }
        
        $this->sendJson([
            'success' => true,
            'message' => 'Folder moved successfully',
            'folder' => [
                'id' => $folderId,
                'name' => $folderName,
                'workspace' => $workspace,
                'parent_id' => $targetParentId,
                'path' => $this->computeFolderPath($folderId, $byId),
            ]
        ]);
    }
    
    /**
     * POST /api/v1/folders/{id}/empty - Empty folder (move notes to trash)
     */
    public function empty(string $id): void {
        $folderId = (int)$id;
        $data = $this->getInputData();
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;
        
        if ($workspace !== null) {
            $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0 AND workspace = ?";
            $stmt = $this->db->prepare($query);
            $stmt->execute([$folderId, $workspace]);
        } else {
            $query = "UPDATE entries SET trash = 1 WHERE folder_id = ? AND trash = 0";
            $stmt = $this->db->prepare($query);
            $stmt->execute([$folderId]);
        }
        
        $affected = $stmt->rowCount();
        
        $this->sendJson([
            'success' => true,
            'message' => "Moved $affected notes to trash"
        ]);
    }
    
    /**
     * PUT /api/v1/folders/{id}/icon - Update folder icon
     */
    public function updateIcon(string $id): void {
        $folderId = (int)$id;
        $data = $this->getInputData();
        $icon = trim($data['icon'] ?? '');
        $iconColor = trim($data['icon_color'] ?? '');

        if ($folderId <= 0) {
            $this->sendError('Invalid folder ID', 400);
            return;
        }

        $iconValue = $icon === '' ? null : $icon;
        $iconColorValue = $iconColor === '' ? null : $iconColor;

        $stmt = $this->db->prepare("UPDATE folders SET icon = ?, icon_color = ? WHERE id = ?");
        $success = $stmt->execute([$iconValue, $iconColorValue, $folderId]);

        if ($success) {
            $this->sendJson([
                'success' => true,
                'message' => 'Folder icon updated successfully',
                'icon' => $iconValue,
                'icon_color' => $iconColorValue
            ]);
        } else {
            $this->sendError('Database error', 500);
        }
    }
    
    /**
     * GET /api/v1/folders/{id}/notes - Get note count in folder
     */
    public function noteCount(string $id): void {
        $folderId = (int)$id;
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        $totalCount = $this->countNotesRecursive($folderId, $workspace);
        $subfolderCount = $this->countSubfoldersRecursive($folderId, $workspace);
        
        $this->sendJson([
            'success' => true,
            'count' => $totalCount,
            'subfolder_count' => $subfolderCount
        ]);
    }
    
    /**
     * GET /api/v1/folders/{id}/path - Get folder path
     */
    public function path(string $id): void {
        $folderId = (int)$id;
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        // Build path
        $path = [];
        $currentId = $folderId;
        $depth = 0;
        
        while ($currentId !== null && $depth < 10) {
            if ($workspace !== null) {
                $stmt = $this->db->prepare("SELECT name, parent_id FROM folders WHERE id = ? AND workspace = ?");
                $stmt->execute([$currentId, $workspace]);
            } else {
                $stmt = $this->db->prepare("SELECT name, parent_id FROM folders WHERE id = ?");
                $stmt->execute([$currentId]);
            }
            
            $folder = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folder) break;
            
            array_unshift($path, $folder['name']);
            $currentId = $folder['parent_id'] ? (int)$folder['parent_id'] : null;
            $depth++;
        }
        
        $this->sendJson([
            'success' => true,
            'path' => implode('/', $path),
            'depth' => $depth
        ]);
    }
    
    /**
     * GET /api/v1/folders/counts - Get note counts for all folders
     */
    public function counts(): void {
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        // Get all folders
        $foldersQuery = "SELECT id, parent_id FROM folders";
        if ($workspace !== null) {
            $foldersQuery .= " WHERE workspace = ?";
            $stmt = $this->db->prepare($foldersQuery);
            $stmt->execute([$workspace]);
        } else {
            $stmt = $this->db->query($foldersQuery);
        }
        
        $folderHierarchy = [];
        while ($folder = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folderHierarchy[(int)$folder['id']] = $folder['parent_id'] !== null ? (int)$folder['parent_id'] : null;
        }
        
        // Get descendants function
        $getDescendants = function($folderId) use (&$getDescendants, $folderHierarchy) {
            $descendants = [$folderId];
            foreach ($folderHierarchy as $id => $parentId) {
                if ($parentId === $folderId) {
                    $descendants = array_merge($descendants, $getDescendants($id));
                }
            }
            return $descendants;
        };
        
        // Get counts
        $counts = [];
        foreach (array_keys($folderHierarchy) as $folderId) {
            $allFolderIds = $getDescendants($folderId);
            $placeholders = implode(',', array_fill(0, count($allFolderIds), '?'));
            
            $query = "SELECT COUNT(*) FROM entries WHERE trash = 0 AND folder_id IN ($placeholders)";
            if ($workspace !== null) {
                $query .= " AND workspace = ?";
                $params = array_merge($allFolderIds, [$workspace]);
            } else {
                $params = $allFolderIds;
            }
            
            $countStmt = $this->db->prepare($query);
            $countStmt->execute($params);
            $counts[$folderId] = (int)$countStmt->fetchColumn();
        }
        
        // Get uncategorized count
        $uncategorizedQuery = "SELECT COUNT(*) FROM entries WHERE trash = 0 AND folder_id IS NULL";
        if ($workspace !== null) {
            $uncategorizedQuery .= " AND workspace = ?";
            $uncatStmt = $this->db->prepare($uncategorizedQuery);
            $uncatStmt->execute([$workspace]);
        } else {
            $uncatStmt = $this->db->query($uncategorizedQuery);
        }
        $counts['uncategorized'] = (int)$uncatStmt->fetchColumn();
        
        // Get favorites count
        $favoriteQuery = "SELECT COUNT(*) FROM entries WHERE trash = 0 AND favorite = 1";
        if ($workspace !== null) {
            $favoriteQuery .= " AND workspace = ?";
            $favStmt = $this->db->prepare($favoriteQuery);
            $favStmt->execute([$workspace]);
        } else {
            $favStmt = $this->db->query($favoriteQuery);
        }
        $counts['Favorites'] = (int)$favStmt->fetchColumn();
        
        $this->sendJson(['success' => true, 'counts' => $counts]);
    }
    
    /**
     * GET /api/v1/folders/suggested - Get suggested folders
     */
    public function suggested(): void {
        $workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : null;
        
        $suggestedFolders = [];
        
        // Get recently used folders
        $recentQuery = "SELECT e.folder_id, f.name, MAX(e.updated) as last_used 
                        FROM entries e 
                        LEFT JOIN folders f ON e.folder_id = f.id 
                        WHERE e.folder_id IS NOT NULL AND e.trash = 0";
        if ($workspace !== null) {
            $recentQuery .= " AND e.workspace = ?";
        }
        $recentQuery .= " GROUP BY e.folder_id ORDER BY last_used DESC LIMIT 5";
        
        if ($workspace !== null) {
            $recentStmt = $this->db->prepare($recentQuery);
            $recentStmt->execute([$workspace]);
        } else {
            $recentStmt = $this->db->query($recentQuery);
        }
        
        while ($row = $recentStmt->fetch(PDO::FETCH_ASSOC)) {
            $suggestedFolders[] = [
                'id' => (int)$row['folder_id'],
                'name' => $row['name'] ?: 'Unknown'
            ];
        }
        
        // If not enough, add popular folders
        if (count($suggestedFolders) < 5) {
            $popularQuery = "SELECT e.folder_id, f.name, COUNT(*) as count 
                            FROM entries e 
                            LEFT JOIN folders f ON e.folder_id = f.id 
                            WHERE e.folder_id IS NOT NULL AND e.trash = 0";
            if ($workspace !== null) {
                $popularQuery .= " AND e.workspace = ?";
            }
            $popularQuery .= " GROUP BY e.folder_id ORDER BY count DESC LIMIT 5";
            
            if ($workspace !== null) {
                $popularStmt = $this->db->prepare($popularQuery);
                $popularStmt->execute([$workspace]);
            } else {
                $popularStmt = $this->db->query($popularQuery);
            }
            
            while ($row = $popularStmt->fetch(PDO::FETCH_ASSOC)) {
                $fid = (int)$row['folder_id'];
                $alreadyAdded = false;
                foreach ($suggestedFolders as $sf) {
                    if ($sf['id'] === $fid) {
                        $alreadyAdded = true;
                        break;
                    }
                }
                
                if (!$alreadyAdded && count($suggestedFolders) < 5) {
                    $suggestedFolders[] = [
                        'id' => $fid,
                        'name' => $row['name'] ?: 'Unknown'
                    ];
                }
            }
        }
        
        $this->sendJson(['success' => true, 'folders' => $suggestedFolders]);
    }
    
    /**
     * POST /api/v1/folders/move-files - Move all files from one folder to another
     */
    public function moveFiles(): void {
        $data = $this->getInputData();
        
        $sourceFolderId = isset($data['source_folder_id']) ? (int)$data['source_folder_id'] : null;
        $targetFolderId = isset($data['target_folder_id']) ? (int)$data['target_folder_id'] : null;
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : '';
        
        if (empty($workspace)) {
            $workspace = $this->getFirstWorkspaceName();
        }
        
        if ($sourceFolderId === null || $sourceFolderId === 0) {
            $this->sendError('Source folder ID is required', 400);
            return;
        }
        
        if ($targetFolderId === null) {
            $this->sendError('Target folder ID is required', 400);
            return;
        }
        
        if ($sourceFolderId === $targetFolderId) {
            $this->sendError('Source and target folders cannot be the same', 400);
            return;
        }
        
        // Verify source folder exists
        $folderStmt = $this->db->prepare("SELECT name FROM folders WHERE id = ?");
        $folderStmt->execute([$sourceFolderId]);
        $sourceFolderData = $folderStmt->fetch(PDO::FETCH_ASSOC);
        if (!$sourceFolderData) {
            $this->sendError('Source folder not found', 404);
            return;
        }
        
        // Handle "No folder" target (id = 0)
        $targetFolderName = null;
        if ($targetFolderId !== 0) {
            $targetStmt = $this->db->prepare("SELECT name, workspace FROM folders WHERE id = ?");
            $targetStmt->execute([$targetFolderId]);
            $targetFolderData = $targetStmt->fetch(PDO::FETCH_ASSOC);
            if (!$targetFolderData) {
                $this->sendError('Target folder not found', 404);
                return;
            }
            if ($targetFolderData['workspace'] !== $workspace) {
                $this->sendError('Target folder belongs to a different workspace', 400);
                return;
            }
            $targetFolderName = $targetFolderData['name'];
        }
        
        // Get notes in source folder
        $sql = "SELECT id FROM entries WHERE trash = 0 AND folder_id = ?";
        $params = [$sourceFolderId];
        if (!empty($workspace)) {
            $sql .= " AND workspace = ?";
            $params[] = $workspace;
        }
        
        $notesStmt = $this->db->prepare($sql);
        $notesStmt->execute($params);
        $notes = $notesStmt->fetchAll(PDO::FETCH_ASSOC);
        
        if (empty($notes)) {
            $this->sendError('No files found in source folder', 400);
            return;
        }
        
        // Move notes
        $movedCount = 0;
        if ($targetFolderId === 0) {
            $updateStmt = $this->db->prepare("UPDATE entries SET folder_id = NULL, folder = NULL, updated = CURRENT_TIMESTAMP WHERE id = ?");
        } else {
            $updateStmt = $this->db->prepare("UPDATE entries SET folder_id = ?, folder = ?, updated = CURRENT_TIMESTAMP WHERE id = ?");
        }
        
        foreach ($notes as $note) {
            if ($targetFolderId === 0) {
                if ($updateStmt->execute([$note['id']])) {
                    $movedCount++;
                }
            } else {
                if ($updateStmt->execute([$targetFolderId, $targetFolderName, $note['id']])) {
                    $movedCount++;
                }
            }
        }
        
        // Check if source folder was shared (to unshare all moved notes)
        $shareDelta = 0;
        $sourceSharedStmt = $this->db->prepare("SELECT id FROM shared_folders WHERE folder_id = ? LIMIT 1");
        $sourceSharedStmt->execute([$sourceFolderId]);
        $sourceWasShared = $sourceSharedStmt->fetchColumn() !== false;
        
        if ($sourceWasShared && $sourceFolderId != $targetFolderId) {
            // Source folder was shared, remove shares from moved notes
            foreach ($notes as $note) {
                // Check if note was actually shared before deleting
                $checkSharedStmt = $this->db->prepare("SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1");
                $checkSharedStmt->execute([$note['id']]);
                if ($checkSharedStmt->fetchColumn()) {
                    $deleteShareStmt = $this->db->prepare("DELETE FROM shared_notes WHERE note_id = ?");
                    $deleteShareStmt->execute([$note['id']]);
                    $shareDelta--;
                }
            }
        }
        
        // If target folder is shared, auto-share all moved notes
        if ($targetFolderId > 0) {
            $sharedFolderStmt = $this->db->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
            $sharedFolderStmt->execute([$targetFolderId]);
            $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($sharedFolder) {
                foreach ($notes as $note) {
                    // Check if note is already shared
                    $checkSharedStmt = $this->db->prepare("SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1");
                    $checkSharedStmt->execute([$note['id']]);
                    
                    if (!$checkSharedStmt->fetchColumn()) {
                        // Create share for this note
                        $noteToken = bin2hex(random_bytes(16));
                        $insertShareStmt = $this->db->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                        $insertShareStmt->execute([$note['id'], $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
                        $shareDelta++;
                    }
                }
            }
        }
        
        $this->sendJson([
            'success' => true,
            'message' => "Moved $movedCount files successfully",
            'moved_count' => $movedCount,
            'share_delta' => $shareDelta
        ]);
    }
    
    /**
     * POST /api/v1/notes/{id}/folder - Move a note to a folder
     * This is called from NotesController as moveToFolder
     */
    public function moveNoteToFolder(string $noteId): void {
        $data = $this->getInputData();
        
        $targetFolderId = $data['folder_id'] ?? $data['parent_id'] ?? null;
        if ($targetFolderId !== null) {
            $targetFolderId = ($targetFolderId === '' ? null : (int)$targetFolderId);
        }
        $targetFolder = $data['folder'] ?? $data['target_folder'] ?? null;
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;
        
        // Get current note info
        $checkStmt = $this->db->prepare("SELECT id, heading, folder, folder_id, workspace FROM entries WHERE id = ?");
        $checkStmt->execute([$noteId]);
        $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$currentNote) {
            $this->sendError('Note not found', 404);
            return;
        }
        
        // If folder_id is 0 or empty, move to root
        if ($targetFolderId === null || $targetFolderId === 0) {
            $targetFolder = null;
            $targetFolderId = null;
        } elseif ($targetFolderId > 0) {
            // Get folder name
            if ($workspace) {
                $stmt = $this->db->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
                $stmt->execute([$targetFolderId, $workspace]);
            } else {
                $stmt = $this->db->prepare("SELECT name FROM folders WHERE id = ?");
                $stmt->execute([$targetFolderId]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folderData) {
                $this->sendError('Folder not found', 404);
                return;
            }
            $targetFolder = $folderData['name'];
        } elseif ($targetFolder !== null) {
            // Get folder ID from name
            if ($workspace) {
                $stmt = $this->db->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                $stmt->execute([$targetFolder, $workspace]);
            } else {
                $stmt = $this->db->prepare("SELECT id FROM folders WHERE name = ?");
                $stmt->execute([$targetFolder]);
            }
            $folderData = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $targetFolderId = (int)$folderData['id'];
            } else {
                // Create folder if it doesn't exist
                $createStmt = $this->db->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                $createStmt->execute([$targetFolder, $workspace]);
                $targetFolderId = (int)$this->db->lastInsertId();
            }
        }
        
        // Check for duplicate heading in target folder
        $targetWorkspace = $workspace ?? $currentNote['workspace'];
        $duplicateCheckQuery = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ?";
        $duplicateCheckParams = [$currentNote['heading'], $noteId];
        
        if ($targetFolderId !== null) {
            $duplicateCheckQuery .= " AND folder_id = ?";
            $duplicateCheckParams[] = $targetFolderId;
        } else {
            $duplicateCheckQuery .= " AND folder_id IS NULL";
        }
        
        if ($targetWorkspace !== null) {
            $duplicateCheckQuery .= " AND workspace = ?";
            $duplicateCheckParams[] = $targetWorkspace;
        }
        
        $duplicateCheckStmt = $this->db->prepare($duplicateCheckQuery);
        $duplicateCheckStmt->execute($duplicateCheckParams);
        
        if ($duplicateCheckStmt->fetchColumn() > 0) {
            $this->sendError('A note with the same title already exists in the destination folder', 409);
            return;
        }
        
        // Update note
        if ($workspace) {
            $query = "UPDATE entries SET folder = ?, folder_id = ?, workspace = ?, updated = datetime('now') WHERE id = ?";
            $stmt = $this->db->prepare($query);
            $success = $stmt->execute([$targetFolder, $targetFolderId, $workspace, $noteId]);
        } else {
            $query = "UPDATE entries SET folder = ?, folder_id = ?, updated = datetime('now') WHERE id = ?";
            $stmt = $this->db->prepare($query);
            $success = $stmt->execute([$targetFolder, $targetFolderId, $noteId]);
        }
        
        if ($success) {
            $shareDelta = 0; // Track share count change: +1 if shared, -1 if unshared
            
            // Check if the OLD folder was shared (to unshare the note)
            $oldFolderId = $currentNote['folder_id'];
            if ($oldFolderId && $oldFolderId != $targetFolderId) {
                $oldSharedFolderStmt = $this->db->prepare("SELECT id FROM shared_folders WHERE folder_id = ? LIMIT 1");
                $oldSharedFolderStmt->execute([$oldFolderId]);
                
                if ($oldSharedFolderStmt->fetchColumn()) {
                    // Check if note was actually shared
                    $checkWasSharedStmt = $this->db->prepare("SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1");
                    $checkWasSharedStmt->execute([$noteId]);
                    if ($checkWasSharedStmt->fetchColumn()) {
                        // Old folder was shared, remove the share from this note
                        $deleteShareStmt = $this->db->prepare("DELETE FROM shared_notes WHERE note_id = ?");
                        $deleteShareStmt->execute([$noteId]);
                        $shareDelta = -1;
                    }
                }
            }
            
            // If target folder is shared, auto-share the note
            if ($targetFolderId !== null) {
                $sharedFolderStmt = $this->db->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
                $sharedFolderStmt->execute([$targetFolderId]);
                $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($sharedFolder) {
                    // Check if note is already shared
                    $checkSharedStmt = $this->db->prepare("SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1");
                    $checkSharedStmt->execute([$noteId]);
                    
                    if (!$checkSharedStmt->fetchColumn()) {
                        // Create share for this note
                        $noteToken = bin2hex(random_bytes(16));
                        $insertShareStmt = $this->db->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                        $insertShareStmt->execute([$noteId, $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
                        $shareDelta = 1; // Note was newly shared
                    }
                }
            }
            
            $this->sendJson([
                'success' => true,
                'message' => 'Note moved successfully',
                'old_folder' => $currentNote['folder'],
                'old_folder_id' => $currentNote['folder_id'],
                'new_folder' => $targetFolder,
                'new_folder_id' => $targetFolderId,
                'old_workspace' => $currentNote['workspace'],
                'new_workspace' => $workspace,
                'share_delta' => $shareDelta
            ]);
        } else {
            $this->sendError('Database error', 500);
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/remove-folder - Remove note from folder (move to root)
     */
    public function removeNoteFromFolder(string $noteId): void {
        $data = $this->getInputData();
        $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;
        
        // Get current note info
        $checkStmt = $this->db->prepare("SELECT heading, folder_id, workspace FROM entries WHERE id = ?");
        $checkStmt->execute([$noteId]);
        $currentNote = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$currentNote) {
            $this->sendError('Note not found', 404);
            return;
        }
        
        // Check for duplicate at root
        $duplicateCheckQuery = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ? AND folder_id IS NULL";
        $duplicateCheckParams = [$currentNote['heading'], $noteId];
        
        if ($workspace !== null) {
            $duplicateCheckQuery .= " AND workspace = ?";
            $duplicateCheckParams[] = $workspace;
        } elseif ($currentNote['workspace'] !== null) {
            $duplicateCheckQuery .= " AND workspace = ?";
            $duplicateCheckParams[] = $currentNote['workspace'];
        }
        
        $duplicateCheckStmt = $this->db->prepare($duplicateCheckQuery);
        $duplicateCheckStmt->execute($duplicateCheckParams);
        
        if ($duplicateCheckStmt->fetchColumn() > 0) {
            $this->sendError('A note with the same title already exists at the root level', 409);
            return;
        }
        
        // Move to root
        $query = "UPDATE entries SET folder = NULL, folder_id = NULL, updated = datetime('now') WHERE id = ?";
        $stmt = $this->db->prepare($query);
        $success = $stmt->execute([$noteId]);
        
        if ($success) {
            $shareDelta = 0;
            
            // If old folder was shared, unshare the note
            $oldFolderId = $currentNote['folder_id'];
            if ($oldFolderId) {
                $sharedFolderStmt = $this->db->prepare("SELECT id FROM shared_folders WHERE folder_id = ? LIMIT 1");
                $sharedFolderStmt->execute([$oldFolderId]);
                
                if ($sharedFolderStmt->fetchColumn()) {
                    // Check if note was actually shared
                    $checkWasSharedStmt = $this->db->prepare("SELECT id FROM shared_notes WHERE note_id = ? LIMIT 1");
                    $checkWasSharedStmt->execute([$noteId]);
                    if ($checkWasSharedStmt->fetchColumn()) {
                        $deleteShareStmt = $this->db->prepare("DELETE FROM shared_notes WHERE note_id = ?");
                        $deleteShareStmt->execute([$noteId]);
                        $shareDelta = -1;
                    }
                }
            }
            
            $this->sendJson([
                'success' => true,
                'message' => 'Note removed from folder successfully',
                'share_delta' => $shareDelta
            ]);
        } else {
            $this->sendError('Database error', 500);
        }
    }
}
