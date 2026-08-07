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
    /* The page keeps its usual 900px reading width, but widens just enough for
       the backup table to show every row on one line (JS measures the table's
       natural width into --s3-backup-width). Never wider than the viewport. */
    .s3-backup-container { max-width: min(var(--s3-backup-width, 900px), calc(100vw - 40px)); transition: max-width 120ms ease-out; }
    @media (prefers-reduced-motion: reduce) { .s3-backup-container { transition: none; } }
    #s3-backup-run-log { white-space: pre-line; font-size: 0.85rem; margin-top: 6px; }
    .s3-backup-table { min-width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; font-size: 0.9rem; }
    .s3-backup-table th, .s3-backup-table td { text-align: left; padding: 6px 10px; }
    /* Sticky header: needs border-collapse:separate (above) and a solid
       background, otherwise the scrolling rows show through it */
    .s3-backup-table thead th { position: sticky; top: 0; z-index: 1; background: #fff; }
    body.dark-mode .s3-backup-table thead th { background: var(--dm-bg); }
    /* Every cell stays on one line; the wrapper scrolls sideways when the
       archive names are too long rather than wrapping them over two rows */
    .s3-backup-table th, .s3-backup-table td { white-space: nowrap; }
    /* The actions column absorbs the leftover width so the text columns stay
       snug together instead of being spread across the whole table. It stays
       pinned to the right edge so Download/Delete remain reachable when long
       archive names push the table into horizontal scrolling. */
    .s3-backup-table th:last-child, .s3-backup-table td.s3-backup-actions-cell { text-align: right; position: sticky; right: 0; background: #fff; }
    body.dark-mode .s3-backup-table th:last-child,
    body.dark-mode .s3-backup-table td.s3-backup-actions-cell { background: var(--dm-bg); }
    /* The pinned header corner must outrank both sticky axes */
    .s3-backup-table thead th:last-child { z-index: 2; }
    /* Sortable headers, mirroring the .users-sort-link look from users.css
       (not loaded on this page) */
    .s3-backup-sort-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; }
    .s3-backup-sort-btn .s3-backup-sort-icon { width: 12px; height: 12px; opacity: 0.35; }
    .s3-backup-sort-btn:hover .s3-backup-sort-icon,
    .s3-backup-sort-btn.s3-backup-sort-active .s3-backup-sort-icon { opacity: 1; }
    .s3-backup-sort-btn.s3-backup-sort-active { font-weight: 700; }
    .s3-backup-table .btn { display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 10px; font-size: 0.85rem; line-height: 1.4; border: none; margin: 0; box-sizing: border-box; }
    .s3-backup-table a.btn-primary { background-color: #007cba; color: #fff; text-decoration: none; }
    .s3-backup-table a.btn-primary:hover { background-color: #005a8a; }
    .s3-backup-table .btn-danger { background-color: #dc3545; color: #fff; }
    .s3-backup-table .btn-danger:hover { background-color: #b02a37; }
    /* The bucket can hold a lot of archives: keep the list inside a scroller
       instead of letting it push the rest of the page down */
    .s3-backup-table-wrap { overflow: auto; max-height: 420px; overscroll-behavior: contain; }
    .s3-backup-users-picker { margin: 6px 0; }
    .s3-backup-users-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
    .s3-backup-users-search { position: relative; flex: 1 1 220px; min-width: 180px; }
    .s3-backup-users-search .lucide-search { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.55; pointer-events: none; font-size: 0.95rem; }
    #s3-backup-user-filter { width: 100%; padding-left: 32px; padding-right: 30px; margin: 0; }
    .s3-backup-users-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; opacity: 0.6; color: inherit; line-height: 1; }
    .s3-backup-users-clear:hover { opacity: 1; }
    .s3-backup-users-toolbar .btn { padding: 5px 12px; font-size: 0.85rem; margin: 0; }
    .s3-backup-users-list { max-height: 260px; overflow-y: auto; border: 1px solid rgba(128,128,128,0.35); border-radius: 6px; }
    #s3-backup-user-filter::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
    .s3-backup-user-check { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; cursor: pointer; padding: 7px 12px; margin: 0; border-bottom: 1px solid rgba(128,128,128,0.18); }
    /* [hidden] must beat the display:flex above, or filtered-out rows stay visible */
    .s3-backup-user-check[hidden] { display: none; }
    .s3-backup-user-check.is-last-visible { border-bottom: none; }
    .s3-backup-user-check:hover { background: rgba(128,128,128,0.10); }
    .s3-backup-user-check input { cursor: pointer; flex: none; margin: 0; }
    .s3-backup-user-name { font-weight: 500; }
    .s3-backup-user-meta { opacity: 0.65; font-size: 0.85rem; }
    .s3-backup-user-badge { font-size: 0.75rem; padding: 1px 7px; border-radius: 10px; background: rgba(0,124,186,0.15); color: #007cba; white-space: nowrap; }
    .s3-backup-user-badge.is-inactive { background: rgba(220,53,69,0.15); color: #dc3545; }
    .s3-backup-users-empty { padding: 12px; font-size: 0.9rem; opacity: 0.7; }
    .s3-backup-users-count { font-size: 0.85rem; opacity: 0.75; margin-top: 6px; }
    /* Beat .git-sync-description's centering max-width/auto margins (ID wins) */
    #s3-backup-manual-desc { margin: 0 0 10px; max-width: none; text-align: left; }
    .s3-backup-retention-warning { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 18px; text-align: left; font-size: 0.9rem; color: #8a6d3b; }
    .s3-backup-retention-warning .lucide-alert-triangle { flex: none; margin-top: 2px; color: #f59e0b; background-color: #f59e0b; }
    body.dark-mode .s3-backup-retention-warning { color: #d9b678; }
    </style>
</head>
<body class="home-page git-sync-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container git-sync-container s3-backup-container">

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
                        <label class="git-field-label" for="s3-backup-user-filter"><?php echo t_h('s3_backup.users_label', [], 'Users to back up'); ?></label>
                        <div class="s3-backup-users-picker">
                            <div class="s3-backup-users-toolbar">
                                <div class="s3-backup-users-search">
                                    <i class="lucide lucide-search"></i>
                                    <input type="search" id="s3-backup-user-filter" class="git-field-input"
                                           placeholder="<?php echo t_h('s3_backup.users_filter_placeholder', [], 'Filter by name, username or email...'); ?>"
                                           autocomplete="off">
                                    <button type="button" class="s3-backup-users-clear" id="s3-backup-user-filter-clear" hidden
                                            aria-label="<?php echo t_h('s3_backup.users_filter_clear', [], 'Clear filter'); ?>">
                                        <i class="lucide lucide-x"></i>
                                    </button>
                                </div>
                                <button type="button" class="btn btn-secondary" id="s3-backup-users-select-all"><?php echo t_h('s3_backup.users_select_all', [], 'Select all'); ?></button>
                                <button type="button" class="btn btn-secondary" id="s3-backup-users-select-none"><?php echo t_h('s3_backup.users_select_none', [], 'Deselect all'); ?></button>
                            </div>

                            <div class="s3-backup-users-list" id="s3-backup-users-list">
                                <?php foreach ($allBackupUsers as $backupUser):
                                    $backupUserId = (int)$backupUser['id'];
                                    $isSelected = $backupConfig['user_ids'] === null || in_array($backupUserId, $backupConfig['user_ids'], true);
                                    $fullName = trim(((string)($backupUser['first_name'] ?? '')) . ' ' . ((string)($backupUser['last_name'] ?? '')));
                                    $email = trim((string)($backupUser['email'] ?? ''));
                                    $metaParts = array_values(array_filter([$fullName, $email], function ($part) { return $part !== ''; }));
                                    $searchText = strtolower(trim($backupUser['username'] . ' ' . $fullName . ' ' . $email));
                                ?>
                                <label class="s3-backup-user-check" data-search="<?php echo htmlspecialchars($searchText, ENT_QUOTES, 'UTF-8'); ?>">
                                    <input type="checkbox" name="s3_backup_users[]" value="<?php echo $backupUserId; ?>" <?php echo $isSelected ? 'checked' : ''; ?>>
                                    <span class="s3-backup-user-name"><?php echo htmlspecialchars($backupUser['username']); ?></span>
                                    <?php if (!empty($metaParts)): ?>
                                    <span class="s3-backup-user-meta"><?php echo htmlspecialchars(implode(' · ', $metaParts)); ?></span>
                                    <?php endif; ?>
                                    <?php if (!empty($backupUser['is_admin'])): ?>
                                    <span class="s3-backup-user-badge"><?php echo t_h('s3_backup.users_badge_admin', [], 'Admin'); ?></span>
                                    <?php endif; ?>
                                    <?php if (empty($backupUser['active'])): ?>
                                    <span class="s3-backup-user-badge is-inactive"><?php echo t_h('s3_backup.users_badge_inactive', [], 'Inactive'); ?></span>
                                    <?php endif; ?>
                                </label>
                                <?php endforeach; ?>
                                <div class="s3-backup-users-empty" id="s3-backup-users-empty" hidden><?php echo t_h('s3_backup.users_no_match', [], 'No user matches this filter.'); ?></div>
                            </div>

                            <div class="s3-backup-users-count" id="s3-backup-users-count"></div>
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
            <p class="git-sync-description git-sync-description-left" id="s3-backup-manual-desc"><?php echo t_h('s3_backup.manual_description', [], 'Back up the selected users to the bucket right now, one user at a time.'); ?></p>
            <p class="s3-backup-retention-warning"><i class="lucide lucide-alert-triangle"></i><span><?php echo t_h('s3_backup.manual_retention_warning', [], 'Every backup counts toward the retention limit, so a scheduled run can delete a manual archive just as a manual run can delete a scheduled one. To keep an archive for good, download it.'); ?></span></p>

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
                            <th data-sort-key="username" data-sort-type="text">
                                <button type="button" class="s3-backup-sort-btn"><?php echo t_h('s3_backup.col_user', [], 'User'); ?><i class="lucide lucide-chevron-down s3-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="filename" data-sort-type="text">
                                <button type="button" class="s3-backup-sort-btn"><?php echo t_h('s3_backup.col_archive', [], 'Archive'); ?><i class="lucide lucide-chevron-down s3-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="mtime" data-sort-type="num">
                                <button type="button" class="s3-backup-sort-btn"><?php echo t_h('s3_backup.col_date', [], 'Date'); ?><i class="lucide lucide-chevron-down s3-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="size" data-sort-type="num">
                                <button type="button" class="s3-backup-sort-btn"><?php echo t_h('s3_backup.col_size', [], 'Size'); ?><i class="lucide lucide-chevron-down s3-backup-sort-icon"></i></button>
                            </th>
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
            manualTitle: <?php echo json_encode(t('s3_backup.manual_title', [], 'Manual backup')); ?>,
            usersCount: <?php echo json_encode(t('s3_backup.users_count', [], '{{selected}} of {{total}} user(s) selected')); ?>,
            usersCountFiltered: <?php echo json_encode(t('s3_backup.users_count_filtered', [], '{{selected}} of {{total}} user(s) selected, {{shown}} shown')); ?>
        };

        // ---- Users picker (filter + bulk selection) -------------------------
        (function() {
            var listEl = document.getElementById('s3-backup-users-list');
            if (!listEl) return;
            var filterEl = document.getElementById('s3-backup-user-filter');
            var clearEl = document.getElementById('s3-backup-user-filter-clear');
            var emptyEl = document.getElementById('s3-backup-users-empty');
            var countEl = document.getElementById('s3-backup-users-count');
            var rows = Array.prototype.slice.call(listEl.querySelectorAll('.s3-backup-user-check'));

            function visibleRows() {
                return rows.filter(function(row) { return !row.hidden; });
            }

            function updateCount() {
                var selected = rows.filter(function(row) { return row.querySelector('input').checked; }).length;
                var shown = visibleRows().length;
                var text = shown === rows.length
                    ? i18n.usersCount
                    : i18n.usersCountFiltered.replace('{{shown}}', shown);
                countEl.textContent = text
                    .replace('{{selected}}', selected)
                    .replace('{{total}}', rows.length);
            }

            function applyFilter() {
                var query = filterEl.value.trim().toLowerCase();
                clearEl.hidden = query === '';
                rows.forEach(function(row) {
                    row.hidden = query !== '' && (row.getAttribute('data-search') || '').indexOf(query) === -1;
                    row.classList.remove('is-last-visible');
                });
                var shown = visibleRows();
                if (shown.length) shown[shown.length - 1].classList.add('is-last-visible');
                emptyEl.hidden = shown.length > 0;
                updateCount();
            }

            // Bulk actions only touch the rows the filter currently shows
            function setVisible(checked) {
                visibleRows().forEach(function(row) { row.querySelector('input').checked = checked; });
                updateCount();
            }

            filterEl.addEventListener('input', applyFilter);
            filterEl.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && filterEl.value !== '') {
                    e.preventDefault();
                    filterEl.value = '';
                    applyFilter();
                }
            });
            clearEl.addEventListener('click', function() {
                filterEl.value = '';
                applyFilter();
                filterEl.focus();
            });
            document.getElementById('s3-backup-users-select-all').addEventListener('click', function() { setVisible(true); });
            document.getElementById('s3-backup-users-select-none').addEventListener('click', function() { setVisible(false); });
            listEl.addEventListener('change', function(e) {
                if (e.target && e.target.type === 'checkbox') updateCount();
            });

            applyFilter();
        })();

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
        // The API already returns the archives newest first; clicking a header
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
            document.querySelectorAll('#s3-backup-table thead th[data-sort-key]').forEach(function(th) {
                var isActive = th.getAttribute('data-sort-key') === sortKey;
                var btn = th.querySelector('.s3-backup-sort-btn');
                var icon = th.querySelector('.s3-backup-sort-icon');
                btn.classList.toggle('s3-backup-sort-active', isActive);
                icon.classList.toggle('lucide-chevron-up', isActive && sortDir === 'asc');
                icon.classList.toggle('lucide-chevron-down', !isActive || sortDir === 'desc');
                th.setAttribute('aria-sort', isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
            });
        }

        document.querySelectorAll('#s3-backup-table thead th[data-sort-key]').forEach(function(th) {
            th.querySelector('.s3-backup-sort-btn').addEventListener('click', function() {
                var key = th.getAttribute('data-sort-key');
                // Same column toggles direction; a new column starts ascending
                sortDir = (key === sortKey && sortDir === 'asc') ? 'desc' : 'asc';
                sortKey = key;
                updateSortIndicators();
                renderBackupRows();
            });
        });

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
                    backupList = [];
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
                    backupList = data.backups;
                    renderBackupRows();
                })
                .catch(function(e) {
                    table.hidden = true;
                    statusEl.textContent = i18n.listError.replace('{{error}}', e.message);
                });
        }

        function renderBackupRows() {
            var table = document.getElementById('s3-backup-table');
            var tbody = table.querySelector('tbody');
            tbody.innerHTML = '';
            sortedBackups().forEach(function(backup) {
                var tr = document.createElement('tr');

                var tdUser = document.createElement('td');
                tdUser.textContent = backup.username;
                tr.appendChild(tdUser);

                var tdFile = document.createElement('td');
                tdFile.textContent = backup.filename;
                tr.appendChild(tdFile);

                var tdDate = document.createElement('td');
                tdDate.className = 's3-backup-date-cell';
                tdDate.textContent = formatTimestamp(backup.mtime);
                tr.appendChild(tdDate);

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

            fitContainerToTable();
        }

        /**
         * Widen the page container just enough for the widest row to fit on a
         * single line. The table is measured while the container is free to
         * grow, so we read its natural (unconstrained) width rather than the
         * width it was already squeezed into.
         */
        function fitContainerToTable() {
            var container = document.querySelector('.s3-backup-container');
            var wrap = document.querySelector('.s3-backup-table-wrap');
            var table = document.getElementById('s3-backup-table');
            if (!container || !wrap || !table || table.hidden) {
                if (container) container.style.removeProperty('--s3-backup-width');
                return;
            }

            // Chrome around the scroller: container padding, section padding
            // and borders. Independent of how wide the container currently is.
            var chrome = Math.ceil(container.getBoundingClientRect().width - wrap.clientWidth);

            // Measure the table's intrinsic width. `min-width: 100%` makes it
            // stretch to whatever the container currently is, so that rule and
            // the scroller's clamping are both lifted for the measurement --
            // otherwise each call measures the previous fit and creeps wider.
            var prevOverflow = wrap.style.overflowX;
            var prevMinWidth = table.style.minWidth;
            var prevWidth = table.style.width;
            wrap.style.overflowX = 'visible';
            table.style.minWidth = '0';
            table.style.width = 'max-content';
            var natural = Math.ceil(table.getBoundingClientRect().width);
            wrap.style.overflowX = prevOverflow;
            table.style.minWidth = prevMinWidth;
            table.style.width = prevWidth;

            container.style.setProperty('--s3-backup-width', (natural + chrome) + 'px');
        }

        window.addEventListener('resize', fitContainerToTable);

        refreshStatus();
        refreshList();
    });
    </script>
</body>
</html>
