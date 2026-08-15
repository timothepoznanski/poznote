<?php
/**
 * S3 attachment storage settings page (admin only)
 *
 * Configure an S3-compatible object storage (AWS S3, MinIO, Garage,
 * Cloudflare R2, Backblaze B2, Scaleway, OVH, ...) where note attachments
 * are stored instead of the local disk. The configuration lives in
 * master.db (global_settings) and applies to the whole instance; the
 * mode is exclusive, with a migration tool to move existing files.
 */

require 'auth.php';
requireAuth();
requireAdmin();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'users/db_master.php';
require_once 'storage/AttachmentStorage.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $enabled = isset($_POST['s3_enabled']) ? '1' : '0';
    $endpoint = trim((string)($_POST['s3_endpoint'] ?? ''));
    $region = trim((string)($_POST['s3_region'] ?? '')) ?: 'us-east-1';
    $bucket = trim((string)($_POST['s3_bucket'] ?? ''));
    $accessKey = trim((string)($_POST['s3_access_key'] ?? ''));
    $secretKey = trim((string)($_POST['s3_secret_key'] ?? ''));
    $pathStyle = isset($_POST['s3_path_style']) ? '1' : '0';

    if ($enabled === '1' && ($endpoint === '' || $bucket === '' || $accessKey === '')) {
        $error = t('s3_settings.messages.incomplete', [], 'Endpoint, bucket and credentials are required to enable S3 storage.');
    } else {
        $saved = setGlobalSetting('s3_storage_enabled', $enabled)
            && setGlobalSetting('s3_storage_endpoint', $endpoint)
            && setGlobalSetting('s3_storage_region', $region)
            && setGlobalSetting('s3_storage_bucket', $bucket)
            && setGlobalSetting('s3_storage_access_key', $accessKey)
            && setGlobalSetting('s3_storage_path_style', $pathStyle);
        // Masked placeholder means "keep the existing key"
        if ($saved && $secretKey !== '••••••••') {
            $saved = setGlobalSetting('s3_storage_secret_key', $secretKey);
        }
        if ($saved) {
            $message = t('s3_settings.messages.saved', [], 'Configuration saved successfully.');
        } else {
            $error = t('s3_settings.messages.save_error', [], 'Failed to save configuration.');
        }
    }
}

