<?php
/**
 * Template for the mobile menu of index.php
 * Expected variables: $is_mobile, $displayWorkspace, $workspace_filter
 */
?>

<!-- Mobile menu -->
<?php if ($is_mobile): ?>
<div class="sidebar-header">
    <div class="sidebar-title-row">
        <div class="sidebar-title" role="button" tabindex="0" onclick="toggleWorkspaceMenu(event);">
            <img src="favicon.ico" class="workspace-title-icon" alt="Poznote" aria-hidden="true">
            <span class="workspace-title-text"><?php echo htmlspecialchars($displayWorkspace, ENT_QUOTES); ?></span>
        </div>
        <div class="sidebar-title-actions">
            <button class="sidebar-plus" onclick="toggleCreateMenu();" title="Create"><i class="fas fa-plus"></i></button>
        </div>
    </div>

    <!-- CTA buttons moved to sidebar footer (index.php) -->
    <div class="mobile-search-container">
        <form id="unified-search-form-mobile" action="index.php" method="POST">
            <div class="unified-search-container mobile">
                <div class="searchbar-row searchbar-icon-row">
                    <div class="searchbar-input-wrapper">
                        <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search-mobile" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Rechercher..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                        <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                        <?php if (!empty($search) || !empty($tags_search)): ?>
                            <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>
                        <?php endif; ?>
                    </div>
                </div>
                <!-- Hidden inputs to maintain compatibility -->
                <input type="hidden" id="search-notes-hidden-mobile" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" id="search-tags-hidden-mobile" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
                <input type="hidden" id="search-in-notes-mobile" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags && !$preserve_folders) ? '1' : ''); ?>">
                <input type="hidden" id="search-in-tags-mobile" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
                <input type="hidden" id="search-in-folders-mobile" name="search_in_folders" value="<?php echo ($using_unified_search && !empty($_POST['search_in_folders']) && $_POST['search_in_folders'] === '1') || (!$using_unified_search && $preserve_folders) ? '1' : ''; ?>">
            </div>
        </form>
    </div>

</div>
<div class="containbuttons">
    <div class="newbutton" onclick="newnote();"><span><span title="Create a new note" class="fas fa-file-medical"></span></span></div>
    <div class="newfolderbutton" onclick="newFolder();"><span><span title="Create a new folder" class="fas fa-folder-plus"></span></span></div>
    <div class="list_tags" onclick="window.location = 'list_tags.php?workspace=<?php echo urlencode($workspace_filter); ?>';"><span><span title="List the tags" class="fas fa-tags"></span></span></div>
    <div class="workspace-dropdown">
        <div class="small-workspace-btn" title="Switch workspace" role="button" aria-haspopup="true" aria-expanded="false" onclick="toggleWorkspaceMenu(event)">
            <span><span class="fas fa-layer-group" aria-hidden="true"></span></span>
        </div>
        <div class="workspace-menu" id="workspaceMenuMobile">
            <!-- Menu items will be loaded dynamically -->
        </div>
    </div>
    <div class="trashnotebutton" onclick="window.location = 'trash.php?workspace=<?php echo urlencode($workspace_filter); ?>';"><span><span title="Go to the trash" class="fas fa-archive"></span></span></div>
</div>
<?php endif; ?>

<!-- Unified search bar for mobile -->
<?php if ($is_mobile): ?>
<div class="mobile-search-container">
    <form id="unified-search-form-mobile" action="index.php" method="POST">
        <div class="unified-search-container mobile">
            <div class="searchbar-row searchbar-icon-row">
                <div class="searchbar-input-wrapper">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search-mobile" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="Rechercher..." value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                    <span class="searchbar-icon"><span class="fas fa-search"></span></span>
                    <?php if (!empty($search) || !empty($tags_search)): ?>
                        <button type="button" class="searchbar-clear" title="Clear search" onclick="clearUnifiedSearch(); return false;"><span class="fas fa-times-circle"></span></button>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- Search options removed per UI update -->
            
            <!-- Hidden inputs to maintain compatibility -->
            <input type="hidden" id="search-notes-hidden-mobile" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" id="search-tags-hidden-mobile" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
            <input type="hidden" id="search-in-notes-mobile" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags && !$preserve_folders) ? '1' : ''); ?>">
            <input type="hidden" id="search-in-tags-mobile" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
            <input type="hidden" id="search-in-folders-mobile" name="search_in_folders" value="<?php echo ($using_unified_search && !empty($_POST['search_in_folders']) && $_POST['search_in_folders'] === '1') || (!$using_unified_search && $preserve_folders) ? '1' : ''; ?>">
        </div>
    </form>
</div>
<?php endif; ?>
