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
                $notes_without_folders_after = ($settingValue !== '0' && $settingValue !== 'false' && $settingValue !== false);
            } catch (Exception $e) {
                // ignore
                $notes_without_folders_after = true; // default
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
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
                    $stmt->execute([$noteId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id FROM entries WHERE id = ? AND trash = 0");
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
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
                    $stmt->execute([$refId, $workspace]);
                } else {
                    $stmt = $this->con->prepare("SELECT id, heading, type, workspace, tags, folder, folder_id, created, updated, linked_note_id FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?) AND workspace = ? ORDER BY updated DESC LIMIT 1");
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
            $content = '';
            $filename = getEntryFilename($noteId, $noteType);
            
            // Security check - only check realpath if file exists
            if (file_exists($filename)) {
                $realPath = realpath($filename);
                $expectedDir = realpath(getEntriesPath());
                
                if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
                    $this->sendError(403, 'Invalid file path');
                    return;
                }
                
                if (is_readable($filename)) {
                    $content = file_get_contents($filename);
                    if ($content === false) {
                        $content = '';
                    }
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
                    'linked_note_id' => $row['linked_note_id'] ? (int)$row['linked_note_id'] : null,
                    'created' => $row['created'] ?? null,
                    'updated' => $row['updated'] ?? null,
                    'content' => $content
                ]
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
            
        } catch (Exception $e) {
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
        
        $originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
        $tags = isset($input['tags']) ? trim($input['tags']) : '';
        $folder = isset($input['folder_name']) ? trim($input['folder_name']) : null;
        
        // Handle workspace - use provided value or fallback to first workspace
        $workspace = isset($input['workspace']) && trim($input['workspace']) !== '' 
            ? trim($input['workspace']) 
            : getFirstWorkspaceName();
        
        $entry = $input['content'] ?? $input['entry'] ?? '';
        $entrycontent = $input['entrycontent'] ?? $entry;
        $type = isset($input['type']) ? trim($input['type']) : 'note';
        $linked_note_id = isset($input['linked_note_id']) ? (int)$input['linked_note_id'] : null;
        
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
                $tags = $this->sanitizeTags($tags);
            }
            
            // Get folder_id if folder name is provided
            $folder_id = isset($input['folder_id']) ? (int)$input['folder_id'] : null;
            if ($folder_id === 0) $folder_id = null;
            
            if ($folder && !$folder_id) {
                // Robust path resolution and automatic creation of missing subfolders
                $resolvedId = resolveFolderPathToId($workspace, $folder, true, $this->con);
                if ($resolvedId) {
                    $folder_id = $resolvedId;
                    
                    // Update folder name to only the last segment for database consistency if needed
                    // Actually, Poznote uses the 'folder' column for legacy/display, but folder_id is primary.
                    // We'll keep the full path in 'folder' for now as it's common in this codebase.
                    $segments = explode('/', $folder);
                    $folder = end($segments);
                }
            }
            
            // Generate unique heading if needed
            if ($originalHeading === '') {
                $heading = generateUniqueTitle(t('index.note.new_note', [], 'New note'), null, $workspace, $folder_id);
            } else {
                // For linked notes, don't check uniqueness - multiple links can have the same title
                if ($type === 'linked') {
                    $heading = $originalHeading;
                } else {
                    // Check uniqueness for regular notes
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
            }
            
            // Create the note
            $now_utc = gmdate('Y-m-d H:i:s', time());
            
            // Validate linked_note_id if provided
            if ($linked_note_id !== null) {
                $checkLinkedNote = $this->con->prepare("SELECT id FROM entries WHERE id = ? AND trash = 0");
                $checkLinkedNote->execute([$linked_note_id]);
                if (!$checkLinkedNote->fetch()) {
                    $this->sendError(404, 'Linked note not found');
                    return;
                }
                
                // Check if a linked note already exists for this target
                $checkExistingLink = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0");
                $checkExistingLink->execute([$linked_note_id]);
                $existingLink = $checkExistingLink->fetch();
                if ($existingLink) {
                    $this->sendError(400, 'A linked note already exists for this note');
                    return;
                }
            }
            
            $stmt = $this->con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, linked_note_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            if ($stmt->execute([$heading, $entrycontent, $tags, $folder, $folder_id, $workspace, $type, $linked_note_id, $now_utc, $now_utc])) {
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
                createDirectoryWithPermissions($entriesDir);
                
                if (!empty($entry)) {
                    // Sanitize HTML content to prevent XSS attacks
                    $contentToSave = $entry;
                    
                    // For HTML notes (type='note'), sanitize the content
                    if ($type === 'note') {
                        $contentToSave = sanitizeHtml($entry);
                    }
                    
                    // For markdown notes, use markdown-specific sanitizer to preserve syntax
                    if ($type === 'markdown') {
                        $contentToSave = sanitizeMarkdownContent($entry);
                    }
                    
                    $write_result = file_put_contents($filename, $contentToSave);
                    
                    // Update the entry content in database with sanitized version
                    $updateStmt = $this->con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$contentToSave, $id]);
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

                // Trigger auto Git sync
                $this->triggerGitSync((int)$id, 'push');
            } else {
                $this->sendError(500, 'Error while creating the note');
            }
            
        } catch (Exception $e) {
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
     * @param bool $triggerSync Whether to trigger Git sync (defaults to false)
     */
    public function update(string $id, bool $triggerSync = false): void {
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
            // Get current note (including attachments for base64 image conversion)
            $stmt = $this->con->prepare("SELECT id, heading, type, workspace, folder, folder_id, attachments FROM entries WHERE id = ? AND trash = 0");
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
                $tags = $this->sanitizeTags($tags);
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
                    $heading = generateUniqueTitle($heading, $noteId, $workspace, $folder_id);
                }
            }
            
            // Update file content if provided
            $noteType = $note['type'] ?? 'note';
            if ($entry !== null) {
                $filename = getEntryFilename($noteId, $noteType);
                $entriesDir = dirname($filename);
                createDirectoryWithPermissions($entriesDir);
                
                // Sanitize HTML content to prevent XSS attacks
                $contentToSave = $entry;
                
                // For HTML notes (type='note'), sanitize and convert base64 images to attachments
                if ($noteType === 'note' && !empty($entry)) {
                    $contentToSave = sanitizeHtml($entry);
                    
                    // Convert any base64 images to attachments for performance
                    $existingAttachments = $note['attachments'] ? json_decode($note['attachments'], true) : [];
                    if (!is_array($existingAttachments)) $existingAttachments = [];
                    
                    $conversionResult = $this->convertBase64ImagesToAttachments($contentToSave, $noteId, $existingAttachments);
                    $contentToSave = $conversionResult['content'];
                    
                    // Update attachments in database if new images were converted
                    if (!empty($conversionResult['new_attachments'])) {
                        $updatedAttachments = array_merge($existingAttachments, $conversionResult['new_attachments']);
                        $attachmentsJson = json_encode($updatedAttachments);
                        $attachStmt = $this->con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
                        $attachStmt->execute([$attachmentsJson, $noteId]);
                    }
                }
                
                // For markdown notes, clean HTML if needed
                if ($noteType === 'markdown' && !empty($entry)) {
                    if (strpos($entry, '<div class="markdown-editor"') !== false) {
                        if (preg_match('/<div class="markdown-editor"[^>]*>(.*?)<\/div>/', $entry, $matches)) {
                            $contentToSave = strip_tags($matches[1]);
                            $contentToSave = html_entity_decode($contentToSave, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                        }
                    }
                    // Sanitize markdown content with markdown-specific sanitizer to preserve syntax
                    $contentToSave = sanitizeMarkdownContent($contentToSave);
                }
                
                $write_result = file_put_contents($filename, $contentToSave);
                if ($write_result === false) {
                    $this->sendError(500, 'Failed to write file');
                    return;
                }
                
                // Update the entry variable with sanitized content for database storage
                $entry = $contentToSave;
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
                $updatedLinkedNotes = [];
                
                // If the heading changed, update linked notes that point to this note
                if ($heading !== $note['heading']) {
                    // Get IDs of linked notes before updating
                    $linkIdsStmt = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0");
                    $linkIdsStmt->execute([$noteId]);
                    $linkedNoteIds = $linkIdsStmt->fetchAll(PDO::FETCH_COLUMN);
                    
                    if (!empty($linkedNoteIds)) {
                        $linkStmt = $this->con->prepare("UPDATE entries SET heading = ?, updated = ? WHERE linked_note_id = ? AND trash = 0");
                        $linkStmt->execute([$heading, $now_utc, $noteId]);
                        $updatedLinkedNotes = $linkedNoteIds;
                    }
                }
                
                $response = [
                    'note' => [
                        'id' => $noteId,
                        'heading' => $heading,
                        'updated' => $now_utc
                    ]
                ];
                
                // Include updated linked note IDs if any
                if (!empty($updatedLinkedNotes)) {
                    $response['updated_linked_notes'] = $updatedLinkedNotes;
                }
                
                $this->sendSuccess($response);

                // Trigger auto Git sync only if explicitly requested
                if ($triggerSync) {
                    $this->triggerGitSync($noteId, 'push');
                }
            } else {
                $this->sendError(500, 'Database error while updating note');
            }
            
        } catch (Exception $e) {
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
                
                // First, find and delete all linked notes that reference this note
                $linkedNotesStmt = $this->con->prepare("SELECT id FROM entries WHERE linked_note_id = ?");
                $linkedNotesStmt->execute([$noteId]);
                $linkedNotes = $linkedNotesStmt->fetchAll(PDO::FETCH_ASSOC);
                
                $deletedLinkedCount = 0;
                foreach ($linkedNotes as $linkedNote) {
                    $linkedId = $linkedNote['id'];
                    if ($workspace) {
                        $delStmt = $this->con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ? AND workspace = ?");
                        $delStmt->execute([$linkedId, $workspace]);
                    } else {
                        $delStmt = $this->con->prepare("UPDATE entries SET trash = 1, updated = datetime('now') WHERE id = ?");
                        $delStmt->execute([$linkedId]);
                    }
                    $deletedLinkedCount++;
                }
                
                // Then delete the main note
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
                            'action' => 'moved_to_trash',
                            'deleted_linked_count' => $deletedLinkedCount
                        ]
                    ]);

                    // Trigger auto Git sync (delete from Git because it's in trash)
                    $this->triggerGitSync($noteId, 'delete');
                } else {
                    $this->sendError(500, 'Failed to move note to trash');
                }
            }
            
        } catch (Exception $e) {
            $this->sendError(500, 'Database error occurred');
        }
    }
    
    /**
     * Helper for permanent deletion
     */
    private function permanentDelete(int $noteId, array $note, ?string $workspace): void {
        // First, find and permanently delete all linked notes that reference this note
        $linkedNotesStmt = $this->con->prepare("SELECT id, type, attachments FROM entries WHERE linked_note_id = ?");
        $linkedNotesStmt->execute([$noteId]);
        $linkedNotes = $linkedNotesStmt->fetchAll(PDO::FETCH_ASSOC);
        
        $deletedLinkedCount = 0;
        foreach ($linkedNotes as $linkedNote) {
            $linkedId = $linkedNote['id'];
            
            // Delete linked note's file
            $linkedNoteType = $linkedNote['type'] ?? 'note';
            $linked_file_path = getEntryFilename($linkedId, $linkedNoteType);
            if (file_exists($linked_file_path)) {
                unlink($linked_file_path);
            }
            
            // Delete linked note's attachments
            $linkedAttachments = $linkedNote['attachments'] ? json_decode($linkedNote['attachments'], true) : [];
            if (is_array($linkedAttachments) && !empty($linkedAttachments)) {
                foreach ($linkedAttachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $attachment_file = getAttachmentsPath() . '/' . $attachment['filename'];
                        if (file_exists($attachment_file)) {
                            unlink($attachment_file);
                        }
                    }
                }
            }
            
            // Delete linked note from database
            if ($workspace) {
                $delStmt = $this->con->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
                $delStmt->execute([$linkedId, $workspace]);
            } else {
                $delStmt = $this->con->prepare("DELETE FROM entries WHERE id = ?");
                $delStmt->execute([$linkedId]);
            }
            $deletedLinkedCount++;
        }
        
        // Delete attachments of the main note
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

        // Trigger auto Git sync
        $this->triggerGitSync($noteId, 'delete');

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
                    'attachments_deleted' => $deleted_attachments,
                    'linked_notes_deleted' => $deletedLinkedCount
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

                // Trigger auto Git sync
                $this->triggerGitSync($noteId, 'push');
            } else {
                $this->sendError(500, 'Failed to restore note');
            }
            
        } catch (Exception $e) {
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
            $tags_string = $this->sanitizeTags($tags);
            
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
            createDirectoryWithPermissions($entriesDir);
            
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
                
                // Trigger auto Git sync on emergency save (leaving page)
                $this->triggerGitSync($noteId, 'push');
            } else {
                $this->sendError(500, 'Database error');
            }
            
        } catch (Exception $e) {
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
     * Clone a note with optional overrides for folder, heading prefix, etc.
     * Shared logic for duplicate() and createTemplate().
     *
     * @param string $id         Source note ID
     * @param array  $options    Optional overrides:
     *   'headingPrefix'  => string  Prefix prepended to heading (default: '')
     *   'folderId'       => int     Override target folder_id (omit to keep original)
     *   'folderName'     => string  Override target folder name (omit to keep original)
     *   'autoShare'      => bool    Auto-share if folder is shared (default: true)
     *   'successMessage' => string  Message in response
     *   'extraResponse'  => array   Extra keys merged into response
     */
    private function cloneNote(string $id, array $options = []): void {
        $headingPrefix  = $options['headingPrefix'] ?? '';
        $overrideFolder = array_key_exists('folderId', $options);
        $autoShare      = $options['autoShare'] ?? true;
        $successMessage = $options['successMessage'] ?? 'Note cloned successfully';
        $extraResponse  = $options['extraResponse'] ?? [];

        try {
            $stmt = $this->con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$id]);
            $originalNote = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$originalNote) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $workspace  = $originalNote['workspace'];
            $folderId   = $overrideFolder ? ($options['folderId'] ?? null) : $originalNote['folder_id'];
            $folderName = $overrideFolder ? ($options['folderName'] ?? null) : $originalNote['folder'];

            // Generate unique heading
            $originalHeading = $originalNote['heading'] ?: t('index.note.new_note', [], 'New note');
            $newHeading = generateUniqueTitle($headingPrefix . $originalHeading, null, $workspace, $folderId);

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
                $folderName,
                $folderId,
                $workspace,
                $originalNote['type'],
                $newAttachments
            ]);

            $newId = $this->con->lastInsertId();

            // Auto-share if folder is shared
            $wasShared = false;
            if ($autoShare && $folderId) {
                $sharedFolderStmt = $this->con->prepare("SELECT id, theme, indexable FROM shared_folders WHERE folder_id = ? LIMIT 1");
                $sharedFolderStmt->execute([$folderId]);
                $sharedFolder = $sharedFolderStmt->fetch(PDO::FETCH_ASSOC);

                if ($sharedFolder) {
                    $noteToken = bin2hex(random_bytes(16));
                    $insertShareStmt = $this->con->prepare("INSERT INTO shared_notes (note_id, token, theme, indexable) VALUES (?, ?, ?, ?)");
                    $insertShareStmt->execute([$newId, $noteToken, $sharedFolder['theme'], $sharedFolder['indexable']]);
                    $wasShared = true;
                }
            }

            // Write file
            $newFilename = getEntryFilename($newId, $originalNote['type']);
            if (!empty($content)) {
                file_put_contents($newFilename, $content);
                chmod($newFilename, 0644);
            }

            http_response_code(201);
            $this->sendSuccess(array_merge([
                'id' => $newId,
                'heading' => $newHeading,
                'message' => $successMessage,
                'share_delta' => $wasShared ? 1 : 0
            ], $extraResponse));

        } catch (Exception $e) {
            $this->sendError(500, $successMessage . ' failed: ' . $e->getMessage());
        }
    }

    /**
     * POST /api/v1/notes/{id}/duplicate
     * Duplicate a note
     */
    public function duplicate(string $id): void {
        $this->cloneNote($id, [
            'successMessage' => 'Note duplicated successfully',
        ]);
    }
    
    /**
     * POST /api/v1/notes/{id}/create-template
     * Create a template from a note (duplicate it to Templates folder)
     */
    public function createTemplate(string $id): void {
        try {
            // Get note workspace to find/create Templates folder
            $stmt = $this->con->prepare("SELECT workspace FROM entries WHERE id = ? AND trash = 0");
            $stmt->execute([$id]);
            $noteData = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$noteData) {
                $this->sendError(404, 'Note not found');
                return;
            }

            $workspace = $noteData['workspace'];

            // Get or create the "Templates" folder
            $folderStmt = $this->con->prepare("SELECT id FROM folders WHERE name = 'Templates' AND workspace = ? AND parent_id IS NULL");
            $folderStmt->execute([$workspace]);
            $templatesFolder = $folderStmt->fetch(PDO::FETCH_ASSOC);

            if ($templatesFolder) {
                $templatesFolderId = (int)$templatesFolder['id'];
            } else {
                $createFolderStmt = $this->con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES ('Templates', ?, NULL, datetime('now'))");
                $createFolderStmt->execute([$workspace]);
                $templatesFolderId = (int)$this->con->lastInsertId();
            }

            $this->cloneNote($id, [
                'headingPrefix' => '[Template] ',
                'folderId' => $templatesFolderId,
                'folderName' => 'Templates',
                'autoShare' => false,
                'successMessage' => 'Template created successfully',
                'extraResponse' => ['folder_id' => $templatesFolderId],
            ]);
        } catch (Exception $e) {
            $this->sendError(500, 'Error creating template: ' . $e->getMessage());
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
            $query = "SELECT id, heading, entry, attachments, updated 
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
                        'entry' => $row['entry'],
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
                        
                        $extensionMap = [
                            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
                            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) return $matches[0];
                        
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;
                        $filePath = $attachmentsDir . '/' . $filename;
                        
                        if (file_put_contents($filePath, $imageData) === false) return $matches[0];
                        chmod($filePath, 0644);
                        
                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $attachments[] = [
                            'id' => $attachmentId, 'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData), 'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        
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
                        
                        $extensionMap = [
                            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
                            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
                        ];
                        $extension = $extensionMap[$imageType] ?? 'png';
                        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
                        
                        $imageData = base64_decode($base64Data);
                        if ($imageData === false) return $matches[0];
                        
                        $attachmentId = uniqid();
                        $filename = $attachmentId . '_' . time() . '.' . $extension;
                        $filePath = $attachmentsDir . '/' . $filename;
                        
                        if (file_put_contents($filePath, $imageData) === false) return $matches[0];
                        chmod($filePath, 0644);
                        
                        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
                        $attachments[] = [
                            'id' => $attachmentId, 'filename' => $filename,
                            'original_filename' => $originalFilename,
                            'file_size' => strlen($imageData), 'file_type' => $mimeType,
                            'uploaded_at' => date('Y-m-d H:i:s')
                        ];
                        
                        return '<img src="/api/v1/notes/' . $id . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '">';
                    },
                    $content
                );
                
                $convertedContent = $this->htmlToMarkdown($content);
                $newType = 'markdown';
            } else {
                // Converting markdown to HTML: keep attachments as attachments (don't convert to base64)
                // The parseMarkdown function will convert markdown image syntax to HTML img tags
                // and keep the attachment URLs intact
                
                require_once __DIR__ . '/../../../markdown_parser.php';
                $convertedContent = parseMarkdown($content);
                $newType = 'note';
                
                // Note: Attachments are preserved during conversion
                // No files are deleted, all attachments remain available
            }
            
            // Create new file with converted content
            $newFilePath = getEntryFilename($id, $newType);
            if (file_put_contents($newFilePath, $convertedContent) === false) {
                $this->sendError(500, 'Failed to save converted note');
                return;
            }
            chmod($newFilePath, 0644);
            
            // Update database
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
     * Convert HTML to Markdown
     * Handles: headers, bold, italic, strikethrough, links, images, line breaks,
     * paragraphs, lists (ordered/unordered/checklists), code blocks, inline code,
     * blockquotes, callouts, toggle blocks, tables, horizontal rules, audio/video.
     */
    private function htmlToMarkdown(string $html): string {
        $md = $html;
        
        // Remove copy buttons from code blocks first
        $md = preg_replace('/<button[^>]*class="[^"]*code-block-copy-btn[^"]*"[^>]*>.*?<\/button>/is', '', $md);
        
        // Remove SVG icons (callout icons, etc.)
        $md = preg_replace('/<svg[^>]*>.*?<\/svg>/is', '', $md);
        
        // ---- Code blocks (must be processed FIRST to protect content) ----
        
        // Handle <pre><code class="language-xxx">...</code></pre>
        $md = preg_replace_callback('/<pre[^>]*>\s*<code[^>]*(?:class=["\'][^"\']*language-([a-zA-Z0-9_+-]+)[^"\']*["\'])[^>]*>(.*?)<\/code>\s*<\/pre>/is', function($matches) {
            $lang = $matches[1];
            $code = html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $code = strip_tags($code);
            return "\n\n```" . $lang . "\n" . trim($code) . "\n```\n\n";
        }, $md);
        
        // Handle <pre><code>...</code></pre> without language
        $md = preg_replace_callback('/<pre[^>]*>\s*<code[^>]*>(.*?)<\/code>\s*<\/pre>/is', function($matches) {
            $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $code = strip_tags($code);
            return "\n\n```\n" . trim($code) . "\n```\n\n";
        }, $md);
        
        // Handle <pre>...</pre> without <code> tag
        $md = preg_replace_callback('/<pre[^>]*>(.*?)<\/pre>/is', function($matches) {
            $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $code = strip_tags($code);
            return "\n\n```\n" . trim($code) . "\n```\n\n";
        }, $md);
        
        // ---- Toggle blocks (<details class="toggle-block">) ----
        $md = preg_replace_callback('/<details[^>]*class="[^"]*toggle-block[^"]*"[^>]*>\s*<summary[^>]*>(.*?)<\/summary>\s*(?:<div[^>]*class="[^"]*toggle-content[^"]*"[^>]*>(.*?)<\/div>)?\s*<\/details>/is', function($matches) {
            $summary = strip_tags(trim($matches[1]));
            $content = isset($matches[2]) ? trim($matches[2]) : '';
            $innerMd = $content ? $this->htmlToMarkdown($content) : '';
            return "\n\n<details>\n<summary>" . $summary . "</summary>\n\n" . $innerMd . "\n\n</details>\n\n";
        }, $md);
        
        // Handle generic <details>/<summary>
        $md = preg_replace_callback('/<details[^>]*>\s*<summary[^>]*>(.*?)<\/summary>(.*?)<\/details>/is', function($matches) {
            $summary = strip_tags(trim($matches[1]));
            $content = trim($matches[2]);
            $innerMd = $content ? $this->htmlToMarkdown($content) : '';
            return "\n\n<details>\n<summary>" . $summary . "</summary>\n\n" . $innerMd . "\n\n</details>\n\n";
        }, $md);
        
        // ---- Callouts (<aside class="callout callout-xxx">) ----
        $md = preg_replace_callback('/<aside[^>]*class="[^"]*callout\s+callout-([a-z]+)[^"]*"[^>]*>\s*<div[^>]*class="[^"]*callout-title[^"]*"[^>]*>.*?<span[^>]*class="[^"]*callout-title-text[^"]*"[^>]*>(.*?)<\/span>\s*<\/div>\s*<div[^>]*class="[^"]*callout-body[^"]*"[^>]*>(.*?)<\/div>\s*<\/aside>/is', function($matches) {
            $type = $matches[1];
            $title = strip_tags(trim($matches[2]));
            $body = trim($matches[3]);
            $innerMd = $body ? $this->htmlToMarkdown($body) : '';
            $lines = "> [!" . strtoupper($type) . "] " . $title . "\n";
            foreach (explode("\n", $innerMd) as $line) {
                $lines .= "> " . $line . "\n";
            }
            return "\n\n" . rtrim($lines) . "\n\n";
        }, $md);
        
        // ---- Tables ----
        $md = preg_replace_callback('/<table[^>]*>(.*?)<\/table>/is', function($matches) {
            $tableHtml = $matches[1];
            $rows = [];
            preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $tableHtml, $rowMatches);
            foreach ($rowMatches[1] as $rowHtml) {
                $cells = [];
                preg_match_all('/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/is', $rowHtml, $cellMatches);
                foreach ($cellMatches[1] as $cellHtml) {
                    $cells[] = trim(strip_tags($cellHtml));
                }
                if (!empty($cells)) $rows[] = $cells;
            }
            if (empty($rows)) return '';
            $result = "\n\n";
            $result .= "| " . implode(" | ", $rows[0]) . " |\n";
            $result .= "| " . implode(" | ", array_fill(0, count($rows[0]), '---')) . " |\n";
            for ($i = 1; $i < count($rows); $i++) {
                while (count($rows[$i]) < count($rows[0])) $rows[$i][] = '';
                $result .= "| " . implode(" | ", $rows[$i]) . " |\n";
            }
            return $result . "\n";
        }, $md);
        
        // ---- Checklists / Task lists ----
        $md = preg_replace_callback('/<li[^>]*class="[^"]*task-item[^"]*"[^>]*>.*?<input[^>]*type=["\']checkbox["\'][^>]*(checked)?[^>]*\/?>\s*(.*?)<\/li>/is', function($matches) {
            $checked = !empty($matches[1]);
            $text = strip_tags(trim($matches[2]));
            return ($checked ? "- [x] " : "- [ ] ") . $text . "\n";
        }, $md);
        
        $md = preg_replace_callback('/<li[^>]*>\s*<input[^>]*type=["\']checkbox["\'][^>]*(checked)?[^>]*\/?>\s*(.*?)<\/li>/is', function($matches) {
            $checked = !empty($matches[1]);
            $text = strip_tags(trim($matches[2]));
            return ($checked ? "- [x] " : "- [ ] ") . $text . "\n";
        }, $md);
        
        // ---- Ordered lists ----
        $md = preg_replace_callback('/<ol[^>]*>(.*?)<\/ol>/is', function($matches) {
            $items = [];
            preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $matches[1], $liMatches);
            $i = 1;
            foreach ($liMatches[1] as $liContent) {
                $items[] = $i . ". " . strip_tags(trim($liContent));
                $i++;
            }
            return "\n\n" . implode("\n", $items) . "\n\n";
        }, $md);
        
        // ---- Unordered lists ----
        $md = preg_replace_callback('/<ul[^>]*>(.*?)<\/ul>/is', function($matches) {
            $items = [];
            preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $matches[1], $liMatches);
            foreach ($liMatches[1] as $liContent) {
                $text = strip_tags(trim($liContent));
                if (!empty($text)) $items[] = "- " . $text;
            }
            return "\n\n" . implode("\n", $items) . "\n\n";
        }, $md);
        
        // ---- Headers ----
        $md = preg_replace('/<h1[^>]*>(.*?)<\/h1>/is', "\n\n# $1\n\n", $md);
        $md = preg_replace('/<h2[^>]*>(.*?)<\/h2>/is', "\n\n## $1\n\n", $md);
        $md = preg_replace('/<h3[^>]*>(.*?)<\/h3>/is', "\n\n### $1\n\n", $md);
        $md = preg_replace('/<h4[^>]*>(.*?)<\/h4>/is', "\n\n#### $1\n\n", $md);
        $md = preg_replace('/<h5[^>]*>(.*?)<\/h5>/is', "\n\n##### $1\n\n", $md);
        $md = preg_replace('/<h6[^>]*>(.*?)<\/h6>/is', "\n\n###### $1\n\n", $md);
        
        // ---- Structural elements (Paragraphs, Divs, Line breaks) ----
        // Doing this before inline formatting prevents bold/italic from wrapping across blocks
        
        // Horizontal rule
        $md = preg_replace('/<hr\s*\/?>/i', "\n\n---\n\n", $md);
        
        // Line breaks
        $md = preg_replace('/<br\s*\/?>/i', "\n", $md);
        
        // Paragraphs
        $md = preg_replace('/<p[^>]*>(.*?)<\/p>/is', "$1\n\n", $md);
        
        // Divs
        $md = preg_replace('/<div[^>]*>(.*?)<\/div>/is', "$1\n", $md);
        
        // ---- Inline formatting ----
        // Bold: handles both <strong> and <b>, avoids double wrapping
        $md = preg_replace_callback('/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/is', function($matches) {
            $inner = $matches[1];
            // Keep nested formatting but strip others
            $inner = strip_tags($inner, '<em><i><code><a><del><s><strike><u><mark><span>');
            preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
            $text = $parts[2];
            if ($text === '') return $parts[1] . $parts[3];
            return $parts[1] . '**' . $text . '**' . $parts[3];
        }, $md);
        
        // Italic: handles both <em> and <i>, avoids double wrapping
        $md = preg_replace_callback('/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/is', function($matches) {
            if (isset($matches[0]) && strpos($matches[0], 'class="fa') !== false) return ''; // Skip FontAwesome
            $inner = $matches[1];
            $inner = strip_tags($inner, '<strong><b><code><a><del><s><strike><u><mark><span>');
            preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
            $text = $parts[2];
            if ($text === '') return $parts[1] . $parts[3];
            return $parts[1] . '*' . $text . '*' . $parts[3];
        }, $md);
        
        // Strikethrough: handles del, s, strike
        $md = preg_replace_callback('/<(?:del|s|strike)[^>]*>(.*?)<\/(?:del|s|strike)>/is', function($matches) {
            $inner = strip_tags($matches[1], '<strong><b><em><i><code><a><u><mark><span>');
            preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
            $text = $parts[2];
            if ($text === '') return $parts[1] . $parts[3];
            return $parts[1] . '~~' . $text . '~~' . $parts[3];
        }, $md);
        
        $md = preg_replace('/<u[^>]*>(.*?)<\/u>/is', "<u>$1</u>", $md);
        
        $md = preg_replace_callback('/<mark[^>]*>(.*?)<\/mark>/is', function($matches) {
            $inner = strip_tags($matches[1], '<strong><b><em><i><code><a><u><span>');
            preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
            $text = $parts[2];
            if ($text === '') return $parts[1] . $parts[3];
            return $parts[1] . '==' . $text . '==' . $parts[3];
        }, $md);
        
        // Colors & Backgrounds (preserves span with style)
        // Detect spans with style and keep them if they have color or background
        $md = preg_replace_callback('/<span[^>]*style=["\']([^"\']*(?:color|background)[^"\']*)["\'][^>]*>(.*?)<\/span>/is', function($matches) {
            $style = $matches[1];
            $inner = $matches[2];
            return '<span style="' . $style . '">' . $inner . '</span>';
        }, $md);
        
        // ---- Links & Media ----
        
        // Inline code
        $md = preg_replace_callback('/<code[^>]*>(.*?)<\/code>/is', function($matches) {
            $code = $matches[1];
            if (strpos($code, "\n") !== false || strlen($code) > 100) {
                $code = html_entity_decode($code, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $code = strip_tags($code);
                return "\n\n```\n" . trim($code) . "\n```\n\n";
            }
            return "`" . html_entity_decode(strip_tags($code), ENT_QUOTES | ENT_HTML5, 'UTF-8') . "`";
        }, $md);
        
        // Links
        $md = preg_replace('/<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)<\/a>/is', "[$2]($1)", $md);
        
        // Images
        $md = preg_replace('/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']([^"\']*)["\'][^>]*\/?>/is', "![$1]($2)", $md);
        $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*\/?>/is', "![$2]($1)", $md);
        $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*\/?>/is', "![]($1)", $md);
        
        // Audio / Video / Iframe
        $md = preg_replace('/<audio[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/audio>/is', '[$1]($1)', $md);
        $md = preg_replace('/<video[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/video>/is', '[$1]($1)', $md);
        $md = preg_replace('/<iframe[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/iframe>/is', '[$1]($1)', $md);
        
        // Blockquotes
        $md = preg_replace_callback('/<blockquote[^>]*>(.*?)<\/blockquote>/is', function($matches) {
            $inner = trim(strip_tags($matches[1], '<strong><b><em><i><code><a><u><mark><span>'));
            $lines = explode("\n", $inner);
            $quoted = '';
            foreach ($lines as $line) {
                $quoted .= "> " . trim($line) . "\n";
            }
            return "\n\n" . rtrim($quoted) . "\n\n";
        }, $md);
        
        // ---- Cleanup ----
        
        // Remove span tags WITHOUT style attribute (keep those with style)
        $md = preg_replace_callback('/<span([^>]*)>(.*?)<\/span>/is', function($matches) {
            $attrs = $matches[1];
            $inner = $matches[2];
            if (stripos($attrs, 'style=') !== false) {
                return '<span' . $attrs . '>' . $inner . '</span>';
            }
            return $inner;
        }, $md);
        
        // Remove remaining HTML tags (keep details/summary/u/span)
        $md = strip_tags($md, '<details><summary><u><span>');
        
        // ---- Convert HTML entities ----
        $md = html_entity_decode($md, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        // Replace non-breaking spaces
        $md = str_replace("\xC2\xA0", ' ', $md);
        // Remove zero-width spaces
        $md = str_replace("\xE2\x80\x8B", '', $md);
        
        // Clean up lines that are only whitespace
        $md = preg_replace('/^[ \t]+$/m', '', $md);
        
        // Clean up excessive newlines
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
            $this->sendError(500, 'Search error occurred');
        }
    }
    
    /**
     * Sanitize and normalize a tags value (string or array) into a clean comma-separated string.
     */
    private function sanitizeTags($tags): string {
        if (empty($tags)) return '';
        if (is_array($tags)) {
            $tagsArray = $tags;
        } else {
            $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
        }
        $validTags = [];
        foreach ($tagsArray as $tag) {
            $tag = is_string($tag) ? trim($tag) : '';
            if (!empty($tag)) {
                $tag = str_replace(' ', '_', $tag);
                $validTags[] = $tag;
            }
        }
        return implode(', ', $validTags);
    }
    
    /**
     * Convert base64 images in HTML content to attachments
     * @param string $content HTML content with potential base64 images
     * @param int $noteId Note ID for attachment URLs
     * @param array $existingAttachments Existing attachments array
     * @return array ['content' => modified HTML, 'new_attachments' => array of new attachments]
     */
    private function convertBase64ImagesToAttachments(string $content, int $noteId, array $existingAttachments): array {
        $newAttachments = [];
        $attachmentsDir = getAttachmentsPath();
        
        // Pattern 1: src before alt - <img src="data:image/...;base64,..." alt="...">
        $content = preg_replace_callback(
            '/<img[^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*\/?>/is',
            function($matches) use ($noteId, $attachmentsDir, &$newAttachments) {
                return $this->processBase64Image($matches[1], $matches[2], $matches[3] ?? '', $noteId, $attachmentsDir, $newAttachments);
            },
            $content
        );
        
        // Pattern 2: alt before src - <img alt="..." src="data:image/...;base64,...">
        $content = preg_replace_callback(
            '/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']data:image\/([a-zA-Z0-9+]+);base64,([^"\']+)["\'][^>]*\/?>/is',
            function($matches) use ($noteId, $attachmentsDir, &$newAttachments) {
                return $this->processBase64Image($matches[2], $matches[3], $matches[1], $noteId, $attachmentsDir, $newAttachments);
            },
            $content
        );
        
        return [
            'content' => $content,
            'new_attachments' => $newAttachments
        ];
    }
    
    /**
     * Process a single base64 image and convert to attachment
     */
    private function processBase64Image(string $imageType, string $base64Data, string $altText, int $noteId, string $attachmentsDir, array &$newAttachments): string {
        $imageType = strtolower($imageType);
        
        $extensionMap = [
            'jpeg' => 'jpg', 'png' => 'png', 'gif' => 'gif',
            'webp' => 'webp', 'svg+xml' => 'svg', 'bmp' => 'bmp'
        ];
        $extension = $extensionMap[$imageType] ?? 'png';
        $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);
        
        $imageData = base64_decode($base64Data);
        if ($imageData === false) {
            // Return original if decode fails
            return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
        }
        
        $attachmentId = uniqid();
        $filename = $attachmentId . '_' . time() . '.' . $extension;
        $filePath = $attachmentsDir . '/' . $filename;
        
        if (file_put_contents($filePath, $imageData) === false) {
            // Return original if write fails
            return '<img src="data:image/' . $imageType . ';base64,' . $base64Data . '" alt="' . htmlspecialchars($altText) . '">';
        }
        chmod($filePath, 0644);
        
        $originalFilename = !empty($altText) ? $altText . '.' . $extension : $filename;
        $newAttachments[] = [
            'id' => $attachmentId,
            'filename' => $filename,
            'original_filename' => $originalFilename,
            'file_size' => strlen($imageData),
            'file_type' => $mimeType,
            'uploaded_at' => date('Y-m-d H:i:s')
        ];
        
        return '<img src="/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . '" alt="' . htmlspecialchars($altText) . '" loading="lazy" decoding="async">';
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

    /**
     * Trigger automatic Git synchronization if enabled
     */
    private function triggerGitSync(int $noteId, string $action = 'push'): void {
        try {
            $gitSyncFile = dirname(__DIR__, 3) . '/GitSync.php';
            if (file_exists($gitSyncFile)) {
                require_once $gitSyncFile;
                // GitSync constructor handles its own requirements
                $gitSync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
                if ($gitSync->isAutoPushEnabled()) {
                    if ($action === 'push') {
                        $gitSync->pushNote($noteId);
                    } elseif ($action === 'delete') {
                        // For deletion, we need headings from database (trash=1 is fine here)
                        $stmt = $this->con->prepare("SELECT heading, folder_id, workspace, type FROM entries WHERE id = ?");
                        $stmt->execute([$noteId]);
                        $note = $stmt->fetch(PDO::FETCH_ASSOC);
                        if ($note) {
                            $gitSync->deleteNoteInGit($note['heading'], $note['folder_id'], $note['workspace'], $note['type']);
                        }
                    }
                }
            }
        } catch (Exception $e) {
            // Silently log error to not block main API response
            error_log("Git auto-sync error: " . $e->getMessage());
        }
    }
}
