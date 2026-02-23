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
        $stmtFavorites = $con->prepare($query);
        $stmtFavorites->execute($params);
        $favorites_count = (int)$stmtFavorites->fetchColumn();
    }
} catch (Exception $e) {
    $favorites_count = 0;
}

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
                <div class="searchbar-input-wrapper">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="<?php echo t_h('search.placeholder_notes'); ?>" value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                    <?php if (!empty($search) || !empty($tags_search)): ?>
                        <button type="button" class="searchbar-clear" title="<?php echo t_h('search.clear'); ?>" data-action="clear-search"><span class="clear-icon">×</span></button>
                    <?php endif; ?>
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

<?php
/**
 * Recursive function to display folders and their subfolders
 */
function displayFolderRecursive($folderId, $folderData, $depth, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined = false, $displayUncategorizedFirst = true) {
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
            // All folder icons open kanban view
            $iconStyle = $customIconColor ? " style='color: " . htmlspecialchars($customIconColor, ENT_QUOTES) . " !important;'" : "";
            $iconColorAttr = $customIconColor ? " data-icon-color='" . htmlspecialchars($customIconColor, ENT_QUOTES) . "'" : "";
            
            echo "<i class='$chevron_icon folder-icon' data-custom-icon='" . ($customIcon ? 'true' : 'false') . "'$iconColorAttr data-action='open-kanban-view' data-folder-id='$folderId' data-folder-name='" . htmlspecialchars($folderName, ENT_QUOTES) . "' title='" . t_h('kanban.actions.open', [], 'Open Kanban view') . "'$iconStyle></i>";
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
            $isSelected = ($note == $row1["id"]) ? 'selected-note' : '';
            
            // Generate note link
            $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined);
            
            $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
            if ($depth > 0) $noteClass .= ' note-in-subfolder';
            $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
            
            // Translate default note titles (New note, Nouvelle note, etc.)
            $noteTitle = $row1["heading"] ?: t('index.note.new_note', [], 'New note');
            
            // Check if the title matches a default note pattern in any supported language
            if (preg_match('/^(?:New note|Nouvelle note|Neue Notiz|Nueva nota|Nova nota)( \(\d+\))?$/', $noteTitle)) {
                // Default title - translate to current language
                if (preg_match('/^(?:New note|Nouvelle note|Neue Notiz|Nueva nota|Nova nota) \((\d+)\)$/', $noteTitle, $matches)) {
                    $noteTitle = t('index.note.new_note_numbered', ['number' => $matches[1]], 'New note (' . $matches[1] . ')');
                } else {
                    $noteTitle = t('index.note.new_note', [], 'New note');
                }
            }
            
            // Add icon for linked notes
            $noteIcon = '';
            $noteType = $row1['type'] ?? 'note';
            $linkedNoteIdAttr = '';
            if ($noteType === 'linked') {
                $noteIcon = '<i class="lucide lucide-link note-type-icon-inline"></i> ';
                // Add the linked_note_id attribute if available
                if (!empty($row1['linked_note_id'])) {
                    $linkedNoteIdAttr = " data-linked-note-id='" . intval($row1['linked_note_id']) . "'";
                }
            }
            
            echo "<div class='note-list-item'>";
            echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-note-type='" . htmlspecialchars($noteType, ENT_QUOTES) . "'" . $linkedNoteIdAttr . " data-folder-id='$folderId' data-folder='$folderName' data-created='" . htmlspecialchars($row1['created'] ?? '', ENT_QUOTES) . "' data-updated='" . htmlspecialchars($row1['updated'] ?? '', ENT_QUOTES) . "' draggable='true' data-action='load-note' data-dblaction='open-note-new-tab'>";
            echo "<span class='note-title'>" . $noteIcon . htmlspecialchars($noteTitle, ENT_QUOTES) . "</span>";
            echo "</a>";
            echo "</div>";
            echo "<div id=pxbetweennotes></div>";
        }
    }
    
    // Recursively display subfolders
    if (isset($folderData['children']) && !empty($folderData['children'])) {
        foreach ($folderData['children'] as $childId => $childData) {
            displayFolderRecursive($childId, $childData, $depth + 1, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst);
        }
    }

    // Display notes in folder (after subfolders if displayUncategorizedFirst is false)
    if (!$displayUncategorizedFirst) {
        foreach($notes as $row1) {
            $isSelected = ($note == $row1["id"]) ? 'selected-note' : '';
            
            // Generate note link
            $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined);
            
            $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
            if ($depth > 0) $noteClass .= ' note-in-subfolder';
            $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
            
            // Translate default note titles (New note, Nouvelle note, etc.)
            $noteTitle = $row1["heading"] ?: t('index.note.new_note', [], 'New note');
            
            // Check if the title matches a default note pattern in any supported language
            if (preg_match('/^(?:New note|Nouvelle note|Neue Notiz|Nueva nota|Nova nota)( \(\d+\))?$/', $noteTitle)) {
                // Default title - translate to current language
                if (preg_match('/^(?:New note|Nouvelle note|Neue Notiz|Nueva nota|Nova nota) \((\d+)\)$/', $noteTitle, $matches)) {
                    $noteTitle = t('index.note.new_note_numbered', ['number' => $matches[1]], 'New note (' . $matches[1] . ')');
                } else {
                    $noteTitle = t('index.note.new_note', [], 'New note');
                }
            }
            
            // Add icon for linked notes
            $noteIcon = '';
            $noteType = $row1['type'] ?? 'note';
            $linkedNoteIdAttr = '';
            if ($noteType === 'linked') {
                $noteIcon = '<i class="lucide lucide-link note-type-icon-inline"></i> ';
                // Add the linked_note_id attribute if available
                if (!empty($row1['linked_note_id'])) {
                    $linkedNoteIdAttr = " data-linked-note-id='" . intval($row1['linked_note_id']) . "'";
                }
            }
            
            echo "<div class='note-list-item'>";
            echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-note-type='" . htmlspecialchars($noteType, ENT_QUOTES) . "'" . $linkedNoteIdAttr . " data-folder-id='$folderId' data-folder='$folderName' data-created='" . htmlspecialchars($row1['created'] ?? '', ENT_QUOTES) . "' data-updated='" . htmlspecialchars($row1['updated'] ?? '', ENT_QUOTES) . "' draggable='true' data-action='load-note' data-dblaction='open-note-new-tab'>";
            echo "<span class='note-title'>" . $noteIcon . htmlspecialchars($noteTitle, ENT_QUOTES) . "</span>";
            echo "</a>";
            echo "</div>";
            echo "<div id=pxbetweennotes></div>";
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
// Check the user setting
$displayUncategorizedFirst = true; // default: notes without folders BEFORE folders
try {
    $stmtSetting = $con->prepare('SELECT value FROM settings WHERE key = ?');
    $stmtSetting->execute(['notes_without_folders_after_folders']);
    $settingValue = $stmtSetting->fetchColumn();
    // Enable if setting is not set or not '0' (defaultFolders first)
    if ($settingValue === '0' || $settingValue === 'false' || $settingValue === false) {
        $displayUncategorizedFirst = true; // notes without folders BEFORE folders
    } else {
        $displayUncategorizedFirst = false; // notes without folders AFTER folders
    }
} catch (Exception $e) {
    // ignore, keep default
}

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

// Display Favorites folder first
if ($favoritesFolder && $favorites_count > 0) {
    foreach($favoritesFolder as $folderId => $folderData) {
        displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst);
    }
    
    // Add separator with toggle button after favorites
    echo '<div class="favorites-separator">';
    echo '<button type="button" class="favorites-toggle-btn favorites-expanded" data-action="toggle-favorites" title="' . t_h('notes_list.favorites.toggle', [], 'Show/hide favorites') . '">';
    echo '<i class="lucide lucide-chevron-up"></i>';
    echo '</button>';
    echo '</div>';
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
        $isSelected = (isset($note) && $row1["id"] == $note) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined);
        
        $noteClass = 'links_arbo_left note-without-folder';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        // Add icon for linked notes
        $noteIcon = '';
        $noteType = $row1['type'] ?? 'note';
        $linkedNoteIdAttr = '';
        if ($noteType === 'linked') {
            $noteIcon = '<i class="lucide lucide-link note-type-icon-inline"></i> ';
            // Add the linked_note_id attribute if available
            if (!empty($row1['linked_note_id'])) {
                $linkedNoteIdAttr = " data-linked-note-id='" . intval($row1['linked_note_id']) . "'";
            }
        }
        
        echo "<div class='note-list-item'>";
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-note-type='" . htmlspecialchars($noteType, ENT_QUOTES) . "'" . $linkedNoteIdAttr . " data-folder-id='' data-folder='' data-created='" . htmlspecialchars($row1['created'] ?? '', ENT_QUOTES) . "' data-updated='" . htmlspecialchars($row1['updated'] ?? '', ENT_QUOTES) . "' draggable='true' data-action='load-note' data-dblaction='open-note-new-tab'>";
        echo "<span class='note-title'>" . $noteIcon . htmlspecialchars(($row1["heading"] ?: t('index.note.new_note', [], 'New note')), ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "</div>";
        echo "<div id=pxbetweennotes></div>";
    }
}

