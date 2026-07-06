<?php
/**
 * Template for the notes list (left column) of index.php
 * Expected variables: $folders, $is_search_mode, $folder_filter, $workspace_filter, etc.
 */

// Count favorites for the current workspace (needed for display)
$favorites_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM entries WHERE trash = 0 AND favorite = 1";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " AND workspace = ?";
            $params[] = $workspace_filter;
        }
        if (function_exists('appendNoteAgeFilter') && function_exists('getNoteAgeFilterDays')) {
            appendNoteAgeFilter($query, $params, getNoteAgeFilterDays($con));
        }
        $stmtFavorites = $con->prepare($query);
        $stmtFavorites->execute($params);
        $favorites_count = (int)$stmtFavorites->fetchColumn();
    }
} catch (Exception $e) {
    $favorites_count = 0;
}

$selected_linked_note_id = isset($_GET['select_linked_note']) ? intval($_GET['select_linked_note']) : 0;
$has_created_date_filter = !empty($created_from) || !empty($created_to);

?>

<!-- Notes list display -->
<!-- Search bar container - always visible -->
<div class="contains_forms_search" id="search-bar-container" style="display: block;">
    <form id="unified-search-form" action="index.php" method="POST">
        <div class="unified-search-container">
            <div class="searchbar-row searchbar-icon-row">
                <button type="button" id="search-options-toggle" class="searchbar-options-toggle" title="<?php echo t_h('search.toggle_options', [], 'Toggle search options'); ?>">
                    <i class="lucide lucide-more-vertical"></i>
                </button>
                <div class="searchbar-type-icons<?php echo !isset($search_combined) || $search_combined !== false ? ' hidden' : ''; ?>" id="searchbar-type-icons">
                    <button type="button" id="search-notes-btn" class="searchbar-type-btn searchbar-type-notes active" data-search-type="notes" title="<?php echo t_h('search.search_in_notes', [], 'Search in notes'); ?>">
                        <i class="lucide lucide-file-alt"></i>
                    </button>
                    <button type="button" id="search-tags-btn" class="searchbar-type-btn searchbar-type-tags" data-search-type="tags" title="<?php echo t_h('search.search_in_tags', [], 'Search in tags'); ?>">
                        <i class="lucide lucide-tag"></i>
                    </button>
                </div>
                <div class="searchbar-input-wrapper searchbar-has-date-toggle<?php echo (!empty($search) || !empty($tags_search) || $has_created_date_filter) ? ' searchbar-has-clear' : ''; ?>">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="<?php echo t_h('search.placeholder_notes'); ?>" value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                    <button type="button" id="search-date-toggle" class="searchbar-date-toggle<?php echo $has_created_date_filter ? ' active' : ''; ?>" data-action="toggle-date-filter" title="<?php echo t_h('search.toggle_date_filter', [], 'Toggle date filter'); ?>" aria-label="<?php echo t_h('search.toggle_date_filter', [], 'Toggle date filter'); ?>" aria-controls="search-date-filter" aria-expanded="<?php echo $has_created_date_filter ? 'true' : 'false'; ?>">
                        <i class="lucide lucide-calendar"></i>
                    </button>
                    <?php if (!empty($search) || !empty($tags_search) || $has_created_date_filter): ?>
                        <button type="button" class="searchbar-clear" title="<?php echo t_h('search.clear'); ?>" data-action="clear-search"><span class="clear-icon">×</span></button>
                    <?php endif; ?>
                </div>
            </div>
            <div class="search-date-filter<?php echo $has_created_date_filter ? ' active' : ''; ?>" id="search-date-filter"<?php echo $has_created_date_filter ? '' : ' hidden'; ?>>
                <div class="search-date-field">
                    <label for="created-from">
                        <i class="lucide lucide-calendar"></i>
                        <span><?php echo t_h('search.created_from', [], 'Created from'); ?></span>
                    </label>
                    <input id="created-from" class="search-date-input" type="date" name="created_from" value="<?php echo htmlspecialchars($created_from ?? '', ENT_QUOTES); ?>">
                </div>
                <div class="search-date-field">
                    <label for="created-to">
                        <i class="lucide lucide-calendar"></i>
                        <span><?php echo t_h('search.created_to', [], 'Created to'); ?></span>
                    </label>
                    <input id="created-to" class="search-date-input" type="date" name="created_to" value="<?php echo htmlspecialchars($created_to ?? '', ENT_QUOTES); ?>">
                </div>
            </div>
            <input type="hidden" id="search-notes-hidden" name="search" value="<?php echo htmlspecialchars($search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" id="search-tags-hidden" name="tags_search" value="<?php echo htmlspecialchars($tags_search ?? '', ENT_QUOTES); ?>">
            <input type="hidden" name="workspace" value="<?php echo htmlspecialchars($workspace_filter, ENT_QUOTES); ?>">
            <input type="hidden" id="search-in-notes" name="search_in_notes" value="<?php echo ($using_unified_search && !empty($_POST['search_in_notes']) && $_POST['search_in_notes'] === '1') || (!$using_unified_search && (!empty($search) || $preserve_notes)) ? '1' : ((!$using_unified_search && empty($search) && empty($tags_search) && !$preserve_tags) ? '1' : ''); ?>">
            <input type="hidden" id="search-in-tags" name="search_in_tags" value="<?php echo ($using_unified_search && !empty($_POST['search_in_tags']) && $_POST['search_in_tags'] === '1') || (!$using_unified_search && (!empty($tags_search) || $preserve_tags)) ? '1' : ''; ?>">
            <input type="hidden" id="search-combined-mode" name="search_combined" value="<?php echo $search_combined ? '1' : ''; ?>">
        </div>
    </form>
