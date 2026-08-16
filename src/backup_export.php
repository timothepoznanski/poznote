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

    // Logged before the headers go out: this function ends in exit() after
    // readfile(), so anything after that point would never run.
    require_once __DIR__ . '/ActivityLog.php';
    logActivity(ACTIVITY_BACKUP_CREATED, [
        'filename' => $build['filename'],
        'size' => @filesize($zipFileName) ?: null,
        'destination' => 'download',
    ], 'web', $userId);

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
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/lucide.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/backup_export.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/base.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/specific-modals.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/attachments.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/share-modal.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/alerts-utilities.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modals/responsive.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/modal-alerts.css'); ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/layout.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/menus.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/editor.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/modals.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/components.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/pages.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/markdown.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/kanban.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/icons.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/icon-sidebar.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/icon-sidebar-page.css'); ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/icon-sidebar-mobile.css'); ?>">
    <script src="<?php echo poznoteAsset('js/globals.js'); ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
</head>
<body class="has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php include 'icon_sidebar.php'; ?>
    <div class="backup-container">
    <h1 class="poznote-page-title"><i class="lucide lucide-upload"></i> <?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></h1>

        <!-- Complete Backup Section -->
        <div class="backup-section" id="complete-backup-section">
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
        <div class="backup-section" id="structured-export-section">
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
        <div class="backup-section" id="attachments-export-section">
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
            <p id="s3SelfBackupPolicy" class="s3-self-policy" hidden></p>
            <button id="s3SelfBackupBtn" type="button" class="btn btn-primary">
                <span><?php echo t_h('backup_export.sections.s3_backup.backup_now', [], 'Back up my account to S3'); ?></span>
            </button>
            <div id="s3SelfBackupStatus" class="s3-self-status" hidden></div>
            <div class="s3-self-table-wrap">
                <table class="s3-self-table" id="s3SelfBackupTable" hidden>
                    <thead>
                        <tr>
                            <th data-sort-key="filename">
                                <button type="button" class="s3-self-sort-btn"><?php echo t_h('s3_backup.col_archive', [], 'Archive'); ?><i class="lucide lucide-chevron-down s3-self-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="mtime">
                                <button type="button" class="s3-self-sort-btn"><?php echo t_h('s3_backup.col_date', [], 'Date'); ?><i class="lucide lucide-chevron-down s3-self-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="size">
                                <button type="button" class="s3-self-sort-btn"><?php echo t_h('s3_backup.col_size', [], 'Size'); ?><i class="lucide lucide-chevron-down s3-self-sort-icon"></i></button>
                            </th>
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
        /* Backup policy configured by the admin, shown under the description */
        #s3-user-backup-section .s3-self-policy { font-size: 0.9rem; opacity: 0.85; }
        #s3-user-backup-section .s3-self-policy[hidden] { display: none; }
        /* Highlight the values that depend on the admin's configuration
           (same red as .text-warning-bold used elsewhere on this page) */
        #s3-user-backup-section .s3-self-policy-value { color: #dc3545; font-weight: 600; }
        body.dark-mode #s3-user-backup-section .s3-self-policy-value { color: #f87171; }
        /* Successful upload gets a blue info box (same palette as .config-hint
           on the settings pages, which this page does not load) */
        #s3-user-backup-section .s3-self-status.is-success { padding: 12px; border-radius: 8px; background: #f0f7ff; color: #1a56db; }
        body.dark-mode #s3-user-backup-section .s3-self-status.is-success { background: rgba(99, 102, 241, 0.1); color: #a5b4fc; }
        #s3-user-backup-section .s3-self-table-wrap { overflow-x: auto; }
        #s3-user-backup-section .s3-self-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 0.9rem; }
        /* Borderless, one line per row: long archive names scroll sideways in
           the wrapper rather than wrapping onto a second line */
        #s3-user-backup-section .s3-self-table th, #s3-user-backup-section .s3-self-table td { text-align: left; padding: 6px 10px; white-space: nowrap; }
        #s3-user-backup-section .s3-self-table td:last-child { text-align: right; }
        /* Sortable column headers */
        #s3-user-backup-section .s3-self-sort-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; }
        #s3-user-backup-section .s3-self-sort-btn .s3-self-sort-icon { width: 12px; height: 12px; opacity: 0.35; }
        #s3-user-backup-section .s3-self-sort-btn:hover .s3-self-sort-icon,
        #s3-user-backup-section .s3-self-sort-btn.s3-self-sort-active .s3-self-sort-icon { opacity: 1; }
        #s3-user-backup-section .s3-self-sort-btn.s3-self-sort-active { font-weight: 700; }
        #s3-user-backup-section .s3-self-table .btn { display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 10px; font-size: 0.85rem; line-height: 1.4; border: none; margin: 0; box-sizing: border-box; }
        #s3-user-backup-section .s3-self-table a.btn-primary { background-color: #007cba; color: #fff; text-decoration: none; }
        #s3-user-backup-section .s3-self-table a.btn-primary:hover { background-color: #005a8a; }
        #s3-user-backup-section .s3-self-table .btn-danger { background-color: #dc3545; color: #fff; border: none; }
        #s3-user-backup-section .s3-self-table .btn-danger:hover { background-color: #b02a37; }
        </style>
        <script src="<?php echo poznoteAsset('js/modal-alerts.js'); ?>"></script>
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
                confirmDelete: <?php echo json_encode(t('s3_backup.confirm_delete', [], 'Delete the backup {{filename}} from the bucket?')); ?>,
                confirmRun: <?php echo json_encode(t('backup_export.sections.s3_backup.confirm_run', [], 'Back up your account to the S3 bucket now? The archive can take a while to upload.')); ?>,
                confirmRunTitle: <?php echo json_encode(t('backup_export.sections.s3_backup.backup_now', [], 'Back up my account to S3')); ?>,
                policyAuto: <?php echo json_encode(t('backup_export.sections.s3_backup.policy_auto', [], 'The administrator has set up an automatic backup {{frequency}}, keeping the last {{retention}} archive(s) per user.')); ?>,
                policyAutoKeepAll: <?php echo json_encode(t('backup_export.sections.s3_backup.policy_auto_keep_all', [], 'The administrator has set up an automatic backup {{frequency}}; every archive is kept.')); ?>,
                policyManual: <?php echo json_encode(t('backup_export.sections.s3_backup.policy_manual', [], 'Automatic backups are disabled; the last {{retention}} archive(s) per user are kept.')); ?>,
                policyManualKeepAll: <?php echo json_encode(t('backup_export.sections.s3_backup.policy_manual_keep_all', [], 'Automatic backups are disabled; every archive is kept.')); ?>,
                freqDaily: <?php echo json_encode(t('s3_backup.frequency_daily_inline', [], 'every day')); ?>,
                freqWeekly: <?php echo json_encode(t('s3_backup.frequency_weekly_inline', [], 'every week')); ?>,
                freqMonthly: <?php echo json_encode(t('s3_backup.frequency_monthly_inline', [], 'every 30 days')); ?>
            };

            function formatBytes(bytes) {
                if (bytes === null || bytes === undefined) return '';
                var units = ['B', 'KB', 'MB', 'GB', 'TB'];
                var i = 0, v = bytes;
                while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
                return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
            }

            // Bucket timestamps arrive as UTC epochs; render them in local time.
            // Kept compact (2-digit fields, no seconds) so the row fits on one line.
            function formatTimestamp(epoch) {
                if (!epoch) return '';
                var d = new Date(epoch * 1000);
                try {
                    return d.toLocaleString(undefined, {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                    });
                } catch (e) {
                    return d.toLocaleString();
                }
            }

            var runBtn = document.getElementById('s3SelfBackupBtn');
            var statusEl = document.getElementById('s3SelfBackupStatus');
            var listStatusEl = document.getElementById('s3SelfBackupListStatus');
            var policyEl = document.getElementById('s3SelfBackupPolicy');
            var table = document.getElementById('s3SelfBackupTable');

            /**
             * Spell out the backup policy the admin configured for this
             * instance: how often automatic backups run, and how many archives
             * are kept per user before the oldest ones are pruned.
             */
            function renderPolicy(data) {
                if (!data.configured) {
                    policyEl.hidden = true;
                    return;
                }
                var freq = { daily: i18n.freqDaily, weekly: i18n.freqWeekly, monthly: i18n.freqMonthly }[data.frequency]
                    || i18n.freqDaily;
                var retention = Number(data.retention || 0);
                var keepAll = retention <= 0;   // 0 means "keep everything"
                var template;
                if (data.auto_enabled) {
                    template = keepAll ? i18n.policyAutoKeepAll : i18n.policyAuto;
                } else {
                    template = keepAll ? i18n.policyManualKeepAll : i18n.policyManual;
                }

                // Split on the placeholders and rebuild the sentence so the
                // substituted values can be highlighted; the translated text
                // itself stays plain text nodes and is never parsed as HTML.
                var values = { '{{frequency}}': freq, '{{retention}}': String(retention) };
                policyEl.textContent = '';
                template.split(/(\{\{frequency\}\}|\{\{retention\}\})/).forEach(function(part) {
                    if (part === '') return;
                    if (Object.prototype.hasOwnProperty.call(values, part)) {
                        var span = document.createElement('span');
                        span.className = 's3-self-policy-value';
                        span.textContent = values[part];
                        policyEl.appendChild(span);
                    } else {
                        policyEl.appendChild(document.createTextNode(part));
                    }
                });
                policyEl.hidden = false;
            }

            // The API returns the archives newest first; clicking a header
            // re-sorts this cached list rather than refetching the bucket.
            var backupList = [];
            var sortKey = null;
            var sortDir = 'asc';

            function sortedBackups() {
                if (!sortKey) return backupList.slice();
                var numeric = sortKey === 'mtime' || sortKey === 'size';
                return backupList.slice().sort(function(a, b) {
                    var cmp = numeric
                        ? (Number(a[sortKey] || 0) - Number(b[sortKey] || 0))
                        : String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), undefined, { sensitivity: 'base', numeric: true });
                    return sortDir === 'asc' ? cmp : -cmp;
                });
            }

            function updateSortIndicators() {
                table.querySelectorAll('thead th[data-sort-key]').forEach(function(th) {
                    var isActive = th.getAttribute('data-sort-key') === sortKey;
                    var btn = th.querySelector('.s3-self-sort-btn');
                    var icon = th.querySelector('.s3-self-sort-icon');
                    btn.classList.toggle('s3-self-sort-active', isActive);
                    icon.classList.toggle('lucide-chevron-up', isActive && sortDir === 'asc');
                    icon.classList.toggle('lucide-chevron-down', !isActive || sortDir === 'desc');
                    th.setAttribute('aria-sort', isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
                });
            }

            table.querySelectorAll('thead th[data-sort-key]').forEach(function(th) {
                th.querySelector('.s3-self-sort-btn').addEventListener('click', function() {
                    var key = th.getAttribute('data-sort-key');
                    // Same column toggles direction; a new column starts ascending
                    sortDir = (key === sortKey && sortDir === 'asc') ? 'desc' : 'asc';
                    sortKey = key;
                    updateSortIndicators();
                    renderBackupRows();
                });
            });

            function refreshList() {
                fetch('api_s3_backup.php?action=self_status', { credentials: 'same-origin' })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        var tbody = table.querySelector('tbody');
                        tbody.innerHTML = '';
                        backupList = [];
                        if (!data.success) {
                            table.hidden = true;
                            policyEl.hidden = true;
                            listStatusEl.hidden = false;
                            listStatusEl.textContent = i18n.listError.replace('{{error}}', data.error || 'unknown');
                            return;
                        }
                        renderPolicy(data);
                        if (!data.configured || !data.backups.length) {
                            table.hidden = true;
                            listStatusEl.hidden = false;
                            listStatusEl.textContent = i18n.listEmpty;
                            return;
                        }
                        listStatusEl.hidden = true;
                        table.hidden = false;
                        backupList = data.backups;
                        renderBackupRows();
                    })
                    .catch(function(e) {
                        table.hidden = true;
                        listStatusEl.hidden = false;
                        listStatusEl.textContent = i18n.listError.replace('{{error}}', e.message);
                    });
            }

            function renderBackupRows() {
                var tbody = table.querySelector('tbody');
                tbody.innerHTML = '';
                sortedBackups().forEach(function(backup) {
                    var tr = document.createElement('tr');

                    var tdFile = document.createElement('td');
                    tdFile.textContent = backup.filename;
                    tr.appendChild(tdFile);

                    var tdDate = document.createElement('td');
                    tdDate.textContent = formatTimestamp(backup.mtime);
                    tr.appendChild(tdDate);

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
            }

            runBtn.addEventListener('click', function() {
                if (runBtn.disabled) return;

                // Uploading a full archive is slow and costs bucket storage,
                // so ask before starting (same pattern as the delete button)
                var confirmed = window.modalAlert
                    ? window.modalAlert.confirm(i18n.confirmRun, i18n.confirmRunTitle)
                    : Promise.resolve(window.confirm(i18n.confirmRun));

                confirmed.then(function(ok) {
                    if (!ok) return;
                    runBtn.disabled = true;
                    statusEl.hidden = false;
                    statusEl.classList.remove('is-success');
                    statusEl.textContent = i18n.running;

                    fetch('api_s3_backup.php?action=self_run', { method: 'POST', credentials: 'same-origin' })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            statusEl.textContent = data.success
                                ? i18n.done.replace('{{size}}', formatBytes(data.size))
                                : i18n.error.replace('{{error}}', data.error || 'unknown');
                            // Only the success message gets the blue box
                            statusEl.classList.toggle('is-success', !!data.success);
                            runBtn.disabled = false;
                            refreshList();
                        })
                        .catch(function(e) {
                            statusEl.textContent = i18n.error.replace('{{error}}', e.message);
                            statusEl.classList.remove('is-success');
                            runBtn.disabled = false;
                        });
                });
            });

            refreshList();
        });
        </script>
        <?php endif; ?>

        <!-- Bottom padding for better spacing -->
        <div class="section-bottom-spacer"></div>
    </div>

    <style>
    /* Collapsible sections: the h3 becomes the clickable header and everything
       after it is wrapped in .backup-section-body by the script below. */
    .backup-section-header { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .backup-section-toggle {
        display: inline-flex; align-items: center; justify-content: center;
        margin-left: auto; padding: 2px; border: none; background: none;
        color: inherit; font-size: 1.05rem; cursor: pointer; opacity: 0.7;
    }
    .backup-section-header:hover .backup-section-toggle { opacity: 1; }
    .backup-section-toggle .lucide { transition: transform 0.15s ease; }
    .backup-section-header.section-collapsed .backup-section-toggle .lucide { transform: rotate(-90deg); }
    .backup-section-body.section-collapsed { display: none; }
    /* Collapsed: hide the underline, drop the h3's trailing space and shrink
       the title so the card hugs it */
    .backup-section-header.section-collapsed {
        margin-bottom: 0;
        border-bottom: none;
        padding-bottom: 0;
        font-size: 1rem;
    }
    /* Collapsed cards are just a title bar, so tighten their padding and the
       gap between them */
    .backup-section.section-collapsed {
        padding: 10px 20px;
        margin-bottom: 10px;
    }
    </style>
    <script>
    (function() {
        // Chevron on each section header collapses the content below it.
        // State is per user (same storage wrapper as the settings page) and
        // keyed by section so the layout survives a reload.
        var store = window.__poznoteUserStorage || window.localStorage;
        var STORAGE_KEY = 'backupExportCollapsedSections';

        var collapsed = [];
        try {
            collapsed = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
            if (!Array.isArray(collapsed)) collapsed = [];
        } catch (e) { /* storage unavailable or corrupt */ }

        document.querySelectorAll('.backup-section').forEach(function(section, index) {
            var title = section.querySelector(':scope > h3');
            if (!title) return;

            // Everything after the title becomes the collapsible body
            var body = document.createElement('div');
            body.className = 'backup-section-body';
            while (title.nextSibling) body.appendChild(title.nextSibling);
            section.appendChild(body);

            // Prefer a stable id over the DOM position, which shifts when the
            // S3 section is hidden for a user
            var key = section.id || ('backup-section-' + index);
            if (!body.id) body.id = key + '-body';

            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'backup-section-toggle';
            toggle.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
            toggle.setAttribute('aria-controls', body.id);
            title.appendChild(toggle);
            title.classList.add('backup-section-header');

            function apply(isCollapsed) {
                title.classList.toggle('section-collapsed', isCollapsed);
                body.classList.toggle('section-collapsed', isCollapsed);
                // Also on the card itself, so the tightened spacing works
                // without relying on :has()
                section.classList.toggle('section-collapsed', isCollapsed);
                toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            }
            apply(collapsed.indexOf(key) !== -1);

            // The button's click bubbles up here, so one listener covers both
            title.addEventListener('click', function() {
                var isCollapsed = !title.classList.contains('section-collapsed');
                apply(isCollapsed);
                var idx = collapsed.indexOf(key);
                if (isCollapsed && idx === -1) collapsed.push(key);
                if (!isCollapsed && idx !== -1) collapsed.splice(idx, 1);
                try { store.setItem(STORAGE_KEY, JSON.stringify(collapsed)); } catch (e) {}
            });
        });
    })();
    </script>

    <script src="<?php echo poznoteAsset('js/backup-export.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/backup-export-init.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
</body>
</html>
