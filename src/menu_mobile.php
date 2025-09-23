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
            <button class="sidebar-plus" onclick="toggleCreateMenu();" title="Create"><i class="fa-plus"></i></button>
        </div>

        <!-- Workspace menu container (mobile) -->
        <div class="workspace-menu" id="workspaceMenuMobile">
            <!-- Menu items will be loaded dynamically -->
        </div>
    </div>

        <!-- Compact mobile search bar -->
        <div class="mobile-search-container">
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
                    <!-- Hidden inputs to maintain compatibility -->
                    <input type="hidden" id="search-notes-hidden-mobile" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" id="search-tags-hidden-mobile" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
                    <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
                </div>
            </form>
        </div>

</div>
<?php endif; ?>
