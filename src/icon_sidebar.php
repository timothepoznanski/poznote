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
 * place to add or reorder one. Each entry names a 'group'; a separator line is
 * drawn where the group changes, so the rail reads as a few short blocks
 * rather than one long column of icons (see $iconSidebarItems below).
 *
 * Optional variables the caller may set before including this file:
 *   $iconSidebarWorkspace  workspace to carry in the links; defaults to
 *                          getWorkspaceFilter().
 *   $iconSidebarExtraItems buttons appended after the navigation entries, in
 *                          the scrolling part of the rail (the account group at
 *                          the bottom is fixed and defined here).
 *                          index.php uses this for its git-sync buttons and,
 *                          like dashboard.php, for the AI-chat button: they
 *                          depend on handlers only those pages load. Each entry is
 *                          ['id', 'icon', 'label'] plus exactly one of
 *                          'action' (=> data-action), 'gitAction'
 *                          (=> data-icon-sidebar-git-action, index.php) or
 *                          'dashboardGitAction' (=> data-dashboard-git-action,
 *                          dashboard.php, whose git handler is its own).
 *                          A gitAction entry may add 'hidden' => true to render
 *                          with the hidden attribute (index.php uses it for
 *                          workspaces outside the Git sync scope; the client
 *                          toggles it on workspace switch).
 *                          An entry may also add 'after' => '<entry id>' to sit
 *                          right below that navigation entry instead of at the
 *                          end of the rail (index.php and dashboard.php use it
 *                          for the AI assistant, pinned under Dashboard). A
 *                          pinned entry is not part of the rail's custom ordering
 *                          and joins the group of the entry it sits under. Any
 *                          other extra may set 'group'; it defaults to 'extras',
 *                          a block of its own at the end of the rail.
 *
 * Requires: css/icon-sidebar.css in <head> (plus css/icon-sidebar-page.css on
 *           the secondary pages, which pin the rail instead of laying it out
 *           as a flex child of <body>), and js/icon-sidebar-toggle.js.
 *
 * Also loads js/page-title-workspace-menu.js, the workspace menu behind the
 * "(workspace)" suffix of the secondary pages' titles
 * (poznoteRenderPageTitleWorkspace() in functions.php): every page with such a
 * title includes this partial, and the script is a no-op on the others.
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

// The About view is settings.php?open=about. js/settings-page.js strips the
// param once it has applied the section state, so it also flips the highlight
// over to the About button to keep the rail matching the cleaned URL.
$iconSidebarIsAboutView = $iconSidebarCurrentPage === 'settings.php' && (($_GET['open'] ?? '') === 'about');

