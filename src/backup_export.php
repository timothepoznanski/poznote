<?php
require_once 'auth.php';
requireAuth();
requireActiveAccountOwner();
require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'users/db_master.php';
require_once 'users/UserDataManager.php';
require_once 'version_helper.php';
require_once 'backup_zip.php';

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

require_once __DIR__ . '/storage/AttachmentStorage.php';
$s3StorageEnabled = AttachmentStorage::isEnabled();

// S3 backup self-service section: needs the feature enabled (master switch)
// with a configured bucket, and can be blocked for non-admin users by the
// user_s3_backups tenant isolation feature
require_once __DIR__ . '/S3BackupService.php';
$s3BackupSectionVisible = S3BackupService::isEnabled()
    && (isCurrentUserAdmin() || !in_array('user_s3_backups', TENANT_ISOLATION_FEATURES, true))
    && !poznoteIsUiElementHidden('card:s3-user-backup-section');

$message = '';
$error = '';

// Process actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'backup':
            $result = createBackup();
            // createBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = t('backup_export.errors.export_error', ['error' => $result['error']]);
            }
            break;
        case 'complete_backup':
            // Get selected user ID (defaults to current user)
            $currentUserId = getCurrentUserId();
            $selectedUserId = isset($_POST['selected_user_id']) ? (int)$_POST['selected_user_id'] : $currentUserId;
            
            // Security check: Only admin can backup other users
            if ($selectedUserId !== $currentUserId && !isCurrentUserAdmin()) {
                $selectedUserId = $currentUserId;
            }
            
            $result = createCompleteBackup($selectedUserId, !empty($_POST['skip_s3_attachments']));
            // createCompleteBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = t('backup_export.errors.complete_backup_error', ['error' => $result['error']]);
            }
            break;
    }
}

function createCompleteBackup($userId = null, $skipS3Attachments = false) {
    // Use current user if no userId specified
    if ($userId === null) {
        $userId = getCurrentUserId();
    }

    $build = buildUserBackupZip($userId, $skipS3Attachments);
    if (!$build['success']) {
        return ['success' => false, 'error' => $build['error']];
    }

    $zipFileName = $build['zip_path'];

    // Send file to browser.
    // If a download token was provided by the client, set a cookie with that token so
    // the page JS can detect when the download starts and hide the spinner.
    // This must be done before any output is sent.
    if (isset($_POST['download_token']) && !empty($_POST['download_token'])) {
        // Cookie will be session cookie and valid for path '/'
        setcookie('poznote_download_token', $_POST['download_token'], 0, '/');
    }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $build['filename'] . '"');
    header('Content-Length: ' . filesize($zipFileName));
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: 0');

    readfile($zipFileName);
    unlink($zipFileName);
    exit;
}

