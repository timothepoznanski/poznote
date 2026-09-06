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

$backToAiChat = isset($_GET['from']) && $_GET['from'] === 'ai-chat';
if ($backToAiChat) {
    // The panel lives on the notes page and on the dashboard; ai_chat_panel.php
    // adds back=dashboard when it was opened from the latter. ?ai_chat=1 makes
    // js/ai-chat.js open the panel on arrival.
    $backToAiChatPage = (($_GET['back'] ?? '') === 'dashboard') ? 'dashboard.php' : 'index.php';
    $backToSettingsHref = $backToSettingsBase . $backToAiChatPage . '?ai_chat=1'
        . ($backToSettingsWs !== '' ? '&workspace=' . urlencode($backToSettingsWs) : '');
    $backToSettingsLabel = t_h('ai_chat.back_to_assistant', [], 'Back to AI Assistant');
} else {
    $backToSettingsHref = $backToSettingsBase . 'settings.php'
        . ($backToSettingsWs !== '' ? '?workspace=' . urlencode($backToSettingsWs) : '');
    $backToSettingsLabel = t_h('common.back_to_settings', [], 'Back to Settings');
}
?>
<div class="poznote-back-bar poznote-back-to-settings-bar">
    <a href="<?php echo htmlspecialchars($backToSettingsHref, ENT_QUOTES, 'UTF-8'); ?>" class="poznote-back-btn">
        <i class="lucide lucide-arrow-left"></i>
        <?php echo $backToSettingsLabel; ?>
    </a>
</div>
