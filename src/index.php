<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Authentication check
require 'auth.php';
requireAuth();

ob_start();
require_once 'config.php';
require_once 'default_folder_settings.php';
include 'functions.php';

include 'db_connect.php';

// Include new modular files
require_once 'page_init.php';
require_once 'search_handler.php';
require_once 'note_loader.php';
require_once 'favorites_handler.php';
require_once 'folders_display.php';

// Create welcome note if this is a fresh installation (no notes exist)
try {
    $stmt = $con->query("SELECT COUNT(*) FROM entries");
    $noteCount = $stmt->fetchColumn();
    
    if ($noteCount == 0) {
        $welcomeContent = '<p>🎉 <strong>Welcome to Poznote!</strong></p>
<p>Your personal note-taking application is ready to use. Enjoy!</p>
<p><em>This welcome note can be deleted at any time.</em></p>
<hr>
<p><small>Version installed on ' . date('m/d/Y \a\t H:i') . '</small></p>';

        // Use the standard note creation function
        $result = createNote($con, 'Welcome to Poznote', $welcomeContent, 'Default', 'Poznote', 1);
        if (!$result['success']) {
            error_log("Failed to create welcome note: " . $result['error']);
        }
    }
} catch (Exception $e) {
    error_log("Error checking for welcome note: " . $e->getMessage());
}

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
        echo '<!DOCTYPE html><html><head><script>
        (function(){
            try {
                var workspace = localStorage.getItem("poznote_selected_workspace");
                // Always redirect to include workspace parameter, even for Poznote
                if (workspace && workspace !== "") {
                    var params = new URLSearchParams(window.location.search);
                    params.set("workspace", workspace);
                    window.location.href = "index.php?" + params.toString();
                } else {
                    // No workspace in localStorage, redirect with default Poznote
                    var params = new URLSearchParams(window.location.search);
                    params.set("workspace", "Poznote");
                    window.location.href = "index.php?" + params.toString();
                }
            } catch(e) {
                // If localStorage fails, redirect with default Poznote workspace
                var params = new URLSearchParams(window.location.search);
                params.set("workspace", "Poznote");
                window.location.href = "index.php?" + params.toString();
            }
        })();
        </script></head><body></body></html>';
        // Don't exit here - let the page continue loading with Poznote as default
    }
}

// Initialization of workspaces and labels
initializeWorkspacesAndLabels($con);

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Display workspace name (for __last_opened__, get the actual workspace from localStorage via JavaScript)
if ($workspace_filter === '__last_opened__') {
    // Default to Poznote but will be updated by JavaScript from localStorage
    $displayWorkspace = 'Poznote';
} else {
    $displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);
}

// Get the custom default folder name
$defaultFolderName = getDefaultFolderName($workspace_filter);

// Load note-related data (res_right, default/current note folders)
// Ensure these variables exist for included templates
$note_load_result = loadNoteData($con, $note, $workspace_filter, $defaultFolderName);
$default_note_folder = $note_load_result['default_note_folder'] ?? null;
$current_note_folder = $note_load_result['current_note_folder'] ?? null;
$res_right = $note_load_result['res_right'] ?? null;


// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Workspace filter already initialized above

?>

