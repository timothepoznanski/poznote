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
        $stmtTrash = $con->prepare("SELECT COUNT(*) as cnt FROM entries WHERE trash = 1 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmtTrash->execute([ $workspace_filter, $workspace_filter ]);
        $trash_count = (int)$stmtTrash->fetchColumn();
    }
} catch (Exception $e) {
    $trash_count = 0;
}

echo "<div class='folder-header' data-folder='Trash'>";
echo "<div class='folder-toggle' onclick='event.stopPropagation(); window.location = \"trash.php?workspace=" . urlencode($workspace_filter) . "\"'>";
echo "<i class='fa-trash folder-icon'></i>";
echo "<span class='folder-name'>Trash</span>";
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
            $query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $params[] = $workspace_filter;
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
echo "<span class='folder-name'>Tags</span>";
echo "<span class='folder-note-count' id='count-tags'>(" . $tag_count . ")</span>";
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
        if (isDefaultFolder($folderName, $workspace_filter)) $folderClass .= ' default-folder';
        if ($depth > 0) $folderClass .= ' subfolder subfolder-level-' . $depth;
        $folderDomId = 'folder-' . $folderId;
        
        // Determine if this folder should be open
        $should_be_open = shouldFolderBeOpen($con, $folderId, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes);
        
        // Set appropriate folder icon (open/closed) and display style
        $chevron_icon = $should_be_open ? 'fa-folder-open' : 'fa-folder';
        $folder_display = $should_be_open ? 'block' : 'none';
        
        echo "<div class='$folderClass' data-folder-id='$folderId' data-folder='$folderName' data-folder-key='folder_$folderId' onclick='selectFolder($folderId, \"$folderName\", this)'>";
        echo "<div class='folder-toggle' onclick='event.stopPropagation(); toggleFolder(\"$folderDomId\")' data-folder-id='$folderDomId'>";
        
        // Use an empty star icon for the Favorites pseudo-folder
        if ($folderName === 'Favorites') {
            echo "<i class='fa-star-light folder-icon'></i>";
        } else {
            echo "<i class='$chevron_icon folder-icon'></i>";
        }
        
        // Workspace-aware default folder handling in UI
        // Disable double-click rename for default folder and system folders
        $systemFolders = ['Favorites', 'Tags', 'Trash'];
        $ondbl = (isDefaultFolder($folderName, $workspace_filter) || in_array($folderName, $systemFolders)) ? '' : 'editFolderName(' . $folderId . ', \"' . $folderName . '\")';
        echo "<span class='folder-name' ondblclick='" . $ondbl . "'>$folderName</span>";
        echo "<span class='folder-note-count' id='count-" . $folderId . "'>(" . count($notes) . ")</span>";
        echo "<span class='folder-actions'>";
        
        // Generate folder actions
        echo generateFolderActions($folderId, $folderName, $workspace_filter);
        
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
        $onclickHandler = " onclick='return loadNoteDirectly($jsEscapedLink, $noteDbId, event);'";
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder-id='$folderId' data-folder='$folderName'$onclickHandler>";
        echo "<span class='note-title'>" . ($row1["heading"] ?: 'New note') . "</span>";
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

// Display folders and notes hierarchically
foreach($hierarchicalFolders as $folderId => $folderData) {
    displayFolderRecursive($folderId, $folderData, 0, $con, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes, $folder_filter, $search, $tags_search, $preserve_notes, $preserve_tags);
}
?>
