<?php
/**
 * Icon Sidebar (shared partial)
 *
 * Narrow icon-only rail rendered on the far left of the secondary pages
 * (notes_manager.php, list_tags.php, list_folders.php, shared.php,
 * attachments_list.php, trash.php, diary.php, tasks.php).
 *
 * index.php builds its own copy inline because it also needs the
 * notifications / git-sync / AI-chat buttons, which only exist there.
 *
 * The caller may set $iconSidebarWorkspace before including this file;
 * otherwise the workspace is read from getWorkspaceFilter().
 *
 * Requires: css/icon-sidebar.css + css/icon-sidebar-page.css in <head>,
 *           js/icon-sidebar-toggle.js before </body>.
 */

if (!isset($iconSidebarWorkspace)) {
    $iconSidebarWorkspace = trim((string)getWorkspaceFilter());
}
if ($iconSidebarWorkspace === '__last_opened__') {
    $iconSidebarWorkspace = '';
}

$iconSidebarUrl = static function (string $page, array $extra = []) use ($iconSidebarWorkspace): string {
    if ($iconSidebarWorkspace !== '') {
        $extra['workspace'] = $iconSidebarWorkspace;
    }
    return $page . ($extra ? '?' . http_build_query($extra) : '');
};

$iconSidebarCurrentPage = basename((string)parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));

$iconSidebarItems = [
    ['id' => 'iconSidebarNotesBtn', 'url' => $iconSidebarUrl('notes_manager.php'), 'page' => 'notes_manager.php', 'icon' => 'lucide-sticky-note', 'label' => t('common.notes', [], 'Notes')],
    ['id' => 'iconSidebarFavoritesBtn', 'url' => $iconSidebarUrl('dashboard.php', ['favorites' => '1']), 'page' => 'favorites.php', 'icon' => 'lucide-star', 'label' => t('notes_list.system_folders.favorites', [], 'Favorites')],
    ['id' => 'iconSidebarTagsBtn', 'url' => $iconSidebarUrl('list_tags.php'), 'page' => 'list_tags.php', 'icon' => 'lucide-tags', 'label' => t('notes_list.system_folders.tags', [], 'Tags')],
    ['id' => 'iconSidebarFoldersBtn', 'url' => $iconSidebarUrl('list_folders.php'), 'page' => 'list_folders.php', 'icon' => 'lucide-folder-open', 'label' => t('home.folders', [], 'Folders')],
    ['id' => 'iconSidebarSharesBtn', 'url' => $iconSidebarUrl('shared.php'), 'page' => 'shared.php', 'icon' => 'lucide-share-2', 'label' => t('home.shares', [], 'Shares')],
    ['id' => 'iconSidebarAttachmentsBtn', 'url' => $iconSidebarUrl('attachments_list.php'), 'page' => 'attachments_list.php', 'icon' => 'lucide-paperclip', 'label' => t('notes_list.system_folders.attachments', [], 'Attachments')],
    ['id' => 'iconSidebarTrashBtn', 'url' => $iconSidebarUrl('trash.php'), 'page' => 'trash.php', 'icon' => 'lucide-trash-2', 'label' => t('notes_list.system_folders.trash', [], 'Trash')],
    ['id' => 'iconSidebarDiaryBtn', 'url' => $iconSidebarUrl('diary.php'), 'page' => 'diary.php', 'icon' => 'lucide-book-open', 'label' => t('diary.title', [], 'Diary')],
    ['id' => 'iconSidebarTasksBtn', 'url' => $iconSidebarUrl('tasks.php'), 'page' => 'tasks.php', 'icon' => 'lucide-list-todo', 'label' => t('tasks_page.title', [], 'Tasks')],
    ['id' => 'iconSidebarGraphBtn', 'url' => $iconSidebarUrl('graph.php'), 'page' => 'graph.php', 'icon' => 'lucide-network', 'label' => t('home.graph', [], 'Graph')],
];

$iconSidebarToggleLabel = t_h('sidebar.toggle_icon_sidebar', [], 'Hide/Show icon sidebar');
?>
<script>
// Apply the collapsed state before the rail paints; js/icon-sidebar-toggle.js
// owns it afterwards. Shares the storage key with index.php.
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
    $iconSidebarIsCurrent = ($iconSidebarItem['page'] === $iconSidebarCurrentPage);
    ?>
    <a href="<?php echo htmlspecialchars($iconSidebarItem['url'], ENT_QUOTES, 'UTF-8'); ?>"
       id="<?php echo $iconSidebarItem['id']; ?>"
       class="icon-sidebar-btn<?php echo $iconSidebarIsCurrent ? ' icon-sidebar-btn-active' : ''; ?>"
       title="<?php echo $iconSidebarLabel; ?>"
       aria-label="<?php echo $iconSidebarLabel; ?>"<?php echo $iconSidebarIsCurrent ? ' aria-current="page"' : ''; ?>>
        <i class="lucide <?php echo htmlspecialchars($iconSidebarItem['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i>
    </a>
    <?php endforeach; ?>
</nav>
<!-- Sits outside #icon_sidebar so it stays clickable once the rail is hidden. -->
<button type="button" id="iconSidebarToggle" title="<?php echo $iconSidebarToggleLabel; ?>" aria-label="<?php echo $iconSidebarToggleLabel; ?>" aria-expanded="true" aria-controls="icon_sidebar">
    <i class="lucide lucide-chevron-left"></i>
</button>
