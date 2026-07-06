<?php

// Show PHP errors in the browser only when POZNOTE_DEBUG is enabled;
// production instances log them instead of exposing paths and internals.
$poznoteDebug = filter_var($_ENV['POZNOTE_DEBUG'] ?? (getenv('POZNOTE_DEBUG') ?: '0'), FILTER_VALIDATE_BOOL);
ini_set('display_errors', $poznoteDebug ? '1' : '0');
ini_set('display_startup_errors', $poznoteDebug ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Load functions to get ALLOWED_IFRAME_DOMAINS
require_once 'functions.php';

// Build CSP frame-src directive from allowed domains
$frameSrcDomains = "'self'";
foreach (ALLOWED_IFRAME_DOMAINS as $domain) {
    $frameSrcDomains .= " https://{$domain}";
}

// Set security headers to mitigate XSS attacks
// Content-Security-Policy: Restrict where scripts can be loaded from
// Note: 'unsafe-inline' is needed for the rich text editor, but we sanitize all user input
// to prevent XSS. In the future, consider using nonces for inline scripts.
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src {$frameSrcDomains}; frame-ancestors 'self'; form-action 'self';");

// X-XSS-Protection: explicitly disabled — the legacy browser filter is deprecated
// and could itself introduce vulnerabilities; the CSP above handles XSS mitigation
header("X-XSS-Protection: 0");

// X-Content-Type-Options: Prevent MIME type sniffing
header("X-Content-Type-Options: nosniff");

// X-Frame-Options: Prevent clickjacking
header("X-Frame-Options: SAMEORIGIN");

// Referrer-Policy: Control referrer information
header("Referrer-Policy: strict-origin-when-cross-origin");

// Authentication check
require_once 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'version_helper.php';

require_once 'db_connect.php';

// Include new modular files
require_once 'page_init.php';
require_once 'search_handler.php';
require_once 'note_loader.php';
require_once 'favorites_handler.php';
require_once 'folders_display.php';

// GitHub Sync Logic
require_once 'GitSync.php';
$gitSync = new GitSync($con, $_SESSION['user_id'] ?? null);
$gitEnabled = GitSync::isEnabled() && $gitSync->isConfigured();
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$showGitSync = $gitEnabled; // All users with configured git can sync
$gitProvider = function_exists('getGitProviderName') ? getGitProviderName($gitSync->getProvider()) : 'Git';

// Resolve the workspace when no parameter is present, without redirecting
// (a redirect costs a full extra round trip: auth + db_connect run twice).
// A replaceState snippet in <head> reflects the resolved workspace in the
// URL so client scripts that read it from location.search keep working.
$workspaceResolvedInternally = null;
if (!isset($_GET['workspace']) && !isset($_POST['workspace'])) {
    // Use getWorkspaceFilter() which handles the full priority logic:
    // 1. default_workspace if set to a specific workspace
    // 2. last_opened_workspace from database
    // 3. First available workspace as fallback
    $resolvedWorkspace = getWorkspaceFilter();

    if ($resolvedWorkspace && $resolvedWorkspace !== '') {
        $_GET['workspace'] = $resolvedWorkspace;
        $workspaceResolvedInternally = $resolvedWorkspace;
    }
}

// Save the currently opened workspace to database for "last opened" feature
if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
    saveLastOpenedWorkspace($_GET['workspace']);
}

// Initialization of workspaces and labels
initializeWorkspacesAndLabels($con);

// Initialize search parameters (explicit assignments; these variables are
// also used by the included templates such as notes_list.php)
$search_request = initializeSearchParams();
$search = $search_request['search'];
$tags_search = $search_request['tags_search'];
$created_from = $search_request['created_from'];
$created_to = $search_request['created_to'];
$note = $search_request['note'];
$folder_filter = $search_request['folder_filter'];
$workspace_filter = $search_request['workspace_filter'];
$preserve_notes = $search_request['preserve_notes'];
$preserve_tags = $search_request['preserve_tags'];
$search_combined = $search_request['search_combined'];

// Display workspace name (simplified logic)
$displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);

// Load note-related data (res_right, default/current note folders)
// Ensure these variables exist for included templates
$note_load_result = loadNoteData($con, $note, $workspace_filter);
$default_note_folder = $note_load_result['default_note_folder'] ?? null;
$current_note_folder = $note_load_result['current_note_folder'] ?? null;
$res_right = $note_load_result['res_right'] ?? null;

