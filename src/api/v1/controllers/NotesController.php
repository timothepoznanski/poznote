<?php
/**
 * Notes Controller for Poznote REST API v1
 * 
 * Handles all CRUD operations for notes.
 */

class NotesController {
    private PDO $con;
    
    public function __construct(PDO $con) {
        $this->con = $con;
    }
    
    /**
     * GET /api/v1/notes
     * List all notes with optional filtering
     * 
     * Query params:
     *   - workspace: Filter by workspace name
     *   - folder: Filter by folder name
     *   - folder_id: Filter by folder ID
     *   - sort: Sort order (updated_desc, created_desc, heading_asc)
     *   - get_folders: If set, return folders instead of notes
     *   - search: Search query to filter notes by heading or content
     */
    public function index(): void {
        $workspace = $_GET['workspace'] ?? null;
        $folder = $_GET['folder'] ?? null;
        $folderId = $_GET['folder_id'] ?? null;
        $getFolders = $_GET['get_folders'] ?? null;
        $sort = $_GET['sort'] ?? null;
        $favorite = isset($_GET['favorite']) ? (int)$_GET['favorite'] : null;
        $search = $_GET['search'] ?? null;
        
        try {
            // Validate workspace if provided
            if ($workspace) {
                $chk = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $chk->execute([$workspace]);
                if ((int)$chk->fetchColumn() === 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // If get_folders is set, return folders list
            if ($getFolders) {
                $this->listFolders($workspace);
                return;
            }
            
            // Build query for notes
            $sql = "SELECT id, heading, type, tags, folder, folder_id, workspace, updated, created FROM entries WHERE trash = 0";
            $params = [];
            
            if ($workspace) {
                $sql .= " AND workspace = ?";
                $params[] = $workspace;
            }
            
            if ($folder) {
                $sql .= " AND folder = ?";
                $params[] = $folder;
            }
            
            if ($folderId) {
                $sql .= " AND folder_id = ?";
                $params[] = $folderId;
            }

            if ($favorite !== null) {
                $sql .= " AND favorite = ?";
                $params[] = $favorite;
            }
            
            // Add search filter if provided
            if ($search !== null && $search !== '') {
                $sql .= " AND (remove_accents(heading) LIKE remove_accents(?) 
                         OR remove_accents(search_clean_entry(entry)) LIKE remove_accents(?))";
                $params[] = '%' . $search . '%';
                $params[] = '%' . $search . '%';
            }
            
            // Handle sorting
            $notes_without_folders_after = false;
            try {
                $stmtSetting = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmtSetting->execute(['notes_without_folders_after_folders']);
                $settingValue = $stmtSetting->fetchColumn();
                $notes_without_folders_after = ($settingValue === '1' || $settingValue === 'true');
            } catch (Exception $e) {
                // ignore
            }
            
            $folder_null_case = $notes_without_folders_after ? '1' : '0';
            $folder_case = $notes_without_folders_after ? '0' : '1';
            
            $allowed = [
                'updated_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, updated DESC",
                'created_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, created DESC",
                'heading_asc'  => 'folder, heading COLLATE NOCASE ASC'
            ];
            
            $order_by = $allowed['updated_desc'];
            
            if ($sort && isset($allowed[$sort])) {
                $order_by = $allowed[$sort];
            } else if (!$sort) {
                try {
                    $stmtPref = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                    $stmtPref->execute(['note_list_sort']);
                    $pref = $stmtPref->fetchColumn();
                    if ($pref && isset($allowed[$pref])) {
                        $order_by = $allowed[$pref];
                    }
                } catch (Exception $e) {
                    // ignore
                }
            }
            
            $sql .= " ORDER BY " . $order_by;
            
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            
            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $notes[] = $row;
            }
            
            $this->sendSuccess(['notes' => $notes]);
            
        } catch (Exception $e) {
            error_log("Error in NotesController::index: " . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * Helper to list folders (used when get_folders param is set)
     */
    private function listFolders(?string $workspace): void {
        $sql = "SELECT id, name, parent_id FROM folders";
        $params = [];
        
        if ($workspace) {
            $sql .= " WHERE workspace = ?";
            $params[] = $workspace;
        }
        
        $sql .= " ORDER BY name";
        
        $stmt = $this->con->prepare($sql);
        $stmt->execute($params);
        
        $folderData = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['id'];
            $folderData[$folderId] = [
                'id' => $folderId,
                'name' => $row['name'],
                'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null
            ];
        }
        
        // Build folder paths recursively
        $folders = [];
        foreach ($folderData as $folderId => $folder) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folder['name'],
                'path' => $this->buildFolderPath($folderId, $folderData)
            ];
        }
        
        echo json_encode(['success' => true, 'folders' => $folders], JSON_FORCE_OBJECT);
    }
    
    /**
     * Build folder path recursively
     */
    private function buildFolderPath(int $folderId, array $folderData): string {
        if (!isset($folderData[$folderId])) {
            return '';
        }
        $folder = $folderData[$folderId];
        if ($folder['parent_id']) {
            $parentPath = $this->buildFolderPath($folder['parent_id'], $folderData);
            return $parentPath . '/' . $folder['name'];
        }
        return $folder['name'];
    }
    
