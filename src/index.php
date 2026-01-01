<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Authentication check
require 'auth.php';
requireAuth();

ob_start();
require_once 'config.php';
include 'functions.php';
require_once 'version_helper.php';

include 'db_connect.php';

// Include new modular files
require_once 'page_init.php';
require_once 'search_handler.php';
require_once 'note_loader.php';
require_once 'favorites_handler.php';
require_once 'folders_display.php';

// Check if we need to redirect to include workspace from localStorage or default_workspace setting
// Only redirect if no workspace parameter is present in GET
if (!isset($_GET['workspace']) && !isset($_POST['workspace'])) {
    // Check for default workspace in database
    $defaultWorkspace = null;
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['default_workspace']);
        $defaultWorkspace = $stmt->fetchColumn();
        if ($defaultWorkspace === false || $defaultWorkspace === '') {
            $defaultWorkspace = null;
        }
    } catch (Exception $e) {
        $defaultWorkspace = null;
    }
    
    // If default workspace is set to a specific workspace (not __last_opened__), redirect with it
    if ($defaultWorkspace !== null && $defaultWorkspace !== '__last_opened__') {
        // Build redirect URL preserving other parameters
        $params = $_GET;
        $params['workspace'] = $defaultWorkspace;
        $queryString = http_build_query($params);
        header('Location: index.php?' . $queryString);
        exit;
    } else {
        // Use localStorage (either because default is __last_opened__ or no default is set)
        // Get first workspace from database to use as fallback
        $defaultWorkspace = '';
        try {
            $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
            $wsRow = $wsStmt->fetch(PDO::FETCH_ASSOC);
            $defaultWorkspace = $wsRow ? $wsRow['name'] : '';
        } catch (Exception $e) {}
        
        echo '<!DOCTYPE html><html><head><script>
        (function(){
            var defaultWs = ' . json_encode($defaultWorkspace) . ';
            try {
                var workspace = localStorage.getItem("poznote_selected_workspace");
                // Always redirect to include workspace parameter
                if (workspace && workspace !== "") {
                    var params = new URLSearchParams(window.location.search);
                    params.set("workspace", workspace);
                    window.location.href = "index.php?" + params.toString();
                } else {
                    // No workspace in localStorage, redirect with first available workspace
                    var params = new URLSearchParams(window.location.search);
                    params.set("workspace", defaultWs);
                    window.location.href = "index.php?" + params.toString();
                }
            } catch(e) {
                // If localStorage fails, redirect with first available workspace
                var params = new URLSearchParams(window.location.search);
                params.set("workspace", defaultWs);
                window.location.href = "index.php?" + params.toString();
            }
        })();
        </script></head><body></body></html>';
        // Don't exit here - let the page continue loading with first workspace as default
    }
}

// Initialization of workspaces and labels
initializeWorkspacesAndLabels($con);

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Display workspace name (for __last_opened__, get the actual workspace from localStorage via JavaScript)
if ($workspace_filter === '__last_opened__') {
    // Get first available workspace from database
    $displayWorkspace = '';
    try {
        $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
        $wsRow = $wsStmt->fetch(PDO::FETCH_ASSOC);
        $displayWorkspace = $wsRow ? htmlspecialchars($wsRow['name'], ENT_QUOTES) : '';
    } catch (Exception $e) {
        $displayWorkspace = '';
    }
} else {
    $displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);
}

// Load note-related data (res_right, default/current note folders)
// Ensure these variables exist for included templates
$note_load_result = loadNoteData($con, $note, $workspace_filter);
$default_note_folder = $note_load_result['default_note_folder'] ?? null;
$current_note_folder = $note_load_result['current_note_folder'] ?? null;
$res_right = $note_load_result['res_right'] ?? null;


// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Workspace filter already initialized above

// Load login display name for page title
$login_display_name = '';
try {
    $stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
    $stmt->execute(['login_display_name']);
    $login_display_name = $stmt->fetchColumn();
    if ($login_display_name === false) $login_display_name = '';
} catch (Exception $e) {
    $login_display_name = '';
}

?>

<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo htmlspecialchars($login_display_name !== '' ? $login_display_name : 'Poznote'); ?></title>
    <?php 
    // Cache version based on app version to force reload on updates
    $v = getAppVersion();
    ?>
    <script>
    (function(){
        try {
            var theme = localStorage.getItem('poznote-theme');
            if (!theme) {
                theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
            }
            var root = document.documentElement;
            root.setAttribute('data-theme', theme);
            root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
            root.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        } catch (e) {}
    })();
    </script>
    <meta name="color-scheme" content="dark light">
    <link type="text/css" rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/light.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/brands.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/solid.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/regular.min.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/index.css?v=<?php echo $v; ?>"/>
    <link rel="stylesheet" href="css/index-mobile.css?v=<?php echo $v; ?>" media="(max-width: 800px)">
    <link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/modals.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/tasks.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/markdown.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/excalidraw.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/excalidraw-unified.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/note-reference.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>"/>
    <link type="text/css" rel="stylesheet" href="js/katex/katex.min.css?v=<?php echo $v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $v; ?>"></script>
    <script src="js/toolbar.js?v=<?php echo $v; ?>"></script>
    <script src="js/checklist.js?v=<?php echo $v; ?>"></script>
    <script src="js/bulletlist.js?v=<?php echo $v; ?>"></script>
    <script src="js/note-loader-common.js?v=<?php echo $v; ?>"></script>
    <script src="js/note-reference.js?v=<?php echo $v; ?>"></script>
    <script src="js/markdown-handler.js?v=<?php echo $v; ?>"></script>
    <script src="js/mermaid/mermaid.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/katex/katex.min.js?v=<?php echo $v; ?>"></script>
    <script src="js/katex/auto-render.min.js?v=<?php echo $v; ?>"></script>

