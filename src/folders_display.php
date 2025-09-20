<?php
/**
 * Gestion de l'affichage des dossiers et notes
 */

/**
 * Organise les notes par dossier
 */
function organizeNotesByFolder($stmt_left, $defaultFolderName) {
    $folders = [];
    $folders_with_results = [];
    
    while($row1 = $stmt_left->fetch(PDO::FETCH_ASSOC)) {
        $folder = $row1["folder"] ?: $defaultFolderName;
        if (!isset($folders[$folder])) {
            $folders[$folder] = [];
        }
        $folders[$folder][] = $row1;
    }
    
    return $folders;
}

/**
 * Ajoute les dossiers vides de la table folders
 */
function addEmptyFolders($con, $folders, $workspace_filter) {
    $folders_sql = "SELECT name FROM folders";
    if (!empty($workspace_filter)) {
        $folders_sql .= " WHERE (workspace = '" . addslashes($workspace_filter) . "' OR (workspace IS NULL AND '" . addslashes($workspace_filter) . "' = 'Poznote'))";
    }
    $folders_sql .= " ORDER BY name";
    
    $empty_folders_query = $con->query($folders_sql);
    while($folder_row = $empty_folders_query->fetch(PDO::FETCH_ASSOC)) {
        if (!isset($folders[$folder_row['name']])) {
            $folders[$folder_row['name']] = [];
        }
    }
    
    return $folders;
}

/**
 * Trie les dossiers (Favorites en premier, puis dossier par défaut, puis autres)
 */
function sortFolders($folders, $defaultFolderName, $workspace_filter) {
    uksort($folders, function($a, $b) use ($defaultFolderName, $workspace_filter) {
        if ($a === 'Favorites') return -1;
        if ($b === 'Favorites') return 1;
        if (isDefaultFolder($a, $workspace_filter)) return -1;
        if (isDefaultFolder($b, $workspace_filter)) return 1;
        return strcasecmp($a, $b);
    });
    
    return $folders;
}

/**
 * Détermine si un dossier doit être ouvert
 */
function shouldFolderBeOpen($con, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes) {
    if($total_notes <= 3) {
        // If we have very few notes (demo notes just created), open all folders
        return true;
    } else if($is_search_mode) {
        // In search mode: open folders that have results
        return isset($folders_with_results[$folderName]);
    } else if($note != '') {
        // If a note is selected: open the folder of the current note AND Favoris if note is favorite
        if ($folderName === $current_note_folder) {
            return true;
        } else if ($folderName === 'Favorites') {
            // Open Favoris folder if the current note is favorite
            return isNoteFavorite($con, $note, $workspace_filter);
        }
    } else if($default_note_folder) {
        // If no specific note selected but default note loaded: open its folder
        return ($folderName === $default_note_folder);
    }
    
    return false;
}

/**
 * Génère les actions disponibles pour un dossier
 */
function generateFolderActions($folderName, $workspace_filter) {
    $actions = "";
    
    if ($folderName === 'Favorites') {
        // No actions for Favorites folder
    } else if (isDefaultFolder($folderName, $workspace_filter)) {
        // For the default folder: allow search and empty, but do not allow renaming
        $actions .= "<i class='fa-search folder-search-btn' onclick='event.stopPropagation(); toggleFolderSearchFilter(\"$folderName\")' title='Include/exclude from search' data-folder='$folderName'></i>";
        $actions .= "<i class='fa-folder-open folder-move-files-btn' onclick='event.stopPropagation(); showMoveFolderFilesDialog(\"$folderName\")' title='Move all files to another folder'></i>";
        $actions .= "<i class='fa-trash folder-empty-btn' onclick='event.stopPropagation(); emptyFolder(\"$folderName\")' title='Move all notes to trash'></i>";
    } else {
        $actions .= "<i class='fa-search folder-search-btn' onclick='event.stopPropagation(); toggleFolderSearchFilter(\"$folderName\")' title='Include/exclude from search' data-folder='$folderName'></i>";
        $actions .= "<i class='fa-folder-open folder-move-files-btn' onclick='event.stopPropagation(); showMoveFolderFilesDialog(\"$folderName\")' title='Move all files to another folder'></i>";
        $actions .= "<i class='fa-edit folder-edit-btn' onclick='event.stopPropagation(); editFolderName(\"$folderName\")' title='Rename folder'></i>";
        $actions .= "<i class='fa-trash folder-delete-btn' onclick='event.stopPropagation(); deleteFolder(\"$folderName\")' title='Delete folder'></i>";
    }
    
    return $actions;
}

/**
 * Génère le lien pour une note en préservant l'état de recherche
 */
function generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $note_heading) {
    $params = [];
    if (!empty($search)) $params[] = 'search=' . urlencode($search);
    if (!empty($tags_search)) $params[] = 'tags_search=' . urlencode($tags_search);
    if (!empty($folder_filter)) $params[] = 'folder=' . urlencode($folder_filter);
    if (!empty($workspace_filter)) $params[] = 'workspace=' . urlencode($workspace_filter);
    if ($preserve_notes) $params[] = 'preserve_notes=1';
    if ($preserve_tags) $params[] = 'preserve_tags=1';
    $params[] = 'note=' . urlencode($note_heading);
    
    return 'index.php?' . implode('&', $params);
}

/**
 * Compte le nombre total de notes pour déterminer si on ouvre tous les dossiers
 */
function getTotalNotesCount($con, $workspace_filter) {
    $total_notes_query = "SELECT COUNT(*) as total FROM entries WHERE trash = 0";
    if (isset($workspace_filter)) {
        $total_notes_query .= " AND (workspace = '" . addslashes($workspace_filter) . "' OR (workspace IS NULL AND '" . addslashes($workspace_filter) . "' = 'Poznote'))";
    }
    $total_notes_result = $con->query($total_notes_query);
    return $total_notes_result->fetch(PDO::FETCH_ASSOC)['total'];
}
