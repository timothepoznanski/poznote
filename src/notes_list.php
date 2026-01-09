<?php
/**
 * Template for the notes list (left column) of index.php
 * Expected variables: $folders, $is_search_mode, $folder_filter, $workspace_filter, etc.
 */
?>

<!-- Notes list display -->
<?php
// Container pour les icônes système en mode icônes centrées
echo "<div class='system-folders-container'>";

// Icône toggle pour la barre de recherche
echo "<div class='folder-header system-folder' data-action='toggle-search-bar' title='Recherche'>";
echo "<div class='folder-toggle'>";
echo "<i class='fa-search folder-icon'></i>";
echo "<span class='folder-name'>Recherche</span>";
echo "</div></div>";

// Count for Tags folder
$tag_count = 0;
$unique_tags = [];
try {
    if (isset($con)) {
        $query = "SELECT tags FROM entries WHERE trash = 0";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " AND workspace = ?";
            $params[] = $workspace_filter;
        }
        $stmtTags = $con->prepare($query);
        $stmtTags->execute($params);
        while ($r = $stmtTags->fetch(PDO::FETCH_ASSOC)) {
        $parts = explode(',', $r['tags'] ?? '');
            foreach ($parts as $p) {
                $t = trim($p);
                if ($t !== '' && !in_array($t, $unique_tags)) {
                    $unique_tags[] = $t;
                }
            }
        }
        $tag_count = count($unique_tags);
    }
} catch (Exception $e) {
    $tag_count = 0;
}

// Render a dedicated "Tags" folder
echo "<div class='folder-header system-folder' data-folder='Tags'>";
echo "<div class='folder-toggle' data-action='navigate-tags' data-url='list_tags.php?workspace=" . urlencode($workspace_filter) . "' title='" . t_h('notes_list.system_folders.tags', [], 'Tags') . "'>";
echo "<i class='fa-tags folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.tags', [], 'Tags') . "</span>";
echo "<span class='folder-note-count' id='count-tags'>" . $tag_count . "</span>";
echo "</div></div>";

// Count for Trash
try {
    $trash_count = 0;
    if (isset($con)) {
        $stmtTrash = $con->prepare("SELECT COUNT(*) as cnt FROM entries WHERE trash = 1 AND workspace = ?");
        $stmtTrash->execute([ $workspace_filter ]);
        $trash_count = (int)$stmtTrash->fetchColumn();
    }
} catch (Exception $e) {
    $trash_count = 0;
}

// Count for Public/Shared notes
$shared_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM shared_notes sn INNER JOIN entries e ON sn.note_id = e.id WHERE e.trash = 0";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " AND e.workspace = ?";
            $params[] = $workspace_filter;
        }
        $stmtShared = $con->prepare($query);
        $stmtShared->execute($params);
        $shared_count = (int)$stmtShared->fetchColumn();
    }
} catch (Exception $e) {
    $shared_count = 0;
}

// Count for Attachments
$attachments_count = 0;
try {
    if (isset($con)) {
        $query = "SELECT COUNT(*) as cnt FROM entries WHERE trash = 0 AND attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " AND workspace = ?";
            $params[] = $workspace_filter;
        }
        $stmtAttachments = $con->prepare($query);
        $stmtAttachments->execute($params);
        $attachments_count = (int)$stmtAttachments->fetchColumn();
    }
} catch (Exception $e) {
    $attachments_count = 0;
}

// Count favorites for the current workspace
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

// Add Favorites icon BEFORE the menu (only if there are favorites)
if ($favorites_count > 0) {
    echo "<div class='folder-header system-folder system-folder-favorites' data-folder='Favorites' data-folder-id='folder-favorites' data-folder-key='folder_folder-favorites'>";
    echo "<div class='folder-toggle' data-action='toggle-favorites' data-folder-id='folder-favorites' title='" . t_h('notes_list.system_folders.favorites', [], 'Favorites') . "'>";
    echo "<i class='fa-star-light folder-icon'></i>";
    echo "<span class='folder-name'>" . t_h('notes_list.system_folders.favorites', [], 'Favorites') . "</span>";
    echo "<span class='folder-note-count' id='count-favorites'>" . $favorites_count . "</span>";
    echo "</div></div>";
}