// Four groups, top to bottom: the entry points into the app (Home, Dashboard,
// Graph), the views that hold the content itself (Notes, Tasks, Folders,
// Diary), the collections derived from that content (Tags, Shares,
// Attachments), and the Trash on its own. A separator is drawn between two
// consecutive entries of different groups. Favorites has no entry: it is a
// dashboard filter, reached from the notes list's system folder.
$iconSidebarItems = [
    ['id' => 'iconSidebarHomeBtn', 'group' => 'home', 'url' => $iconSidebarUrl('index.php'), 'page' => 'index.php', 'icon' => 'lucide-home', 'label' => t('common.home', [], 'Home')],
    ['id' => 'iconSidebarDashboardBtn', 'group' => 'home', 'url' => $iconSidebarUrl('dashboard.php'), 'page' => 'dashboard.php', 'icon' => 'lucide-layout-dashboard', 'label' => t('common.back_to_home', [], 'Dashboard')],
    ['id' => 'iconSidebarGraphBtn', 'group' => 'home', 'url' => $iconSidebarUrl('graph.php'), 'page' => 'graph.php', 'icon' => 'lucide-network', 'label' => t('home.graph', [], 'Graph')],
    ['id' => 'iconSidebarNotesBtn', 'group' => 'content', 'url' => $iconSidebarUrl('notes_manager.php'), 'page' => 'notes_manager.php', 'icon' => 'lucide-sticky-note', 'label' => t('common.notes', [], 'Notes')],
    ['id' => 'iconSidebarTasksBtn', 'group' => 'content', 'url' => $iconSidebarUrl('tasks.php'), 'page' => 'tasks.php', 'icon' => 'lucide-list-todo', 'label' => t('tasks_page.title', [], 'Tasks')],
    ['id' => 'iconSidebarFoldersBtn', 'group' => 'content', 'url' => $iconSidebarUrl('list_folders.php'), 'page' => 'list_folders.php', 'icon' => 'lucide-folder-open', 'label' => t('home.folders', [], 'Folders')],
    ['id' => 'iconSidebarDiaryBtn', 'group' => 'content', 'url' => $iconSidebarUrl('diary.php'), 'page' => 'diary.php', 'icon' => 'lucide-book-open', 'label' => t('diary.title', [], 'Diary')],
    ['id' => 'iconSidebarTagsBtn', 'group' => 'collections', 'url' => $iconSidebarUrl('list_tags.php'), 'page' => 'list_tags.php', 'icon' => 'lucide-tags', 'label' => t('notes_list.system_folders.tags', [], 'Tags')],
    ['id' => 'iconSidebarSharesBtn', 'group' => 'collections', 'url' => $iconSidebarUrl('shared.php'), 'page' => 'shared.php', 'icon' => 'lucide-share-2', 'label' => t('home.shares', [], 'Shares')],
    ['id' => 'iconSidebarAttachmentsBtn', 'group' => 'collections', 'url' => $iconSidebarUrl('attachments_list.php'), 'page' => 'attachments_list.php', 'icon' => 'lucide-paperclip', 'label' => t('notes_list.system_folders.attachments', [], 'Attachments')],
    ['id' => 'iconSidebarTrashBtn', 'group' => 'utility', 'url' => $iconSidebarUrl('trash.php'), 'page' => 'trash.php', 'icon' => 'lucide-trash-2', 'label' => t('notes_list.system_folders.trash', [], 'Trash')],
];

// Extras carrying an 'after' are pinned next to a navigation entry and are
// placed at the very end of this file, once the ordering below has run.
$iconSidebarPinnedItems = [];
foreach (($iconSidebarExtraItems ?? []) as $iconSidebarExtraItem) {
    if (isset($iconSidebarExtraItem['after'])) {
        $iconSidebarPinnedItems[] = $iconSidebarExtraItem;
    } else {
        $iconSidebarExtraItem['group'] = $iconSidebarExtraItem['group'] ?? 'extras';
        $iconSidebarItems[] = $iconSidebarExtraItem;
    }
}

// The Icon Sidebar Order card in settings.php lets the user rearrange these.
// Applied after the extras are merged so index.php's git buttons can be placed
// among the navigation entries too. Entries the preference does not mention
// keep their declared order and follow the ones it does. A saved order also
// carries its own separators (poznoteApplyIconSidebarOrder() turns each one
// into a ['divider' => true] item); without one, $iconSidebarGroupDividers
// below draws them from the groups instead.
$iconSidebarOrder = function_exists('poznoteGetIconSidebarOrder') ? poznoteGetIconSidebarOrder() : [];

// A ['divider' => true] item between two consecutive entries of different
// groups. Entries with no group at all are left ungrouped: they never get a
// line on either side of their own.
$iconSidebarGroupDividers = static function (array $items): array {
    $grouped = [];
    $previousGroup = null;
    foreach ($items as $item) {
        $group = $item['group'] ?? null;
        if ($grouped && $group !== null && $previousGroup !== null && $group !== $previousGroup) {
            $grouped[] = ['divider' => true];
        }
        $grouped[] = $item;
        if ($group !== null) {
            $previousGroup = $group;
        }
    }
    return $grouped;
};

