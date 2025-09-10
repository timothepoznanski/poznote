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

// Mobile detection by user agent (must be done BEFORE any output and never redefined)
$is_mobile = false;
if (isset($_SERVER['HTTP_USER_AGENT'])) {
    $is_mobile = preg_match('/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/', strtolower($_SERVER['HTTP_USER_AGENT'])) ? true : false;
}

include 'functions.php';
include 'db_connect.php';

// Include les nouveaux fichiers modulaires
require_once 'page_init.php';
require_once 'search_handler.php';
require_once 'note_loader.php';
require_once 'favorites_handler.php';
require_once 'folders_display.php';

// Initialisation des workspaces et labels
initializeWorkspacesAndLabels($con);

// Initialisation des paramètres de recherche
$search_params = initializeSearchParams();
extract($search_params); // Extrait les variables: $search, $tags_search, $note, etc.

$displayWorkspace = htmlspecialchars($workspace_filter, ENT_QUOTES);

// Get the custom default folder name
$defaultFolderName = getDefaultFolderName($workspace_filter);

// Handle folder exclusions from search
$excluded_folders = handleExcludedFolders();

// Handle unified search
$using_unified_search = handleUnifiedSearch();

// Workspace filter already initialized above

// Chargement des données de note
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
    <?php include 'templates/head_includes.php'; ?>
</head>