</div>

<div class="notes-list-scrollable-content">

<?php

function renderNoteListItem($row1, $noteClass, $isSelected, $link, $folderId, $folderName) {
    global $show_note_icons_setting;

    $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
    $noteTitle = $row1["heading"] ?: t('index.note.new_note', [], 'New note');
    $noteTitle = translateDefaultNoteTitle($noteTitle);

    $noteIcon = '';
    if (!empty($show_note_icons_setting)) {
        $noteIconRaw = !empty($row1['icon']) ? $row1['icon'] : '';
        $noteIconColor = !empty($row1['icon_color']) ? (string)$row1['icon_color'] : '';
        $noteIcon = renderEditableNoteIcon($noteDbId, $noteTitle, $noteIconRaw, $noteIconColor, 'note-list-click-action') . ' ';
    }

    $noteTypeIcon = '';
    $noteType = $row1['type'] ?? 'note';
    $linkedNoteIdAttr = '';
    if ($noteType === 'linked') {
        $noteTypeIcon = '<i class="lucide lucide-link note-type-icon-inline"></i> ';
        if (!empty($row1['linked_note_id'])) {
            $linkedNoteIdAttr = " data-linked-note-id='" . intval($row1['linked_note_id']) . "'";
        }
    }

    $htmlFolderId = htmlspecialchars((string)$folderId, ENT_QUOTES);
    $htmlFolderName = htmlspecialchars((string)$folderName, ENT_QUOTES);
    $htmlNoteType = htmlspecialchars($noteType, ENT_QUOTES);
    $htmlCreated = htmlspecialchars($row1['created'] ?? '', ENT_QUOTES);
    $htmlUpdated = htmlspecialchars($row1['updated'] ?? '', ENT_QUOTES);

    echo "<div class='note-list-item'>";
    echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . htmlspecialchars((string)$noteDbId, ENT_QUOTES) . "' data-note-db-id='" . htmlspecialchars((string)$noteDbId, ENT_QUOTES) . "' data-note-type='" . $htmlNoteType . "'" . $linkedNoteIdAttr . " data-folder-id='$htmlFolderId' data-folder='$htmlFolderName' data-created='" . $htmlCreated . "' data-updated='" . $htmlUpdated . "' draggable='true' data-action='load-note' data-dblaction='open-note-new-tab'>";
    echo "<span class='note-title'>" . $noteIcon . $noteTypeIcon . htmlspecialchars($noteTitle, ENT_QUOTES) . "</span>";
    echo "</a>";
    echo "</div>";
    echo "<div id=pxbetweennotes></div>";
}

