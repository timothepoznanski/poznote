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
echo "<i class='fas fa-trash folder-icon'></i>";
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
echo "<i class='fas fa-tags folder-icon'></i>";
echo "<span class='folder-name'>Tags</span>";
echo "<span class='folder-note-count' id='count-tags'>(" . $tag_count . ")</span>";
echo "</div></div>";

// If there is no Favorites folder in the list, render the separator here so it always appears
if (!is_array($folders) || !array_key_exists('Favorites', $folders)) {
    echo "<div class='favorites-separator' aria-hidden='true'></div>";
}

// Display folders and notes
foreach($folders as $folderName => $notes) {
    // In search mode, don't display empty folders
    if ($is_search_mode && empty($notes)) {
        continue;
    }
    
    // Show folder header only if not filtering by folder
    if (empty($folder_filter)) {
        $folderClass = 'folder-header';
        if (isDefaultFolder($folderName, $workspace_filter)) $folderClass .= ' default-folder';
        $folderId = 'folder-' . md5($folderName);
        
        // Determine if this folder should be open
        $should_be_open = shouldFolderBeOpen($con, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes);
        
    // Set appropriate folder icon (open/closed) and display style
    $chevron_icon = $should_be_open ? 'fa-folder-open' : 'fa-folder';
    $folder_display = $should_be_open ? 'block' : 'none';
        
        echo "<div class='$folderClass' data-folder='$folderName' onclick='selectFolder(\"$folderName\", this)'>";
        echo "<div class='folder-toggle' onclick='event.stopPropagation(); toggleFolder(\"$folderId\")' data-folder-id='$folderId'>";
        // Use an empty star icon for the Favorites pseudo-folder
        if ($folderName === 'Favorites') {
            echo "<i class='far fa-star folder-icon'></i>";
        } else {
            echo "<i class='fas $chevron_icon folder-icon'></i>";
        }
        
        // Workspace-aware default folder handling in UI
        // Disable double-click rename for default folder
        $ondbl = isDefaultFolder($folderName, $workspace_filter) ? '' : 'editFolderName("' . $folderName . '")';
        echo "<span class='folder-name' ondblclick='" . $ondbl . "'>$folderName</span>";
        echo "<span class='folder-note-count' id='count-" . md5($folderName) . "'>(" . count($notes) . ")</span>";
        echo "<span class='folder-actions'>";
        
        // Generate folder actions
        echo generateFolderActions($folderName, $workspace_filter);
        
        echo "</span>";
        echo "</div>";
        echo "<div class='folder-content' id='$folderId' style='display: $folder_display;'>";
    }
    
    // Display notes in folder
    foreach($notes as $row1) {
        $isSelected = ($note === $row1["heading"]) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["heading"]);
        
        $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        // No onclick handler - touch events will be handled via JavaScript
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $row1["heading"] . "' data-note-db-id='" . $noteDbId . "' data-folder='$folderName'>";
        echo "<span class='note-title'>" . ($row1["heading"] ?: 'Untitled note') . "</span>";
        echo "</a>";
        echo "<div id=pxbetweennotes></div>";
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
?>