<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Poznote</title>
    <?php $v = '20251020.6'; // Cache version to force reload ?>
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
    <link type="text/css" rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>"/>
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $v; ?>"></script>
    <script src="js/toolbar.js?v=<?php echo $v; ?>"></script>
    <script src="js/note-loader-common.js?v=<?php echo $v; ?>"></script>
    <script src="js/markdown-handler.js?v=<?php echo $v; ?>"></script>

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
$note_list_order_by = 'folder, updated DESC';
try {
    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
    $stmt->execute(['note_list_sort']);
    $pref = $stmt->fetchColumn();
    $allowed_sorts = [
        'updated_desc' => 'folder, updated DESC',
        'created_desc' => 'folder, created DESC',
        'heading_asc'  => "folder, heading COLLATE NOCASE ASC"
    ];
    if ($pref && isset($allowed_sorts[$pref])) {
        $note_list_order_by = $allowed_sorts[$pref];
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
    $query_left_secure = "SELECT id, heading, folder, folder_id, favorite, created, location, subheading, type FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
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
                <button class="sidebar-display" onclick="navigateToDisplayOrSettings('display.php');" title="Display"><i class="fa-eye"></i></button>
                <button class="sidebar-settings" onclick="navigateToDisplayOrSettings('settings.php');" title="Settings">
                    <i class="fa-cog"></i>
                    <span class="update-badge" style="display: none;"></span>
                </button>
                <button class="sidebar-plus" onclick="toggleCreateMenu();" title="Create"><i class="fa-plus-circle"></i></button>
            </div>

            <div class="workspace-menu" id="workspaceMenu"></div>
        </div>

        <div class="contains_forms_search">
            <form id="unified-search-form" action="index.php" method="POST">
                <div class="unified-search-container">
                    <div class="searchbar-row searchbar-icon-row">
                        <div class="searchbar-input-wrapper">
                            <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Rechercher..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                            <span class="searchbar-icon"><span class="fa-search"></span></span>
                            <?php if (!empty($search) || !empty($tags_search)): ?>
                                <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="clear-icon">×</span></button>
                            <?php endif; ?>
                        </div>
                    </div>
                    <input type="hidden" id="search-notes-hidden" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" id="search-tags-hidden" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
                    <input type="hidden" id="search-in-notes" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags) ? '1' : ''); ?>">
                    <input type="hidden" id="search-in-tags" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
                </div>
            </form>
        </div>
    </div>
        
    <script>
    // Set configuration variables for the main page
    window.isSearchMode = <?php echo (!empty($search) || !empty($tags_search)) ? 'true' : 'false'; ?>;
    window.currentNoteFolder = <?php 
        if ($note != '' && empty($search) && empty($tags_search)) {
            $folder_value = $current_note_folder ?? $defaultFolderName ?? 'Default';
            echo json_encode($folder_value);
        } else if (isset($default_note_folder) && $default_note_folder && empty($search) && empty($tags_search)) {
            echo json_encode($default_note_folder);
        } else {
            echo 'null';
        }
    ?>;
    window.selectedWorkspace = <?php echo json_encode($workspace_filter ?? 'Poznote'); ?>;
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
        $folders = organizeNotesByFolder($stmt_left, $defaultFolderName, $con, $workspace_filter);
        
        // Handle favorites
        $folders = handleFavorites($folders);
        
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
        $folders = sortFolders($folders, $defaultFolderName, $workspace_filter);
        
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
            workspace: selectedWorkspace || 'Poznote',
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
                    var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                    window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
                } else {
                    showNotificationPopup(res.error || 'Error creating task list', 'error');
                }
            } catch(e) {
                showNotificationPopup('Error creating task list: ' + data, 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup('Network error: ' + error.message, 'error');
        });
    }
    
    // Make function globally available
    window.createTaskListNote = createTaskListNote;
    
    // Markdown note creation function
    function createMarkdownNote() {
        var params = new URLSearchParams({
            now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
            folder: selectedFolder,
            workspace: selectedWorkspace || 'Poznote',
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
                    var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                    window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
                } else {
                    showNotificationPopup(res.error || 'Error creating markdown note', 'error');
                }
            } catch(e) {
                showNotificationPopup('Error creating markdown note: ' + data, 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup('Network error: ' + error.message, 'error');
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
                    echo '<button type="button" class="toolbar-btn btn-home mobile-home-btn" title="Back to notes" onclick="scrollToLeftColumn()"><i class="fa-home"></i></button>';
                    
                    // Text formatting buttons (save button removed - auto-save is now automatic)
                    echo '<button type="button" class="toolbar-btn btn-bold text-format-btn" title="Bold" onclick="document.execCommand(\'bold\')"><i class="fa-bold"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-italic text-format-btn" title="Italic" onclick="document.execCommand(\'italic\')"><i class="fa-italic"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-underline text-format-btn" title="Underline" onclick="document.execCommand(\'underline\')"><i class="fa-underline"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-strikethrough text-format-btn" title="Strikethrough" onclick="document.execCommand(\'strikeThrough\')"><i class="fa-strikethrough"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-link text-format-btn" title="Link" onclick="addLinkToNote()"><i class="fa-link"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-color text-format-btn" title="Text color" onclick="toggleRedColor()"><i class="fa-palette"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-highlight text-format-btn" title="Highlight" onclick="toggleYellowHighlight()"><i class="fa-fill-drip"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ul text-format-btn" title="Bullet list" onclick="document.execCommand(\'insertUnorderedList\')"><i class="fa-list-ul"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ol text-format-btn" title="Numbered list" onclick="document.execCommand(\'insertOrderedList\')"><i class="fa-list-ol"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-text-height text-format-btn" title="Font size" onclick="changeFontSize()"><i class="fa-text-height"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-code text-format-btn" title="Code block" onclick="toggleCodeBlock()"><i class="fa-code"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-inline-code text-format-btn" title="Inline code" onclick="toggleInlineCode()"><i class="fa-terminal"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-eraser text-format-btn" title="Clear formatting" onclick="document.execCommand(\'removeFormat\')"><i class="fa-eraser"></i></button>';
                
                    // Excalidraw diagram button - insert at cursor position (hidden for markdown and tasklist notes)
                    if ($note_type !== 'markdown' && $note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-excalidraw note-action-btn" title="Insert Excalidraw diagram" onclick="insertExcalidrawDiagram()"><i class="fal fa-paint-brush"></i></button>';
                    }
                
                    // Hide emoji button for tasklist notes
                    if ($note_type !== 'tasklist') {
                        echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fa-smile"></i></button>';
                    }
                    
                    // Table and separator buttons
                    echo '<button type="button" class="toolbar-btn btn-table note-action-btn" title="Insert table" onclick="toggleTablePicker()"><i class="fa-table"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-checklist note-action-btn" title="Insert checklist" onclick="insertChecklist()"><i class="fa-list-check"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="Add separator" onclick="insertSeparator()"><i class="fa-minus"></i></button>';
                
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
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';

                    echo '<button type="button" class="toolbar-btn btn-favorite note-action-btn'.$favorite_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="fa-star-light"></i></button>';
                    $share_class = $is_shared ? ' is-shared' : '';
                    
                    // Share button
                    echo '<button type="button" class="toolbar-btn btn-share note-action-btn'.$share_class.'" title="Share note" onclick="openPublicShareModal(\''.$row['id'].'\')"><i class="fa-share-nodes"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-attachment note-action-btn'.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments ('.$attachments_count.')" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fa-paperclip"></i></button>';
                        
                    // Generate dates safely for JavaScript with robust encoding
                    $created_raw = $row['created'] ?? '';
                    $updated_raw = $row['updated'] ?? '';
                    
                    // Clean and validate dates
                    $created_clean = trim($created_raw);
                    $updated_clean = trim($updated_raw);
                    
                    // Use timestamp validation and formatting for safety
                    $created_timestamp = strtotime($created_clean);
                    $updated_timestamp = strtotime($updated_clean);
                    
                    $final_created = $created_timestamp ? date('Y-m-d H:i:s', $created_timestamp) : date('Y-m-d H:i:s');
                    $final_updated = $updated_timestamp ? date('Y-m-d H:i:s', $updated_timestamp) : date('Y-m-d H:i:s');
                    
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
                    $folder_name = $row['folder'] ?? $defaultFolderName;
                    if (isDefaultFolder($folder_name, $workspace_filter)) $folder_name = 'Non classé';
                    $is_favorite = intval($row['favorite'] ?? 0);
                    $tags_data = $row['tags'] ?? '';
                    
                    // Encode additional data safely for JavaScript
                    $folder_json = json_encode($folder_name, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $favorite_json = json_encode($is_favorite, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $tags_json = json_encode($tags_data, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $attachments_count_json = json_encode($attachments_count, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    // Safety checks
                    if ($folder_json === false) $folder_json = '"' . $defaultFolderName . '"';
                    if ($favorite_json === false) $favorite_json = '0';
                    if ($tags_json === false) $tags_json = '""';
                    if ($attachments_count_json === false) $attachments_count_json = '0';
                    
                    // Escape for HTML attributes
                    $folder_json_escaped = htmlspecialchars($folder_json, ENT_QUOTES);
                    $favorite_json_escaped = htmlspecialchars($favorite_json, ENT_QUOTES);
                    $tags_json_escaped = htmlspecialchars($tags_json, ENT_QUOTES);
                    $attachments_count_json_escaped = htmlspecialchars($attachments_count_json, ENT_QUOTES);
                    
                    // Individual action buttons
                    echo '<button type="button" class="toolbar-btn btn-duplicate note-action-btn" onclick="duplicateNote(\''.$row['id'].'\')" title="Duplicate"><i class="fa-copy"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-move note-action-btn" onclick="showMoveFolderDialog(\''.$row['id'].'\')" title="Move"><i class="fa-folder-open"></i></button>';
                    
                    // Download button for all note types
                    echo '<button type="button" class="toolbar-btn btn-download note-action-btn" title="Download" onclick="downloadNote(\''.$row['id'].'\', \''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).', \''.$note_type.'\')"><i class="fa-download"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-trash note-action-btn" onclick="deleteNote(\''.$row['id'].'\')" title="Delete"><i class="fa-trash"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-info note-action-btn" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fa-info-circle"></i></button>';
                
                    echo '</div>';
                    echo '</div>';
                
                    // Tags container: keep a hidden input for JS but remove the visible icon/input.
                    // Keep the .note-tags-row wrapper so CSS spacing is preserved; JS will render the editable tags UI inside the .name_tags element.
                    echo '<div class="note-tags-row">';
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
                            echo '<button type="button" class="icon-attachment-btn" title="Open attachments" onclick="showAttachmentDialog(\''.$row['id'].'\')" aria-label="Open attachments"><span class="fa-paperclip icon_attachment"></span></button>';
                            echo '<span class="note-attachments-list">';
                            $attachment_links = [];
                            foreach ($attachments_data as $attachment) {
                                if (isset($attachment['id']) && isset($attachment['original_filename'])) {
                                    $safe_filename = htmlspecialchars($attachment['original_filename'], ENT_QUOTES);
                                    $attachment_links[] = '<a href="#" class="attachment-link" onclick="downloadAttachment(\''.$attachment['id'].'\', \''.$row['id'].'\')" title="Download '.$safe_filename.'">'.$safe_filename.'</a>';
                                }
                            }
                            echo implode(' ', $attachment_links);
                            echo '</span>';
                            echo '</div>';
                        }
                    }
                    
                    // Hidden folder value for the note
                    echo '<input type="hidden" id="folder'.$row['id'].'" value="'.htmlspecialchars($row['folder'] ?: $defaultFolderName, ENT_QUOTES).'"/>';
                    echo '<input type="hidden" id="folderId'.$row['id'].'" value="'.htmlspecialchars($row['folder_id'] ?: '', ENT_QUOTES).'"/>';
                    
                    // Title - disable for protected note
                    echo '<h4><input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateidhead(this);" id="inp'.$row['id'].'" type="text" placeholder="Title ?" value="'.htmlspecialchars(htmlspecialchars_decode($row['heading'] ?: 'New note'), ENT_QUOTES, 'UTF-8').'"/></h4>';
                    // Subline: creation date and location (visible when enabled in settings)
                    $created_display = '';
                    if (!empty($row['created'])) {
                        try {
                            $dt = new DateTime($row['created']);
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
                                echo '<span class="subheading-link subheading-placeholder" id="subheading-display-'.$row['id'].'" onclick="openNoteInfoEdit('.$row['id'].')"><em>Add subheading here</em></span>';
                            }
                        }
                        echo '<input type="text" id="subheading-input-'.$row['id'].'" class="inline-subheading-input" style="display:none;" value="'.htmlspecialchars($subheading_display, ENT_QUOTES, 'UTF-8').'" />';
                        echo '<button class="btn-inline-save" id="save-subheading-'.$row['id'].'" style="display:none;" onclick="saveSubheadingInline('.$row['id'].')">Save</button>';
                        echo '<button class="btn-inline-cancel" id="cancel-subheading-'.$row['id'].'" style="display:none;" onclick="cancelSubheadingInline('.$row['id'].')">Cancel</button>';
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
                    
                    echo '<div class="noteentry" style="font-size:'.$font_size.'px;" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-ph="Enter text, paste images, or drag-and-drop an image at the cursor." contenteditable="'.$editable.'" data-note-type="'.$note_type.'"'.$data_attr.$excalidraw_attr.'>'.$display_content.'</div>';
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
                    alert('Failed to save heading');
                }
            }).catch(function(e){ console.error(e); alert('Network error'); });
        }
        
        function openNoteInfoEdit(noteId) {
            var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
            if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
                url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
            }
            window.location.href = url;
        }
    </script>
    
