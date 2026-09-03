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

// Favorite folders for the current workspace, listed in the Favorites section
$favorite_folders = [];
try {
    if (isset($con)) {
        $query = "SELECT id, name, icon, icon_color FROM folders WHERE favorite = 1";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " AND workspace = ?";
            $params[] = $workspace_filter;
        }
        $query .= " ORDER BY name COLLATE NOCASE";
        $stmtFavoriteFolders = $con->prepare($query);
        $stmtFavoriteFolders->execute($params);
        $favorite_folders = $stmtFavoriteFolders->fetchAll(PDO::FETCH_ASSOC);
    }
} catch (Exception $e) {
    $favorite_folders = [];
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

<?php if (!empty($folder_filter)): ?>
<?php
    $exit_folder_filter_link = 'index.php';
    if (!empty($workspace_filter)) {
        $exit_folder_filter_link .= '?workspace=' . urlencode($workspace_filter);
    }

    // Resolve the filtered folder's id so the banner icon can open its Kanban
    // board, the same way the folder icons in the tree below do.
    $banner_folder_id = null;
    if ($folder_filter !== 'Favorites') {
        try {
            if (isset($con)) {
                $bannerQuery = "SELECT id FROM folders WHERE name = ?";
                $bannerParams = [$folder_filter];
                if (!empty($workspace_filter)) {
                    $bannerQuery .= " AND workspace = ?";
                    $bannerParams[] = $workspace_filter;
                }
                $stmtBannerFolder = $con->prepare($bannerQuery);
                $stmtBannerFolder->execute($bannerParams);
                $bannerFolderRow = $stmtBannerFolder->fetchColumn();
                if ($bannerFolderRow !== false) {
                    $banner_folder_id = (int)$bannerFolderRow;
                }
            }
        } catch (Exception $e) {
            $banner_folder_id = null;
        }
    }
    $banner_kanban_title = t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view');
?>
<div class="folder-filter-banner" id="folder-filter-banner">
    <span class="folder-filter-banner-name">
        <?php if ($banner_folder_id !== null): ?>
        <i class="lucide lucide-folder folder-filter-banner-icon" data-action="open-kanban-view" data-folder-id="<?php echo $banner_folder_id; ?>" data-folder-name="<?php echo htmlspecialchars($folder_filter, ENT_QUOTES); ?>" title="<?php echo $banner_kanban_title; ?>" role="button" tabindex="0" aria-label="<?php echo $banner_kanban_title; ?>"></i>
        <?php else: ?>
        <i class="lucide lucide-folder"></i>
        <?php endif; ?>
        <span><?php echo htmlspecialchars($folder_filter, ENT_QUOTES); ?></span>
    </span>
    <a class="folder-filter-banner-clear" href="<?php echo htmlspecialchars($exit_folder_filter_link, ENT_QUOTES); ?>" title="<?php echo t_h('notes_list.folder_filter.exit', [], 'Exit folder view'); ?>" aria-label="<?php echo t_h('notes_list.folder_filter.exit', [], 'Exit folder view'); ?>"><span class="clear-icon">×</span></a>
</div>
<?php endif; ?>

<div class="notes-list-scrollable-content">

<?php

function renderNoteListItem($row1, $noteClass, $isSelected, $link, $folderId, $folderName) {
    global $show_note_icons_setting;

    $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
    $noteTitle = $row1["heading"] ?: t('index.note.new_note', [], 'New note');
    $noteTitle = translateDefaultNoteTitle($noteTitle);

    $noteType = $row1['type'] ?? 'note';

    $noteIcon = '';
    if (!empty($show_note_icons_setting)) {
        $noteIconRaw = !empty($row1['icon']) ? $row1['icon'] : '';
        $noteIconColor = !empty($row1['icon_color']) ? (string)$row1['icon_color'] : '';
        $noteIcon = renderEditableNoteIcon($noteDbId, $noteTitle, $noteIconRaw, $noteIconColor, 'note-list-click-action', $noteType) . ' ';
    }

    $noteTypeIcon = '';
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
    echo generateNoteActions($noteDbId, $noteTitle, $noteType, $folderId, $folderName, !empty($row1['favorite']));
    echo "</div>";
    echo "<div id=pxbetweennotes></div>";
}

// Render favorite folders as shortcut links inside the Favorites section.
// Clicking one opens the folder-filtered view (same as filtering by folder).
function renderFavoriteFolderItems($favorite_folders, $workspace_filter) {
    foreach ($favorite_folders as $favFolder) {
        $favName = $favFolder['name'];
        $link = 'index.php?folder=' . urlencode($favName);
        if (!empty($workspace_filter)) {
            $link .= '&workspace=' . urlencode($workspace_filter);
        }

        $customIcon = !empty($favFolder['icon']) ? convertFontAwesomeToLucide($favFolder['icon']) : 'lucide lucide-folder';
        $iconStyle = !empty($favFolder['icon_color']) ? " style='color: " . htmlspecialchars($favFolder['icon_color'], ENT_QUOTES) . " !important;'" : "";

        echo "<div class='note-list-item favorite-folder-item'>";
        echo "<a class='links_arbo_left note-in-folder favorite-folder-link' href='" . htmlspecialchars($link, ENT_QUOTES) . "' data-folder-id='" . (int)$favFolder['id'] . "' data-folder='" . htmlspecialchars($favName, ENT_QUOTES) . "'>";
        echo "<span class='note-title'><i class='$customIcon favorite-folder-icon'$iconStyle></i>" . htmlspecialchars($favName, ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "</div>";
        echo "<div id=pxbetweennotes></div>";
    }
}

/**
 * Path of folder ids leading to the folder named $name, deepest last.
 *
 * Folder names are unique within a workspace (folder views address them by
 * name), so a name is enough to locate a single node in the hierarchy.
 *
 * @param array $nodes Hierarchical folder nodes
 * @param string $name Folder name to locate
 * @param array $path Ids collected so far (internal)
 * @return array|null Ids from the root down to the folder, or null if absent
 */
function findFolderPathByName($nodes, $name, $path = []) {
    foreach ($nodes as $nodeId => $nodeData) {
        $currentPath = array_merge($path, [$nodeId]);
        if (isset($nodeData['name']) && $nodeData['name'] === $name) {
            return $currentPath;
        }
        if (!empty($nodeData['children'])) {
            $found = findFolderPathByName($nodeData['children'], $name, $currentPath);
            if ($found !== null) {
                return $found;
            }
        }
    }

    return null;
}

function displayFolderRecursive($folderId, $folderData, $depth, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined = false, $displayUncategorizedFirst = true, $created_from = '', $created_to = '') {
    global $selected_linked_note_id, $favorite_folders, $folder_tree_active_id, $folder_tree_ancestors;
    $folderName = $folderData['name'];
    $notes = $folderData['notes'];

    // Favorite folder shortcuts only make sense in the normal browsing view
    $isFavoritesSection = ($folderName === 'Favorites' && $depth === 0);
    $hasFavoriteFolders = $isFavoritesSection && !empty($favorite_folders) && empty($folder_filter) && !$is_search_mode;

    // In search mode, don't display empty folders (unless they have children with results)
    if ($is_search_mode && countNotesRecursively($folderData) === 0) {
        return;
    }
    
    // Show folder header when browsing normally. Under a folder filter the root
    // folder is already named by the banner, so only its subfolders get one.
    $showFolderHeader = empty($folder_filter) || $depth > 0;
    if ($showFolderHeader) {
        $folderClass = 'folder-header';
        if ($depth > 0) $folderClass .= ' subfolder subfolder-level-' . $depth;
        // Folder hierarchy the user is working in: the folder itself carries
        // .folder-tree-active, its ancestors .folder-tree-branch. Everything
        // else is dimmed by css/folders/tree-highlight.css when the
        // "Highlight current folder tree" setting is on.
        if ($folder_tree_active_id !== null) {
            if ((string)$folderId === $folder_tree_active_id) {
                $folderClass .= ' folder-tree-active';
            } elseif (isset($folder_tree_ancestors[(string)$folderId])) {
                $folderClass .= ' folder-tree-branch';
            }
        }
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
            $changeIconTitle = t_h('notes_list.folder_actions.change_icon', [], 'Change icon');
            $iconStyle = $customIconColor ? " style='color: " . htmlspecialchars($customIconColor, ENT_QUOTES) . " !important;'" : "";
            $iconColorAttr = $customIconColor ? " data-icon-color='" . htmlspecialchars($customIconColor, ENT_QUOTES) . "'" : "";

            echo "<i class='$chevron_icon folder-icon folder-list-click-action' data-custom-icon='" . ($customIcon ? 'true' : 'false') . "'$iconColorAttr data-action='open-folder-icon-picker' data-folder-id='$folderId' data-folder-name='" . htmlspecialchars($folderName, ENT_QUOTES) . "' title='" . $changeIconTitle . "'$iconStyle></i>";
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
        echo generateFolderActions($folderId, $folderName, $con, $workspace_filter, $noteCount, $currentSort, !empty($folderData['favorite']));
        
        echo "</span>";
        echo "</div>";
        echo "<div class='folder-content' id='$folderDomId' style='display: $folder_display;'>";

        // Favorite folders are listed first inside the Favorites section
        if ($hasFavoriteFolders) {
            renderFavoriteFolderItems($favorite_folders, $workspace_filter);
        }
    }

    // Display notes in folder (before subfolders if displayUncategorizedFirst is true)
    if ($displayUncategorizedFirst) {
        foreach($notes as $row1) {
            $isSelected = (($note == $row1["id"]) || ($selected_linked_note_id > 0 && $selected_linked_note_id == $row1["id"])) ? 'selected-note' : '';
            
            // Generate note link
            $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined, $created_from, $created_to);
            
            // Indent notes that sit under a folder header; under a folder filter
            // the root folder has no header, so its own notes stay flush left.
            $noteClass = $showFolderHeader ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
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
            
            // Indent notes that sit under a folder header; under a folder filter
            // the root folder has no header, so its own notes stay flush left.
            $noteClass = $showFolderHeader ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
            if ($depth > 0) $noteClass .= ' note-in-subfolder';
            renderNoteListItem($row1, $noteClass, $isSelected, $link, $folderId, $folderName);
        }
    }
    
    if ($showFolderHeader) {
        echo "</div>"; // Close folder-content
        echo "</div>"; // Close folder-header
    }
}

// Enrich folders with parent_id from database
$folders = enrichFoldersWithParentId($folders, $con, $workspace_filter);

// Build hierarchical structure
$hierarchicalFolders = buildFolderHierarchy($folders);

// When browsing a single folder, keep only that folder's subtree so the
// filtered view is a pruned version of the normal tree rather than a flat list.
// addEmptyFolders() re-injected every folder of the workspace, so prune here.
if (!empty($folder_filter) && $folder_filter !== 'Favorites') {
    $filteredRoots = [];
    $findFolderByName = function ($nodes) use (&$findFolderByName, $folder_filter, &$filteredRoots) {
        foreach ($nodes as $nodeId => $nodeData) {
            if ($nodeData['name'] === $folder_filter) {
                $filteredRoots[$nodeId] = $nodeData;
            } elseif (!empty($nodeData['children'])) {
                $findFolderByName($nodeData['children']);
            }
        }
    };
    $findFolderByName($hierarchicalFolders);
    $hierarchicalFolders = $filteredRoots;
}

// Resolve the folder hierarchy the user is currently working in: the folder of
// the selected note (or of the note shown by default when none was requested).
// Done server-side so the list paints already dimmed; js/folder-tree-highlight.js
// takes over afterwards, since notes and folders open without a page reload.
$folder_tree_active_id = null;
$folder_tree_ancestors = [];
$folder_tree_active_name = ($note != '') ? $current_note_folder : $default_note_folder;
if (!empty($folder_tree_active_name) && $folder_tree_active_name !== FAVORITES_FOLDER_NAME) {
    $folder_tree_path = findFolderPathByName($hierarchicalFolders, $folder_tree_active_name);
    if (!empty($folder_tree_path)) {
        $folder_tree_active_id = (string)array_pop($folder_tree_path);
        foreach ($folder_tree_path as $ancestorId) {
            $folder_tree_ancestors[(string)$ancestorId] = true;
        }
    }
}

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
if ($favoritesFolder && ($favorites_count > 0 || (!empty($favorite_folders) && !$is_search_mode))) {
    foreach($favoritesFolder as $folderId => $folderData) {
        displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst, $created_from, $created_to);
    }
    // Light separator between the Favorites section and the rest of the list.
    // In search mode displayFolderRecursive() skips an empty Favorites folder,
    // so mirror that check to avoid an orphaned line; under a folder filter the
    // section has no header, so no separator either.
    if (empty($folder_filter) && (!$is_search_mode || countNotesRecursively(reset($favoritesFolder)) > 0)) {
        echo '<div class="favorites-separator"></div>';
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
    } elseif ($note_list_sort_type === 'manual') {
        usort($sortedUncategorized, 'compareNotesManualOrder');
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
// Same arrangement for the per-note three-dot toggles.
echo renderNoteActionsMenu($workspace_filter);
?>

<!-- Mini Calendar Component -->
<div class="mini-calendar-container">
    <div id="mini-calendar">
        <!-- Calendar will be rendered here by JavaScript -->
    </div>
</div>
