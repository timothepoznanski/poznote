<?php
/**
 * Icon Sidebar (shared partial)
 *
 * Narrow icon-only rail rendered on the far left of index.php and of the
 * secondary pages (notes_manager.php, list_tags.php, list_folders.php,
 * shared.php, attachments_list.php, trash.php, diary.php, tasks.php,
 * settings.php).
 *
 * Every page gets the same navigation entries, so this file is the single
 * place to add or reorder one.
 *
 * Optional variables the caller may set before including this file:
 *   $iconSidebarWorkspace  workspace to carry in the links; defaults to
 *                          getWorkspaceFilter().
 *   $iconSidebarExtraItems buttons appended after the navigation entries.
 *                          index.php uses this for its notifications /
 *                          git-sync / AI-chat buttons, which depend on
 *                          handlers that only that page loads. Each entry is
 *                          ['id', 'icon', 'label'] plus exactly one of
 *                          'action' (=> data-action), 'gitAction'
 *                          (=> data-icon-sidebar-git-action, index.php) or
 *                          'dashboardGitAction' (=> data-dashboard-git-action,
 *                          dashboard.php, whose git handler is its own).
 *
 * Requires: css/icon-sidebar.css in <head> (plus css/icon-sidebar-page.css on
 *           the secondary pages, which pin the rail instead of laying it out
 *           as a flex child of <body>), and js/icon-sidebar-toggle.js.
 */

if (!isset($iconSidebarWorkspace)) {
    $iconSidebarWorkspace = trim((string)getWorkspaceFilter());
}
if ($iconSidebarWorkspace === '__last_opened__') {
    $iconSidebarWorkspace = '';
}

// Pages in a subdirectory (admin/) must prefix their links, since every target
// lives at the document root.
if (!isset($iconSidebarBasePath)) {
    $iconSidebarBasePath = '';
}

$iconSidebarUrl = static function (string $page, array $extra = []) use ($iconSidebarWorkspace, $iconSidebarBasePath): string {
    if ($iconSidebarWorkspace !== '') {
        $extra['workspace'] = $iconSidebarWorkspace;
    }
    return $iconSidebarBasePath . $page . ($extra ? '?' . http_build_query($extra) : '');
};

// Only root-level pages can match a rail entry; a page in a subdirectory would
// otherwise highlight a same-named entry it has nothing to do with.
$iconSidebarScriptPath = (string)parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH);
$iconSidebarCurrentPage = $iconSidebarBasePath === '' ? basename($iconSidebarScriptPath) : '';

$iconSidebarItems = [
    ['id' => 'iconSidebarHomeBtn', 'url' => $iconSidebarUrl('index.php'), 'page' => 'index.php', 'icon' => 'lucide-home', 'label' => t('common.home', [], 'Home')],
    ['id' => 'iconSidebarDashboardBtn', 'url' => $iconSidebarUrl('dashboard.php'), 'page' => 'dashboard.php', 'icon' => 'lucide-layout-dashboard', 'label' => t('common.back_to_home', [], 'Dashboard')],
    ['id' => 'iconSidebarNotesBtn', 'url' => $iconSidebarUrl('notes_manager.php'), 'page' => 'notes_manager.php', 'icon' => 'lucide-sticky-note', 'label' => t('common.notes', [], 'Notes')],
    // Favorites is dashboard.php with a filter, not a page of its own, so it is
    // flagged active by the query string rather than by 'page' (which would
    // otherwise light up on every dashboard visit).
    ['id' => 'iconSidebarFavoritesBtn', 'url' => $iconSidebarUrl('dashboard.php', ['favorites' => '1']), 'icon' => 'lucide-star', 'label' => t('notes_list.system_folders.favorites', [], 'Favorites'), 'activeFavorite' => $iconSidebarCurrentPage === 'dashboard.php' && (($_GET['favorites'] ?? '') === '1')],
    ['id' => 'iconSidebarTagsBtn', 'url' => $iconSidebarUrl('list_tags.php'), 'page' => 'list_tags.php', 'icon' => 'lucide-tags', 'label' => t('notes_list.system_folders.tags', [], 'Tags')],
    ['id' => 'iconSidebarFoldersBtn', 'url' => $iconSidebarUrl('list_folders.php'), 'page' => 'list_folders.php', 'icon' => 'lucide-folder-open', 'label' => t('home.folders', [], 'Folders')],
    ['id' => 'iconSidebarSharesBtn', 'url' => $iconSidebarUrl('shared.php'), 'page' => 'shared.php', 'icon' => 'lucide-share-2', 'label' => t('home.shares', [], 'Shares')],
    ['id' => 'iconSidebarAttachmentsBtn', 'url' => $iconSidebarUrl('attachments_list.php'), 'page' => 'attachments_list.php', 'icon' => 'lucide-paperclip', 'label' => t('notes_list.system_folders.attachments', [], 'Attachments')],
    ['id' => 'iconSidebarTrashBtn', 'url' => $iconSidebarUrl('trash.php'), 'page' => 'trash.php', 'icon' => 'lucide-trash-2', 'label' => t('notes_list.system_folders.trash', [], 'Trash')],
    ['id' => 'iconSidebarDiaryBtn', 'url' => $iconSidebarUrl('diary.php'), 'page' => 'diary.php', 'icon' => 'lucide-book-open', 'label' => t('diary.title', [], 'Diary')],
    ['id' => 'iconSidebarTasksBtn', 'url' => $iconSidebarUrl('tasks.php'), 'page' => 'tasks.php', 'icon' => 'lucide-list-todo', 'label' => t('tasks_page.title', [], 'Tasks')],
    ['id' => 'iconSidebarGraphBtn', 'url' => $iconSidebarUrl('graph.php'), 'page' => 'graph.php', 'icon' => 'lucide-network', 'label' => t('home.graph', [], 'Graph')],
];

