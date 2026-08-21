<?php
/**
 * "Back to Settings" bar (shared partial)
 *
 * Rendered above the page title on every page reachable from settings.php
 * (ai_settings.php, git_sync.php, admin/users.php, ...). The icon rail only
 * exposes Settings through the gear at the very bottom, which is easy to miss,
 * so each sub-page gets an explicit way back.
 *
 * Optional variables the caller may set before including this file:
 *   $backToSettingsBasePath   '../' for pages living under admin/; defaults to
 *                             '' (document root).
 *   $backToSettingsWorkspace  workspace to carry in the link; defaults to
 *                             $pageWorkspace, then getWorkspaceFilter().
 *
 * Requires: css/icon-sidebar.css in <head> (it defines .poznote-back-bar /
 *           .poznote-back-btn), which every host page already loads.
 */

$backToSettingsBase = isset($backToSettingsBasePath) ? $backToSettingsBasePath : '';

if (isset($backToSettingsWorkspace)) {
    $backToSettingsWs = trim((string)$backToSettingsWorkspace);
} elseif (isset($pageWorkspace)) {
    $backToSettingsWs = trim((string)$pageWorkspace);
} else {
    $backToSettingsWs = trim((string)getWorkspaceFilter());
}
if ($backToSettingsWs === '__last_opened__') {
    $backToSettingsWs = '';
}

$backToSettingsHref = $backToSettingsBase . 'settings.php'
    . ($backToSettingsWs !== '' ? '?workspace=' . urlencode($backToSettingsWs) : '');
?>
<div class="poznote-back-bar poznote-back-to-settings-bar">
    <a href="<?php echo htmlspecialchars($backToSettingsHref, ENT_QUOTES, 'UTF-8'); ?>" class="poznote-back-btn">
        <i class="lucide lucide-arrow-left"></i>
        <?php echo t_h('common.back_to_settings', [], 'Back to Settings'); ?>
    </a>
</div>