// Public/Shared notes icon in the bar
echo "<div class='folder-header system-folder' data-folder='Shared'>";
echo "<div class='folder-toggle' data-action='navigate-shared' data-url='shared.php?workspace=" . urlencode($workspace_filter) . "' title='" . t_h('notes_list.system_folders.public', [], 'Public') . "'>";
echo "<i class='fa-cloud folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.public', [], 'Public') . "</span>";
echo "<span class='folder-note-count' id='count-shared'>" . $shared_count . "</span>";
echo "</div></div>";

// Trash icon in the bar
echo "<div class='folder-header system-folder' data-folder='Trash'>";
echo "<div class='folder-toggle' data-action='navigate-trash' data-url='trash.php?workspace=" . urlencode($workspace_filter) . "' title='" . t_h('notes_list.system_folders.trash', [], 'Trash') . "'>";
echo "<i class='fa-trash folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.trash', [], 'Trash') . "</span>";
echo "<span class='folder-note-count' id='count-trash'>" . $trash_count . "</span>";
echo "</div></div>";

// Attachments icon in the bar
echo "<div class='folder-header system-folder' data-folder='Attachments'>";
echo "<div class='folder-toggle' data-action='navigate-attachments' data-url='attachments_list.php?workspace=" . urlencode($workspace_filter) . "' title='" . t_h('notes_list.system_folders.attachments', [], 'Attachments') . "'>";
echo "<i class='fa-paperclip folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.attachments', [], 'Attachments') . "</span>";
echo "<span class='folder-note-count' id='count-attachments'>" . $attachments_count . "</span>";
echo "</div></div>";

echo "</div>"; // Fin du container system-folders
?>

<!-- Search bar container - appears below the system icons when toggled -->
<div class="contains_forms_search" id="search-bar-container">
    <form id="unified-search-form" action="index.php" method="POST">
        <div class="unified-search-container">
            <div class="searchbar-row searchbar-icon-row">
                <div class="searchbar-input-wrapper">
                    <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text" name="unified_search" class="search form-control searchbar-input" placeholder="<?php echo t_h('search.placeholder_notes'); ?>" value="<?php echo htmlspecialchars(($search ?: $tags_search) ?? '', ENT_QUOTES); ?>" />
                    <span class="searchbar-icon"><span class="fa-search"></span></span>
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
        </div>
    </form>
</div>

<?php
/**
 * Calculate total number of notes in a folder and all its subfolders recursively
 */
function countNotesRecursively($folderData) {
    $count = count($folderData['notes']);
    
    // Add notes from all subfolders
    if (isset($folderData['children']) && !empty($folderData['children'])) {
        foreach ($folderData['children'] as $childData) {
            $count += countNotesRecursively($childData);
        }
    }
    
    return $count;
}

/**
 * Recursive function to display folders and their subfolders
 */
