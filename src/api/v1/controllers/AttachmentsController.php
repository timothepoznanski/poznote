<?php
/**
 * AttachmentsController - RESTful API controller for note attachments
 * 
 * Endpoints:
 *   GET    /api/v1/notes/{noteId}/attachments                   - List attachments for a note
 *   POST   /api/v1/notes/{noteId}/attachments                   - Upload an attachment
 *   GET    /api/v1/notes/{noteId}/attachments/{attachmentId}    - Download an attachment
 *   DELETE /api/v1/notes/{noteId}/attachments/{attachmentId}    - Delete an attachment
 */

require_once __DIR__ . '/../../../note_loader.php';

class AttachmentsController {
    private $con;
    private $attachmentsDir;
    
    public function __construct($con) {
        $this->con = $con;
        $this->attachmentsDir = $this->getAttachmentsPath();
        $this->ensureDirectory();
    }
    
    /**
     * Get the attachments directory path
     */
    private function getAttachmentsPath() {
        return getAttachmentsPath();
    }
    
    /**
     * Ensure attachments directory exists and is writable
     */
    private function ensureDirectory() {
        if (!file_exists($this->attachmentsDir)) {
            if (!mkdir($this->attachmentsDir, 0755, true)) {
                error_log("Failed to create attachments directory: " . $this->attachmentsDir);
            } else {
                chmod($this->attachmentsDir, 0755);
            }
        }
    }

    private function appendPublicWorkspaceAgeFilter(string &$query, array &$params, string $column = 'updated'): void {
        if (!function_exists('isPublicWorkspaceAccessActive') || !isPublicWorkspaceAccessActive()) {
            return;
        }

        $cutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($this->con));
        if ($cutoff === null) {
            return;
        }

