<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
include 'db_connect.php';

// Get note ID from URL
$note_id = isset($_GET['note_id']) ? (int)$_GET['note_id'] : 0;
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : null;

if (!$note_id) {
    header('Location: index.php');
    exit;
}

// Get note details
$query = "SELECT heading FROM entries WHERE id = ?";
if ($workspace) {
    $query = "SELECT heading FROM entries WHERE id = ? AND workspace = ?";
    $stmt = $con->prepare($query);
    $stmt->execute([$note_id, $workspace]);
} else {
    $stmt = $con->prepare($query);
    $stmt->execute([$note_id]);
}
$note = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$note) {
    header('Location: index.php');
    exit;
}

?>
<!DOCTYPE html>
<html>
<head>
    <title><?php echo t_h('attachments.page.title'); ?> - <?php echo htmlspecialchars($note['heading']); ?> - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/attachments.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/theme-manager.js"></script>
</head>
<body data-note-id="<?php echo $note_id; ?>" 
      data-workspace="<?php echo $workspace ? htmlspecialchars($workspace, ENT_QUOTES) : ''; ?>"
      data-txt-uploading="<?php echo t_h('attachments.upload.button_uploading', [], 'Uploading...'); ?>"
      data-txt-select-file="<?php echo t_h('attachments.errors.select_file', [], 'Please select a file to upload.'); ?>"
      data-txt-file-too-large="<?php echo t_h('attachments.errors.file_too_large', ['maxSize' => '200MB'], 'The file is too large (max: {{maxSize}}).'); ?>"
      data-txt-upload-success="<?php echo t_h('attachments.messages.upload_success', [], 'File uploaded successfully!'); ?>"
      data-txt-upload-failed-prefix="<?php echo t_h('attachments.errors.upload_failed', ['error' => '{{error}}'], 'Upload failed: {{error}}'); ?>"
      data-txt-upload-failed-generic="<?php echo t_h('attachments.errors.upload_failed_generic', [], 'Upload failed. Please try again.'); ?>"
      data-txt-upload-failed-connection="<?php echo t_h('attachments.errors.upload_failed_connection', [], 'Upload failed. Please check your connection.'); ?>"
      data-txt-loading-failed="<?php echo t_h('attachments.errors.loading_failed', [], 'Failed to load attachments'); ?>"
      data-txt-loading-error="<?php echo t_h('attachments.errors.loading_error', [], 'Error loading attachments'); ?>"
      data-txt-no-attachments="<?php echo t_h('attachments.empty', [], 'No attachments.'); ?>"
      data-txt-preview-alt="<?php echo t_h('attachments.page.preview_alt', [], 'Preview'); ?>"
      data-txt-uploaded-prefix="<?php echo t_h('attachments.page.uploaded_prefix', [], 'Uploaded: '); ?>"
      data-txt-view="<?php echo t_h('attachments.actions.view', [], 'View'); ?>"
      data-txt-delete="<?php echo t_h('attachments.actions.delete', [], 'Delete'); ?>"
      data-txt-open-new-tab="<?php echo t_h('attachments.page.open_in_new_tab', [], 'Open in new tab'); ?>"
      data-txt-download="<?php echo t_h('common.download', [], 'Download'); ?>"
      data-txt-pdf-label="<?php echo t_h('attachments.page.pdf_label', [], 'PDF'); ?>"
      data-txt-deleted-success="<?php echo t_h('attachments.messages.deleted_success', [], 'Attachment deleted successfully'); ?>"
      data-txt-delete-failed-prefix="<?php echo t_h('attachments.errors.deletion_failed', ['error' => '{{error}}'], 'Deletion failed: {{error}}'); ?>"
      data-txt-delete-failed-generic="<?php echo t_h('attachments.errors.deletion_failed_generic', [], 'Deletion failed.'); ?>"
      data-txt-confirm-action="<?php echo t_h('common.confirm_action', [], 'Confirm Action'); ?>"
      data-txt-delete-button="<?php echo t_h('common.delete', [], 'Delete'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-filesize-units="<?php echo htmlspecialchars(json_encode([
          t('attachments.size.units.bytes', [], 'bytes'),
          t('attachments.size.units.kb', [], 'KB'),
          t('attachments.size.units.mb', [], 'MB'),
          t('attachments.size.units.gb', [], 'GB'),
      ]), ENT_QUOTES); ?>">
    <div class="settings-container">
        <h1><?php echo t_h('attachments.page.title'); ?></h1>
        <p><?php echo t_h('attachments.page.subtitle'); ?> <strong><?php echo htmlspecialchars($note['heading']); ?></strong></p>
        
        <?php 
            $back_params = [];
            if ($workspace) $back_params[] = 'workspace=' . urlencode($workspace);
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>
    <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>

        <br><br>

        <!-- Upload Section -->
        <div class="settings-section">
            <h3><?php echo t_h('attachments.page.upload_section_title'); ?></h3>
            
            <div class="attachment-upload-section">
                <div class="drag-drop-info"><?php echo t_h('attachments.page.drag_drop_info'); ?></div><br>
                <div class="form-group">
                    <input type="file" id="attachmentFile" class="file-input">
                    <div class="accepted-types">
                        <?php echo t_h('attachments.page.all_types_accepted'); ?>
                    </div>
                    <br>
                    <div class="selected-filename" id="selectedFileName"></div>
                </div>
                
                <button type="button" class="btn btn-primary" id="uploadBtn" disabled>
                    <?php echo t_h('attachments.page.upload_button'); ?>
                </button>
            </div>
            
            <div id="uploadProgress" class="upload-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText"><?php echo t_h('attachments.upload.button_uploading', [], 'Uploading...'); ?></div>
            </div>
        </div>

        <!-- Attachments List Section -->
        <div class="settings-section">
            <h3><?php echo t_h('attachments.page.current_attachments', [], 'Current Attachments'); ?></h3>
            <div id="attachmentsList" class="attachments-display">
                <div class="loading-attachments">
                    <?php echo t_h('attachments.page.loading_attachments', [], 'Loading attachments...'); ?>
                </div>
            </div>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <script src="js/attachments-page.js"></script>
    
    <!-- Delete Attachment Confirmation Modal -->
    <div id="deleteAttachmentConfirmModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('attachments.modals.delete.title', [], 'Delete Attachment'); ?></h3>
            <p><?php echo t_h('attachments.modals.delete.message', [], 'Do you want to delete this attachment? This action cannot be undone.'); ?></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
                <button type="button" class="btn-danger"><?php echo t_h('attachments.actions.delete', [], 'Delete'); ?></button>
            </div>
        </div>
    </div>
</body>
</html>
