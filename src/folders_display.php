<?php
/**
 * Management of folder and note display
 */

/**
 * Organize notes by folder
 * Now returns array indexed by folder_id instead of folder name
 */
function organizeNotesByFolder($stmt_left, $defaultFolderName, $con, $workspace_filter) {
    $folders = [];
    $folders_with_results = [];
    
    // Get default folder ID
    $defaultFolderId = null;
    $defaultFolderQuery = "SELECT id FROM folders WHERE name = ?";
    $params = [$defaultFolderName];
    if ($workspace_filter) {
        $defaultFolderQuery .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $params[] = $workspace_filter;
        $params[] = $workspace_filter;
    }
    $stmt = $con->prepare($defaultFolderQuery);
    $stmt->execute($params);
    $defaultFolderData = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($defaultFolderData) {
        $defaultFolderId = (int)$defaultFolderData['id'];
    }
    
    while($row1 = $stmt_left->fetch(PDO::FETCH_ASSOC)) {
        $folderId = isset($row1["folder_id"]) && $row1["folder_id"] ? (int)$row1["folder_id"] : $defaultFolderId;
        $folderName = $row1["folder"] ?: $defaultFolderName;
        
        if (!isset($folders[$folderId])) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'notes' => []
            ];
        }
        
        $folders[$folderId]['notes'][] = $row1;
    }
    
    return $folders;
}

/**
 * Add empty folders from the folders table
 * Now uses folder_id as key
 * Note: Default folder is excluded if empty (it exists in DB but not shown)
 */
function addEmptyFolders($con, $folders, $workspace_filter) {
    require_once 'default_folder_settings.php';
    $defaultFolderName = getDefaultFolderForNewNotes($workspace_filter);
    
    $folders_sql = "SELECT id, name FROM folders";
    if (!empty($workspace_filter)) {
        $folders_sql .= " WHERE (workspace = '" . addslashes($workspace_filter) . "' OR (workspace IS NULL AND '" . addslashes($workspace_filter) . "' = 'Poznote'))";
    }
    $folders_sql .= " ORDER BY name";
    
    $empty_folders_query = $con->query($folders_sql);
    while($folder_row = $empty_folders_query->fetch(PDO::FETCH_ASSOC)) {
        $folderId = (int)$folder_row['id'];
        $folderName = $folder_row['name'];
        
        // Skip adding empty Default folder (it exists in DB but shouldn't be displayed when empty)
        if (!isset($folders[$folderId])) {
            if (isDefaultFolder($folderName, $workspace_filter)) {
                // Don't add Default folder if it's empty
                continue;
            }
            
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'notes' => []
            ];
        }
    }
    
    return $folders;
}

/**
 * Ensure Favorites folder always exists (even if empty)
 */
function ensureFavoritesFolder($folders) {
    // Check if Favorites folder exists
    $hasFavorites = false;
    foreach ($folders as $folder) {
        if (isset($folder['name']) && $folder['name'] === 'Favorites') {
            $hasFavorites = true;
            break;
        }
    }
    
    // Add empty Favorites folder if it doesn't exist
    if (!$hasFavorites) {
        // Use 'favorites' as special key (lowercase) to distinguish from regular folders
        $folders['favorites'] = [
            'id' => null,  // No real DB ID for Favorites pseudo-folder
            'name' => 'Favorites',
            'notes' => []
        ];
    }
    
    return $folders;
}

/**
 * Trie les dossiers (Favorites en premier, puis dossier par défaut, puis autres)
 * Now works with folder arrays containing 'id' and 'name'
 */
function sortFolders($folders, $defaultFolderName, $workspace_filter) {
    uksort($folders, function($a, $b) use ($folders, $defaultFolderName, $workspace_filter) {
        $folderA = $folders[$a];
        $folderB = $folders[$b];
        $nameA = $folderA['name'];
        $nameB = $folderB['name'];
        
        if ($nameA === 'Favorites') return -1;
        if ($nameB === 'Favorites') return 1;
        if (isDefaultFolder($nameA, $workspace_filter)) return -1;
        if (isDefaultFolder($nameB, $workspace_filter)) return 1;
        return strcasecmp($nameA, $nameB);
    });
    
    return $folders;
}

/**
 * Determines if a folder should be open
 * Now accepts both folder ID and name
 */
