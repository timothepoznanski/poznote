<?php
/**
 * Template for the desktop menu of index.php  
 * Expected variables: $is_mobile, $displayWorkspace, $workspace_filter, $search, $tags_search
 */
?>

<!-- Desktop menu -->
<?php if (!$is_mobile): ?>
<div class="left-header">
    <span class="left-header-text">
        <span id="workspaceNameDesktop"><?php echo $displayWorkspace; ?></span>
    </span>
</div>
<div class="containbuttons">
    <div class="newbutton" onclick="newnote();"><span><span title="Create a new note" class="fas fa-file-medical"></span></span></div>
    <div class="newfolderbutton" onclick="newFolder();"><span><span title="Create a new folder" class="fas fa-folder-plus"></span></span></div>
<div class="list_tags" onclick="window.location = 'list_tags.php?workspace=<?php echo urlencode($workspace_filter); ?>';"><span><span title="List the tags" class="fas fa-tags"></span></span></div>
    <!-- Small workspace icon (desktop) with dropdown menu -->
    <div class="workspace-dropdown">
        <div class="small-workspace-btn" title="Switch workspace" role="button" aria-haspopup="true" aria-expanded="false" onclick="toggleWorkspaceMenu(event)">
            <span><span class="fas fa-layer-group" aria-hidden="true"></span></span>
        </div>
        <div class="workspace-menu" id="workspaceMenu">
            <!-- Menu items will be loaded dynamically -->
        </div>
    </div>
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
            <!-- Manage workspaces moved to the left header workspace control -->
            <div class="settings-menu-item" onclick="window.location = 'ai.php';">
                <i class="fas fa-robot"></i>
                <span>AI<?php echo isAIEnabled() ? '<span class="ai-status enabled">(enabled)</span>' : '<span class="ai-status disabled">(disabled)</span>'; ?></span>
            </div>
            <div class="settings-menu-item" onclick="showLoginDisplayNamePrompt();">
                <i class="fas fa-user"></i>
                <span>Login display name</span>
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
                <small id="update-status"></small>
            </div>
            <div class="settings-menu-item" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                <i class="fas fa-code-branch"></i>
                <span>GitHub Repository</span>
            </div>
            <div class="settings-menu-item" onclick="window.open('https://poznote.com', '_blank');">
                <i class="fas fa-globe"></i>
                <span>Website</span>
            </div>
            <!-- Tim's projects removed from settings per request -->
            <div class="settings-menu-item" onclick="window.location = 'logout.php';">
                <i class="fas fa-sign-out-alt"></i>
                <span>Logout</span>
            </div>
        </div>
    </div>
<div class="trashnotebutton" onclick="window.location = 'trash.php?workspace=<?php echo urlencode($workspace_filter); ?>';"><span><span title="Go to the trash" class="fas fa-archive"></span></span></div>
    <?php
    // Red cross removed
    ?>
</div>
<?php endif; ?>

<!-- Desktop search form -->
<?php if (!$is_mobile): ?>
<div class="contains_forms_search searchbar-desktop">
    <form id="unified-search-form" action="index.php" method="POST">
        <div class="unified-search-container">
            <div class="searchbar-row searchbar-icon-row">
                <div class="searchbar-input-wrapper">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Search..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                    <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                    <?php if (!empty($search) || !empty($tags_search)): ?>
                        <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- Search options pills below the search bar -->
            <div class="search-options-container">
                <div class="search-type-pills">
                    <button type="button" class="search-pill" id="search-notes-btn" title="Search in note content" data-type="notes">
                        <i class="fas fa-file-alt"></i>
                        <span>Notes</span>
                    </button>
                    <button type="button" class="search-pill" id="search-tags-btn" title="Search in one or more tags" data-type="tags">
                        <i class="fas fa-tags"></i>
                        <span>Tags</span>
                    </button>
                    <button type="button" class="search-pill" id="search-folders-btn" title="Filter folders" data-type="folders">
                        <i class="fas fa-folder"></i>
                        <span>Folders</span>
                    </button>
                </div>
            </div>
            
            <!-- Hidden inputs to maintain compatibility -->
            <input type="hidden" id="search-notes-hidden" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" id="search-tags-hidden" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
            <input type="hidden" id="search-in-notes" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags) ? '1' : ''); ?>">
            <input type="hidden" id="search-in-tags" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
            <input type="hidden" id="search-in-folders" name="search_in_folders" value="">
        </div>
    </form>
</div>
<?php endif; ?>