function createBackup() {
    return createCompleteBackup();
}
?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <title><?php echo getPageTitle(); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <link rel="stylesheet" href="css/lucide.css">
    <link rel="stylesheet" href="css/backup_export.css">
    <link rel="stylesheet" href="css/modals/base.css">
    <link rel="stylesheet" href="css/modals/specific-modals.css">
    <link rel="stylesheet" href="css/modals/attachments.css">
    <link rel="stylesheet" href="css/modals/share-modal.css">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css">
    <link rel="stylesheet" href="css/modals/responsive.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
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
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings'); ?>
            </a>
        </div>
        <br>
        <!-- Complete Backup Section -->
        <div class="backup-section">
            <h3><?php echo t_h('backup_export.sections.complete_backup.title'); ?></h3>
            <?php if (!empty($message)): ?>
                <div class="alert alert-success">
                    <?php echo htmlspecialchars($message); ?>
                </div>
            <?php endif; ?>
            <?php if (!empty($error)): ?>
                <div class="alert alert-danger">
                    <?php echo htmlspecialchars($error); ?>
                </div>
            <?php endif; ?>
            <p>
                <?php echo t_h('backup_export.sections.complete_backup.description_prefix'); ?>
                <span class="text-warning-bold"><?php echo t_h('backup_export.common.all_workspaces'); ?></span>
                <?php echo t_h('backup_export.sections.complete_backup.description_suffix'); ?>
                <br><br>
                <?php echo t_h('backup_export.sections.complete_backup.use_cases'); ?><br>
            </p>
            <ul class="backup-list-styled">
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_restore_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_restore_text'); ?></li><br>
                <li><strong><?php echo t_h('backup_export.sections.complete_backup.use_case_offline_label'); ?>:</strong> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text'); ?> <b>index.html</b> <?php echo t_h('backup_export.sections.complete_backup.use_case_offline_text_suffix'); ?></li><br>
            </ul>
            
            <form id="completeBackupForm" method="post">
                <input type="hidden" name="action" value="complete_backup">
                <?php if (isCurrentUserAdmin()): ?>
                    <div class="form-group form-group-export">
                        <label for="completeBackupUserSelect" class="export-label">
                            <?php echo t_h('backup_export.sections.complete_backup.select_user'); ?>
                        </label>
                        <select id="completeBackupUserSelect" name="selected_user_id" class="form-control export-select">
                            <?php
                            $allUsers = listAllUserProfiles();
                            foreach ($allUsers as $user) {
                                $selected = ($user['id'] == getCurrentUserId()) ? 'selected' : '';
                                echo '<option value="' . htmlspecialchars($user['id']) . '" ' . $selected . '>';
                                echo htmlspecialchars($user['username']);
                                if ($user['is_admin']) {
                                    echo ' (Admin)';
                                }
                                echo '</option>';
                            }
                            ?>
                        </select>
                    </div>
                    <?php if (!$s3StorageEnabled): ?><br><?php endif; ?>
                <?php else: ?>
                    <input type="hidden" name="selected_user_id" value="<?php echo getCurrentUserId(); ?>">
                <?php endif; ?>
                <?php if ($s3StorageEnabled): ?>
                    <div class="form-group form-group-export export-checkbox-group">
                        <label class="export-checkbox-label">
                            <input type="checkbox" name="skip_s3_attachments" value="1" id="completeBackupSkipS3">
                            <?php echo t_h('backup_export.common.skip_s3_attachments', [], 'Do not include S3 attachments in the zip (lighter archive)'); ?>
                        </label>
                        <span class="export-help" data-tooltip="<?php echo t_h('backup_export.common.skip_s3_attachments_help', [], 'Warning: with this option, attachments stored in S3 are NOT included in the zip, so this archive alone is not a complete backup. Remember to save your S3 attachments separately if you need them, for example with the attachments export below. Attachments stored on the server are always included.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                    </div>
                <?php endif; ?>
                <button id="completeBackupBtn" type="submit" class="btn btn-primary">
                    <span><?php echo t_h('backup_export.buttons.download_complete_backup'); ?></span>
                </button>
                <!-- Spinner shown while creating ZIP/download is in progress -->
                <div id="backupSpinner" class="backup-spinner initially-hidden" role="status" aria-live="polite" aria-hidden="true">
                    <div class="spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('backup_export.spinner.preparing'); ?></span>
                    <span class="backup-spinner-text"><?php echo t_h('backup_export.spinner.preparing_long'); ?></span>
                </div>
            </form>
        </div>
        
        <!-- Structured Export Section -->
        <div class="backup-section">
            <h3><?php echo t_h('backup_export.sections.structured_export.title'); ?></h3>
            <p>
                <?php echo t_h('backup_export.sections.structured_export.description'); ?>
                <br><br>
                <span class="text-danger"><?php echo t_h('backup_export.sections.structured_export.warning'); ?></span>
            </p>
            
            <div class="form-group form-group-export">
                <label for="structuredExportWorkspaceSelect" class="export-label">
                    <?php echo t_h('backup_export.sections.structured_export.select_workspace'); ?>
                </label>
                <select id="structuredExportWorkspaceSelect" class="form-control export-select">
                    <option value=""><?php echo t_h('backup_export.sections.structured_export.loading_workspaces'); ?></option>
                </select>
            </div>
            
            <?php if ($s3StorageEnabled): ?>
                <div class="form-group form-group-export export-checkbox-group">
                    <label class="export-checkbox-label">
                        <input type="checkbox" id="structuredExportSkipS3">
                        <?php echo t_h('backup_export.common.skip_s3_attachments', [], 'Do not include S3 attachments in the zip (lighter archive)'); ?>
                    </label>
                    <span class="export-help" data-tooltip="<?php echo t_h('backup_export.common.skip_s3_attachments_help', [], 'Warning: with this option, attachments stored in S3 are NOT included in the zip, so this archive alone is not a complete backup. Remember to save your S3 attachments separately if you need them, for example with the attachments export below. Attachments stored on the server are always included.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                </div>
            <?php endif; ?>
            <button id="structuredExportBtn" type="button" class="btn btn-primary">
                <span><?php echo t_h('backup_export.buttons.download_structured_export'); ?></span>
            </button>
        </div>

        <!-- Attachments Export Section -->
        <div class="backup-section">
            <h3><?php echo t_h('backup_export.sections.attachments_export.title', [], 'Attachments Export'); ?></h3>
            <p>
                <?php echo t_h('backup_export.sections.attachments_export.description', [], 'Download all the attachments of your account in a single ZIP archive.'); ?>
                <?php if ($s3StorageEnabled): ?>
                    <br><br>
                    <?php echo t_h('backup_export.sections.attachments_export.description_s3', [], 'With S3 storage enabled, the files are fetched from the bucket; use this archive to add the missing files to a backup made without S3 attachments before restoring it.'); ?>
                <?php endif; ?>
            </p>
            <button id="attachmentsExportBtn" type="button" class="btn btn-primary">
                <span><?php echo t_h('backup_export.buttons.download_attachments_export', [], 'Download attachments (ZIP)'); ?></span>
            </button>
        </div>

        <?php if ($s3BackupSectionVisible): ?>
        <!-- S3 Backups Section (own account) -->
        <div class="backup-section" id="s3-user-backup-section">
            <h3><?php echo t_h('backup_export.sections.s3_backup.title', [], 'S3 Backups'); ?></h3>
            <p><?php echo t_h('backup_export.sections.s3_backup.description', [], 'Upload a backup archive of your account to the S3 bucket configured on this instance, and download the archives already stored there.'); ?></p>
            <button id="s3SelfBackupBtn" type="button" class="btn btn-primary">
                <span><?php echo t_h('backup_export.sections.s3_backup.backup_now', [], 'Back up my account to S3'); ?></span>
            </button>
            <div id="s3SelfBackupStatus" class="s3-self-status" hidden></div>
            <div class="s3-self-table-wrap">
                <table class="s3-self-table" id="s3SelfBackupTable" hidden>
                    <thead>
                        <tr>
                            <th><?php echo t_h('s3_backup.col_archive', [], 'Archive'); ?></th>
                            <th><?php echo t_h('s3_backup.col_size', [], 'Size'); ?></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
            <div id="s3SelfBackupListStatus" class="s3-self-status" hidden></div>
        </div>
        <style>
        #s3-user-backup-section .s3-self-status { margin-top: 12px; font-size: 0.9rem; }
        #s3-user-backup-section .s3-self-table-wrap { overflow-x: auto; }
        #s3-user-backup-section .s3-self-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 0.9rem; }
        #s3-user-backup-section .s3-self-table th, #s3-user-backup-section .s3-self-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid rgba(128,128,128,0.25); }
        #s3-user-backup-section .s3-self-table td:last-child { text-align: right; white-space: nowrap; }
        #s3-user-backup-section .s3-self-table .btn { display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 10px; font-size: 0.85rem; line-height: 1.4; border: none; margin: 0; box-sizing: border-box; }
        #s3-user-backup-section .s3-self-table a.btn-primary { background-color: #007cba; color: #fff; text-decoration: none; }
        #s3-user-backup-section .s3-self-table a.btn-primary:hover { background-color: #005a8a; }
        #s3-user-backup-section .s3-self-table .btn-danger { background-color: #dc3545; color: #fff; border: none; }
        #s3-user-backup-section .s3-self-table .btn-danger:hover { background-color: #b02a37; }
        </style>
        <script src="js/modal-alerts.js?v=<?php echo getAppVersion(); ?>"></script>
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            var i18n = {
                running: <?php echo json_encode(t('backup_export.sections.s3_backup.running', [], 'Uploading the backup to the bucket...')); ?>,
                done: <?php echo json_encode(t('backup_export.sections.s3_backup.done', [], 'Backup uploaded ({{size}}).')); ?>,
                error: <?php echo json_encode(t('backup_export.sections.s3_backup.error', [], 'Backup failed: {{error}}')); ?>,
                listEmpty: <?php echo json_encode(t('backup_export.sections.s3_backup.list_empty', [], 'No backup of your account in the bucket yet.')); ?>,
                listError: <?php echo json_encode(t('s3_backup.list_error', [], 'Cannot list the bucket: {{error}}')); ?>,
                download: <?php echo json_encode(t('s3_backup.download', [], 'Download')); ?>,
                deleteLabel: <?php echo json_encode(t('s3_backup.delete', [], 'Delete')); ?>,
                confirmDelete: <?php echo json_encode(t('s3_backup.confirm_delete', [], 'Delete the backup {{filename}} from the bucket?')); ?>
            };

            function formatBytes(bytes) {
                if (bytes === null || bytes === undefined) return '';
                var units = ['B', 'KB', 'MB', 'GB', 'TB'];
                var i = 0, v = bytes;
                while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
                return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
            }

            var runBtn = document.getElementById('s3SelfBackupBtn');
            var statusEl = document.getElementById('s3SelfBackupStatus');
            var listStatusEl = document.getElementById('s3SelfBackupListStatus');
            var table = document.getElementById('s3SelfBackupTable');

            function refreshList() {
                fetch('api_s3_backup.php?action=self_status', { credentials: 'same-origin' })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        var tbody = table.querySelector('tbody');
                        tbody.innerHTML = '';
                        if (!data.success) {
                            table.hidden = true;
                            listStatusEl.hidden = false;
                            listStatusEl.textContent = i18n.listError.replace('{{error}}', data.error || 'unknown');
                            return;
                        }
                        if (!data.configured || !data.backups.length) {
                            table.hidden = true;
                            listStatusEl.hidden = false;
                            listStatusEl.textContent = i18n.listEmpty;
                            return;
                        }
                        listStatusEl.hidden = true;
                        table.hidden = false;
                        data.backups.forEach(function(backup) {
                            var tr = document.createElement('tr');

                            var tdFile = document.createElement('td');
                            tdFile.textContent = backup.filename;
                            tr.appendChild(tdFile);

                            var tdSize = document.createElement('td');
                            tdSize.textContent = formatBytes(backup.size);
                            tr.appendChild(tdSize);

                            var tdActions = document.createElement('td');
                            var dlLink = document.createElement('a');
                            dlLink.className = 'btn btn-primary';
                            dlLink.href = 'api_s3_backup.php?action=self_download&key=' + encodeURIComponent(backup.key);
                            dlLink.textContent = i18n.download;
                            tdActions.appendChild(dlLink);
                            tdActions.appendChild(document.createTextNode(' '));

                            var delBtn = document.createElement('button');
                            delBtn.type = 'button';
                            delBtn.className = 'btn btn-danger';
                            delBtn.textContent = i18n.deleteLabel;
                            delBtn.addEventListener('click', function() {
                                var message = i18n.confirmDelete.replace('{{filename}}', backup.filename);
                                var confirmed = window.modalAlert
                                    ? window.modalAlert.confirm(message, i18n.deleteLabel)
                                    : Promise.resolve(window.confirm(message));
                                confirmed.then(function(ok) {
                                    if (!ok) return;
                                    var body = new URLSearchParams();
                                    body.append('key', backup.key);
                                    fetch('api_s3_backup.php?action=self_delete', {
                                        method: 'POST',
                                        credentials: 'same-origin',
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                        body: body.toString()
                                    })
                                    .then(function(r) { return r.json(); })
                                    .then(function() { refreshList(); })
                                    .catch(function() { refreshList(); });
                                });
                            });
                            tdActions.appendChild(delBtn);
                            tr.appendChild(tdActions);

                            tbody.appendChild(tr);
                        });
                    })
                    .catch(function(e) {
                        table.hidden = true;
                        listStatusEl.hidden = false;
                        listStatusEl.textContent = i18n.listError.replace('{{error}}', e.message);
                    });
            }

            runBtn.addEventListener('click', function() {
                if (runBtn.disabled) return;
                runBtn.disabled = true;
                statusEl.hidden = false;
                statusEl.textContent = i18n.running;

                fetch('api_s3_backup.php?action=self_run', { method: 'POST', credentials: 'same-origin' })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        statusEl.textContent = data.success
                            ? i18n.done.replace('{{size}}', formatBytes(data.size))
                            : i18n.error.replace('{{error}}', data.error || 'unknown');
                        runBtn.disabled = false;
                        refreshList();
                    })
                    .catch(function(e) {
                        statusEl.textContent = i18n.error.replace('{{error}}', e.message);
                        runBtn.disabled = false;
                    });
            });

            refreshList();
        });
        </script>
        <?php endif; ?>

        <!-- Bottom padding for better spacing -->
        <div class="section-bottom-spacer"></div>
    </div>

    <script src="js/backup-export.js?v=<?php echo filemtime(__DIR__ . '/js/backup-export.js'); ?>"></script>
    <script src="js/backup-export-init.js"></script>
</body>
</html>
