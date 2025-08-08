<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Vérification de l'authentification
require 'auth.php';
requireAuth();

ob_start();
require_once 'config.php';

// Détection mobile par user agent (doit être fait AVANT tout output et ne jamais être redéfini)
$is_mobile = false;
if (isset($_SERVER['HTTP_USER_AGENT'])) {
    $user_agent = strtolower($_SERVER['HTTP_USER_AGENT']);
    $is_mobile = preg_match('/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/', $user_agent) ? true : false;
}

include 'functions.php';
include 'db_connect.php';

// Vérification des colonnes (seulement à l'ouverture de l'application)
$result = $con->query("SHOW COLUMNS FROM entries LIKE 'folder'");
if ($result->num_rows == 0) {
    $con->query("ALTER TABLE entries ADD COLUMN folder varchar(255) DEFAULT 'Uncategorized'");
}

$result = $con->query("SHOW COLUMNS FROM entries LIKE 'favorite'");
if ($result->num_rows == 0) {
    $con->query("ALTER TABLE entries ADD COLUMN favorite TINYINT(1) DEFAULT 0");
}

$result = $con->query("SHOW COLUMNS FROM entries LIKE 'attachments'");
if ($result->num_rows == 0) {
    $con->query("ALTER TABLE entries ADD COLUMN attachments TEXT DEFAULT NULL");
}

$search = $_POST['search'] ?? $_GET['search'] ?? '';
$tags_search = $_POST['tags_search'] ?? $_GET['tags_search'] ?? $_GET['tags_search_from_list'] ?? '';

// Handle search type preservation when clearing search
$preserve_notes = isset($_GET['preserve_notes']) && $_GET['preserve_notes'] === '1';
$preserve_tags = isset($_GET['preserve_tags']) && $_GET['preserve_tags'] === '1';

// Track if we're using unified search
$using_unified_search = false;

// Handle unified search
if (!empty($_POST['unified_search'])) {
    $unified_search = $_POST['unified_search'];
    $search_in_notes = isset($_POST['search_in_notes']) && $_POST['search_in_notes'] !== '';
    $search_in_tags = isset($_POST['search_in_tags']) && $_POST['search_in_tags'] !== '';
    
    $using_unified_search = true;
    
    // Debug output (remove in production)
    // Debugging removed - search working correctly
    
    // Only proceed if at least one option is selected
    if ($search_in_notes || $search_in_tags) {
        // Set search values based on selected options
        if ($search_in_notes) {
            $search = $unified_search;
        } else {
            $search = '';
        }
        
        if ($search_in_tags) {
            $tags_search = $unified_search;
        } else {
            $tags_search = '';
        }
    }
    // If no options are selected, ignore the search (keep existing search state)
}

$note = $_GET['note'] ?? '';
$folder_filter = $_GET['folder'] ?? '';

// Determine current note folder early for JavaScript
$current_note_folder = 'Uncategorized';
if($note != '') {
    $query_note_folder = "SELECT folder FROM entries WHERE trash = 0 AND heading = '" . mysqli_real_escape_string($con, $note) . "'";
    $res_note_folder = $con->query($query_note_folder);
    if($res_note_folder && $res_note_folder->num_rows > 0) {
        $note_data = mysqli_fetch_array($res_note_folder, MYSQLI_ASSOC);
        $current_note_folder = $note_data["folder"] ?: 'Uncategorized';
    }
}
?>

<html>

<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo APP_NAME_DISPLAYED; ?></title>
    <link type="text/css" rel="stylesheet" href="css/index.css"/>
    <link rel="stylesheet" href="css/index-mobile.css" media="(max-width: 800px)">
    <link rel="stylesheet" href="css/font-awesome.css" />
    <script src="js/toolbar.js"></script>
</head>

