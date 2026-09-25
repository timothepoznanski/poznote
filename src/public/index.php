<?php

// Show PHP errors in the browser only when POZNOTE_DEBUG is enabled;
// production instances log them instead of exposing paths and internals.
$poznoteDebug = filter_var($_ENV['POZNOTE_DEBUG'] ?? (getenv('POZNOTE_DEBUG') ?: '0'), FILTER_VALIDATE_BOOL);
ini_set('display_errors', $poznoteDebug ? '1' : '0');
ini_set('display_startup_errors', $poznoteDebug ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

// Load functions to get ALLOWED_IFRAME_DOMAINS
require_once __DIR__ . '/../functions.php';

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
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../version_helper.php';

// A sidebar click needs the note pane only. js/note-loader.js asks for it
// with this header; the page is then built as usual, but everything outside
// #right_col goes into a buffer that is dropped, and the two heaviest parts
// of the rest (the notes tree, the modals) are not rendered at all. Without
// the header the full page is served, unchanged.
$isRightColFragment = (($_SERVER['HTTP_X_POZNOTE_FRAGMENT'] ?? '') === 'right_col');
$rightColFragmentBufferLevel = 0;
if ($isRightColFragment) {
    ob_start('poznoteDiscardOutput');
    $rightColFragmentBufferLevel = ob_get_level();
}

require_once __DIR__ . '/../db_connect.php';

// First run of an account: hand the visitor over to the startup guide before
// building anything. The key is seeded 'pending' when the account database is
// created and welcome.php flips it to 'done', so this fires exactly once.
// Only a plain page load is diverted: a note-pane fragment or a POST would
// lose its payload to the redirect, and someone opening an account that is
// not theirs (a shared workspace, a granted account) owns no settings to
// walk through.
if (!$isRightColFragment
    && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
    && getSetting('welcome_setup', '') === 'pending'
    && !(function_exists('isActiveAccountOwnedByAuthenticatedUser')
        && !isActiveAccountOwnedByAuthenticatedUser())) {
    header('Location: welcome.php');
    exit;
}

// No scheduler: old snapshots (and the attachments only they keep) are
// expired for this user once a day, from here.
poznoteExpireAllSnapshotsOccasionally($con);

// Include new modular files
require_once __DIR__ . '/../page_init.php';
require_once __DIR__ . '/../search_handler.php';
require_once __DIR__ . '/../note_loader.php';
require_once __DIR__ . '/../favorites_handler.php';
require_once __DIR__ . '/../folders_display.php';

// GitHub Sync Logic
require_once __DIR__ . '/../GitSync.php';
$gitSync = new GitSync($con, $_SESSION['user_id'] ?? null);
$gitEnabled = GitSync::isEnabled() && $gitSync->isConfigured();
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
// All users with configured git can sync, except while looking at an account
// that is not their own (a workspace shared with them, an account granted to
// them): the repository, its settings and the sync itself belong to the
// account's owner, and GitSyncController refuses everyone else.
$showGitSync = $gitEnabled && (!function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser());
$gitProvider = function_exists('getGitProviderName') ? getGitProviderName($gitSync->getProvider()) : 'Git';

// Resolve the workspace when no parameter is present, without redirecting
// (a redirect costs a full extra round trip: auth + db_connect run twice).
// A replaceState snippet in <head> reflects the resolved workspace in the
// URL so client scripts that read it from location.search keep working.
$workspaceResolvedInternally = null;

// A ?note=<id> link may target a note of another workspace (links between
// workspaces, a link pasted without its workspace). Open the note in its own
// workspace instead of falling back to the latest note of the current one.
// Plain page loads only: a note-pane fragment is swapped into a page whose
// workspace cannot change, and a session confined to a shared workspace
// (auth.php) stays in it.
if (!$isRightColFragment
    && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
    && isset($_GET['note']) && is_string($_GET['note']) && ctype_digit($_GET['note'])
    && !(function_exists('isSharedWorkspaceScopeActive') && isSharedWorkspaceScopeActive())) {
    $noteWorkspaceStmt = $con->prepare('SELECT workspace FROM entries WHERE id = ? AND trash = 0');
    $noteWorkspaceStmt->execute([(int) $_GET['note']]);
    $noteWorkspace = $noteWorkspaceStmt->fetchColumn();
    if (is_string($noteWorkspace) && $noteWorkspace !== '') {
        $requestedWorkspace = isset($_GET['workspace']) && is_string($_GET['workspace']) ? $_GET['workspace'] : null;
        if ($requestedWorkspace === null) {
            $_GET['workspace'] = $noteWorkspace;
            $workspaceResolvedInternally = $noteWorkspace;
        } elseif ($requestedWorkspace !== $noteWorkspace) {
            $redirectQuery = $_GET;
            $redirectQuery['workspace'] = $noteWorkspace;
            header('Location: index.php?' . http_build_query($redirectQuery));
            exit;
        }
    }
}

// A workspace named in the URL that this account does not have (a stale
// link, a workspace since renamed or deleted, or one that was shared with
// this login and then unshared: login.php brings the person back to the same
// URL, in their own account) opens the account's usual workspace instead of
// an empty tree under a name that does not exist.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET'
    && isset($_GET['workspace']) && is_string($_GET['workspace'])
    && $_GET['workspace'] !== '' && $_GET['workspace'] !== '__last_opened__') {
    $requestedWorkspaceStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
    $requestedWorkspaceStmt->execute([$_GET['workspace']]);
    if ((int)$requestedWorkspaceStmt->fetchColumn() === 0) {
        unset($_GET['workspace']);
    }
}

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

