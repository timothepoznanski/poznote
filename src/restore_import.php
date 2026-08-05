<?php
require_once 'auth.php';
requireAuth();
requireActiveAccountOwner();
require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'version_helper.php';
require_once 'import_helpers.php';

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

// Variables for specific section messages
$restore_message = '';
$restore_error = '';
$import_notes_message = '';
$import_notes_error = '';
$import_attachments_message = '';
$import_attachments_error = '';
$import_individual_notes_message = '';
$import_individual_notes_error = '';

if (empty($_SESSION['restore_import_csrf_token'])) {
    $_SESSION['restore_import_csrf_token'] = bin2hex(random_bytes(32));
}
$restoreImportCsrfToken = $_SESSION['restore_import_csrf_token'];
$restoreImportPostAllowed = false;

// Process actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $postedCsrfToken = $_POST['csrf_token'] ?? '';

    if (!hash_equals($restoreImportCsrfToken, $postedCsrfToken)) {
        $restore_error = t('restore_import.errors.invalid_form_submission', [], 'Invalid form submission. Please try again.');
    } else {
        $restoreImportPostAllowed = true;
        switch ($action) {
        case 'complete_restore':
            if (isset($_FILES['complete_backup_file']) && $_FILES['complete_backup_file']['error'] === UPLOAD_ERR_OK) {
                $result = restoreCompleteBackup($_FILES['complete_backup_file']);
                if ($result['success']) {
                    $restore_message = t('restore_import.messages.complete_backup_restored', ['message' => $result['message']]);
                } else {
                    $restoreErrorDetails = trim((string)($result['message'] ?? ''));
                    $restore_error = t('restore_import.errors.complete_restore_error', [
                        'error' => $result['error'],
                        'message' => $restoreErrorDetails !== '' ? ' - ' . $restoreErrorDetails : ''
                    ]);
                }
            } else {
                $restore_error = t('restore_import.errors.no_complete_backup_file_or_upload');
            }
            break;
            
        case 'import_notes':
            if (isset($_FILES['notes_file']) && $_FILES['notes_file']['error'] === UPLOAD_ERR_OK) {
                $result = importNotesZip($_FILES['notes_file']);
                if ($result['success']) {
                    $import_notes_message = t('restore_import.messages.notes_imported', ['message' => $result['message']]);
                } else {
                    $import_notes_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_notes_error = t('restore_import.errors.no_notes_file_or_upload');
            }
            break;
            
        case 'import_attachments':
            if (isset($_FILES['attachments_file']) && $_FILES['attachments_file']['error'] === UPLOAD_ERR_OK) {
                $result = importAttachmentsZip($_FILES['attachments_file']);
                if ($result['success']) {
                    $import_attachments_message = t('restore_import.messages.attachments_imported', ['message' => $result['message']]);
                } else {
                    $import_attachments_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_attachments_error = t('restore_import.errors.no_attachments_file_or_upload');
            }
            break;
            
        case 'import_individual_notes':
            if (isset($_FILES['individual_notes_files']) && !empty($_FILES['individual_notes_files']['name'][0])) {
                $workspace = $_POST['target_workspace'] ?? null;
                // If no workspace provided, get the first available workspace
                if (empty($workspace)) {
                    $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
                    $workspace = $wsStmt->fetchColumn();
                }
                $folder = $_POST['target_folder'] ?? null;
                
                // Check if a single ZIP file was uploaded
                $fileCount = count($_FILES['individual_notes_files']['name']);
                $firstFileName = $_FILES['individual_notes_files']['name'][0];
                $isZipFile = (preg_match('/\.zip$/i', $firstFileName) && $fileCount === 1);
                
                if ($isZipFile) {
                    // Single ZIP file upload - use ZIP import
                    $singleZipFile = [
                        'name' => $_FILES['individual_notes_files']['name'][0],
                        'type' => $_FILES['individual_notes_files']['type'][0],
                        'tmp_name' => $_FILES['individual_notes_files']['tmp_name'][0],
                        'error' => $_FILES['individual_notes_files']['error'][0],
                        'size' => $_FILES['individual_notes_files']['size'][0]
                    ];
                    $result = importIndividualNotesZip($singleZipFile, $workspace, $folder);
                } else {
                    // Multiple individual files or mixed files
                    $result = importIndividualNotes($_FILES['individual_notes_files'], $workspace, $folder);
                }
                
                if ($result['success']) {
                    $import_individual_notes_message = $result['message'];
                } else {
                    $import_individual_notes_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_individual_notes_error = t('restore_import.errors.no_notes_selected_or_upload');
            }
            break;
        }
    }
}

$restoreImportAction = $_POST['action'] ?? '';
$directCopyRestoreSubmitted = $restoreImportPostAllowed && $restoreImportAction === 'restore_cli_upload';
$restoreBackupContentOpen = $restoreImportPostAllowed && in_array($restoreImportAction, ['complete_restore', 'check_cli_upload', 'restore_cli_upload'], true);
$standardRestoreContentOpen = $restoreImportPostAllowed && $restoreImportAction === 'complete_restore';
$directCopyRestoreContentOpen = $directCopyRestoreSubmitted || ($restoreImportPostAllowed && $restoreImportAction === 'check_cli_upload');
?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <title><?php echo getPageTitle(); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <link rel="stylesheet" href="css/lucide.css">
    <link rel="stylesheet" href="css/restore_import/base.css">
    <link rel="stylesheet" href="css/restore_import/cards.css">
    <link rel="stylesheet" href="css/restore_import/forms-buttons.css">
    <link rel="stylesheet" href="css/restore_import/modals.css?v=<?php echo file_exists(__DIR__ . '/css/restore_import/modals.css') ? filemtime(__DIR__ . '/css/restore_import/modals.css') : getAppVersion(); ?>">
    <link rel="stylesheet" href="css/restore_import/progress.css">
    <link rel="stylesheet" href="css/restore_import/drag-drop.css">
    <link rel="stylesheet" href="css/restore_import/utilities.css?v=<?php echo file_exists(__DIR__ . '/css/restore_import/utilities.css') ? filemtime(__DIR__ . '/css/restore_import/utilities.css') : getAppVersion(); ?>">
    <link rel="stylesheet" href="css/restore_import/responsive.css">
    <link rel="stylesheet" href="css/modals/base.css">
    <link rel="stylesheet" href="css/modals/specific-modals.css">
    <link rel="stylesheet" href="css/modals/attachments.css">
    <link rel="stylesheet" href="css/modals/share-modal.css">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css">
    <link rel="stylesheet" href="css/modals/responsive.css">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css">
    <link rel="stylesheet" href="css/dark-mode/menus.css">
    <link rel="stylesheet" href="css/dark-mode/editor.css">
    <link rel="stylesheet" href="css/dark-mode/modals.css">
    <link rel="stylesheet" href="css/dark-mode/components.css">
    <link rel="stylesheet" href="css/dark-mode/pages.css">
    <link rel="stylesheet" href="css/dark-mode/markdown.css">
    <link rel="stylesheet" href="css/dark-mode/kanban.css">
    <link rel="stylesheet" href="css/dark-mode/icons.css">
    <script src="js/globals.js?v=<?php echo getAppVersion(); ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="backup-container">
        <div class="navigation-buttons" style="justify-content: center;">
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings'); ?>
            </a>
        </div>
        
        <!-- Global Messages Section - Always visible at the top -->
        <?php if ($restore_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($restore_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($restore_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($restore_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_notes_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_attachments_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_attachments_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_individual_notes_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_individual_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <!-- Restore From Backup Card -->
        <div class="backup-section">
            <div class="card-container">
                <div class="card-header" data-action="toggle-card" data-target="restoreBackupContent">
                    <h3>
                        <?php echo t_h('restore_import.sections.restore_from_backup.title'); ?>
                    </h3>
                </div>
                <div class="card-content<?php echo $restoreBackupContentOpen ? ' open' : ''; ?>" id="restoreBackupContent">
            
        <!-- Standard Complete Restore Section -->
        <div class="sub-card">
            <div class="sub-card-header" data-action="toggle-sub-card" data-target="standardRestoreContent">
                <h4>
                    <?php echo t_h('restore_import.sections.standard_restore.title'); ?>
                </h4>
            </div>
            <div class="sub-card-content<?php echo $standardRestoreContentOpen ? ' open' : ''; ?>" id="standardRestoreContent">
                <p><?php echo t_h('restore_import.sections.standard_restore.description'); ?></p>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($restoreImportCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                    <small class="form-text text-muted"><?php echo t_h('restore_import.sections.standard_restore.helper'); ?></small>
                </div>
                
                <button type="button" id="completeRestoreBtn" class="btn btn-primary" data-action="show-complete-restore-confirmation">
                    <span><?php echo t_h('restore_import.buttons.start_restore'); ?></span>
                </button>
                <!-- Spinner shown while processing restore -->
                <div id="restoreSpinner" class="restore-spinner initially-hidden" role="status" aria-live="polite" aria-hidden="true">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.processing_long'); ?></span>
                </div>
            </form>
            </div>
        </div>

        <!-- Direct Copy Restore Section -->
        <div class="sub-card">
            <div class="sub-card-header" data-action="toggle-sub-card" data-target="directCopyRestoreContent">
                <h4>
                    <?php echo t_h('restore_import.sections.direct_copy_restore.title'); ?>
                </h4>
            </div>
            <div class="sub-card-content<?php echo $directCopyRestoreContentOpen ? ' open' : ''; ?>" id="directCopyRestoreContent">
                <p>
                <?php echo t_h('restore_import.sections.direct_copy_restore.step1'); ?>
            </p>
            <pre class="direct-copy-command"><code><?php echo t_h('restore_import.sections.direct_copy_restore.docker_command'); ?></code></pre>
            <p>
                <?php echo t_h('restore_import.sections.direct_copy_restore.step2'); ?>
            </p>

            <?php
                $cliBackupPath = '/tmp/backup_restore.zip';

                if (!$directCopyRestoreSubmitted && file_exists($cliBackupPath)) {
                    $fileSize = filesize($cliBackupPath);
                    $fileSizeMB = round($fileSize / 1024 / 1024, 2);
                    echo "<div class='alert alert-info'>";
                    echo "<strong>" . t_h('restore_import.direct_copy.backup_file_found') . "</strong> {$fileSizeMB}MB";
                    echo "</div>";
                } elseif (!$directCopyRestoreSubmitted) {
                    echo "<div class='alert alert-warning'>";
                    echo t_h('restore_import.direct_copy.no_backup_found_prefix') . " <code>/tmp/backup_restore.zip</code><br>";
                    echo t_h('restore_import.direct_copy.no_backup_found_hint');
                    echo "</div>";
                }
            ?>

            <?php if ($directCopyRestoreSubmitted): ?>
                <?php
                if (file_exists($cliBackupPath)) {
                    $result = restoreCompleteBackup(['tmp_name' => $cliBackupPath, 'name' => 'cli_backup.zip'], true);
                    if ($result['success']) {
                        echo "<div class='alert alert-success'>" . t_h('restore_import.direct_copy.completed_successfully_prefix') . " " . nl2br(htmlspecialchars($result['message'])) . "</div>";
                        // Clean up the file after successful restore
                        unlink($cliBackupPath);
                    } else {
                        echo "<div class='alert alert-danger'>" . t_h('restore_import.direct_copy.failed_prefix') . " " . htmlspecialchars($result['error']) . "</div>";
                    }
                } else {
                    echo "<div class='alert alert-danger'>" . t_h('restore_import.direct_copy.backup_not_found_for_restoration') . "</div>";
                }
                ?>
            <?php endif; ?>

            <form method="post" action="#directCopyRestoreContent" id="directCopyRestoreForm" class="form-with-margin-top">
                <input type="hidden" name="action" value="restore_cli_upload">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($restoreImportCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <button type="button" class="btn btn-primary" data-action="show-direct-copy-restore-confirmation">
                    <?php echo t_h('restore_import.buttons.start_restore'); ?>
                </button>
            </form>
            </div>
        </div>
        
            </div>
        </div>
        
        <!-- Individual Notes Import Card -->
        <div class="backup-section">
            <div class="card-container">
                <div class="card-header" data-action="toggle-card" data-target="individualNotesContent">
                    <h3>
                        <?php echo t_h('restore_import.sections.individual_notes.title'); ?>
                    </h3>
                </div>
                <div class="card-content" id="individualNotesContent">

            <form method="post" enctype="multipart/form-data" id="individualNotesForm">
                <input type="hidden" name="action" value="import_individual_notes">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($restoreImportCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                
                <div class="form-group form-group-spaced">
                    <label for="target_workspace_select" class="form-label">
                        1. <?php echo t_h('restore_import.sections.individual_notes.workspace', 'Target Workspace'); ?>
                    </label>
                    <select id="target_workspace_select" name="target_workspace" class="form-control form-select-styled" required>
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.loading', 'Loading...'); ?></option>
                    </select>
                </div>
                
                <div class="form-group form-group-spaced">
                    <label for="target_folder_select" class="form-label">
                        2. <?php echo t_h('restore_import.sections.individual_notes.folder', 'Target Folder'); ?>
                    </label>
                    <small class="form-text form-text-block form-text-danger">
                        <?php echo t_h('restore_import.sections.individual_notes.frontmatter_warning', 'Si une note MD contient une clé folder dans un front matter, cette valeur écrasera celle sélectionnée ci-dessous. Il faut donc avant tout vous assurer que le dossier existe déjà'); ?>
                    </small>
                    <small class="form-text form-text-block form-text-info">
                        <strong><?php echo t_h('restore_import.sections.individual_notes.zip_folders_info', 'ZIP avec structure de dossiers :'); ?></strong> <?php echo t_h('restore_import.sections.individual_notes.zip_folders_description', 'Si votre ZIP contient des dossiers, ils seront automatiquement créés comme folders dans Poznote, en préservant leur hiérarchie (sous-dossiers inclus).'); ?>
                    </small>
                    <select id="target_folder_select" name="target_folder" class="form-control form-select-styled">
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.no_folder', 'No folder (root level)'); ?></option>
                    </select>
                </div>
                
                <div class="form-group form-group-spaced">
                    <label for="individual_notes_files" class="form-label">
                        3. <?php echo t_h('restore_import.sections.individual_notes.select_files', 'Select Files'); ?>
                    </label>
                    <small class="form-text text-muted form-text-muted-block">
                        <span class="text-danger">
                        <?php 
                        $maxIndividualFiles = (int)(poznoteResolveGlobalSetting('import_max_individual_files', 'POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES', '50'));
                        $maxZipFiles = (int)(poznoteResolveGlobalSetting('import_max_zip_files', 'POZNOTE_IMPORT_MAX_ZIP_FILES', '300'));
                        echo t_h('restore_import.sections.individual_notes.files_info', ['maxIndividualFiles' => $maxIndividualFiles, 'maxZipFiles' => $maxZipFiles], 'Multiple files (max {{maxIndividualFiles}}) or single ZIP archive (max {{maxZipFiles}} files). These limits can be changed,');
                        echo ' <a href="https://github.com/timothepoznanski/poznote#import-individual-notes" target="_blank" rel="noopener">';
                        echo t_h('restore_import.sections.individual_notes.files_info_link', 'see documentation');
                        echo '</a>.';
                        ?>
                        </span><br>
                        <?php echo t_h('restore_import.sections.individual_notes.supported_formats', 'Supported: .html, .md, .markdown, .txt, .zip'); ?>
                    </small>
                    <input type="file" id="individual_notes_files" name="individual_notes_files[]" accept=".html,.md,.markdown,.txt,.json,.zip" multiple required class="form-file-input">
                </div>
                
                <button type="button" class="btn btn-primary btn-with-margin-top" data-action="show-individual-notes-import-confirmation" id="individualNotesImportBtn">
                    <?php echo t_h('restore_import.buttons.start_import', 'Start Import'); ?>
                </button>
                
                <!-- Spinner shown while processing import -->
                <div id="individualNotesImportSpinner" class="restore-spinner initially-hidden spinner-with-margin-top" role="status" aria-live="polite" aria-hidden="true">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.importing_notes', 'Importation des notes en cours...'); ?></span>
                </div>
            </form>
                </div>
            </div>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div class="section-bottom-spacer"></div>
    </div>

    <!-- Simple Import Confirmation Modal -->
    <div id="importConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_confirm.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_confirm.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-import">
                    <?php echo t_h('restore_import.modals.import_confirm.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Complete Restore Confirmation Modal -->
    <div id="completeRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.complete_restore.title'); ?></h3>
            <p><strong><?php echo t_h('common.warning'); ?>:</strong> <?php echo t('restore_import.modals.complete_restore.body_html'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-complete-restore-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-complete-restore">
                    <?php echo t_h('restore_import.modals.complete_restore.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Notes Import Confirmation Modal -->
    <div id="notesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_notes.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_notes.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-notes-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-notes-import">
                    <?php echo t_h('restore_import.modals.import_notes.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Attachments Import Confirmation Modal -->
    <div id="attachmentsImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_attachments.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_attachments.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-attachments-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-attachments-import">
                    <?php echo t_h('restore_import.modals.import_attachments.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Direct Copy Restore Confirmation Modal -->
    <div id="directCopyRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.complete_restore_direct_copy.title'); ?></h3>
            <p><strong><?php echo t_h('common.warning'); ?>:</strong> <?php echo t('restore_import.modals.complete_restore_direct_copy.body_html'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-direct-copy-restore-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-direct-copy-restore">
                    <?php echo t_h('restore_import.modals.complete_restore_direct_copy.confirm'); ?>
                </button>
            </div>
            <div id="directCopyRestoreProcessing" class="direct-copy-restore-processing initially-hidden" role="status" aria-live="polite" aria-hidden="true">
                <span class="direct-copy-restore-spinner" aria-hidden="true"></span>
                <span><?php echo t_h('restore_import.spinner.direct_copy_restoring'); ?></span>
            </div>
        </div>
    </div>

    <!-- Individual Notes Import Confirmation Modal -->
    <div id="individualNotesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_individual_notes.title'); ?></h3>
            <p id="individualNotesImportSummary"><?php echo t_h('restore_import.modals.import_individual_notes.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-individual-notes-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-individual-notes-import">
                    <?php echo t_h('restore_import.modals.import_individual_notes.confirm'); ?>
                </button>
            </div>
        </div>
    </div>
    <div id="customAlert" class="custom-alert">
        <div class="custom-alert-content">
            <h3 id="alertTitle"><?php echo t_h('restore_import.alerts.no_file_selected.title'); ?></h3>
            <p id="alertMessage"><?php echo t_h('restore_import.alerts.no_file_selected.body'); ?></p>
            <button type="button" class="alert-ok-button" data-action="hide-custom-alert">
                <?php echo t_h('restore_import.alerts.ok'); ?>
            </button>
        </div>
    </div>
    
    <!-- Custom Status Modal -->
    <div class="modal" id="statusModal">
        <div class="modal-content">
            <h2 class="modal-title" id="statusModalTitle"></h2>
            <p id="statusModalMessage" style="white-space: pre-wrap; margin-bottom: 25px;"></p>
            <div class="form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="statusModalCancelBtn"></button>
                <button type="button" class="btn btn-primary" id="statusModalConfirmBtn"></button>
            </div>
        </div>
    </div>
    
    <!-- Configuration for JavaScript -->
    <script type="application/json" id="restore-import-config"><?php
        echo json_encode([
            'maxIndividualFiles' => (int)(poznoteResolveGlobalSetting('import_max_individual_files', 'POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES', '50')),
            'maxZipFiles' => (int)(poznoteResolveGlobalSetting('import_max_zip_files', 'POZNOTE_IMPORT_MAX_ZIP_FILES', '300'))
        ]);
    ?></script>
    <script src="js/restore-import.js?v=<?php echo file_exists(__DIR__ . '/js/restore-import.js') ? filemtime(__DIR__ . '/js/restore-import.js') : getAppVersion(); ?>"></script>
</body>
</html>