// Published for the Icon Sidebar Order modal in modals.php, which settings.php
// includes long after this file. Taking the list from here rather than
// restating it means the modal always offers exactly the entries the rail
// renders, in the order it renders them, separators included, whatever a later
// release adds. Built from the declared list, before the order is applied:
// the git entries are appended below and the whole list is ordered once, so
// the saved separators land exactly once.
$iconSidebarOrderable = array_values(array_map(
    static function (array $item): array {
        return [
            'id' => $item['id'],
            'icon' => $item['icon'],
            'label' => $item['label'],
            'group' => $item['group'] ?? null,
        ];
    },
    array_filter($iconSidebarItems, static function ($item): bool {
        return is_array($item) && isset($item['id'], $item['icon'], $item['label']);
    })
));

if ($iconSidebarOrder && function_exists('poznoteApplyIconSidebarOrder')) {
    $iconSidebarItems = poznoteApplyIconSidebarOrder($iconSidebarItems, $iconSidebarOrder);
}

// Push and Pull are rail entries too, but index.php is the only page that adds
// them (their handlers live there), so the modal, rendered on settings.php,
// would never offer them. Append them here whenever git sync is on so they can
// be positioned like any other entry; poznoteApplyIconSidebarOrder() then
// places them on index.php, and every other page simply ignores the two ids.
// The same isEnabled() && isConfigured() test index.php uses, so the modal
// offers the two rows exactly when the rail would show them, never listing an
// entry the user cannot actually see.
if (!isset($GLOBALS['poznoteIconSidebarGitOrderables'])) {
    $iconSidebarGitOrderables = [];
    // settings.php requires GitSync.php further down the page, after this
    // include, so pull it in here rather than depending on load order.
    if (!class_exists('GitSync') && is_file(__DIR__ . '/GitSync.php')) {
        require_once __DIR__ . '/GitSync.php';
    }
    if (class_exists('GitSync') && GitSync::isEnabled()) {
        try {
            $iconSidebarGitSync = new GitSync($GLOBALS['con'] ?? null, $_SESSION['user_id'] ?? null);
            if ($iconSidebarGitSync->isConfigured()) {
                foreach ([
                    ['id' => 'iconSidebarGitPushBtn', 'icon' => 'lucide-upload', 'label' => 'Push', 'group' => 'extras'],
                    ['id' => 'iconSidebarGitPullBtn', 'icon' => 'lucide-download', 'label' => 'Pull', 'group' => 'extras'],
                ] as $iconSidebarGitOrderable) {
                    $iconSidebarGitOrderables[$iconSidebarGitOrderable['id']] = $iconSidebarGitOrderable;
                }
            }
        } catch (Throwable $e) {
            // Git misconfiguration must never take the rail down with it.
        }
    }
    $GLOBALS['poznoteIconSidebarGitOrderables'] = $iconSidebarGitOrderables;
}

foreach ($GLOBALS['poznoteIconSidebarGitOrderables'] as $iconSidebarGitId => $iconSidebarGitOrderable) {
    if (!in_array($iconSidebarGitId, array_column($iconSidebarOrderable, 'id'), true)) {
        $iconSidebarOrderable[] = $iconSidebarGitOrderable;
    }
}

// Sort: the entries just appended have to take their saved position rather
// than sit at the end, or the modal would misreport where they actually are.
// The separators come from the same place as the rail's: the saved order when
// there is one, the groups otherwise.
if ($iconSidebarOrder && function_exists('poznoteApplyIconSidebarOrder')) {
    $iconSidebarOrderable = poznoteApplyIconSidebarOrder($iconSidebarOrderable, $iconSidebarOrder);
} else {
    $iconSidebarOrderable = $iconSidebarGroupDividers($iconSidebarOrderable);
}
if (function_exists('poznoteTidyIconSidebarDividers')) {
    $iconSidebarOrderable = poznoteTidyIconSidebarDividers($iconSidebarOrderable);
}