// Git actions (rail Push/Pull buttons, auto-pull prompt) stay hidden in
// workspaces excluded from the Git sync scope. The buttons are still rendered
// (with the hidden attribute) because workspace switching happens client-side
// without a reload: js/icon-sidebar-toggle.js toggles them using the
// gitSyncedWorkspaces list from #poznote-config. '__last_opened__' is a
// transient value replaced by a client-side redirect, so it keeps the default
// visibility.
$currentWorkspaceSynced = ($workspace_filter === '' || $workspace_filter === '__last_opened__')
    || !$showGitSync
    || $gitSync->isWorkspaceSynced($workspace_filter);

// Load note-related data (res_right, default/current note folders)
// Ensure these variables exist for included templates
// When the URL targets a Kanban board (?kanban=<id>) without an explicit
// note, skip the latest-note fallback: the board is fetched client-side and
// the note would otherwise stay visible in the right column after a reload.
// blank=1 says the note pane is empty on purpose: every tab was closed, so
// the pane must stay empty instead of bringing the last edited note back
// with no tab to close it (issue #1462). js/tabs.js puts the flag in the URL
// when it empties the pane, and on the rail's Home link while nothing is open
// (js/icon-sidebar-toggle.js does it on the other pages, issue #1488).
$kanban_restore_id = intval($_GET['kanban'] ?? 0);
$blank_note_pane = ($_GET['blank'] ?? '') === '1';
if (($kanban_restore_id > 0 || $blank_note_pane) && empty($note)) {
    $note_load_result = [];
} else {
    $note_load_result = loadNoteData($con, $note, $workspace_filter);
}
$default_note_folder = $note_load_result['default_note_folder'] ?? null;
$current_note_folder = $note_load_result['current_note_folder'] ?? null;
$res_right = $note_load_result['res_right'] ?? null;

// Two counts over the same rows the notifications modal lists (everything
// triggered and not dismissed, see RemindersController::index): the total says
// whether the bell is shown at all, the unread one whether it is amber.
// js/notifications-modal.js keeps both in step from its polling afterwards.
$notifications_count = 0;
$notifications_total = 0;
try {
    if (isset($con)) {
        if (!empty($workspace_filter)) {
            $stmtNotif = $con->prepare("
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN n.is_read = 0 THEN 1 ELSE 0 END), 0) AS unread
                FROM notifications n
                LEFT JOIN entries e ON e.id = n.note_id AND e.trash = 0
                WHERE n.dismissed = 0 AND n.trigger_at <= datetime('now')
                  AND e.workspace = ?
            ");
            $stmtNotif->execute([$workspace_filter]);
        } else {
            $stmtNotif = $con->prepare("
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread
                FROM notifications
                WHERE dismissed = 0 AND trigger_at <= datetime('now')
            ");
            $stmtNotif->execute();
        }
        $notifRow = $stmtNotif->fetch(PDO::FETCH_ASSOC) ?: [];
        $notifications_total = (int)($notifRow['total'] ?? 0);
        $notifications_count = (int)($notifRow['unread'] ?? 0);
    }
} catch (Exception $e) {
    error_log('index: notifications count query failed: ' . $e->getMessage());
    $notifications_count = 0;
    $notifications_total = 0;
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
    'note_list_sort' => 'updated_desc',
    'notes_without_folders_after_folders' => '1',
    'code_block_word_wrap' => '1',
    'code_block_line_numbers' => '0',
    'markdown_split_card_view' => '1',
    'markdown_colored' => '0',
    'markdown_colored_custom' => '',
    'attachment_previews_in_note' => '0',
    'attachments_at_bottom' => '0',
    'backlinks_at_bottom' => '0',
    'default_image_border_no_padding' => '0',
    'spellcheck_html_notes' => '0',
    'highlight_current_folder_tree' => '0',
    'folder_tree_dim_level' => '',
    'markdown_default_view_mode' => 'preview',
    'sidebar_offline_marks' => '0'
];

