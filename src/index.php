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

// Mobile detection by user agent (must be done BEFORE any output and never redefined)
$is_mobile = isMobileDevice();
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

// Handle folder exclusions from search
$excluded_folders = handleExcludedFolders();

// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Workspace filter already initialized above

// Load note data
$note_data = loadNoteData($con, $note, $workspace_filter, $defaultFolderName);
$default_note_folder = $note_data['default_note_folder'];
$current_note_folder = $note_data['current_note_folder'];
$res_right = $note_data['res_right'];
?>

<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Poznote</title>
    <link type="text/css" rel="stylesheet" href="css/index.css"/>
    <link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
    <script src="js/toolbar.js"></script>
    <script src="js/note-loader-common.js"></script>
    <script>
        if (window.innerWidth <= 800 || /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)) {
            var mobileScript = document.createElement('script');
            mobileScript.src = 'js/note-loader-mobile.js';
            document.head.appendChild(mobileScript);
        } else {
            var desktopScript = document.createElement('script');
            desktopScript.src = 'js/note-loader-desktop.js';
            document.head.appendChild(desktopScript);
        }
    </script>
    <script src="js/index-login-prompt.js"></script>
    <script src="js/index-workspace-display.js"></script>
    <script src="js/tasklist.js"></script>
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
} catch (Exception $e) {
    // ignore errors and continue without extra classes
}