$notifications_count = 0;
try {
    if (isset($con)) {
        if (!empty($workspace_filter)) {
            $stmtNotif = $con->prepare("
                SELECT COUNT(*) as cnt
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.is_read = 0 AND n.dismissed = 0 AND n.trigger_at <= datetime('now')
                  AND e.workspace = ?
            ");
            $stmtNotif->execute([$workspace_filter]);
        } else {
            $stmtNotif = $con->prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0 AND dismissed = 0 AND trigger_at <= datetime('now')");
            $stmtNotif->execute();
        }
        $notifications_count = (int)$stmtNotif->fetchColumn();
    }
} catch (Exception $e) {
    error_log('index: notifications count query failed: ' . $e->getMessage());
    $notifications_count = 0;
}

// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Load all required settings in a single query for better performance
$settings = [
    'note_font_size' => '15',
    'sidebar_font_size' => '13',
    'center_note_content' => '0',
    'show_note_created' => false,
    'show_note_icons' => '1',
    'hide_folder_actions' => null,
    'hide_folder_counts' => null,
    'note_list_sort' => 'updated_desc',
    'notes_without_folders_after_folders' => '1',
    'code_block_word_wrap' => '1',
    'markdown_split_card_view' => '1',
    'attachment_previews_in_note' => '0',
    'attachments_at_bottom' => '0',
    'backlinks_at_bottom' => '0',
    'default_image_border_no_padding' => '0',
    'spellcheck_html_notes' => '0'
];

try {
    $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('note_font_size', 'sidebar_font_size', 'center_note_content', 'show_note_created', 'show_note_icons', 'hide_folder_actions', 'hide_folder_counts', 'note_list_sort', 'notes_without_folders_after_folders', 'code_block_word_wrap', 'markdown_split_card_view', 'attachment_previews_in_note', 'attachments_at_bottom', 'backlinks_at_bottom', 'default_image_border_no_padding', 'spellcheck_html_notes')");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $settings[$row['key']] = $row['value'];
    }
} catch (Exception $e) {
    // Use defaults if error
    error_log('index: settings query failed, using defaults: ' . $e->getMessage());
}

// Extract settings with proper defaults
$note_font_size = $settings['note_font_size'];
$sidebar_font_size = ($settings['sidebar_font_size'] !== '' && $settings['sidebar_font_size'] !== null) ? $settings['sidebar_font_size'] : '13';

// Calculate note max width; center_note_content stores '0'/'1'/'true' or a custom width in px
$width_value = $settings['center_note_content'];
$center_note_content_enabled = poznoteSettingEnabled($width_value, false);
$note_max_width = '800';
if ($center_note_content_enabled && $width_value !== '1' && $width_value !== 'true') {
    $note_max_width = $width_value;
}

$isPublicWorkspaceReadonly = function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive();