function displayFolderRecursive($folderId, $folderData, $depth, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags) {
    $folderName = $folderData['name'];
    $notes = $folderData['notes'];
    
    // In search mode, don't display empty folders (unless they have children with results)
    $hasChildrenWithNotes = false;
    if (isset($folderData['children']) && !empty($folderData['children'])) {
        foreach ($folderData['children'] as $childData) {
            if (!empty($childData['notes']) || (isset($childData['children']) && !empty($childData['children']))) {
                $hasChildrenWithNotes = true;
                break;
            }
        }
    }
    
    if ($is_search_mode && empty($notes) && !$hasChildrenWithNotes) {
        return;
    }
    
    // Show folder header only if not filtering by folder
    if (empty($folder_filter)) {
        $folderClass = 'folder-header';
        if ($depth > 0) $folderClass .= ' subfolder subfolder-level-' . $depth;
        $folderDomId = 'folder-' . $folderId;
        
        // Determine if this folder should be open
        $should_be_open = shouldFolderBeOpen($con, $folderId, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes);
        
        // Set appropriate folder icon (open/closed) and display style
        // Check if folder has a custom icon
        $customIcon = isset($folderData['icon']) && !empty($folderData['icon']) ? $folderData['icon'] : null;
        
        if ($customIcon) {
            // Use custom icon - don't toggle between open/closed
            $chevron_icon = $customIcon;
        } else {
            // Use default icons that toggle
            $chevron_icon = $should_be_open ? 'fa-folder-open' : 'fa-folder';
        }
        
        $folder_display = $should_be_open ? 'block' : 'none';
        
        // Escape folder name for use in JavaScript
        $escapedFolderName = addslashes($folderName);
        
        // Check if this is a system folder (not draggable)
        $systemFolders = ['Favorites', 'Tags', 'Trash', 'Public'];
        $isSystemFolder = in_array($folderName, $systemFolders);
        $draggableAttr = $isSystemFolder ? '' : " draggable='true'";
        
        echo "<div class='$folderClass' data-folder-id='$folderId' data-folder='$folderName' data-folder-key='folder_$folderId' data-action='select-folder'$draggableAttr>";
        echo "<div class='folder-toggle'>";
        
        // Use an empty star icon for the Favorites pseudo-folder
        if ($folderName === 'Favorites') {
            echo "<i class='fa-star-light folder-icon'></i>";
        } else {
            // Add click action to change icon (except for Favorites)
            echo "<i class='$chevron_icon folder-icon' data-custom-icon='" . ($customIcon ? 'true' : 'false') . "' data-action='open-folder-icon-picker' data-folder-id='$folderId' data-folder-name='" . htmlspecialchars($folderName, ENT_QUOTES) . "' title='" . t_h('notes_list.folder_actions.change_icon', [], 'Change icon') . "'></i>";
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
        echo generateFolderActions($folderId, $folderName, $workspace_filter, $noteCount);
        
        echo "</span>";
        echo "</div>";
        echo "<div class='folder-content' id='$folderDomId' style='display: $folder_display;'>";
    }
    
    // Display notes in folder
    foreach($notes as $row1) {
        $isSelected = ($note == $row1["id"]) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"]);
        
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
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='$folderId' data-folder='$folderName' draggable='true' data-action='load-note'>";
        echo "<span class='note-title'>" . htmlspecialchars($noteTitle, ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "<div id=pxbetweennotes></div>";
    }
    
    // Recursively display subfolders
    if (isset($folderData['children']) && !empty($folderData['children'])) {
        foreach ($folderData['children'] as $childId => $childData) {
            displayFolderRecursive($childId, $childData, $depth + 1, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags);
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
    if ($settingValue === '1' || $settingValue === 'true') {
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
        displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags);
    }
}

// Add drop zone for moving notes to root (no folder)
if (empty($folder_filter)) {
    echo '<div id="root-drop-zone" class="root-drop-zone initially-hidden">';
    echo '<div class="drop-zone-content">';
    echo '<i class="fa-home drop-zone-icon"></i>';
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
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"]);
        
        $noteClass = 'links_arbo_left note-without-folder';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='' data-folder='' draggable='true' data-action='load-note'>";
        echo "<span class='note-title'>" . htmlspecialchars(($row1["heading"] ?: t('index.note.new_note', [], 'New note')), ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "<div id=pxbetweennotes></div>";
    }
}

// Display regular folders and notes hierarchically
foreach($regularFolders as $folderId => $folderData) {
    displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags);
}

// Display uncategorized notes (notes without folder) at the END if NOT sorting by date (i.e., alphabetical sort)
if (isset($uncategorized_notes) && !empty($uncategorized_notes) && empty($folder_filter) && !$displayUncategorizedFirst) {
    foreach ($uncategorized_notes as $row1) {
        $isSelected = (isset($note) && $row1["id"] == $note) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"]);
        
        $noteClass = 'links_arbo_left note-without-folder';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='' data-folder='' draggable='true' data-action='load-note'>";
        echo "<span class='note-title'>" . htmlspecialchars(($row1["heading"] ?: t('index.note.new_note', [], 'New note')), ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "<div id=pxbetweennotes></div>";
    }
}
?>