// Preserve existing note-open class for mobile when needed
$note_open_class = ($is_mobile && $note != '') ? 'note-open' : '';
// Combine classes
$body_classes = trim(($note_open_class ? $note_open_class : '') . ' ' . $extra_body_classes);
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
    // Apply folder counts visibility based on settings stored in localStorage
    document.addEventListener('DOMContentLoaded', function() {
        try {
            var showCounts = localStorage.getItem('showFolderNoteCounts') === 'true';
            if (!showCounts) {
                document.body.classList.add('hide-folder-counts');
            } else {
                document.body.classList.remove('hide-folder-counts');
            }
        } catch (e) {
            // Ignore localStorage access errors
        }
        
        // Restore folder states from localStorage
        try {
            var folderContents = document.querySelectorAll('.folder-content');
            for (var i = 0; i < folderContents.length; i++) {
                var content = folderContents[i];
                var folderId = content.id;
                var savedState = localStorage.getItem('folder_' + folderId);
                
                if (savedState === 'closed') {
                    // Close folder
                    content.style.display = 'none';
                    var toggle = content.parentElement.querySelector('.folder-toggle');
                    if (toggle) {
                        // Do not change the icon for the Favorites pseudo-folder
                        var folderHeader = content.parentElement;
                        var folderNameElem = folderHeader ? folderHeader.querySelector('.folder-name') : null;
                        var folderNameText = folderNameElem ? folderNameElem.textContent.trim() : '';
                        if (folderNameText !== 'Favorites') {
                            var icon = toggle.querySelector('.folder-icon');
                            if (icon) {
                                icon.classList.remove('fa-folder-open');
                                icon.classList.add('fa-folder');
                            }
                        }
                    }
                } else if (savedState === 'open') {
                    // Open folder
                    content.style.display = 'block';
                    var toggle = content.parentElement.querySelector('.folder-toggle');
                    if (toggle) {
                        // Do not change the icon for the Favorites pseudo-folder
                        var folderHeader = content.parentElement;
                        var folderNameElem = folderHeader ? folderHeader.querySelector('.folder-name') : null;
                        var folderNameText = folderNameElem ? folderNameElem.textContent.trim() : '';
                        if (folderNameText !== 'Favorites') {
                            var icon = toggle.querySelector('.folder-icon');
                            if (icon) {
                                icon.classList.remove('fa-folder');
                                icon.classList.add('fa-folder-open');
                            }
                        }
                    }
                }
                // If no saved state, keep the default state determined by PHP
            }
        } catch (e) {
            // Ignore localStorage access errors
        }
    });
    </script>

    <div class="main-container">
    <script>
    // Set workspace display map for JavaScript
    window.workspaceDisplayMap = <?php
        $display_map = generateWorkspaceDisplayMap($workspaces, $labels);
        echo json_encode($display_map, JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP);
    ?>;
    </script>

    <!-- workspace selector removed (now shown under left header) -->


    <?php include 'templates/modals.php'; ?>
    
    <!-- LEFT COLUMN -->	
    <div id="left_col">

        <?php include 'templates/mobile_menu.php'; ?>

        
    <!-- MENU -->

    <!-- Depending on the cases, we create the queries. -->  
        
    <?php
    // Construction des conditions de recherche sécurisées
    $search_conditions = buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $excluded_folders);
    $where_clause = $search_conditions['where_clause'];
    $search_params = $search_conditions['search_params'];
    
    // Secure prepared queries
    $query_left_secure = "SELECT id, heading, folder, favorite, created, location, subheading FROM entries WHERE $where_clause ORDER BY folder, updated DESC";
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
    ?>
    
    <!-- MENU -->

    <?php include 'templates/desktop_menu.php'; ?>

        
    <script>
    // Set configuration variables for the main page
    window.isSearchMode = <?php echo (!empty($search) || !empty($tags_search)) ? 'true' : 'false'; ?>;
    window.currentNoteFolder = <?php 
        if ($note != '' && empty($search) && empty($tags_search)) {
            echo json_encode($current_note_folder ?? $defaultFolderName);
        } else if ($default_note_folder && empty($search) && empty($tags_search)) {
            echo json_encode($default_note_folder);
        } else {
            echo 'null';
        }
    ?>;
    window.selectedWorkspace = <?php echo json_encode($workspace_filter); ?>;
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
        
        include 'templates/notes_list.php';
                 
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
        noteItem.innerHTML = '<i class="fa-file-alt" style="margin-right: 10px; color: #007DB8;"></i>New note';
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
        folderItem.innerHTML = '<i class="fa-folder" style="margin-right: 10px; color: #007DB8;"></i>New folder';
        folderItem.onclick = function() {
            newFolder();
            createMenu.remove();
        };
        
        // Task list item
        var taskListItem = document.createElement('button');
        taskListItem.className = 'create-menu-item';
        taskListItem.innerHTML = '<i class="fa-list-ul" style="margin-right: 10px; color: #007DB8;"></i>Task list';
        taskListItem.onclick = function() {
            createTaskListNote();
            createMenu.remove();
        };
        
        createMenu.appendChild(noteItem);
        createMenu.appendChild(folderItem);
        createMenu.appendChild(taskListItem);
        
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
            menu.classList.add('hidden');
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
                    window.location.href = "index.php?workspace=" + ws + "&note=" + encodeURIComponent(res.heading);
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
    
    <!-- RESIZE HANDLE (Desktop only) -->
    <?php if (!$is_mobile): ?>
    <div class="resize-handle" id="resizeHandle"></div>
    <?php endif; ?>
    
    <!-- RIGHT COLUMN -->	
    <div id="right_col">
    
        <!-- Search bar removed from right column (desktop) -->
        
        <?php        
            
            // Right-side list based on the query created earlier //		
            
            // Check if we should display a note or nothing
            if ($res_right && $res_right) {
                while($row = $res_right->fetch(PDO::FETCH_ASSOC))
                {
                
                    $filename = getEntriesRelativePath() . $row["id"] . ".html";
                    $title = $row['heading'];
                    // Ensure we have a safe JSON-encoded title for JavaScript (used by both desktop and mobile)
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    $note_type = $row['type'] ?? 'note';
                    
                    if ($note_type === 'tasklist') {
                        // For task list notes, use the database content (JSON) instead of HTML file
                        $entryfinal = $row['entry'] ?? '';
                    } else {
                        // For regular notes, use the HTML file content
                        $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
                    }
               
           
                // Harmonized desktop/mobile display:
                echo '<div id="note'.$row['id'].'" class="notecard">';
                echo '<div class="innernote">';
                // Ligne 1 : barre d’édition centrée (plus de date)
                echo '<div class="note-header">';
                // Formatting buttons (hidden by default on mobile, visible during selection)
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
                
                // Home button - visible on mobile and desktop when left column is hidden
                $home_button_class = 'toolbar-btn btn-home';
                if (!$is_mobile) {
                    $home_button_class .= ' desktop-home-btn';
                }
                
                // Use goBackToNoteList function for better mobile experience if no search parameters
                if (empty($home_params)) {
                    echo '<button type="button" class="' . $home_button_class . '" title="Home" onclick="goBackToNoteList()"><i class="fa-home"></i></button>';
                } else {
                    echo '<button type="button" class="' . $home_button_class . '" title="Home" onclick="window.location.href=\'' . htmlspecialchars($home_url, ENT_QUOTES) . '\'"><i class="fa-home"></i></button>';
                }
                
                // Text formatting buttons (visible only during selection on desktop)
                $text_format_class = $is_mobile ? '' : ' text-format-btn';
                $note_action_class = $is_mobile ? '' : ' note-action-btn';
                echo '<button type="button" class="toolbar-btn btn-bold'.$text_format_class.'" title="Bold" onclick="document.execCommand(\'bold\')"><i class="fa-bold"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-italic'.$text_format_class.'" title="Italic" onclick="document.execCommand(\'italic\')"><i class="fa-italic"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-underline'.$text_format_class.'" title="Underline" onclick="document.execCommand(\'underline\')"><i class="fa-underline"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-strikethrough'.$text_format_class.'" title="Strikethrough" onclick="document.execCommand(\'strikeThrough\')"><i class="fa-strikethrough"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-link'.$text_format_class.'" title="Link" onclick="addLinkToNote()"><i class="fa-link"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-unlink'.$text_format_class.'" title="Remove link" onclick="document.execCommand(\'unlink\')"><i class="fa-unlink"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-color'.$text_format_class.'" title="Text color" onclick="toggleRedColor()"><i class="fa-palette"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-highlight'.$text_format_class.'" title="Highlight" onclick="toggleYellowHighlight()"><i class="fa-fill-drip"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-list-ul'.$text_format_class.'" title="Bullet list" onclick="document.execCommand(\'insertUnorderedList\')"><i class="fa-list-ul"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-list-ol'.$text_format_class.'" title="Numbered list" onclick="document.execCommand(\'insertOrderedList\')"><i class="fa-list-ol"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-text-height'.$text_format_class.'" title="Font size" onclick="changeFontSize()"><i class="fa-text-height"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-code'.$text_format_class.'" title="Code block" onclick="toggleCodeBlock()"><i class="fa-code"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-inline-code'.$text_format_class.'" title="Inline code" onclick="toggleInlineCode()"><i class="fa-terminal"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-eraser'.$text_format_class.'" title="Clear formatting" onclick="document.execCommand(\'removeFormat\')"><i class="fa-eraser"></i></button>';
             
                // Note action buttons (desktop only)
                    if (!$is_mobile) {
                    echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fa-smile"></i></button>';
                    // Save button first, then separator (minus) to match requested order
                    echo '<button type="button" class="toolbar-btn btn-save note-action-btn" title="Save note" onclick="saveFocusedNoteJS()"><i class="fa-save"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="Add separator" onclick="insertSeparator()"><i class="fa-minus"></i></button>';
                    // AI actions dropdown menu (only if AI is enabled)
                    if (isAIEnabled()) {
                        echo '<div class="ai-dropdown">';
                        echo '<button type="button" class="toolbar-btn btn-ai note-action-btn" title="AI actions" onclick="toggleAIMenu(event, \''.$row['id'].'\')"><i class="fa-robot-svg"></i></button>';
                        echo '<div class="ai-menu" id="aiMenu">';
                        echo '<div class="ai-menu-item" onclick="generateAISummary(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-align-left"></i>';
                        echo '<span>Summarize note</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="checkErrors(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-search"></i>';
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
                }
                
                // Note action buttons (desktop only, replace dropdown menu)
                if (!$is_mobile) {
                    // Calculate number of attachments to determine button color
                    $attachments_count = 0;
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data)) {
                            $attachments_count = count($attachments_data);
                        }
                    }
                    
                    // Favorites button with star icon
                    $is_favorite = $row['favorite'] ?? 0;
                    $favorite_class = $is_favorite ? ' is-favorite' : '';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite'.$note_action_class.$favorite_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="fa-star star-icon"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-folder'.$note_action_class.'" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.$note_action_class.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments ('.$attachments_count.')" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fa-paperclip"></i></button>';
                    
                    // Share / Download dropdown (export or public share)
                    echo '<div class="share-dropdown">';
                    // Check if note is already shared to add visual indicator
                    $is_shared = false;
                    try {
                        $stmt2 = $con->prepare('SELECT 1 FROM shared_notes WHERE note_id = ? LIMIT 1');
                        $stmt2->execute([$row['id']]);
                        $is_shared = (bool)$stmt2->fetchColumn();
                    } catch (Exception $e) { /* ignore */ }

                    $share_class_extra = $is_shared ? ' is-shared' : '';
                    echo '<button type="button" class="toolbar-btn btn-share'.$note_action_class.$share_class_extra.'" data-note-id="'.htmlspecialchars($row['id'], ENT_QUOTES).'" title="Share / Export" onclick="toggleShareMenu(event, \''.$row['id'].'\', \''.htmlspecialchars($filename, ENT_QUOTES).'\', '.htmlspecialchars($title_json, ENT_QUOTES).')"><i class="fa-square-share-nodes-svg"></i></button>';
                    echo '<div class="share-menu" id="shareMenu-'.htmlspecialchars($row['id'], ENT_QUOTES).'">';
                    echo '<div class="share-menu-item" data-action="download" onclick="downloadFile(\''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).'); closeShareMenu();">';
                    echo '<i class="fa-download"></i><span>Download HTML</span>';
                    echo '</div>';
                    echo '<div class="share-menu-item" data-action="public" onclick="openPublicShareModal(\''.$row['id'].'\'); closeShareMenu();">';
                    echo '<i class="fa-link"></i><span>Share publicly (read-only)</span>';
                    echo '</div>';
                    echo '</div>';
                    echo '</div>';
                    
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
                    
                    echo '<button type="button" class="toolbar-btn btn-info'.$note_action_class.'" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fa-info-circle"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-trash'.$note_action_class.'" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fa-trash"></i></button>';
                } else {
                    // Individual buttons for mobile (always visible)
                    // Calculate number of attachments for mobile button
                    $attachments_count = 0;
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data)) {
                            $attachments_count = count($attachments_data);
                        }
                    }
                    
                    // Note action buttons 
                    // AI actions dropdown menu for mobile (only if AI is enabled)
                    echo '<button type="button" class="toolbar-btn btn-emoji" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fa-smile"></i></button>';
                    // Save button first for mobile, then separator (minus)
                    echo '<button type="button" class="toolbar-btn btn-save" title="Save note" onclick="saveFocusedNoteJS()"><i class="fa-save"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator" title="Add separator" onclick="insertSeparator()"><i class="fa-minus"></i></button>';
                    if (isAIEnabled()) {
                        echo '<div class="ai-dropdown mobile">';
                        echo '<button type="button" class="toolbar-btn btn-ai" title="AI actions" onclick="toggleAIMenu(event, \''.$row['id'].'\')"><i class="fa-robot-svg"></i></button>';
                        echo '<div class="ai-menu" id="aiMenuMobile">';
                        echo '<div class="ai-menu-item" onclick="generateAISummary(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-align-left"></i>';
                        echo '<span>Summarize note</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="checkErrors(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fa-search"></i>';
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
                    
                    // Favorites button with star icon
                    $is_favorite = $row['favorite'] ?? 0;
                    $favorite_class = $is_favorite ? ' is-favorite' : '';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite'.$favorite_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="fa-star star-icon"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-folder" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fa-paperclip"></i></button>';
                    // Mobile: use share dropdown as well (simpler menu)
                    echo '<div class="share-dropdown mobile">';
                    // Mobile: reflect shared state too
                    $is_shared_mobile = false;
                    try {
                        $stmt3 = $con->prepare('SELECT 1 FROM shared_notes WHERE note_id = ? LIMIT 1');
                        $stmt3->execute([$row['id']]);
                        $is_shared_mobile = (bool)$stmt3->fetchColumn();
                    } catch (Exception $e) { /* ignore */ }
                    $share_class_mobile = $is_shared_mobile ? ' is-shared' : '';
                    echo '<button type="button" class="toolbar-btn btn-share'.$share_class_mobile.'" data-note-id="'.htmlspecialchars($row['id'], ENT_QUOTES).'" title="Share / Export" onclick="toggleShareMenu(event, \''.$row['id'].'\', \''.htmlspecialchars($filename, ENT_QUOTES).'\', '.htmlspecialchars($title_json, ENT_QUOTES).')"><i class="fa-square-share-nodes-svg"></i></button>';
                    echo '<div class="share-menu" id="shareMenuMobile-'.htmlspecialchars($row['id'], ENT_QUOTES).'">';
                    echo '<div class="share-menu-item" onclick="downloadFile(\''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).'); closeShareMenu();">';
                    echo '<i class="fa-download"></i><span>Download HTML</span>';
                    echo '</div>';
                    echo '<div class="share-menu-item" onclick="openPublicShareModal(\''.$row['id'].'\'); closeShareMenu();">';
                    echo '<i class="fa-link"></i><span>Share publicly (read-only)</span>';
                    echo '</div>';
                    echo '</div>';
                    echo '</div>';
                    
                    // Generate dates safely for JavaScript (same logic as desktop)
                    $created_raw = $row['created'] ?? '';
                    $updated_raw = $row['updated'] ?? '';
                    
                    $created_clean = trim($created_raw);
                    $updated_clean = trim($updated_raw);
                    
                    $created_timestamp = strtotime($created_clean);
                    $updated_timestamp = strtotime($updated_clean);
                    
                    $final_created = $created_timestamp ? date('Y-m-d H:i:s', $created_timestamp) : date('Y-m-d H:i:s');
                    $final_updated = $updated_timestamp ? date('Y-m-d H:i:s', $updated_timestamp) : date('Y-m-d H:i:s');
                    
                    $created_json = json_encode($final_created, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    $updated_json = json_encode($final_updated, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    
                    if ($created_json === false) $created_json = '"' . date('Y-m-d H:i:s') . '"';
                    if ($updated_json === false) $updated_json = '"' . date('Y-m-d H:i:s') . '"';
                    
                    // Escape quotes for HTML attributes (mobile version)
                    $created_json_escaped = htmlspecialchars($created_json, ENT_QUOTES);
                    $updated_json_escaped = htmlspecialchars($updated_json, ENT_QUOTES);
                    
                    // Prepare additional data for note info (mobile)
                    $folder_name = $row['folder'] ?? $defaultFolderName;
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
                    
                    echo '<button type="button" class="toolbar-btn btn-info" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fa-info-circle"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-trash" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fa-trash"></i></button>';
                }
                
                echo '</div>';
                echo '</div>';
                
                // Tags only (folder selection removed)
                echo '<div class="note-tags-row">';
                echo '<span class="fa-tag icon_tag"></span>';
                echo '<span class="name_tags">'
                    .'<input class="add-margin" size="70px" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Add tags here" onfocus="updateidtags(this);" id="tags'.$row['id'].'" type="text" placeholder="Tags ?" value="'.htmlspecialchars(str_replace(',', ' ', $row['tags'] ?? ''), ENT_QUOTES).'"/>'
                .'</span>';
                echo '</div>';
                
                // Display attachments directly in the note if they exist
                if (!empty($row['attachments'])) {
                    $attachments_data = json_decode($row['attachments'], true);
                    if (is_array($attachments_data) && !empty($attachments_data)) {
                        echo '<div class="note-attachments-row">';
                        echo '<span class="fa-paperclip icon_attachment"></span>';
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

                if ($has_created || $has_subheading) {
                    echo '<div class="note-subline">';
                    echo '<span class="note-sub-created">' . ($has_created ? htmlspecialchars($created_display, ENT_QUOTES) : '') . '</span>';
                    if ($has_created && $has_subheading) echo ' <span class="note-sub-sep">-</span> ';
                    // Subheading display with inline editing elements
                    // Render subheading as plain text (clickable, but not styled as a blue link)
                    echo '<span class="subheading-link" id="subheading-display-'.$row['id'].'" onclick="openNoteInfoEdit('.$row['id'].')">' . ($has_subheading ? $subheading_display : '') . '</span>';
                    echo '<input type="text" id="subheading-input-'.$row['id'].'" class="inline-subheading-input" style="display:none;" value="'.htmlspecialchars($subheading_display, ENT_QUOTES).'" />';
                    echo '<button class="btn-inline-save" id="save-subheading-'.$row['id'].'" style="display:none;" onclick="saveSubheadingInline('.$row['id'].')">Save</button>';
                    echo '<button class="btn-inline-cancel" id="cancel-subheading-'.$row['id'].'" style="display:none;" onclick="cancelSubheadingInline('.$row['id'].')">Cancel</button>';
                    echo '</div>';
                }
                
                // Get font size from settings based on device
                $font_size = '16';
                $is_mobile_for_font = isMobileDevice();
                
                try {
                    $setting_key = $is_mobile_for_font ? 'note_font_size_mobile' : 'note_font_size_desktop';
                    $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
                    $stmt->execute([$setting_key]);
                    $font_size_value = $stmt->fetchColumn();
                    if ($font_size_value !== false) {
                        $font_size = $font_size_value;
                    }
                } catch (Exception $e) {
                    // Use default if error
                }
                
                // Note content with font size style
                $note_type = $row['type'] ?? 'note';
                echo '<div class="noteentry" style="font-size:'.$font_size.'px;" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-ph="Enter text, paste images, or drag-and-drop an image at the cursor." contenteditable="true" data-note-type="'.$note_type.'">'.$entryfinal.'</div>';
                echo '<div class="note-bottom-space"></div>';
                echo '</div>';
                echo '</div>';
                
                // Initialize task list if this is a task list
                if ($note_type === 'tasklist') {
                    echo '<script>initializeTaskList('.$row['id'].', "'.$note_type.'");</script>';
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
            <!-- Sidebar footer: CTA buttons are rendered here so they're at the bottom of the left column -->
            <div class="sidebar-footer">
                <div class="sidebar-footer-inner">
                    <button class="btn-new-note" id="btn-new-note">New note</button>
                    <button class="btn-new-folder" id="btn-new-folder">New folder</button>
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
            var url = 'note_info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
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
        var url = 'note_info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
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

</html>