?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars(getUserLanguage(), ENT_QUOTES); ?>">

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, interactive-widget=resizes-content"/>
    <title><?php echo getPageTitle(); ?></title>
    <?php 
    // Cache version based on app version plus theme assets to force reload on theme changes
    $v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
    ?>
    <meta name="theme-color" content="#111827">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Poznote">
    <link rel="manifest" href="pwa/manifest.webmanifest?v=<?php echo $v; ?>" crossorigin="use-credentials">
    <link rel="icon" href="favicon.ico" sizes="512x512" type="image/png">
    <link rel="apple-touch-icon" href="pwa/poznote.png?v=<?php echo $v; ?>">
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <?php if ($workspaceResolvedInternally !== null): ?>
    <script>
        // The workspace was resolved server-side without a redirect; reflect
        // it in the URL for scripts that read it from location.search.
        (function () {
            try {
                var url = new URL(window.location.href);
                if (!url.searchParams.has('workspace')) {
                    url.searchParams.set('workspace', <?php echo json_encode($workspaceResolvedInternally, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>);
                    history.replaceState(history.state, '', url);
                }
            } catch (_error) {}
        })();
    </script>
    <?php endif; ?>
    <script>
        (function () {
            try {
                var isDesktop = window.innerWidth > 800;
                var storedCollapsed = localStorage.getItem('outlineCollapsed');
                var shouldCollapseOutline = isDesktop && (storedCollapsed === null || storedCollapsed === 'true');

                if (shouldCollapseOutline) {
                    document.documentElement.classList.add('outline-collapsed');
                }
            } catch (_error) {
                // Ignore localStorage access errors during early paint.
            }
        })();
    </script>
    <script src="pwa/pwa.js?v=<?php echo $v; ?>" defer></script>
    <script>window.ALLOWED_IFRAME_DOMAINS = <?php echo json_encode(ALLOWED_IFRAME_DOMAINS); ?>;</script>
    <meta name="color-scheme" content="dark light">
    <!-- Modular CSS served as two concatenated bundles (see index_css.php).
         css/index-mobile.css stays a separate media-scoped link between the two
         groups to preserve the cascade order of the original stylesheets. -->
    <link type="text/css" rel="stylesheet" href="index_css.php?group=core&v=<?php echo $v; ?>"/>
    <link rel="stylesheet" href="css/index-mobile.css?v=<?php echo $v; ?>" media="(max-width: 800px)">
    <link type="text/css" rel="stylesheet" href="index_css.php?group=modals&v=<?php echo $v; ?>"/>
    <!-- Dark-mode stylesheets are served concatenated (same order as the css/dark-mode/ sources) -->
    <link type="text/css" rel="stylesheet" href="dark_mode_css.php?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="js/katex/katex.min.css?v=<?php echo $v; ?>"/>
    <style>:root { --note-font-size: <?php echo htmlspecialchars($note_font_size, ENT_QUOTES); ?>px; --sidebar-font-size: <?php echo htmlspecialchars($sidebar_font_size, ENT_QUOTES); ?>px; --note-max-width: <?php echo htmlspecialchars($note_max_width, ENT_QUOTES); ?>px; }</style>
    <?php poznoteRenderUiCustomizationBootstrap(); ?>
    <!-- Editor/toolbar modules served as one concatenated deferred bundle
         (see index_js.php). The js/*.js files stay the source of truth. -->
    <script defer src="index_js.php?group=head&v=<?php echo $v; ?>"></script>
    <script defer src="js/codemirror-dist/markdown-codemirror.iife.js?v=<?php echo $v; ?>"></script>
    <!-- Mermaid (2.7 MB) and KaTeX are loaded on demand by js/lazy-libs.js, only
         when a note actually contains a diagram or a math element -->
    <script defer src="js/lazy-libs.js?v=<?php echo $v; ?>"></script>
    <link type="text/css" rel="stylesheet" href="css/syntax-highlight.css?v=<?php echo $v; ?>"/>
    <script defer src="js/highlight/highlight.min.js?v=<?php echo $v; ?>"></script>
    <script defer src="js/highlight/powershell.min.js?v=<?php echo $v; ?>"></script>
    <script defer src="js/syntax-highlight.js?v=<?php echo $v; ?>"></script>

</head>

<?php
// Build body classes from previously loaded settings
$extra_body_classes = '';
$show_note_created_setting = poznoteSettingEnabled($settings['show_note_created'], false);
$show_note_icons_setting = poznoteSettingEnabled($settings['show_note_icons'], true);
if ($show_note_created_setting) {
    $extra_body_classes .= ' show-note-created';
}
if (poznoteSettingEnabled($settings['hide_folder_actions'], true)) {
    $extra_body_classes .= ' folder-actions-always-visible';
}
if (!poznoteSettingEnabled($settings['hide_folder_counts'], true)) {
    $extra_body_classes .= ' hide-folder-counts';
}
if ($center_note_content_enabled) {
    $extra_body_classes .= ' center-note-content';
}
if (!poznoteSettingEnabled($settings['code_block_word_wrap'], true)) {
    $extra_body_classes .= ' code-block-no-wrap';
}
if (poznoteSettingEnabled($settings['markdown_split_card_view'], true)) {
    $extra_body_classes .= ' markdown-split-card-view';
}
$attachment_previews_in_note_setting = poznoteSettingEnabled($settings['attachment_previews_in_note'], false);
$attachments_at_bottom_setting = poznoteSettingEnabled($settings['attachments_at_bottom'], false);
$backlinks_at_bottom_setting = poznoteSettingEnabled($settings['backlinks_at_bottom'], false);
// Load note list sort preference using previously loaded settings
$note_list_sort_type = 'updated_desc'; // default
$pref = $settings['note_list_sort'];
$notes_without_folders_after = poznoteSettingEnabled($settings['notes_without_folders_after_folders'], true);

$folder_null_case = $notes_without_folders_after ? '1' : '0';
$folder_case = $notes_without_folders_after ? '0' : '1';

$allowed_sorts = [
    'updated_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, updated DESC",
    'created_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, created DESC",
    'heading_asc'  => "folder, heading COLLATE NOCASE ASC"
];

$note_list_order_by = $allowed_sorts['updated_desc']; // default
if ($pref && isset($allowed_sorts[$pref])) {
    $note_list_order_by = $allowed_sorts[$pref];
    $note_list_sort_type = $pref;
}

// Set body classes
$body_classes = trim($extra_body_classes);
if ($isPublicWorkspaceReadonly) {
    $body_classes = trim($body_classes . ' public-workspace-readonly');
}
?>

<body<?php echo $body_classes ? ' class="' . htmlspecialchars($body_classes, ENT_QUOTES) . '"' : ''; ?> data-workspace="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
    <script>
    (function () {
        try {
            if (!window.sessionStorage || sessionStorage.getItem('poznote_create_page_loading') !== '1') {
                return;
            }

            document.body.classList.add('note-creation-is-loading');

            if (document.getElementById('note-creation-loading-modal')) {
                return;
            }

            var modal = document.createElement('div');
            modal.id = 'note-creation-loading-modal';
            modal.className = 'note-creation-loading-modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-label', <?php echo json_encode(t('common.loading', [], 'Loading...'), JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>);

            var dialog = document.createElement('div');
            dialog.className = 'note-creation-loading-dialog';

            var content = document.createElement('div');
            content.className = 'note-creation-loading-content';
            content.setAttribute('role', 'status');
            content.setAttribute('aria-live', 'polite');

            var icon = document.createElement('i');
            icon.className = 'lucide lucide-loader-2 lucide-spin';
            icon.setAttribute('aria-hidden', 'true');

            var label = document.createElement('span');
            label.textContent = <?php echo json_encode(t('common.loading', [], 'Loading...'), JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>;

            content.appendChild(icon);
            content.appendChild(label);
            dialog.appendChild(content);
            modal.appendChild(dialog);
            document.body.appendChild(modal);
        } catch (error) {}
    })();
    </script>
    <div id="save-indicator" class="save-indicator" style="display: none;">
        <i class="lucide lucide-save"></i>
    </div>
    
    <!-- Global configuration (CSP compliant) -->
    <script type="application/json" id="poznote-config"><?php
        echo json_encode([
            'gitSyncAutoPush' => ($showGitSync && $gitSync->isAutoPushEnabled()),
            'dateTimeFormat' => getUserDateTimeFormat(),
            'inlineAttachmentPreviews' => $attachment_previews_in_note_setting,
            'attachmentsAtBottom' => $attachments_at_bottom_setting,
            'backlinksAtBottom' => $backlinks_at_bottom_setting,
            'defaultImageBorderNoPadding' => poznoteSettingEnabled($settings['default_image_border_no_padding'], false)
        ], JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?: '{}';
    ?></script>
    <!-- js/error-handler.js is bundled as the first file of index_js.php?group=app -->

    <!-- Workspace data for JavaScript (CSP compliant) -->
    <script type="application/json" id="workspace-display-map-data"><?php
        $display_map = generateWorkspaceDisplayMap($workspaces, $labels);
        echo json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?: '{}';
    ?></script>
    <?php if ($workspace_filter === '__last_opened__'): ?>
    <script type="application/json" id="workspace-last-opened-flag">true</script>
    <?php endif; ?>

    <?php include 'modals.php'; ?>
    
    <!-- LEFT COLUMN -->	
    <div id="left_col">
        
    <?php
    // Construction des conditions de recherche sécurisées
    $search_conditions = buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $search_combined, $created_from, $created_to);
    $where_clause = $search_conditions['where_clause'];
    $sql_params = $search_conditions['search_params'];
    appendNoteAgeFilter($where_clause, $sql_params, getNoteAgeFilterDays($con));
    
    // Secure prepared queries
    $query_left_secure = "SELECT id, heading, folder, folder_id, favorite, created, updated, type, linked_note_id, icon, icon_color FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    ?>

        
    <!-- MENU RIGHT COLUMN -->	 
    <div class="sidebar-header">
        <div class="sidebar-title-row">
            <div class="sidebar-title" role="button" tabindex="0" data-action="toggle-workspace-menu">
                <img src="favicon.ico" class="workspace-title-icon" alt="Poznote" aria-hidden="true">
                <span class="workspace-title-text"><?php echo htmlspecialchars($displayWorkspace, ENT_QUOTES); ?></span>
                <i class="lucide lucide-caret-down workspace-dropdown-icon"></i>
            </div>
            <div class="sidebar-title-actions">
                <?php if (!$isPublicWorkspaceReadonly): ?>
                    <button class="sidebar-folder-toggle" data-action="toggle-all-folders" title="<?php echo t_h('sidebar.expand_all_folders', [], 'Expand all folders'); ?>" aria-label="<?php echo t_h('sidebar.expand_all_folders', [], 'Expand all folders'); ?>">
                        <i class="lucide lucide-chevron-down"></i>
                    </button>
                    <button class="sidebar-home<?php echo $notifications_count > 0 ? ' has-notifications-dot' : ''; ?>" data-action="navigate-to-home" title="<?php echo t_h('sidebar.home', [], 'Dashboard'); ?>">
                        <i class="lucide lucide-layout-dashboard"></i>
                        <span class="sidebar-notifications-dot" aria-hidden="true"></span>
                    </button>
                    <button class="sidebar-settings" data-action="navigate-to-settings" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>">
                        <i class="lucide lucide-settings"></i>
                        <span class="update-badge update-badge-hidden"></span>
                    </button>
                    <button class="sidebar-plus" data-action="toggle-create-menu" title="<?php echo t_h('sidebar.create'); ?>">
                        <i class="lucide lucide-plus-circle"></i>
                    </button>
                <?php else: ?>
                    <button type="button" id="publicWorkspaceThemeToggle" class="sidebar-plus public-workspace-theme-toggle" title="<?php echo t_h('theme.toggle', [], 'Toggle theme'); ?>" aria-label="<?php echo t_h('theme.toggle', [], 'Toggle theme'); ?>">
                        <i class="lucide lucide-moon"></i>
                    </button>
                <?php endif; ?>
            </div>

            <div class="workspace-menu" id="workspaceMenu"></div>
        </div>
    </div>
        
    <?php
        // Determine which folders should be open
        $has_created_date_filter = !empty($created_from) || !empty($created_to);
        $is_search_mode = !empty($search) || !empty($tags_search) || $has_created_date_filter;
        
        // Execute query for right column - only override if in search mode
        if ($is_search_mode) {
            $res_right = prepareSearchResults($con, $is_search_mode, $note, $where_clause, $sql_params, $workspace_filter);
        }
    ?>

    <!-- Page configuration data (CSP compliant) -->
    <script type="application/json" id="page-config-data"><?php 
        $currentWorkspaceOpacityKey = 'background_opacity_' . (string)($workspace_filter ?? '');
        $config_data = [
            'isSearchMode' => $is_search_mode,
            'currentNoteFolder' => null, // Will be set below
            'selectedWorkspace' => $workspace_filter ?? '',
            'userId' => $_SESSION['user_id'] ?? null,
            'userEntriesPath' => "data/users/{$_SESSION['user_id']}/entries/",
            'defaultNoteSortType' => $note_list_sort_type,
            'isAdmin' => function_exists('isCurrentUserAdmin') && isCurrentUserAdmin(),
            'isPublicWorkspaceAccess' => $isPublicWorkspaceReadonly,
            'canUseSettingsApi' => !function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser(),
            'settings' => [
                'emoji_icons_enabled' => getSetting('emoji_icons_enabled', '1'),
                $currentWorkspaceOpacityKey => getSetting($currentWorkspaceOpacityKey, '25')
            ]
        ];
        if ($note != '') {
            $config_data['currentNoteFolder'] = $current_note_folder ?? '';
        } else if (isset($default_note_folder) && $default_note_folder) {
            $config_data['currentNoteFolder'] = $default_note_folder;
        }
        echo json_encode($config_data, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
    ?></script>
                    
    <?php
        // Execute query for left column
        $stmt_left = $con->prepare($query_left_secure);
        $stmt_left->execute($sql_params);
        
        // Group notes by folder for hierarchical display (now uses folder_id)
        $organized = organizeNotesByFolder($stmt_left, $con, $workspace_filter, $note_list_sort_type);
        $folders = $organized['folders'];
        $uncategorized_notes = $organized['uncategorized_notes'];
        
        // Handle favorites (including uncategorized notes)
        $folders = handleFavorites($folders, $uncategorized_notes);
        
        // Track folders with search results for favorites
        $folders_with_results = [];
        if($is_search_mode) {
            foreach($folders as $folderId => $folderData) {
                if (!empty($folderData['notes'])) {
                    $folders_with_results[$folderData['name']] = true;
                }
            }
            $folders_with_results = updateFavoritesSearchResults($folders_with_results, $folders);
        }
        
        // Add empty folders from folders table
        $folders = addEmptyFolders($con, $folders, $workspace_filter);
        
        // Ensure Favorites folder always exists (even if empty)
        $folders = ensureFavoritesFolder($folders);
        
        // Sort folders
        $folders = sortFolders($folders);
        
        // Get total notes count for folder opening logic
        $total_notes = getTotalNotesCount($con, $workspace_filter);
        
        // Notes list left column
        include 'notes_list.php';                 
    ?>

    </div>

    <div class="resize-handle" id="resizeHandle">
        <button class="toggle-sidebar-btn" id="toggleSidebarBtn" title="<?php echo t_h('sidebar.toggle'); ?>" aria-label="<?php echo t_h('sidebar.toggle'); ?>">
            <i class="lucide lucide-chevron-left"></i>
        </button>
    </div>



    <!-- RIGHT COLUMN -->
    <div id="right_pane">
    <div id="right_col">
            
        <?php
            // Render the opened note (toolbar, tags row, content, attachments).
            // Sets $tasklist_ids / $markdown_ids used by the init scripts below.
            include 'note_display.php';
        ?>
    </div>
    </div><!-- #right_pane -->

    <!-- OUTLINE MOBILE BACKDROP -->
    <div class="outline-mobile-backdrop" id="outlineMobileBackdrop"></div>

    <!-- OUTLINE RESIZE HANDLE -->
    <div class="outline-resize-handle" id="outlineResizeHandle">
        <button
            id="toggleOutlineBtn"
            class="toggle-outline-btn"
            aria-label="Toggle outline panel"
            title="Toggle outline panel">
            <i class="lucide lucide-chevron-right"></i>
        </button>
    </div>

    <!-- OUTLINE PANEL -->
    <div id="outline-panel">
        <div class="outline-header">
            <h2 class="outline-title" data-i18n="common.outline.title">Outline</h2>
            <button type="button" class="outline-close-btn" aria-label="<?php echo t_h('common.close'); ?>" title="<?php echo t_h('common.close'); ?>">
                <i class="lucide lucide-x"></i>
            </button>
        </div>
        <ul class="outline-nav" id="outline-nav">
            <div class="outline-empty">
                <div class="outline-empty-icon">📄</div>
                <p class="outline-empty-text" data-i18n="common.outline.no_headings">No headings in this note</p>
            </div>
        </ul>
    </div>

    <!-- Data for initialization (used by index-events.js) -->
    <?php if (!empty($tasklist_ids)): ?>
    <script type="application/json" id="tasklist-init-data"><?php echo json_encode($tasklist_ids); ?></script>
    <?php endif; ?>
    
    <?php if (!empty($markdown_ids)): ?>
    <script type="application/json" id="markdown-init-data"><?php echo json_encode($markdown_ids); ?></script>
    <?php endif; ?>
        
    </div>  <!-- Close main-container -->

<!-- Application modules served as one concatenated deferred bundle (see
     index_js.php). Inline scripts below (DEFAULT_NOTE_TITLES, calendar
     translations) execute during parsing, i.e. before the deferred bundle. -->
<script>window.DEFAULT_NOTE_TITLES = <?php echo getDefaultNoteTitlesJson(); ?>;</script>
<!-- Calendar translations -->
<script>
window.calendarTranslations = {
    months: [
        <?php echo json_encode(t('calendar.months.january')); ?>,
        <?php echo json_encode(t('calendar.months.february')); ?>,
        <?php echo json_encode(t('calendar.months.march')); ?>,
        <?php echo json_encode(t('calendar.months.april')); ?>,
        <?php echo json_encode(t('calendar.months.may')); ?>,
        <?php echo json_encode(t('calendar.months.june')); ?>,
        <?php echo json_encode(t('calendar.months.july')); ?>,
        <?php echo json_encode(t('calendar.months.august')); ?>,
        <?php echo json_encode(t('calendar.months.september')); ?>,
        <?php echo json_encode(t('calendar.months.october')); ?>,
        <?php echo json_encode(t('calendar.months.november')); ?>,
        <?php echo json_encode(t('calendar.months.december')); ?>
    ],
    weekdays: [
        <?php echo json_encode(t('calendar.weekdays.monday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.tuesday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.wednesday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.thursday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.friday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.saturday')); ?>,
        <?php echo json_encode(t('calendar.weekdays.sunday')); ?>
    ],
    previousMonth: <?php echo json_encode(t('calendar.buttons.previous_month')); ?>,
    nextMonth: <?php echo json_encode(t('calendar.buttons.next_month')); ?>,
    today: <?php echo json_encode(t('calendar.buttons.today')); ?>,
    showCalendar: <?php echo json_encode(t('calendar.buttons.show_calendar')); ?>,
    hideCalendar: <?php echo json_encode(t('calendar.buttons.hide_calendar')); ?>,
    modal: {
        title: <?php echo json_encode(t('calendar.modal.title')); ?>,
        open: <?php echo json_encode(t('calendar.modal.open')); ?>,
        open_all: <?php echo json_encode(t('calendar.modal.open_all')); ?>,
        close: <?php echo json_encode(t('calendar.modal.close')); ?>
    }
};
</script>
<script defer src="index_js.php?group=app&v=<?php echo $v; ?>"></script>

<?php if (!$isPublicWorkspaceReadonly && $note && is_numeric($note)): ?>
<!-- Data for draft check (used by index-events.js) -->
<script type="application/json" id="current-note-data"><?php echo json_encode(['noteId' => (string)$note]); ?></script>
<!-- Create daily snapshot on note load -->
<script>
document.addEventListener('DOMContentLoaded', function() {
    if (typeof createNoteSnapshot === 'function') {
        createNoteSnapshot(<?php echo (int)$note; ?>);
    }
});
</script>
<?php endif; ?>


<?php if ($showGitSync && $gitSync->isAutoPullEnabled()): ?>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const runAutoPull = function() {
        // Prevent double execution if fallback fires
        if (window.hasRunAutoPull) return;
        window.hasRunAutoPull = true;

        const gitProvider = '<?php echo htmlspecialchars($gitProvider, ENT_QUOTES); ?>';
        const ws = <?php echo json_encode($workspace_filter ?: 'Poznote'); ?>;
        const lastPull = sessionStorage.getItem('last_git_pull_' + ws);
        const now = Date.now();

        // Trigger only once per session (when opening Poznote)
        if (!lastPull) {
            const confirmMsg = window.t ? 
                window.t('git_sync.confirm_auto_pull_warning', { provider: gitProvider }, `A new session started. Do you want to pull changes from ${gitProvider}?\n\nLocal notes not found on ${gitProvider} will be moved to trash.`) : 
                `A new session started. Do you want to pull changes from ${gitProvider}?\n\nLocal notes not found on ${gitProvider} will be moved to trash.`;
            
            if (typeof window.modalAlert !== 'undefined') {
                window.modalAlert.confirm(confirmMsg).then(function(confirmed) {
                    if (confirmed) {
                        // Mark as handled for this session
                        sessionStorage.setItem('last_git_pull_' + ws, now);
                        // Redirect to dashboard.php with auto_pull parameter
                        const homeUrl = new URL('dashboard.php', window.location.href);
                        homeUrl.searchParams.set('auto_pull', '1');
                        window.location.href = homeUrl.toString();
                    } else {
                        // User declined, mark as handled for this session so we don't ask again
                        sessionStorage.setItem('last_git_pull_' + ws, now);
                    }
                });
            }
        }
    };

    // Attempt to wait for translations
    if (window.POZNOTE_I18N && window.POZNOTE_I18N.strings && Object.keys(window.POZNOTE_I18N.strings).length > 0) {
        runAutoPull();
    } else {
        document.addEventListener('poznote:i18n:loaded', runAutoPull, { once: true });
        // Fallback to avoid waiting forever (1s)
        setTimeout(runAutoPull, 1000);
    }
});
</script>
<?php endif; ?>
</body>
</html>
