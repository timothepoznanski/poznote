<?php
/**
 * Local backup settings page (admin only)
 *
 * Configure the folder of the server where complete backup archives (one ZIP
 * per user, same content as the "Complete Backup" download) are saved, either
 * manually from this page or automatically on a schedule by the backup
 * worker, and how many of them are kept. The configuration lives in master.db
 * (global_settings) and applies to the whole instance.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
requireAdmin();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../settings_shell.php';
require_once __DIR__ . '/../version_helper.php';
requireSettingsPassword();
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../LocalBackupService.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $autoEnabled = isset($_POST['local_backup_auto_enabled']) ? '1' : '0';
    $frequency = (string)($_POST['local_backup_frequency'] ?? 'daily');
    if (!isset(LocalBackupService::FREQUENCIES[$frequency])) {
        $frequency = 'daily';
    }
    $retention = max(0, (int)($_POST['local_backup_retention'] ?? 7));
    $directory = LocalBackupService::normalizeDirectory((string)($_POST['local_backup_directory'] ?? ''));
    $effectiveDirectory = $directory['path'] !== '' ? $directory['path'] : LocalBackupService::defaultDirectory();

    // Checked users; when every existing user is checked, store an empty
    // selection so future accounts are covered automatically
    $postedUsers = $_POST['local_backup_users'] ?? [];
    $selectedIds = is_array($postedUsers) ? array_values(array_unique(array_map('intval', $postedUsers))) : [];
    $allUserIds = array_map(function ($user) { return (int)$user['id']; }, listAllUserProfiles());
    $selectedIds = array_values(array_intersect($selectedIds, $allUserIds));
    $userIdsSetting = count($selectedIds) === count($allUserIds) ? '' : implode(',', $selectedIds);

    if ($directory['error'] === 'not_absolute') {
        $error = t('local_backup.messages.not_absolute', [], 'The backup folder must be an absolute path, for example /backups.');
    } elseif ($directory['error'] === 'inside_app') {
        $error = t('local_backup.messages.inside_app', [], 'The backup folder cannot be inside the application, apart from data/backups.');
    } elseif (LocalBackupService::ensureDirectory($effectiveDirectory) !== null) {
        $error = t('local_backup.messages.not_writable', ['path' => $effectiveDirectory], 'The backup folder cannot be created or is not writable by the web server: ' . $effectiveDirectory);
    } elseif (empty($selectedIds)) {
        $error = t('s3_backup.messages.no_user_selected', [], 'Select at least one user to back up.');
    } else {
        $saved = setGlobalSetting('local_backup_auto_enabled', $autoEnabled)
            && setGlobalSetting('local_backup_directory', $directory['path'])
            && setGlobalSetting('local_backup_frequency', $frequency)
            && setGlobalSetting('local_backup_retention', (string)$retention)
            && setGlobalSetting('local_backup_user_ids', $userIdsSetting);
        if ($saved) {
            $message = t('s3_backup.messages.saved', [], 'Configuration saved successfully.');
        } else {
            $error = t('s3_backup.messages.save_error', [], 'Failed to save configuration.');
        }
    }
}

$backupConfig = LocalBackupService::getConfig();
$autoEnabled = $backupConfig['auto_enabled'];
// After a refused save, show what was typed rather than the stored folder
$directoryValue = $error !== '' && isset($_POST['local_backup_directory'])
    ? trim((string)$_POST['local_backup_directory'])
    : $backupConfig['custom_directory'];
$allBackupUsers = listAllUserProfiles();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('local_backup.title', [], 'Local Backups'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php
    // getAppVersion() reads version.txt through an absolute path. Reading it
    // relatively broke when the entry points moved into src/public/: the file
    // stayed one level up, so this fell back to time() and changed the asset
    // URL on every single page load.
    $cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/session-guard.js?v=<?php echo $cache_v; ?>"></script>
    <?php poznoteRenderStylesheets('local_backup_settings'); ?>
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <style>
    /* The page keeps its usual 900px reading width, but widens just enough for
       the backup table to show every row on one line (JS measures the table's
       natural width into --local-backup-width). Never wider than the viewport. */
    .local-backup-container { max-width: min(var(--local-backup-width, 900px), calc(100vw - 40px)); transition: max-width 120ms ease-out; }
    @media (prefers-reduced-motion: reduce) { .local-backup-container { transition: none; } }
    #local-backup-run-log { white-space: pre-line; font-size: 0.85rem; margin-top: 6px; }
    .local-backup-table { min-width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; font-size: 0.9rem; }
    .local-backup-table th, .local-backup-table td { text-align: left; padding: 6px 10px; }
    /* Sticky header: needs border-collapse:separate (above) and a solid
       background, otherwise the scrolling rows show through it */
    .local-backup-table thead th { position: sticky; top: 0; z-index: 1; background: var(--pz-bg); }
    body.dark-mode .local-backup-table thead th { background: var(--pz-chrome-bg); }
    /* Every cell stays on one line; the wrapper scrolls sideways when the
       archive names are too long rather than wrapping them over two rows */
    .local-backup-table th, .local-backup-table td { white-space: nowrap; }
    /* The actions column absorbs the leftover width so the text columns stay
       snug together instead of being spread across the whole table. It stays
       pinned to the right edge so Download/Delete remain reachable when long
       archive names push the table into horizontal scrolling. */
    .local-backup-table th:last-child, .local-backup-table td.local-backup-actions-cell { text-align: right; position: sticky; right: 0; background: var(--pz-bg); }
    body.dark-mode .local-backup-table th:last-child,
    body.dark-mode .local-backup-table td.local-backup-actions-cell { background: var(--pz-chrome-bg); }
    /* The pinned header corner must outrank both sticky axes */
    .local-backup-table thead th:last-child { z-index: 2; }
    /* Sortable headers, mirroring the .users-sort-link look from users.css
       (not loaded on this page) */
    .local-backup-sort-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; }
    .local-backup-sort-btn .local-backup-sort-icon { width: 12px; height: 12px; opacity: 0.35; }
    .local-backup-sort-btn:hover .local-backup-sort-icon,
    .local-backup-sort-btn.local-backup-sort-active .local-backup-sort-icon { opacity: 1; }
    .local-backup-sort-btn.local-backup-sort-active { font-weight: 700; }
    .local-backup-table .btn { display: inline-flex; align-items: center; vertical-align: middle; padding: 3px 10px; font-size: 0.85rem; line-height: 1.4; border: none; margin: 0; box-sizing: border-box; }
    .local-backup-table a.btn-primary { background-color: var(--pz-accent); color: var(--pz-text-inverse); text-decoration: none; }
    .local-backup-table a.btn-primary:hover { background-color: var(--pz-accent-hover); }
    .local-backup-table .btn-danger { background-color: var(--pz-danger); color: var(--pz-text-inverse); }
    .local-backup-table .btn-danger:hover { background-color: var(--pz-danger-hover); }
    /* The folder can hold a lot of archives: keep the list inside a scroller
       instead of letting it push the rest of the page down */
    .local-backup-table-wrap { overflow: auto; max-height: 420px; overscroll-behavior: contain; }
    .local-backup-users-picker { margin: 6px 0; }
    .local-backup-users-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
    .local-backup-users-search { position: relative; flex: 1 1 220px; min-width: 180px; }
    .local-backup-users-search .lucide-search { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: 0.55; pointer-events: none; font-size: 0.95rem; }
    #local-backup-user-filter, #local-backup-list-filter { width: 100%; padding-left: 32px; padding-right: 30px; margin: 0; }
    .local-backup-users-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; opacity: 0.6; color: inherit; line-height: 1; }
    .local-backup-users-clear:hover { opacity: 1; }
    .local-backup-users-toolbar .btn { padding: 5px 12px; font-size: 0.85rem; margin: 0; }
    .local-backup-users-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--pz-border-strong); border-radius: 6px; }
    #local-backup-user-filter::-webkit-search-cancel-button,
    #local-backup-list-filter::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
    /* Backup list filter reuses the users-toolbar look; [hidden] must beat its
       display:flex (same trap as the user rows above) */
    .local-backup-list-toolbar { margin: 10px 0 0; }
    .local-backup-list-toolbar[hidden] { display: none; }
    .local-backup-list-count { margin: 0; white-space: nowrap; }
    .local-backup-list-empty { padding: 12px; font-size: 0.9rem; opacity: 0.7; }
    .local-backup-user-check { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; cursor: pointer; padding: 7px 12px; margin: 0; border-bottom: 1px solid var(--pz-border-light); }
    /* [hidden] must beat the display:flex above, or filtered-out rows stay visible */
    .local-backup-user-check[hidden] { display: none; }
    .local-backup-user-check.is-last-visible { border-bottom: none; }
    .local-backup-user-check:hover { background: var(--pz-surface-hover); }
    .local-backup-user-check input { cursor: pointer; flex: none; margin: 0; }
    .local-backup-user-name { font-weight: 500; }
    .local-backup-user-meta { opacity: 0.65; font-size: 0.85rem; }
    .local-backup-user-badge { font-size: 0.75rem; padding: 1px 7px; border-radius: 10px; background: color-mix(in srgb, var(--pz-accent) 15%, transparent); color: var(--pz-accent-text); white-space: nowrap; }
    .local-backup-user-badge.is-inactive { background: color-mix(in srgb, var(--pz-danger) 15%, transparent); color: var(--pz-danger-text); }
    .local-backup-users-empty { padding: 12px; font-size: 0.9rem; opacity: 0.7; }
    .local-backup-users-count { font-size: 0.85rem; opacity: 0.75; margin-top: 6px; }
    /* Beat .git-sync-description's centering max-width/auto margins (ID wins) */
    #local-backup-manual-desc { margin: 0 0 10px; max-width: none; text-align: left; }
    .local-backup-retention-warning { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 18px; text-align: left; font-size: 0.9rem; color: var(--pz-warning-strong); }
    .local-backup-retention-warning .lucide-alert-triangle { flex: none; margin-top: 2px; color: var(--pz-warning); background-color: var(--pz-warning); }
    body.dark-mode .local-backup-retention-warning { color: var(--pz-warning); }
    </style>
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include __DIR__ . '/../icon_sidebar.php'; ?>
    <?php poznoteSettingsShellOpen(['section' => 'admin-tools-grid', 'title' => t('settings.cards.local_backup', [], 'Local Backups')]); ?>
    <div class="home-container git-sync-container local-backup-container">



        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('local_backup.description', [], 'Save complete backup archives (one ZIP per user, identical to the Complete Backup download) into a folder of the server, manually or automatically on a schedule.'); ?><br>
                <?php echo t_h('local_backup.description_scope', [], 'The setting applies to all users of this instance.'); ?></p>
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
            <h2><i class="lucide lucide-hard-drive"></i> <?php echo t_h('s3_backup.config_title', [], 'Configuration'); ?></h2>

            <form method="post">
                <input type="hidden" name="action" value="save_config">

                <div class="git-config-fields">
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="local_backup_auto_enabled" id="local_backup_auto_enabled" <?php echo $autoEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('s3_backup.enable_label', [], 'Automatic backups'); ?></span>
                            <span class="label-desc"><?php echo t_h('local_backup.enable_description', [], 'Back up the selected users into the folder on the schedule below. Manual backups from this page work even with this switch off.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="local_backup_frequency"><?php echo t_h('s3_backup.frequency_label', [], 'Frequency'); ?></label>
                        <select name="local_backup_frequency" id="local_backup_frequency" class="git-field-input">
                            <option value="daily" <?php echo $backupConfig['frequency'] === 'daily' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_daily', [], 'Daily'); ?></option>
                            <option value="weekly" <?php echo $backupConfig['frequency'] === 'weekly' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_weekly', [], 'Weekly'); ?></option>
                            <option value="monthly" <?php echo $backupConfig['frequency'] === 'monthly' ? 'selected' : ''; ?>><?php echo t_h('s3_backup.frequency_monthly', [], 'Monthly (every 30 days)'); ?></option>
                        </select>
                        <span class="label-desc"><?php echo t_h('s3_backup.frequency_description', [], 'The first automatic backup runs within a few minutes of enabling, the next ones after the chosen interval.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="local_backup_retention"><?php echo t_h('s3_backup.retention_label', [], 'Backups to keep per user'); ?></label>
                        <input type="number" name="local_backup_retention" id="local_backup_retention" class="git-field-input" min="0" step="1"
                               value="<?php echo (int)$backupConfig['retention']; ?>">
                        <span class="label-desc"><?php echo t_h('local_backup.retention_description', [], 'Older archives are deleted from the folder after each backup. 0 keeps everything.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="local_backup_directory"><?php echo t_h('local_backup.directory_label', [], 'Backup folder'); ?></label>
                        <input type="text" name="local_backup_directory" id="local_backup_directory" class="git-field-input"
                               value="<?php echo htmlspecialchars($directoryValue, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"
                               placeholder="<?php echo htmlspecialchars(LocalBackupService::defaultDirectory(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"
                               autocomplete="off" spellcheck="false">
                        <span class="label-desc"><?php echo t_h('local_backup.directory_description', ['default' => LocalBackupService::defaultDirectory()], 'Absolute path on the server (inside the container with Docker). Leave empty to use ' . LocalBackupService::defaultDirectory() . '. To store the backups somewhere else, mount a volume and enter its path here.'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="local-backup-user-filter"><?php echo t_h('s3_backup.users_label', [], 'Users to back up'); ?></label>
                        <div class="local-backup-users-picker">
                            <div class="local-backup-users-toolbar">
                                <div class="local-backup-users-search">
                                    <i class="lucide lucide-search"></i>
                                    <input type="search" id="local-backup-user-filter" class="git-field-input"
                                           placeholder="<?php echo t_h('s3_backup.users_filter_placeholder', [], 'Filter by name, username or email...'); ?>"
                                           autocomplete="off">
                                    <button type="button" class="local-backup-users-clear" id="local-backup-user-filter-clear" hidden
                                            aria-label="<?php echo t_h('s3_backup.users_filter_clear', [], 'Clear filter'); ?>">
                                        <i class="lucide lucide-x"></i>
                                    </button>
                                </div>
                                <button type="button" class="btn btn-secondary" id="local-backup-users-select-all"><?php echo t_h('s3_backup.users_select_all', [], 'Select all'); ?></button>
                                <button type="button" class="btn btn-secondary" id="local-backup-users-select-none"><?php echo t_h('s3_backup.users_select_none', [], 'Deselect all'); ?></button>
                            </div>

                            <div class="local-backup-users-list" id="local-backup-users-list">
                                <?php foreach ($allBackupUsers as $backupUser):
                                    $backupUserId = (int)$backupUser['id'];
                                    $isSelected = $backupConfig['user_ids'] === null || in_array($backupUserId, $backupConfig['user_ids'], true);
                                    $fullName = trim(((string)($backupUser['first_name'] ?? '')) . ' ' . ((string)($backupUser['last_name'] ?? '')));
                                    $email = trim((string)($backupUser['email'] ?? ''));
                                    $metaParts = array_values(array_filter([$fullName, $email], function ($part) { return $part !== ''; }));
                                    $searchText = strtolower(trim($backupUser['username'] . ' ' . $fullName . ' ' . $email));
                                ?>
                                <label class="local-backup-user-check" data-search="<?php echo htmlspecialchars($searchText, ENT_QUOTES, 'UTF-8'); ?>">
                                    <input type="checkbox" name="local_backup_users[]" value="<?php echo $backupUserId; ?>" <?php echo $isSelected ? 'checked' : ''; ?>>
                                    <span class="local-backup-user-name"><?php echo htmlspecialchars($backupUser['username']); ?></span>
                                    <?php if (!empty($metaParts)): ?>
                                    <span class="local-backup-user-meta"><?php echo htmlspecialchars(implode(' · ', $metaParts)); ?></span>
                                    <?php endif; ?>
                                    <?php if (!empty($backupUser['is_admin'])): ?>
                                    <span class="local-backup-user-badge"><?php echo t_h('s3_backup.users_badge_admin', [], 'Admin'); ?></span>
                                    <?php endif; ?>
                                    <?php if (empty($backupUser['active'])): ?>
                                    <span class="local-backup-user-badge is-inactive"><?php echo t_h('s3_backup.users_badge_inactive', [], 'Inactive'); ?></span>
                                    <?php endif; ?>
                                </label>
                                <?php endforeach; ?>
                                <div class="local-backup-users-empty" id="local-backup-users-empty" hidden><?php echo t_h('s3_backup.users_no_match', [], 'No user matches this filter.'); ?></div>
                            </div>

                            <div class="local-backup-users-count" id="local-backup-users-count"></div>
                        </div>
                    </div>

                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('s3_settings.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                </div>
            </form>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-save"></i> <?php echo t_h('s3_backup.manual_title', [], 'Manual backup'); ?></h2>
            <p class="git-sync-description git-sync-description-left" id="local-backup-manual-desc"><?php echo t_h('local_backup.manual_description', [], 'Back up the selected users into the folder right now, one user at a time.'); ?></p>
            <p class="local-backup-retention-warning"><i class="lucide lucide-alert-triangle"></i><span><?php echo t_h('s3_backup.manual_retention_warning', [], 'Every backup counts toward the retention limit, so a scheduled run can delete a manual archive just as a manual run can delete a scheduled one. To keep an archive for good, download it.'); ?></span></p>

            <div class="git-field-actions">
                <button type="button" id="local-backup-run-btn" class="btn btn-primary">
                    <i class="lucide lucide-save"></i>
                    <?php echo t_h('s3_backup.run_now', [], 'Back up now'); ?>
                </button>
            </div>
            <div class="config-hint" id="local-backup-run-status" hidden></div>
            <div id="local-backup-run-log" class="label-desc"></div>
            <div class="config-hint" id="local-backup-last-run" hidden></div>
        </div>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-archive"></i> <?php echo t_h('local_backup.list_title', [], 'Backups in the folder'); ?></h2>
            <div class="config-hint" id="local-backup-list-status" hidden></div>
            <div class="local-backup-users-toolbar local-backup-list-toolbar" id="local-backup-list-toolbar" hidden>
                <div class="local-backup-users-search">
                    <i class="lucide lucide-search"></i>
                    <input type="search" id="local-backup-list-filter" class="git-field-input"
                           placeholder="<?php echo t_h('s3_backup.list_filter_placeholder', [], 'Filter by user or archive name...'); ?>"
                           autocomplete="off">
                    <button type="button" class="local-backup-users-clear" id="local-backup-list-filter-clear" hidden
                            aria-label="<?php echo t_h('s3_backup.users_filter_clear', [], 'Clear filter'); ?>">
                        <i class="lucide lucide-x"></i>
                    </button>
                </div>
                <span class="local-backup-users-count local-backup-list-count" id="local-backup-list-count"></span>
            </div>
            <div class="local-backup-table-wrap">
                <table class="local-backup-table" id="local-backup-table" hidden>
                    <thead>
                        <tr>
                            <th data-sort-key="username" data-sort-type="text">
                                <button type="button" class="local-backup-sort-btn"><?php echo t_h('s3_backup.col_user', [], 'User'); ?><i class="lucide lucide-chevron-down local-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="filename" data-sort-type="text">
                                <button type="button" class="local-backup-sort-btn"><?php echo t_h('s3_backup.col_archive', [], 'Archive'); ?><i class="lucide lucide-chevron-down local-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="mtime" data-sort-type="num">
                                <button type="button" class="local-backup-sort-btn"><?php echo t_h('s3_backup.col_date', [], 'Date'); ?><i class="lucide lucide-chevron-down local-backup-sort-icon"></i></button>
                            </th>
                            <th data-sort-key="size" data-sort-type="num">
                                <button type="button" class="local-backup-sort-btn"><?php echo t_h('s3_backup.col_size', [], 'Size'); ?><i class="lucide lucide-chevron-down local-backup-sort-icon"></i></button>
                            </th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <div class="local-backup-list-empty" id="local-backup-list-no-match" hidden><?php echo t_h('s3_backup.list_no_match', [], 'No backup matches this filter.'); ?></div>
            </div>
        </div>

        <div class="git-sync-footer-note">
            <?php echo t_h('local_backup.footer_note', [], 'Archives are stored under {user id}/ in the backup folder and can be restored with the standard "Restore / Import" page.'); ?>
        </div>

    </div>
    <?php poznoteSettingsShellClose(); ?>

    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var i18n = {
            confirmRun: <?php echo json_encode(t('local_backup.confirm_run', [], 'Back up the selected users into the backup folder now?')); ?>,
            running: <?php echo json_encode(t('s3_backup.running', [], 'Backing up {{username}}... ({{done}}/{{total}})')); ?>,
            runDone: <?php echo json_encode(t('local_backup.run_done', [], 'Backup finished: {{saved}}/{{total}} user(s) backed up.')); ?>,
            runError: <?php echo json_encode(t('s3_backup.run_error', [], 'Backup stopped after an error: {{error}}')); ?>,
            userOk: <?php echo json_encode(t('local_backup.user_ok', [], '{{username}}: saved ({{size}})')); ?>,
            userFail: <?php echo json_encode(t('s3_backup.user_fail', [], '{{username}}: failed ({{error}})')); ?>,
            lastRun: <?php echo json_encode(t('local_backup.last_run', [], 'Last run ({{trigger}}): {{date}}, {{saved}}/{{total}} user(s) backed up.')); ?>,
            nextRun: <?php echo json_encode(t('local_backup.next_run', [], 'Next automatic backup: {{date}}.')); ?>,
            triggerAuto: <?php echo json_encode(t('s3_backup.trigger_auto', [], 'automatic')); ?>,
            triggerManual: <?php echo json_encode(t('s3_backup.trigger_manual', [], 'manual')); ?>,
            listEmpty: <?php echo json_encode(t('local_backup.list_empty', [], 'No backup in the folder yet.')); ?>,
            listCount: <?php echo json_encode(t('s3_backup.list_count', [], '{{total}} backup(s)')); ?>,
            listCountFiltered: <?php echo json_encode(t('s3_backup.list_count_filtered', [], '{{shown}} of {{total}} backup(s) shown')); ?>,
            listError: <?php echo json_encode(t('local_backup.list_error', [], 'Cannot list the backups: {{error}}')); ?>,
            listLoading: <?php echo json_encode(t('s3_backup.list_loading', [], 'Loading...')); ?>,
            download: <?php echo json_encode(t('s3_backup.download', [], 'Download')); ?>,
            deleteLabel: <?php echo json_encode(t('s3_backup.delete', [], 'Delete')); ?>,
            confirmDelete: <?php echo json_encode(t('local_backup.confirm_delete', [], 'Delete the backup {{filename}} from the folder?')); ?>,
            manualTitle: <?php echo json_encode(t('s3_backup.manual_title', [], 'Manual backup')); ?>,
            usersCount: <?php echo json_encode(t('s3_backup.users_count', [], '{{selected}} of {{total}} user(s) selected')); ?>,
            usersCountFiltered: <?php echo json_encode(t('s3_backup.users_count_filtered', [], '{{selected}} of {{total}} user(s) selected, {{shown}} shown')); ?>
        };

        // ---- Users picker (filter + bulk selection) -------------------------
        (function() {
            var listEl = document.getElementById('local-backup-users-list');
            if (!listEl) return;
            var filterEl = document.getElementById('local-backup-user-filter');
            var clearEl = document.getElementById('local-backup-user-filter-clear');
            var emptyEl = document.getElementById('local-backup-users-empty');
            var countEl = document.getElementById('local-backup-users-count');
            var rows = Array.prototype.slice.call(listEl.querySelectorAll('.local-backup-user-check'));

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
            document.getElementById('local-backup-users-select-all').addEventListener('click', function() { setVisible(true); });
            document.getElementById('local-backup-users-select-none').addEventListener('click', function() { setVisible(false); });
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

        // File timestamps arrive as UTC epochs; render them in local time.
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

        // ---- Status / last run ---------------------------------------------
        var statusData = null;

        function renderLastRun() {
            var el = document.getElementById('local-backup-last-run');
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
                .replace('{{saved}}', run.saved)
                .replace('{{total}}', run.users);
            if (run.errors && run.errors.length) {
                el.textContent += ' ' + run.errors.join(' | ');
            }
            if (statusData.next_auto_run) {
                el.textContent += ' ' + i18n.nextRun
                    .replace('{{date}}', new Date(statusData.next_auto_run * 1000).toLocaleString());
            }
        }

        function refreshStatus() {
            return fetch('api_local_backup.php?action=status', { credentials: 'same-origin' })
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

        document.getElementById('local-backup-run-btn').addEventListener('click', function() {
            if (runInProgress) return;
            window.modalAlert.confirm(i18n.confirmRun, i18n.manualTitle).then(function(confirmed) {
                if (!confirmed || runInProgress) return;
                startRun();
            });
        });

        function startRun() {
            runInProgress = true;
            var statusEl = document.getElementById('local-backup-run-status');
            var logEl = document.getElementById('local-backup-run-log');
            statusEl.hidden = false;
            logEl.textContent = '';

            refreshStatus().then(function(data) {
                if (!data || !data.success || data.directory_error) {
                    statusEl.textContent = i18n.runError.replace('{{error}}', (data && data.directory_error) || 'unknown');
                    runInProgress = false;
                    return;
                }
                var users = (data.users || []).filter(function(u) { return u.selected; });
                var saved = 0, errors = [], index = 0;

                function finish() {
                    statusEl.textContent = i18n.runDone
                        .replace('{{saved}}', saved)
                        .replace('{{total}}', users.length);
                    var body = new URLSearchParams();
                    body.append('users', String(users.length));
                    body.append('saved', String(saved));
                    body.append('errors', JSON.stringify(errors));
                    fetch('api_local_backup.php?action=record_manual', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body.toString()
                    }).catch(function (e) {
                        console.debug('local_backup_settings: finish() failed:', e);
                    }).then(function() {
                        runInProgress = false;
                        refreshStatus();
                        refreshList();
                    });
                }

                // Each user's backup runs as a background job (building a
                // large account's archive takes longer than a proxied
                // request may live): queue it, poll its state until it ends,
                // then move on to the next user.
                function recordResult(user, job) {
                    if (job && job.status === 'done') {
                        saved++;
                        logEl.textContent += i18n.userOk
                            .replace('{{username}}', user.username)
                            .replace('{{size}}', formatBytes(job.size || 0)) + '\n';
                    } else {
                        var error = (job && job.error) || 'unknown';
                        errors.push(user.username + ': ' + error);
                        logEl.textContent += i18n.userFail
                            .replace('{{username}}', user.username)
                            .replace('{{error}}', error) + '\n';
                    }
                    index++;
                    step();
                }

                function pollUserJob(user, jobId) {
                    var timer = setInterval(function() {
                        fetch('api_local_backup.php?action=run_status&job_id=' + encodeURIComponent(jobId), { credentials: 'same-origin' })
                            .then(function(r) { return r.json(); })
                            .then(function(data) {
                                var job = data.success ? data.job : null;
                                if (job && (job.status === 'queued' || job.status === 'running')) return;
                                clearInterval(timer);
                                recordResult(user, job);
                            })
                            .catch(function() { /* transient network error: keep polling */ });
                    }, 3000);
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
                    fetch('api_local_backup.php?action=run', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body.toString()
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(result) {
                        if (!result.success) {
                            recordResult(user, { status: 'error', error: result.error });
                            return;
                        }
                        pollUserJob(user, result.job_id);
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

        // ---- Folder listing -------------------------------------------------
        // The API already returns the archives newest first; clicking a header
        // re-sorts this cached list rather than rescanning the folder.
        var backupList = [];
        var sortKey = null;
        var sortDir = 'asc';
        var listFilterQuery = '';

        // Filter on what the user actually sees in the row: username, archive
        // name and the locally-formatted date
        function filteredBackups() {
            var list = sortedBackups();
            if (listFilterQuery === '') return list;
            return list.filter(function(backup) {
                var haystack = (backup.username + ' ' + backup.filename + ' ' + formatTimestamp(backup.mtime)).toLowerCase();
                return haystack.indexOf(listFilterQuery) !== -1;
            });
        }

        (function() {
            var filterEl = document.getElementById('local-backup-list-filter');
            var clearEl = document.getElementById('local-backup-list-filter-clear');

            function apply() {
                listFilterQuery = filterEl.value.trim().toLowerCase();
                clearEl.hidden = filterEl.value === '';
                renderBackupRows();
            }

            filterEl.addEventListener('input', apply);
            filterEl.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && filterEl.value !== '') {
                    e.preventDefault();
                    filterEl.value = '';
                    apply();
                }
            });
            clearEl.addEventListener('click', function() {
                filterEl.value = '';
                apply();
                filterEl.focus();
            });
        })();

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
            document.querySelectorAll('#local-backup-table thead th[data-sort-key]').forEach(function(th) {
                var isActive = th.getAttribute('data-sort-key') === sortKey;
                var btn = th.querySelector('.local-backup-sort-btn');
                var icon = th.querySelector('.local-backup-sort-icon');
                btn.classList.toggle('local-backup-sort-active', isActive);
                icon.classList.toggle('lucide-chevron-up', isActive && sortDir === 'asc');
                icon.classList.toggle('lucide-chevron-down', !isActive || sortDir === 'desc');
                th.setAttribute('aria-sort', isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
            });
        }

        document.querySelectorAll('#local-backup-table thead th[data-sort-key]').forEach(function(th) {
            th.querySelector('.local-backup-sort-btn').addEventListener('click', function() {
                var key = th.getAttribute('data-sort-key');
                // Same column toggles direction; a new column starts ascending
                sortDir = (key === sortKey && sortDir === 'asc') ? 'desc' : 'asc';
                sortKey = key;
                updateSortIndicators();
                renderBackupRows();
            });
        });

        function refreshList() {
            var statusEl = document.getElementById('local-backup-list-status');
            var table = document.getElementById('local-backup-table');
            var toolbar = document.getElementById('local-backup-list-toolbar');
            var noMatchEl = document.getElementById('local-backup-list-no-match');
            statusEl.hidden = false;
            statusEl.textContent = i18n.listLoading;

            fetch('api_local_backup.php?action=list', { credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    var tbody = table.querySelector('tbody');
                    tbody.innerHTML = '';
                    backupList = [];
                    if (!data.success) {
                        table.hidden = true;
                        toolbar.hidden = true;
                        noMatchEl.hidden = true;
                        statusEl.textContent = i18n.listError.replace('{{error}}', data.error || 'unknown');
                        return;
                    }
                    if (!data.backups.length) {
                        table.hidden = true;
                        toolbar.hidden = true;
                        noMatchEl.hidden = true;
                        statusEl.textContent = i18n.listEmpty;
                        return;
                    }
                    statusEl.textContent = '';
                    statusEl.hidden = true;
                    table.hidden = false;
                    toolbar.hidden = false;
                    backupList = data.backups;
                    renderBackupRows();
                })
                .catch(function(e) {
                    table.hidden = true;
                    toolbar.hidden = true;
                    noMatchEl.hidden = true;
                    statusEl.textContent = i18n.listError.replace('{{error}}', e.message);
                });
        }

        function renderBackupRows() {
            var table = document.getElementById('local-backup-table');
            var tbody = table.querySelector('tbody');
            tbody.innerHTML = '';
            var shown = filteredBackups();

            var countEl = document.getElementById('local-backup-list-count');
            countEl.textContent = listFilterQuery === ''
                ? i18n.listCount.replace('{{total}}', backupList.length)
                : i18n.listCountFiltered.replace('{{shown}}', shown.length).replace('{{total}}', backupList.length);
            document.getElementById('local-backup-list-no-match').hidden = shown.length > 0 || backupList.length === 0;

            shown.forEach(function(backup) {
                var tr = document.createElement('tr');

                var tdUser = document.createElement('td');
                tdUser.textContent = backup.username;
                tr.appendChild(tdUser);

                var tdFile = document.createElement('td');
                tdFile.textContent = backup.filename;
                tr.appendChild(tdFile);

                var tdDate = document.createElement('td');
                tdDate.className = 'local-backup-date-cell';
                tdDate.textContent = formatTimestamp(backup.mtime);
                tr.appendChild(tdDate);

                var tdSize = document.createElement('td');
                tdSize.textContent = formatBytes(backup.size);
                tr.appendChild(tdSize);

                var tdActions = document.createElement('td');
                tdActions.className = 'local-backup-actions-cell';

                var dlLink = document.createElement('a');
                dlLink.className = 'btn btn-primary';
                dlLink.href = 'api_local_backup.php?action=download&user_id=' + encodeURIComponent(backup.user_id)
                    + '&filename=' + encodeURIComponent(backup.filename);
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
                        body.append('user_id', String(backup.user_id));
                        body.append('filename', backup.filename);
                        fetch('api_local_backup.php?action=delete', {
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
            var container = document.querySelector('.local-backup-container');
            var wrap = document.querySelector('.local-backup-table-wrap');
            var table = document.getElementById('local-backup-table');
            if (!container || !wrap || !table || table.hidden) {
                if (container) container.style.removeProperty('--local-backup-width');
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

            container.style.setProperty('--local-backup-width', (natural + chrome) + 'px');
        }

        window.addEventListener('resize', fitContainerToTable);

        refreshStatus();
        refreshList();
    });
    </script>
    <script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
</body>
</html>