</head>

<?php
// Read settings to control body classes (so settings toggles affect index display on reload)
$extra_body_classes = '';
try {
    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['show_note_created']);
    $v1 = $stmt->fetchColumn();
    if ($v1 === '1' || $v1 === 'true') $extra_body_classes .= ' show-note-created';

    $stmt->execute(['show_note_subheading']);
    $v2 = $stmt->fetchColumn();
    if ($v2 === '1' || $v2 === 'true') $extra_body_classes .= ' show-note-subheading';

    $stmt->execute(['hide_folder_actions']);
    $v3 = $stmt->fetchColumn();
    if ($v3 === '1' || $v3 === 'true' || $v3 === null) $extra_body_classes .= ' folder-actions-always-visible';

    $stmt->execute(['hide_folder_counts']);
    $v4 = $stmt->fetchColumn();
    if ($v4 === '0' || $v4 === 'false') $extra_body_classes .= ' hide-folder-counts';

} catch (Exception $e) {
    // ignore errors and continue without extra classes
}

// Load note list sort preference to affect server-side note listing
$note_list_order_by = 'CASE WHEN folder_id IS NULL THEN 0 ELSE 1 END, folder, updated DESC';
$note_list_sort_type = 'updated_desc'; // default
try {
    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['note_list_sort']);
    $pref = $stmt->fetchColumn();
    
    // Check setting for notes without folders position
    $notes_without_folders_after = false;
    try {
        $stmtSetting = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmtSetting->execute(['notes_without_folders_after_folders']);
        $settingValue = $stmtSetting->fetchColumn();
        $notes_without_folders_after = ($settingValue === '1' || $settingValue === 'true');
    } catch (Exception $e) {
        // ignore, keep default
    }
    
    $folder_null_case = $notes_without_folders_after ? '1' : '0';
    $folder_case = $notes_without_folders_after ? '0' : '1';
    
    $allowed_sorts = [
        'updated_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, updated DESC",
        'created_desc' => "CASE WHEN folder_id IS NULL THEN $folder_null_case ELSE $folder_case END, folder, created DESC",
        'heading_asc'  => "folder, heading COLLATE NOCASE ASC"
    ];
    if ($pref && isset($allowed_sorts[$pref])) {
        $note_list_order_by = $allowed_sorts[$pref];
        $note_list_sort_type = $pref;
    }
} catch (Exception $e) {
    // ignore and keep default
}

// Set body classes
$body_classes = trim($extra_body_classes);
?>