function shouldFolderBeOpen($con, $folderId, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes) {
    // Check if this folder was explicitly requested to be opened (e.g., after creating a subfolder)
    if (isset($_GET['open_folder'])) {
        $openFolderKey = $_GET['open_folder'];
        if ($openFolderKey === 'folder_' . $folderId) {
            return true;
        }
    }
    
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
function generateFolderActions($folderId, $folderName, $workspace_filter, $noteCount = 0) {
    $actions = "";
    
    // Escape folder name for use in JavaScript strings
    $escapedFolderName = addslashes($folderName);
    
    if ($folderName === 'Favorites') {
        // No actions for Favorites folder
    } else if (isDefaultFolder($folderName, $workspace_filter)) {
        // For the default folder: allow search and empty, but do not allow renaming
        $actions .= "<i class='fa-plus-circle folder-create-note-btn' onclick='showCreateNoteInFolderModal($folderId, \"$escapedFolderName\")' title='Create'></i>";
        // Only show move/empty buttons if folder has notes
        if ($noteCount > 0) {
            $actions .= "<i class='fa-folder-open folder-move-files-btn' onclick='event.stopPropagation(); showMoveFolderFilesDialog($folderId, \"$escapedFolderName\")' title='Move all files to another folder'></i>";
            $actions .= "<i class='fa-trash folder-empty-btn' onclick='event.stopPropagation(); emptyFolder($folderId, \"$escapedFolderName\")' title='Move all notes to trash'></i>";
        }
    } else {
        $actions .= "<i class='fa-plus-circle folder-create-note-btn' onclick='showCreateNoteInFolderModal($folderId, \"$escapedFolderName\")' title='Create'></i>";
        // Only show move button if folder has notes
        if ($noteCount > 0) {
            $actions .= "<i class='fa-folder-open folder-move-files-btn' onclick='event.stopPropagation(); showMoveFolderFilesDialog($folderId, \"$escapedFolderName\")' title='Move all files to another folder'></i>";
        }
        $actions .= "<i class='fa-edit folder-edit-btn' onclick='event.stopPropagation(); editFolderName($folderId, \"$escapedFolderName\")' title='Rename folder'></i>";
        $actions .= "<i class='fa-trash folder-delete-btn' onclick='event.stopPropagation(); deleteFolder($folderId, \"$escapedFolderName\")' title='Delete folder'></i>";
    }
    
    return $actions;
}

/**
 * Génère le lien pour une note en préservant l'état de recherche
 */
function generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $note_id) {
    $params = [];
    if (!empty($search)) $params[] = 'search=' . urlencode($search);
    if (!empty($tags_search)) $params[] = 'tags_search=' . urlencode($tags_search);
    if (!empty($folder_filter)) $params[] = 'folder=' . urlencode($folder_filter);
    if (!empty($workspace_filter)) $params[] = 'workspace=' . urlencode($workspace_filter);
    if ($preserve_notes) $params[] = 'preserve_notes=1';
    if ($preserve_tags) $params[] = 'preserve_tags=1';
    $params[] = 'note=' . intval($note_id);
    
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

/**
 * Organize folders into hierarchical structure
 */
function buildFolderHierarchy($folders) {
    $folderMap = [];
    $rootFolders = [];
    
    // Create a map of all folders by ID and add children array
    foreach ($folders as $folderId => $folderData) {
        $folderMap[$folderId] = $folderData;
        $folderMap[$folderId]['children'] = [];
    }
    
    // Build the hierarchy by linking children to parents
    foreach ($folderMap as $folderId => $folderData) {
        // Check if folder has parent_id in database
        $parentId = isset($folderData['parent_id']) ? $folderData['parent_id'] : null;
        
        if ($parentId === null || !isset($folderMap[$parentId])) {
            // This is a root folder
            $rootFolders[$folderId] = &$folderMap[$folderId];
        } else {
            // This is a child folder
            $folderMap[$parentId]['children'][$folderId] = &$folderMap[$folderId];
        }
    }
    
    return $rootFolders;
}

/**
 * Get parent_id for folders from database
 */
function enrichFoldersWithParentId($folders, $con, $workspace_filter) {
    foreach ($folders as $folderId => &$folderData) {
        $query = "SELECT parent_id FROM folders WHERE id = ?";
        $params = [$folderId];
        if ($workspace_filter) {
            $query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $params[] = $workspace_filter;
            $params[] = $workspace_filter;
        }
        
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($result) {
            $folderData['parent_id'] = $result['parent_id'] ? (int)$result['parent_id'] : null;
        } else {
            $folderData['parent_id'] = null;
        }
    }
    
    return $folders;
}