</body>
<script>
    function openNoteInfoEdit(noteId) {
        var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
        if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
            url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
        }
        window.location.href = url;
    }
    
    // Navigate to display.php or settings.php with current workspace and note parameters
    function navigateToDisplayOrSettings(page) {
        var url = page;
        var params = [];
        
        // Add workspace parameter if selected
        if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
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
<script src="js/share.js"></script>
<script src="js/folder-hierarchy.js?v=<?php echo $v; ?>"></script>
<script src="js/main.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/clickable-tags.js?v=<?php echo $v; ?>"></script>
<script src="js/font-size-settings.js?v=<?php echo $v; ?>"></script>
<script src="js/tasklist.js?v=<?php echo $v; ?>"></script>
<script src="js/excalidraw.js?v=<?php echo $v; ?>"></script>
<script src="js/copy-code-on-focus.js?v=<?php echo $v; ?>"></script>

<script>
// Mobile navigation functionality
function scrollToRightColumn() {
    const rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'start'
        });
    }
}

function scrollToLeftColumn() {
    const leftCol = document.getElementById('left_col');
    if (leftCol) {
        leftCol.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'start'
        });
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
    initializeMarkdownSplitView();
    
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
        if (noteId && typeof window.initializeMarkdownNote === 'function') {
            // Clear existing markdown setup and re-initialize
            noteEntry.querySelector('.markdown-editor')?.remove();
            noteEntry.querySelector('.markdown-preview')?.remove();
            
            // Remove existing toolbar buttons
            var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
            if (toolbar) {
                toolbar.querySelector('.markdown-edit-btn')?.remove();
                toolbar.querySelector('.markdown-preview-btn')?.remove();
            }
            
            window.initializeMarkdownNote(noteId);
        }
    });
    
    // No need for help messages anymore
};
</script>

</html>
