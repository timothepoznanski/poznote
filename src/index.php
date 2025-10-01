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

// Initialization of workspaces and labels
initializeWorkspacesAndLabels($con);

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

$displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);

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

<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Poznote</title>
    <link type="text/css" rel="stylesheet" href="css/index.css"/>
    <link type="text/css" rel="stylesheet" href="css/modals.css"/>
    <link type="text/css" rel="stylesheet" href="css/tasks.css"/>
    <link rel="stylesheet" href="css/index_mobile.css" media="(max-width: 800px)">
    <script src="js/toolbar.js"></script>
    <script src="js/note-loader-common.js"></script>
    <script>
    var isNarrowViewport = window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
    
    // Safe handler for mobile home button - available immediately
    function handleMobileHomeClick() {
        if (typeof window.goBackToNoteList === 'function') {
            window.goBackToNoteList();
        } else {
            // Fallback behavior if the main function isn't loaded yet
            console.warn('goBackToNoteList not yet loaded, using fallback');
            if (window.matchMedia('(max-width: 800px)').matches) {
                document.body.classList.remove('note-open');
                window.isLoadingNote = false;
            }
            const url = new URL(window.location);
            url.searchParams.delete('note');
            window.history.pushState({}, '', url);
        }
        
        if (isNarrowViewport) {
            var mobileScript = document.createElement('script');
            mobileScript.src = 'js/note-loader-mobile.js';
            document.head.appendChild(mobileScript);
        } else {
            var desktopScript = document.createElement('script');
            desktopScript.src = 'js/note-loader-desktop.js';
            document.head.appendChild(desktopScript);
        }
    }
    </script>

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
    if ($v3 === '0' || $v3 === 'false') $extra_body_classes .= ' folder-actions-always-visible';

    $stmt->execute(['hide_folder_counts']);
    $v4 = $stmt->fetchColumn();
    if ($v4 === '1' || $v4 === 'true' || $v4 === null) $extra_body_classes .= ' hide-folder-counts';

    $stmt->execute(['show_trash_button']);
    $show_trash_button = $stmt->fetchColumn();
    $show_trash_button = ($show_trash_button === '1' || $show_trash_button === 'true');
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
    $query_left_secure = "SELECT id, heading, folder, favorite, created, location, subheading FROM entries WHERE $where_clause ORDER BY " . $note_list_order_by;
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    ?>

        
    <!-- MENU RIGHT COLUMN -->	 
    <div class="sidebar-header">
        <div class="sidebar-title-row">
            <div class="sidebar-title" role="button" tabindex="0" onclick="toggleWorkspaceMenu(event);">
                <img src="favicon.ico" class="workspace-title-icon" alt="Poznote" aria-hidden="true">
                <span class="workspace-title-text"><?php echo htmlspecialchars($displayWorkspace, ENT_QUOTES); ?></span>
            </div>
            <div class="sidebar-title-actions">
                <button class="sidebar-plus" onclick="toggleCreateMenu();" title="Create"><i class="fa-plus"></i></button>
            </div>

            <div class="workspace-menu desktop-only" id="workspaceMenu"></div>
            <div class="workspace-menu mobile-only" id="workspaceMenuMobile"></div>
        </div>

        <div class="contains_forms_search searchbar-desktop desktop-only">
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

        <div class="contains_forms_search mobile-search-container mobile-only">
            <form id="unified-search-form-mobile" action="index.php" method="POST">
                <div class="unified-search-container mobile">
                    <div class="searchbar-row searchbar-icon-row">
                        <div class="searchbar-input-wrapper">
                            <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search-mobile" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Rechercher..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                            <span class="searchbar-icon"><span class="fa-search"></span></span>
                            <?php if (!empty($search) || !empty($tags_search)): ?>
                                <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="clear-icon">×</span></button>
                            <?php endif; ?>
                        </div>
                    </div>
                    <input type="hidden" id="search-notes-hidden-mobile" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" id="search-tags-hidden-mobile" name="search_tags_hidden_mobile" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
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
        
        // Group notes by folder for hierarchical display
        $folders = organizeNotesByFolder($stmt_left, $defaultFolderName);
        
        // Handle favorites
        $folders = handleFavorites($folders);
        
        // Track folders with search results for favorites
        $folders_with_results = [];
        if($is_search_mode) {
            foreach($folders as $folderName => $notes) {
                if (!empty($notes)) {
                    $folders_with_results[$folderName] = true;
                }
            }
            $folders_with_results = updateFavoritesSearchResults($folders_with_results, $folders);
        }
        
        // Add empty folders from folders table
        $folders = addEmptyFolders($con, $folders, $workspace_filter);
        
        // Sort folders
        $folders = sortFolders($folders, $defaultFolderName, $workspace_filter);
        
        // Get total notes count for folder opening logic
        $total_notes = getTotalNotesCount($con, $workspace_filter);
        
        // Notes list left column
        include 'notes_list.php';                 
    ?>

    </div>
    <script>
    // Create menu functionality with debugging
    function toggleCreateMenu() {
        var existingMenu = document.getElementById('header-create-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }
        
        var createMenu = document.createElement('div');
        createMenu.id = 'header-create-menu';
        
        // Note item
        var noteItem = document.createElement('button');
        noteItem.className = 'create-menu-item';
        noteItem.innerHTML = '<i class="fa-file-alt"></i>Note';
        noteItem.onclick = function() {
            // Use in-page creation flow instead of opening a new tab
            if (typeof newnote === 'function') {
                newnote();
            } else if (typeof createNewNote === 'function') {
                createNewNote();
            } else if (window.NoteManager && typeof window.NoteManager.createNote === 'function') {
                window.NoteManager.createNote();
            } else {
                // Fallback: open insert_new.php if JS handlers are unavailable
                window.open('insert_new.php', '_blank');
            }
            createMenu.remove();
        };
        
        // Folder item
        var folderItem = document.createElement('button');
        folderItem.className = 'create-menu-item';
        folderItem.innerHTML = '<i class="fa-folder"></i>Folder';
        folderItem.onclick = function() {
            newFolder();
            createMenu.remove();
        };
        
        // Task list item
        var taskListItem = document.createElement('button');
        taskListItem.className = 'create-menu-item';
        taskListItem.innerHTML = '<i class="fa-list-ul"></i>Task list';
        taskListItem.onclick = function() {
            createTaskListNote();
            createMenu.remove();
        };

        // Workspace item
        var workspaceItem = document.createElement('button');
            workspaceItem.className = 'create-menu-item';
            workspaceItem.innerHTML = '<i class="fa-layer-group"></i>Workspace';
        workspaceItem.onclick = function() {
            // Navigate to the workspaces management page
            window.location = 'workspaces.php';
            createMenu.remove();
        };
        
        createMenu.appendChild(noteItem);
        createMenu.appendChild(folderItem);
        createMenu.appendChild(taskListItem);
    createMenu.appendChild(workspaceItem);
        
        var plusButton = document.querySelector('.sidebar-plus');
        if (plusButton && plusButton.parentNode) {
            plusButton.parentNode.appendChild(createMenu);
            createMenu.style.display = 'block';
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
        
        fetch("insert_new.php", {
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
                    window.location.href = "index.php?workspace=" + ws + "&note=" + res.id;
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
    </script>
    
    <div class="resize-handle" id="resizeHandle"></div>
    
    <!-- RIGHT COLUMN -->	
    <div id="right_col">
            
        <?php        
            // Array to collect tasklist IDs for initialization
            $tasklist_ids = [];
                        
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
                    // Ensure a share-related CSS class is always defined for both desktop and mobile UI
                    $share_class = $is_shared ? ' is-shared' : '';
                
                    $filename = getEntriesRelativePath() . $row["id"] . ".html";
                    $title = $row['heading'];
                    // Ensure we have a safe JSON-encoded title for JavaScript (used by both desktop and mobile)
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    $note_type = $row['type'] ?? 'note';
                    
                    if ($note_type === 'tasklist') {
                        // For task list notes, use the database content (JSON) instead of HTML file
                        $entryfinal = '';
                        $tasklist_json = htmlspecialchars($row['entry'] ?? '', ENT_QUOTES);
                    } else {
                        // For regular notes, use the HTML file content
                        $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
                        $tasklist_json = '';
                    }
               
                    // Harmonized desktop/mobile display:
                    echo '<div id="note'.$row['id'].'" class="notecard">';
                    echo '<div class="innernote">';
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

                    // Always preserve workspace if it's not the default
                    if (!empty($workspace_filter) && $workspace_filter !== 'Poznote') {
                        $home_params[] = 'workspace=' . urlencode($workspace_filter);
                    }
                    if (!empty($home_params)) {
                        $home_url .= '?' . implode('&', $home_params);
                    }
                
                    // mobile-only home button
                    echo '<button type="button" class="toolbar-btn btn-home mobile-only" title="Home" onclick="handleMobileHomeClick()"><i class="fa-home"></i></button>';
                    
                    // Text formatting buttons (visible only during selection on desktop)
                    echo '<button type="button" class="toolbar-btn btn-bold text-format-btn" title="Bold" onclick="document.execCommand(\'bold\')"><i class="fa-bold"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-italic text-format-btn" title="Italic" onclick="document.execCommand(\'italic\')"><i class="fa-italic"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-underline text-format-btn" title="Underline" onclick="document.execCommand(\'underline\')"><i class="fa-underline"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-strikethrough text-format-btn" title="Strikethrough" onclick="document.execCommand(\'strikeThrough\')"><i class="fa-strikethrough"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-link text-format-btn" title="Link" onclick="addLinkToNote()"><i class="fa-link"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-unlink text-format-btn" title="Remove link" onclick="document.execCommand(\'unlink\')"><i class="fa-unlink"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-color text-format-btn" title="Text color" onclick="toggleRedColor()"><i class="fa-palette"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-highlight text-format-btn" title="Highlight" onclick="toggleYellowHighlight()"><i class="fa-fill-drip"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ul text-format-btn" title="Bullet list" onclick="document.execCommand(\'insertUnorderedList\')"><i class="fa-list-ul"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-list-ol text-format-btn" title="Numbered list" onclick="document.execCommand(\'insertOrderedList\')"><i class="fa-list-ol"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-text-height text-format-btn" title="Font size" onclick="changeFontSize()"><i class="fa-text-height"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-code text-format-btn" title="Code block" onclick="toggleCodeBlock()"><i class="fa-code"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-inline-code text-format-btn" title="Inline code" onclick="toggleInlineCode()"><i class="fa-terminal"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-eraser text-format-btn" title="Clear formatting" onclick="document.execCommand(\'removeFormat\')"><i class="fa-eraser"></i></button>';
                
                    echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fa-smile"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-save note-action-btn" title="Save note" onclick="saveFocusedNoteJS()"><i class="fa-save"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="Add separator" onclick="insertSeparator()"><i class="fa-minus"></i></button>';
                    if (isAIEnabled()) {
                        echo '<div class="ai-dropdown">';
                        echo '<button type="button" class="toolbar-btn btn-ai note-action-btn" title="AI actions" onclick="toggleAIMenu(event, \''.$row['id'].'\')"><i class="fa-robot-svg"></i></button>';
                        echo '<div class="ai-menu" id="aiMenu-'.$row['id'].'">';
                        echo '<div class="ai-menu-item" onclick="generateAISummary(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-align-left"></i>';
                        echo '<span>Summarize</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="checkErrors(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-check-light-full"></i>';
                        echo '<span>Check content</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="autoGenerateTags(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-tags"></i>';
                        echo '<span>AI tags</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="window.location = \'ai.php\'; closeAIMenu();">';
                        echo '<i class="fa-cog"></i>';
                        echo '<span>AI settings</span>';
                        echo '</div>';
                        echo '</div>';
                        echo '</div>';
                    }
                
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
                    echo '<button type="button" class="toolbar-btn btn-share note-action-btn'.$share_class.'" title="Share note" onclick="openPublicShareModal(\''.$row['id'].'\')"><i class="fa-square-share-nodes-svg"></i></button>';
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
                    
                    // Trash button in toolbar (if enabled)
                    if ($show_trash_button) {
                        echo '<button type="button" class="toolbar-btn btn-trash note-action-btn" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fa-trash"></i></button>';
                    }

                    // Actions dropdown
                    echo '<div class="actions-dropdown">';
                    $actions_onclick = "toggleActionsMenu(event, '" . htmlspecialchars($row['id'], ENT_QUOTES) . "', '" . htmlspecialchars($filename, ENT_QUOTES) . "', " . htmlspecialchars($title_json, ENT_QUOTES) . ")";
                    echo '<button type="button" class="toolbar-btn btn-actions note-action-btn" title="Actions" onclick="' . $actions_onclick . '"><i class="fa-menu-vert-svg"></i></button>';
                    echo '<div class="actions-menu" id="actionsMenu-'.htmlspecialchars($row['id'], ENT_QUOTES).'">';
                    echo '<div class="actions-menu-item" onclick="duplicateNote(\''.$row['id'].'\'); closeActionsMenu();">';
                    echo '<i class="fa-file-copy-svg"></i><span>Duplicate</span>';
                    echo '</div>';
                    echo '<div class="actions-menu-item" onclick="showMoveFolderDialog(\''.$row['id'].'\'); closeActionsMenu();">';
                    echo '<i class="fa-drive-file-move-svg"></i><span>Move</span>';
                    echo '</div>';
                    echo '<div class="actions-menu-item" onclick="downloadFile(\''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).'); closeActionsMenu();">';
                    echo '<i class="fa-download"></i><span>Download</span>';
                    echo '</div>';
                    if (!$show_trash_button) {
                        echo '<div class="actions-menu-item" onclick="deleteNote(\''.$row['id'].'\'); closeActionsMenu();">';
                        echo '<i class="fa-trash"></i><span>Delete</span>';
                        echo '</div>';
                    }
                    echo '<div class="actions-menu-item" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.'); closeActionsMenu();">';
                    echo '<i class="fa-info-circle"></i><span>Information</span>';
                    echo '</div>';
                    echo '</div>';
                    echo '</div>';                
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
                    // Title
                    echo '<h4><input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateidhead(this);" id="inp'.$row['id'].'" type="text" placeholder="Title ?" value="'.htmlspecialchars(htmlspecialchars_decode($row['heading'] ?: 'Untitled note'), ENT_QUOTES).'"/></h4>';
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
                    $subheading_display = htmlspecialchars($row['subheading'] ?? ($row['location'] ?? ''), ENT_QUOTES);

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
                        echo '<input type="text" id="subheading-input-'.$row['id'].'" class="inline-subheading-input" style="display:none;" value="'.htmlspecialchars($subheading_display, ENT_QUOTES).'" />';
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
                    $data_attr = $note_type === 'tasklist' ? ' data-tasklist-json="'.$tasklist_json.'"' : '';
                    echo '<div class="noteentry" style="font-size:'.$font_size.'px;" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-ph="Enter text, paste images, or drag-and-drop an image at the cursor." contenteditable="true" data-note-type="'.$note_type.'"'.$data_attr.'>'.$entryfinal.'</div>';
                    echo '<div class="note-bottom-space"></div>';
                    echo '</div>';
                    echo '</div>';
                    
                    // Collect tasklist IDs for later initialization
                    if ($note_type === 'tasklist') {
                        $tasklist_ids[] = $row['id'];
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
        
    </div>  <!-- Close main-container -->
    
    <?php if (isAIEnabled()): ?>
    <!-- AI Summary Modal -->
    <div id="aiSummaryModal" class="modal">
        <div class="modal-content ai-summary-simple">
            <div class="modal-body">
                <div id="aiSummaryLoading" class="ai-loading">
                    <i class="fa-robot-svg rotating"></i>
                    <p>Generating summary...</p>
                </div>
                <div id="aiSummaryContent">
                    <div id="summaryText" class="summary-text-simple"></div>
                </div>
                <div id="aiSummaryError">
                    <div class="error-content">
                        <img src="images/circle-info-solid-full.svg" alt="Error" style="width: 16px; height: 16px; margin-right: 8px; vertical-align: middle;">
                        <p id="errorMessage"></p>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="copyToClipboard()" id="copyBtn">
                    <i class="fa-copy"></i> Copy
                </button>
                <button id="regenerateSummaryBtn" class="btn btn-primary" onclick="regenerateCurrentSummary()">
                    <i class="fa-redo"></i> Regenerate
                </button>
                <button class="btn btn-secondary" onclick="closeAISummaryModal()">Close</button>
            </div>
        </div>
    </div>
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
            // on mobile, scroll into view
            try { input.scrollIntoView({behavior:'smooth', block:'center'}); } catch(e){}
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
    <?php endif; ?>
    
</body>
<script>
    // Ensure this function is defined globally so inline onclick handlers can call it even when AI modal block isn't rendered
    function openNoteInfoEdit(noteId) {
        var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
        if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
            url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
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
<script src="js/main.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/clickable-tags.js"></script>
<script src="js/font-size-settings.js"></script>
<?php if (isAIEnabled()): ?>
<script src="js/ai.js"></script>
<?php endif; ?>
<script src="js/tasklist.js"></script>
<script src="js/copy-code-on-focus.js"></script>

</html>
