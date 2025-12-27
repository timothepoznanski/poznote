<?php
/**
 * Template for the notes list (left column) of index.php
 * Expected variables: $folders, $is_search_mode, $folder_filter, $workspace_filter, etc.
 */
?>

<!-- Notes list display -->
<?php
// Render a dedicated "Trash" folder above Favorites
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

echo "<div class='folder-header' data-folder='Trash'>";
echo "<div class='folder-toggle' onclick='event.stopPropagation(); window.location = \"trash.php?workspace=" . urlencode($workspace_filter) . "\"'>";
echo "<i class='fa-trash folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.trash', [], 'Trash') . "</span>";
echo "<span class='folder-note-count' id='count-Trash'>(" . $trash_count . ")</span>";
echo "</div></div>";

// Render a dedicated "Tags" folder that links to the tag listing page
// Count unique tags for the current workspace (non-trashed entries)
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

echo "<div class='folder-header' data-folder='Tags'>";
echo "<div class='folder-toggle' onclick='event.stopPropagation(); window.location = \"list_tags.php?workspace=" . urlencode($workspace_filter) . "\"'>";
echo "<i class='fa-tags folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.tags', [], 'Tags') . "</span>";
echo "<span class='folder-note-count' id='count-tags'>(" . $tag_count . ")</span>";
echo "</div></div>";

// Render a dedicated "Public" folder that links to the public notes page
// Count public notes for the current workspace (non-trashed entries)
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

echo "<div class='folder-header' data-folder='Public'>";
echo "<div class='folder-toggle' onclick='event.stopPropagation(); window.location = \"shared.php?workspace=" . urlencode($workspace_filter) . "\"'>";
echo "<i class='fa-cloud folder-icon'></i>";
echo "<span class='folder-name'>" . t_h('notes_list.system_folders.public', [], 'Public') . "</span>";
echo "<span class='folder-note-count' id='count-shared'>(" . $shared_count . ")</span>";
echo "</div></div>";

// If there is no Favorites folder in the list, render the separator here so it always appears
if (!is_array($folders) || !array_key_exists('Favorites', $folders)) {
    echo "<div class='favorites-separator' aria-hidden='true'></div>";
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
        $chevron_icon = $should_be_open ? 'fa-folder-open' : 'fa-folder';
        $folder_display = $should_be_open ? 'block' : 'none';
        
        // Escape folder name for use in JavaScript
        $escapedFolderName = addslashes($folderName);
        
        echo "<div class='$folderClass' data-folder-id='$folderId' data-folder='$folderName' data-folder-key='folder_$folderId' onclick='selectFolder($folderId, \"$escapedFolderName\", this)'>";
        echo "<div class='folder-toggle' onclick='event.stopPropagation(); toggleFolder(\"$folderDomId\")' data-folder-id='$folderDomId'>";
        
        // Use an empty star icon for the Favorites pseudo-folder
        if ($folderName === 'Favorites') {
            echo "<i class='fa-star-light folder-icon'></i>";
        } else {
            echo "<i class='$chevron_icon folder-icon'></i>";
        }
        
        // Workspace-aware folder handling in UI
        // Disable double-click rename for system folders
        $systemFolders = ['Favorites', 'Tags', 'Trash', 'Public'];
        $ondbl = in_array($folderName, $systemFolders) ? '' : 'editFolderName(' . $folderId . ', \"' . $folderName . '\")';
        $folderDisplayName = $folderName;
        if ($folderName === 'Favorites') {
            $folderDisplayName = t('notes_list.system_folders.favorites', [], 'Favorites');
        }
        echo "<span class='folder-name' ondblclick='" . $ondbl . "'>" . htmlspecialchars($folderDisplayName, ENT_QUOTES) . "</span>";
        $noteCount = count($notes);
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
        
        // Add onclick handler for AJAX loading
        $jsEscapedLink = json_encode($link, JSON_HEX_APOS | JSON_HEX_QUOT);
        $onclickHandler = " data-onclick='return loadNoteDirectly($jsEscapedLink, $noteDbId, event);'";
        
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
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='$folderId' data-folder='$folderName' draggable='true'$onclickHandler>";
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
        // Add a thin separator after Favorites to visually separate the top sections
        if ($folderName === 'Favorites') {
            echo "<div class='favorites-separator' aria-hidden='true'></div>";
        }
    }
}

// Enrich folders with parent_id from database
$folders = enrichFoldersWithParentId($folders, $con, $workspace_filter);

// Build hierarchical structure
$hierarchicalFolders = buildFolderHierarchy($folders);

// Determine if we should display uncategorized notes first (after Favorites, before other folders)
// This happens when sort order is by date (updated_desc or created_desc)
$displayUncategorizedFirst = isset($note_list_sort_type) && 
    ($note_list_sort_type === 'updated_desc' || $note_list_sort_type === 'created_desc');

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
if ($favoritesFolder) {
    foreach($favoritesFolder as $folderId => $folderData) {
        displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags);
    }
}

// Add drop zone for moving notes to root (no folder)
if (empty($folder_filter)) {
    echo '<div id="root-drop-zone" class="root-drop-zone" style="display: none;">';
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
        
        // Add onclick handler for AJAX loading
        $jsEscapedLink = json_encode($link, JSON_HEX_APOS | JSON_HEX_QUOT);
        $onclickHandler = " data-onclick='return loadNoteDirectly($jsEscapedLink, $noteDbId, event);'";
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='' data-folder='' draggable='true'$onclickHandler>";
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
        
        // Add onclick handler for AJAX loading
        $jsEscapedLink = json_encode($link, JSON_HEX_APOS | JSON_HEX_QUOT);
        $onclickHandler = " data-onclick='return loadNoteDirectly($jsEscapedLink, $noteDbId, event);'";
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='' data-folder='' draggable='true'$onclickHandler>";
        echo "<span class='note-title'>" . htmlspecialchars(($row1["heading"] ?: t('index.note.new_note', [], 'New note')), ENT_QUOTES) . "</span>";
        echo "</a>";
        echo "<div id=pxbetweennotes></div>";
    }
}
?>
