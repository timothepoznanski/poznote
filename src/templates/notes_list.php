<?php
/**
 * Template for the notes list (left column) of index.php
 * Expected variables: $folders, $is_search_mode, $folder_filter, $workspace_filter, etc.
 */
?>

<!-- Notes list display -->
<?php
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
        
        // Set appropriate icon and display style
        $chevron_icon = $should_be_open ? 'fa-chevron-down' : 'fa-chevron-right';
        $folder_display = $should_be_open ? 'block' : 'none';
        
        echo "<div class='$folderClass' data-folder='$folderName' onclick='selectFolder(\"$folderName\", this)'>";
        echo "<div class='folder-toggle' onclick='event.stopPropagation(); toggleFolder(\"$folderId\")' data-folder-id='$folderId'>";
        echo "<i class='fas $chevron_icon folder-icon'></i>";
        
        // Workspace-aware default folder handling in UI
        // Disable double-click rename for default folder
        $ondbl = isDefaultFolder($folderName, $workspace_filter) ? '' : 'editFolderName("' . $folderName . '")';
        echo "<span class='folder-name' ondblclick='" . $ondbl . "'>$folderName</span>";
        echo "<span class='folder-note-count'>(" . count($notes) . ")</span>";
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
    }
}
?>