function displayFolderRecursive($folderId, $folderData, $depth, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined = false, $displayUncategorizedFirst = true, $created_from = '', $created_to = '') {
    global $selected_linked_note_id;
    $folderName = $folderData['name'];
    $notes = $folderData['notes'];
    
    // In search mode, don't display empty folders (unless they have children with results)
    if ($is_search_mode && countNotesRecursively($folderData) === 0) {
        return;
    }
    
    // Show folder header only if not filtering by folder
    if (empty($folder_filter)) {
        $folderClass = 'folder-header';
        if ($depth > 0) $folderClass .= ' subfolder subfolder-level-' . $depth;
        $folderDomId = 'folder-' . $folderId;
        
        // Determine if this folder should be open
        $should_be_open = shouldFolderBeOpen($con, $folderData, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes);
        
        // Set appropriate folder icon (open/closed) and display style
        // Check if folder has a custom icon and color
        $customIcon = isset($folderData['icon']) && !empty($folderData['icon']) ? $folderData['icon'] : null;
        $customIconColor = isset($folderData['icon_color']) && !empty($folderData['icon_color']) ? $folderData['icon_color'] : null;

        if ($customIcon) {
            // Use custom icon - don't toggle between open/closed
            // Convert Font Awesome icons to Lucide format for backward compatibility
            $chevron_icon = convertFontAwesomeToLucide($customIcon);
        } else {
            // Use default icons that toggle
            $chevron_icon = $should_be_open ? 'lucide lucide-folder-open' : 'lucide lucide-folder';
        }
        
        $folder_display = $should_be_open ? 'block' : 'none';
        
        // Check if this is a system folder (not draggable)
        $systemFolders = ['Favorites', 'Tags', 'Trash', 'Public'];
        $isSystemFolder = in_array($folderName, $systemFolders);
        if ($isSystemFolder) $folderClass .= ' system-folder';
        $draggableAttr = $isSystemFolder ? '' : " draggable='true'";
        
        // Escape for HTML attributes
        $htmlFolderName = htmlspecialchars($folderName, ENT_QUOTES, 'UTF-8');
        $currentSort = $folderData['sort_setting'] ?? '';
        echo "<div class='$folderClass' data-folder-id='" . (int)$folderId . "' data-folder='$htmlFolderName' data-folder-key='folder_" . (int)$folderId . "' data-sort-setting='" . htmlspecialchars($currentSort, ENT_QUOTES) . "' data-action='select-folder'>";
        // Make the entire folder toggle area clickable to open/close the folder
        // draggable is set here to avoid capturing note drag events from folder-content
        echo "<div class='folder-toggle' data-action='toggle-folder' data-folder-dom-id='$folderDomId' data-folder-id='$folderId' data-folder='$folderName'$draggableAttr>";
        
        // Use an empty star icon for the Favorites pseudo-folder
        if ($folderName === 'Favorites') {
            echo "<i class='lucide lucide-star folder-icon'></i>";
        } else {
            $openKanbanTitle = t_h('kanban.actions.open', [], 'Open Kanban view');
            $changeIconTitle = t_h('notes_list.folder_actions.change_icon', [], 'Change icon');
            $folderIconUsesKanban = function_exists('poznoteUsesFolderIconKanban') ? poznoteUsesFolderIconKanban() : true;
            $folderIconAction = $folderIconUsesKanban ? 'open-kanban-view' : 'open-folder-icon-picker';
            $folderIconTitle = $folderIconUsesKanban ? $openKanbanTitle : $changeIconTitle;
            $iconStyle = $customIconColor ? " style='color: " . htmlspecialchars($customIconColor, ENT_QUOTES) . " !important;'" : "";
            $iconColorAttr = $customIconColor ? " data-icon-color='" . htmlspecialchars($customIconColor, ENT_QUOTES) . "'" : "";
            
            echo "<i class='$chevron_icon folder-icon folder-list-click-action' data-custom-icon='" . ($customIcon ? 'true' : 'false') . "'$iconColorAttr data-action='" . $folderIconAction . "' data-folder-id='$folderId' data-folder-name='" . htmlspecialchars($folderName, ENT_QUOTES) . "' data-kanban-title='" . $openKanbanTitle . "' data-change-icon-title='" . $changeIconTitle . "' title='" . $folderIconTitle . "'$iconStyle></i>";
        }
        
        // Workspace-aware folder handling in UI
        // Disable double-click rename for system folders (already defined above)
        $folderDisplayName = $folderName;
        if ($folderName === 'Favorites') {
            $folderDisplayName = t('notes_list.system_folders.favorites', [], 'Favorites');
        }
        $dblActionAttr = $isSystemFolder ? '' : " data-dblaction='edit-folder-name' data-folder-id='$folderId' data-folder-name='" . htmlspecialchars($folderName, ENT_QUOTES) . "'";
        // Add toggle-folder action on the folder name span
        echo "<span class='folder-name' data-action='toggle-folder' data-folder-dom-id='$folderDomId' data-folder-id='$folderDomId'$dblActionAttr>" . htmlspecialchars($folderDisplayName, ENT_QUOTES) . "</span>";
        // Count notes recursively (includes all subfolder notes)
        $noteCount = countNotesRecursively($folderData);
        echo "<span class='folder-note-count' id='count-" . $folderId . "'>(" . $noteCount . ")</span>";
        echo "<span class='folder-actions'>";
        
        // Generate folder actions
        echo generateFolderActions($folderId, $folderName, $con, $workspace_filter, $noteCount, $currentSort);
        
        echo "</span>";
        echo "</div>";
        echo "<div class='folder-content' id='$folderDomId' style='display: $folder_display;'>";
    }
    
    // Display notes in folder (before subfolders if displayUncategorizedFirst is true)
    if ($displayUncategorizedFirst) {
        foreach($notes as $row1) {
            $isSelected = (($note == $row1["id"]) || ($selected_linked_note_id > 0 && $selected_linked_note_id == $row1["id"])) ? 'selected-note' : '';
            
            // Generate note link
            $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined, $created_from, $created_to);
            
            $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
            if ($depth > 0) $noteClass .= ' note-in-subfolder';
            renderNoteListItem($row1, $noteClass, $isSelected, $link, $folderId, $folderName);
        }
    }
    
    // Recursively display subfolders
    if (isset($folderData['children']) && !empty($folderData['children'])) {
        foreach ($folderData['children'] as $childId => $childData) {
            displayFolderRecursive($childId, $childData, $depth + 1, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst, $created_from, $created_to);
        }
    }

    // Display notes in folder (after subfolders if displayUncategorizedFirst is false)
    if (!$displayUncategorizedFirst) {
        foreach($notes as $row1) {
            $isSelected = (($note == $row1["id"]) || ($selected_linked_note_id > 0 && $selected_linked_note_id == $row1["id"])) ? 'selected-note' : '';
            
            // Generate note link
            $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined, $created_from, $created_to);
            
            $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
            if ($depth > 0) $noteClass .= ' note-in-subfolder';
            renderNoteListItem($row1, $noteClass, $isSelected, $link, $folderId, $folderName);
        }
    }
    
    if (empty($folder_filter)) {
        echo "</div>"; // Close folder-content
        echo "</div>"; // Close folder-header
    }
}

