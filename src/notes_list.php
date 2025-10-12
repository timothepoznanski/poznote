<?php
/**
 * Template for the notes list (left column) of index.php
 * Expected variables: $folders, $is_search_mode, $folder_filter, $workspace_filter, etc.
 */
?>

<!-- Notes list display -->
<?php
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
            echo "<i class='fa-star-light folder-icon'></i>";
        } else {
            echo "<i class='$chevron_icon folder-icon'></i>";
        }
        
        // Workspace-aware default folder handling in UI
        // Disable double-click rename for default folder and system folders
        $systemFolders = ['Favorites', 'Tags', 'Trash'];
        $ondbl = (isDefaultFolder($folderName, $workspace_filter) || in_array($folderName, $systemFolders)) ? '' : 'editFolderName("' . $folderName . '")';
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
        $isSelected = ($note == $row1["id"]) ? 'selected-note' : '';
        
        // Generate note link
        $link = generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $row1["id"]);
        
        $noteClass = empty($folder_filter) ? 'links_arbo_left note-in-folder' : 'links_arbo_left';
        $noteDbId = isset($row1["id"]) ? $row1["id"] : '';
        
        // Add onclick handler for AJAX loading (desktop only, mobile uses touch handlers)
        $escapedHeading = htmlspecialchars($row1["heading"], ENT_QUOTES);
        $escapedLink = htmlspecialchars($link, ENT_QUOTES);
        
        // Escape for JavaScript (for onclick handler) - use json_encode but without outer quotes
        $jsEscapedHeading = json_encode($row1["heading"], JSON_HEX_APOS | JSON_HEX_QUOT);
        $jsEscapedLink = json_encode($link, JSON_HEX_APOS | JSON_HEX_QUOT);
        
        // Detect if mobile (simple server-side detection)
        $onclickHandler = " onclick='return loadNoteDirectly($jsEscapedLink, $noteDbId, event);'";
        
        echo "<a class='$noteClass $isSelected' href='$link' data-note-id='" . $noteDbId . "' data-note-db-id='" . $noteDbId . "' data-folder='$folderName'$onclickHandler>";
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
