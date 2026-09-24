<?php
/**
 * Settings frame, shared by settings.php and every page it opens.
 *
 * Opening Git Sync, the AI assistant, the backups or an admin tool used to
 * leave the Settings interface for a page with a layout of its own (discussion
 * #1378). Those pages now render inside the same frame as settings.php: the
 * Settings title, then on wide screens the filter field and the section list
 * on the left, their own content taking the place of a section on the right,
 * under a title that links back to the section they belong to. Moving between
 * a section and one of its pages no longer changes the surroundings.
 *
 * settings.php draws the title and the left column through
 * poznoteRenderSettingsTitle() and poznoteRenderSettingsSidebar(); the pages
 * wrap their content in poznoteSettingsShellOpen() / poznoteSettingsShellClose().
 * Styles: css/settings.css (.settings-shell), which every one of them loads.
 */

/**
 * The sections of settings.php, in page order. The key is the id of the
 * section's card grid, which is also what the list, the #hash deep links and
 * the saved choice use.
 */
function poznoteSettingsSections(): array
{
    $isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
    $sections = [
        ['key' => 'settings-pinned-section-grid', 'icon' => 'lucide-pin', 'label' => t('settings.categories.pinned', [], 'Pinned')],
        ['key' => 'settings-account-section-grid', 'icon' => 'lucide-user', 'label' => t('settings.categories.account', [], 'My Account')],
        ['key' => 'settings-actions-section-grid', 'icon' => 'lucide-zap', 'label' => t('settings.categories.actions', [], 'Actions')],
        ['key' => 'settings-display-section-grid', 'icon' => 'lucide-monitor', 'label' => t('settings.categories.display', [], 'Display')],
        ['key' => 'settings-ui-customization-section-grid', 'icon' => 'lucide-eye-off', 'label' => t('settings.categories.ui_customization', [], 'Element visibility')],
        ['key' => 'settings-sidebar-section-grid', 'icon' => 'lucide-panel-left', 'label' => t('settings.categories.sidebar', [], 'Sidebar')],
        ['key' => 'settings-note-content-section-grid', 'icon' => 'lucide-file-text', 'label' => t('settings.categories.note_content', [], 'Note content')],
        ['key' => 'settings-markdown-section-grid', 'icon' => 'lucide-file-code', 'label' => t('settings.categories.markdown', [], 'Markdown')],
        ['key' => 'settings-diary-section-grid', 'icon' => 'lucide-book-open', 'label' => t('settings.categories.diary', [], 'Diary')],
    ];
    if ($isAdmin) {
        $sections[] = ['key' => 'admin-tools-grid', 'icon' => 'lucide-wrench', 'label' => t('settings.categories.admin_tools', [], 'Admin Tools')];
    }
    $sections[] = ['key' => 'settings-documentation-section-grid', 'icon' => 'lucide-info', 'label' => t('settings.categories.documentation', [], 'About')];
    return $sections;
}

/** Label of a section, for the title of the pages that belong to it. */
function poznoteSettingsSectionLabel(string $key): string
{
    foreach (poznoteSettingsSections() as $section) {
        if ($section['key'] === $key) {
            return $section['label'];
        }
    }
    return t('settings.title', [], 'Settings');
}

/**
 * URL of settings.php from the page being rendered, keeping the workspace and
 * opening the given section.
 */
function poznoteSettingsHref(string $basePath, string $workspace, string $section = ''): string
{
    $workspace = trim($workspace);
    if ($workspace === '__last_opened__') {
        $workspace = '';
    }
    return $basePath . 'settings.php'
        . ($workspace !== '' ? '?workspace=' . rawurlencode($workspace) : '')
        // #section=<key> rather than #<key>: a fragment naming the grid's
        // id would make the browser scroll to it, past the title.
        . ($section !== '' ? '#section=' . rawurlencode($section) : '');
}