// Enrich folders with parent_id from database
$folders = enrichFoldersWithParentId($folders, $con, $workspace_filter);

// Build hierarchical structure
$hierarchicalFolders = buildFolderHierarchy($folders);

// Determine if we should display uncategorized notes first (after Favorites, before other folders)
// Reuses the setting already loaded by index.php (also used there for the SQL
// ORDER BY) instead of re-querying the settings table.
$displayUncategorizedFirst = !(isset($notes_without_folders_after) ? $notes_without_folders_after : true);

// If sorting alphabetically, always display uncategorized notes at the end
if (isset($note_list_sort_type) && $note_list_sort_type === 'heading_asc') {
    $displayUncategorizedFirst = false;
}

// Separate Favorites folder from other folders
$favoritesFolder = null;
$regularFolders = [];
foreach($hierarchicalFolders as $folderId => $folderData) {
    if ($folderData['name'] === 'Favorites') {
        $favoritesFolder = [$folderId => $folderData];
    } else {
        $regularFolders[$folderId] = $folderData;
    }
}

// Display Favorites folder after Dashboard
if ($favoritesFolder && $favorites_count > 0) {
    foreach($favoritesFolder as $folderId => $folderData) {
        displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst, $created_from, $created_to);
    }
}

// Add drop zone for moving notes to root (no folder)
if (empty($folder_filter)) {
    echo '<div id="root-drop-zone" class="root-drop-zone initially-hidden">';
    echo '<div class="drop-zone-content">';
    echo '<i class="lucide lucide-home drop-zone-icon"></i>';
    echo '<span class="drop-zone-text">' . t_h('notes_list.drop_zone.remove_from_folder', [], 'Drop here to remove from folder') . '</span>';
    echo '</div>';
    echo '</div>';
}