$s3Config = [
    'enabled' => (string)getGlobalSetting('s3_storage_enabled', '0'),
    'endpoint' => (string)getGlobalSetting('s3_storage_endpoint', ''),
    'region' => (string)getGlobalSetting('s3_storage_region', 'us-east-1'),
    'bucket' => (string)getGlobalSetting('s3_storage_bucket', ''),
    'access_key' => (string)getGlobalSetting('s3_storage_access_key', ''),
    'secret_key' => (string)getGlobalSetting('s3_storage_secret_key', ''),
    'path_style' => (string)getGlobalSetting('s3_storage_path_style', '1'),
];
$s3Enabled = $s3Config['enabled'] === '1';
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('s3_settings.title', [], 'S3 Attachment Storage'); ?> - <?php echo getPageTitle(); ?></title>
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
    <link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <style>
    .s3-status-grid { display: flex; gap: 24px; flex-wrap: wrap; margin: 10px 0; justify-content: center; }
    .s3-status-item { min-width: 180px; text-align: center; }
    .s3-status-item .s3-status-value { font-size: 1.15rem; font-weight: 600; }
    .s3-migration-progress { margin-top: 8px; }
    #s3-migration-log { white-space: pre-line; font-size: 0.85rem; margin-top: 6px; }
    </style>
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include 'icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <h1 class="poznote-page-title"><i class="lucide lucide-cloud"></i> <?php echo t_h('settings.cards.s3_storage', [], 'S3 Attachments'); ?></h1>



        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('s3_settings.description', [], 'Store note attachments in an S3-compatible object storage instead of the local disk.'); ?><br><br>
                <?php echo t_h('s3_settings.description_benefit', [], 'Particularly useful if you have many or large attachments: the server disk stays light, and the complete backup zip can skip the S3 attachments; when everything stays on local disk, the export can become very heavy, slow, or even fail with a timeout.'); ?><br><br>
                <?php echo t_h('s3_settings.description_scope', [], 'The setting applies to all users of this instance.'); ?><br>
                <?php echo t_h('s3_settings.attachments_only_note', [], 'Only the attachment files are concerned.'); ?><br>
                <?php echo t_h('s3_settings.git_sync_note', [], 'Git sync ignores attachments while S3 storage is enabled.'); ?></p>
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
            <h2><i class="lucide lucide-cloud"></i> <?php echo t_h('s3_settings.config_title', [], 'Configuration'); ?></h2>

            <form method="post">
                <input type="hidden" name="action" value="save_config">

                <div class="git-config-fields">
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="s3_enabled" id="s3_enabled" <?php echo $s3Enabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_settings.enable_label', [], 'Store attachments in S3'); ?></span>
                            <span class="label-desc"><?php echo t_h('s3_settings.enable_description', [], 'New attachments are written to the bucket. Files still on local disk keep working and can be migrated below.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_endpoint"><?php echo t_h('s3_settings.endpoint_label', [], 'Endpoint URL'); ?></label>
                        <input type="text" name="s3_endpoint" id="s3_endpoint" class="git-field-input"
                               value="<?php echo htmlspecialchars($s3Config['endpoint']); ?>"
                               placeholder="https://s3.eu-west-1.amazonaws.com">
                        <span class="label-desc"><?php echo t_h('s3_settings.endpoint_description', [], 'Base URL of the S3 API. Examples: https://s3.amazonaws.com, http://minio:9000, https://<account>.r2.cloudflarestorage.com'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_region"><?php echo t_h('s3_settings.region_label', [], 'Region'); ?></label>
                        <input type="text" name="s3_region" id="s3_region" class="git-field-input"
                               value="<?php echo htmlspecialchars($s3Config['region']); ?>"
                               placeholder="us-east-1">
                        <span class="label-desc"><?php echo t_h('s3_settings.region_description', [], 'Leave "us-east-1" for MinIO/Garage and providers that ignore the region.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_bucket"><?php echo t_h('s3_settings.bucket_label', [], 'Bucket'); ?></label>
                        <input type="text" name="s3_bucket" id="s3_bucket" class="git-field-input"
                               value="<?php echo htmlspecialchars($s3Config['bucket']); ?>"
                               placeholder="poznote-attachments">
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_access_key"><?php echo t_h('s3_settings.access_key_label', [], 'Access key'); ?></label>
                        <input type="text" name="s3_access_key" id="s3_access_key" class="git-field-input"
                               value="<?php echo htmlspecialchars($s3Config['access_key']); ?>"
                               autocomplete="off">
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="s3_secret_key"><?php echo t_h('s3_settings.secret_key_label', [], 'Secret key'); ?></label>
                        <input type="password" name="s3_secret_key" id="s3_secret_key" class="git-field-input"
                               value="<?php echo $s3Config['secret_key'] !== '' ? '••••••••' : ''; ?>"
                               autocomplete="off">
                    </div>

                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="s3_path_style" id="s3_path_style" <?php echo $s3Config['path_style'] === '1' ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_settings.path_style_label', [], 'Path-style addressing'); ?></span>
                            <span class="label-desc"><?php echo t_h('s3_settings.path_style_description', [], 'Keep enabled for MinIO, Garage and most self-hosted servers. Disable only if your provider requires virtual-host style (bucket.endpoint).'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-actions">
                        <button type="button" id="s3-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('s3_settings.test', [], 'Test connection'); ?>
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('s3_settings.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                    <div id="s3-test-result" class="config-hint" hidden></div>
                </div>
            </form>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-repeat"></i> <?php echo t_h('s3_settings.migration_title', [], 'Migration'); ?></h2>
            <p class="git-sync-description"><?php echo t_h('s3_settings.migration_description', [], 'Move existing attachment files between the local disk and the bucket, for every user of the instance. Migration runs in batches and can be safely interrupted and resumed.'); ?></p>

            <div class="s3-status-grid">
                <div class="s3-status-item">
                    <div class="label-desc"><?php echo t_h('s3_settings.status_local', [], 'On local disk'); ?></div>
                    <div class="s3-status-value" id="s3-local-status">…</div>
                </div>
                <div class="s3-status-item">
                    <div class="label-desc"><?php echo t_h('s3_settings.status_remote', [], 'In the bucket'); ?></div>
                    <div class="s3-status-value" id="s3-remote-status">…</div>
                </div>
            </div>

            <div class="git-field-actions">
                <button type="button" id="s3-migrate-to-s3-btn" class="btn btn-primary">
                    <i class="lucide lucide-upload"></i>
                    <?php echo t_h('s3_settings.migrate_to_s3', [], 'Migrate local files to S3'); ?>
                </button>
                <button type="button" id="s3-migrate-to-local-btn" class="btn btn-secondary">
                    <i class="lucide lucide-download"></i>
                    <?php echo t_h('s3_settings.migrate_to_local', [], 'Bring files back to local disk'); ?>
                </button>
            </div>
            <div class="s3-migration-progress config-hint" id="s3-migration-status" hidden></div>
            <div id="s3-migration-log" class="label-desc"></div>
        </div>

        <div class="git-sync-footer-note">
            <?php echo t_h('s3_settings.footer_note', [], 'Attachments are stored under attachments/{user id}/ in the bucket and are always served through Poznote (the bucket can stay private).'); ?>
        </div>

    </div>

    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var i18n = {
            testing: <?php echo json_encode(t('s3_settings.testing', [], 'Testing connection...')); ?>,
            testSuccess: <?php echo json_encode(t('s3_settings.test_success', [], 'Connection successful, the bucket is reachable.')); ?>,
            testFailure: <?php echo json_encode(t('s3_settings.test_failure', [], 'Connection failed: {{error}}')); ?>,
            files: <?php echo json_encode(t('s3_settings.files_unit', [], '{{count}} file(s), {{size}}')); ?>,
            unavailable: <?php echo json_encode(t('s3_settings.status_unavailable', [], 'unavailable')); ?>,
            migrating: <?php echo json_encode(t('s3_settings.migrating', [], 'Migrating... {{moved}} file(s) moved, {{remaining}} remaining')); ?>,
            migrationDone: <?php echo json_encode(t('s3_settings.migration_done', [], 'Migration finished: {{moved}} file(s) moved.')); ?>,
            migrationError: <?php echo json_encode(t('s3_settings.migration_error', [], 'Migration stopped after an error: {{error}}')); ?>,
            confirmToS3: <?php echo json_encode(t('s3_settings.confirm_to_s3', [], 'Move all local attachment files (all users) to the bucket?')); ?>,
            confirmToLocal: <?php echo json_encode(t('s3_settings.confirm_to_local', [], 'Download all bucket attachments back to the local disk (all users)?')); ?>
        };

        function formatBytes(bytes) {
            if (bytes === null || bytes === undefined) return '';
            var units = ['B', 'KB', 'MB', 'GB', 'TB'];
            var i = 0, v = bytes;
            while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
            return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i];
        }

        function fillStatus(el, info) {
            if (!info || info.count === null || info.count === undefined) {
                el.textContent = i18n.unavailable;
                return;
            }
            el.textContent = i18n.files
                .replace('{{count}}', info.count)
                .replace('{{size}}', formatBytes(info.bytes));
        }

        function refreshStatus() {
            fetch('api_s3_storage.php?action=status', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data.success) return;
                    fillStatus(document.getElementById('s3-local-status'), data.local);
                    fillStatus(document.getElementById('s3-remote-status'), data.remote);
                    if (data.remote && data.remote.error) {
                        document.getElementById('s3-remote-status').title = data.remote.error;
                    }
                })
                .catch(function() {});
        }
        refreshStatus();

        document.getElementById('s3-test-btn').addEventListener('click', function() {
            var resultEl = document.getElementById('s3-test-result');
            resultEl.hidden = false;
            resultEl.textContent = i18n.testing;

            var body = new URLSearchParams();
            body.append('endpoint', document.getElementById('s3_endpoint').value.trim());
            body.append('region', document.getElementById('s3_region').value.trim());
            body.append('bucket', document.getElementById('s3_bucket').value.trim());
            body.append('access_key', document.getElementById('s3_access_key').value.trim());
            body.append('secret_key', document.getElementById('s3_secret_key').value);
            body.append('path_style', document.getElementById('s3_path_style').checked ? '1' : '0');

            fetch('api_s3_storage.php?action=test', {
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

        var migrationRunning = false;

        function runMigration(action, confirmText) {
            if (migrationRunning) return;
            window.modalAlert.confirm(confirmText, <?php echo json_encode(t('s3_settings.migration_title', [], 'Migration')); ?>).then(function(confirmed) {
                if (!confirmed || migrationRunning) return;
                startMigration(action);
            });
        }

        function startMigration(action) {
            migrationRunning = true;

            var statusEl = document.getElementById('s3-migration-status');
            var logEl = document.getElementById('s3-migration-log');
            var totalMoved = 0;
            statusEl.hidden = false;
            logEl.textContent = '';

            function step() {
                fetch('api_s3_storage.php?action=' + action, { method: 'POST', credentials: 'same-origin' })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        totalMoved += data.moved || 0;
                        if (data.errors && data.errors.length) {
                            logEl.textContent = data.errors.join('\n');
                        }
                        if (!data.success && !(data.moved > 0)) {
                            statusEl.textContent = i18n.migrationError.replace('{{error}}', (data.errors && data.errors[0]) || data.error || 'unknown');
                            migrationRunning = false;
                            refreshStatus();
                            return;
                        }
                        if ((data.remaining || 0) > 0) {
                            statusEl.textContent = i18n.migrating
                                .replace('{{moved}}', totalMoved)
                                .replace('{{remaining}}', data.remaining);
                            refreshStatus();
                            step();
                        } else {
                            statusEl.textContent = i18n.migrationDone.replace('{{moved}}', totalMoved);
                            migrationRunning = false;
                            refreshStatus();
                        }
                    })
                    .catch(function(e) {
                        statusEl.textContent = i18n.migrationError.replace('{{error}}', e.message);
                        migrationRunning = false;
                    });
            }
            step();
        }

        document.getElementById('s3-migrate-to-s3-btn').addEventListener('click', function() {
            runMigration('migrate_to_s3', i18n.confirmToS3);
        });
        document.getElementById('s3-migrate-to-local-btn').addEventListener('click', function() {
            runMigration('migrate_to_local', i18n.confirmToLocal);
        });
    });
    </script>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