// Display regular folders and notes hierarchically
foreach($regularFolders as $folderId => $folderData) {
    displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags, $search_combined, $displayUncategorizedFirst);
}

// Display uncategorized notes (notes without folder) at the END if NOT sorting by date (i.e., alphabetical sort)
if (isset($uncategorized_notes) && !empty($uncategorized_notes) && empty($folder_filter) && !$displayUncategorizedFirst) {
    foreach ($uncategorized_notes as $row1) {
        $isSelected = (isset($note) && $row1["id"] == $note) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"], $search_combined);
        
        $noteClass = 'links_arbo_left note-without-folder';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        // Add icon for linked notes
        $noteIcon = '';
        $noteType = $row1['type'] ?? 'note';
        $linkedNoteIdAttr = '';
        if ($noteType === 'linked') {
            $noteIcon = '<i class="lucide lucide-link note-type-icon-inline"></i> ';
            // Add the linked_note_id attribute if available
            if (!empty($row1['linked_note_id'])) {
                $linkedNoteIdAttr = " data-linked-note-id='" . intval($row1['linked_note_id']) . "'";
            }
        }
        
        echo "<div class='note-list-item'>";
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-note-type='" . htmlspecialchars($noteType, ENT_QUOTES) . "'" . $linkedNoteIdAttr . " data-folder-id='' data-folder='' data-created='" . htmlspecialchars($row1['created'] ?? '', ENT_QUOTES) . "' data-updated='" . htmlspecialchars($row1['updated'] ?? '', ENT_QUOTES) . "' draggable='true' data-action='load-note' data-dblaction='open-note-new-tab'>";
        echo "<span class='note-title'>" . $noteIcon . htmlspecialchars(($row1["heading"] ?: t('index.note.new_note', [], 'New note')), ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "</div>";
        echo "<div id=pxbetweennotes></div>";
    }
}
?>
