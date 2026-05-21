<?php
require 'auth.php';
requireApiAuth();

// Get action first to determine response type
$action = $_POST['action'] ?? $_GET['action'] ?? '';

// Only set JSON headers and start output buffering if not downloading
if ($action !== 'download') {
    // Prevent any output before JSON response
    ob_start();
    
    // Set JSON content type header
    header('Content-Type: application/json');
}

// Enable error logging for debugging
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Get the correct attachments directory path
$attachments_dir = getAttachmentsPath();

// Create directory if needed
if (!createDirectoryWithPermissions($attachments_dir)) {
    error_log("Failed to create attachments directory: $attachments_dir");
    echo json_encode(['success' => false, 'message' => 'Failed to create attachments directory']);
    exit;
}

// Verify directory is writable
if (!is_writable($attachments_dir)) {
    error_log("Attachments directory is not writable: $attachments_dir");
    // Try to fix permissions
    if (!chmod($attachments_dir, 0755)) {
        error_log("Failed to set writable permissions on: $attachments_dir");
    }
}

// Handle different actions
switch ($action) {
    case 'upload':
        handleUpload();
        break;
    case 'list':
        handleList();
        break;
    case 'delete':
        handleDelete();
        break;
    case 'download':
        handleDownload();
        break;
    default:
        if ($action !== 'download') {
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
        }
        break;
}

// End output buffering only if not downloading
if ($action !== 'download' && ob_get_level()) {
    ob_end_flush();
}

function resolveAttachmentNote($note_id, $workspace = null) {
    global $con;

    $noteId = (int)$note_id;
    if ($noteId <= 0) {
        return null;
    }

    $workspaceName = trim((string)($workspace ?? ''));
    if ($workspaceName === '') {
        $workspaceName = getWorkspaceFilter();
    }

    if ($workspaceName === '') {
        return null;
    }

    $stmt = $con->prepare('SELECT id, workspace, attachments FROM entries WHERE id = ? AND workspace = ? AND trash = 0');
    $stmt->execute([$noteId, $workspaceName]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);

    return $note ?: null;
}

function decodeAttachmentList($attachmentsJson) {
    $attachments = $attachmentsJson ? json_decode($attachmentsJson, true) : [];
    return is_array($attachments) ? $attachments : [];
}

function handleUpload() {
    global $con, $attachments_dir;
    
    $note_id = $_POST['note_id'] ?? '';
    $workspace = $_POST['workspace'] ?? null;
    
    if (empty($note_id)) {
        error_log("Upload failed: Note ID is required");
        echo json_encode(['success' => false, 'message' => 'Note ID is required']);
        return;
    }
    
    if (!isset($_FILES['file'])) {
        error_log("Upload failed: No file uploaded");
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return;
    }

    $note = resolveAttachmentNote($note_id, $workspace);
    if (!$note) {
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        return;
    }
    
    $file = $_FILES['file'];
    
    // Enhanced error checking for file uploads
    switch($file['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            error_log("Upload failed: No file sent");
            echo json_encode(['success' => false, 'message' => 'No file sent']);
            return;
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            error_log("Upload failed: File too large");
            echo json_encode(['success' => false, 'message' => 'File too large']);
            return;
        case UPLOAD_ERR_PARTIAL:
            error_log("Upload failed: File upload was interrupted");
            echo json_encode(['success' => false, 'message' => 'File upload was interrupted']);
            return;
        case UPLOAD_ERR_NO_TMP_DIR:
            error_log("Upload failed: No temporary directory");
            echo json_encode(['success' => false, 'message' => 'Server configuration error']);
            return;
        case UPLOAD_ERR_CANT_WRITE:
            error_log("Upload failed: Failed to write file to disk");
            echo json_encode(['success' => false, 'message' => 'Failed to write file to disk']);
            return;
        case UPLOAD_ERR_EXTENSION:
            error_log("Upload failed: File upload stopped by extension");
            echo json_encode(['success' => false, 'message' => 'File upload stopped by extension']);
            return;
        default:
            error_log("Upload failed: Unknown upload error: " . $file['error']);
            echo json_encode(['success' => false, 'message' => 'Unknown upload error']);
            return;
    }
    
    $original_name = $file['name'];
    $file_size = $file['size'];
    $file_type = $file['type'];
    
    // Generate unique filename
    $file_extension = pathinfo($original_name, PATHINFO_EXTENSION);
    $unique_filename = uniqid() . '_' . time() . '.' . $file_extension;
    $file_path = $attachments_dir . '/' . $unique_filename;
    
    // Check if source file exists and is readable
    if (!is_uploaded_file($file['tmp_name'])) {
        error_log("Upload failed: Invalid uploaded file: " . $file['tmp_name']);
        echo json_encode(['success' => false, 'message' => 'Invalid uploaded file']);
        return;
    }
    
    // Check file size
    if ($file_size > 200 * 1024 * 1024) { // 200MB limit
        error_log("Upload failed: File too large: $file_size bytes");
        echo json_encode(['success' => false, 'message' => 'File too large (max 200MB)']);
        return;
    }
    
    // Re-check if destination directory is writable
    if (!is_writable($attachments_dir)) {
        error_log("Upload failed: Attachments directory is not writable: $attachments_dir");
        echo json_encode(['success' => false, 'message' => 'Attachments directory is not writable']);
        return;
    }
    
    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $file_path)) {
        // Set file permissions
        chmod($file_path, 0644);

        $current_attachments = decodeAttachmentList($note['attachments'] ?? '');

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
        $update_query = "UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ? AND trash = 0";
        $update_stmt = $con->prepare($update_query);
        $success = $update_stmt->execute([$attachments_json, $note_id, $note['workspace']]);

        if ($success) {
            echo json_encode([
                'success' => true,
                'message' => 'File uploaded successfully',
                'attachment_id' => $new_attachment['id'],
                'filename' => $original_name
            ]);
        } else {
            unlink($file_path); // Clean up file if database update fails
            error_log("Attachment database update failed");
            echo json_encode(['success' => false, 'message' => 'Database update failed']);
        }
    } else {
        error_log("Attachment file move failed");
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
    }
}