$GLOBALS['poznoteIconSidebarOrderableItems'] = $iconSidebarOrderable;

// Pinned extras take their place only now, so 'after' keeps holding for a user
// who saved a custom order: that order cannot mention them, since the Icon
// Sidebar Order modal renders on settings.php, where these page-specific
// entries do not exist, and poznoteApplyIconSidebarOrder() would push every
// unmentioned entry to the end of the rail. They are left out of
// $iconSidebarOrderable above for the same reason: their position is fixed.
// An 'after' naming an entry the rail is not showing falls back to appending.
foreach ($iconSidebarPinnedItems as $iconSidebarPinnedItem) {
    $iconSidebarPosition = count($iconSidebarItems);
    foreach ($iconSidebarItems as $iconSidebarIndex => $iconSidebarCandidate) {
        if (($iconSidebarCandidate['id'] ?? null) === $iconSidebarPinnedItem['after']) {
            $iconSidebarPosition = $iconSidebarIndex + 1;
            // Same block as the entry it sits under, so no line comes between.
            $iconSidebarPinnedItem['group'] = $iconSidebarCandidate['group'] ?? null;
            break;
        }
    }
    array_splice($iconSidebarItems, $iconSidebarPosition, 0, [$iconSidebarPinnedItem]);
}

// Default layout: a separator wherever the group changes. Runs after the
// pinned entries are in so the AI assistant, under Dashboard, stays inside
// that block. A saved order brought its own separators above.
if (!$iconSidebarOrder) {
    $iconSidebarItems = $iconSidebarGroupDividers($iconSidebarItems);
}
if (function_exists('poznoteTidyIconSidebarDividers')) {
    $iconSidebarItems = poznoteTidyIconSidebarDividers($iconSidebarItems);
}

// Account actions, in their own group pinned to the bottom of the rail: only
// the navigation entries above scroll, this group always stays visible.
// Profile and Logout have no 'page' so they never highlight. js/profile.js,
// loaded below, opens the My Profile modal in place on whatever page the rail
// is on; the href is the no-JS fallback (settings.php auto-opens the same
// modal on ?open=profile).
// The update badge is admin-only, matching the Check for Updates card in
// settings.php; js/utils-updates.js reveals every .update-badge when a release is out.
$iconSidebarBottomItems = [
    ['id' => 'iconSidebarProfileBtn', 'url' => $iconSidebarUrl('settings.php', ['open' => 'profile']) . '#my-profile-card', 'icon' => 'lucide-user', 'label' => t('profile.card', [], 'My Profile')],
    // Light/dark/black switch. It goes nowhere, so it renders as a button
    // rather than a link; js/theme-manager.js picks it up through
    // data-theme-toggle and keeps the icon on the theme the next click applies.
    ['id' => 'iconSidebarThemeToggleBtn', 'themeToggle' => true, 'icon' => 'lucide-moon', 'label' => t('theme.toggle', [], 'Toggle theme')],
    // ?open=about lands on settings.php with the About section expanded and
    // every other section collapsed (js/settings-page.js). It is settings.php
    // with a query flag rather than a page of its own, so the two entries below
    // split the active state by that flag: About
    // lights up on ?open=about, Settings on every other settings.php visit.
    ['id' => 'iconSidebarSettingsBtn', 'url' => $iconSidebarUrl('settings.php'), 'icon' => 'lucide-settings', 'label' => t('sidebar.settings', [], 'Settings'), 'activeFlag' => $iconSidebarCurrentPage === 'settings.php' && !$iconSidebarIsAboutView, 'updateBadge' => function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()],
    ['id' => 'iconSidebarAboutBtn', 'url' => $iconSidebarUrl('settings.php', ['open' => 'about']), 'icon' => 'lucide-info-circle', 'label' => t('settings.categories.documentation', [], 'About'), 'activeFlag' => $iconSidebarIsAboutView],
    ['id' => 'iconSidebarLogoutBtn', 'url' => $iconSidebarBasePath . 'logout.php', 'icon' => 'lucide-log-out', 'label' => t('workspace_menu.logout', [], 'Logout')],
];

