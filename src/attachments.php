<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// GitHub Sync Logic
require_once 'GitSync.php';
$gitSync = new GitSync($con);
$gitEnabled = GitSync::isEnabled() && $gitSync->isConfigured();
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$showGitSync = $gitEnabled && $isAdmin;

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

// Fetch the setting for inline images in list views
$showInlineInList = true;
try {
    $stmt_setting = $con->prepare("SELECT value FROM settings WHERE key = 'show_inline_attachments_in_list' LIMIT 1");
    $stmt_setting->execute();
    $val = $stmt_setting->fetchColumn();
    // Default is shown, so only '0' or 'false' means hidden
    if ($val === '0' || $val === 'false') {
        $showInlineInList = false;
    }
} catch (Exception $e) {
    // Ignore error
}

?>
<!DOCTYPE html>
<html>
<head>
    <title><?php echo htmlspecialchars($note['heading']); ?> - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <?php 
    $v = @file_get_contents('version.txt');
    if ($v === false) $v = time();
    $v = urlencode(trim($v));
    ?>
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css">
    <link rel="stylesheet" href="css/attachments/base.css">
    <link rel="stylesheet" href="css/attachments/upload.css">
    <link rel="stylesheet" href="css/attachments/display.css">
    <link rel="stylesheet" href="css/attachments/buttons-alerts.css">
    <link rel="stylesheet" href="css/attachments/preview-modal.css">
    <link rel="stylesheet" href="css/attachments/responsive.css">
    <link rel="stylesheet" href="css/modals/base.css">
    <link rel="stylesheet" href="css/modals/specific-modals.css">
    <link rel="stylesheet" href="css/modals/attachments.css">
    <link rel="stylesheet" href="css/modals/link-modal.css">
    <link rel="stylesheet" href="css/modals/share-modal.css">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css">
    <link rel="stylesheet" href="css/modals/responsive.css">
    <link rel="stylesheet" href="css/dark-mode/variables.css">
    <link rel="stylesheet" href="css/dark-mode/layout.css">
    <link rel="stylesheet" href="css/dark-mode/menus.css">
    <link rel="stylesheet" href="css/dark-mode/editor.css">
    <link rel="stylesheet" href="css/dark-mode/modals.css">
    <link rel="stylesheet" href="css/dark-mode/components.css">
    <link rel="stylesheet" href="css/dark-mode/pages.css">
    <link rel="stylesheet" href="css/dark-mode/markdown.css">
    <link rel="stylesheet" href="css/dark-mode/kanban.css">
    <link rel="stylesheet" href="css/dark-mode/icons.css">
    <script src="js/theme-manager.js"></script>
    <style>
        .settings-banner-info {
            background-color: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 0.9rem;
            color: #475569;
        }
        [data-theme="dark"] .settings-banner-info {
            background-color: #1e293b;
            border-color: #334155;
            color: #94a3b8;
        }
        
        /* Toggle Checkbox Styles */
        .toggle-checkbox {
            display: flex;
            align-items: center;
            cursor: pointer;
            gap: 10px;
            user-select: none;
        }
        .toggle-checkbox input {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        .toggle-label {
            font-weight: 500;
        }

        .file-icon-placeholder {
            width: 60px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f1f5f9;
            border-radius: 4px;
            color: #94a3b8;
            font-size: 24px;
        }
        [data-theme="dark"] .file-icon-placeholder {
            background-color: #1e293b;
            color: #64748b;
        }

        @media (max-width: 600px) {
            .settings-banner-info {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }
        }
    </style>
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
    
    <!-- Global configuration (CSP compliant) -->
    <script type="application/json" id="poznote-config"><?php
        echo json_encode([
            'gitSyncAutoPush' => ($showGitSync && $gitSync->isAutoPushEnabled())
        ], JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?: '{}';
    ?></script>
    <script src="js/error-handler.js?v=<?php echo $v; ?>"></script>
    
    <div class="settings-container">
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

        <div class="settings-banner-info">
            <label class="toggle-checkbox">
                <input type="checkbox" id="showInlineImagesToggle" <?php echo $showInlineInList ? 'checked' : ''; ?>>
                <span class="toggle-label"><?php echo t_h('attachments.list.show_inline_images', [], 'Also show images already visible in the note content'); ?></span>
            </label>
        </div>

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
            
            <div id="uploadProgress" class="upload-progress initially-hidden">
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
        <div class="section-bottom-spacer"></div>
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