// Display uncategorized notes (notes without folder) AFTER Favorites if sorting by date
if (isset($uncategorized_notes) && !empty($uncategorized_notes) && empty($folder_filter) && $displayUncategorizedFirst) {
    // Sort uncategorized notes by date (updated or created depending on sort type)
    $sortedUncategorized = $uncategorized_notes;
    if ($note_list_sort_type === 'updated_desc') {
        usort($sortedUncategorized, function($a, $b) {
            return strcmp($b['updated'] ?? '', $a['updated'] ?? '');
        });
    } elseif ($note_list_sort_type === 'created_desc') {
        usort($sortedUncategorized, function($a, $b) {
            return strcmp($b['created'] ?? '', $a['created'] ?? '');
        });
    }
    
    foreach ($sortedUncategorized as $row1) {
        $isSelected = ((isset($note) && $row1["id"] == $note) || ($selected_linked_note_id > 0 && $selected_linked_note_id == $row1["id"])) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined, $created_from, $created_to);
        
        $noteClass = 'links_arbo_left note-without-folder';
        renderNoteListItem($row1, $noteClass, $isSelected, $link, '', '');
    }
}

// Display regular folders and notes hierarchically
foreach($regularFolders as $folderId => $folderData) {
    displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst, $created_from, $created_to);
}

// Display uncategorized notes (notes without folder) at the END if NOT sorting by date (i.e., alphabetical sort)
if (isset($uncategorized_notes) && !empty($uncategorized_notes) && empty($folder_filter) && !$displayUncategorizedFirst) {
    foreach ($uncategorized_notes as $row1) {
        $isSelected = ((isset($note) && $row1["id"] == $note) || ($selected_linked_note_id > 0 && $selected_linked_note_id == $row1["id"])) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined, $created_from, $created_to);
        
        $noteClass = 'links_arbo_left note-without-folder';
        renderNoteListItem($row1, $noteClass, $isSelected, $link, '', '');
    }
}
?>
</div><!-- End of notes-list-scrollable-content -->

<?php
// Single shared dropdown for the per-folder three-dot toggles (position:fixed,
// populated and placed by toggleFolderActionsMenu in js/utils.js). Kept
// outside the scrollable container so no ancestor can clip or transform it.
echo renderFolderActionsMenu();
?>

<!-- Mini Calendar Component -->
<div class="mini-calendar-container">
    <div id="mini-calendar">
        <!-- Calendar will be rendered here by JavaScript -->
    </div>
</div>