if (!empty($iconSidebarExtraItems)) {
    $iconSidebarItems = array_merge($iconSidebarItems, $iconSidebarExtraItems);
}

// Account actions, flush against the bottom of the rail (the 'bottom' flag
// adds the class css/icon-sidebar.css uses to push the group down).
// Logout has no 'page' so it never highlights.
// The update badge is admin-only, matching the Check for Updates card in
// settings.php; js/utils.js reveals every .update-badge when a release is out.
$iconSidebarItems[] = ['id' => 'iconSidebarSettingsBtn', 'url' => $iconSidebarUrl('settings.php'), 'page' => 'settings.php', 'icon' => 'lucide-settings', 'label' => t('sidebar.settings', [], 'Settings'), 'bottom' => true, 'updateBadge' => function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()];
$iconSidebarItems[] = ['id' => 'iconSidebarLogoutBtn', 'url' => $iconSidebarBasePath . 'logout.php', 'icon' => 'lucide-log-out', 'label' => t('workspace_menu.logout', [], 'Logout')];

$iconSidebarToggleLabel = t_h('sidebar.toggle_icon_sidebar', [], 'Hide/Show icon sidebar');
?>
<script>
// Apply the collapsed state before the rail paints; js/icon-sidebar-toggle.js
// owns it afterwards.
try {
    if (localStorage.getItem('iconSidebarCollapsed') === 'true') {
        document.body.classList.add('icon-sidebar-collapsed');
    }
} catch (e) {}
</script>
<nav id="icon_sidebar">
    <?php foreach ($iconSidebarItems as $iconSidebarItem): ?>
    <?php
    $iconSidebarLabel = htmlspecialchars($iconSidebarItem['label'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $iconSidebarIcon = htmlspecialchars($iconSidebarItem['icon'], ENT_QUOTES, 'UTF-8');
    // Only the navigation entries carry a 'page'; the extras never highlight.
    $iconSidebarIsCurrent = isset($iconSidebarItem['page']) && $iconSidebarItem['page'] === $iconSidebarCurrentPage;
    // Starts the bottom-aligned group.
    $iconSidebarClass = 'icon-sidebar-btn'
        . (!empty($iconSidebarItem['bottom']) ? ' icon-sidebar-btn-bottom-start' : '')
        . ($iconSidebarIsCurrent ? ' icon-sidebar-btn-active' : '')
        . (!empty($iconSidebarItem['activeFavorite']) ? ' icon-sidebar-btn-active-favorite' : '');
    ?>
    <?php if (isset($iconSidebarItem['gitAction'])): ?>
    <button type="button" id="<?php echo $iconSidebarItem['id']; ?>" class="<?php echo $iconSidebarClass; ?>" data-icon-sidebar-git-action="<?php echo htmlspecialchars($iconSidebarItem['gitAction'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $iconSidebarLabel; ?>" aria-label="<?php echo $iconSidebarLabel; ?>">
        <i class="lucide <?php echo $iconSidebarIcon; ?>"></i>
    </button>
    <?php elseif (isset($iconSidebarItem['dashboardGitAction'])): ?>
    <button type="button" id="<?php echo $iconSidebarItem['id']; ?>" class="<?php echo $iconSidebarClass; ?>" data-dashboard-git-action="<?php echo htmlspecialchars($iconSidebarItem['dashboardGitAction'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $iconSidebarLabel; ?>" aria-label="<?php echo $iconSidebarLabel; ?>">
        <i class="lucide <?php echo $iconSidebarIcon; ?>"></i>
    </button>
    <?php elseif (isset($iconSidebarItem['action'])): ?>
    <button type="button" id="<?php echo $iconSidebarItem['id']; ?>" class="<?php echo $iconSidebarClass; ?>" data-action="<?php echo htmlspecialchars($iconSidebarItem['action'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $iconSidebarLabel; ?>" aria-label="<?php echo $iconSidebarLabel; ?>">
        <i class="lucide <?php echo $iconSidebarIcon; ?>"></i>
    </button>
    <?php else: ?>
    <a href="<?php echo htmlspecialchars($iconSidebarItem['url'], ENT_QUOTES, 'UTF-8'); ?>"
       id="<?php echo $iconSidebarItem['id']; ?>"
       class="<?php echo $iconSidebarClass; ?>"
       title="<?php echo $iconSidebarLabel; ?>"
       aria-label="<?php echo $iconSidebarLabel; ?>"<?php echo $iconSidebarIsCurrent ? ' aria-current="page"' : ''; ?>>
        <i class="lucide <?php echo $iconSidebarIcon; ?>"></i>
        <?php if (!empty($iconSidebarItem['updateBadge'])): ?>
        <span class="update-badge update-badge-hidden"></span>
        <?php endif; ?>
    </a>
    <?php endif; ?>
    <?php endforeach; ?>
</nav>
<!-- Sits outside #icon_sidebar so it stays clickable once the rail is hidden. -->
<button type="button" id="iconSidebarToggle" title="<?php echo $iconSidebarToggleLabel; ?>" aria-label="<?php echo $iconSidebarToggleLabel; ?>" aria-expanded="true" aria-controls="icon_sidebar">
    <i class="lucide lucide-chevron-left"></i>
</button>