/** "Settings" title with the signed-in user, above the frame. */
function poznoteRenderSettingsTitle(): void
{
    $user = function_exists('getCurrentUser') ? getCurrentUser() : null;
    ?>
        <h1 class="poznote-page-title">
            <i class="lucide lucide-settings"></i> <?php echo t_h('settings.title', [], 'Settings'); ?>
            <span id="settings-current-user-badge" class="settings-current-user-badge"><i class="lucide lucide-user"></i> <?php echo htmlspecialchars((string)($user['username'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></span>
        </h1>
    <?php
}

/**
 * Left column of the frame: the filter field, then the section list.
 *
 * On settings.php ($opts['page'] = true) the list selects a section in place
 * (js/settings-page.js), the filter filters the cards, and the button that
 * folds every section is added for the stacked layout of narrow screens. On
 * the pages it opens, the entries are links to their section, and typing in
 * the filter carries the term over to settings.php.
 *
 * $opts: basePath ('../' under admin/), workspace, page (bool), active (key of
 * the section to highlight).
 */
function poznoteRenderSettingsSidebar(array $opts = []): void
{
    $basePath = (string)($opts['basePath'] ?? '');
    $workspace = (string)($opts['workspace'] ?? '');
    $isPage = !empty($opts['page']);
    $active = (string)($opts['active'] ?? '');

    // The Pinned entry: settings.php shows or hides it as pins come and go;
    // elsewhere the saved list says whether there is anything to open.
    $hasPins = false;
    if (!$isPage && function_exists('getSetting')) {
        $pins = json_decode((string)getSetting('settings_pinned_cards', ''), true);
        $hasPins = is_array($pins) && count($pins) > 0;
    }
    ?>
        <aside class="settings-sidebar">
            <div class="settings-filter-row">
                <div class="home-search-wrapper">
                    <i class="lucide lucide-search home-search-icon"></i>
                    <input type="text" id="home-search-input" class="home-search-input" placeholder="<?php echo t_h('home.filter_placeholder', [], 'Filter...'); ?>" autocomplete="off"<?php echo $isPage ? '' : ' data-settings-href="' . htmlspecialchars(poznoteSettingsHref($basePath, $workspace), ENT_QUOTES, 'UTF-8') . '"'; ?>>
                    <button type="button" id="home-search-clear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
                        <i class="lucide lucide-x"></i>
                    </button>
                </div>
                <?php if ($isPage): ?>
                <!-- Collapse/expand every section at once. Only useful in the
                     stacked mobile layout: the desktop list shows one section
                     at a time, so css/settings.css hides this button there. -->
                <button type="button" id="settingsCollapseAll" class="settings-collapse-all"
                    data-label-collapse="<?php echo t_h('settings.collapse_all_sections', [], 'Collapse all'); ?>"
                    data-label-expand="<?php echo t_h('settings.expand_all_sections', [], 'Expand all'); ?>">
                    <i class="lucide lucide-chevron-down"></i>
                </button>
                <?php endif; ?>
            </div>
            <nav id="settings-nav" class="settings-nav" aria-label="<?php echo t_h('settings.title', [], 'Settings'); ?>">
                <?php foreach (poznoteSettingsSections() as $section):
                    $key = $section['key'];
                    $isActive = $key === $active;
                    $hidden = $key === 'settings-pinned-section-grid' && ($isPage || !$hasPins);
                ?>
                <a class="settings-nav-item<?php echo $isActive ? ' is-active' : ''; ?>" data-section="<?php echo htmlspecialchars($key, ENT_QUOTES, 'UTF-8'); ?>"
                   href="<?php echo htmlspecialchars(poznoteSettingsHref($basePath, $workspace, $key), ENT_QUOTES, 'UTF-8'); ?>"<?php echo $isActive ? ' aria-current="true"' : ''; ?><?php echo $hidden ? ' hidden' : ''; ?>>
                    <i class="lucide <?php echo htmlspecialchars($section['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i>
                    <span class="settings-nav-label"><?php echo htmlspecialchars($section['label'], ENT_QUOTES, 'UTF-8'); ?></span>
                    <?php if ($key === 'settings-documentation-section-grid'): ?>
                    <!-- Revealed by js/utils-updates.js with every .update-badge
                         when a release is out: the Version card sits in About,
                         out of sight while another section is open. -->
                    <span class="update-badge update-badge-inline update-badge-hidden"></span>
                    <?php endif; ?>
                </a>
                <?php endforeach; ?>
            </nav>
            <?php if (!$isPage): ?>
            <script>
            // Sections that have nothing to show on settings.php (every card
            // hidden through Element visibility) are left out of its list;
            // js/settings-page.js records which, so this copy matches. The
            // filter carries its term over to settings.php.
            (function () {
                var nav = document.currentScript.parentNode.querySelector('.settings-nav');
                try {
                    var store = window.__poznoteUserStorage || window.localStorage;
                    var hidden = JSON.parse(store.getItem('settingsNavHiddenSections') || '[]');
                    if (Array.isArray(hidden)) {
                        hidden.forEach(function (key) {
                            var item = nav.querySelector('[data-section="' + key + '"]');
                            if (item && !item.classList.contains('is-active')) item.hidden = true;
                        });
                    }
                } catch (e) { /* storage unavailable */ }
                // Once typing pauses (or on Enter), and only once: a
                // navigation per keystroke cancelled the previous one and lost
                // the letters typed meanwhile.
                var filter = document.getElementById('home-search-input');
                if (filter) {
                    var timer = null;
                    var leaving = false;
                    var carry = function () {
                        var term = filter.value.trim();
                        if (term === '' || leaving) return;
                        leaving = true;
                        var href = filter.getAttribute('data-settings-href') || 'settings.php';
                        window.location = href + (href.indexOf('?') === -1 ? '?' : '&') + 'q=' + encodeURIComponent(term);
                    };
                    filter.addEventListener('input', function () {
                        clearTimeout(timer);
                        timer = setTimeout(carry, 400);
                    });
                    filter.addEventListener('keydown', function (e) {
                        if (e.key === 'Enter') {
                            clearTimeout(timer);
                            carry();
                        }
                    });
                }
            })();
            </script>
            <?php endif; ?>
        </aside>
    <?php
}

/**
 * Opens the frame around a page reached from settings.php.
 *
 * $opts:
 *   section    key of the section the page belongs to (poznoteSettingsSections)
 *   title      page title, plain text
 *   basePath   '../' for the pages under admin/
 *   workspace  workspace to keep in the links (defaults to the current filter)
 *   wide       true for the pages built around a wide table: the frame then
 *              takes the whole window instead of the settings.php width
 *   panel      true to set the page's content in a panel, the way a section
 *              shows its rows. Off by default: the pages are made of framed
 *              blocks already (sections, cards, tables), and a frame around
 *              frames adds nothing. User Management turns it on.
 *
 * The title links back to the section, or to the AI assistant for the AI
 * settings opened from its panel (?from=ai-chat, see ai_chat_panel.php).
 */
function poznoteSettingsShellOpen(array $opts): void
{
    $basePath = (string)($opts['basePath'] ?? '');
    $section = (string)($opts['section'] ?? '');
    $workspace = isset($opts['workspace'])
        ? (string)$opts['workspace']
        : (function_exists('getWorkspaceFilter') ? (string)getWorkspaceFilter() : '');
    $workspace = trim($workspace) === '__last_opened__' ? '' : trim($workspace);

    if (($_GET['from'] ?? '') === 'ai-chat') {
        // The panel lives on the notes page and on the dashboard;
        // ai_chat_panel.php adds back=dashboard when it was opened from the
        // latter. ?ai_chat=1 makes js/ai-chat.js open the panel on arrival.
        $backPage = (($_GET['back'] ?? '') === 'dashboard') ? 'dashboard.php' : 'index.php';
        $backHref = $basePath . $backPage . '?ai_chat=1' . ($workspace !== '' ? '&workspace=' . rawurlencode($workspace) : '');
        $backLabel = t('ai_chat.back_to_assistant', [], 'Back to AI Assistant');
        $backFixed = true;
    } else {
        $backHref = poznoteSettingsHref($basePath, $workspace, $section);
        $backLabel = poznoteSettingsSectionLabel($section);
        $backFixed = false;
    }
    ?>
    <div class="settings-shell settings-subpage<?php echo !empty($opts['wide']) ? ' settings-shell-wide' : ''; ?>">
        <?php poznoteRenderSettingsTitle(); ?>
        <div class="settings-layout">
            <?php poznoteRenderSettingsSidebar(['basePath' => $basePath, 'workspace' => $workspace, 'active' => $section]); ?>
            <div class="settings-content">
                <h2 class="settings-category-title settings-subpage-title">
                    <a class="settings-subpage-back" href="<?php echo htmlspecialchars($backHref, ENT_QUOTES, 'UTF-8'); ?>"<?php echo $backFixed ? ' data-fixed="1"' : ''; ?>>
                        <i class="lucide lucide-arrow-left"></i>
                        <span class="settings-subpage-back-label"><?php echo htmlspecialchars($backLabel, ENT_QUOTES, 'UTF-8'); ?></span>
                    </a>
                    <i class="lucide lucide-chevron-right settings-subpage-separator" aria-hidden="true"></i>
                    <span class="settings-subpage-name"><?php echo htmlspecialchars((string)($opts['title'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></span>
                </h2>
                <script>
                // Back to where the page was opened from: js/settings-page.js
                // notes the section on display when it follows a card (Pinned,
                // or the filter results), which may not be the page's own.
                (function () {
                    var back = document.currentScript.parentNode.querySelector('.settings-subpage-back');
                    if (!back || back.hasAttribute('data-fixed')) return;
                    try {
                        var from = window.sessionStorage.getItem('settingsReturnSection');
                        var item = from ? document.querySelector('.settings-nav-item[data-section="' + from + '"]') : null;
                        if (!item) return;
                        back.href = item.href;
                        var label = back.querySelector('.settings-subpage-back-label');
                        var itemLabel = item.querySelector('.settings-nav-label');
                        if (label && itemLabel) label.textContent = itemLabel.textContent;
                    } catch (e) { /* storage unavailable */ }
                })();
                </script>
                <div class="settings-subpage-body<?php echo empty($opts['panel']) ? ' settings-subpage-bare' : ''; ?>">
    <?php
}

/** Closes what poznoteSettingsShellOpen() opened. */
function poznoteSettingsShellClose(): void
{
    ?>
                </div>
            </div>
        </div>
    </div>
    <?php
}
