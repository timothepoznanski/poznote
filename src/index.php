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
    $user_agent = strtolower($_SERVER['HTTP_USER_AGENT']);
    $is_mobile = preg_match('/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/', $user_agent) ? true : false;
}

include 'functions.php';
include 'db_connect.php';

// Get the custom default folder name
$defaultFolderName = getDefaultFolderName();

// Column verification (only on application startup)
// In SQLite, we use PRAGMA table_info to check columns
$stmt = $con->query("PRAGMA table_info(entries)");
$columns = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $columns[] = $row['name'];
}

if (!in_array('folder', $columns)) {
    $con->query("ALTER TABLE entries ADD COLUMN folder varchar(255) DEFAULT '$defaultFolderName'");
}

if (!in_array('favorite', $columns)) {
    $con->query("ALTER TABLE entries ADD COLUMN favorite INTEGER DEFAULT 0");
}

if (!in_array('attachments', $columns)) {
    $con->query("ALTER TABLE entries ADD COLUMN attachments TEXT DEFAULT NULL");
}

$search = $_POST['search'] ?? $_GET['search'] ?? '';
$tags_search = $_POST['tags_search'] ?? $_GET['tags_search'] ?? $_GET['tags_search_from_list'] ?? '';

// Handle folder exclusions from search
$excluded_folders = [];
if (isset($_POST['excluded_folders']) && !empty($_POST['excluded_folders'])) {
    $excluded_folders = json_decode($_POST['excluded_folders'], true);
    if (!is_array($excluded_folders)) {
        $excluded_folders = [];
    }
    // Debug: uncomment to see what folders are being excluded
    // if (!empty($excluded_folders)) {
    //     error_log("Excluded folders: " . print_r($excluded_folders, true));
    // }
    // if (!empty($_POST)) {
    //     error_log("POST search: " . $search . ", tags_search: " . $tags_search);
    //     error_log("POST unified_search: " . ($_POST['unified_search'] ?? 'empty'));
    //     error_log("POST search_in_notes: " . ($_POST['search_in_notes'] ?? 'empty'));
    //     error_log("POST search_in_tags: " . ($_POST['search_in_tags'] ?? 'empty'));
    // }
}

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

        // Determine default note folder before JavaScript
        $default_note_folder = null; // Track folder of default note
        $res_right = null; // Initialize $res_right to avoid undefined variable error
        
        if($note!='') // If the note is not empty, it means we have just clicked on a note.
        {          
            $stmt = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND heading = ?");
            $stmt->execute([$note]);
            $note_data = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if($note_data) {
                $current_note_folder = $note_data["folder"] ?: $defaultFolderName;
                // Prepare result for right column
                $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND heading = ?");
                $stmt_right->execute([$note]);
                $res_right = $stmt_right;
            } else {
                // If the requested note doesn't exist, display the last updated note
                $note = ''; // Reset note to trigger showing latest note
                $check_stmt = $con->prepare("SELECT COUNT(*) as note_count FROM entries WHERE trash = 0");
                $check_stmt->execute();
                $note_count_row = $check_stmt->fetch(PDO::FETCH_ASSOC);
                $note_count = $note_count_row['note_count'];
                
                if ($note_count > 0) {
                    // Show the most recently updated note
                    $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
                    $stmt_right->execute();
                    $latest_note = $stmt_right->fetch(PDO::FETCH_ASSOC);
                    if($latest_note) {
                        $default_note_folder = $latest_note["folder"] ?: $defaultFolderName;
                        // Reset statement to be used in display loop
                        $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
                        $stmt_right->execute();
                        $res_right = $stmt_right;
                    }
                } else {
                    // No notes available, show welcome screen
                    $res_right = null;
                }
            }
        } else {
            // No specific note requested, check if we have notes to show the latest one
            $check_stmt = $con->prepare("SELECT COUNT(*) as note_count FROM entries WHERE trash = 0");
            $check_stmt->execute();
            $note_count = $check_stmt->fetch(PDO::FETCH_ASSOC)['note_count'];
            
            if ($note_count > 0) {
                // Show the most recently updated note
                $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
                $stmt_right->execute();
                $latest_note = $stmt_right->fetch(PDO::FETCH_ASSOC);
                if($latest_note) {
                    $default_note_folder = $latest_note["folder"] ?: $defaultFolderName;
                    // Reset statement to be used in display loop
                    $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 ORDER BY updated DESC LIMIT 1");
                    $stmt_right->execute();
                    $res_right = $stmt_right;
                }
            } else {
                // No notes available, show welcome screen
                $res_right = null;
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
    
    <!-- Update Modal -->
    <div id="updateModal" class="modal">
        <div class="modal-content">
            <h3>🎉 New Update Available!</h3>
            <p>A new version of Poznote is available. Your data will be preserved during the update.</p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeUpdateModal()">Cancel</button>
                <button type="button" class="btn-update" onclick="goToUpdateInstructions()">See Update instructions</button>
            </div>
        </div>
    </div>
    
    <!-- Update Check Modal -->
    <div id="updateCheckModal" class="modal">
        <div class="modal-content">
            <h3>Checking for Updates...</h3>
            <p id="updateCheckStatus">Please wait while we check for updates...</p>
            <div class="modal-buttons" id="updateCheckButtons" style="display: none;">
                <button type="button" class="btn-cancel" onclick="closeUpdateCheckModal()">Close</button>
            </div>
        </div>
    </div>
    
    <!-- Confirmation Modal -->
    <div id="confirmModal" class="modal">
        <div class="modal-content">
            <h3 id="confirmTitle">Confirm Action</h3>
            <p id="confirmMessage">Are you sure you want to proceed?</p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeConfirmModal()">Cancel</button>
                <button type="button" class="btn-primary" id="confirmButton" onclick="executeConfirmedAction()">Confirm</button>
            </div>
        </div>
    </div>
    
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
                <option value="<?php echo htmlspecialchars($defaultFolderName, ENT_QUOTES); ?>"><?php echo htmlspecialchars($defaultFolderName, ENT_QUOTES); ?></option>
            </select>
            <div class="modal-buttons">
                <button onclick="moveNoteToFolder()">Move</button>
                <button onclick="closeModal('moveNoteModal')">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Modal for moving note to folder from toolbar -->
    <div id="moveNoteFolderModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('moveNoteFolderModal')">&times;</span>
            <h3>Move Note to Folder</h3>
            <p>Search or enter a folder name:</p>
            
            <!-- Smart folder search/input -->
            <div class="folder-search-container">
                <input type="text" id="folderSearchInput" class="folder-search-input" 
                       placeholder="Type to search folders or create new..." 
                       autocomplete="off" maxlength="255"
                       oninput="handleFolderSearch()" 
                       onkeydown="handleFolderKeydown(event)">
                
                <!-- Recent folders -->
                <div id="recentFoldersSection" class="recent-folders-section">
                    <div class="recent-folders-label">Recent folders:</div>
                    <div id="recentFoldersList" class="recent-folders-list">
                        <!-- Recent folders will be loaded here -->
                    </div>
                </div>
                
                <!-- Dropdown with matching folders -->
                <div id="folderDropdown" class="folder-dropdown">
                    <!-- Matching folders will appear here -->
                </div>
            </div>
            
            <!-- Action buttons -->
            <div class="modal-buttons">
                <button type="button" id="moveActionButton" class="btn-primary" onclick="executeFolderAction()">Move</button>
                <button type="button" class="btn-cancel" onclick="closeModal('moveNoteFolderModal')">Cancel</button>
            </div>
            
            <!-- Error message display -->
            <div id="moveFolderErrorMessage" class="modal-error-message" style="display: none;">
                Please enter a folder name
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

    <!-- Modal for editing default folder name -->
    <div id="editDefaultFolderModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('editDefaultFolderModal')">&times;</span>
            <h3>Rename Default Folder</h3>
            <p>This is the default folder where new notes are placed when no specific folder is selected.</p>
            <input type="text" id="editDefaultFolderName" placeholder="Default folder name" maxlength="255">
            <div class="modal-buttons">
                <button onclick="saveDefaultFolderName()">Save</button>
                <button onclick="closeModal('editDefaultFolderModal')">Cancel</button>
            </div>
        </div>
    </div>
    
    <!-- Modal for deleting folder -->
    <div id="deleteFolderModal" class="modal">
        <div class="modal-content">
            <h3>Delete Folder</h3>
            <p id="deleteFolderMessage"></p>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" onclick="closeModal('deleteFolderModal')">Cancel</button>
                <button type="button" class="btn-danger" onclick="executeDeleteFolder()">Delete Folder</button>
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
                <div id="selectedFileName" class="selected-filename"></div>
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

        <!-- Mobile menu -->
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
                    <div class="settings-menu-item" onclick="window.location = 'ai.php';">
                        <i class="fas fa-robot"></i>
                        <span>AI settings <?php echo isAIEnabled() ? '<small style="color: #28a745;">(enabled)</small>' : '<small style="color: #dc3545;">(disabled)</small>'; ?></span>
                    </div>
                    <div class="settings-menu-item" onclick="window.location = 'backup_export.php';">
                        <i class="fas fa-upload"></i>
                        <span>Backup (Export)</span>
                    </div>
                    <div class="settings-menu-item" onclick="window.location = 'restore_import.php';">
                        <i class="fas fa-download"></i>
                        <span>Restore (Import)</span>
                    </div>
                    <div class="settings-menu-item" id="update-check-item-mobile" onclick="checkForUpdates();">
                        <i id="update-icon-mobile" class="fas fa-sync-alt"></i>
                        <span>Check for Updates</span>
                        <small id="update-status-mobile" style="display: none; color: #666; font-size: 0.8em; margin-top: 2px;"></small>
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
            <div class="trashnotebutton" onclick="window.location = 'trash.php';"><span><span title="Go to the trash" class="fas fa-archive"></span></span></div>
        </div>
        <?php endif; ?>

        <!-- Unified search bar for mobile -->
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
    // SECURE SEARCH TEMPORARY
    // TODO: Replace with complete version with all functionalities
    $where_conditions = ["trash = 0"];
    $search_params = [];
    
    // Simple secure search (basic version)
    if (!empty($search)) {
        $where_conditions[] = "(heading LIKE ? OR entry LIKE ?)";
        $search_params[] = '%' . $search . '%';
        $search_params[] = '%' . $search . '%';
    }
    
    if (!empty($tags_search)) {
        $where_conditions[] = "tags LIKE ?";
        $search_params[] = '%' . $tags_search . '%';
    }
    
    // Secure folder filter
    if (!empty($folder_filter)) {
        if ($folder_filter === 'Favorites') {
            $where_conditions[] = "favorite = 1";
        } else {
            $where_conditions[] = "folder = ?";
            $search_params[] = $folder_filter;
        }
    }
    
    // Exclude folders from search if specified
    if (!empty($excluded_folders)) {
        $exclude_placeholders = [];
        $exclude_favorite = false;
        
        foreach ($excluded_folders as $excludedFolder) {
            if ($excludedFolder === 'Favorites') {
                // For Favorites, exclude favorite notes
                $exclude_favorite = true;
            } else {
                $exclude_placeholders[] = "?";
                $search_params[] = $excludedFolder;
            }
        }
        
        // Add folder exclusion condition
        if (!empty($exclude_placeholders)) {
            $where_conditions[] = "(folder IS NULL OR folder NOT IN (" . implode(", ", $exclude_placeholders) . "))";
        }
        
        // Add favorite exclusion condition
        if ($exclude_favorite) {
            $where_conditions[] = "(favorite IS NULL OR favorite != 1)";
        }
    }
    
    $where_clause = implode(" AND ", $where_conditions);
    
    // Debug: uncomment to see the final query and parameters
    // error_log("Where clause: " . $where_clause);
    // error_log("Search params: " . print_r($search_params, true));
    
    // Secure prepared queries
    $query_left_secure = "SELECT id, heading, folder, favorite FROM entries WHERE $where_clause ORDER BY folder, updated DESC";
    $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
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
                <div class="settings-menu-item" onclick="window.location = 'ai.php';">
                    <i class="fas fa-robot"></i>
                    <span>AI settings <?php echo isAIEnabled() ? '<small style="color: #28a745;">(enabled)</small>' : '<small style="color: #dc3545;">(disabled)</small>'; ?></span>
                </div>
                <div class="settings-menu-item" onclick="window.location = 'backup_export.php';">
                    <i class="fas fa-upload"></i>
                    <span>Backup (Export)</span>
                </div>
                <div class="settings-menu-item" onclick="window.location = 'restore_import.php';">
                    <i class="fas fa-download"></i>
                    <span>Restore (Import)</span>
                </div>
                <div class="settings-menu-item" id="update-check-item" onclick="checkForUpdates();">
                    <i id="update-icon-desktop" class="fas fa-sync-alt"></i>
                    <span>Check for Updates</span>
                    <small id="update-status" style="display: none; color: #666; font-size: 0.8em; margin-top: 2px;"></small>
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
        <div class="trashnotebutton" onclick="window.location = 'trash.php';"><span><span title="Go to the trash" class="fas fa-archive"></span></span></div>
        <?php
        // Red cross removed
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
        
    <script>
        // Configuration variables for the main page
        isSearchMode = <?php echo (!empty($search) || !empty($tags_search)) ? 'true' : 'false'; ?>;
        currentNoteFolder = <?php 
            if ($note != '' && empty($search) && empty($tags_search)) {
                echo json_encode($current_note_folder ?? $defaultFolderName);
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
        
        // Execute query for left column
        $stmt_left = $con->prepare($query_left_secure);
        $stmt_left->execute($search_params);
        
        // Execute query for right column (for search results)
        if ($is_search_mode) {
            // If a specific note is selected, show that note instead of the most recent one
            if (!empty($note)) {
                // Build query to show the selected note if it matches search criteria
                $where_conditions_with_note = $where_conditions;
                $search_params_with_note = $search_params;
                $where_conditions_with_note[] = "heading = ?";
                $search_params_with_note[] = $note;
                
                $where_clause_with_note = implode(" AND ", $where_conditions_with_note);
                $query_right_with_note = "SELECT * FROM entries WHERE $where_clause_with_note LIMIT 1";
                
                $stmt_right = $con->prepare($query_right_with_note);
                $stmt_right->execute($search_params_with_note);
                $selected_note_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
                
                if ($selected_note_result) {
                    // Reset statement for display loop
                    $stmt_right = $con->prepare($query_right_with_note);
                    $stmt_right->execute($search_params_with_note);
                    $res_right = $stmt_right;
                } else {
                    // Selected note doesn't match search criteria, show most recent matching note
                    $stmt_right = $con->prepare($query_right_secure);
                    $stmt_right->execute($search_params);
                    $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
                    if ($search_result) {
                        // Reset statement for display loop
                        $stmt_right = $con->prepare($query_right_secure);
                        $stmt_right->execute($search_params);
                        $res_right = $stmt_right;
                    } else {
                        $res_right = null; // No results found
                    }
                }
            } else {
                // No specific note selected, show most recent matching note
                $stmt_right = $con->prepare($query_right_secure);
                $stmt_right->execute($search_params);
                $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
                if ($search_result) {
                    // Reset statement for display loop
                    $stmt_right = $con->prepare($query_right_secure);
                    $stmt_right->execute($search_params);
                    $res_right = $stmt_right;
                } else {
                    $res_right = null; // No results found
                }
            }
        }
        
        // Group notes by folder for hierarchical display
        $folders = [];
        $folders_with_results = []; // Track folders that have search results
        $favorites = []; // Store favorite notes
        
        while($row1 = $stmt_left->fetch(PDO::FETCH_ASSOC)) {
            $folder = $row1["folder"] ?: $defaultFolderName;
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
        while($folder_row = $empty_folders_query->fetch(PDO::FETCH_ASSOC)) {
            if (!isset($folders[$folder_row['name']])) {
                $folders[$folder_row['name']] = [];
            }
        }
        
        // Sort folders alphabetically (Favorites first, then default folder, then others)
        uksort($folders, function($a, $b) use ($defaultFolderName) {
            if ($a === 'Favorites') return -1;
            if ($b === 'Favorites') return 1;
            if (isDefaultFolder($a)) return -1;
            if (isDefaultFolder($b)) return 1;
            return strcasecmp($a, $b);
        });
        
        // Display folders and notes
        foreach($folders as $folderName => $notes) {
            // In search mode, don't display empty folders
            if ($is_search_mode && empty($notes)) {
                continue;
            }
            
            // Show folder header only if not filtering by folder
            if (empty($folder_filter)) {
                $folderClass = 'folder-header';
                $folderId = 'folder-' . md5($folderName);
                
                // Determine if this folder should be open
                $should_be_open = false;
                
                // Check if we have very few notes (likely just created demo notes)
                $total_notes_query = "SELECT COUNT(*) as total FROM entries WHERE trash = 0";
                $total_notes_result = $con->query($total_notes_query);
                $total_notes = $total_notes_result->fetch(PDO::FETCH_ASSOC)['total'];
                
                if($total_notes <= 3) {
                    // If we have very few notes (demo notes just created), open all folders
                    $should_be_open = true;
                } else if($is_search_mode) {
                    // In search mode: open folders that have results
                    $should_be_open = isset($folders_with_results[$folderName]);
                } else if($note != '') {
                    // If a note is selected: open the folder of the current note AND Favoris if note is favorite
                    if ($folderName === $current_note_folder) {
                        $should_be_open = true;
                    } else if ($folderName === 'Favoris') {
                        // Open Favoris folder if the current note is favorite
                        $stmt_check_favorite = $con->prepare("SELECT favorite FROM entries WHERE trash = 0 AND heading = ?");
                        $stmt_check_favorite->execute([$note]);
                        $favorite_data = $stmt_check_favorite->fetch(PDO::FETCH_ASSOC);
                        $should_be_open = $favorite_data && $favorite_data['favorite'] == 1;
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
                
                
                echo "<span class='folder-name' ondblclick='" . (isDefaultFolder($folderName) ? 'editDefaultFolderName()' : 'editFolderName(\"' . $folderName . '\")') . "'>$folderName</span>";
                echo "<span class='folder-note-count'>(" . count($notes) . ")</span>";
                echo "<span class='folder-actions'>";
                
                // Different actions depending on folder type
                if ($folderName === 'Favorites') {
                    // Search filter icon for Favorites folder
                    echo "<i class='fas fa-search folder-search-btn' onclick='event.stopPropagation(); toggleFolderSearchFilter(\"$folderName\")' title='Include/exclude from search' data-folder='$folderName'></i>";
                } else if (isDefaultFolder($folderName)) {
                    echo "<i class='fas fa-search folder-search-btn' onclick='event.stopPropagation(); toggleFolderSearchFilter(\"$folderName\")' title='Include/exclude from search' data-folder='$folderName'></i>";
                    echo "<i class='fas fa-edit folder-edit-btn' onclick='event.stopPropagation(); editDefaultFolderName()' title='Rename default folder'></i>";
                    echo "<i class='fas fa-trash-alt folder-empty-btn' onclick='event.stopPropagation(); emptyFolder(\"$folderName\")' title='Move all notes to trash'></i>";
                } else {
                    echo "<i class='fas fa-search folder-search-btn' onclick='event.stopPropagation(); toggleFolderSearchFilter(\"$folderName\")' title='Include/exclude from search' data-folder='$folderName'></i>";
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
                // Preserve search state in note links
                $params = [];
                if (!empty($search)) $params[] = 'search=' . urlencode($search);
                if (!empty($tags_search)) $params[] = 'tags_search=' . urlencode($tags_search);
                if (!empty($folder_filter)) $params[] = 'folder=' . urlencode($folder_filter);
                if ($preserve_notes) $params[] = 'preserve_notes=1';
                if ($preserve_tags) $params[] = 'preserve_tags=1';
                $params[] = 'note=' . urlencode($row1["heading"]);
                $link = 'index.php?' . implode('&', $params);
                
                $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
                $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
                echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $row1["heading"] . "' data-note-db-id='" . $noteDbId . "' data-folder='$folderName'>";
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
    
        <!-- Search bar removed from right column (desktop) -->
        
        <?php        
            
            // Right-side list based on the query created earlier //		
            
            // Check if we should display a note or welcome message
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
                if ($is_mobile) {
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
                    
                    // Use goBackToNoteList function for better mobile experience if no search parameters
                    if (empty($home_params)) {
                        echo '<button type="button" class="toolbar-btn btn-home" title="Home" onclick="goBackToNoteList()"><i class="fas fa-home"></i></button>';
                    } else {
                        echo '<button type="button" class="toolbar-btn btn-home" title="Home" onclick="window.location.href=\'' . htmlspecialchars($home_url, ENT_QUOTES) . '\'"><i class="fas fa-home"></i></button>';
                    }
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
                    if (isDefaultFolder($folder_name)) $folder_name = 'Non classé';
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
                // Note content
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
                echo '            <button class="welcome-btn welcome-btn-secondary" onclick="clearUnifiedSearch()">';
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
    
    <?php if (isAIEnabled()): ?>
    <!-- AI Summary Modal -->
    <div id="aiSummaryModal" class="modal">
        <div class="modal-content ai-summary-simple">
            <div class="modal-body">
                <div id="aiSummaryLoading" class="ai-loading">
                    <i class="fas fa-robot rotating"></i>
                    <p>Generating summary...</p>
                </div>
                <div id="aiSummaryContent" style="display: none;">
                    <div id="summaryText" class="summary-text-simple"></div>
                </div>
                <div id="aiSummaryError" style="display: none;">
                    <div class="error-content">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p id="errorMessage"></p>
                    </div>
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
<script src="js/script.js"></script>
<script src="js/resize-column.js"></script>
<script src="js/unified-search.js"></script>
<script src="js/note-loader.js"></script>
<script src="js/welcome.js"></script>
<?php if (isAIEnabled()): ?>
<script src="js/ai.js"></script>
<?php endif; ?>

</html>
