<?php
/**
 * S3 backup settings page (admin only)
 *
 * Configure an S3-compatible bucket where complete backup archives (one ZIP
 * per user, same content as the "Complete Backup" download) are uploaded,
 * either manually from this page or automatically on a schedule by the
 * s3-backup-worker. The configuration lives in master.db (global_settings),
 * is independent from the S3 attachment storage one, and applies to the
 * whole instance.
 */

require 'auth.php';
requireAuth();
requireAdmin();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'users/db_master.php';
require_once 'S3BackupService.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

// Master switch: saved on its own from the toggle at the top of the page
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_enabled') {
    if (setGlobalSetting('s3_backup_enabled', isset($_POST['s3_backup_enabled']) ? '1' : '0')) {
        $message = t('s3_backup.messages.saved', [], 'Configuration saved successfully.');
    } else {
        $error = t('s3_backup.messages.save_error', [], 'Failed to save configuration.');
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $autoEnabled = isset($_POST['s3_backup_auto_enabled']) ? '1' : '0';
    $endpoint = trim((string)($_POST['s3_backup_endpoint'] ?? ''));
    $region = trim((string)($_POST['s3_backup_region'] ?? '')) ?: 'us-east-1';
    $bucket = trim((string)($_POST['s3_backup_bucket'] ?? ''));
    $accessKey = trim((string)($_POST['s3_backup_access_key'] ?? ''));
    $secretKey = trim((string)($_POST['s3_backup_secret_key'] ?? ''));
    $pathStyle = isset($_POST['s3_backup_path_style']) ? '1' : '0';
    $frequency = (string)($_POST['s3_backup_frequency'] ?? 'daily');
    if (!isset(S3BackupService::FREQUENCIES[$frequency])) {
        $frequency = 'daily';
    }
    $retention = max(0, (int)($_POST['s3_backup_retention'] ?? 7));
    $skipS3Attachments = isset($_POST['s3_backup_skip_s3_attachments']) ? '1' : '0';

    // Checked users; when every existing user is checked, store an empty
    // selection so future accounts are covered automatically
    $postedUsers = $_POST['s3_backup_users'] ?? [];
    $selectedIds = is_array($postedUsers) ? array_values(array_unique(array_map('intval', $postedUsers))) : [];
    $allUserIds = array_map(function ($user) { return (int)$user['id']; }, listAllUserProfiles());
    $selectedIds = array_values(array_intersect($selectedIds, $allUserIds));
    $userIdsSetting = count($selectedIds) === count($allUserIds) ? '' : implode(',', $selectedIds);

    if ($autoEnabled === '1' && ($endpoint === '' || $bucket === '' || $accessKey === '')) {
        $error = t('s3_backup.messages.incomplete', [], 'Endpoint, bucket and credentials are required to enable automatic backups.');
    } elseif (empty($selectedIds)) {
        $error = t('s3_backup.messages.no_user_selected', [], 'Select at least one user to back up.');
    } else {
        $saved = setGlobalSetting('s3_backup_auto_enabled', $autoEnabled)
            && setGlobalSetting('s3_backup_endpoint', $endpoint)
            && setGlobalSetting('s3_backup_region', $region)
            && setGlobalSetting('s3_backup_bucket', $bucket)
            && setGlobalSetting('s3_backup_access_key', $accessKey)
            && setGlobalSetting('s3_backup_path_style', $pathStyle)
            && setGlobalSetting('s3_backup_frequency', $frequency)
            && setGlobalSetting('s3_backup_retention', (string)$retention)
            && setGlobalSetting('s3_backup_skip_s3_attachments', $skipS3Attachments)
            && setGlobalSetting('s3_backup_user_ids', $userIdsSetting);
        // Masked placeholder means "keep the existing key"
        if ($saved && $secretKey !== '••••••••') {
            $saved = setGlobalSetting('s3_backup_secret_key', $secretKey);
        }
        if ($saved) {
            $message = t('s3_backup.messages.saved', [], 'Configuration saved successfully.');
        } else {
            $error = t('s3_backup.messages.save_error', [], 'Failed to save configuration.');
        }
    }
}