<body<?php echo ($is_mobile && $note != '') ? ' class="note-open"' : ''; ?>>   

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
    $query_left_secure = "SELECT id, heading, folder, favorite FROM entries WHERE $where_clause ORDER BY folder, updated DESC";
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
        noteItem.innerHTML = '<i class="fas fa-file-alt" style="margin-right: 10px; color: #007DB8;"></i>New note';
        noteItem.onclick = function() {
            createNewNote();
            createMenu.remove();
        };
        
        // Folder item
        var folderItem = document.createElement('button');
        folderItem.className = 'create-menu-item';
        folderItem.innerHTML = '<i class="fas fa-folder" style="margin-right: 10px; color: #007DB8;"></i>New folder';
        folderItem.onclick = function() {
            newFolder();
            createMenu.remove();
        };
        
        createMenu.appendChild(noteItem);
        createMenu.appendChild(folderItem);
        
        var plusButton = document.querySelector('.sidebar-plus');
        if (plusButton && plusButton.parentNode) {
            plusButton.parentNode.appendChild(createMenu);
            createMenu.style.display = 'block';
        }
    }
    
    // Expose function globally
    window.toggleCreateMenu = toggleCreateMenu;
    
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
    
    // Folder note counts display management
    function applyFolderCountsPreference() {
        const showCounts = localStorage.getItem('showFolderNoteCounts') === 'true';
        const leftCol = document.getElementById('left_col');
        if (leftCol) {
            if (showCounts) {
                leftCol.classList.remove('hide-folder-counts');
            } else {
                leftCol.classList.add('hide-folder-counts');
            }
        }
    }
    
    // Apply preference on page load
    document.addEventListener('DOMContentLoaded', applyFolderCountsPreference);
    
    // Check for changes in localStorage (when coming back from settings)
    window.addEventListener('focus', applyFolderCountsPreference);
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
                    $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
               
           
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
                    echo '<button type="button" class="' . $home_button_class . '" title="Home" onclick="goBackToNoteList()"><i class="fas fa-home"></i></button>';
                } else {
                    echo '<button type="button" class="' . $home_button_class . '" title="Home" onclick="window.location.href=\'' . htmlspecialchars($home_url, ENT_QUOTES) . '\'"><i class="fas fa-home"></i></button>';
                }
                
                // Text formatting buttons (visible only during selection on desktop)
                $text_format_class = $is_mobile ? '' : ' text-format-btn';
                $note_action_class = $is_mobile ? '' : ' note-action-btn';
                echo '<button type="button" class="toolbar-btn btn-bold'.$text_format_class.'" title="Bold" onclick="document.execCommand(\'bold\')"><i class="fas fa-bold"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-italic'.$text_format_class.'" title="Italic" onclick="document.execCommand(\'italic\')"><i class="fas fa-italic"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-underline'.$text_format_class.'" title="Underline" onclick="document.execCommand(\'underline\')"><i class="fas fa-underline"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-strikethrough'.$text_format_class.'" title="Strikethrough" onclick="document.execCommand(\'strikeThrough\')"><i class="fas fa-strikethrough"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-link'.$text_format_class.'" title="Link" onclick="addLinkToNote()"><i class="fas fa-link"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-unlink'.$text_format_class.'" title="Remove link" onclick="document.execCommand(\'unlink\')"><i class="fas fa-unlink"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-color'.$text_format_class.'" title="Text color" onclick="toggleRedColor()"><i class="fas fa-palette"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-highlight'.$text_format_class.'" title="Highlight" onclick="toggleYellowHighlight()"><i class="fas fa-fill-drip"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-list-ul'.$text_format_class.'" title="Bullet list" onclick="document.execCommand(\'insertUnorderedList\')"><i class="fas fa-list-ul"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-list-ol'.$text_format_class.'" title="Numbered list" onclick="document.execCommand(\'insertOrderedList\')"><i class="fas fa-list-ol"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-text-height'.$text_format_class.'" title="Font size" onclick="changeFontSize()"><i class="fas fa-text-height"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-code'.$text_format_class.'" title="Code block" onclick="toggleCodeBlock()"><i class="fas fa-code"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-inline-code'.$text_format_class.'" title="Inline code" onclick="toggleInlineCode()"><i class="fas fa-terminal"></i></button>';
                echo '<button type="button" class="toolbar-btn btn-eraser'.$text_format_class.'" title="Clear formatting" onclick="document.execCommand(\'removeFormat\')"><i class="fas fa-eraser"></i></button>';
             
                // Note action buttons (desktop only)
                    if (!$is_mobile) {
                    echo '<button type="button" class="toolbar-btn btn-emoji note-action-btn" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fas fa-smile"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="Add separator" onclick="insertSeparator()"><i class="fas fa-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-save note-action-btn" title="Save note" onclick="saveFocusedNoteJS()"><i class="fas fa-save"></i></button>';
                    // AI actions dropdown menu (only if AI is enabled)
                    if (isAIEnabled()) {
                        echo '<div class="ai-dropdown">';
                        echo '<button type="button" class="toolbar-btn btn-ai note-action-btn" title="AI actions" onclick="toggleAIMenu(event, \''.$row['id'].'\')"><i class="fas fa-robot"></i></button>';
                        echo '<div class="ai-menu" id="aiMenu">';
                        echo '<div class="ai-menu-item" onclick="generateAISummary(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-align-left"></i>';
                        echo '<span>Summarize note</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="checkErrors(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-search"></i>';
                        echo '<span>Check content</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="autoGenerateTags(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-tags"></i>';
                        echo '<span>AI tags</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="window.location = \'ai.php\'; closeAIMenu();">';
                        echo '<i class="fas fa-cog"></i>';
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
                    $star_class = $is_favorite ? 'fas' : 'far';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite'.$note_action_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="'.$star_class.' fa-star star-icon"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-folder'.$note_action_class.'" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fas fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.$note_action_class.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments ('.$attachments_count.')" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fas fa-paperclip"></i></button>';
                    
                    // Encode title safely for JavaScript
                    $title_safe = $title ?? 'Note';
                    $title_json = json_encode($title_safe, JSON_HEX_QUOT | JSON_HEX_APOS | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
                    if ($title_json === false) $title_json = '"Note"';
                    
                    echo '<button type="button" class="toolbar-btn btn-download'.$note_action_class.'" title="Export to HTML" onclick="downloadFile(\''.$filename.'\', '.htmlspecialchars($title_json, ENT_QUOTES).')"><i class="fas fa-download"></i></button>';
                    
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
                    
                    echo '<button type="button" class="toolbar-btn btn-info'.$note_action_class.'" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fas fa-info-circle"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-trash'.$note_action_class.'" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fas fa-trash"></i></button>';
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
                    echo '<button type="button" class="toolbar-btn btn-emoji" title="Insert emoji" onclick="toggleEmojiPicker()"><i class="fas fa-smile"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator" title="Add separator" onclick="insertSeparator()"><i class="fas fa-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-save" title="Save note" onclick="saveFocusedNoteJS()"><i class="fas fa-save"></i></button>';
                    if (isAIEnabled()) {
                        echo '<div class="ai-dropdown mobile">';
                        echo '<button type="button" class="toolbar-btn btn-ai" title="AI actions" onclick="toggleAIMenu(event, \''.$row['id'].'\')"><i class="fas fa-robot"></i></button>';
                        echo '<div class="ai-menu" id="aiMenuMobile">';
                        echo '<div class="ai-menu-item" onclick="generateAISummary(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-align-left"></i>';
                        echo '<span>Summarize note</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="checkErrors(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-search"></i>';
                        echo '<span>Check content</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="autoGenerateTags(\''.$row['id'].'\'); closeAIMenu();">';
                        echo '<i class="fas fa-tags"></i>';
                        echo '<span>AI tags</span>';
                        echo '</div>';
                        echo '<div class="ai-menu-item" onclick="window.location = \'ai.php\'; closeAIMenu();">';
                        echo '<i class="fas fa-cog"></i>';
                        echo '<span>AI settings</span>';
                        echo '</div>';
                        echo '</div>';
                        echo '</div>';
                    }
                    
                    // Favorites button with star icon
                    $is_favorite = $row['favorite'] ?? 0;
                    $star_class = $is_favorite ? 'fas' : 'far';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="'.$star_class.' fa-star star-icon"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-folder" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fas fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fas fa-paperclip"></i></button>';
                    echo '<a href="'.$filename.'" download="'.htmlspecialchars($title, ENT_QUOTES).'" class="toolbar-btn btn-download" title="Export to HTML"><i class="fas fa-download"></i></a>';
                    
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
                    
                    echo '<button type="button" class="toolbar-btn btn-info" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', '.$created_json_escaped.', '.$updated_json_escaped.', '.$folder_json_escaped.', '.$favorite_json_escaped.', '.$tags_json_escaped.', '.$attachments_count_json_escaped.')"><i class="fas fa-info-circle"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-trash" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fas fa-trash"></i></button>';
                }
                
                echo '</div>';
                echo '</div>';
                
                // Tags only (folder selection removed)
                echo '<div class="note-tags-row">';
                echo '<span class="fa fa-tag icon_tag"></span>';
                echo '<span class="name_tags">'
                    .'<input class="add-margin" size="70px" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Add tags here" onfocus="updateidtags(this);" id="tags'.$row['id'].'" type="text" placeholder="Tags ?" value="'.htmlspecialchars(str_replace(',', ' ', $row['tags'] ?? ''), ENT_QUOTES).'"/>'
                .'</span>';
                echo '</div>';
                
                // Display attachments directly in the note if they exist
                if (!empty($row['attachments'])) {
                    $attachments_data = json_decode($row['attachments'], true);
                    if (is_array($attachments_data) && !empty($attachments_data)) {
                        echo '<div class="note-attachments-row">';
                        echo '<span class="fas fa-paperclip icon_attachment"></span>';
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
                
                // Get font size from settings based on device
                $font_size = '16';
                $is_mobile = preg_match('/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i', $_SERVER['HTTP_USER_AGENT']);
                
                try {
                    $setting_key = $is_mobile ? 'note_font_size_mobile' : 'note_font_size_desktop';
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
                echo '<div class="noteentry" style="font-size:'.$font_size.'px;" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-ph="Enter text, paste images, or drag-and-drop an image at the cursor." contenteditable="true">'.$entryfinal.'</div>';
                echo '<div class="note-bottom-space"></div>';
                echo '</div>';
                echo '</div>';
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
                    <i class="fas fa-robot rotating"></i>
                    <p>Generating summary...</p>
                </div>
                <div id="aiSummaryContent">
                    <div id="summaryText" class="summary-text-simple"></div>
                </div>
                <div id="aiSummaryError">
                    <div class="error-content">
                        <i class="fas fa-exclamation-triangle"></i>
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
                    <i class="fas fa-copy"></i> Copy
                </button>
                <button id="regenerateSummaryBtn" class="btn btn-primary" onclick="regenerateCurrentSummary()">
                    <i class="fas fa-redo"></i> Regenerate
                </button>
                <button class="btn btn-secondary" onclick="closeAISummaryModal()">Close</button>
            </div>
        </div>
    </div>
    <?php endif; ?>
    
</body>
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
<script src="js/main.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/clickable-tags.js"></script>
<script src="js/font-size-settings.js"></script>
<?php if (isAIEnabled()): ?>
<script src="js/ai.js"></script>
<?php endif; ?>

</html>