        $query .= " AND $column >= ?";
        $params[] = $cutoff;
    }

    private function appendConfiguredNoteAgeFilter(string &$query, array &$params, string $column = 'updated'): void {
        $cutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($this->con));
        if ($cutoff === null) {
            return;
        }

        $query .= " AND $column >= ?";
        $params[] = $cutoff;
    }

    private function getSafeInlineTextContentType(array $attachment): ?string {
        $filename = $attachment['original_filename'] ?? $attachment['filename'] ?? '';
        $extension = strtolower(pathinfo((string)$filename, PATHINFO_EXTENSION));

        $inlineTypes = [
            'txt' => 'text/plain; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'csv' => 'text/csv; charset=utf-8',
            'xml' => 'application/xml; charset=utf-8',
            'md' => 'text/plain; charset=utf-8',
            'markdown' => 'text/plain; charset=utf-8',
            'log' => 'text/plain; charset=utf-8',
            'ini' => 'text/plain; charset=utf-8',
            'cfg' => 'text/plain; charset=utf-8',
            'conf' => 'text/plain; charset=utf-8',
            'toml' => 'text/plain; charset=utf-8',
            'sql' => 'text/plain; charset=utf-8',
            'yml' => 'text/plain; charset=utf-8',
            'yaml' => 'text/plain; charset=utf-8',
        ];

        return $inlineTypes[$extension] ?? null;
    }
    
    /**
     * GET /api/v1/notes/{noteId}/attachments
     * List all attachments for a note
     */
    public function index($noteId) {
        $workspace = $_GET['workspace'] ?? null;
        
        if (empty($noteId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Note ID is required']);
            return;
        }
        
        try {
            if ($workspace) {
                $query = "SELECT entry, attachments FROM entries WHERE id = ? AND workspace = ?";
                $params = [$noteId, $workspace];
                $this->appendPublicWorkspaceAgeFilter($query, $params);
                $stmt = $this->con->prepare($query);
                $stmt->execute($params);
            } else {
                $query = "SELECT entry, attachments FROM entries WHERE id = ?";
                $params = [$noteId];
                $this->appendPublicWorkspaceAgeFilter($query, $params);
                $stmt = $this->con->prepare($query);
                $stmt->execute($params);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result) {
                $attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
                $entry = $result['entry'] ?? '';
                echo json_encode(['success' => true, 'attachments' => $attachments, 'entry' => $entry]);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Note not found']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error fetching attachments: ' . $e->getMessage()]);
        }
    }
    
    /**
     * POST /api/v1/notes/{noteId}/attachments
     * Upload an attachment to a note
     */
    public function store($noteId) {
        $workspace = $_POST['workspace'] ?? null;
        
        if (empty($noteId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Note ID is required']);
            return;
        }
        
        if (!isset($_FILES['file'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No file uploaded']);
            return;
        }
        
        $file = $_FILES['file'];
        
        // Enhanced error checking for file uploads
        switch($file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_NO_FILE:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'No file sent']);
                return;
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                http_response_code(413);
                echo json_encode(['success' => false, 'message' => 'File too large']);
                return;
            case UPLOAD_ERR_PARTIAL:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'File upload was interrupted']);
                return;
            default:
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Unknown upload error']);
                return;
        }
        
        $original_name = $file['name'];
        $file_size = $file['size'];
        $file_type = $file['type'];
        
        // Generate unique filename
        $file_extension = pathinfo($original_name, PATHINFO_EXTENSION);
        $unique_filename = uniqid() . '_' . time() . '.' . $file_extension;
        $file_path = $this->attachmentsDir . '/' . $unique_filename;
        
        // Check if source file exists and is readable
        if (!is_uploaded_file($file['tmp_name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid uploaded file']);
            return;
        }
        
        // Check file size (200MB limit)
        if ($file_size > 200 * 1024 * 1024) {
            http_response_code(413);
            echo json_encode(['success' => false, 'message' => 'File too large (max 200MB)']);
            return;
        }
        
        // Check if destination directory is writable
        if (!is_writable($this->attachmentsDir)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Attachments directory is not writable']);
            return;
        }
        
        try {
            // Move uploaded file
            if (move_uploaded_file($file['tmp_name'], $file_path)) {
                chmod($file_path, 0644);
                
                // Get current attachments
                if ($workspace) {
                    $query = "SELECT attachments FROM entries WHERE id = ? AND workspace = ?";
                    $stmt = $this->con->prepare($query);
                    $stmt->execute([$noteId, $workspace]);
                } else {
                    $query = "SELECT attachments FROM entries WHERE id = ?";
                    $stmt = $this->con->prepare($query);
                    $stmt->execute([$noteId]);
                }
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($result) {
                    $current_attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
                    
                    // Add new attachment
                    $new_attachment = [
                        'id' => uniqid(),
                        'filename' => $unique_filename,
                        'original_filename' => $original_name,
                        'file_size' => $file_size,
                        'file_type' => $file_type,
                        'uploaded_at' => date('Y-m-d H:i:s')
                    ];
                    
                    $current_attachments[] = $new_attachment;
                    
                    // Update database
                    $attachments_json = json_encode($current_attachments);
                    if ($workspace) {
                        $update_query = "UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ?";
                        $update_stmt = $this->con->prepare($update_query);
                        $success = $update_stmt->execute([$attachments_json, $noteId, $workspace]);
                    } else {
                        $update_query = "UPDATE entries SET attachments = ? WHERE id = ?";
                        $update_stmt = $this->con->prepare($update_query);
                        $success = $update_stmt->execute([$attachments_json, $noteId]);
                    }
                    
                    if ($success) {
                        $this->triggerGitSync((int)$noteId, 'push', $unique_filename);
                        
                        http_response_code(201);
                        echo json_encode([
                            'success' => true, 
                            'message' => 'File uploaded successfully',
                            'attachment_id' => $new_attachment['id'],
                            'filename' => $original_name
                        ]);
                    } else {
                        unlink($file_path);
                        http_response_code(500);
                        echo json_encode(['success' => false, 'message' => 'Database update failed']);
                    }
                } else {
                    unlink($file_path);
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Note not found']);
                }
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => 'Failed to save file']);
            }
        } catch (Exception $e) {
            if (file_exists($file_path)) {
                unlink($file_path);
            }
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error uploading attachment: ' . $e->getMessage()]);
        }
    }
    
    /**
     * GET /api/v1/notes/{noteId}/attachments/{attachmentId}
     * Download an attachment
     */
    public function show($noteId, $attachmentId) {
        $workspace = $_GET['workspace'] ?? null;
        $forceDownload = isset($_GET['download']) && $_GET['download'] !== '0';
        
        if (empty($noteId) || empty($attachmentId)) {
            http_response_code(400);
            exit('Note ID and Attachment ID are required');
        }
        
        $isPubliclyShared = $this->authorizePublicAttachmentAccess((int)$noteId);
        
        // If not publicly shared, require authentication
        if (!$isPubliclyShared) {
            // Check if user is authenticated
            $isAuthenticated = false;
            
            // Check session authentication
            if (function_exists('isAuthenticated') && isAuthenticated()) {
                $isAuthenticated = true;
            }
            
            // Check API credentials supplied with the request.
            if (!$isAuthenticated && getApiBearerToken() !== null) {
                authenticateApiBearerToken();
                $isAuthenticated = true;
            }

            if (!$isAuthenticated) {
                $basicCredentials = getApiBasicCredentials();
                if ($basicCredentials !== null) {
                    require_once __DIR__ . '/../../../users/db_master.php';
                    $loginIdentifier = $basicCredentials['username'];
                    $authUser = ctype_digit($loginIdentifier)
                        ? getUserProfileById((int) $loginIdentifier)
                        : getUserProfileByUsername($loginIdentifier);

                    if ($authUser && $authUser['active'] && verifyUserPassword((int)$authUser['id'], $basicCredentials['password'])) {
                        $isAuthenticated = true;
                    }
                }
            }

            if (!$isAuthenticated) {
                http_response_code(401);
                if (!(defined('OIDC_DISABLE_BASIC_AUTH') && OIDC_DISABLE_BASIC_AUTH)) {
                    header('WWW-Authenticate: Basic realm="Poznote API"');
                }
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Authentication required']);
                exit;
            }
        }
        
        try {
            // Get attachment info
            if ($workspace) {
                $query = "SELECT attachments FROM entries WHERE id = ? AND workspace = ?";
                $params = [$noteId, $workspace];
                $this->appendPublicWorkspaceAgeFilter($query, $params);
                $stmt = $this->con->prepare($query);
                $stmt->execute($params);
            } else {
                $query = "SELECT attachments FROM entries WHERE id = ?";
                $params = [$noteId];
                $this->appendPublicWorkspaceAgeFilter($query, $params);
                $stmt = $this->con->prepare($query);
                $stmt->execute($params);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result) {
                $attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
                
                foreach ($attachments as $attachment) {
                    if ($attachment['id'] === $attachmentId) {
                        $file_path = $this->attachmentsDir . '/' . $attachment['filename'];
                        
                        if (file_exists($file_path)) {
                            // Clear any output buffer
                            while (ob_get_level()) {
                                ob_end_clean();
                            }
                            
                            // Set headers for file download/viewing
                            $file_type = $attachment['file_type'] ?? mime_content_type($file_path);
                            
                            // Sanitize filename for Content-Disposition header
                            $safeFilename = str_replace(['"', "\r", "\n"], '', $attachment['original_filename']);
                            
                            $inlineTextContentType = $this->getSafeInlineTextContentType($attachment);

                            if ($forceDownload) {
                                header('Content-Type: application/octet-stream');
                                header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
                            // Allow a small whitelist of passive text formats to be viewed directly.
                            } elseif ($inlineTextContentType !== null) {
                                header('Content-Type: ' . $inlineTextContentType);
                                header('Content-Disposition: inline; filename="' . $safeFilename . '"');
                            } elseif (strpos($file_type, 'application/pdf') !== false || 
                                strpos($file_type, 'image/') !== false || 
                                strpos($file_type, 'video/') !== false ||
                                strpos($file_type, 'audio/') !== false) {
                                header('Content-Type: ' . $file_type);
                                header('Content-Disposition: inline; filename="' . $safeFilename . '"');
                            } else {
                                // For other files, force download
                                header('Content-Type: application/octet-stream');
                                header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
                            }
                            
                            header('Content-Description: File Transfer');
                            header('Expires: 0');
                            header('Cache-Control: must-revalidate');
                            header('Pragma: public');
                            header('Content-Length: ' . filesize($file_path));
                            
                            readfile($file_path);
                            exit;
                        } else {
                            http_response_code(404);
                            exit('File not found');
                        }
                    }
                }
                
                http_response_code(404);
                exit('Attachment not found');
            } else {
                http_response_code(404);
                exit('Note not found');
            }
        } catch (Exception $e) {
            http_response_code(500);
            exit('Error: ' . $e->getMessage());
        }
    }

    private function authorizePublicAttachmentAccess(int $noteId): bool {
        $noteToken = trim((string)($_GET['token'] ?? ''));
        $folderToken = trim((string)($_GET['folder_token'] ?? ''));

        try {
            if ($noteToken !== '' && $this->authorizePublicNoteAttachment($noteId, $noteToken)) {
                return true;
            }

            if ($folderToken !== '' && $this->authorizePublicFolderAttachment($noteId, $folderToken)) {
                return true;
            }
        } catch (Exception $e) {
            error_log('Failed to authorize public attachment: ' . $e->getMessage());
        }

        return false;
    }

    private function authorizePublicNoteAttachment(int $noteId, string $token): bool {
        $registryRow = $this->getSharedLinkRegistryRow($token, 'note');
        $ownerId = null;

        if ($registryRow) {
            if ((int)$registryRow['target_id'] !== $noteId) {
                return false;
            }
            $ownerId = (int)$registryRow['user_id'];
            if (!$this->switchToUserData($ownerId)) {
                return false;
            }
        }

        $stmt = $this->con->prepare('SELECT note_id, password, allowed_users FROM shared_notes WHERE token = ? AND note_id = ? AND access_mode IS NOT NULL LIMIT 1');
        $stmt->execute([$token, $noteId]);
        $sharedNote = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedNote) {
            return false;
        }

        $ownerId = $ownerId ?? $this->getActiveOwnerId();
        $passedUserRestriction = false;
        if (!$this->validateAllowedUsers($sharedNote['allowed_users'] ?? null, $ownerId, $passedUserRestriction)) {
            return false;
        }

        if (!$this->validatePublicPassword($sharedNote['password'] ?? null, 'public_note_auth_' . $token)) {
            return false;
        }

        return $this->validateProtectedFolderContext($noteId, $ownerId, $passedUserRestriction);
    }

    private function authorizePublicFolderAttachment(int $noteId, string $token): bool {
        $registryRow = $this->getSharedLinkRegistryRow($token, 'folder');
        $ownerId = null;

        if ($registryRow) {
            $ownerId = (int)$registryRow['user_id'];
            if (!$this->switchToUserData($ownerId)) {
                return false;
            }
        }

        $stmt = $this->con->prepare('SELECT folder_id, password, allowed_users FROM shared_folders WHERE token = ? LIMIT 1');
        $stmt->execute([$token]);
        $sharedFolder = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedFolder) {
            return false;
        }

        if ($registryRow && (int)$registryRow['target_id'] !== (int)$sharedFolder['folder_id']) {
            return false;
        }

        if (!$this->noteBelongsToSharedFolder($noteId, (int)$sharedFolder['folder_id'])) {
            return false;
        }

        $ownerId = $ownerId ?? $this->getActiveOwnerId();
        $passedUserRestriction = false;
        if (!$this->validateAllowedUsers($sharedFolder['allowed_users'] ?? null, $ownerId, $passedUserRestriction)) {
            return false;
        }

        if (!$passedUserRestriction && !$this->validatePublicPassword($sharedFolder['password'] ?? null, 'public_folder_auth_' . $token)) {
            return false;
        }

        return $this->validateProtectedFolderContext($noteId, $ownerId, $passedUserRestriction);
    }

    private function getSharedLinkRegistryRow(string $token, string $targetType): ?array {
        try {
            require_once __DIR__ . '/../../../users/db_master.php';
            $masterCon = getMasterConnection();
            $stmt = $masterCon->prepare('SELECT user_id, target_type, target_id FROM shared_links WHERE token = ? AND target_type = ? LIMIT 1');
            $stmt->execute([$token, $targetType]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ?: null;
        } catch (Exception $e) {
            error_log('Failed to read shared link registry: ' . $e->getMessage());
            return null;
        }
    }

    private function switchToUserData(int $userId): bool {
        if ($userId <= 0) {
            return false;
        }

        require_once __DIR__ . '/../../../users/UserDataManager.php';
        $userDataManager = new UserDataManager($userId);
        $dbPath = $userDataManager->getUserDatabasePath();

        $this->con = new PDO('sqlite:' . $dbPath);
        $this->con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->con->exec('PRAGMA busy_timeout = 5000');
        $this->con->exec('PRAGMA foreign_keys = ON');
        $this->attachmentsDir = $userDataManager->getUserAttachmentsPath();
        $GLOBALS['activeUserId'] = $userId;

        return true;
    }

    private function getActiveOwnerId(): ?int {
        if (isset($GLOBALS['activeUserId']) && $GLOBALS['activeUserId'] !== null) {
            return (int)$GLOBALS['activeUserId'];
        }
        if (isset($_SESSION['user_id'])) {
            return (int)$_SESSION['user_id'];
        }

        return null;
    }

    private function validateAllowedUsers($allowedUsersRaw, ?int $ownerId, bool &$passedUserRestriction): bool {
        $passedUserRestriction = false;
        $allowedUserIds = $this->decodeAllowedUserIds($allowedUsersRaw);
        if (empty($allowedUserIds)) {
            return true;
        }

        $currentUserId = $_SESSION['user_id'] ?? null;
        if ($currentUserId === null) {
            return false;
        }

        if ($ownerId !== null && (int)$currentUserId === (int)$ownerId) {
            $passedUserRestriction = true;
            return true;
        }

        $passedUserRestriction = in_array((int)$currentUserId, $allowedUserIds, true);
        return $passedUserRestriction;
    }

    private function decodeAllowedUserIds($allowedUsersRaw): array {
        if (empty($allowedUsersRaw)) {
            return [];
        }

        $decoded = is_array($allowedUsersRaw) ? $allowedUsersRaw : json_decode((string)$allowedUsersRaw, true);
        if (!is_array($decoded)) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $decoded)));
    }

    private function validatePublicPassword($passwordHash, string $sessionKey): bool {
        if (empty($passwordHash)) {
            return true;
        }

        return !empty($_SESSION[$sessionKey]);
    }

    private function validateProtectedFolderContext(int $noteId, ?int $ownerId, bool $passedUserRestriction): bool {
        $protectedFolderContext = $this->getProtectedFolderContext($noteId);
        if (!$protectedFolderContext) {
            return true;
        }

        $passedFolderRestriction = false;
        if (!$passedUserRestriction && !$this->validateAllowedUsers($protectedFolderContext['allowed_users'] ?? null, $ownerId, $passedFolderRestriction)) {
            return false;
        }

        if ($passedFolderRestriction) {
            $passedUserRestriction = true;
        }

        if (!$passedUserRestriction && !empty($protectedFolderContext['password']) && !empty($protectedFolderContext['token'])) {
            return $this->validatePublicPassword($protectedFolderContext['password'], 'public_folder_auth_' . $protectedFolderContext['token']);
        }

        return true;
    }

    private function getProtectedFolderContext(int $noteId): ?array {
        $stmt = $this->con->prepare('SELECT folder_id FROM entries WHERE id = ? AND trash = 0');
        $stmt->execute([$noteId]);
        $noteFolderData = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$noteFolderData || $noteFolderData['folder_id'] === null) {
            return null;
        }

        $stmt = $this->con->prepare(
            'WITH RECURSIVE folder_path(id, parent_id, depth) AS (
                SELECT f.id, f.parent_id, 0
                FROM folders f
                WHERE f.id = ?
                UNION ALL
                SELECT parent.id, parent.parent_id, folder_path.depth + 1
                FROM folders parent
                INNER JOIN folder_path ON folder_path.parent_id = parent.id
            )
            SELECT sf.token, sf.password, sf.allowed_users, folder_path.depth
            FROM folder_path
            INNER JOIN shared_folders sf ON sf.folder_id = folder_path.id
            WHERE (sf.password IS NOT NULL AND sf.password != "")
               OR (sf.allowed_users IS NOT NULL AND sf.allowed_users != "")
            ORDER BY folder_path.depth ASC
            LIMIT 1'
        );
        $stmt->execute([(int)$noteFolderData['folder_id']]);
        $context = $stmt->fetch(PDO::FETCH_ASSOC);

        return $context ?: null;
    }

    private function noteBelongsToSharedFolder(int $noteId, int $sharedFolderId): bool {
        $query = 'SELECT folder_id FROM entries WHERE id = ? AND trash = 0';
        $params = [$noteId];
        $this->appendConfiguredNoteAgeFilter($query, $params);
        $stmt = $this->con->prepare($query);
        $stmt->execute($params);
        $noteRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$noteRow || $noteRow['folder_id'] === null) {
            return false;
        }

        $currentFolderId = (int)$noteRow['folder_id'];
        $visited = [];

        while ($currentFolderId && !isset($visited[$currentFolderId])) {
            if ($currentFolderId === $sharedFolderId) {
                return true;
            }

            $visited[$currentFolderId] = true;
            $stmt = $this->con->prepare('SELECT parent_id FROM folders WHERE id = ?');
            $stmt->execute([$currentFolderId]);
            $folderRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$folderRow || $folderRow['parent_id'] === null) {
                break;
            }

            $currentFolderId = (int)$folderRow['parent_id'];
        }

        return false;
    }

    /**
     * DELETE /api/v1/notes/{noteId}/attachments/{attachmentId}
     * Delete an attachment
     */
    public function destroy($noteId, $attachmentId) {
        // Get workspace from query params or JSON body
        $input = json_decode(file_get_contents('php://input'), true);
        $workspace = $_GET['workspace'] ?? ($input['workspace'] ?? null);
        
        if (empty($noteId) || empty($attachmentId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Note ID and Attachment ID are required']);
            return;
        }
        
        try {
            // Get current attachments and note content
            if ($workspace) {
                $query = "SELECT attachments, entry, type FROM entries WHERE id = ? AND workspace = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$noteId, $workspace]);
            } else {
                $query = "SELECT attachments, entry, type FROM entries WHERE id = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$noteId]);
            }
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result) {
                $attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
                
                // Find and remove attachment
                $file_to_delete = null;
                $updated_attachments = [];
                
                foreach ($attachments as $attachment) {
                    if ($attachment['id'] === $attachmentId) {
                        $file_to_delete = $this->attachmentsDir . '/' . $attachment['filename'];
                    } else {
                        $updated_attachments[] = $attachment;
                    }
                }
                
                if ($file_to_delete) {
                    // Delete physical file
                    if (file_exists($file_to_delete)) {
                        unlink($file_to_delete);
                    }
                    
                    // Clean up inline references from note content to prevent 404s
                    $entry = $result['entry'] ?? '';
                    $content_changed = false;
                    
                    if (!empty($entry)) {
                        // Remove HTML <img> tags referencing this attachment
                        $html_pattern = '/<img[^>]*src=[\'"][^\'"]*' . preg_quote($attachmentId, '/') . '[^\'"]*[\'"][^>]*>/i';
                        $new_entry = preg_replace($html_pattern, '', $entry, -1, $count1);
                        
                        // Remove Markdown references: ![alt](...attachmentId...) or [...](...attachmentId...)
                        $md_pattern = '/!?(?:\[[^\]]*\])?\([^)]*' . preg_quote($attachmentId, '/') . '[^)]*\)/i';
                        $new_entry = preg_replace($md_pattern, '', $new_entry, -1, $count2);
                        
                        if ($count1 > 0 || $count2 > 0) {
                            $entry = $new_entry;
                            $content_changed = true;
                            
                            // Also update the physical file if it exists, since index.php prioritizes it
                            if (function_exists('getEntryFilename')) {
                                $noteType = $result['type'] ?? 'note';
                                $filename = getEntryFilename($noteId, $noteType);
                                if ($filename && file_exists($filename)) {
                                    file_put_contents($filename, $entry);
                                }
                            }
                        }
                    }
                    
                    // Update database
                    $attachments_json = json_encode($updated_attachments);
                    if ($workspace) {
                        if ($content_changed) {
                            $update_query = "UPDATE entries SET attachments = ?, entry = ? WHERE id = ? AND workspace = ?";
                            $update_stmt = $this->con->prepare($update_query);
                            $success = $update_stmt->execute([$attachments_json, $entry, $noteId, $workspace]);
                        } else {
                            $update_query = "UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ?";
                            $update_stmt = $this->con->prepare($update_query);
                            $success = $update_stmt->execute([$attachments_json, $noteId, $workspace]);
                        }
                    } else {
                        if ($content_changed) {
                            $update_query = "UPDATE entries SET attachments = ?, entry = ? WHERE id = ?";
                            $update_stmt = $this->con->prepare($update_query);
                            $success = $update_stmt->execute([$attachments_json, $entry, $noteId]);
                        } else {
                            $update_query = "UPDATE entries SET attachments = ? WHERE id = ?";
                            $update_stmt = $this->con->prepare($update_query);
                            $success = $update_stmt->execute([$attachments_json, $noteId]);
                        }
                    }
                    
                    if ($success) {
                        $this->triggerGitSync((int)$noteId, 'delete', $attachment['filename']);
                        echo json_encode(['success' => true, 'message' => 'Attachment deleted successfully']);
                    } else {
                        http_response_code(500);
                        echo json_encode(['success' => false, 'message' => 'Database update failed']);
                    }
                } else {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Attachment not found']);
                }
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Note not found']);
            }
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Error deleting attachment: ' . $e->getMessage()]);
        }
    }
    
    /**
     * Trigger automatic Git synchronization if enabled
     */
    private function triggerGitSync(int $noteId, string $action = 'push', string $filename = ''): void {
        error_log("[Poznote Git] AttachmentsController: triggerGitSync called for note $noteId with action $action, filename $filename");
        try {
            $gitSyncFile = dirname(__DIR__, 3) . '/GitSync.php';
            if (!file_exists($gitSyncFile)) {
                error_log("[Poznote Git] AttachmentsController: GitSync.php not found at $gitSyncFile");
                return;
            }
            require_once $gitSyncFile;
            $gitSync = new GitSync($this->con, $_SESSION['user_id'] ?? null);
            if (!$gitSync->isAutoPushEnabled()) {
                error_log("[Poznote Git] AttachmentsController: Auto-push is not enabled");
                return;
            }
            if ($action === 'push') {
                if ($filename) {
                    error_log("[Poznote Git] AttachmentsController: Calling gitSync->pushAttachment($filename)");
                    $gitSync->pushAttachment($filename, "Added attachment {$filename} to note {$noteId}");
                }
                error_log("[Poznote Git] AttachmentsController: Calling gitSync->pushNote($noteId)");
                $result = $gitSync->pushNote($noteId);
                error_log("[Poznote Git] AttachmentsController: Result: " . json_encode($result));
            } elseif ($action === 'delete') {
                if ($filename) {
                    error_log("[Poznote Git] AttachmentsController: Calling gitSync->deleteAttachmentInGit($filename)");
                    $gitSync->deleteAttachmentInGit($filename, "Deleted attachment {$filename} from note {$noteId}");
                }
                error_log("[Poznote Git] AttachmentsController: Calling gitSync->pushNote($noteId)");
                $result = $gitSync->pushNote($noteId);
                error_log("[Poznote Git] AttachmentsController: Result: " . json_encode($result));
            }
        } catch (Exception $e) {
            error_log("[Poznote Git] AttachmentsController error: " . $e->getMessage());
        }
    }
}