$backupConfig = S3BackupService::getConfig();
$autoEnabled = $backupConfig['auto_enabled'];
$allBackupUsers = listAllUserProfiles();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('s3_backup.title', [], 'S3 Backups'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(poznoteBuildAssetCacheVersion(trim($cache_v)));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/git-sync.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <style>
    #s3-backup-run-log { white-space: pre-line; font-size: 0.85rem; margin-top: 6px; }
    .s3-backup-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
    .s3-backup-table th, .s3-backup-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid rgba(128,128,128,0.25); }
    .s3-backup-table td.s3-backup-actions-cell { text-align: right; white-space: nowrap; }
    .s3-backup-table .btn { display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 10px; font-size: 0.85rem; line-height: 1.4; border: none; margin: 0; box-sizing: border-box; }
    .s3-backup-table a.btn-primary { background-color: #007cba; color: #fff; text-decoration: none; }
    .s3-backup-table a.btn-primary:hover { background-color: #005a8a; }
    .s3-backup-table .btn-danger { background-color: #dc3545; color: #fff; }
    .s3-backup-table .btn-danger:hover { background-color: #b02a37; }
    .s3-backup-table-wrap { overflow-x: auto; }
    .s3-backup-users { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 6px 0; }
    .s3-backup-user-check { display: flex; align-items: center; gap: 6px; font-size: 0.95rem; cursor: pointer; }
    .s3-backup-user-check input { cursor: pointer; }
    #s3-backup-manual-desc { margin-bottom: 18px; }
    </style>
</head>
<body class="home-page git-sync-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container git-sync-container">

        <div class="git-sync-nav">
            <a id="backToNotesLink" href="index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes', [], 'Notes', $currentLang); ?>
            </a>
            <a id="backToSettingsLink" href="settings.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings', [], 'Settings', $currentLang); ?>
            </a>
        </div>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('s3_backup.description', [], 'Upload complete backup archives (one ZIP per user, identical to the Complete Backup download) to an S3-compatible bucket, manually or automatically on a schedule.'); ?><br>
                <?php echo t_h('s3_backup.description_scope', [], 'The setting applies to all users of this instance and is independent from the S3 attachment storage.'); ?></p>
        </div>

        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="lucide lucide-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($error): ?>
        <div class="alert alert-error">
            <i class="lucide lucide-alert-triangle-circle"></i>
            <?php echo htmlspecialchars($error); ?>
        </div>
        <?php endif; ?>

        <div class="git-sync-section">
            <form method="post" id="s3-backup-master-form">
                <input type="hidden" name="action" value="save_enabled">
                <div class="form-check">
                    <label class="switch">
                        <input type="checkbox" name="s3_backup_enabled" id="s3_backup_enabled" <?php echo $backupConfig['enabled'] ? 'checked' : ''; ?>>
                        <span class="slider round"></span>
                    </label>
                    <div class="check-label">
                        <span class="label-title"><?php echo t_h('s3_backup.master_label', [], 'Enable S3 backups'); ?></span>
                        <span class="label-desc"><?php echo t_h('s3_backup.master_description', [], 'Master switch. When disabled, automatic backups stop and the S3 backup and restore sections disappear for every user.'); ?></span>
                    </div>
                </div>
            </form>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-cloud"></i> <?php echo t_h('s3_backup.config_title', [], 'Configuration'); ?></h2>

            <form method="post">
                <input type="hidden" name="action" value="save_config">

                <div class="git-config-fields">
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="s3_backup_auto_enabled" id="s3_backup_auto_enabled" <?php echo $autoEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_backup.enable_label', [], 'Automatic backups'); ?></span>
                            <span class="label-desc"><?php echo t_h('s3_backup.enable_description', [], 'Back up the selected users to the bucket on the schedule below. Manual backups from this page work as soon as the connection is configured, even with this switch off.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_frequency"><?php echo t_h('s3_backup.frequency_label', [], 'Frequency'); ?></label>
                        <select name="s3_backup_frequency" id="s3_backup_frequency" class="git-field-input">
                            <option value="daily" <?php echo $backupConfig['frequency'] === 'daily' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_daily', [], 'Daily'); ?></option>
                            <option value="weekly" <?php echo $backupConfig['frequency'] === 'weekly' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_weekly', [], 'Weekly'); ?></option>
                            <option value="monthly" <?php echo $backupConfig['frequency'] === 'monthly' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_monthly', [], 'Monthly (every 30 days)'); ?></option>
                        </select>
                        <span class="label-desc"><?php echo t_h('s3_backup.frequency_description', [], 'The first automatic backup runs within a few minutes of enabling, the next ones after the chosen interval.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_retention"><?php echo t_h('s3_backup.retention_label', [], 'Backups to keep per user'); ?></label>
                        <input type="number" name="s3_backup_retention" id="s3_backup_retention" class="git-field-input" min="0" step="1"
                               value="<?php echo (int)$backupConfig['retention']; ?>">
                        <span class="label-desc"><?php echo t_h('s3_backup.retention_description', [], 'Older archives are deleted from the bucket after each backup. 0 keeps everything.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_endpoint"><?php echo t_h('s3_settings.endpoint_label', [], 'Endpoint URL'); ?></label>
                        <input type="text" name="s3_backup_endpoint" id="s3_backup_endpoint" class="git-field-input"
                               value="<?php echo htmlspecialchars($backupConfig['endpoint']); ?>"
                               placeholder="https://s3.eu-west-1.amazonaws.com">
                        <span class="label-desc"><?php echo t_h('s3_settings.endpoint_description', [], 'Base URL of the S3 API. Examples: https://s3.amazonaws.com, http://minio:9000, https://<account>.r2.cloudflarestorage.com'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_region"><?php echo t_h('s3_settings.region_label', [], 'Region'); ?></label>
                        <input type="text" name="s3_backup_region" id="s3_backup_region" class="git-field-input"
                               value="<?php echo htmlspecialchars($backupConfig['region']); ?>"
                               placeholder="us-east-1">
                        <span class="label-desc"><?php echo t_h('s3_settings.region_description', [], 'Leave "us-east-1" for MinIO/Garage and providers that ignore the region.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_bucket"><?php echo t_h('s3_settings.bucket_label', [], 'Bucket'); ?></label>
                        <input type="text" name="s3_backup_bucket" id="s3_backup_bucket" class="git-field-input"
                               value="<?php echo htmlspecialchars($backupConfig['bucket']); ?>"
                               placeholder="poznote-backups">
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_access_key"><?php echo t_h('s3_settings.access_key_label', [], 'Access key'); ?></label>
                        <input type="text" name="s3_backup_access_key" id="s3_backup_access_key" class="git-field-input"
                               value="<?php echo htmlspecialchars($backupConfig['access_key']); ?>"
                               autocomplete="off">
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_backup_secret_key"><?php echo t_h('s3_settings.secret_key_label', [], 'Secret key'); ?></label>
                        <input type="password" name="s3_backup_secret_key" id="s3_backup_secret_key" class="git-field-input"
                               value="<?php echo $backupConfig['secret_key'] !== '' ? '••••••••' : ''; ?>"
                               autocomplete="off">
                    </div>

                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="s3_backup_path_style" id="s3_backup_path_style" <?php echo $backupConfig['path_style'] ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_settings.path_style_label', [], 'Path-style addressing'); ?></span>
                            <span class="label-desc"><?php echo t_h('s3_settings.path_style_description', [], 'Keep enabled for MinIO, Garage and most self-hosted servers. Disable only if your provider requires virtual-host style (bucket.endpoint).'); ?></span>
                        </div>
                    </div>

                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="s3_backup_skip_s3_attachments" id="s3_backup_skip_s3_attachments" <?php echo $backupConfig['skip_s3_attachments'] ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_backup.skip_s3_label', [], 'Skip attachments already stored in S3'); ?></span>
                            <span class="label-desc"><?php echo t_h('s3_backup.skip_s3_description', [], 'When attachments live in an S3 bucket (S3 storage feature), leave them out of the archives instead of downloading them for every backup. Attachments on local disk are always included.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label"><?php echo t_h('s3_backup.users_label', [], 'Users to back up'); ?></label>
                        <div class="s3-backup-users">
                            <?php foreach ($allBackupUsers as $backupUser):
                                $backupUserId = (int)$backupUser['id'];
                                $isSelected = $backupConfig['user_ids'] === null || in_array($backupUserId, $backupConfig['user_ids'], true);
                            ?>
                            <label class="s3-backup-user-check">
                                <input type="checkbox" name="s3_backup_users[]" value="<?php echo $backupUserId; ?>" <?php echo $isSelected ? 'checked' : ''; ?>>
                                <?php echo htmlspecialchars($backupUser['username']); ?><?php echo !empty($backupUser['is_admin']) ? ' (Admin)' : ''; ?>
                            </label>
                            <?php endforeach; ?>
                        </div>
                    </div>

                    <div class="git-field-actions">
                        <button type="button" id="s3-backup-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('s3_settings.test', [], 'Test connection'); ?>
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('s3_settings.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                    <div id="s3-backup-test-result" class="config-hint" hidden></div>
                </div>
            </form>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-upload"></i> <?php echo t_h('s3_backup.manual_title', [], 'Manual backup'); ?></h2>
            <p class="git-sync-description" id="s3-backup-manual-desc"><?php echo t_h('s3_backup.manual_description', [], 'Back up the selected users to the bucket right now, one user at a time.'); ?></p>

            <div class="git-field-actions">
                <button type="button" id="s3-backup-run-btn" class="btn btn-primary">
                    <i class="lucide lucide-upload"></i>
                    <?php echo t_h('s3_backup.run_now', [], 'Back up now'); ?>
                </button>
            </div>
            <div class="config-hint" id="s3-backup-run-status" hidden></div>
            <div id="s3-backup-run-log" class="label-desc"></div>
            <div class="config-hint" id="s3-backup-last-run" hidden></div>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-archive"></i> <?php echo t_h('s3_backup.list_title', [], 'Backups in the bucket'); ?></h2>
            <div class="config-hint" id="s3-backup-list-status" hidden></div>
            <div class="s3-backup-table-wrap">
                <table class="s3-backup-table" id="s3-backup-table" hidden>
                    <thead>
                        <tr>
                            <th><?php echo t_h('s3_backup.col_user', [], 'User'); ?></th>
                            <th><?php echo t_h('s3_backup.col_archive', [], 'Archive'); ?></th>
                            <th><?php echo t_h('s3_backup.col_size', [], 'Size'); ?></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>

        <div class="git-sync-footer-note">
            <?php echo t_h('s3_backup.footer_note', [], 'Archives are stored under backups/{user id}/ in the bucket and can be restored with the standard "Restore / Import" page.'); ?>
        </div>

    </div>

    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        // Master switch saves immediately
        document.getElementById('s3_backup_enabled').addEventListener('change', function() {
            document.getElementById('s3-backup-master-form').submit();
        });

        var i18n = {
            testing: <?php echo json_encode(t('s3_settings.testing', [], 'Testing connection...')); ?>,
            testSuccess: <?php echo json_encode(t('s3_settings.test_success', [], 'Connection successful, the bucket is reachable.')); ?>,
            testFailure: <?php echo json_encode(t('s3_settings.test_failure', [], 'Connection failed: {{error}}')); ?>,
            confirmRun: <?php echo json_encode(t('s3_backup.confirm_run', [], 'Back up the selected users to the bucket now?')); ?>,
            running: <?php echo json_encode(t('s3_backup.running', [], 'Backing up {{username}}... ({{done}}/{{total}})')); ?>,
            runDone: <?php echo json_encode(t('s3_backup.run_done', [], 'Backup finished: {{uploaded}}/{{total}} user(s) uploaded.')); ?>,
            runError: <?php echo json_encode(t('s3_backup.run_error', [], 'Backup stopped after an error: {{error}}')); ?>,
            userOk: <?php echo json_encode(t('s3_backup.user_ok', [], '{{username}}: uploaded ({{size}})')); ?>,
            userFail: <?php echo json_encode(t('s3_backup.user_fail', [], '{{username}}: failed ({{error}})')); ?>,
            notConfigured: <?php echo json_encode(t('s3_backup.not_configured', [], 'Configure and save the bucket connection first.')); ?>,
            lastRun: <?php echo json_encode(t('s3_backup.last_run', [], 'Last run ({{trigger}}): {{date}}, {{uploaded}}/{{total}} user(s) uploaded.')); ?>,
            triggerAuto: <?php echo json_encode(t('s3_backup.trigger_auto', [], 'automatic')); ?>,
            triggerManual: <?php echo json_encode(t('s3_backup.trigger_manual', [], 'manual')); ?>,
            listEmpty: <?php echo json_encode(t('s3_backup.list_empty', [], 'No backup in the bucket yet.')); ?>,
            listError: <?php echo json_encode(t('s3_backup.list_error', [], 'Cannot list the bucket: {{error}}')); ?>,
            listLoading: <?php echo json_encode(t('s3_backup.list_loading', [], 'Loading...')); ?>,
            download: <?php echo json_encode(t('s3_backup.download', [], 'Download')); ?>,
            deleteLabel: <?php echo json_encode(t('s3_backup.delete', [], 'Delete')); ?>,
            confirmDelete: <?php echo json_encode(t('s3_backup.confirm_delete', [], 'Delete the backup {{filename}} from the bucket?')); ?>,
            manualTitle: <?php echo json_encode(t('s3_backup.manual_title', [], 'Manual backup')); ?>
        };

        function formatBytes(bytes) {
            if (bytes === null || bytes === undefined) return '';
            var units = ['B', 'KB', 'MB', 'GB', 'TB'];
            var i = 0, v = bytes;
            while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
            return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
        }

        // ---- Connection test ------------------------------------------------
        document.getElementById('s3-backup-test-btn').addEventListener('click', function() {
            var resultEl = document.getElementById('s3-backup-test-result');
            resultEl.hidden = false;
            resultEl.textContent = i18n.testing;

            var body = new URLSearchParams();
            body.append('endpoint', document.getElementById('s3_backup_endpoint').value.trim());
            body.append('region', document.getElementById('s3_backup_region').value.trim());
            body.append('bucket', document.getElementById('s3_backup_bucket').value.trim());
            body.append('access_key', document.getElementById('s3_backup_access_key').value.trim());
            body.append('secret_key', document.getElementById('s3_backup_secret_key').value);
            body.append('path_style', document.getElementById('s3_backup_path_style').checked ? '1' : '0');

            fetch('api_s3_backup.php?action=test', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                resultEl.textContent = data.success
                    ? i18n.testSuccess
                    : i18n.testFailure.replace('{{error}}', data.error || 'unknown');
            })
            .catch(function(e) {
                resultEl.textContent = i18n.testFailure.replace('{{error}}', e.message);
            });
        });

        // ---- Status / last run ---------------------------------------------
        var statusData = null;

        function renderLastRun() {
            var el = document.getElementById('s3-backup-last-run');
            if (!statusData || !statusData.last_run) {
                el.textContent = '';
                el.hidden = true;
                return;
            }
            el.hidden = false;
            var run = statusData.last_run;
            var date = run.finished_at ? new Date(run.finished_at * 1000).toLocaleString() : '?';
            el.textContent = i18n.lastRun
                .replace('{{trigger}}', run.trigger === 'auto' ? i18n.triggerAuto : i18n.triggerManual)
                .replace('{{date}}', date)
                .replace('{{uploaded}}', run.uploaded)
                .replace('{{total}}', run.users);
            if (run.errors && run.errors.length) {
                el.textContent += ' ' + run.errors.join(' | ');
            }
        }

        function refreshStatus() {
            return fetch('api_s3_backup.php?action=status', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        statusData = data;
                        renderLastRun();
                    }
                    return data;
                });
        }

        // ---- Manual run -----------------------------------------------------
        var runInProgress = false;

        document.getElementById('s3-backup-run-btn').addEventListener('click', function() {
            if (runInProgress) return;
            window.modalAlert.confirm(i18n.confirmRun, i18n.manualTitle).then(function(confirmed) {
                if (!confirmed || runInProgress) return;
                startRun();
            });
        });

        function startRun() {
            runInProgress = true;
            var statusEl = document.getElementById('s3-backup-run-status');
            var logEl = document.getElementById('s3-backup-run-log');
            statusEl.hidden = false;
            logEl.textContent = '';

            refreshStatus().then(function(data) {
                if (!data || !data.success || !data.configured) {
                    statusEl.textContent = i18n.notConfigured;
                    runInProgress = false;
                    return;
                }
                var users = (data.users || []).filter(function(u) { return u.selected; });
                var uploaded = 0, errors = [], index = 0;

                function finish() {
                    statusEl.textContent = i18n.runDone
                        .replace('{{uploaded}}', uploaded)
                        .replace('{{total}}', users.length);
                    var body = new URLSearchParams();
                    body.append('users', String(users.length));
                    body.append('uploaded', String(uploaded));
                    body.append('errors', JSON.stringify(errors));
                    fetch('api_s3_backup.php?action=record_manual', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body.toString()
                    }).catch(function() {}).then(function() {
                        runInProgress = false;
                        refreshStatus();
                        refreshList();
                    });
                }

                function step() {
                    if (index >= users.length) {
                        finish();
                        return;
                    }
                    var user = users[index];
                    statusEl.textContent = i18n.running
                        .replace('{{username}}', user.username)
                        .replace('{{done}}', index)
                        .replace('{{total}}', users.length);

                    var body = new URLSearchParams();
                    body.append('user_id', String(user.id));
                    fetch('api_s3_backup.php?action=run', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body.toString()
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(result) {
                        if (result.success) {
                            uploaded++;
                            logEl.textContent += i18n.userOk
                                .replace('{{username}}', user.username)
                                .replace('{{size}}', formatBytes(result.size)) + '\n';
                        } else {
                            errors.push(user.username + ': ' + (result.error || 'unknown'));
                            logEl.textContent += i18n.userFail
                                .replace('{{username}}', user.username)
                                .replace('{{error}}', result.error || 'unknown') + '\n';
                        }
                        index++;
                        step();
                    })
                    .catch(function(e) {
                        statusEl.textContent = i18n.runError.replace('{{error}}', e.message);
                        errors.push(user.username + ': ' + e.message);
                        runInProgress = false;
                    });
                }
                step();
            });
        }

        // ---- Bucket listing -------------------------------------------------
        function refreshList() {
            var statusEl = document.getElementById('s3-backup-list-status');
            var table = document.getElementById('s3-backup-table');
            statusEl.hidden = false;
            statusEl.textContent = i18n.listLoading;

            fetch('api_s3_backup.php?action=list', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var tbody = table.querySelector('tbody');
                    tbody.innerHTML = '';
                    if (!data.success) {
                        table.hidden = true;
                        statusEl.textContent = i18n.listError.replace('{{error}}', data.error || 'unknown');
                        return;
                    }
                    if (!data.backups.length) {
                        table.hidden = true;
                        statusEl.textContent = i18n.listEmpty;
                        return;
                    }
                    statusEl.textContent = '';
                    statusEl.hidden = true;
                    table.hidden = false;
                    data.backups.forEach(function(backup) {
                        var tr = document.createElement('tr');

                        var tdUser = document.createElement('td');
                        tdUser.textContent = backup.username;
                        tr.appendChild(tdUser);

                        var tdFile = document.createElement('td');
                        tdFile.textContent = backup.filename;
                        tr.appendChild(tdFile);

                        var tdSize = document.createElement('td');
                        tdSize.textContent = formatBytes(backup.size);
                        tr.appendChild(tdSize);

                        var tdActions = document.createElement('td');
                        tdActions.className = 's3-backup-actions-cell';

                        var dlLink = document.createElement('a');
                        dlLink.className = 'btn btn-primary';
                        dlLink.href = 'api_s3_backup.php?action=download&key=' + encodeURIComponent(backup.key);
                        dlLink.textContent = i18n.download;
                        tdActions.appendChild(dlLink);
                        tdActions.appendChild(document.createTextNode(' '));

                        var delBtn = document.createElement('button');
                        delBtn.className = 'btn btn-danger';
                        delBtn.type = 'button';
                        delBtn.textContent = i18n.deleteLabel;
                        delBtn.addEventListener('click', function() {
                            window.modalAlert.confirm(
                                i18n.confirmDelete.replace('{{filename}}', backup.filename),
                                i18n.deleteLabel
                            ).then(function(confirmed) {
                                if (!confirmed) return;
                                var body = new URLSearchParams();
                                body.append('key', backup.key);
                                fetch('api_s3_backup.php?action=delete', {
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
                    statusEl.textContent = i18n.listError.replace('{{error}}', e.message);
                });
        }

        refreshStatus();
        refreshList();
    });
    </script>
</body>
</html>