$iconSidebarToggleLabel = t_h('sidebar.toggle_icon_sidebar', [], 'Hide/Show icon sidebar');
$iconSidebarOverflowLabel = t_h('sidebar.show_hidden_icons', [], 'Show hidden icons');

// Assets are addressed from the document root, so a page in a subdirectory
// needs the same prefix as the links above.
$iconSidebarAsset = static function (string $path) use ($iconSidebarBasePath): string {
    $url = function_exists('poznoteAsset')
        ? poznoteAsset($path)
        : htmlspecialchars($path, ENT_QUOTES, 'UTF-8');
    return $iconSidebarBasePath . $url;
};

// js/profile.js falls back to English when window.t is missing, and half the
// pages carrying the rail never load the i18n runtime (js/globals.js). The
// modal's strings are therefore resolved here, server-side, where the user's
// language is already known.
$iconSidebarProfileStrings = [
    'profile.modal.title' => t('profile.modal.title', [], 'My Profile'),
    // Keeps its {{name}} placeholder: js/profile.js substitutes it client-side.
    'profile.modal.title_of' => t('profile.modal.title_of', [], 'Profile of {{name}}'),
    'profile.modal.username' => t('profile.modal.username', [], 'Username'),
    'profile.modal.first_name' => t('profile.modal.first_name', [], 'First name'),
    'profile.modal.last_name' => t('profile.modal.last_name', [], 'Last name'),
    'profile.modal.email_admin_only' => t('profile.modal.email_admin_only', [], 'Only an administrator can change your email address.'),
    'profile.modal.id' => t('profile.modal.id', [], 'ID'),
    'profile.errors.username_required' => t('profile.errors.username_required', [], 'Username is required'),
    'profile.errors.username_invalid' => t('profile.errors.username_invalid', [], 'Username may only contain letters, digits, dots, underscores and dashes, and cannot be a number'),
    'profile.errors.username_taken' => t('profile.errors.username_taken', [], 'This username is already taken'),
    'profile.errors.email_invalid' => t('profile.errors.email_invalid', [], 'Invalid email address'),
    'profile.errors.email_taken' => t('profile.errors.email_taken', [], 'This email is already in use'),
    'profile.logout.confirm' => t('profile.logout.confirm', [], 'Are you sure you want to log out?'),
    // Keeps its {{username}} placeholder: js/profile.js substitutes it client-side.
    'profile.logout.signed_in_as' => t('profile.logout.signed_in_as', [], 'Signed in as {{username}}'),
    'profile.logout.in_progress' => t('profile.logout.in_progress', [], 'Logging out...'),
    'workspace_menu.logout' => t('workspace_menu.logout', [], 'Logout'),
    'multiuser.admin.email' => t('multiuser.admin.email', [], 'Email'),
    'common.cancel' => t('common.cancel', [], 'Cancel'),
    'common.save' => t('common.save', [], 'Save'),
    'common.loading' => t('common.loading', [], 'Loading...'),
    'common.error' => t('common.error', [], 'Error'),
];
?>
<link rel="stylesheet" href="<?php echo $iconSidebarAsset('css/profile-modal.css'); ?>">
<script>
window.PoznoteProfileI18n = <?php echo json_encode($iconSidebarProfileStrings, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>;
</script>
<script src="<?php echo $iconSidebarAsset('js/profile.js'); ?>" defer></script>
<script src="<?php echo $iconSidebarAsset('js/page-title-workspace-menu.js'); ?>" defer></script>
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
    <div class="icon-sidebar-scroll">
    <?php foreach ($iconSidebarItems as $iconSidebarItem): ?>
    <?php if (!empty($iconSidebarItem['divider'])): ?>
    <!-- Group separator. js/icon-sidebar-toggle.js hides it when the entries
         on one side of it are all hidden (UI Customization, git scope). -->
    <div class="icon-sidebar-divider" role="separator"></div>
    <?php continue; ?>
    <?php endif; ?>
    <?php
    $iconSidebarLabel = htmlspecialchars($iconSidebarItem['label'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $iconSidebarIcon = htmlspecialchars($iconSidebarItem['icon'], ENT_QUOTES, 'UTF-8');
    // Only the navigation entries carry a 'page'; the extras never highlight.
    $iconSidebarIsCurrent = isset($iconSidebarItem['page']) && $iconSidebarItem['page'] === $iconSidebarCurrentPage;
    $iconSidebarClass = 'icon-sidebar-btn' . ($iconSidebarIsCurrent ? ' icon-sidebar-btn-active' : '');
    ?>
    <?php if (isset($iconSidebarItem['gitAction'])): ?>
    <button type="button" id="<?php echo $iconSidebarItem['id']; ?>" class="<?php echo $iconSidebarClass; ?>" data-icon-sidebar-git-action="<?php echo htmlspecialchars($iconSidebarItem['gitAction'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $iconSidebarLabel; ?>" aria-label="<?php echo $iconSidebarLabel; ?>"<?php echo !empty($iconSidebarItem['hidden']) ? ' hidden' : ''; ?>>
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
    </div>
    <!-- Overflow: hidden until js/icon-sidebar-toggle.js finds entries the rail
         is too short to show, then lists them in #iconSidebarOverflowMenu. -->
    <button type="button" id="iconSidebarOverflowBtn" class="icon-sidebar-btn" title="<?php echo $iconSidebarOverflowLabel; ?>" aria-label="<?php echo $iconSidebarOverflowLabel; ?>" aria-haspopup="true" aria-expanded="false" aria-controls="iconSidebarOverflowMenu">
        <i class="lucide lucide-more-horizontal"></i>
    </button>
    <!-- Account group: fixed under the divider, never scrolls. -->
    <div class="icon-sidebar-bottom">
    <?php foreach ($iconSidebarBottomItems as $iconSidebarItem): ?>
    <?php
    $iconSidebarLabel = htmlspecialchars($iconSidebarItem['label'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $iconSidebarIcon = htmlspecialchars($iconSidebarItem['icon'], ENT_QUOTES, 'UTF-8');
    // 'activeFlag' covers the entries that share a page and split the highlight
    // by query string (Settings vs About); the rest match on 'page'.
    $iconSidebarIsCurrent = isset($iconSidebarItem['activeFlag'])
        ? (bool)$iconSidebarItem['activeFlag']
        : (isset($iconSidebarItem['page']) && $iconSidebarItem['page'] === $iconSidebarCurrentPage);
    $iconSidebarClass = 'icon-sidebar-btn' . ($iconSidebarIsCurrent ? ' icon-sidebar-btn-active' : '');
    ?>
    <?php if (!empty($iconSidebarItem['themeToggle'])): ?>
    <button type="button" id="<?php echo $iconSidebarItem['id']; ?>" class="<?php echo $iconSidebarClass; ?>" data-theme-toggle title="<?php echo $iconSidebarLabel; ?>" aria-label="<?php echo $iconSidebarLabel; ?>">
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
    </div>
</nav>
<!-- Filled in and positioned by js/icon-sidebar-toggle.js. Outside the rail,
     which is overflow:hidden and would clip it. -->
<div id="iconSidebarOverflowMenu" role="menu" aria-labelledby="iconSidebarOverflowBtn"></div>
<!-- Sits outside #icon_sidebar so it stays clickable once the rail is hidden. -->
<button type="button" id="iconSidebarToggle" title="<?php echo $iconSidebarToggleLabel; ?>" aria-label="<?php echo $iconSidebarToggleLabel; ?>" aria-expanded="true" aria-controls="icon_sidebar">
    <i class="lucide lucide-chevron-left"></i>
</button>