<body<?php echo $body_classes ? ' class="' . htmlspecialchars($body_classes, ENT_QUOTES) . '"' : ''; ?>>
    <!-- Debug console info removed in production -->
    <script>
    // Global error handler to catch all JavaScript errors
    window.addEventListener('error', function(event) {
        console.error('JavaScript Error caught:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error,
            stack: event.error ? event.error.stack : 'No stack trace available'
        });
        
        // Specific handling for syntax errors that might prevent settings from working
        if (event.message.includes('Unexpected end of input') || event.message.includes('SyntaxError')) {
            console.warn('Syntax error detected - this may prevent display settings from working properly');
        }
        
        // Store in sessionStorage for inspection
        try {
            const errorInfo = {
                timestamp: new Date().toISOString(),
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : 'No stack trace'
            };
            sessionStorage.setItem('lastJSError', JSON.stringify(errorInfo));
        } catch (e) {
            // Ignore storage errors
        }
    });
    
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled Promise Rejection:', event.reason);
        try {
            const errorInfo = {
                timestamp: new Date().toISOString(),
                type: 'Promise Rejection',
                reason: event.reason.toString(),
                stack: event.reason.stack || 'No stack trace'
            };
            sessionStorage.setItem('lastPromiseError', JSON.stringify(errorInfo));
        } catch (e) {
            // Ignore storage errors
        }
    });
    
    // Helper function to check last errors (callable from console)
    window.checkLastErrors = function() {
        try {
            const lastJSError = sessionStorage.getItem('lastJSError');
            const lastPromiseError = sessionStorage.getItem('lastPromiseError');
            
            if (lastJSError) {
                console.log('Last JavaScript Error:', JSON.parse(lastJSError));
            }
            if (lastPromiseError) {
                console.log('Last Promise Error:', JSON.parse(lastPromiseError));
            }
            
            if (!lastJSError && !lastPromiseError) {
                console.log('No recent errors found.');
            }
        } catch (e) {
            console.log('Error checking stored errors:', e);
        }
    };
    </script>

    <script>
    // Restore folder states from localStorage
    document.addEventListener('DOMContentLoaded', function() {

        try {
            var folderContents = document.querySelectorAll('.folder-content');
            for (var i = 0; i < folderContents.length; i++) {
                var content = folderContents[i];
                var folderId = content.id;
                var savedState = localStorage.getItem('folder_' + folderId);

                if (savedState === 'closed') {
                    // add a closed class so CSS can hide it; existing code expects this state
                    content.classList.add('closed');
                }
            }
        } catch (e) {
            // ignore errors during initial folder state restoration
        }

        window.workspaceDisplayMap = <?php
            $display_map = generateWorkspaceDisplayMap($workspaces, $labels);
            $json_output = json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
            echo $json_output ?: '{}';
        ?>;

        // Update workspace title if using __last_opened__
        <?php if ($workspace_filter === '__last_opened__'): ?>
        try {
            var lastWorkspace = localStorage.getItem('poznote_selected_workspace');
            if (lastWorkspace && lastWorkspace !== '__last_opened__') {
                var titleElement = document.querySelector('.workspace-title-text');
                if (titleElement) {
                    // Use the display map to get the proper label
                    var displayName = window.workspaceDisplayMap[lastWorkspace] || lastWorkspace;
                    titleElement.textContent = displayName;
                }
            }
        } catch (e) {
            console.error('Error updating workspace title:', e);
        }
        <?php endif; ?>
    });
    </script>

    <?php include 'modals.php'; ?>
    
    <!-- LEFT COLUMN -->	
    <div id="left_col">
        
    <?php
    // Construction des conditions de recherche sécurisées
    $search_conditions = buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter);
    $where_clause = $search_conditions['where_clause'];
    $search_params = $search_conditions['search_params'];
    
    // Secure prepared queries
    $query_left_secure = "SELECT id, heading, folder, folder_id, favorite, created, updated, location, subheading, type FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    ?>

        
    <!-- MENU RIGHT COLUMN -->	 
    <div class="sidebar-header">
        <div class="sidebar-title-row">
            <div class="sidebar-title" role="button" tabindex="0" onclick="toggleWorkspaceMenu(event);">
                <img src="favicon.ico" class="workspace-title-icon" alt="Poznote" aria-hidden="true">
                <span class="workspace-title-text"><?php echo htmlspecialchars($displayWorkspace, ENT_QUOTES); ?></span>
                <i class="fa-caret-down workspace-dropdown-icon"></i>
            </div>
            <div class="sidebar-title-actions">
                <button class="sidebar-settings" onclick="navigateToDisplayOrSettings('settings.php');" title="<?php echo t_h('sidebar.settings', [], 'Settings'); ?>"><i class="fa-cog"></i></button>
                <button class="sidebar-plus" onclick="toggleCreateMenu();" title="<?php echo t_h('sidebar.create'); ?>"><i class="fa-plus-circle"></i></button>
            </div>

            <div class="workspace-menu" id="workspaceMenu"></div>
        </div>

    <script>
    function toggleSearchBar() {
        const searchContainer = document.getElementById('search-bar-container');
        const searchInput = document.getElementById('unified-search');
        const currentDisplay = window.getComputedStyle(searchContainer).display;
        
        if (currentDisplay === 'none') {
            // Ouvrir la barre de recherche
            searchContainer.style.display = 'block';
            localStorage.setItem('searchBarVisible', 'true');
            
            // Positionner le curseur dans le champ de recherche
            if (searchInput) {
                setTimeout(() => {
                    searchInput.focus();
                }, 100);
            }
        } else {
            // Fermer la barre de recherche
            searchContainer.style.display = 'none';
            localStorage.setItem('searchBarVisible', 'false');
            
            // Effacer la recherche en cours seulement s'il y a une recherche active
            if (window.isSearchMode && typeof clearUnifiedSearch === 'function') {
                clearUnifiedSearch();
            }
        }
    }
    
    // Restaurer l'état au chargement
    document.addEventListener('DOMContentLoaded', function() {
        const searchContainer = document.getElementById('search-bar-container');
        const isVisible = localStorage.getItem('searchBarVisible');
        
        // Forcer l'affichage si une recherche est active (search ou tags_search)
        if (window.isSearchMode) {
            searchContainer.style.display = 'block';
            localStorage.setItem('searchBarVisible', 'true');
        }
        // Par défaut, la barre est cachée si pas de recherche active
        else if (isVisible !== 'true') {
            searchContainer.style.display = 'none';
        }
    });
    </script>
    </div>
        
    <script>
    // Set configuration variables for the main page
    window.isSearchMode = <?php echo (!empty($search) || !empty($tags_search)) ? 'true' : 'false'; ?>;
    window.currentNoteFolder = <?php 
        if ($note != '' && empty($search) && empty($tags_search)) {
            $folder_value = $current_note_folder ?? '';
            echo json_encode($folder_value);
        } else if (isset($default_note_folder) && $default_note_folder && empty($search) && empty($tags_search)) {
            echo json_encode($default_note_folder);
        } else {
            echo 'null';
        }
    ?>;
    window.selectedWorkspace = <?php echo json_encode($workspace_filter ?? ''); ?>;
    </script>
                    
    <?php
        
        // Determine which folders should be open
        $is_search_mode = !empty($search) || !empty($tags_search);
        
        // Execute query for left column
        $stmt_left = $con->prepare($query_left_secure);
        $stmt_left->execute($search_params);
        
        // Execute query for right column 
        if ($is_search_mode) {
            // Pour le mode recherche, remplacer $res_right par les résultats de recherche
            $res_right = prepareSearchResults($con, $is_search_mode, $note, $search_conditions['where_clause'], $search_conditions['search_params'], $workspace_filter);
        }
        // Sinon, garder $res_right tel qu'il a été défini par loadNoteData
        
        // Group notes by folder for hierarchical display (now uses folder_id)
        $organized = organizeNotesByFolder($stmt_left, $con, $workspace_filter);
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
    <script>
    // Create menu functionality - now opens unified modal
    function toggleCreateMenu() {
        // Show the unified create modal instead of dropdown menu
        if (typeof showCreateModal === 'function') {
            showCreateModal();
        } else {
            console.error('showCreateModal function not available');
        }
    }
    
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('header-create-menu');
        var plusBtn = document.querySelector('.sidebar-plus');
        if (menu && plusBtn && !plusBtn.contains(e.target) && !menu.contains(e.target)) {
            menu.remove();
            plusBtn.setAttribute('aria-expanded', 'false');
        }
    });
    
    // Make function globally available
    window.toggleCreateMenu = toggleCreateMenu;
    
    // Task list creation function
    function createTaskListNote() {
        var params = new URLSearchParams({
            now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
            folder: selectedFolder,
            workspace: selectedWorkspace || getSelectedWorkspace(),
            type: 'tasklist'
        });
        
        fetch("api_insert_new.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(function(response) { return response.text(); })
        .then(function(data) {
            try {
                var res = JSON.parse(data);
                if(res.status === 1) {
                    window.scrollTo(0, 0);
                    var ws = encodeURIComponent(selectedWorkspace || getSelectedWorkspace());
                    window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
                } else {
                    showNotificationPopup(res.error || (window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list'), 'error');
                }
            } catch(e) {
                showNotificationPopup((window.t ? window.t('index.errors.create_task_list_prefix', null, 'Error creating task list: ') : 'Error creating task list: ') + data, 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
        });
    }
    
    // Make function globally available
    window.createTaskListNote = createTaskListNote;
    
    // Markdown note creation function
    function createMarkdownNote() {
        var params = new URLSearchParams({
            now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
            folder: selectedFolder,
            workspace: selectedWorkspace || getSelectedWorkspace(),
            type: 'markdown'
        });
        
        fetch("api_insert_new.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(function(response) { return response.text(); })
        .then(function(data) {
            try {
                var res = JSON.parse(data);
                if(res.status === 1) {
                    window.scrollTo(0, 0);
                    var ws = encodeURIComponent(selectedWorkspace || getSelectedWorkspace());
                    window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
                } else {
                    showNotificationPopup(res.error || (window.t ? window.t('index.errors.create_markdown_note', null, 'Error creating markdown note') : 'Error creating markdown note'), 'error');
                }
            } catch(e) {
                showNotificationPopup((window.t ? window.t('index.errors.create_markdown_note_prefix', null, 'Error creating markdown note: ') : 'Error creating markdown note: ') + data, 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
        });
    }
    
    // Make function globally available
    window.createMarkdownNote = createMarkdownNote;
    </script>
    
    <div class="resize-handle" id="resizeHandle"></div>
    

    
    <!-- RIGHT COLUMN -->	
    <div id="right_col">
            
        <?php        
            // Array to collect tasklist and markdown IDs for initialization
            $tasklist_ids = [];
            $markdown_ids = [];
                        
            // Check if we should display a note or nothing
            if ($res_right && $res_right) {
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
                
                    $filename = getEntryFilename($row["id"], $row["type"] ?? 'note');
                    $title = $row['heading'];
                    // Ensure we have a safe JSON-encoded title for JavaScript
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    $note_type = $row['type'] ?? 'note';
                    
                    if ($note_type === 'tasklist') {
                        // For task list notes, use the JSON content from file
                        $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
                        $tasklist_json = htmlspecialchars($entryfinal, ENT_QUOTES);
                    } else {
                        // For all other notes (including Excalidraw), use the HTML file content
                        $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
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

                    // Always preserve workspace parameter 
                    if (!empty($workspace_filter)) {
                        $home_params[] = 'workspace=' . urlencode($workspace_filter);
                    }
                    if (!empty($home_params)) {
                        $home_url .= '?' . implode('&', $home_params);
                    }
                
                    // Home button (mobile only)
                    echo '<button type="button" class="toolbar-btn btn-home mobile-home-btn" title="' . t_h('editor.toolbar.back_to_notes') . '" onclick="scrollToLeftColumn()"><i class="fa-home"></i></button>';
                    
                    // Text formatting buttons (save button removed - auto-save is now automatic)
                    echo '<button type="button" class="toolbar-btn btn-bold text-format-btn" title="' . t_h('editor.toolbar.bold') . '" onclick="document.execCommand(\'bold\')"><i class="fa-bold"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-italic text-format-btn" title="' . t_h('editor.toolbar.italic') . '" onclick="document.execCommand(\'italic\')"><i class="fa-italic"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-underline text-format-btn" title="' . t_h('editor.toolbar.underline') . '" onclick="document.execCommand(\'underline\')"><i class="fa-underline"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-strikethrough text-format-btn" title="' . t_h('editor.toolbar.strikethrough') . '" onclick="document.execCommand(\'strikeThrough\')"><i class="fa-strikethrough"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-link text-format-btn" title="' . t_h('editor.toolbar.link') . '" onclick="addLinkToNote()"><i class="fa-link"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-color text-format-btn" title="' . t_h('editor.toolbar.text_color') . '" onclick="toggleRedColor()"><i class="fa-palette"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-highlight text-format-btn" title="' . t_h('editor.toolbar.highlight') . '" onclick="toggleYellowHighlight()"><i class="fa-fill-drip"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ul text-format-btn" title="' . t_h('editor.toolbar.bullet_list') . '" onclick="document.execCommand(\'insertUnorderedList\')"><i class="fa-list-ul"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ol text-format-btn" title="' . t_h('editor.toolbar.numbered_list') . '" onclick="document.execCommand(\'insertOrderedList\')"><i class="fa-list-ol"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-text-height text-format-btn" title="' . t_h('editor.toolbar.font_size') . '" onclick="changeFontSize()"><i class="fa-text-height"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-code text-format-btn" title="' . t_h('editor.toolbar.code_block') . '" onclick="toggleCodeBlock()"><i class="fa-code"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-inline-code text-format-btn" title="' . t_h('editor.toolbar.inline_code') . '" onclick="toggleInlineCode()"><i class="fa-terminal"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-eraser text-format-btn" title="' . t_h('editor.toolbar.clear_formatting') . '" onclick="document.execCommand(\'removeFormat\')"><i class="fa-eraser"></i></button>';
                
                    // Task list order button (only visible for tasklist notes)
                    if ($note_type === 'tasklist') {
                        // Get current setting from database
                        $task_order = 'bottom'; // default
                        try {
                            $order_stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                            $order_stmt->execute(['tasklist_insert_order']);
                            $order_val = $order_stmt->fetchColumn();
                            if ($order_val === 'top') $task_order = 'top';
                        } catch (Exception $e) {
                            // Use default on error
                        }
                        $order_icon = $task_order === 'top' ? 'fa-arrow-up' : 'fa-arrow-down';
                        $order_title = $task_order === 'top' ? t_h('tasklist.add_to_top') : t_h('tasklist.add_to_bottom');
                        $active_class = $task_order === 'top' ? ' active' : '';
                        echo '<button type="button" class="toolbar-btn btn-task-order note-action-btn' . $active_class . '" title="' . $order_title . '" onclick="toggleTaskInsertOrder()"><i class="' . $order_icon . '"></i></button>';
                    }
                
                    // Excalidraw diagram button - insert at cursor position (hidden for markdown and tasklist notes)
                    if ($note_type !== 'markdown' && $note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-excalidraw note-action-btn" title="' . t_h('editor.toolbar.insert_excalidraw') . '" onclick="insertExcalidrawDiagram()"><i class="fal fa-paint-brush"></i></button>';
                    }
                
                    // Hide emoji button for tasklist notes
                    if ($note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="' . t_h('editor.toolbar.insert_emoji') . '" onclick="toggleEmojiPicker()"><i class="fa-smile"></i></button>';
                    }
                    
                    // Table and separator buttons
                    echo '<button type="button" class="toolbar-btn btn-table note-action-btn" title="' . t_h('editor.toolbar.insert_table') . '" onclick="toggleTablePicker()"><i class="fa-table"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-checklist note-action-btn" title="' . t_h('editor.toolbar.insert_checklist') . '" onclick="insertChecklist()"><i class="fa-list-check"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="' . t_h('editor.toolbar.add_separator') . '" onclick="insertSeparator()"><i class="fa-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-note-reference note-action-btn" title="' . t_h('editor.toolbar.insert_note_reference') . '" onclick="openNoteReferenceModal()"><i class="fa-at"></i></button>';

                
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

                    echo '<button type="button" class="toolbar-btn btn-favorite note-action-btn'.$favorite_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="fa-star-light"></i></button>';
                    $share_class = $is_shared ? ' is-shared' : '';
                    
                    // Share button
                    echo '<button type="button" class="toolbar-btn btn-share note-action-btn'.$share_class.'" title="'.t_h('index.toolbar.share_note', [], 'Share note').'" onclick="openPublicShareModal(\''.$row['id'].'\')"><i class="fa-cloud"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-attachment note-action-btn'.($attachments_count > 0 ? ' has-attachments' : '').'" title="'.t_h('index.toolbar.attachments_with_count', ['count' => $attachments_count], 'Attachments ({{count}})').'" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fa-paperclip"></i></button>';
                    
                    // Open in new tab button
                    echo '<button type="button" class="toolbar-btn btn-open-new-tab note-action-btn" title="'.t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab').'" onclick="openNoteInNewTab('.$row['id'].')"><i class="fa-external-link"></i></button>';

                    // Mobile overflow menu button (shown only on mobile via CSS)
                    // Marked as note-action-btn so it can be hidden during text selection (hide-on-selection)
                    echo '<button type="button" class="toolbar-btn mobile-more-btn note-action-btn" title="'.t_h('common.menu', [], 'Menu').'" onclick="toggleMobileToolbarMenu(this)" aria-haspopup="true" aria-expanded="false"><i class="fa-ellipsis"></i></button>';

                    // Mobile dropdown menu (actions moved here on mobile)
                    echo '<div class="dropdown-menu mobile-toolbar-menu" hidden role="menu" aria-label="'.t_h('index.toolbar.menu_actions', [], 'Menu actions').'">';

                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-duplicate\')"><i class="fa-copy"></i> '.t_h('common.duplicate', [], 'Duplicate').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-move\')"><i class="fa-folder-open"></i> '.t_h('common.move', [], 'Move').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-download\')"><i class="fa-download"></i> '.t_h('common.download', [], 'Download').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-open-new-tab\')"><i class="fa-external-link"></i> '.t_h('editor.toolbar.open_in_new_tab', [], 'Open in new tab').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-trash\')"><i class="fa-trash"></i> '.t_h('common.delete', [], 'Delete').'</button>';
                    echo '<button type="button" class="dropdown-item mobile-toolbar-item" role="menuitem" onclick="triggerMobileToolbarAction(this, \'.btn-info\')"><i class="fa-info-circle"></i> '.t_h('common.information', [], 'Information').'</button>';
                    echo '</div>';
                        
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
                    echo '<button type="button" class="toolbar-btn btn-duplicate note-action-btn" onclick="duplicateNote(\''.$row['id'].'\')" title="'.t_h('common.duplicate', [], 'Duplicate').'"><i class="fa-copy"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-move note-action-btn" onclick="showMoveFolderDialog(\''.$row['id'].'\')" title="'.t_h('common.move', [], 'Move').'"><i class="fa-folder-open"></i></button>';
                    
                    // Download button
                    echo '<button type="button" class="toolbar-btn btn-download note-action-btn" title="'.t_h('common.download', [], 'Download').'" onclick="showExportModal(\''.$row['id'].'\', \''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).', \''.$note_type.'\')"><i class="fa-download"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-trash note-action-btn" onclick="deleteNote(\''.$row['id'].'\')" title="'.t_h('common.delete', [], 'Delete').'"><i class="fa-trash"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-info note-action-btn" title="'.t_h('common.information', [], 'Information').'" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fa-info-circle"></i></button>';
                
                    echo '</div>';
                    echo '</div>';
                
                    // Tags container with folder: keep a hidden input for JS but remove the visible icon/input.
                    // Keep the .note-tags-row wrapper so CSS spacing is preserved; JS will render the editable tags UI inside the .name_tags element.
                    echo '<div class="note-tags-row">';
                    echo '<div class="folder-wrapper">';
                    echo '<span class="fa-folder icon_folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')" style="cursor: pointer;" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'"></span>';
                    echo '<span class="folder_name" onclick="showMoveFolderDialog(\''.$row['id'].'\')" style="cursor: pointer;" title="'.t_h('settings.folder.change_folder', [], 'Change folder').'">'.htmlspecialchars($folder_path, ENT_QUOTES).'</span>';
                    echo '</div>';
                    echo '<span class="fa-tag icon_tag" onclick="window.location=\'list_tags.php?workspace=\' + encodeURIComponent(window.selectedWorkspace || \'\')"></span>';
                    echo '<span class="name_tags">'
                        .'<input type="hidden" id="tags'.$row['id'].'" value="'.htmlspecialchars(str_replace(',', ' ', $row['tags'] ?? ''), ENT_QUOTES).'"/>'
                    .'</span>';
                    echo '</div>';
                
                    // Display attachments directly in the note if they exist
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data) && !empty($attachments_data)) {
                            echo '<div class="note-attachments-row">';
                            // Make paperclip clickable to open attachments for this note (preserve workspace behavior via JS)
                            echo '<button type="button" class="icon-attachment-btn" title="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'" onclick="showAttachmentDialog(\''.$row['id'].'\')" aria-label="'.t_h('attachments.actions.open_attachments', [], 'Open attachments').'"><span class="fa-paperclip icon_attachment"></span></button>';
                            echo '<span class="note-attachments-list">';
                            $attachment_links = [];
                            foreach ($attachments_data as $attachment) {
                                if (isset($attachment['id']) && isset($attachment['original_filename'])) {
                                    $original_filename = (string)$attachment['original_filename'];
                                    $safe_filename = htmlspecialchars($original_filename, ENT_QUOTES);
                                    $attachment_links[] = '<a href="#" class="attachment-link" onclick="downloadAttachment(\''.$attachment['id'].'\', \''.$row['id'].'\')" title="'.t_h('attachments.actions.download', ['filename' => $original_filename], 'Download {{filename}}').'">'.$safe_filename.'</a>';
                                }
                            }
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
                    echo '<h4><input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateidhead(this);" id="inp'.$row['id'].'" type="text" placeholder="'.$titlePlaceholder.'" value="'.$titleValue.'"/></h4>';
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
                
                    // Prepare subheading/location display (prefer explicit subheading, fallback to location)
                    $subheading_display = htmlspecialchars($row['subheading'] ?? ($row['location'] ?? ''), ENT_QUOTES, 'UTF-8');

                    // Determine whether we actually need to render the subline block.
                    $show_created_setting = false;
                    $show_subheading_setting = false;
                    try {
                        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                        $stmt->execute(['show_note_created']);
                        $v1 = $stmt->fetchColumn();
                        if ($v1 === '1' || $v1 === 'true') $show_created_setting = true;

                        $stmt->execute(['show_note_subheading']);
                        $v2 = $stmt->fetchColumn();
                        if ($v2 === '1' || $v2 === 'true') $show_subheading_setting = true;
                    } catch (Exception $e) {
                        // keep defaults (false) on error
                    }

                    $has_created = !empty($created_display) && $show_created_setting;
                    $has_subheading = !empty($subheading_display) && $show_subheading_setting;

                    // Show the subline if either setting is enabled, even if data is empty
                    if ($show_created_setting || $show_subheading_setting) {
                        echo '<div class="note-subline">';
                        echo '<span class="note-sub-created">' . ($has_created ? htmlspecialchars($created_display, ENT_QUOTES) : '') . '</span>';
                        if ($has_created && $show_subheading_setting) echo ' <span class="note-sub-sep">-</span> ';
                        // Subheading display with inline editing elements
                        // Render subheading as plain text (clickable, but not styled as a blue link)
                        if ($show_subheading_setting) {
                            if ($has_subheading) {
                                echo '<span class="subheading-link" id="subheading-display-'.$row['id'].'" onclick="openNoteInfoEdit('.$row['id'].')">' . $subheading_display . '</span>';
                            } else {
                                echo '<span class="subheading-link subheading-placeholder" id="subheading-display-'.$row['id'].'" onclick="openNoteInfoEdit('.$row['id'].')"><em>'.t_h('index.subheading.placeholder', [], 'Add subheading here').'</em></span>';
                            }
                        }
                        echo '<input type="text" id="subheading-input-'.$row['id'].'" class="inline-subheading-input" style="display:none;" value="'.htmlspecialchars($subheading_display, ENT_QUOTES, 'UTF-8').'" />';
                        echo '<button class="btn-inline-save" id="save-subheading-'.$row['id'].'" style="display:none;" onclick="saveSubheadingInline('.$row['id'].')">'.t_h('common.save', [], 'Save').'</button>';
                        echo '<button class="btn-inline-cancel" id="cancel-subheading-'.$row['id'].'" style="display:none;" onclick="cancelSubheadingInline('.$row['id'].')">'.t_h('common.cancel', [], 'Cancel').'</button>';
                        echo '</div>';
                    }
                
                    // Get font size from settings
                    $font_size = '16';
                    
                    try {
                        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                        $stmt->execute(['note_font_size']);
                        $font_size_value = $stmt->fetchColumn();
                        if ($font_size_value !== false) {
                            $font_size = $font_size_value;
                        }
                    } catch (Exception $e) {
                        // Use default if error
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

                    echo '<div class="noteentry" style="font-size:'.$font_size.'px;" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-note-id="'.$row['id'].'" data-note-heading="'.htmlspecialchars($row['heading'] ?? '', ENT_QUOTES).'"'.$placeholder_attr.' contenteditable="'.$editable.'" data-note-type="'.$note_type.'"'.$data_attr.$excalidraw_attr.'>'.$display_content.'</div>';
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
            } else {
                // Check if we're in search mode (search or tags search active)
                $is_search_active = !empty($search) || !empty($tags_search);
                
                if ($is_search_active) {
                    // intentionally left blank: no search results
                } else {
                    // intentionally left blank: no notes to display
                }
            }
        ?>        
    </div>
    
    <?php if (!empty($tasklist_ids)): ?>
    <!-- Initialize all tasklists -->
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initializeTaskList === 'function') {
            <?php foreach ($tasklist_ids as $tasklist_id): ?>
            initializeTaskList(<?php echo $tasklist_id; ?>, 'tasklist');
            <?php endforeach; ?>
        }
    });
    </script>
    <?php endif; ?>
    
    <?php if (!empty($markdown_ids)): ?>
    <!-- Initialize all markdown notes -->
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initializeMarkdownNote === 'function') {
            <?php foreach ($markdown_ids as $markdown_id): ?>
            initializeMarkdownNote(<?php echo $markdown_id; ?>);
            <?php endforeach; ?>
        }
    });
    </script>
    <?php endif; ?>
    
    <!-- Track opened note and process note references -->
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        // Track the currently opened note for recent notes list
        var noteEntry = document.querySelector('.noteentry[data-note-id]');
        if (noteEntry && typeof window.trackNoteOpened === 'function') {
            var noteId = noteEntry.getAttribute('data-note-id');
            var heading = noteEntry.getAttribute('data-note-heading');
            if (noteId && heading) {
                window.trackNoteOpened(noteId, heading);
            }
        }
        
        // Process note references [[Note Title]] in rendered content
        if (typeof window.processNoteReferences === 'function') {
            var noteEntries = document.querySelectorAll('.noteentry');
            noteEntries.forEach(function(entry) {
                // Only process for view mode or after markdown rendering
                window.processNoteReferences(entry);
            });
        }
    });
    </script>
        
    </div>  <!-- Close main-container -->
    <script>
        function startEditSubheading(noteId) {
            var disp = document.getElementById('subheading-display-' + noteId);
            var input = document.getElementById('subheading-input-' + noteId);
            var editBtn = document.getElementById('edit-subheading-' + noteId);
            var saveBtn = document.getElementById('save-subheading-' + noteId);
            var cancelBtn = document.getElementById('cancel-subheading-' + noteId);
            if (!disp || !input) return;
            disp.style.display = 'none';
            editBtn.style.display = 'none';
            input.style.display = 'inline-block';
            saveBtn.style.display = 'inline-block';
            cancelBtn.style.display = 'inline-block';
            input.focus();
            input.select();
        }

        function cancelSubheadingInline(noteId) {
            var disp = document.getElementById('subheading-display-' + noteId);
            var input = document.getElementById('subheading-input-' + noteId);
            var editBtn = document.getElementById('edit-subheading-' + noteId);
            var saveBtn = document.getElementById('save-subheading-' + noteId);
            var cancelBtn = document.getElementById('cancel-subheading-' + noteId);
            if (!disp || !input) return;
            input.style.display = 'none';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            disp.style.display = 'inline';
            editBtn.style.display = 'inline-block';
            // restore original value
            input.value = disp.textContent.trim();
        }

        function saveSubheadingInline(noteId) {
            var disp = document.getElementById('subheading-display-' + noteId);
            var input = document.getElementById('subheading-input-' + noteId);
            var editBtn = document.getElementById('edit-subheading-' + noteId);
            var saveBtn = document.getElementById('save-subheading-' + noteId);
            var cancelBtn = document.getElementById('cancel-subheading-' + noteId);
            if (!disp || !input) return;
            var newVal = input.value.trim();
            // POST to api_update_subheading.php
            var body = 'note_id=' + encodeURIComponent(noteId) + '&subheading=' + encodeURIComponent(newVal);
            fetch('api_update_subheading.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            }).then(r => r.json()).then(function(data) {
                if (data && data.success) {
                    disp.textContent = newVal || '';
                    cancelSubheadingInline(noteId);
                } else {
                    alert(window.t ? window.t('index.errors.failed_to_save_subheading', null, 'Failed to save heading') : 'Failed to save heading');
                }
            }).catch(function(e){ console.error(e); alert(window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error'); });
        }
        
        function openNoteInfoEdit(noteId) {
            var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
            if (window.selectedWorkspace && window.selectedWorkspace) {
                url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
            }
            window.location.href = url;
        }
    </script>
    
</body>
<script>
    function openNoteInfoEdit(noteId) {
        var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
        if (window.selectedWorkspace && window.selectedWorkspace) {
            url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
        }
        window.location.href = url;
    }
    
    // Navigate to display.php or settings.php with current workspace and note parameters
    function navigateToDisplayOrSettings(page) {
        var url = page;
        var params = [];
        
        // Add workspace parameter if selected
        if (window.selectedWorkspace && window.selectedWorkspace) {
            params.push('workspace=' + encodeURIComponent(window.selectedWorkspace));
        }
        
        // Add note parameter if currently viewing a note
        var urlParams = new URLSearchParams(window.location.search);
        var noteId = urlParams.get('note');
        if (noteId) {
            params.push('note=' + encodeURIComponent(noteId));
        }
        
        // Build final URL
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        window.location.href = url;
    }
</script>
<script src="js/index-config.js"></script>
<!-- Modules refactorisés de script.js -->
<script src="js/globals.js"></script>
<script src="js/workspaces.js"></script>
<script src="js/notes.js"></script>
<script src="js/ui.js"></script>
<script src="js/attachments.js"></script>
<script src="js/events.js"></script>
<script src="js/utils.js"></script>
<script src="js/search-highlight.js"></script>
<script src="js/toolbar.js"></script>
<script src="js/checklist.js?v=<?php echo $v; ?>"></script>
<script src="js/bulletlist.js?v=<?php echo $v; ?>"></script>
<script src="js/slash-command.js?v=<?php echo $v; ?>"></script>
<script src="js/share.js"></script>
<script src="js/folder-hierarchy.js?v=<?php echo $v; ?>"></script>
<script src="js/math-renderer.js?v=<?php echo $v; ?>"></script>
<script src="js/main.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/clickable-tags.js?v=<?php echo $v; ?>"></script>
<script src="js/font-size-settings.js?v=<?php echo $v; ?>"></script>
<script src="js/tasklist.js?v=<?php echo $v; ?>"></script>
<script src="js/excalidraw.js?v=<?php echo $v; ?>"></script>
<script src="js/copy-code-on-focus.js?v=<?php echo $v; ?>"></script>
<script src="js/table-context-menu.js?v=<?php echo $v; ?>"></script>

<script>
// Mobile navigation functionality
function scrollToRightColumn() {
    if (window.innerWidth < 800) {
        // On mobile, columns are in horizontal flex layout
        // We need to scroll the body horizontally
        const scrollAmount = window.innerWidth;
        document.documentElement.scrollLeft = scrollAmount;
        document.body.scrollLeft = scrollAmount;
        window.scrollTo({
            left: scrollAmount,
            behavior: 'smooth'
        });
    } else {
        // On desktop, use classic scrollIntoView
        const rightCol = document.getElementById('right_col');
        if (rightCol) {
            rightCol.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'start'
            });
        }
    }
}