function handleList() {
    $note_id = $_GET['note_id'] ?? '';
    $workspace = $_GET['workspace'] ?? null;
    
    if (empty($note_id)) {
        echo json_encode(['success' => false, 'message' => 'Note ID is required']);
        return;
    }

    $note = resolveAttachmentNote($note_id, $workspace);
    if ($note) {
        $attachments = decodeAttachmentList($note['attachments'] ?? '');
        echo json_encode(['success' => true, 'attachments' => $attachments]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Note not found']);
    }
}

function handleDelete() {
    global $con, $attachments_dir;
    
    $note_id = $_POST['note_id'] ?? '';
    $attachment_id = $_POST['attachment_id'] ?? '';
    $workspace = $_POST['workspace'] ?? null;
    
    if (empty($note_id) || empty($attachment_id)) {
        echo json_encode(['success' => false, 'message' => 'Note ID and Attachment ID are required']);
        return;
    }
    
    $note = resolveAttachmentNote($note_id, $workspace);
    if ($note) {
        $attachments = decodeAttachmentList($note['attachments'] ?? '');
        
        // Find and remove attachment
        $file_to_delete = null;
        $updated_attachments = [];
        
        foreach ($attachments as $attachment) {
            if ($attachment['id'] === $attachment_id) {
                $file_to_delete = $attachments_dir . '/' . $attachment['filename'];
            } else {
                $updated_attachments[] = $attachment;
            }
        }
        
        if ($file_to_delete) {
            // Delete physical file
            if (file_exists($file_to_delete)) {
                unlink($file_to_delete);
            }
            
            // Update database
            $attachments_json = json_encode($updated_attachments);
            $update_query = "UPDATE entries SET attachments = ? WHERE id = ? AND workspace = ? AND trash = 0";
            $update_stmt = $con->prepare($update_query);
            $success = $update_stmt->execute([$attachments_json, $note_id, $note['workspace']]);
            
            if ($success) {
                echo json_encode(['success' => true, 'message' => 'Attachment deleted successfully']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Database update failed']);
            }
        } else {
            echo json_encode(['success' => false, 'message' => 'Attachment not found']);
        }
    } else {
        echo json_encode(['success' => false, 'message' => 'Note not found']);
    }
}

function handleDownload() {
    global $con, $attachments_dir;
    
    $note_id = $_GET['note_id'] ?? '';
    $attachment_id = $_GET['attachment_id'] ?? '';
    $workspace = $_GET['workspace'] ?? null;
    
    if (empty($note_id) || empty($attachment_id)) {
        http_response_code(400);
        exit('Note ID and Attachment ID are required');
    }
    
    // Get attachment info
    $note = resolveAttachmentNote($note_id, $workspace);
    if ($note) {
        $attachments = decodeAttachmentList($note['attachments'] ?? '');
        
        foreach ($attachments as $attachment) {
            if ($attachment['id'] === $attachment_id) {
                $file_path = $attachments_dir . '/' . $attachment['filename'];
                
                if (file_exists($file_path)) {
                    // Clear any output buffer that might exist
                    if (ob_get_level()) {
                        ob_end_clean();
                    }
                    
                    // Set headers for file download/viewing
                    $file_type = $attachment['file_type'] ?? mime_content_type($file_path);
                    
                    // Sanitize filename for Content-Disposition header
                    $safeFilename = str_replace(['"', "\r", "\n"], '', $attachment['original_filename']);
                    
                    // For PDFs and images, allow inline viewing
                    if (strpos($file_type, 'application/pdf') !== false || strpos($file_type, 'image/') !== false) {
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
                    
                    // Output file
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
}
?>
