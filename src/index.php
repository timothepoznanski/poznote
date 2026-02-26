<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
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
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src {$frameSrcDomains};");

// X-XSS-Protection: Enable browser's XSS filter (legacy but still useful)
header("X-XSS-Protection: 1; mode=block");

// X-Content-Type-Options: Prevent MIME type sniffing
header("X-Content-Type-Options: nosniff");

// X-Frame-Options: Prevent clickjacking
header("X-Frame-Options: SAMEORIGIN");

// Referrer-Policy: Control referrer information
header("Referrer-Policy: strict-origin-when-cross-origin");

// Authentication check
require 'auth.php';
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
$gitSync = new GitSync($con);
$gitEnabled = GitSync::isEnabled() && $gitSync->isConfigured();
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$showGitSync = $gitEnabled && $isAdmin;
$gitProvider = function_exists('getGitProviderName') ? getGitProviderName() : 'Git';

// Check if we need to redirect to include workspace from database settings
// Only redirect if no workspace parameter is present in GET
if (!isset($_GET['workspace']) && !isset($_POST['workspace'])) {
    // Use getWorkspaceFilter() which handles the full priority logic:
    // 1. default_workspace if set to a specific workspace
    // 2. last_opened_workspace from database
    // 3. First available workspace as fallback
    $resolvedWorkspace = getWorkspaceFilter();
    
    if ($resolvedWorkspace && $resolvedWorkspace !== '') {
        // Build redirect URL preserving other parameters
        $params = $_GET;
        $params['workspace'] = $resolvedWorkspace;
        $queryString = http_build_query($params);
        header('Location: index.php?' . $queryString);
        exit;
    }
}

// Save the currently opened workspace to database for "last opened" feature
if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
    saveLastOpenedWorkspace($_GET['workspace']);
}

// Initialization of workspaces and labels
initializeWorkspacesAndLabels($con);

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Display workspace name (simplified logic)
$displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);

// Load note-related data (res_right, default/current note folders)
// Ensure these variables exist for included templates
$note_load_result = loadNoteData($con, $note, $workspace_filter);
$default_note_folder = $note_load_result['default_note_folder'] ?? null;
$current_note_folder = $note_load_result['current_note_folder'] ?? null;
$res_right = $note_load_result['res_right'] ?? null;

// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Load all required settings in a single query for better performance
$settings = [
    'note_font_size' => '15',
    'sidebar_font_size' => '13',
    'center_note_content' => '800',
    'show_note_created' => false,
    'hide_folder_actions' => null,
    'hide_folder_counts' => null,
    'note_list_sort' => 'updated_desc',
    'notes_without_folders_after_folders' => '1',
    'hide_inline_attachment_images' => '1'
];

try {
    $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('note_font_size', 'sidebar_font_size', 'center_note_content', 'show_note_created', 'hide_folder_actions', 'hide_folder_counts', 'note_list_sort', 'notes_without_folders_after_folders', 'hide_inline_attachment_images')");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $settings[$row['key']] = $row['value'];
    }
} catch (Exception $e) {
    // Use defaults if error
}

// Extract hide_inline_attachment_images setting (with invertLogic: '1' = show, '0' or null = hide)
$hide_inline_images = ($settings['hide_inline_attachment_images'] === '0' || $settings['hide_inline_attachment_images'] === 'false');

// Extract settings with proper defaults
$note_font_size = $settings['note_font_size'];
$sidebar_font_size = ($settings['sidebar_font_size'] !== '' && $settings['sidebar_font_size'] !== null) ? $settings['sidebar_font_size'] : '13';

// Calculate note max width
$note_max_width = '800';
$width_value = $settings['center_note_content'];
if ($width_value !== false && $width_value !== '' && $width_value !== '0' && $width_value !== 'false') {
    if ($width_value === '1' || $width_value === 'true') {
        $note_max_width = '800';
    } else {
        $note_max_width = $width_value;
    }
}

?>

<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo getPageTitle(); ?></title>
    <?php 
    // Cache version based on app version to force reload on updates
    $v = getAppVersion();
    ?>
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <script>window.ALLOWED_IFRAME_DOMAINS = <?php echo json_encode(ALLOWED_IFRAME_DOMAINS); ?>;</script>
    <meta name="color-scheme" content="dark light">
    <link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $v; ?>"/>
    <!-- Modular CSS - Imported directly (previously via index.css) -->
    <link type="text/css" rel="stylesheet" href="css/variables.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/base.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/utilities.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/layout.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/sidebar.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/toolbar.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/menus.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/searchbars.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/subline.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/sidebar.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/tags.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/attachments-row.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/noteentry.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/editor.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/toolbar.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/notes/checkboxes.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/code-blocks.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/checklists.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/headers-toggles.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/actions-menu.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/content.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/selection.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/search.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/animations.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/toolbar-icons.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/table-picker.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folders/system-folders.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/emoji-picker.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/table-picker.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/slash-commands.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/drag-drop.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/icons.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/tabs.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/misc.css?v=<?php echo $v; ?>"/>
    <link rel="stylesheet" href="css/index-mobile.css?v=<?php echo $v; ?>" media="(max-width: 800px)">
    <link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/base.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/attachments.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/link-modal.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/share-modal.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals/responsive.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/tasks.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/markdown.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/excalidraw.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/excalidraw-unified.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/note-reference.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/search-replace.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/folder-icon-modal.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/kanban.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/background-image.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="js/katex/katex.min.css?v=<?php echo $v; ?>"/>
    <style>:root { --note-font-size: <?php echo htmlspecialchars($note_font_size, ENT_QUOTES); ?>px; --sidebar-font-size: <?php echo htmlspecialchars($sidebar_font_size, ENT_QUOTES); ?>px; --note-max-width: <?php echo htmlspecialchars($note_max_width, ENT_QUOTES); ?>px; }</style>
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $v; ?>"></script>
    <script src="js/toolbar.js?v=<?php echo $v; ?>"></script>
    <script src="js/markdown-formatting.js?v=<?php echo $v; ?>"></script>
    <script src="js/checklist.js?v=<?php echo $v; ?>"></script>
    <script src="js/bulletlist.js?v=<?php echo $v; ?>"></script>
    <script src="js/note-loader-common.js?v=<?php echo $v; ?>"></script>
    <script src="js/note-reference.js?v=<?php echo $v; ?>"></script>
    <script src="js/template-selector.js?v=<?php echo $v; ?>"></script>
    <script src="js/linked-note-selector.js?v=<?php echo $v; ?>"></script>
    <script src="js/search-replace.js?v=<?php echo $v; ?>"></script>
    <script src="js/markdown-handler.js?v=<?php echo $v; ?>"></script>
    <script src="js/mermaid/mermaid.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/katex/katex.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/katex/auto-render.min.js?v=<?php echo $v; ?>"></script>
    <link type="text/css" rel="stylesheet" href="css/syntax-highlight.css?v=<?php echo $v; ?>"/>
    <script src="js/highlight/highlight.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/highlight/powershell.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/syntax-highlight.js?v=<?php echo $v; ?>"></script>