function scrollToLeftColumn() {
    if (window.innerWidth < 800) {
        // On mobile, go back to the left column
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
        window.scrollTo({
            left: 0,
            behavior: 'smooth'
        });
    } else {
        // On desktop
        const leftCol = document.getElementById('left_col');
        if (leftCol) {
            leftCol.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'start'
            });
        }
    }
}



// Auto-scroll to right column when a note is loaded on mobile
function checkAndScrollToNote() {
    const isMobile = window.innerWidth <= 800;
    if (isMobile) {
        // Only scroll if there's a scroll parameter in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const shouldScroll = urlParams.has('scroll') && urlParams.get('scroll') === '1';
        
        if (shouldScroll) {
            setTimeout(function() {
                scrollToRightColumn();
                // Remove the scroll parameter from URL
                urlParams.delete('scroll');
                const newUrl = window.location.pathname + '?' + urlParams.toString();
                window.history.replaceState({}, '', newUrl);
            }, 100);
        }
    }
}

// Auto-scroll to right column when clicking on any element that loads a note
function handleNoteClick(event) {
    const isMobile = window.innerWidth <= 800;
    if (isMobile) {
        // Mark that we want to scroll after the note loads
        sessionStorage.setItem('shouldScrollToNote', 'true');
    }
}

// Add click listeners to all note-related elements
window.initializeNoteClickHandlers = function() {
    // Listen for clicks on note links and elements that might load notes
    const noteElements = document.querySelectorAll('a[href*="note="], .links_arbo_left, .note-title, .note-link');
    noteElements.forEach(element => {
        element.addEventListener('click', handleNoteClick);
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteClickHandlers();
    checkAndScrollToNote();
    
    // Initialize image click handlers for images in notes
    if (typeof reinitializeImageClickHandlers === 'function') {
        reinitializeImageClickHandlers();
    }
    
    // Check for unsaved drafts after note loads
    <?php if ($note && is_numeric($note)): ?>
    setTimeout(function() {
        if (typeof checkForUnsavedDraft === 'function') {
            // Check if this was a forced refresh (skip auto-restore in that case)
            var isRefresh = window.location.search.includes('_refresh=');
            checkForUnsavedDraft('<?php echo $note; ?>', isRefresh);
        }
    }, 500); // Small delay to ensure content is fully loaded
    <?php endif; ?>
});
</script>

</html>