<body<?php echo ($is_mobile && $note != '') ? ' class="note-open"' : ''; ?>>   

    <div class="main-container">

    <!-- Notification popup -->
    <div id="notificationOverlay" class="notification-overlay"></div>
    <div id="notificationPopup"></div>
    
    <!-- Modal for creating new folder -->
    <div id="newFolderModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('newFolderModal')">&times;</span>
            <h3>Create New Folder</h3>
            <input type="text" id="newFolderName" placeholder="Folder name" maxlength="255" onkeypress="if(event.key==='Enter') createFolder()">
            <div class="modal-buttons">
                <button onclick="createFolder()">Create</button>
                <button onclick="closeModal('newFolderModal')">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Modal for moving note to folder -->
    <div id="moveNoteModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('moveNoteModal')">&times;</span>
            <h3>Change folder</h3>
            <p>Move "<span id="moveNoteTitle"></span>" to:</p>
            <select id="moveNoteFolder">
                <option value="Uncategorized">Uncategorized</option>
            </select>
            <div class="modal-buttons">
                <button onclick="moveNoteToFolder()">Move</button>
                <button onclick="closeModal('moveNoteModal')">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Modal for moving note to folder from toolbar -->
    <div id="moveNoteFolderModal" class="modal">
        <div class="modal-content move-folder-modal">
            <h3>Change Folder</h3>
            
            <!-- Search/Filter bar -->
            <div class="folder-search-section">
                <div class="searchbar-input-wrapper">
                    <input type="text" id="moveFolderFilter" class="search form-control searchbar-input" placeholder="Search or select a folder..." oninput="filterMoveFolders()">
                </div>
            </div>
            
            <!-- Suggested folders (always visible) -->
            <div class="suggested-folders-section" id="suggestedFoldersSection">
                <div class="suggested-folders-list" id="suggestedFoldersList">
                    <!-- Suggested folders will be loaded here -->
                </div>
            </div>
            
            <!-- Folders list (hidden by default) -->
            <div class="folders-selection-list" id="foldersSelectionList">
                <!-- Folders will be loaded here -->
            </div>
            
            <!-- Create new folder section -->
            <div class="create-folder-section" id="createFolderSection">
                <input type="text" id="moveNewFolderName" placeholder="Enter new folder name" maxlength="255">
                <div class="create-folder-buttons">
                    <button type="button" onclick="createAndMoveToNewFolder()">Create & Move</button>
                    <button type="button" onclick="cancelCreateNewFolder()">Cancel</button>
                </div>
            </div>
            
            <!-- Action buttons -->
            <div class="modal-buttons">
                <button type="button" onclick="moveNoteToSelectedFolder()">Move</button>
                <button type="button" id="createNewFolderBtn" onclick="showCreateNewFolderInput()">+ Create New Folder</button>
                <button type="button" onclick="closeModal('moveNoteFolderModal')">Cancel</button>
            </div>
            
            <!-- Error message display -->
            <div id="moveFolderErrorMessage" class="modal-error-message">
                Please select a folder
            </div>
        </div>
    </div>
    
    <!-- Modal for editing folder name -->
    <div id="editFolderModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('editFolderModal')">&times;</span>
            <h3>Rename Folder</h3>
            <input type="text" id="editFolderName" placeholder="New folder name" maxlength="255">
            <div class="modal-buttons">
                <button onclick="saveFolderName()">Save</button>
                <button onclick="closeModal('editFolderModal')">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Modal for attachments -->
    <div id="attachmentModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('attachmentModal')">&times;</span>
            <h3>Manage Attachments</h3>
            <div class="attachment-upload">
                <div class="file-input-container">
                    <label for="attachmentFile" class="file-input-label">
                        Choose a file
                        <input type="file" id="attachmentFile" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar" class="file-input-hidden">
                    </label>
                    <div id="acceptedTypes" class="accepted-types">Accepted: pdf, doc, docx, txt, jpg, jpeg, png, gif, zip, rar (max 200MB)</div>
                </div>
                <div class="spacer-18"></div>
                <div id="selectedFileName" class="selected-filename">No file chosen</div>
                <div class="upload-button-container">
                    <button onclick="uploadAttachment()">Upload File</button>
                </div>
                <div id="attachmentErrorMessage" class="modal-error-message" style="display: none;"></div>
            </div>
            <div id="attachmentsList" class="attachments-list">
                <!-- Attachments will be loaded here -->
            </div>
            <div class="modal-buttons">
                <button onclick="closeModal('attachmentModal')">Close</button>
            </div>
        </div>
    </div>
    
    <!-- LEFT COLUMN -->	
    <div id="left_col">

        <!-- Menu pour mobile -->
        <?php if ($is_mobile): ?>
        <div class="left-header">
            <a href="https://timpoz.com" target="_blank" class="left-header-logo">
                <img src="favicon.ico" alt="<?php echo APP_NAME_DISPLAYED; ?>" class="left-header-favicon">
                <span class="left-header-text"><?php echo APP_NAME_DISPLAYED; ?></span>
            </a>
        </div>
        <div class="containbuttons">
            <div class="newbutton" onclick="newnote();"><span><span title="Create a new note" class="fas fa-file-medical"></span></span></div>
            <div class="newfolderbutton" onclick="newFolder();"><span><span title="Create a new folder" class="fas fa-folder-plus"></span></span></div>
            <div class="list_tags" onclick="window.location = 'listtags.php';"><span><span title="List the tags" class="fas fa-tags"></span></span></div>
            <div class="settings-dropdown">
                <div class="settingsbutton" onclick="toggleSettingsMenu(event);" title="Settings">
                    <span><span class="fas fa-cog"></span></span>
                </div>
                <div class="settings-menu" id="settingsMenuMobile">
                    <div class="settings-menu-item" onclick="foldAllFolders();">
                        <i class="fas fa-minus-square"></i>
                        <span>Fold All Folders</span>
                    </div>
                    <div class="settings-menu-item" onclick="unfoldAllFolders();">
                        <i class="fas fa-plus-square"></i>
                        <span>Unfold All Folders</span>
                    </div>
                    <div class="settings-menu-item" onclick="window.location = 'database_backup.php';">
                        <i class="fas fa-database"></i>
                        <span>Export/Import</span>
                    </div>
                    <div class="settings-menu-item" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                        <i class="fas fa-code-branch"></i>
                        <span>GitHub Repository</span>
                    </div>
                    <div class="settings-menu-item" onclick="showContactPopup();">
                        <i class="fas fa-envelope"></i>
                        <span>Contact</span>
                    </div>
                    <div class="settings-menu-item" onclick="koFiAction();">
                        <i class="fas fa-coffee"></i>
                        <span>Support me</span>
                    </div>
                    <div class="settings-menu-item" onclick="window.location = 'logout.php';">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </div>
                </div>
            </div>
            <div class="trashnotebutton" onclick="window.location = 'trash.php';"><span><span title="Go to the trash" class="fas fa-trash-alt"></span></span></div>
        </div>
        <?php endif; ?>

        <!-- Barre de recherche unifiée pour mobile -->
        <?php if ($is_mobile): ?>
        <div class="mobile-search-container">
            <form id="unified-search-form-mobile" action="index.php" method="POST">
                <div class="unified-search-container mobile">
                    <div class="searchbar-row searchbar-icon-row">
                        <div class="searchbar-input-wrapper">
                            <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search-mobile" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Select search options first..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                            <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                            <?php if (!empty($search) || !empty($tags_search)): ?>
                                <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>
                            <?php endif; ?>
                        </div>
                        <div class="search-type-buttons">
                            <button type="button" class="search-type-btn" id="search-notes-btn-mobile" title="Search in notes" data-type="notes">
                                <i class="fas fa-file-alt"></i>
                            </button>
                            <button type="button" class="search-type-btn" id="search-tags-btn-mobile" title="Search in tags" data-type="tags">
                                <i class="fas fa-tags"></i>
                            </button>
                            <button type="button" class="search-type-btn" id="search-folders-btn-mobile" title="Filter folders" data-type="folders">
                                <i class="fas fa-folder"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Hidden inputs to maintain compatibility -->
                    <input type="hidden" id="search-notes-hidden-mobile" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" id="search-tags-hidden-mobile" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" id="search-in-notes-mobile" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes'])) || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search)) ? '1' : ''); ?>">
                    <input type="hidden" id="search-in-tags-mobile" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags'])) || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search)) ? '1' : ''); ?>">
                    <input type="hidden" id="search-in-folders-mobile" name="search_in_folders" value="">
                </div>
            </form>
        </div>
        <?php endif; ?>
        
    <!-- MENU -->

    <!-- Depending on the cases, we create the queries. -->  
        
    <?php
    // Build search conditions for notes and tags séparément
    $search_condition = '';
    
    if ($using_unified_search) {
        // For unified search, only search in selected areas
        if (!empty($search) && !empty($tags_search)) {
            // Both selected: search in notes OR tags (broader search)
            $terms = explode(' ', trim($search)); // Using $search since both contain the same value
            foreach ($terms as $term) {
                if (!empty(trim($term))) {
                    $search_condition .= " AND ((heading LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%' OR entry LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%') OR tags LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%')";
                }
            }
        } else if (!empty($search)) {
            // Only notes selected
            $terms = explode(' ', trim($search));
            foreach ($terms as $term) {
                if (!empty(trim($term))) {
                    $search_condition .= " AND (heading LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%' OR entry LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%')";
                }
            }
        } else if (!empty($tags_search)) {
            // Only tags selected
            $terms = explode(' ', trim($tags_search));
            foreach ($terms as $term) {
                if (!empty(trim($term))) {
                    $search_condition .= " AND tags LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%'";
                }
            }
        }
    } else {
        // For separate searches, search in both areas if either is present (legacy behavior)
        if (!empty($search)) {
            $terms = explode(' ', trim($search));
            foreach ($terms as $term) {
                if (!empty(trim($term))) {
                    $search_condition .= " AND (heading LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%' OR entry LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%')";
                }
            }
        }
        if (!empty($tags_search)) {
            $terms = explode(' ', trim($tags_search));
            foreach ($terms as $term) {
                if (!empty(trim($term))) {
                    $search_condition .= " AND tags LIKE '%" . mysqli_real_escape_string($con, trim($term)) . "%'";
                }
            }
        }
    }
    
    // Debug removed - search working correctly
    
    // Add folder filter condition
    $folder_condition = '';
    if (!empty($folder_filter)) {
        if ($folder_filter === 'Favorites') {
            $folder_condition = " AND favorite = 1";
        } else {
            $folder_condition = " AND folder = '" . mysqli_real_escape_string($con, $folder_filter) . "'";
        }
    }
    
    $query_left = "SELECT heading, folder, favorite FROM entries WHERE trash = 0$search_condition$folder_condition ORDER BY folder, updated DESC";
    $query_right = "SELECT * FROM entries WHERE trash = 0$search_condition$folder_condition ORDER BY updated DESC LIMIT 1";
    ?>
    
    <!-- MENU -->

    <?php if (!$is_mobile): ?>
    <div class="left-header">
        <a href="https://timpoz.com" target="_blank" class="left-header-logo">
            <img src="favicon.ico" alt="<?php echo APP_NAME_DISPLAYED; ?>" class="left-header-favicon">
            <span class="left-header-text"><?php echo APP_NAME_DISPLAYED; ?></span>
        </a>
    </div>
    <div class="containbuttons">
        <div class="newbutton" onclick="newnote();"><span><span title="Create a new note" class="fas fa-file-medical"></span></span></div>
        <div class="newfolderbutton" onclick="newFolder();"><span><span title="Create a new folder" class="fas fa-folder-plus"></span></span></div>
        <div class="list_tags" onclick="window.location = 'listtags.php';"><span><span title="List the tags" class="fas fa-tags"></span></span></div>
        <div class="settings-dropdown">
            <div class="settingsbutton" onclick="toggleSettingsMenu(event);" title="Settings">
                <span><span class="fas fa-cog"></span></span>
            </div>
            <div class="settings-menu" id="settingsMenu">
                <div class="settings-menu-item" onclick="foldAllFolders();">
                    <i class="fas fa-minus-square"></i>
                    <span>Fold All Folders</span>
                </div>
                <div class="settings-menu-item" onclick="unfoldAllFolders();">
                    <i class="fas fa-plus-square"></i>
                    <span>Unfold All Folders</span>
                </div>
                <div class="settings-menu-item" onclick="window.location = 'database_backup.php';">
                    <i class="fas fa-database"></i>
                    <span>Export/Import</span>
                </div>
                <div class="settings-menu-item" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                    <i class="fas fa-code-branch"></i>
                    <span>GitHub Repository</span>
                </div>
                <div class="settings-menu-item" onclick="showContactPopup();">
                    <i class="fas fa-envelope"></i>
                    <span>Contact</span>
                </div>
                <div class="settings-menu-item" onclick="koFiAction();">
                    <i class="fas fa-coffee"></i>
                    <span>Support me</span>
                </div>
                <div class="settings-menu-item" onclick="window.location = 'logout.php';">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
                </div>
            </div>
        </div>
        <div class="trashnotebutton" onclick="window.location = 'trash.php';"><span><span title="Go to the trash" class="fas fa-trash-alt"></span></span></div>
        <?php
        // Croix rouge retirée
        ?>
    </div>
    <?php endif; ?>
    
    <?php if (!$is_mobile): ?>
    <div class="contains_forms_search searchbar-desktop">
        <form id="unified-search-form" action="index.php" method="POST">
            <div class="unified-search-container">
                <div class="searchbar-row searchbar-icon-row">
                    <div class="searchbar-input-wrapper">
                        <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Select search options first..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                        <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                        <?php if (!empty($search) || !empty($tags_search)): ?>
                            <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>
                        <?php endif; ?>
                    </div>
                    <div class="search-type-buttons">
                        <button type="button" class="search-type-btn" id="search-notes-btn" title="Search in notes" data-type="notes">
                            <i class="fas fa-file-alt"></i>
                        </button>
                        <button type="button" class="search-type-btn" id="search-tags-btn" title="Search in tags" data-type="tags">
                            <i class="fas fa-tags"></i>
                        </button>
                        <button type="button" class="search-type-btn" id="search-folders-btn" title="Filter folders" data-type="folders">
                            <i class="fas fa-folder"></i>
                        </button>
                    </div>
                </div>
                <!-- Hidden inputs to maintain compatibility -->
                <input type="hidden" id="search-notes-hidden" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" id="search-tags-hidden" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" id="search-in-notes" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes'])) || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search)) ? '1' : ''); ?>">
                <input type="hidden" id="search-in-tags" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags'])) || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search)) ? '1' : ''); ?>">
                <input type="hidden" id="search-in-folders" name="search_in_folders" value="">
            </div>
        </form>
    </div>
    <?php endif; ?>
        
    <?php
        // Determine default note folder before JavaScript
        $default_note_folder = null; // Track folder of default note
        
        if($note!='') // If the note is not empty, it means we have just clicked on a note.
        {          
            $query_note = "SELECT * FROM entries WHERE trash = 0 AND heading = '" . mysqli_real_escape_string($con, $note) . "'";
            $res_right = $con->query($query_note);
            
            // Si la note demandée n'existe pas, afficher la dernière note mise à jour
            if(!$res_right || $res_right->num_rows == 0) {
                $note = ''; // Reset note to trigger showing latest note
                $check_notes_query = "SELECT COUNT(*) as note_count FROM entries WHERE trash = 0$search_condition$folder_condition";
                $check_result = $con->query($check_notes_query);
                $note_count = $check_result->fetch_assoc()['note_count'];
                
                if ($note_count > 0) {
                    // Show the most recently updated note
                    $res_right = $con->query($query_right);
                    if($res_right && $res_right->num_rows > 0) {
                        $latest_note = $res_right->fetch_assoc();
                        $default_note_folder = $latest_note["folder"] ?: 'Uncategorized';
                        // Reset the result pointer for display
                        $res_right->data_seek(0);
                    }
                } else {
                    // No notes available, show welcome message
                    $res_right = null;
                }
            }
        } else {
            // No specific note requested, check if we have notes to show the latest one
            $check_notes_query = "SELECT COUNT(*) as note_count FROM entries WHERE trash = 0$search_condition$folder_condition";
            $check_result = $con->query($check_notes_query);
            $note_count = $check_result->fetch_assoc()['note_count'];
            
            if ($note_count > 0) {
                // Show the most recently updated note
                $res_right = $con->query($query_right);
                if($res_right && $res_right->num_rows > 0) {
                    $latest_note = $res_right->fetch_assoc();
                    $default_note_folder = $latest_note["folder"] ?: 'Uncategorized';
                    // Reset the result pointer for display
                    $res_right->data_seek(0);
                }
            } else {
                // No notes available, show welcome message
                $res_right = null;
            }
        }
    ?>
        
    <script>
        // Variables for folder management
        var isSearchMode = <?php echo (!empty($search) || !empty($tags_search)) ? 'true' : 'false'; ?>;
        var currentNoteFolder = <?php 
            if ($note != '' && empty($search) && empty($tags_search)) {
                echo json_encode($current_note_folder ?? 'Uncategorized');
            } else if ($default_note_folder && empty($search) && empty($tags_search)) {
                echo json_encode($default_note_folder);
            } else {
                echo 'null';
            }
        ?>;
    </script>
                    
    <?php
        
        // Determine which folders should be open
        $is_search_mode = !empty($search) || !empty($tags_search);
        
        // Exécution de la requête pour la colonne de gauche
        $res_query_left = $con->query($query_left);
        
        // Group notes by folder for hierarchical display
        $folders = [];
        $folders_with_results = []; // Track folders that have search results
        $favorites = []; // Store favorite notes
        
        while($row1 = mysqli_fetch_array($res_query_left, MYSQLI_ASSOC)) {
            $folder = $row1["folder"] ?: 'Uncategorized';
            if (!isset($folders[$folder])) {
                $folders[$folder] = [];
            }
            $folders[$folder][] = $row1;
            
            // If the note is a favorite, also add it to the favorites "folder"
            if ($row1["favorite"]) {
                $favorites[] = $row1;
            }
            
            // If in search mode, track folders with results
            if($is_search_mode) {
                $folders_with_results[$folder] = true;
                if ($row1["favorite"]) {
                    $folders_with_results['Favorites'] = true;
                }
            }
        }
        
        // Add favorites as a special folder if there are any favorites
        if (!empty($favorites)) {
            $folders = ['Favorites' => $favorites] + $folders;
        }
        
        // Add empty folders from folders table
        $empty_folders_query = $con->query("SELECT name FROM folders ORDER BY name");
        while($folder_row = mysqli_fetch_array($empty_folders_query, MYSQLI_ASSOC)) {
            if (!isset($folders[$folder_row['name']])) {
                $folders[$folder_row['name']] = [];
            }
        }
        
        // Sort folders alphabetically (Favorites first, then Uncategorized, then others)
        uksort($folders, function($a, $b) {
            if ($a === 'Favorites') return -1;
            if ($b === 'Favorites') return 1;
            if ($a === 'Uncategorized') return -1;
            if ($b === 'Uncategorized') return 1;
            return strcasecmp($a, $b);
        });
        
        // Display folders and notes
        foreach($folders as $folderName => $notes) {
            // En mode recherche, ne pas afficher les dossiers vides
            if ($is_search_mode && empty($notes)) {
                continue;
            }
            
            // Show folder header only if not filtering by folder
            if (empty($folder_filter)) {
                $folderClass = 'folder-header';
                $folderId = 'folder-' . md5($folderName);
                
                // Determine if this folder should be open
                $should_be_open = false;
                if($is_search_mode) {
                    // In search mode: open folders that have results
                    $should_be_open = isset($folders_with_results[$folderName]);
                } else if($note != '') {
                    // If a note is selected: open the folder of the current note AND Favoris if note is favorite
                    if ($folderName === $current_note_folder) {
                        $should_be_open = true;
                    } else if ($folderName === 'Favoris') {
                        // Open Favoris folder if the current note is favorite
                        $query_check_favorite = "SELECT favorite FROM entries WHERE trash = 0 AND heading = '" . mysqli_real_escape_string($con, $note) . "'";
                        $res_check_favorite = $con->query($query_check_favorite);
                        if ($res_check_favorite && $res_check_favorite->num_rows > 0) {
                            $favorite_data = $res_check_favorite->fetch_assoc();
                            $should_be_open = $favorite_data['favorite'] == 1;
                        }
                    }
                } else if($default_note_folder) {
                    // If no specific note selected but default note loaded: open its folder
                    $should_be_open = ($folderName === $default_note_folder);
                }
                
                // Set appropriate icon and display style
                $chevron_icon = $should_be_open ? 'fa-chevron-down' : 'fa-chevron-right';
                $folder_display = $should_be_open ? 'block' : 'none';
                
                echo "<div class='$folderClass' data-folder='$folderName' onclick='selectFolder(\"$folderName\", this)'>";
                echo "<div class='folder-toggle' onclick='event.stopPropagation(); toggleFolder(\"$folderId\")' data-folder-id='$folderId'>";
                echo "<i class='fas $chevron_icon folder-icon'></i>";
                
                
                echo "<span class='folder-name' ondblclick='editFolderName(\"$folderName\")'>$folderName</span>";
                echo "<span class='folder-note-count'>(" . count($notes) . ")</span>";
                echo "<span class='folder-actions'>";
                
                // Actions différentes selon le type de dossier
                if ($folderName === 'Favorites') {
                    // Pas d'actions pour le dossier Favorites (il se gère automatiquement)
                } else if ($folderName === 'Uncategorized') {
                    echo "<i class='fas fa-edit folder-edit-btn' onclick='event.stopPropagation(); editFolderName(\"$folderName\")' title='Rename folder'></i>";
                    echo "<i class='fas fa-trash-alt folder-empty-btn' onclick='event.stopPropagation(); emptyFolder(\"$folderName\")' title='Move all notes to trash'></i>";
                } else {
                    echo "<i class='fas fa-edit folder-edit-btn' onclick='event.stopPropagation(); editFolderName(\"$folderName\")' title='Rename folder'></i>";
                    echo "<i class='fas fa-trash folder-delete-btn' onclick='event.stopPropagation(); deleteFolder(\"$folderName\")' title='Delete folder'></i>";
                }
                echo "</span>";
                echo "</div>";
                echo "<div class='folder-content' id='$folderId' style='display: $folder_display;'>";
            }
            
            // Display notes in folder
            foreach($notes as $row1) {
                $isSelected = ($note === $row1["heading"]) ? 'selected-note' : '';
                // Préserver l'état de recherche dans les liens de notes
                $params = [];
                if (!empty($search)) $params[] = 'search=' . urlencode($search);
                if (!empty($tags_search)) $params[] = 'tags_search=' . urlencode($tags_search);
                if (!empty($folder_filter)) $params[] = 'folder=' . urlencode($folder_filter);
                $params[] = 'note=' . urlencode($row1["heading"]);
                $link = 'index.php?' . implode('&', $params);
                
                $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
                echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $row1["heading"] . "' data-folder='$folderName'>";
                echo "<span class='note-title'>" . ($row1["heading"] ?: 'Untitled note') . "</span>";
                echo "</a>";
                echo "<div id=pxbetweennotes></div>";
            }
            
            if (empty($folder_filter)) {
                echo "</div>"; // Close folder-content
                echo "</div>"; // Close folder-header
            }
        }
                 
    ?>
    </div>
    
    <!-- RESIZE HANDLE (Desktop only) -->
    <?php if (!$is_mobile): ?>
    <div class="resize-handle" id="resizeHandle"></div>
    <?php endif; ?>
    
    <!-- RIGHT COLUMN -->	
    <div id="right_col">
    
        <!-- Barre de recherche supprimée de la colonne de droite (desktop) -->
        
        <?php        
            
            // Right-side list based on the query created earlier //		
            
            // Check if we should display a note or welcome message
            if ($res_right && $res_right->num_rows > 0) {
                while($row = mysqli_fetch_array($res_right, MYSQLI_ASSOC))
                {
                
                    $filename = getEntriesRelativePath() . $row["id"] . ".html";
                    $title = $row['heading'];             
                    $entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
               
           
                // Affichage harmonisé desktop/mobile :
                echo '<div id="note'.$row['id'].'" class="notecard">';
                echo '<div class="innernote">';
                // Ligne 1 : barre d’édition centrée (plus de date)
                echo '<div class="note-header">';
                // Boutons de formatage (cachés par défaut sur mobile, visibles lors de sélection)
                echo '<div class="note-edit-toolbar">';
                if ($is_mobile) {
                    echo '<button type="button" class="toolbar-btn btn-home" title="Home" onclick="window.location.href=\'index.php\'"><i class="fas fa-home"></i></button>';
                }
                
                // Boutons de formatage de texte (visibles seulement lors de sélection en desktop)
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
                echo '<button type="button" class="toolbar-btn btn-eraser'.$text_format_class.'" title="Clear formatting" onclick="document.execCommand(\'removeFormat\')"><i class="fas fa-eraser"></i></button>';
                
                // Boutons d'actions sur la note (desktop seulement)
                if (!$is_mobile) {
                    echo '<button type="button" class="toolbar-btn btn-checkbox note-action-btn" title="Add checkbox" onclick="insertCheckbox()"><i class="fas fa-check-square"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-separator note-action-btn" title="Add separator" onclick="insertSeparator()"><i class="fas fa-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-save note-action-btn" title="Save note" onclick="saveFocusedNoteJS()"><i class="fas fa-save"></i></button>';
                }
                
                // Boutons d'actions sur la note (desktop seulement, remplacent le menu déroulant)
                if (!$is_mobile) {
                    // Calculer le nombre d'attachments pour déterminer la couleur du bouton attachments
                    $attachments_count = 0;
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data)) {
                            $attachments_count = count($attachments_data);
                        }
                    }
                    
                    // Bouton favoris avec icône étoile
                    $is_favorite = $row['favorite'] ?? 0;
                    $star_class = $is_favorite ? 'fas' : 'far';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite'.$note_action_class.'" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="'.$star_class.' fa-star star-icon"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-folder'.$note_action_class.'" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fas fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.$note_action_class.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments ('.$attachments_count.')" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fas fa-paperclip"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-download'.$note_action_class.'" title="Export to HTML" onclick="downloadFile(\''.$filename.'\', \''.addslashes($title).'\')"><i class="fas fa-download"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-info'.$note_action_class.'" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', \''.addslashes($row['created']).'\', \''.addslashes($row['updated']).'\')"><i class="fas fa-info-circle"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-trash'.$note_action_class.'" title="Delete" onclick="deleteNote(\''.$row['id'].'\')"><i class="fas fa-trash"></i></button>';
                } else {
                    // Boutons individuels pour mobile (toujours visibles)
                    // Calculer le nombre d'attachments pour le bouton mobile
                    $attachments_count = 0;
                    if (!empty($row['attachments'])) {
                        $attachments_data = json_decode($row['attachments'], true);
                        if (is_array($attachments_data)) {
                            $attachments_count = count($attachments_data);
                        }
                    }
                    
                    // Boutons d'action sur la note 
                    echo '<button type="button" class="toolbar-btn btn-separator" title="Add separator" onclick="insertSeparator()"><i class="fas fa-minus"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-save" title="Save note" onclick="saveFocusedNoteJS()"><i class="fas fa-save"></i></button>';
                    
                    // Bouton favoris avec icône étoile
                    $is_favorite = $row['favorite'] ?? 0;
                    $star_class = $is_favorite ? 'fas' : 'far';
                    $favorite_title = $is_favorite ? 'Remove from favorites' : 'Add to favorites';
                    echo '<button type="button" class="toolbar-btn btn-favorite" title="'.$favorite_title.'" onclick="toggleFavorite(\''.$row['id'].'\')"><i class="'.$star_class.' fa-star star-icon"></i></button>';
                    
                    echo '<button type="button" class="toolbar-btn btn-folder" title="Move to folder" onclick="showMoveFolderDialog(\''.$row['id'].'\')"><i class="fas fa-folder"></i></button>';
                    echo '<button type="button" class="toolbar-btn btn-attachment'.($attachments_count > 0 ? ' has-attachments' : '').'" title="Attachments" onclick="showAttachmentDialog(\''.$row['id'].'\')"><i class="fas fa-paperclip"></i></button>';
                    echo '<a href="'.$filename.'" download="'.$title.'" class="toolbar-btn btn-download" title="Export to HTML"><i class="fas fa-download"></i></a>';
                    echo '<button type="button" class="toolbar-btn btn-info" title="Information" onclick="showNoteInfo(\''.$row['id'].'\', \''.addslashes($row['created']).'\', \''.addslashes($row['updated']).'\')"><i class="fas fa-info-circle"></i></button>';
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
                
                // Hidden folder value for the note
                echo '<input type="hidden" id="folder'.$row['id'].'" value="'.htmlspecialchars($row['folder'] ?: 'Uncategorized', ENT_QUOTES).'"/>';
                // Titre
                echo '<h4><input class="css-title" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateidhead(this);" id="inp'.$row['id'].'" type="text" placeholder="Title ?" value="'.htmlspecialchars(htmlspecialchars_decode($row['heading'] ?: 'Untitled note'), ENT_QUOTES).'"/></h4>';
                // Contenu de la note
                echo '<div class="noteentry" autocomplete="off" autocapitalize="off" spellcheck="false" onfocus="updateident(this);" id="entry'.$row['id'].'" data-ph="Enter text or paste images" contenteditable="true">'.$entryfinal.'</div>';
                echo '<div class="note-bottom-space"></div>';
                echo '</div>';
                echo '</div>';
            }
        } else {
            // Check if we're in search mode (search or tags search active)
            $is_search_active = !empty($search) || !empty($tags_search);
            
            if ($is_search_active) {
                // Display "No notes found" message for search results
                echo '<div class="welcome-message welcome-message-full">';
                echo '    <div class="welcome-content">';
                echo '        <div class="welcome-icon">';
                echo '            <i class="fas fa-search" style="font-size: 4rem; color: #007DB8; margin-bottom: 1.5rem;"></i>';
                echo '        </div>';
                echo '        <h2 class="welcome-title">No notes found</h2>';
                echo '        <p class="welcome-description">Your search didn\'t return any results. Try different keywords or check your spelling.</p>';
                echo '        <div class="welcome-actions">';
                echo '            <button class="welcome-btn welcome-btn-secondary" onclick="clearSearch()">';
                echo '                <i class="fas fa-times"></i>';
                echo '                Clear search';
                echo '            </button>';
                echo '        </div>';
                echo '    </div>';
                echo '</div>';
            } else {
                // Display welcome message when no note is available (first time use)
                echo '<div class="welcome-message welcome-message-full">';
                echo '    <div class="welcome-content">';
                echo '        <div class="welcome-icon">';
                echo '            <div class="poznote-logo">';
                echo '                <img src="favicon.ico" alt="Poznote" class="poznote-favicon">';
                echo '            </div>';
                echo '        </div>';
                echo '        <h2 class="welcome-title">' . APP_NAME_DISPLAYED . '</h2>';
                echo '        <p class="welcome-description">Create your first note to get started</p>';
                echo '        <div class="welcome-actions">';
                echo '            <button class="welcome-btn welcome-btn-primary" onclick="createFirstNote()">';
                echo '                <i class="fas fa-plus"></i>';
                echo '                Create your first note';
                echo '            </button>';
                echo '        </div>';
                echo '    </div>';
                echo '</div>';
            }
        }
        ?>        
    </div>
        
    </div>  <!-- Close main-container -->
    
    <script>
    </script>
</body>
<script src="js/script.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/welcome.js"></script>

</html>