</head>

<?php
// Build body classes from previously loaded settings
$extra_body_classes = '';
$show_note_created_setting = ($settings['show_note_created'] === '1' || $settings['show_note_created'] === 'true');
if ($show_note_created_setting) {
    $extra_body_classes .= ' show-note-created';
}
if ($settings['hide_folder_actions'] === '1' || $settings['hide_folder_actions'] === 'true' || $settings['hide_folder_actions'] === null) {
    $extra_body_classes .= ' folder-actions-always-visible';
}
if ($settings['hide_folder_counts'] === '0' || $settings['hide_folder_counts'] === 'false') {
    $extra_body_classes .= ' hide-folder-counts';
}
if ($width_value !== false && $width_value !== '' && $width_value !== '0' && $width_value !== 'false') {
    $extra_body_classes .= ' center-note-content';
}

// Load note list sort preference using previously loaded settings
$note_list_sort_type = 'updated_desc'; // default
$pref = $settings['note_list_sort'];
$notes_without_folders_after = ($settings['notes_without_folders_after_folders'] !== '0' && $settings['notes_without_folders_after_folders'] !== 'false' && $settings['notes_without_folders_after_folders'] !== false);

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
?>

<body<?php echo $body_classes ? ' class="' . htmlspecialchars($body_classes, ENT_QUOTES) . '"' : ''; ?>>
    <!-- Indicateur de sauvegarde en cours -->
    <div id="save-indicator" class="save-indicator" style="display: none;">
        <i class="lucide lucide-save"></i>
    </div>
    
    <!-- Global configuration (CSP compliant) -->
    <script type="application/json" id="poznote-config"><?php
        echo json_encode([
            'gitSyncAutoPush' => ($showGitSync && $gitSync->isAutoPushEnabled())
        ], JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?: '{}';
    ?></script>
    <script src="js/error-handler.js?v=<?php echo $v; ?>"></script>

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
    $search_conditions = buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $search_combined ?? false);
    $where_clause = $search_conditions['where_clause'];
    $search_params = $search_conditions['search_params'];
    
    // Secure prepared queries
    $query_left_secure = "SELECT id, heading, folder, folder_id, favorite, created, updated, type, linked_note_id FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
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
                <button class="sidebar-home" data-action="navigate-to-home" title="<?php echo t_h('sidebar.home', [], 'Home'); ?>">
                    <i class="lucide lucide-home"></i>
                </button>
                <button class="sidebar-settings" data-action="navigate-to-settings" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>">
                    <i class="lucide lucide-settings"></i>
                    <span class="update-badge update-badge-hidden"></span>
                </button>
                <button class="sidebar-plus" data-action="toggle-create-menu" title="<?php echo t_h('sidebar.create'); ?>">
                    <i class="lucide lucide-plus-circle"></i>
                </button>
            </div>

            <div class="workspace-menu" id="workspaceMenu"></div>
        </div>
    </div>
        
    <?php
        // Determine which folders should be open
        $is_search_mode = !empty($search) || !empty($tags_search);
        
        // Execute query for right column - only override if in search mode
        if ($is_search_mode) {
            $res_right = prepareSearchResults($con, $is_search_mode, $note, $search_conditions['where_clause'], $search_conditions['search_params'], $workspace_filter);
        }
    ?>

    <!-- Page configuration data (CSP compliant) -->
    <script type="application/json" id="page-config-data"><?php 
        $config_data = [
            'isSearchMode' => !empty($search) || !empty($tags_search),
            'currentNoteFolder' => null, // Will be set below
            'selectedWorkspace' => $workspace_filter ?? '',
            'userId' => $_SESSION['user_id'] ?? null,
            'userEntriesPath' => isset($_SESSION['user_id']) ? "data/users/{$_SESSION['user_id']}/entries/" : "data/entries/",
            'defaultNoteSortType' => $note_list_sort_type,
            'isAdmin' => function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()
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
        $stmt_left->execute($search_params);
        
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
    <div id="right_col">
            
        <?php        
            // Array to collect tasklist and markdown IDs for initialization
            $tasklist_ids = [];
            $markdown_ids = [];
                        
            // Check if we should display a note or nothing
            if ($res_right) {
                while($row = $res_right->fetch(PDO::FETCH_ASSOC))
                {
                    // Check if note is shared
                    $is_shared = false;
                    try {
                        $stmt_shared = $con->prepare('SELECT 1 FROM shared_notes WHERE note_id = ? LIMIT 1');
                        $stmt_shared->execute([$row['id']]);
                        $is_shared = $stmt_shared->fetchColumn() !== false;
                    } catch (Exception $e) {
                        $is_shared = false;
                    }
                    // Check if note is shared for CSS class
                    $share_class = $is_shared ? ' is-shared' : '';
                
                    $note_type = $row['type'] ?? 'note';
                    
                    $filename = getEntryFilename($row["id"], $note_type);
                    $title = $row['heading'];
                    // Ensure we have a safe JSON-encoded title for JavaScript
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    
                    if ($note_type === 'tasklist') {
                        // For task list notes, use the JSON content from file when possible
                        if (is_readable($filename)) {
                            $entryfinal = file_get_contents($filename);
                        } else {
                            $entryfinal = $row['entry'] ?? '';
                        }
                        $tasklist_json = htmlspecialchars($entryfinal, ENT_QUOTES);
                    } else {
                        // For all other notes (including Excalidraw), prefer the HTML file content
                        if (is_readable($filename)) {
                            $entryfinal = file_get_contents($filename);
                        } else {
                            $entryfinal = $row['entry'] ?? '';
                        }
                        $tasklist_json = '';
                    }
               
                    // Note display
                    $markdown_attr = ($note_type === 'markdown') ? ' data-markdown-note="true"' : '';
                    $tasklist_attr = ($note_type === 'tasklist') ? ' data-tasklist-note="true"' : '';
                    echo '<div id="note'.$row['id'].'" class="notecard">';
                    echo '<div class="innernote"'.$markdown_attr.$tasklist_attr.'>';
                    echo '<div class="note-header">';
                    echo '<div class="note-edit-toolbar">';
                    
                    // Build home URL with search preservation
                    $home_url = 'index.php';
                    $home_params = [];
                    if (!empty($search)) {
                        $home_params[] = 'search=' . urlencode($search);
                        $home_params[] = 'preserve_notes=1';
                    }
                    if (!empty($tags_search)) {
                        $home_params[] = 'tags_search=' . urlencode($tags_search);
                        $home_params[] = 'preserve_tags=1';
                    }
                    if (!empty($folder_filter)) {
                        $home_params[] = 'folder=' . urlencode($folder_filter);
                    }
                    if ($search_combined) {
                        $home_params[] = 'search_combined=1';
                    }

                    // Always preserve workspace parameter 
                    if (!empty($workspace_filter)) {
                        $home_params[] = 'workspace=' . urlencode($workspace_filter);
                    }
                    if (!empty($home_params)) {
                        $home_url .= '?' . implode('&', $home_params);
                    }
                
                    // Home button (mobile only)
                    echo '<button type="button" class="toolbar-btn btn-home mobile-home-btn" title="' . t_h('editor.toolbar.back_to_notes') . '" data-action="scroll-to-left-column"><i class="lucide lucide-home"></i></button>';
                    
                    // Text formatting buttons (save button removed - auto-save is now automatic)
                    echo '<button type="button" class="toolbar-btn btn-bold text-format-btn" title="' . t_h('editor.toolbar.bold') . '" data-action="exec-bold"><i class="lucide lucide-bold"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-italic text-format-btn" title="' . t_h('editor.toolbar.italic') . '" data-action="exec-italic"><i class="lucide lucide-italic"></i></button>';
                    if ($note_type !== 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-underline text-format-btn" title="' . t_h('editor.toolbar.underline') . '" data-action="exec-underline"><i class="lucide lucide-underline"></i></button>';
                    }
                    echo '<button type="button" class="toolbar-btn btn-strikethrough text-format-btn" title="' . t_h('editor.toolbar.strikethrough') . '" data-action="exec-strikethrough"><i class="lucide lucide-strikethrough"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-link text-format-btn" title="' . t_h('editor.toolbar.link') . '" data-action="add-link"><i class="lucide lucide-link"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-color text-format-btn" title="' . t_h('editor.toolbar.text_color') . '" data-action="toggle-red-color"><i class="lucide lucide-palette"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-highlight text-format-btn" title="' . t_h('editor.toolbar.highlight') . '" data-action="toggle-yellow-highlight"><i class="lucide lucide-paintbrush"></i></button>';
                    if ($note_type !== 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-list-ul text-format-btn" title="' . t_h('editor.toolbar.bullet_list') . '" data-action="exec-unordered-list"><i class="lucide lucide-list-ul"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-list-ol text-format-btn" title="' . t_h('editor.toolbar.numbered_list') . '" data-action="exec-ordered-list"><i class="lucide lucide-list-ol"></i></button>';
                        echo '<button type="button" class="toolbar-btn btn-text-height text-format-btn" title="' . t_h('editor.toolbar.font_size') . '" data-action="change-font-size"><i class="lucide lucide-type-height"></i></button>';
                    }
                    echo '<button type="button" class="toolbar-btn btn-code text-format-btn" title="' . t_h('editor.toolbar.code_block') . '" data-action="toggle-code-block"><i class="lucide lucide-code"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-inline-code text-format-btn" title="' . t_h('editor.toolbar.inline_code') . '" data-action="toggle-inline-code"><i class="lucide lucide-terminal"></i></button>';
                    if ($note_type !== 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-eraser text-format-btn" title="' . t_h('editor.toolbar.clear_formatting') . '" data-action="exec-remove-format"><i class="lucide lucide-eraser"></i></button>';
                    }
                    
                    // Search and replace button (for note and markdown types)
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-search-replace note-action-btn" title="' . t_h('editor.toolbar.search_replace', [], 'Search and replace') . '" data-action="open-search-replace-modal" data-note-id="'.$row['id'].'"><i class="lucide lucide-search"></i></button>';
                    }
                
                    // Task list actions (only visible for tasklist notes)
                    if ($note_type === 'tasklist') {
                        // Task list actions dropdown
                        echo '<div class="tasklist-actions-dropdown">';
                        echo '<button type="button" class="toolbar-btn btn-tasklist-actions note-action-btn" title="' . t_h('tasklist.actions', [], 'Task list actions') . '" data-action="toggle-tasklist-actions" data-note-id="' . $row['id'] . '" aria-haspopup="true" aria-expanded="false"><i class="lucide lucide-check-square"></i></button>';
                        echo '<div id="tasklist-actions-menu-' . $row['id'] . '" class="dropdown-menu tasklist-actions-menu" hidden>';
                        echo '<button type="button" class="dropdown-item" data-action="clear-completed-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-trash"></i> ' . t_h('tasklist.clear_completed', [], 'Clear completed tasks') . '</button>';
                        echo '<button type="button" class="dropdown-item" data-action="uncheck-all-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-square"></i> ' . t_h('tasklist.uncheck_all', [], 'Uncheck all tasks') . '</button>';
                        echo '</div>';
                        echo '</div>';
                    }
                
                    // Excalidraw diagram button - insert at cursor position (hidden for markdown and tasklist notes)
                    if ($note_type !== 'markdown' && $note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-excalidraw note-action-btn" title="' . t_h('editor.toolbar.insert_excalidraw') . '" data-action="insert-excalidraw"><i class="lucide lucide-brush"></i></button>';
                    }
                
                    // Hide emoji button for tasklist notes
                    if ($note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="' . t_h('editor.toolbar.insert_emoji') . '" data-action="toggle-emoji-picker"><i class="lucide lucide-smile"></i></button>';
                    }
                    
                    // Table and separator buttons
                    echo '<button type="button" class="toolbar-btn btn-table note-action-btn" title="' . t_h('editor.toolbar.insert_table') . '" data-action="toggle-table-picker"><i class="lucide lucide-table"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-checklist note-action-btn" title="' . t_h('editor.toolbar.insert_checklist') . '" data-action="insert-checklist"><i class="lucide lucide-list-check"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="' . t_h('editor.toolbar.add_separator') . '" data-action="insert-separator"><i class="lucide lucide-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-note-reference note-action-btn" title="' . t_h('editor.toolbar.insert_note_reference') . '" data-action="open-note-reference-modal"><i class="lucide lucide-at-sign"></i></button>';

                
                    // Favorite / Share / Attachment buttons
                    $attachments_count = 0;
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data)) {
                            $attachments_count = count($attachments_data);
                        }
                    }
                
                    $is_favorite = $row['favorite'] ?? 0;
                    $favorite_class = $is_favorite ? ' is-favorite' : '';
                    $favorite_title = $is_favorite
                        ? t_h('index.toolbar.favorite_remove', [], 'Remove from favorites')
                        : t_h('index.toolbar.favorite_add', [], 'Add to favorites');

                    echo '<button type="button" class="toolbar-btn btn-favorite note-action-btn'.$favorite_class.'" title="'.$favorite_title.'" data-action="toggle-favorite" data-note-id="'.$row['id'].'"><i class="lucide lucide-star"></i></button>';
                    $share_class = $is_shared ? ' is-shared' : '';
                    
                    // Share button
                    echo '<button type="button" class="toolbar-btn btn-share note-action-btn'.$share_class.'" title="'.t_h('index.toolbar.share_note', [], 'Share note').'" data-action="open-share-modal" data-note-id="'.$row['id'].'"><i class="lucide lucide-cloud"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-attachment note-action-btn'.($attachments_count > 0 ? ' has-attachments' : '').'" title="'.t_h('index.toolbar.attachments_with_count', ['count' => $attachments_count], 'Attachments ({{count}})').'" data-action="show-attachment-dialog" data-note-id="'.$row['id'].'"><i class="lucide lucide-paperclip"></i></button>';
                    
                    // Open in new tab button
                    echo '<button type="button" class="toolbar-btn btn-open-new-tab note-action-btn" title="'.t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab').'" data-action="open-note-new-tab" data-note-id="'.$row['id'].'"><i class="lucide lucide-external-link"></i></button>';

                    // Check if this note already has a linked note (for toolbar + mobile menu)
                    $hasLinkedNote = false;
                    if ($note_type !== 'linked') {
                        $checkExistingLink = $con->prepare("SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0 LIMIT 1");
                        $checkExistingLink->execute([$row['id']]);
                        $hasLinkedNote = (bool)$checkExistingLink->fetch();
                    }
                        
                    // Generate dates safely for JavaScript with robust encoding
                    $created_raw = $row['created'] ?? '';
                    $updated_raw = $row['updated'] ?? '';
                    
                    // Clean and validate dates
                    $created_clean = trim($created_raw);
                    $updated_clean = trim($updated_raw);
                    
                    // Convert UTC timestamps to user's timezone
                    $final_created = convertUtcToUserTimezone($created_clean);
                    $final_updated = convertUtcToUserTimezone($updated_clean);
                    
                    // Fallback to current time if conversion failed
                    if (empty($final_created)) $final_created = convertUtcToUserTimezone(gmdate('Y-m-d H:i:s'));
                    if (empty($final_updated)) $final_updated = convertUtcToUserTimezone(gmdate('Y-m-d H:i:s'));
                    
                    // Encode with ALL safety flags to handle emojis and special characters
                    $created_json = json_encode($final_created, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $updated_json = json_encode($final_updated, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    // Final safety check
                    if ($created_json === false) $created_json = '"' . date('Y-m-d H:i:s') . '"';
                    if ($updated_json === false) $updated_json = '"' . date('Y-m-d H:i:s') . '"';
                    
                    // Escape quotes for HTML attributes to prevent onclick corruption
                    $created_json_escaped = htmlspecialchars($created_json, ENT_QUOTES);
                    $updated_json_escaped = htmlspecialchars($updated_json, ENT_QUOTES);
                    
                    // Prepare additional data for note info
                    $folder_name = $row['folder'] ?? t('modals.folder.no_folder', [], 'No folder');
                    // Get the complete folder path including parents
                    $folder_id = $row['folder_id'] ?? null;
                    $folder_path = $folder_id ? getFolderPath($folder_id, $con) : $folder_name;
                    $is_favorite = intval($row['favorite'] ?? 0);
                    $tags_data = $row['tags'] ?? '';
                    
                    // Encode additional data safely for JavaScript
                    $folder_json = json_encode($folder_name, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $favorite_json = json_encode($is_favorite, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $tags_json = json_encode($tags_data, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $attachments_count_json = json_encode($attachments_count, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    // Safety checks
                    if ($folder_json === false) $folder_json = 'null';
                    if ($favorite_json === false) $favorite_json = '0';
                    if ($tags_json === false) $tags_json = '""';
                    if ($attachments_count_json === false) $attachments_count_json = '0';
                    
                    // Escape for HTML attributes
                    $folder_json_escaped = htmlspecialchars($folder_json, ENT_QUOTES);
                    $favorite_json_escaped = htmlspecialchars($favorite_json, ENT_QUOTES);
                    $tags_json_escaped = htmlspecialchars($tags_json, ENT_QUOTES);
                    $attachments_count_json_escaped = htmlspecialchars($attachments_count_json, ENT_QUOTES);
                    
                    // Individual action buttons
                    echo '<button type="button" class="toolbar-btn btn-duplicate note-action-btn" data-action="duplicate-note" data-note-id="'.$row['id'].'" title="'.t_h('common.duplicate', [], 'Duplicate').'"><i class="lucide lucide-copy"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-move note-action-btn" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('common.move', [], 'Move').'"><i class="lucide lucide-folder-open"></i></button>';
                    
                    // Create linked note button (hidden for linked notes and notes that already have a link)
                    if ($note_type !== 'linked' && !$hasLinkedNote) {
                        echo '<button type="button" class="toolbar-btn btn-create-linked-note note-action-btn" title="' . t_h('editor.toolbar.create_linked_note') . '" data-action="create-linked-note"><i class="lucide lucide-link"></i></button>';
                    }
                    
                    // Download button
                    echo '<button type="button" class="toolbar-btn btn-download note-action-btn" title="'.t_h('common.download', [], 'Download').'" data-action="show-export-modal" data-note-id="'.$row['id'].'" data-filename="'.htmlspecialchars($filename, ENT_QUOTES).'" data-title="'.htmlspecialchars($title_safe, ENT_QUOTES).'" data-note-type="'.$note_type.'"><i class="lucide lucide-download"></i></button>';

                    // Convert button (only for markdown and note types)
                    if ($note_type === 'markdown') {
                        echo '<button type="button" class="toolbar-btn btn-convert note-action-btn" data-action="show-convert-modal" data-note-id="'.$row['id'].'" data-convert-to="html" title="'.t_h('index.toolbar.convert_to_html', [], 'Convert to HTML').'"><i class="lucide lucide-refresh-cw-alt"></i></button>';
                    } elseif ($note_type === 'note') {
                        echo '<button type="button" class="toolbar-btn btn-convert note-action-btn" data-action="show-convert-modal" data-note-id="'.$row['id'].'" data-convert-to="markdown" title="'.t_h('index.toolbar.convert_to_markdown', [], 'Convert to Markdown').'"><i class="lucide lucide-refresh-cw-alt"></i></button>';
                    }
                    
                    echo '<button type="button" class="toolbar-btn btn-trash note-action-btn" data-action="delete-note" data-note-id="'.$row['id'].'" title="'.t_h('common.delete', [], 'Delete').'"><i class="lucide lucide-trash-2"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-info note-action-btn" title="'.t_h('common.information', [], 'Information').'" data-action="show-note-info" data-note-id="'.$row['id'].'" data-created="'.htmlspecialchars($final_created, ENT_QUOTES).'" data-updated="'.htmlspecialchars($final_updated, ENT_QUOTES).'" data-folder="'.htmlspecialchars($folder_name, ENT_QUOTES).'" data-favorite="'.$is_favorite.'" data-tags="'.htmlspecialchars($tags_data, ENT_QUOTES).'" data-attachments-count="'.$attachments_count.'"><i class="lucide lucide-info-circle"></i></button>';
                
                    // Overflow menu button (3 dots - shown on both mobile and desktop)
                    // Marked as note-action-btn so it can be hidden during text selection (hide-on-selection)
                    echo '<div class="toolbar-menu-anchor">';
                    echo '<button type="button" class="toolbar-btn mobile-more-btn note-action-btn" title="'.t_h('common.menu', [], 'Menu').'" data-action="toggle-mobile-toolbar-menu" aria-haspopup="true" aria-expanded="false"><i class="lucide lucide-more-vertical"></i></button>';

                    // Dropdown menu (actions moved here - visible on both mobile and desktop)
                    echo '<div class="dropdown-menu mobile-toolbar-menu" hidden role="menu" aria-label="'.t_h('index.toolbar.menu_actions', [], 'Menu actions').'">';

                    // Search and replace button (only for note and markdown types, shown in mobile menu)
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-search-replace"><i class="lucide lucide-search"></i> '.t_h('editor.toolbar.search_replace', [], 'Search and replace').'</button>';
                    }

                    // Task list actions (only for tasklist notes, shown in mobile menu)
                    if ($note_type === 'tasklist') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="clear-completed-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-check-square"></i> '.t_h('tasklist.clear_completed', [], 'Clear completed tasks').'</button>';
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="uncheck-all-tasks" data-note-id="' . $row['id'] . '"><i class="lucide lucide-square"></i> '.t_h('tasklist.uncheck_all', [], 'Uncheck all tasks').'</button>';
                    }
                    
                    if ($note_type !== 'linked' && !$hasLinkedNote) {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-create-linked-note"><i class="lucide lucide-link"></i> '.t_h('editor.toolbar.create_linked_note').'</button>';
                    }

                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-duplicate"><i class="lucide lucide-copy"></i> '.t_h('common.duplicate', [], 'Duplicate').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-move"><i class="lucide lucide-folder-open"></i> '.t_h('common.move', [], 'Move').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-download"><i class="lucide lucide-download"></i> '.t_h('common.download', [], 'Download').'</button>';

                    // Convert button (only for markdown and note types, with appropriate icon)
                    if ($note_type === 'markdown') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-convert"><i class="lucide lucide-refresh-cw-alt"></i> '.t_h('index.toolbar.convert_to_html', [], 'Convert to HTML').'</button>';
                    } elseif ($note_type === 'note') {
                        echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-convert"><i class="lucide lucide-refresh-cw-alt"></i> '.t_h('index.toolbar.convert_to_markdown', [], 'Convert to Markdown').'</button>';
                    }
                    
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-open-new-tab"><i class="lucide lucide-external-link"></i> '.t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" data-action="trigger-mobile-action" data-selector=".btn-info"><i class="lucide lucide-info"></i> '.t_h('common.information', [], 'Information').'</button>';
                    echo '</div>';
                    echo '</div>';
                
                    echo '</div>';
                    
                    // Search and replace bar (hidden by default) - inside note-header
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        echo '<div class="search-replace-bar" id="searchReplaceBar'.$row['id'].'" style="display: none;">';
                        echo '<div class="search-replace-controls">';
                        echo '<div class="search-replace-input-group">';
                        echo '<input type="text" class="search-replace-input" id="searchInput'.$row['id'].'" placeholder="'.t_h('search_replace.search_placeholder', [], 'Find...').'" autocomplete="off">';
                        echo '<span class="search-replace-count" id="searchCount'.$row['id'].'"></span>';
                        echo '</div>';
                        echo '<div class="search-replace-buttons">';
                        echo '<button type="button" class="search-replace-btn search-replace-prev-btn" id="searchPrevBtn'.$row['id'].'" title="'.t_h('search_replace.previous', [], 'Previous').'"><i class="lucide lucide-chevron-left"></i></button>';
                        echo '<button type="button" class="search-replace-btn search-replace-next-btn" id="searchNextBtn'.$row['id'].'" title="'.t_h('search_replace.next', [], 'Next').'"><i class="lucide lucide-chevron-right"></i></button>';
                        echo '<button type="button" class="search-replace-btn search-replace-close-btn" id="searchCloseBtn'.$row['id'].'" title="'.t_h('search_replace.close', [], 'Close').'"><i class="lucide lucide-x"></i></button>';
                        echo '</div>';
                        echo '</div>';
                        echo '<div class="search-replace-replace-row" id="searchReplaceRow'.$row['id'].'">';
                        echo '<div class="search-replace-input-group">';
                        echo '<input type="text" class="search-replace-input" id="replaceInput'.$row['id'].'" placeholder="'.t_h('search_replace.replace_placeholder', [], 'Replace...').'" autocomplete="off">';
                        echo '</div>';
                        echo '<div class="search-replace-buttons">';
                        echo '<button type="button" class="search-replace-btn" id="replaceBtn'.$row['id'].'" title="'.t_h('search_replace.replace_one', [], 'Replace').'">'.t_h('search_replace.replace', [], 'Replace').'</button>';
                        echo '<button type="button" class="search-replace-btn" id="replaceAllBtn'.$row['id'].'" title="'.t_h('search_replace.replace_all', [], 'Replace All').'">'.t_h('search_replace.replace_all', [], 'All').'</button>';
                        echo '</div>';
                        echo '</div>';
                        echo '</div>';
                    }
                    
                    echo '</div>';
                
                    // Tags container with folder: keep a hidden input for JS but remove the visible icon/input.
                    // Keep the .note-tags-row wrapper so CSS spacing is preserved; JS will render the editable tags UI inside the .name_tags element.
                    echo '<div class="note-tags-row">';
                    echo '<div class="folder-wrapper">';
                    echo '<span class="lucide lucide-folder icon_folder cursor-pointer" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'"></span>';
                    echo '<span class="folder_name cursor-pointer" data-action="show-move-folder-dialog" data-note-id="'.$row['id'].'" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'">'.htmlspecialchars($folder_path, ENT_QUOTES).'</span>';
                    echo '</div>';
                    
                    echo '<div class="tag-actions-dropdown">';
                    echo '<span class="lucide lucide-tag icon_tag cursor-pointer" data-action="toggle-tags-menu" data-note-id="'.$row['id'].'"></span>';
                    echo '<div id="tags-menu-'.$row['id'].'" class="dropdown-menu tags-actions-menu" hidden>';
                    echo '<button type="button" class="dropdown-item" data-action="navigate-tags"><i class="lucide lucide-tags"></i> ' . t_h('tags.list_all', [], 'List all tags') . '</button>';
                    echo '<button type="button" class="dropdown-item" data-action="show-tag-edit-modal" data-note-id="'.$row['id'].'"><i class="lucide lucide-pencil"></i> ' . t_h('tags.manage_note_tags', [], 'Manage note tags') . '</button>';
                    echo '</div>';
                    echo '</div>';

                    echo '<span class="name_tags">'
                        .'<input type="hidden" id="tags'.$row['id'].'" value="'.htmlspecialchars(str_replace(',', ' ', $row['tags'] ?? ''), ENT_QUOTES).'"/>'
                    .'</span>';
                    echo '</div>';
                
                    // Display attachments directly in the note if they exist
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data) && !empty($attachments_data)) {
                            // Get note content to check for inline images
                            $note_content = $row['entry'] ?? '';
                            
                            $attachment_links = [];
                            $visible_links_count = 0;
                            foreach ($attachments_data as $attachment) {
                                if (isset($attachment['id']) && isset($attachment['original_filename'])) {
                                    $original_filename = (string)$attachment['original_filename'];
                                    $safe_filename = htmlspecialchars($original_filename, ENT_QUOTES);
                                    
                                    // Check if this is an image attachment to hide IF it's in the content and setting is disabled
                                    $is_inline_image = false;
                                    if ($hide_inline_images) {
                                        $mime_type = $attachment['mime_type'] ?? '';
                                        $is_image = strpos($mime_type, 'image/') === 0;
                                        // Also check extension as fallback
                                        if (!$is_image && isset($attachment['original_filename'])) {
                                            $ext = strtolower(pathinfo($attachment['original_filename'], PATHINFO_EXTENSION));
                                            $is_image = in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
                                        }

                                        if ($is_image) {
                                            $attachment_id_pattern = 'attachments/' . $attachment['id'];
                                            // Check in raw content
                                            $is_inline_image = (strpos($note_content, $attachment_id_pattern) !== false);
                                            
                                            // If not found, try with escaped version just in case (e.g. for some specific editors)
                                            if (!$is_inline_image) {
                                                $is_inline_image = (strpos($note_content, urlencode($attachment_id_pattern)) !== false);
                                            }
                                        }
                                    }
                                    
                                    $link_style = $is_inline_image ? ' style="display: none;"' : '';
                                    $link_attr = $is_inline_image ? ' data-is-inline-image="true"' : '';
                                    $attachment_links[] = '<a href="#" class="attachment-link"' . $link_attr . $link_style . ' data-action="download-attachment" data-attachment-id="'.$attachment['id'].'" data-note-id="'.$row['id'].'" title="'.t_h('attachments.actions.download', ['filename' => $original_filename], 'Download {{filename}}').'">'.$safe_filename.'</a>';
                                    if (!$is_inline_image) $visible_links_count++;
                                }
                            }
                            $row_style = ($hide_inline_images && $visible_links_count === 0) ? ' style="display: none;"' : '';
                            echo '<div class="note-attachments-row"' . $row_style . '>';
                            // Make paperclip clickable to open attachments for this note (preserve workspace behavior via JS)
                            echo '<button type="button" class="icon-attachment-btn" title="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'" data-action="show-attachment-dialog" data-note-id="'.$row['id'].'" aria-label="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'"><span class="lucide lucide-paperclip icon_attachment"></span></button>';
                            echo '<span class="note-attachments-list">';
                            echo implode(' ', $attachment_links);
                            echo '</span>';
                            echo '</div>';
                        }
                    }
                    
                    // Hidden folder value for the note
                    echo '<input type="hidden" id="folder'.$row['id'].'" value="'.htmlspecialchars($row['folder'] ?: '', ENT_QUOTES).'"/>';
                    echo '<input type="hidden" id="folderId'.$row['id'].'" value="'.htmlspecialchars($row['folder_id'] ?: '', ENT_QUOTES).'"/>';
                    
                    // Title - disable for protected note
                    // If the heading is "New note" or "Nouvelle note" (or numbered variants), treat it as a placeholder
                    $heading = htmlspecialchars_decode($row['heading'] ?: 'New note');
                    $defaultMatch = [];
                    // Check for default titles in all supported languages
                    $isDefaultTitle = preg_match('/^(?:New note|Nouvelle note|Neue Notiz|Nueva nota|Nova nota)(?: \((\d+)\))?$/', $heading, $defaultMatch);
                    $titleValue = $isDefaultTitle ? '' : htmlspecialchars($heading, ENT_QUOTES, 'UTF-8');
                    if ($isDefaultTitle) {
                        $defaultNum = isset($defaultMatch[1]) && $defaultMatch[1] !== '' ? $defaultMatch[1] : null;
                        $titlePlaceholder = $defaultNum
                            ? t_h('index.note.new_note_numbered', ['number' => $defaultNum], 'New note ({{number}})')
                            : t_h('index.note.new_note', [], 'New note');
                    } else {
                        $titlePlaceholder = t_h('index.note.title_placeholder', [], 'Title ?');
                    }
                    echo '<h4><input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" id="inp'.$row['id'].'" type="text" placeholder="'.$titlePlaceholder.'" value="'.$titleValue.'"/></h4>';
                    // Subline: creation date and location (visible when enabled in settings)
                    $created_display = '';
                    if (!empty($final_created)) {
                        try {
                            // Use the already-converted timezone date from above
                            $dt = new DateTime($final_created);
                            $created_display = $dt->format('d/m/Y H:i');
                        } catch (Exception $e) {
                            $created_display = '';
                        }
                    }
                
                    $has_created = !empty($created_display) && $show_note_created_setting;

                    // Show the subline if created date setting is enabled
                    if ($show_note_created_setting && $has_created) {
                        echo '<div class="note-subline">';
                        echo '<span class="note-sub-created">' . htmlspecialchars($created_display, ENT_QUOTES) . '</span>';
                        echo '</div>';
                    }
                    
                    // Note content with font size style
                    $note_type = $row['type'] ?? 'note';
                    $data_attr = '';
                    
                    if ($note_type === 'tasklist') {
                        // For tasklist, properly encode JSON for HTML attribute from file content
                        $tasklist_json_raw = $entryfinal; // Use file content instead of database
                        $tasklist_json_encoded = htmlspecialchars($tasklist_json_raw, ENT_QUOTES);
                        $data_attr = ' data-tasklist-json="'.$tasklist_json_encoded.'"';
                        // Display empty content initially, will be replaced by JavaScript
                        $display_content = '';
                    }
                    
                    // For markdown notes, store the markdown content in a data attribute
                    if ($note_type === 'markdown') {
                        $markdown_content = htmlspecialchars($entryfinal, ENT_QUOTES);
                        $data_attr .= ' data-markdown-content="'.$markdown_content.'"';
                        // Start with the raw markdown displayed
                        $display_content = htmlspecialchars($entryfinal, ENT_NOQUOTES);
                    } else {
                        // For all other notes (HTML, Excalidraw), use the file content directly
                        $display_content = $entryfinal;
                        
                        // Unescape media tags if they were HTML-escaped in the content
                        // This allows iframes, audio, and video to render properly
                        $display_content = unescapeMediaInHtml($display_content);
                    }
                    
                    // All notes are now editable, including Excalidraw notes
                    $editable = 'true';
                    $excalidraw_attr = '';

                    $placeholder_desktop = t('index.editor.placeholder_desktop', [], 'Enter text, use / to open commands menu, paste images or drag-and-drop an image at the cursor.');
                    $placeholder_mobile = t('index.editor.placeholder_mobile', [], 'Enter text or paste images here...');
                    $placeholder_attr = ' data-ph="' . htmlspecialchars($placeholder_desktop, ENT_QUOTES) . '"';
                    // On mobile, slash command is not enabled for HTML + Markdown notes
                    if ($note_type === 'note' || $note_type === 'markdown') {
                        $placeholder_attr .= ' data-ph-mobile="' . htmlspecialchars($placeholder_mobile, ENT_QUOTES) . '"';
                    }

                    $linked_note_id_attr = '';
                    if (isset($row['linked_note_id']) && $row['linked_note_id']) {
                        $linked_note_id_attr = ' data-linked-note-id="'.$row['linked_note_id'].'"';
                    }
                    echo '<div class="noteentry" autocomplete="off" autocapitalize="off" spellcheck="false" id="entry'.$row['id'].'" data-note-id="'.$row['id'].'" data-note-heading="'.htmlspecialchars($row['heading'] ?? '', ENT_QUOTES).'"'.$placeholder_attr.' contenteditable="'.$editable.'" data-note-type="'.$note_type.'"'.$data_attr.$excalidraw_attr.$linked_note_id_attr.'>'.$display_content.'</div>';
                    echo '<div class="note-bottom-space"></div>';
                    echo '</div>';
                    echo '</div>';
                    
                    // Collect tasklist and markdown IDs for later initialization
                    if ($note_type === 'tasklist') {
                        $tasklist_ids[] = $row['id'];
                    }
                    if ($note_type === 'markdown') {
                        $markdown_ids[] = $row['id'];
                    }
                }
            }
        ?>        
    </div>
    
    <!-- Data for initialization (used by index-events.js) -->
    <?php if (!empty($tasklist_ids)): ?>
    <script type="application/json" id="tasklist-init-data"><?php echo json_encode($tasklist_ids); ?></script>
    <?php endif; ?>
    
    <?php if (!empty($markdown_ids)): ?>
    <script type="application/json" id="markdown-init-data"><?php echo json_encode($markdown_ids); ?></script>
    <?php endif; ?>
        
    </div>  <!-- Close main-container -->
    