    /**
     * GET /api/v1/notes/{id}
     * Get a specific note with its content
     * 
     * Query params:
     *   - workspace: Optional workspace filter
     *   - reference: Alternative to ID - search by title
     */
    public function show(string $id): void {
        $workspace = $_GET['workspace'] ?? null;
        $reference = $_GET['reference'] ?? null;
        
        // If ID is not numeric and reference isn't provided, treat ID as reference
        if (!is_numeric($id) && $reference === null) {
            $reference = $id;
            $id = null;
        }
        
        try {
            $row = null;
            $useWorkspaceFilter = ($workspace !== null && $workspace !== '');
            
            if ($id !== null && is_numeric($id)) {
                $noteId = (int)$id;
                if ($useWorkspaceFilter) {
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
                    $stmt->execute([$noteId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated FROM entries WHERE id = ? AND trash = 0");
                    $stmt->execute([$noteId]);
                }
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
            } else {
                // Reference-based lookup requires workspace
                if (!$useWorkspaceFilter) {
                    $this->sendError(400, 'workspace is required when using reference');
                    return;
                }
                
                $reference = trim((string)$reference);
                
                if (is_numeric($reference)) {
                    $refId = (int)$reference;
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
                    $stmt->execute([$refId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) AND workspace = ? ORDER BY updated DESC LIMIT 1");
                    $stmt->execute(['%' . $reference . '%', $workspace]);
                }
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
            }
            
            if (!$row) {
                $this->sendError(404, 'Note not found or has been deleted');
                return;
            }
            
            $noteType = !empty($row['type']) ? $row['type'] : 'note';
            $noteId = (int)$row['id'];
            
            // Get file content
            $filename = getEntryFilename($noteId, $noteType);
            
            // Security check
            $realPath = realpath($filename);
            $expectedDir = realpath(getEntriesPath());
            
            if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
                $this->sendError(403, 'Invalid file path');
                return;
            }
            
            $content = '';
            if (file_exists($filename) && is_readable($filename)) {
                $content = file_get_contents($filename);
                if ($content === false) {
                    $content = '';
                }
            }
            
            echo json_encode([
                'success' => true,
                'note' => [
                    'id' => $noteId,
                    'heading' => $row['heading'] ?? '',
                    'workspace' => $row['workspace'] ?? null,
                    'type' => $noteType,
                    'tags' => $row['tags'] ?? '',
                    'folder' => $row['folder'] ?? null,
                    'folder_id' => $row['folder_id'] ? (int)$row['folder_id'] : null,
                    'created' => $row['created'] ?? null,
                    'updated' => $row['updated'] ?? null,
                    'content' => $content
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            
        } catch (Exception $e) {
            error_log('Error in NotesController::show: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * POST /api/v1/notes
     * Create a new note
     * 
     * Body (JSON):
     *   - heading: Note title (optional, defaults to "New note")
     *   - content: Note content (HTML or Markdown)
     *   - tags: Comma-separated tags
     *   - folder_name: Folder name
     *   - folder_id: Folder ID (alternative to folder_name)
     *   - workspace: Workspace name
     *   - type: Note type (note, markdown, excalidraw)
     */
    public function create(): void {
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }
        
        // DEBUG logging
        error_log("NotesController::create - Input received: " . json_encode($input));
        
        $originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
        $tags = isset($input['tags']) ? trim($input['tags']) : '';
        $folder = isset($input['folder_name']) ? trim($input['folder_name']) : null;
        
        // Handle workspace - use provided value or fallback to first workspace
        $workspace = isset($input['workspace']) && trim($input['workspace']) !== '' 
            ? trim($input['workspace']) 
            : getFirstWorkspaceName();
        
        error_log("NotesController::create - workspace after processing: " . $workspace);
        $entry = $input['content'] ?? $input['entry'] ?? '';
        $entrycontent = $input['entrycontent'] ?? $entry;
        $type = isset($input['type']) ? trim($input['type']) : 'note';
        
        try {
            // Validate workspace if provided
            if (!empty($workspace)) {
                $wsStmt = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $wsStmt->execute([$workspace]);
                if ($wsStmt->fetchColumn() == 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // Validate and clean tags
            if (!empty($tags)) {
                $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
                $validTags = [];
                foreach ($tagsArray as $tag) {
                    if (!empty($tag)) {
                        $tag = str_replace(' ', '_', $tag);
                        $validTags[] = $tag;
                    }
                }
                $tags = implode(', ', $validTags);
            }
            
            // Get folder_id if folder name is provided
            $folder_id = isset($input['folder_id']) ? (int)$input['folder_id'] : null;
            if ($folder_id === 0) $folder_id = null;
            
            if ($folder && !$folder_id) {
                if ($workspace) {
                    $fStmt = $this->con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
                    $fStmt->execute([$folder, $workspace]);
                } else {
                    $fStmt = $this->con->prepare("SELECT id FROM folders WHERE name = ?");
                    $fStmt->execute([$folder]);
                }
                $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
                if ($folderData) {
                    $folder_id = (int)$folderData['id'];
                }
            }
            
            // Generate unique heading if needed
            if ($originalHeading === '') {
                $heading = generateUniqueTitle(t('index.note.new_note', [], 'New note'), null, $workspace, $folder_id);
            } else {
                // Check uniqueness
                if ($folder_id !== null) {
                    $check = $this->con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id = ? AND workspace = ?");
                    $check->execute([$originalHeading, $folder_id, $workspace]);
                } else {
                    $check = $this->con->prepare("SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND folder_id IS NULL AND workspace = ?");
                    $check->execute([$originalHeading, $workspace]);
                }
                if ($check->fetchColumn() > 0) {
                    $heading = generateUniqueTitle($originalHeading, null, $workspace, $folder_id);
                } else {
                    $heading = $originalHeading;
                }
            }
            
            // Create the note
            $now_utc = gmdate('Y-m-d H:i:s', time());
            
            $stmt = $this->con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            if ($stmt->execute([$heading, $entrycontent, $tags, $folder, $folder_id, $workspace, $type, $now_utc, $now_utc])) {
                $id = $this->con->lastInsertId();
                
                // If folder is shared, auto-share the new note
                $wasShared = false;
                if ($folder_id) {
                    $sharedFolderStmt = $this->con->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
                    $sharedFolderStmt->execute([$folder_id]);
                    $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($sharedFolder) {
                        $noteToken = bin2hex(random_bytes(16));
                        $insertShareStmt = $this->con->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                        $insertShareStmt->execute([$id, $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
                        $wasShared = true;
                    }
                }
                
                // Create the file
                $filename = getEntryFilename($id, $type);
                $entriesDir = dirname($filename);
                if (!is_dir($entriesDir)) {
                    mkdir($entriesDir, 0755, true);
                }
                
                if (!empty($entry)) {
                    $write_result = file_put_contents($filename, $entry);
                    if ($write_result === false) {
                        error_log("Failed to write file for note ID $id: $filename");
                    }
                }
                
                http_response_code(201);
                echo json_encode([
                    'success' => true,
                    'note' => [
                        'id' => (int)$id,
                        'heading' => $heading,
                        'workspace' => $workspace,
                        'type' => $type,
                        'folder_id' => $folder_id,
                        'created' => $now_utc
                    ],
                    'share_delta' => $wasShared ? 1 : 0
                ]);
            } else {
                $this->sendError(500, 'Error while creating the note');
            }
            
        } catch (Exception $e) {
            error_log('Error in NotesController::create: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * PATCH /api/v1/notes/{id}
     * Update an existing note
     * 
     * Body (JSON):
     *   - heading: Note title
     *   - content: Note content
     *   - tags: Comma-separated tags
     *   - folder_id: Folder ID
     *   - workspace: Workspace name
     */
    public function update(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->sendError(400, 'Invalid JSON in request body');
            return;
        }
        
        try {
            // Get current note
            $stmt = $this->con->prepare("SELECT id, heading, type, workspace, folder, folder_id FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$noteId]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Prepare update data (only update provided fields)
            $heading = isset($input['heading']) ? trim($input['heading']) : $note['heading'];
            $entry = $input['content'] ?? $input['entry'] ?? null;
            $tags = isset($input['tags']) ? trim($input['tags']) : null;
            $folder_id = isset($input['folder_id']) ? (int)$input['folder_id'] : (int)$note['folder_id'];
            if ($folder_id === 0) $folder_id = null;
            $workspace = isset($input['workspace']) ? trim($input['workspace']) : $note['workspace'];
            $folder = $note['folder'];
            
            // Validate workspace if changed
            if ($workspace && $workspace !== $note['workspace']) {
                $wsStmt = $this->con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
                $wsStmt->execute([$workspace]);
                if ($wsStmt->fetchColumn() == 0) {
                    $this->sendError(404, t('api.errors.workspace_not_found', [], 'Workspace not found'));
                    return;
                }
            }
            
            // Get folder name from folder_id if changed
            if (isset($input['folder_id'])) {
                if ($folder_id !== null) {
                    $fStmt = $this->con->prepare("SELECT name FROM folders WHERE id = ?");
                    $fStmt->execute([$folder_id]);
                    $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
                    if ($folderData) {
                        $folder = $folderData['name'];
                    }
                } else {
                    $folder = null;
                }
            }
            
            // Validate tags
            if ($tags !== null && !empty($tags)) {
                $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
                $validTags = [];
                foreach ($tagsArray as $tag) {
                    if (!empty($tag)) {
                        $tag = str_replace(' ', '_', $tag);
                        $validTags[] = $tag;
                    }
                }
                $tags = implode(', ', $validTags);
            }
            
            // Check heading uniqueness if changed
            if ($heading !== $note['heading']) {
                $checkQuery = "SELECT id FROM entries WHERE heading = ? AND trash = 0 AND id != ?";
                $params = [$heading, $noteId];
                
                if ($folder_id !== null) {
                    $checkQuery .= " AND folder_id = ?";
                    $params[] = $folder_id;
                } else {
                    $checkQuery .= " AND folder_id IS NULL";
                }
                
                if ($workspace) {
                    $checkQuery .= " AND workspace = ?";
                    $params[] = $workspace;
                }
                
                $checkStmt = $this->con->prepare($checkQuery);
                $checkStmt->execute($params);
                if ($checkStmt->fetchColumn()) {
                    $this->sendError(409, t('api.errors.duplicate_title_in_folder', [], 'Another note with the same title exists in this folder.'));
                    return;
                }
            }
            
            // Update file content if provided
            $noteType = $note['type'] ?? 'note';
            if ($entry !== null) {
                $filename = getEntryFilename($noteId, $noteType);
                $entriesDir = dirname($filename);
                if (!is_dir($entriesDir)) {
                    mkdir($entriesDir, 0755, true);
                }
                
                // For markdown notes, clean HTML if needed
                $contentToSave = $entry;
                if ($noteType === 'markdown' && !empty($entry)) {
                    if (strpos($entry, '<div class="markdown-editor"') !== false) {
                        if (preg_match('/<div class="markdown-editor"[^>]*>(.*?)<\/div>/', $entry, $matches)) {
                            $contentToSave = strip_tags($matches[1]);
                            $contentToSave = html_entity_decode($contentToSave, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        }
                    }
                }
                
                $write_result = file_put_contents($filename, $contentToSave);
                if ($write_result === false) {
                    $this->sendError(500, 'Failed to write file');
                    return;
                }
            }
            
            // Update database
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $entrycontent = $entry ?? '';
            
            $updateFields = ["heading = ?", "updated = ?"];
            $updateParams = [$heading, $now_utc];
            
            if ($entry !== null) {
                $updateFields[] = "entry = ?";
                $updateParams[] = $entrycontent;
            }
            
            if ($tags !== null) {
                $updateFields[] = "tags = ?";
                $updateParams[] = $tags;
            }
            
            $updateFields[] = "folder = ?";
            $updateParams[] = $folder;
            
            $updateFields[] = "folder_id = ?";
            $updateParams[] = $folder_id;
            
            $updateFields[] = "workspace = ?";
            $updateParams[] = $workspace;
            
            $updateParams[] = $noteId;
            
            $sql = "UPDATE entries SET " . implode(", ", $updateFields) . " WHERE id = ?";
            $stmt = $this->con->prepare($sql);
            
            if ($stmt->execute($updateParams)) {
                $this->sendSuccess([
                    'note' => [
                        'id' => $noteId,
                        'heading' => $heading,
                        'updated' => $now_utc
                    ]
                ]);
            } else {
                $this->sendError(500, 'Database error while updating note');
            }
            
        } catch (Exception $e) {
            error_log('Error in NotesController::update: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * DELETE /api/v1/notes/{id}
     * Delete a note (soft delete by default)
     * 
     * Query params:
     *   - permanent: If true, permanently delete the note
     *   - workspace: Optional workspace filter
     */
    public function delete(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $permanent = filter_var($_GET['permanent'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $workspace = $_GET['workspace'] ?? null;
        
        try {
            // Get the note
            if ($workspace) {
                $stmt = $this->con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ? AND workspace = ?");
                $stmt->execute([$noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("SELECT heading, trash, attachments, folder, type FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            if ($permanent) {
                // Permanent deletion
                $this->permanentDelete($noteId, $note, $workspace);
            } else {
                // Soft delete (move to trash)
                if ($note['trash'] == 1) {
                    $this->sendError(400, 'Note is already in trash');
                    return;
                }
                
                if ($workspace) {
                    $stmt = $this->con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ? AND workspace = ?");
                    $success = $stmt->execute([$noteId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ?");
                    $success = $stmt->execute([$noteId]);
                }
                
                if ($success) {
                    $this->sendSuccess([
                        'message' => 'Note moved to trash',
                        'note' => [
                            'id' => $noteId,
                            'heading' => $note['heading'],
                            'action' => 'moved_to_trash'
                        ]
                    ]);
                } else {
                    $this->sendError(500, 'Failed to move note to trash');
                }
            }
            
        } catch (Exception $e) {
            error_log('Error in NotesController::delete: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * Helper for permanent deletion
     */
    private function permanentDelete(int $noteId, array $note, ?string $workspace): void {
        // Delete attachments
        $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
        $deleted_attachments = [];
        
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $attachment_file = getAttachmentsPath() . '/' . $attachment['filename'];
                    if (file_exists($attachment_file)) {
                        if (unlink($attachment_file)) {
                            $deleted_attachments[] = $attachment['filename'];
                        }
                    }
                }
            }
        }
        
        // Delete note file
        $noteType = $note['type'] ?? 'note';
        $note_file_path = getEntryFilename($noteId, $noteType);
        
        $file_deleted = false;
        if (file_exists($note_file_path)) {
            $file_deleted = unlink($note_file_path);
        }
        
        // Delete PNG file for Excalidraw
        $png_file_path = getEntriesPath() . '/' . $noteId . '.png';
        $png_deleted = false;
        if (file_exists($png_file_path)) {
            $png_deleted = unlink($png_file_path);
        }

        // Delete database entry
        if ($workspace) {
            $stmt = $this->con->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
            $success = $stmt->execute([$noteId, $workspace]);
        } else {
            $stmt = $this->con->prepare("DELETE FROM entries WHERE id = ?");
            $success = $stmt->execute([$noteId]);
        }
        
        if ($success) {
            $this->sendSuccess([
                'message' => 'Note permanently deleted',
                'note' => [
                    'id' => $noteId,
                    'heading' => $note['heading'],
                    'file_deleted' => $file_deleted,
                    'png_file_deleted' => $png_deleted,
                    'attachments_deleted' => $deleted_attachments
                ]
            ]);
        } else {
            $this->sendError(500, 'Failed to delete note from database');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/restore
     * Restore a note from trash
     */
    public function restore(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $workspace = $input['workspace'] ?? $_GET['workspace'] ?? null;
        
        try {
            // Check if note exists and is in trash
            $checkSql = "SELECT id, heading, trash FROM entries WHERE id = ?";
            $checkParams = [$noteId];
            
            if ($workspace) {
                $checkSql .= " AND workspace = ?";
                $checkParams[] = $workspace;
            }
            
            $checkStmt = $this->con->prepare($checkSql);
            $checkStmt->execute($checkParams);
            $note = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            if ($note['trash'] == 0) {
                $this->sendError(400, 'Note is not in trash');
                return;
            }
            
            // Restore the note
            $updateSql = "UPDATE entries SET trash = 0 WHERE id = ?";
            $updateParams = [$noteId];
            
            if ($workspace) {
                $updateSql .= " AND workspace = ?";
                $updateParams[] = $workspace;
            }
            
            $updateStmt = $this->con->prepare($updateSql);
            $result = $updateStmt->execute($updateParams);
            
            if ($result) {
                $this->sendSuccess([
                    'message' => 'Note restored successfully',
                    'note' => [
                        'id' => $noteId,
                        'heading' => $note['heading']
                    ]
                ]);
            } else {
                $this->sendError(500, 'Failed to restore note');
            }
            
        } catch (Exception $e) {
            error_log('Error in NotesController::restore: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * PUT /api/v1/notes/{id}/tags
     * Apply/replace tags on a note
     * 
     * Body (JSON):
     *   - tags: Array of tag strings
     *   - workspace: Optional workspace filter
     */
    public function updateTags(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['tags'])) {
            $this->sendError(400, 'tags field is required');
            return;
        }
        
        $workspace = $input['workspace'] ?? null;
        $tags = $input['tags'];
        
        try {
            // Verify note exists
            if ($workspace) {
                $stmt = $this->con->prepare("SELECT id FROM entries WHERE id = ? AND workspace = ?");
                $stmt->execute([$noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("SELECT id FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
            if (!$stmt->fetch()) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Convert tags array to string
            $tags_string = '';
            if (is_array($tags) && count($tags) > 0) {
                $valid_tags = [];
                foreach ($tags as $tag) {
                    $tag = trim($tag);
                    if (!empty($tag)) {
                        $tag = str_replace(' ', '_', $tag);
                        $valid_tags[] = $tag;
                    }
                }
                $tags_string = implode(', ', $valid_tags);
            }
            
            // Update tags
            if ($workspace) {
                $stmt = $this->con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ? AND workspace = ?");
                $stmt->execute([$tags_string, $noteId, $workspace]);
            } else {
                $stmt = $this->con->prepare("UPDATE entries SET tags = ?, updated = CURRENT_TIMESTAMP WHERE id = ?");
                $stmt->execute([$tags_string, $noteId]);
            }
            
            $this->sendSuccess([
                'message' => 'Tags updated successfully',
                'note' => [
                    'id' => $noteId,
                    'tags' => $tags_string
                ]
            ]);
            
        } catch (Exception $e) {
            error_log('Error in NotesController::updateTags: ' . $e->getMessage());
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/beacon
     * Emergency save via sendBeacon (accepts FormData, not JSON)
     * Used when user closes the page and we need to save immediately
     */
    public function beaconSave(string $id): void {
        if (!is_numeric($id)) {
            $this->sendError(400, 'Invalid note ID');
            return;
        }
        
        $noteId = (int)$id;
        
        // sendBeacon sends FormData, not JSON
        $content = $_POST['content'] ?? '';
        $workspace = $_POST['workspace'] ?? null;
        
        if (empty($content)) {
            $this->sendError(400, 'Content is required');
            return;
        }
        
        try {
            // Get note type
            $typeStmt = $this->con->prepare("SELECT type FROM entries WHERE id = ?");
            $typeStmt->execute([$noteId]);
            $noteType = $typeStmt->fetchColumn();
            
            if ($noteType === false) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Write file
            $filename = getEntryFilename($noteId, $noteType);
            $entriesDir = dirname($filename);
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            $write_result = file_put_contents($filename, $content);
            if ($write_result === false) {
                $this->sendError(500, 'Failed to write file');
                return;
            }
            
            // Update database
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $stmt = $this->con->prepare("UPDATE entries SET entry = ?, updated = ? WHERE id = ?");
            
            if ($stmt->execute([$content, $now_utc, $noteId])) {
                $this->sendSuccess(['id' => $noteId]);
            } else {
                $this->sendError(500, 'Database error');
            }
            
        } catch (Exception $e) {
            error_log('Error in NotesController::beaconSave: ' . $e->getMessage());
            $this->sendError(500, 'Server error');
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/favorite
     * Toggle favorite status for a note
     */
    public function toggleFavorite($id) {
        $workspace = $_GET['workspace'] ?? null;
        
        // Also check JSON body for workspace
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$workspace && isset($input['workspace'])) {
            $workspace = $input['workspace'];
        }
        
        if (empty($id)) {
            $this->sendError(400, 'note_id is required');
            return;
        }
        
        try {
            // Get current favorite status
            if ($workspace) {
                $query = "SELECT favorite FROM entries WHERE id = ? AND workspace = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$id, $workspace]);
            } else {
                $query = "SELECT favorite FROM entries WHERE id = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$id]);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$result) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            $currentFavorite = $result['favorite'];
            $newFavorite = $currentFavorite ? 0 : 1;
            
            // Update database
            if ($workspace) {
                $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ? AND workspace = ?";
                $updateStmt = $this->con->prepare($updateQuery);
                $success = $updateStmt->execute([$newFavorite, $id, $workspace]);
            } else {
                $updateQuery = "UPDATE entries SET favorite = ? WHERE id = ?";
                $updateStmt = $this->con->prepare($updateQuery);
                $success = $updateStmt->execute([$newFavorite, $id]);
            }
            
            if ($success) {
                $this->sendSuccess(['is_favorite' => $newFavorite]);
            } else {
                $this->sendError(500, 'Error updating database');
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Error toggling favorite: ' . $e->getMessage());
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/duplicate
     * Duplicate a note
     */
    public function duplicate(string $id): void {
        try {
            // Get the original note
            $stmt = $this->con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$id]);
            $originalNote = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$originalNote) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            // Generate unique heading
            $originalHeading = $originalNote['heading'] ?: t('index.note.new_note', [], 'New note');
            $newHeading = generateUniqueTitle($originalHeading, null, $originalNote['workspace'], $originalNote['folder_id']);
            
            // Duplicate attachments
            $newAttachments = null;
            $attachmentIdMapping = [];
            $originalAttachments = $originalNote['attachments'] ? json_decode($originalNote['attachments'], true) : [];
            
            if (!empty($originalAttachments)) {
                $attachmentsDir = getAttachmentsPath();
                $duplicatedAttachments = [];
                
                foreach ($originalAttachments as $attachment) {
                    $originalFilePath = $attachmentsDir . '/' . $attachment['filename'];
                    
                    if (file_exists($originalFilePath)) {
                        $fileExtension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                        $newFilename = uniqid() . '_' . time() . '.' . $fileExtension;
                        $newFilePath = $attachmentsDir . '/' . $newFilename;
                        $oldAttachmentId = $attachment['id'];
                        $newAttachmentId = uniqid();
                        
                        if (copy($originalFilePath, $newFilePath)) {
                            chmod($newFilePath, 0644);
                            $attachmentIdMapping[$oldAttachmentId] = $newAttachmentId;
                            
                            $duplicatedAttachments[] = [
                                'id' => $newAttachmentId,
                                'filename' => $newFilename,
                                'original_filename' => $attachment['original_filename'],
                                'file_size' => $attachment['file_size'],
                                'file_type' => $attachment['file_type'],
                                'uploaded_at' => date('Y-m-d H:i:s')
                            ];
                        }
                    }
                }
                
                $newAttachments = !empty($duplicatedAttachments) ? json_encode($duplicatedAttachments) : null;
            }
            
            // Read original content and update attachment references
            $originalFilename = getEntryFilename($id, $originalNote['type']);
            $content = '';
            if (file_exists($originalFilename)) {
                $content = file_get_contents($originalFilename);
                foreach ($attachmentIdMapping as $oldId => $newId) {
                    $content = str_replace($oldId, $newId, $content);
                }
            }
            
            // Insert new note
            $insertStmt = $this->con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, attachments, created, updated, trash, favorite) VALUES (?, '', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0)");
            $insertStmt->execute([
                $newHeading,
                $originalNote['tags'],
                $originalNote['folder'],
                $originalNote['folder_id'],
                $originalNote['workspace'],
                $originalNote['type'],
                $newAttachments
            ]);
            
            $newId = $this->con->lastInsertId();
            
            // If folder is shared, auto-share the duplicated note
            $wasShared = false;
            if ($originalNote['folder_id']) {
                $sharedFolderStmt = $this->con->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
                $sharedFolderStmt->execute([$originalNote['folder_id']]);
                $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);
                
                if ($sharedFolder) {
                    $noteToken = bin2hex(random_bytes(16));
                    $insertShareStmt = $this->con->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                    $insertShareStmt->execute([$newId, $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
                    $wasShared = true;
                }
            }
            
            // Create new file
            $newFilename = getEntryFilename($newId, $originalNote['type']);
            file_put_contents($newFilename, $content);
            chmod($newFilename, 0644);
            
            http_response_code(201);
            $this->sendSuccess([
                'id' => $newId,
                'heading' => $newHeading,
                'message' => 'Note duplicated successfully',
                'share_delta' => $wasShared ? 1 : 0
            ]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Error duplicating note: ' . $e->getMessage());
        }
    }
    
    /**
     * POST /api/v1/notes/{id}/convert
     * Convert note between markdown and HTML
     */
    public function convert(string $id): void {
        $input = json_decode(file_get_contents('php://input'), true);
        $targetType = isset($input['target']) ? strtolower(trim($input['target'])) : '';
        
        if (!in_array($targetType, ['html', 'markdown'], true)) {
            $this->sendError(400, 'Invalid target type. Use "html" or "markdown"');
            return;
        }
        
        try {
            $stmt = $this->con->prepare('SELECT id, heading, type, attachments, folder_id FROM entries WHERE id = ? AND trash = 0');
            $stmt->execute([$id]);
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$note) {
                $this->sendError(404, 'Note not found');
                return;
            }
            
            $currentType = $note['type'] ?? 'note';
            
            // Validate conversion
            if ($targetType === 'html' && $currentType !== 'markdown') {
                $this->sendError(400, 'Only markdown notes can be converted to HTML');
                return;
            }
            
            if ($targetType === 'markdown' && !in_array($currentType, ['note', 'html'], true)) {
                $this->sendError(400, 'Only HTML notes can be converted to markdown');
                return;
            }
            
            $currentFilePath = getEntryFilename($id, $currentType);
            
            if (!file_exists($currentFilePath) || !is_readable($currentFilePath)) {
                $this->sendError(404, 'Note file not found');
                return;
            }
            
            $content = file_get_contents($currentFilePath);
            $attachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
            $attachmentsToRemove = [];
            $attachmentsDir = getAttachmentsPath();
            
            // Convert content
            if ($targetType === 'markdown') {
                // Converting HTML to markdown: extract base64 images and save as attachments
                
                // Find all base64 images in HTML: <img src="data:image/...;base64,...">
                $content = preg_replace_callback(
                    '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
                    function($matches) use ($id, $attachmentsDir, &$attachments) {
                        $imageType = strtolower($matches[1]);
                        $base64Data = $matches[2];
                        $altText = isset($matches[3]) ? $matches[3] : '';
                        
                        // Determine file extension
                        $extensionMap = [
                            'jpeg' => 'jpg',
                            'png' => 'png',
                            'gif' => 'gif',
                            'webp' => 'webp',
                            'svg+xml' => 'svg',
                            'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        // Decode base64 data
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) {
                            // If decoding fails, keep original
                            return $matches[0];
                        }
                        
                        // Generate unique filename
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;
                        $filePath = $attachmentsDir . '/' . $filename;
                        
                        // Save the image file
                        if (file_put_contents($filePath, $imageData) === false) {
                            // If saving fails, keep original
                            return $matches[0];
                        }
                        chmod($filePath, 0644);
                        
                        // Create attachment entry
                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $newAttachment = [
                            'id' => $attachmentId,
                            'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData),
                            'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        $attachments[] = $newAttachment;
                        
                        // Return img tag with attachment reference for htmlToMarkdown to convert
                        return '<img src="/api/v1/notes/' . $id . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '">';
                    },
                    $content
                );
                
                // Also handle case where alt comes before src
                $content = preg_replace_callback(
                    '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
                    function($matches) use ($id, $attachmentsDir, &$attachments) {
                        $altText = $matches[1];
                        $imageType = strtolower($matches[2]);
                        $base64Data = $matches[3];
                        
                        // Determine file extension
                        $extensionMap = [
                            'jpeg' => 'jpg',
                            'png' => 'png',
                            'gif' => 'gif',
                            'webp' => 'webp',
                            'svg+xml' => 'svg',
                            'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        // Decode base64 data
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) {
                            return $matches[0];
                        }
                        
                        // Generate unique filename
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;
                        $filePath = $attachmentsDir . '/' . $filename;
                        
                        // Save the image file
                        if (file_put_contents($filePath, $imageData) === false) {
                            return $matches[0];
                        }
                        chmod($filePath, 0644);
                        
                        // Create attachment entry
                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $newAttachment = [
                            'id' => $attachmentId,
                            'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData),
                            'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        $attachments[] = $newAttachment;
                        
                        return '<img src="/api/v1/notes/' . $id . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '">';
                    },
                    $content
                );
                
                $convertedContent = $this->htmlToMarkdown($content);
                $newType = 'markdown';
            } else {
                // Converting markdown to HTML: embed image attachments as base64
                
                // Find all markdown image references to attachments: ![...](/api/v1/notes/{id}/attachments/{attachmentId})
                $content = preg_replace_callback(
                    '/!\[([^\]]*)\]\(\/api\/v1\/notes\/' . preg_quote($id, '/') . '\/attachments\/([a-zA-Z0-9]+)\)/',
                    function($matches) use ($attachments, $attachmentsDir, &$attachmentsToRemove) {
                        $altText = $matches[1];
                        $attachmentId = $matches[2];
                        
                        // Find the attachment in the list
                        foreach ($attachments as $attachment) {
                            if (isset($attachment['id']) && $attachment['id'] === $attachmentId) {
                                $filePath = $attachmentsDir . '/' . $attachment['filename'];
                                
                                if (file_exists($filePath) && is_readable($filePath)) {
                                    // Check if it's an image
                                    $mimeType = $attachment['file_type'] ?? '';
                                    if (strpos($mimeType, 'image/') === 0) {
                                        // Read file and convert to base64
                                        $fileContent = file_get_contents($filePath);
                                        $base64 = base64_encode($fileContent);
                                        $dataUri = 'data:' . $mimeType . ';base64,' . $base64;
                                        
                                        // Mark this attachment for removal
                                        $attachmentsToRemove[] = $attachmentId;
                                        
                                        // Return markdown with base64 data URI
                                        return '![' . $altText . '](' . $dataUri . ')';
                                    }
                                }
                                break;
                            }
                        }
                        
                        // If attachment not found or not an image, keep original reference
                        return $matches[0];
                    },
                    $content
                );
                
                require_once __DIR__ . '/../../../markdown_parser.php';
                $convertedContent = parseMarkdown($content);
                $newType = 'note';
                
                // Remove embedded image attachments from the note and delete files
                if (!empty($attachmentsToRemove)) {
                    $remainingAttachments = [];
                    foreach ($attachments as $attachment) {
                        if (in_array($attachment['id'], $attachmentsToRemove)) {
                            // Delete the attachment file
                            $filePath = $attachmentsDir . '/' . $attachment['filename'];
                            if (file_exists($filePath)) {
                                unlink($filePath);
                            }
                        } else {
                            $remainingAttachments[] = $attachment;
                        }
                    }
                    $attachments = $remainingAttachments;
                }
            }
            
            // Create new file with converted content
            $newFilePath = getEntryFilename($id, $newType);
            if (file_put_contents($newFilePath, $convertedContent) === false) {
                $this->sendError(500, 'Failed to save converted note');
                return;
            }
            chmod($newFilePath, 0644);
            
            // Update database (including attachments if any were removed)
            $attachmentsJson = !empty($attachments) ? json_encode($attachments) : null;
            $updateStmt = $this->con->prepare("UPDATE entries SET type = ?, attachments = ?, updated = datetime('now') WHERE id = ?");
            $updateStmt->execute([$newType, $attachmentsJson, $id]);
            
            // Delete old file if extension changed
            if ($currentFilePath !== $newFilePath && file_exists($currentFilePath)) {
                unlink($currentFilePath);
            }
            
            $this->sendSuccess([
                'id' => $id,
                'type' => $newType,
                'message' => 'Note converted successfully'
            ]);
            
        } catch (Exception $e) {
            $this->sendError(500, 'Error converting note: ' . $e->getMessage());
        }
    }
    
    /**
     * GET /api/v1/notes/resolve
     * Resolve a note reference by ID or heading
     */
    public function resolveReference(): void {
        $reference = $_GET['reference'] ?? null;
        $workspace = $_GET['workspace'] ?? null;
        
        if (!$reference) {
            $this->sendError(400, 'No reference provided');
            return;
        }
        
        try {
            if (is_numeric($reference)) {
                $noteId = intval($reference);
                if ($workspace) {
                    $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND id = ? AND workspace = ?");
                    $stmt->execute([$noteId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND id = ?");
                    $stmt->execute([$noteId]);
                }
            } else {
                if ($workspace) {
                    $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) AND workspace = ? ORDER BY updated DESC LIMIT 1");
                    $stmt->execute(['%' . $reference . '%', $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) ORDER BY updated DESC LIMIT 1");
                    $stmt->execute(['%' . $reference . '%']);
                }
            }
            
            $note = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($note) {
                $this->sendSuccess([
                    'id' => $note['id'],
                    'heading' => $note['heading']
                ]);
            } else {
                $this->sendError(404, 'Note not found');
            }
        } catch (Exception $e) {
            $this->sendError(500, 'Database error: ' . $e->getMessage());
        }
    }
    
    /**
     * GET /api/v1/notes/with-attachments
     * List notes that have attachments
     */
    public function listWithAttachments(): void {
        $workspace = $_GET['workspace'] ?? null;
        
        try {
            $query = "SELECT id, heading, attachments, updated 
                      FROM entries 
                      WHERE trash = 0 
                      AND attachments IS NOT NULL 
                      AND attachments != '' 
                      AND attachments != '[]'";
            
            $params = [];
            
            if ($workspace !== null && $workspace !== '') {
                $query .= " AND workspace = ?";
                $params[] = $workspace;
            }
            
            $query .= " ORDER BY updated DESC";
            
            $stmt = $this->con->prepare($query);
            $stmt->execute($params);
            
            $notes = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $attachments = json_decode($row['attachments'], true);
                if (is_array($attachments) && count($attachments) > 0) {
                    $notes[] = [
                        'id' => $row['id'],
                        'heading' => $row['heading'],
                        'attachments' => $attachments,
                        'updated' => $row['updated']
                    ];
                }
            }
            
            $this->sendSuccess([
                'notes' => $notes,
                'count' => count($notes)
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Database error: ' . $e->getMessage());
        }
    }
    
    /**
     * Convert HTML to Markdown (basic implementation)
     */
    private function htmlToMarkdown(string $html): string {
        // Basic HTML to Markdown conversion
        $md = $html;
        
        // Headers
        $md = preg_replace('/<h1[^>]*>(.*?)<\/h1>/is', "# $1\n\n", $md);
        $md = preg_replace('/<h2[^>]*>(.*?)<\/h2>/is', "## $1\n\n", $md);
        $md = preg_replace('/<h3[^>]*>(.*?)<\/h3>/is', "### $1\n\n", $md);
        $md = preg_replace('/<h4[^>]*>(.*?)<\/h4>/is', "#### $1\n\n", $md);
        $md = preg_replace('/<h5[^>]*>(.*?)<\/h5>/is', "##### $1\n\n", $md);
        $md = preg_replace('/<h6[^>]*>(.*?)<\/h6>/is', "###### $1\n\n", $md);
        
        // Bold and italic
        $md = preg_replace('/<strong[^>]*>(.*?)<\/strong>/is', "**$1**", $md);
        $md = preg_replace('/<b[^>]*>(.*?)<\/b>/is', "**$1**", $md);
        $md = preg_replace('/<em[^>]*>(.*?)<\/em>/is', "*$1*", $md);
        $md = preg_replace('/<i[^>]*>(.*?)<\/i>/is', "*$1*", $md);
        
        // Links
        $md = preg_replace('/<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)<\/a>/is', "[$2]($1)", $md);
        
        // Images
        $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*\/?>/is', "![$2]($1)", $md);
        $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*\/?>/is', "![]($1)", $md);
        
        // Line breaks
        $md = preg_replace('/<br\s*\/?>/i', "\n", $md);
        
        // Paragraphs
        $md = preg_replace('/<p[^>]*>(.*?)<\/p>/is', "$1\n\n", $md);
        
        // Lists
        $md = preg_replace('/<li[^>]*>(.*?)<\/li>/is', "- $1\n", $md);
        $md = preg_replace('/<\/?[ou]l[^>]*>/i', "\n", $md);
        
        // Remove copy buttons from code blocks first
        $md = preg_replace('/<button[^>]*class="[^"]*code-block-copy-btn[^"]*"[^>]*>.*?<\/button>/is', '', $md);
        
        // Code blocks (must be processed before inline code)
        // Handle <pre><code>...</code></pre> with any attributes and whitespace
        $md = preg_replace_callback('/<pre[^>]*>\s*<code[^>]*>(.*?)<\/code>\s*<\/pre>/is', function($matches) {
            $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            return "\n```\n" . trim($code) . "\n```\n";
        }, $md);
        
        // Handle <pre>...</pre> without <code> tag
        $md = preg_replace_callback('/<pre[^>]*>(.*?)<\/pre>/is', function($matches) {
            $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            return "\n```\n" . trim($code) . "\n```\n";
        }, $md);
        
        // Handle standalone <code> blocks that might contain newlines (multi-line code without pre)
        $md = preg_replace_callback('/<code[^>]*>(.*?)<\/code>/is', function($matches) {
            $code = $matches[1];
            // If the code contains newlines, treat it as a code block
            if (strpos($code, "\n") !== false || strlen($code) > 80) {
                $code = html_entity_decode($code, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                return "\n```\n" . trim($code) . "\n```\n";
            }
            // Otherwise, inline code with single backticks
            return "`" . $code . "`";
        }, $md);
        
        // Blockquote
        $md = preg_replace('/<blockquote[^>]*>(.*?)<\/blockquote>/is', "> $1\n", $md);
        
        // Horizontal rule
        $md = preg_replace('/<hr\s*\/?>/i', "\n---\n", $md);
        
        // Remove remaining HTML tags
        $md = strip_tags($md);
        
        // Convert HTML entities to normal characters
        $md = html_entity_decode($md, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        // Replace non-breaking spaces with regular spaces
        $md = str_replace("\xC2\xA0", ' ', $md);  // UTF-8 non-breaking space
        
        // Clean up lines that are only whitespace
        $md = preg_replace('/^[ \t]+$/m', '', $md);
        
        // Clean up whitespace
        $md = preg_replace('/\n{3,}/', "\n\n", $md);
        $md = trim($md);
        
        return $md;
    }
    
    /**
     * GET /api/v1/notes/search
     * Search notes by text query
     * 
     * Query params:
     *   - q: Search query (required)
     *   - limit: Maximum number of results (default: 10)
     *   - workspace: Filter by workspace
     */
    public function search(): void {
        $query = $_GET['q'] ?? '';
        $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
        $workspace = $_GET['workspace'] ?? null;
        
        if (empty($query)) {
            $this->sendError(400, 'Search query (q) is required');
            return;
        }
        
        try {
            // Build search query using accent-insensitive search
            $sql = "SELECT id, heading, tags, folder, folder_id, workspace, updated, created, 
                           SUBSTR(search_clean_entry(entry), 1, 300) as excerpt
                    FROM entries 
                    WHERE trash = 0 
                    AND (remove_accents(heading) LIKE remove_accents(?) 
                         OR remove_accents(search_clean_entry(entry)) LIKE remove_accents(?))";
            
            $params = ['%' . $query . '%', '%' . $query . '%'];
            
            if ($workspace) {
                $sql .= " AND workspace = ?";
                $params[] = $workspace;
            }
            
            $sql .= " ORDER BY 
                        CASE WHEN remove_accents(heading) LIKE remove_accents(?) THEN 0 ELSE 1 END,
                        updated DESC
                      LIMIT ?";
            $params[] = '%' . $query . '%';
            $params[] = $limit;
            
            $stmt = $this->con->prepare($sql);
            $stmt->execute($params);
            
            $results = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                // Highlight query in excerpt
                $excerpt = $row['excerpt'] ?? '';
                if (!empty($excerpt) && strlen($excerpt) >= 300) {
                    $excerpt .= '...';
                }
                
                $results[] = [
                    'id' => (int)$row['id'],
                    'heading' => $row['heading'] ?? 'Untitled',
                    'tags' => $row['tags'] ?? '',
                    'folder' => $row['folder'],
                    'folder_id' => $row['folder_id'] ? (int)$row['folder_id'] : null,
                    'workspace' => $row['workspace'],
                    'excerpt' => $excerpt,
                    'updated' => $row['updated'],
                    'created' => $row['created'],
                ];
            }
            
            $this->sendSuccess([
                'query' => $query,
                'count' => count($results),
                'results' => $results
            ]);
            
        } catch (Exception $e) {
            error_log('Error in NotesController::search: ' . $e->getMessage());
            $this->sendError(500, 'Search error occurred');
        }
    }
    
    /**
     * Send a success response
     */
    private function sendSuccess(array $data): void {
        echo json_encode(array_merge(['success' => true], $data));
    }
    
    /**
     * Send an error response
     */
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message
        ]);
    }
}
