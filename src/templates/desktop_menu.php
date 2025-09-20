<?php
/**
 * Template for the desktop menu of index.php  
 * Expected variables: $is_mobile, $displayWorkspace, $workspace_filter, $search, $tags_search
 */
?>

<!-- Desktop menu -->
<?php if (!$is_mobile): ?>
<div class="sidebar-header">
    <div class="sidebar-title-row">
    <div class="sidebar-title" role="button" tabindex="0" onclick="toggleWorkspaceMenu(event);">
        <img src="favicon.ico" class="workspace-title-icon" alt="Poznote" aria-hidden="true">
        <span class="workspace-title-text"><?php echo htmlspecialchars($displayWorkspace, ENT_QUOTES); ?></span>
    </div>
        <div class="sidebar-title-actions">
            <button class="sidebar-plus" onclick="toggleCreateMenu();" title="Create"><i class="fa-plus"></i></button>
        </div>

        <!-- Workspace menu container (desktop) -->
        <div class="workspace-menu" id="workspaceMenu">
            <!-- Menu items will be loaded dynamically -->
        </div>
    </div>

    <!-- CTA buttons moved to sidebar footer (index.php) -->

    <div class="contains_forms_search searchbar-desktop">
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
                
                <!-- Hidden inputs to maintain compatibility -->
                <input type="hidden" id="search-notes-hidden" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" id="search-tags-hidden" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
                <input type="hidden" id="search-in-notes" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags && !$preserve_folders) ? '1' : ''); ?>">
                <input type="hidden" id="search-in-tags" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
                <input type="hidden" id="search-in-folders" name="search_in_folders" value="<?php echo ($using_unified_search && !empty($_POST['search_in_folders']) && $_POST['search_in_folders'] === '1') || (!$using_unified_search && $preserve_folders) ? '1' : ''; ?>">
            </div>
        </form>
    </div>

</div>

<?php endif; ?>