</body>
<!-- Modules refactorisés de script.js -->
<script src="js/globals.js"></script>
<script src="js/workspaces.js"></script>
<script src="js/notes.js"></script>
<script src="js/ui.js"></script>
<script src="js/attachments.js"></script>
<script src="js/tags-modal.js"></script>
<!-- Event management modules -->
<script src="js/events-utils.js?v=<?php echo $v; ?>"></script>
<script src="js/events-auto-save.js?v=<?php echo $v; ?>"></script>
<script src="js/events-drag-drop.js?v=<?php echo $v; ?>"></script>
<script src="js/events-navigation.js?v=<?php echo $v; ?>"></script>
<script src="js/events-rich-text-editing.js?v=<?php echo $v; ?>"></script>
<script src="js/events-text-selection.js?v=<?php echo $v; ?>"></script>
<script src="js/utils.js?v=<?php echo $v; ?>"></script>
<script src="js/search-highlight.js?v=<?php echo $v; ?>"></script>
<script src="js/slash-command.js?v=<?php echo $v; ?>"></script>
<script src="js/share.js?v=<?php echo $v; ?>"></script>
<script src="js/folder-hierarchy.js?v=<?php echo $v; ?>"></script>
<script src="js/math-renderer.js?v=<?php echo $v; ?>"></script>
<script src="js/modals-events.js?v=<?php echo $v; ?>"></script>
<script src="js/index-events.js?v=<?php echo $v; ?>"></script>
<script src="js/main.js?v=<?php echo $v; ?>"></script>
<script src="js/resize-column.js?v=<?php echo $v; ?>"></script>
<script src="js/unified-search.js?v=<?php echo $v; ?>"></script>
<script src="js/clickable-tags.js?v=<?php echo $v; ?>"></script>
<script src="js/font-size-settings.js?v=<?php echo $v; ?>"></script>
<script src="js/index-icon-scale-settings.js?v=<?php echo $v; ?>&m=<?php echo @filemtime('js/index-icon-scale-settings.js') ?: time(); ?>"></script>
<script src="js/background-settings.js?v=<?php echo $v; ?>"></script>
<script src="js/tasklist.js?v=<?php echo $v; ?>"></script>
<script src="js/excalidraw.js?v=<?php echo $v; ?>"></script>
<script src="js/copy-code-on-focus.js?v=<?php echo $v; ?>"></script>
<script src="js/table-context-menu.js?v=<?php echo $v; ?>"></script>
<script src="js/system-menu.js?v=<?php echo $v; ?>"></script>
<script src="js/notes-list-events.js?v=<?php echo $v; ?>"></script>
<script src="js/folder-icon.js?v=<?php echo $v; ?>"></script>
<script src="js/kanban.js?v=<?php echo $v; ?>"></script>
<script src="js/tabs.js?v=<?php echo $v; ?>"></script>

<?php if ($note && is_numeric($note)): ?>
<!-- Data for draft check (used by index-events.js) -->
<script type="application/json" id="current-note-data"><?php echo json_encode(['noteId' => (string)$note]); ?></script>
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
                        // Redirect to home.php with auto_pull parameter
                        const homeUrl = new URL('home.php', window.location.href);
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
</html>