try {
    $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('note_font_size', 'sidebar_font_size', 'center_note_content', 'show_note_created', 'show_note_icons', 'hide_folder_actions', 'note_list_sort', 'notes_without_folders_after_folders', 'code_block_word_wrap', 'code_block_line_numbers', 'markdown_split_card_view', 'markdown_colored', 'markdown_colored_custom', 'attachment_previews_in_note', 'attachments_at_bottom', 'backlinks_at_bottom', 'default_image_border_no_padding', 'spellcheck_html_notes', 'highlight_current_folder_tree', 'folder_tree_dim_level', 'markdown_default_view_mode', 'sidebar_offline_marks')");
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

// Note max width as a CSS length. center_note_content stores a percentage of
// the note column ('60%'), '0' for full width, or legacy values: '1'/'true'
// (the old 800px default) and a bare number of pixels. 100% is full width too.
$width_value = trim((string)$settings['center_note_content']);
$center_note_content_enabled = poznoteSettingEnabled($width_value, false) && $width_value !== '100%';
$note_max_width = '800px';
if ($center_note_content_enabled && $width_value !== '1' && $width_value !== 'true') {
    if (preg_match('/^(\d{1,3})%$/', $width_value, $width_match)) {
        $note_max_width = (int)$width_match[1] . '%';
    } elseif (ctype_digit($width_value)) {
        $note_max_width = (int)$width_value . 'px';
    }
}

?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars(getUserLanguage(), ENT_QUOTES); ?>">

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, interactive-widget=resizes-content"/>
    <title><?php echo getPageTitle(); ?></title>
    <?php 
    // Cache version based on app version plus theme assets to force reload on theme changes.
    // The bundled js/*.js mtimes are folded in too: the index_js.php bundles are served
    // `immutable`, so a change to any bundled file must change this URL to be picked up.
    // Same for the css/*.css mtimes of the index_css.php bundles.
    require_once 'index_js.php';
    require_once 'index_css.php';
    $v = poznoteBuildAssetCacheVersion(getAppVersion());
    $indexJsVersion = poznoteGetIndexJsAssetVersion();
    if ($indexJsVersion !== '') {
        $v .= '-' . $indexJsVersion;
    }
    $indexCssVersion = poznoteGetIndexCssAssetVersion();
    if ($indexCssVersion !== '') {
        $v .= '-' . $indexCssVersion;
    }
    $v = rawurlencode($v);
    ?>
    <meta name="theme-color" content="#111827">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Poznote">
    <link rel="manifest" href="pwa/manifest.webmanifest?v=<?php echo $v; ?>" crossorigin="use-credentials">
    <link rel="icon" href="favicon.ico" sizes="512x512" type="image/png">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="pwa/poznote.png?v=<?php echo $v; ?>">
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <script src="js/session-guard.js?v=<?php echo $v; ?>"></script>
    <?php if ($workspaceResolvedInternally !== null): ?>
    <script>
        // The workspace was resolved server-side without a redirect; reflect
        // it in the URL for scripts that read it from location.search.
        (function () {
            try {
                // A missing parameter, or one naming a workspace the account
                // does not have, is replaced by the one actually open.
                var url = new URL(window.location.href);
                var resolved = <?php echo json_encode($workspaceResolvedInternally, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP); ?>;
                if (url.searchParams.get('workspace') !== resolved) {
                    url.searchParams.set('workspace', resolved);
                    history.replaceState(history.state, '', url);
                }
            } catch (_error) {
                console.debug('index: failed:', _error);
            }
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
<?php if (!$res_right): ?>
                // No note in the pane: no outline either (issue #1494),
                // js/outline-panel.js keeps the class in step afterwards
                document.documentElement.classList.add('outline-no-note');
<?php endif; ?>

                // Docked AI chat panel, same idea: restore its open state and
                // width before the first paint so the note does not render
                // full width and then jump. js/ai-chat.js takes the state
                // over on DOMContentLoaded. Never restored on phones, where
                // the panel overlays the note.
                if (isDesktop && localStorage.getItem('aiChatOpen') === 'true') {
                    document.documentElement.classList.add('ai-chat-open');
                }
                var aiChatWidth = parseInt(localStorage.getItem('aiChatWidth'), 10);
                if (aiChatWidth >= 300 && aiChatWidth <= 700) {
                    document.documentElement.style.setProperty('--ai-chat-width', aiChatWidth + 'px');
                }
            } catch (_error) {
                // Ignore localStorage access errors during early paint.
                console.debug('index: failed:', _error);
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
    <style>:root { --note-font-size: <?php echo htmlspecialchars($note_font_size, ENT_QUOTES); ?>px; --sidebar-font-size: <?php echo htmlspecialchars($sidebar_font_size, ENT_QUOTES); ?>px; --note-max-width: <?php echo htmlspecialchars($note_max_width, ENT_QUOTES); ?>; }</style>
    <?php poznoteRenderUiCustomizationBootstrap(); ?>
    <?php poznoteRenderToolbarIconColorsBootstrap(); ?>
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
if ($center_note_content_enabled) {
    $extra_body_classes .= ' center-note-content';
}
if (!poznoteSettingEnabled($settings['code_block_word_wrap'], true)) {
    $extra_body_classes .= ' code-block-no-wrap';
}
if (poznoteSettingEnabled($settings['code_block_line_numbers'], false)) {
    $extra_body_classes .= ' code-block-line-numbers';
}
// Dims the notes list outside the folder hierarchy being worked in
// (css/folders/tree-highlight.css)
$folder_tree_dim_style = '';
if (poznoteSettingEnabled($settings['highlight_current_folder_tree'], false)) {
    $extra_body_classes .= ' highlight-folder-tree';
    // How much the rest of the list fades, as a percentage picked on the
    // slider in the settings modal. Out of range or never set falls back to
    // the stylesheet default.
    $folder_tree_dim_level = (int)$settings['folder_tree_dim_level'];
    if ($folder_tree_dim_level >= POZNOTE_FOLDER_TREE_DIM_MIN && $folder_tree_dim_level <= POZNOTE_FOLDER_TREE_DIM_MAX) {
        $folder_tree_dim_style = '--folder-tree-dim-opacity: ' . number_format((100 - $folder_tree_dim_level) / 100, 2, '.', '') . '; ';
    }
}
if (poznoteSettingEnabled($settings['markdown_split_card_view'], true)) {
    $extra_body_classes .= ' markdown-split-card-view';
}
// Mode markdown notes with content open in (js/markdown-view-modes.js reads
// it from <body data-markdown-default-mode>). 'last' follows the mode last
// used on any note, which is how every note opened before this setting.
$markdown_default_view_mode = trim((string)$settings['markdown_default_view_mode']);
if (!in_array($markdown_default_view_mode, ['preview', 'edit', 'split', 'last'], true)) {
    $markdown_default_view_mode = 'preview';
}
// Colored markdown ('0' = off, 'custom' = per-element colors chosen by the
// user): body class + --mdc-* colours, lib/markdown-colored.php (diary.php
// builds its <body> the same way for the journal view)
$markdown_colored_style = '';
if (poznoteMarkdownColoredEnabled($settings['markdown_colored'])) {
    $extra_body_classes .= ' markdown-colored';
    $markdown_colored_style = poznoteMarkdownColoredStyle($settings['markdown_colored'], $settings['markdown_colored_custom']);
}
$attachment_previews_in_note_setting = poznoteSettingEnabled($settings['attachment_previews_in_note'], false);
$attachments_at_bottom_setting = poznoteSettingEnabled($settings['attachments_at_bottom'], false);
$backlinks_at_bottom_setting = poznoteSettingEnabled($settings['backlinks_at_bottom'], false);
// The one sort order of the tree (#1442), stepped through by the button at the
// top of the notes list. src/lib/note-sort.php holds the modes and the
// comparators; the SQL below only pre-orders the rows, organizeNotesByFolder()
// and sortFolders() decide what the sidebar shows.
$note_list_sort_type = poznoteNormalizeNoteSort($settings['note_list_sort']);
$notes_without_folders_after = poznoteSettingEnabled($settings['notes_without_folders_after_folders'], true);

$folder_null_case = $notes_without_folders_after ? '1' : '0';
$folder_case = $notes_without_folders_after ? '0' : '1';

$allowed_sorts = [
    'updated_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, updated DESC",
    'created_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, created DESC",
    'heading_asc'  => "folder, heading COLLATE NOCASE ASC",
    'type_asc'     => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, type COLLATE NOCASE, heading COLLATE NOCASE ASC",
    // Drag-and-drop order: unplaced notes (display_order 0) first, newest
    // update first, then the saved positions (see poznoteComparePlacedOrder)
    'manual'       => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, CASE WHEN display_order > 0 THEN 1 ELSE 0 END, display_order, updated DESC"
];

$note_list_order_by = $allowed_sorts[$note_list_sort_type];

// Set body classes
$body_classes = trim($extra_body_classes);
// Per-user CSS variables that cannot live in a stylesheet
$body_inline_style = trim($folder_tree_dim_style . $markdown_colored_style);
?>

<body<?php echo $body_classes ? ' class="' . htmlspecialchars($body_classes, ENT_QUOTES) . '"' : ''; ?><?php echo $body_inline_style ? ' style="' . htmlspecialchars($body_inline_style, ENT_QUOTES) . '"' : ''; ?> data-workspace="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>" data-markdown-default-mode="<?php echo htmlspecialchars($markdown_default_view_mode, ENT_QUOTES); ?>">
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
        } catch (error) {
            console.debug('index: failed:', error);
        }
    })();
    </script>
    <div id="save-indicator" class="save-indicator" style="display: none;">
        <i class="lucide lucide-save"></i>
    </div>
    
    <!-- Global configuration (CSP compliant) -->
    <?php
    // Speech to text, resolved the way the AI assistant is further down: a
    // personal server when the administrator allows one, otherwise the
    // instance one this profile was granted access to.
    require_once __DIR__ . '/../stt_config.php';
    $sttConfig = poznoteResolveSttConfig($con, (int)(getAuthenticatedUserId() ?? 0));
    $sttEnabled = $sttConfig['available'];
    ?>
    <script type="application/json" id="poznote-config"><?php
        echo json_encode([
            'gitSyncAutoPush' => ($showGitSync && $gitSync->isAutoPushEnabled()),
            'gitSyncedWorkspaces' => ($showGitSync ? $gitSync->getSyncedWorkspaces() : null),
            'gitProvider' => $gitProvider,
            'dateTimeFormat' => getUserDateTimeFormat(),
            'inlineAttachmentPreviews' => $attachment_previews_in_note_setting,
            'attachmentsAtBottom' => $attachments_at_bottom_setting,
            'backlinksAtBottom' => $backlinks_at_bottom_setting,
            'defaultImageBorderNoPadding' => poznoteSettingEnabled($settings['default_image_border_no_padding'], false),
            'archiveWorkspace' => POZNOTE_ARCHIVE_WORKSPACE,
            // Gates the Transcribe button of Record audio and the Transcribe action on
            // audio attachments (js/speech-to-text.js). The endpoint checks the
            // same thing again: this only decides what is offered.
            'speechToText' => $sttEnabled,
            // Preselected in the dialog's language menu, which can override it
            // for one recording; empty means the server detects the language
            'speechToTextLanguage' => $sttEnabled ? (string)$sttConfig['language'] : '',
            'speechToTextMaxSeconds' => poznoteSttMaxRecordingSeconds()
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

    <?php
    if (!$isRightColFragment) {
        include __DIR__ . '/../modals.php';
    }
    ?>

    <?php
    // AI assistant availability (used for the icon sidebar button and the
    // chat panel below)
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../ai_config.php';
    // Either the user's own configuration (ai_settings_user.php) or the
    // instance one, which is opt-in per user (see the allowed-users list in
    // ai_settings.php).
    $aiChatConfig = poznoteResolveAiChatConfig($con, (int)(getAuthenticatedUserId() ?? 0));
    $aiChatEnabled = $aiChatConfig['available'];

    // Icon-only left rail mirroring the dashboard topbar actions
    // (see .dashboard-topbar-actions in dashboard.php). The navigation entries
    // live in icon_sidebar.php so every page shows the same list; the buttons
    // below are appended here because their handlers only exist on this page.
    $iconSidebarWorkspace = ($workspace_filter !== '' && $workspace_filter !== '__last_opened__') ? $workspace_filter : '';
    // Notifications live in the sidebar header instead (next to the create
    // button), and the AI assistant toggle in the floating stack at the
    // bottom-right of the page (ui_customization_panel.php).
    $iconSidebarExtraItems = [];
    if ($showGitSync) {
        $iconSidebarExtraItems[] = ['id' => 'iconSidebarGitPushBtn', 'gitAction' => 'push', 'icon' => 'lucide-upload', 'label' => 'Push', 'hidden' => !$currentWorkspaceSynced];
        $iconSidebarExtraItems[] = ['id' => 'iconSidebarGitPullBtn', 'gitAction' => 'pull', 'icon' => 'lucide-download', 'label' => 'Pull', 'hidden' => !$currentWorkspaceSynced];
    }
    ?>
    <!-- ICON SIDEBAR (dashboard topbar actions, icons only) -->
    <?php include __DIR__ . '/../icon_sidebar.php'; ?>

    <!-- LEFT COLUMN -->
    <div id="left_col">
        
    <?php
    // Construction des conditions de recherche sécurisées
    $search_conditions = buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $search_combined, $created_from, $created_to, $con);
    $where_clause = $search_conditions['where_clause'];
    $sql_params = $search_conditions['search_params'];
    appendNoteAgeFilter($where_clause, $sql_params, getNoteAgeFilterDays($con));
    
    // Secure prepared queries
    // A shortcut without its own icon inherits the icon of the note it links to.
    $query_left_secure = "SELECT id, heading, folder, folder_id, favorite, offline, created, updated, type, linked_note_id, reminder_at, display_order, "
        . "COALESCE(NULLIF(icon, ''), (SELECT o.icon FROM entries o WHERE o.id = entries.linked_note_id)) AS icon, "
        . "CASE WHEN NULLIF(icon, '') IS NULL THEN (SELECT o.icon_color FROM entries o WHERE o.id = entries.linked_note_id) ELSE icon_color END AS icon_color "
        . "FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    ?>

        
    <?php
    // Account rows only exist where there is a choice of account: the signed-in
    // person can open several of them (their own plus grants from Admin >
    // User Management). The active one then heads the notes list as a
    // collapsible row with its name (notes_list.php), carrying the
    // "Expand all folders" button at its end, and the others are listed in a
    // block under its tree, on the plain tree only: a search or a folder view
    // scopes the list to the active account. With a single account the tree is
    // not named at all (issue #1436). A workspace shared with the signed-in
    // person (auth.php, shared workspace scope) is headed by its owner's name
    // the same way, since the tree shown is that account's.
    $otherAccountProfiles = [];
    $activeAccountProfile = null;
    $showAccountRows = false;
    $isSharedWorkspaceScope = function_exists('isSharedWorkspaceScopeActive') && isSharedWorkspaceScopeActive();
    // Display preferences belong to the account they are stored in: someone
    // looking at another account (a shared workspace, a granted account)
    // cannot change them, so the controls that write them are not shown.
    $canWriteAccountSettings = !function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser();
    // Empty unless several accounts are reachable, see
    // getSwitchableAccountProfiles().
    $switchableProfiles = function_exists('getSwitchableAccountProfiles') ? getSwitchableAccountProfiles() : [];
    $activeAccountProfile = function_exists('getCurrentUser') ? getCurrentUser() : null;
    if ((!empty($switchableProfiles) || $isSharedWorkspaceScope) && is_array($activeAccountProfile) && (string)($activeAccountProfile['username'] ?? '') !== '') {
        $showAccountRows = true;
    } else {
        $activeAccountProfile = null;
    }
    $isPlainTree = empty($search) && empty($tags_search) && empty($created_from) && empty($created_to) && empty($folder_filter);
    if ($isPlainTree && !empty($switchableProfiles)) {
        // The active account heads the list, the others follow in one
        // order (the login's own first, then by name, see
        // getUserAccessibleProfiles()).
        $activeAccountId = (int)(getCurrentUserId() ?? 0);
        foreach ($switchableProfiles as $accountProfile) {
            if ((int)$accountProfile['id'] !== $activeAccountId) {
                $otherAccountProfiles[] = $accountProfile;
            }
        }
    }
    $expandFoldersButton = '<button type="button" class="sidebar-folder-toggle" id="sidebarExpandFoldersBtn" data-action="toggle-all-folders" title="' . t_h('sidebar.expand_all_folders', [], 'Expand all folders') . '" aria-label="' . t_h('sidebar.expand_all_folders', [], 'Expand all folders') . '">'
        . '<i class="lucide lucide-chevrons-up-down"></i>'
        . '</button>';

    // Sort mode button (#1442): one click steps to the next mode, the way the
    // theme button steps to the next theme. The icon and the title name the
    // mode in use, not the one the next click brings. js/note-sort-cycle.js
    // saves the setting and rebuilds the list; the markup is re-rendered with
    // the new mode on every sidebar refresh, so data-sort-mode stays true.
    [$noteSortLabelKey, $noteSortLabelFallback] = poznoteNoteSortLabel($note_list_sort_type);
    $noteSortTitle = t_h('sort.button_title', ['mode' => t($noteSortLabelKey, [], $noteSortLabelFallback)], 'Sort by: {{mode}}');
    // The sort mode is a setting of the account being looked at. The button
    // sits with "Expand all folders" on the row after Favorites (notes_list.php).
    $noteSortButton = $canWriteAccountSettings
        ? '<button type="button" class="sidebar-folder-toggle" id="sidebarSortBtn" data-action="cycle-note-sort" data-sort-mode="' . htmlspecialchars($note_list_sort_type, ENT_QUOTES) . '" title="' . $noteSortTitle . '" aria-label="' . $noteSortTitle . '">'
            . '<i class="lucide ' . htmlspecialchars(poznoteNoteSortIcon($note_list_sort_type), ENT_QUOTES) . '"></i>'
            . '</button>'
        : '';
    ?>

    <!-- MENU RIGHT COLUMN -->	 
    <div class="sidebar-header">
        <div class="sidebar-title-row">
            <?php
            // The title opens the workspace dropdown even when a single
            // workspace exists: the menu also carries the "Edit workspaces" /
            // "New workspace" entries (js/workspaces-core.js), and in a shared
            // workspace the way back to the person's own account.
            ?>
            <?php
            // A colored workspace (workspaces.php > Color) leads its title with
            // its dot, as in the workspace menu and on the secondary pages
            $titleWorkspaceColors = poznoteGetWorkspaceColorsMap($con);
            $titleWorkspaceHex = (string)($titleWorkspaceColors[(string)$workspace_filter]['hex'] ?? '');
            if (!preg_match('/^#[0-9a-f]{3,8}$/i', $titleWorkspaceHex)) {
                $titleWorkspaceHex = '';
            }
            ?>
            <div class="sidebar-title" role="button" tabindex="0" data-action="toggle-workspace-menu">
                <?php if ($titleWorkspaceHex !== ''): ?>
                <span class="workspace-title-dot" style="background-color: <?php echo htmlspecialchars($titleWorkspaceHex, ENT_QUOTES); ?>" aria-hidden="true"></span>
                <?php endif; ?>
                <span class="workspace-title-text" title="<?php echo $displayWorkspace; ?>"><?php echo $displayWorkspace; ?></span>
                <i class="lucide lucide-caret-down workspace-dropdown-icon"></i>
            </div>
            <div class="sidebar-title-actions">
                    <button class="sidebar-folder-toggle<?php echo $notifications_count > 0 ? ' has-notifications' : ''; ?>" id="sidebarNotificationsBtn" data-action="open-notifications-modal" title="<?php echo t_h('reminder.notifications', [], 'Notifications'); ?>" aria-label="<?php echo t_h('reminder.notifications', [], 'Notifications'); ?>"<?php echo $notifications_total > 0 ? '' : ' hidden'; ?>>
                        <i class="lucide lucide-bell"></i>
                    </button>
                    <button class="sidebar-plus" id="sidebarCreateBtn" data-action="toggle-create-menu" title="<?php echo t_h('sidebar.create'); ?>">
                        <i class="lucide lucide-plus-circle"></i>
                    </button>
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
            'canUseSettingsApi' => !function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser(),
            'settings' => [
                'emoji_icons_enabled' => getSetting('emoji_icons_enabled', '1'),
                'slash_menu_trigger' => getSetting('slash_menu_trigger', 'slash'),
                'slash_menu_trigger_mobile' => getSetting('slash_menu_trigger_mobile', 'slash'),
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
        // The notes tree (left column). A fragment request skips it: the rows,
        // their grouping and the markup are the bulk of the page.
        if (!$isRightColFragment) {
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
            $folders = sortFolders($folders, $note_list_sort_type);

            // Get total notes count for folder opening logic
            $total_notes = getTotalNotesCount($con, $workspace_filter);

            // Notes list left column
            include __DIR__ . '/../notes_list.php';
        }
    ?>

    </div>

    <div class="resize-handle" id="resizeHandle">
        <button class="toggle-sidebar-btn" id="toggleSidebarBtn" title="<?php echo t_h('sidebar.toggle'); ?>" aria-label="<?php echo t_h('sidebar.toggle'); ?>">
            <i class="lucide lucide-chevron-left"></i>
        </button>
    </div>



    <!-- RIGHT COLUMN -->
    <div id="right_pane">
    <?php if ($isRightColFragment): ?>
    <?php
        // From here to the end of #right_col the output is the fragment itself:
        // drop what the page rendered so far and let the pane through.
        while (ob_get_level() >= $rightColFragmentBufferLevel && @ob_end_clean()) {
        }
    ?>
    <?php endif; ?>
    <div id="right_col">
            
        <?php
            // Render the opened note (toolbar, tags row, content, attachments).
            // Sets $tasklist_ids / $markdown_ids used by the init scripts below.
            include __DIR__ . '/../note_display.php';
        ?>
    </div>
    <?php if ($isRightColFragment): ?>
    <?php
        // The rest of the page goes back into the discard handler, which
        // returns nothing when PHP flushes it at the end of the request.
        ob_start('poznoteDiscardOutput');
    ?>
    <?php endif; ?>
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

    <?php if ($aiChatEnabled): ?>
    <?php include __DIR__ . '/../ai_chat_panel.php'; ?>
    <?php endif; ?>

    <?php
    // Contextual UI Customization: floating button + docked column listing
    // the hideable elements of this page (see ui_customization_panel.php,
    // which shows nothing on an account that is not the person's own)
    $uiCustomizationPanelPage = 'notes';
    include __DIR__ . '/../ui_customization_panel.php';

    // Editing buttons pinned above the on-screen keyboard (mobile only)
    include __DIR__ . '/../mobile_editor_bar.php';
    ?>

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
<!-- Tag colors, so note tags can show the same dot as the tags list -->
<script>
window.TAG_COLORS = <?php echo json_encode(getTagColorsMap(), JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT); ?>;
window.NOTE_COLOR_PALETTE = <?php echo json_encode(getNoteColorPalette(), JSON_UNESCAPED_UNICODE); ?>;
</script>
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
    apply: <?php echo json_encode(t('common.apply', [], 'Apply')); ?>,
    showCalendar: <?php echo json_encode(t('calendar.buttons.show_calendar')); ?>,
    hideCalendar: <?php echo json_encode(t('calendar.buttons.hide_calendar')); ?>,
    modes: {
        created: <?php echo json_encode(t('calendar.modes.created', [], 'Created')); ?>,
        modified: <?php echo json_encode(t('calendar.modes.modified', [], 'Modified')); ?>
    },
    dayCounts: <?php echo json_encode(t('calendar.day_counts', [], 'Created: {{created}} / Modified: {{modified}}')); ?>,
    modal: {
        title: <?php echo json_encode(t('calendar.modal.title')); ?>,
        open_all: <?php echo json_encode(t('calendar.modal.open_all')); ?>,
        close: <?php echo json_encode(t('calendar.modal.close')); ?>,
        no_notes: <?php echo json_encode(t('calendar.modal.no_notes', [], 'No notes on this day.')); ?>,
        diary_open: <?php echo json_encode(t('calendar.modal.diary_open', [], 'Open diary entry')); ?>,
        diary_create: <?php echo json_encode(t('calendar.modal.diary_create', [], 'Create diary entry')); ?>,
        diary_error: <?php echo json_encode(t('diary.create_error', [], 'Could not create the diary entry.')); ?>
    }
};
window.NOTIFICATIONS_TXT = {
    dismiss: <?php echo json_encode(t('reminder.dismiss', [], 'Dismiss')); ?>,
    justNow: <?php echo json_encode(t('reminder.just_now', [], 'Just now')); ?>,
    repeats: <?php echo json_encode(t('reminder.repeats', [], 'Repeats')); ?>
};
</script>
<script defer src="index_js.php?group=app&v=<?php echo $v; ?>"></script>
<?php if (poznoteSettingEnabled($settings['sidebar_offline_marks'], false)): ?>
<?php // Marks the notes of the tree this browser holds offline (after the app bundle, which loads offline-store.js) ?>
<script src="<?php echo poznoteAsset('js/offline-marks.js'); ?>" defer
    data-note-title="<?php echo t_h('notes_list.note_actions.available_offline', [], 'Available offline in this browser'); ?>"
    data-folder-title="<?php echo t_h('notes_list.folder_actions.kept_offline', [], 'Kept offline in this browser'); ?>"></script>
<?php endif; ?>

<?php if ($note && is_numeric($note)): ?>
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


<?php if ($showGitSync && $currentWorkspaceSynced && $gitSync->isAutoPullEnabled()): ?>
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
