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
        if (function_exists('getAttachmentsPath')) {
            return getAttachmentsPath();
        }
        // Fallback
        return __DIR__ . '/../../../../data/attachments';
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
                $stmt = $this->con->prepare($query);
                $stmt->execute([$noteId, $workspace]);
            } else {
                $query = "SELECT entry, attachments FROM entries WHERE id = ?";
                $stmt = $this->con->prepare($query);
                $stmt->execute([$noteId]);
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
        
        if (empty($noteId) || empty($attachmentId)) {
            http_response_code(400);
            exit('Note ID and Attachment ID are required');
        }
        
        // Check if note is publicly shared by querying master.db shared_links table
        $isPubliclyShared = false;
        $noteOwnerId = null;
        
        try {
            require_once __DIR__ . '/../../../users/db_master.php';
            $masterCon = getMasterConnection();
            $stmt = $masterCon->prepare('SELECT user_id FROM shared_links WHERE target_type = ? AND target_id = ? LIMIT 1');
            $stmt->execute(['note', $noteId]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($result) {
                $isPubliclyShared = true;
                $noteOwnerId = (int)$result['user_id'];
                
                // Load the correct user database if not already loaded
                if (!isset($_SESSION['user_id']) || $_SESSION['user_id'] != $noteOwnerId) {
                    require_once __DIR__ . '/../../../users/UserDataManager.php';
                    $userDataManager = new UserDataManager($noteOwnerId);
                    $dbPath = $userDataManager->getUserDatabasePath();
                    
                    // Reconnect to the correct database
                    $this->con = new PDO('sqlite:' . $dbPath);
                    $this->con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    $this->con->exec('PRAGMA busy_timeout = 5000');
                    $this->con->exec('PRAGMA foreign_keys = ON');
                    
                    // Update attachments directory for this user
                    $this->attachmentsDir = $userDataManager->getUserAttachmentsPath();
                }
            }
        } catch (Exception $e) {
            // If checking master.db fails, continue with current database
            error_log("Failed to check shared_links: " . $e->getMessage());
        }
        
        // If not publicly shared, require authentication
        if (!$isPubliclyShared) {
            // Check if user is authenticated
            $isAuthenticated = false;
            
            // Check session authentication
            if (function_exists('isAuthenticated') && isAuthenticated()) {
                $isAuthenticated = true;
            }
            
            // Check HTTP Basic Auth
            if (!$isAuthenticated && isset($_SERVER['PHP_AUTH_USER']) && isset($_SERVER['PHP_AUTH_PW'])) {
                // Validate Basic Auth credentials
                require_once __DIR__ . '/../../../users/db_master.php';
                $authUser = getUserProfileByUsername($_SERVER['PHP_AUTH_USER']);
                
                if ($authUser && $authUser['active']) {
                    if ((bool)$authUser['is_admin'] && $_SERVER['PHP_AUTH_PW'] === AUTH_PASSWORD) {
                        $isAuthenticated = true;
                    } elseif (!$authUser['is_admin']) {
                        $expectedUserPassword = getUserSpecificPassword($authUser['username']);
                        if ($_SERVER['PHP_AUTH_PW'] === $expectedUserPassword) {
                            $isAuthenticated = true;
                        }
                    }
                }
            }
            
            if (!$isAuthenticated) {
                http_response_code(401);
                header('WWW-Authenticate: Basic realm="Poznote API"');
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Authentication required']);
                exit;
            }
        }
        
        try {
            // Get attachment info
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
                            
                            // For PDFs, images, videos, and audio, allow inline viewing
                            if (strpos($file_type, 'application/pdf') !== false || 
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
