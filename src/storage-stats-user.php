<?php
/**
 * Storage Statistics (own account) — User Tool
 *
 * Shows the number of notes and disk space used by the currently active
 * account only. Unlike admin/storage-stats.php, this is available to every
 * user and never exposes other accounts.
 */

require_once __DIR__ . '/auth.php';
requireAuth();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/version_helper.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/users/db_master.php';

$v             = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

/**
 * Format a byte count as MB with two decimals.
 */
function poznoteFormatMb(int $bytes): string {
    return number_format($bytes / (1024 * 1024), 2);
}

/**
 * Glue a trailing unit like "(MB)" to the preceding word so it never wraps
 * onto its own line. Expects an already HTML-safe string from t_h().
 */
function poznoteGlueUnit(string $label): string {
    return preg_replace('/ (\([^()]*\))\s*$/u', '&nbsp;$1', $label);
}

$activeUserId = (int)(getCurrentUserId() ?? 0);
$manager      = new UserDataManager($activeUserId);
$sizes        = $manager->getStorageStats();

$activeProfile  = getUserProfileById($activeUserId);
$activeUsername = $activeProfile['username'] ?? '';

$notesActive = 0;
$notesTrash  = 0;
try {
    $notesActive = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 0")->fetchColumn();
    $notesTrash  = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 1")->fetchColumn();
} catch (Exception $e) {
    // Leave counts at 0 on error.
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('admin_tools.storage_stats.title', [], 'Storage statistics'); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/admin-tools.css?v=<?php echo $v; ?>">
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="index.php" class="btn btn-secondary">
                <i class="lucide lucide-sticky-note" style="margin-right:5px;"></i><?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary"><?php echo t_h('settings.title', [], 'Settings'); ?></a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <h1><?php echo t_h('admin_tools.storage_stats.title', [], 'Storage statistics'); ?></h1>
            <p><?php
                $userDesc = t_h('admin_tools.storage_stats.user_description', [], 'Number of notes and disk space used by your account.');
                if ($activeUsername !== '') {
                    // Drop a trailing sentence stop (ASCII or ideographic) so the
                    // account name lands before the final punctuation.
                    $trimmed = preg_replace('/[.。]\s*$/u', '', $userDesc);
                    echo $trimmed . ' (' . htmlspecialchars($activeUsername, ENT_QUOTES) . ').';
                } else {
                    echo $userDesc;
                }
            ?></p>
        </div>

        <div class="results-container">
            <table class="results-table">
                <thead>
                    <tr>
                        <th><?php echo t_h('admin_tools.storage_stats.table_notes', [], 'Notes'); ?></th>
                        <th><?php echo t_h('admin_tools.storage_stats.table_trash', [], 'Trash'); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><span class="status-badge status-clean"><?php echo $notesActive; ?></span></td>
                        <td><?php echo $notesTrash; ?></td>
                        <td><?php echo poznoteFormatMb((int)$sizes['database']); ?></td>
                        <td><?php echo poznoteFormatMb((int)$sizes['entries']); ?></td>
                        <td><?php echo poznoteFormatMb((int)$sizes['attachments']); ?></td>
                        <td><strong><?php echo poznoteFormatMb((int)$sizes['total']); ?></strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</body>
</html>
