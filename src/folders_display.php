<?php
/**
 * Management of folder and note display
 */

/**
 * Organize notes by folder
 * Now returns array with 'folders' and 'uncategorized_notes' keys
 * OPTIMIZED: Pre-load all folder data to avoid N+1 queries
 */
function organizeNotesByFolder($stmt_left, $con, $workspace_filter) {
    $folders = [];
    $uncategorized_notes = []; // Notes without folder
    $folders_with_results = [];
    
    // PRE-LOAD all folders in one query to avoid N+1 problem
    $folders_cache = [];
    $folders_query = "SELECT id, name, icon FROM folders";
    if ($workspace_filter) {
        $folders_query .= " WHERE workspace = ?";
        $folders_stmt = $con->prepare($folders_query);
        $folders_stmt->execute([$workspace_filter]);
    } else {
        $folders_stmt = $con->query($folders_query);
    }
    while ($folder_row = $folders_stmt->fetch(PDO::FETCH_ASSOC)) {
        $folders_cache[(int)$folder_row['id']] = [
            'name' => $folder_row['name'],
            'icon' => $folder_row['icon'] ?? null
        ];
    }
    
    while($row1 = $stmt_left->fetch(PDO::FETCH_ASSOC)) {
        $folderId = isset($row1["folder_id"]) && $row1["folder_id"] ? (int)$row1["folder_id"] : null;
        $folderName = $row1["folder"] ?: null;
        $folderIcon = null; // Initialize icon variable
        
        // If no folder_id, this note has no folder - add to uncategorized list
        if ($folderId === null) {
            $uncategorized_notes[] = $row1;
            continue;
        }
        
        // Use pre-loaded folder data (FAST - no DB query)
        if (isset($folders_cache[$folderId])) {
            $folderName = $folders_cache[$folderId]['name'];
            $folderIcon = $folders_cache[$folderId]['icon'];
        }
        
        if (!isset($folders[$folderId])) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'icon' => $folderIcon ?? null,
                'notes' => []
            ];
        }
        
        $folders[$folderId]['notes'][] = $row1;
    }
    
    return [
        'folders' => $folders,
        'uncategorized_notes' => $uncategorized_notes
    ];
}

/**
 * Add empty folders from the folders table
 * Now uses folder_id as key
 */
function addEmptyFolders($con, $folders, $workspace_filter) {
    $folders_sql = "SELECT id, name, icon FROM folders";
    if (!empty($workspace_filter)) {
        $folders_sql .= " WHERE workspace = '" . addslashes($workspace_filter) . "'";
    }
    $folders_sql .= " ORDER BY name";
    
    $empty_folders_query = $con->query($folders_sql);
    while($folder_row = $empty_folders_query->fetch(PDO::FETCH_ASSOC)) {
        $folderId = (int)$folder_row['id'];
        $folderName = $folder_row['name'];
        $folderIcon = $folder_row['icon'] ?? null;
        
        if (!isset($folders[$folderId])) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'icon' => $folderIcon,
                'notes' => []
            ];
        } else {
            // Update icon if folder already exists
            $folders[$folderId]['icon'] = $folderIcon;
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
function sortFolders($folders) {
    uksort($folders, function($a, $b) use ($folders) {
        $folderA = $folders[$a];
        $folderB = $folders[$b];
        $nameA = $folderA['name'];
        $nameB = $folderB['name'];
        
        if ($nameA === 'Favorites') return -1;
        if ($nameB === 'Favorites') return 1;
        return strcasecmp($nameA, $nameB);
    });
    
    return $folders;
}

/**
 * Determines if a folder should be open
 * Now accepts both folder ID and name
 */
function shouldFolderBeOpen($con, $folderId, $folderName, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes) {
    // Favorites folder is always open
    if ($folderName === 'Favorites') {
        return true;
    }
    
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
        // If a note is selected: open the folder of the current note
        if ($folderName === $current_note_folder) {
            return true;
        }
    } else if($default_note_folder) {
        // If no specific note selected but default note loaded: open its folder
        return ($folderName === $default_note_folder);
    }
    
    return false;
}

/**
 * Génère les actions disponibles pour un dossier
 * OPTIMIZED: Uses cached shared folders data to avoid N+1 queries
 */
function generateFolderActions($folderId, $folderName, $workspace_filter, $noteCount = 0) {
    global $con;
    static $sharedFoldersCache = null;
    
    $actions = "";
    
    // Escape folder name for use in JavaScript strings
    $escapedFolderName = addslashes($folderName);
    $htmlEscapedFolderName = htmlspecialchars($folderName, ENT_QUOTES);
    
    // Pre-load all shared folders on first call to avoid N+1 queries
    if ($sharedFoldersCache === null) {
        $sharedFoldersCache = [];
        try {
            $stmt = $con->query('SELECT folder_id FROM shared_folders');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $sharedFoldersCache[(int)$row['folder_id']] = true;
            }
        } catch (Exception $e) {
            $sharedFoldersCache = [];
        }
    }
    
    // Check if folder is shared using cache
    $isShared = isset($sharedFoldersCache[(int)$folderId]);
    
    if ($folderName === 'Favorites') {
        // No actions for Favorites folder
    } else {
        // Create three-dot menu
        $actions .= "<div class='folder-actions-toggle' data-action='toggle-folder-actions-menu' data-folder-id='$folderId' title='" . t_h('notes_list.folder_actions.menu', [], 'Actions') . "'>";
        $actions .= "<i class='fa-ellipsis-v'></i>";
        $actions .= "</div>";
        
        // Create dropdown menu
        $actions .= "<div class='folder-actions-menu' id='folder-actions-menu-$folderId'>";
        
        // Create note action
        $actions .= "<div class='folder-actions-menu-item' data-action='create-note-in-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='fa-plus-circle'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.create', [], 'Create note') . "</span>";
        $actions .= "</div>";
        
        // Move all files action (only if folder has notes)
        if ($noteCount > 0) {
            $actions .= "<div class='folder-actions-menu-item' data-action='move-folder-files' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='fa-folder-open'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.move_all_files', [], 'Move all files') . "</span>";
            $actions .= "</div>";
        }
        
        // Move folder action
        $actions .= "<div class='folder-actions-menu-item' data-action='move-entire-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='fa-share'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder') . "</span>";
        $actions .= "</div>";
        
        // Download folder action (only if folder has notes)
        if ($noteCount > 0) {
            $actions .= "<div class='folder-actions-menu-item' data-action='download-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='fa-download'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.download_folder', [], 'Download folder') . "</span>";
            $actions .= "</div>";
        }
        
        // Share folder action
        if ($isShared) {
            $actions .= "<div class='folder-actions-menu-item shared' data-action='share-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='fa-cloud'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.is_public', [], 'Is public') . "</span>";
            $actions .= "</div>";
        } else {
            $actions .= "<div class='folder-actions-menu-item' data-action='share-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='fa-cloud'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.share_folder', [], 'Make public') . "</span>";
            $actions .= "</div>";
        }
        
        // Rename folder action
        $actions .= "<div class='folder-actions-menu-item' data-action='rename-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='fa-edit'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.rename_folder', [], 'Rename') . "</span>";
        $actions .= "</div>";
        
        // Change folder icon action
        $actions .= "<div class='folder-actions-menu-item' data-action='change-folder-icon' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='fa-palette'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.change_icon', [], 'Change icon') . "</span>";
        $actions .= "</div>";
        
        // Delete folder action
        $actions .= "<div class='folder-actions-menu-item danger' data-action='delete-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='fa-trash'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.delete_folder', [], 'Delete') . "</span>";
        $actions .= "</div>";
        
        $actions .= "</div>"; // Close dropdown menu
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
 * OPTIMIZED: Uses prepared statement for security
 */
function getTotalNotesCount($con, $workspace_filter) {
    static $cache = null;
    
    // Return cached value if available
    if ($cache !== null) {
        return $cache;
    }
    
    $total_notes_query = "SELECT COUNT(*) as total FROM entries WHERE trash = 0";
    $params = [];
    if (isset($workspace_filter) && $workspace_filter !== '') {
        $total_notes_query .= " AND workspace = ?";
        $params[] = $workspace_filter;
    }
    $stmt = $con->prepare($total_notes_query);
    $stmt->execute($params);
    $cache = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
    return $cache;
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
 * OPTIMIZED: Uses a single query to fetch all parent_ids at once
 */
function enrichFoldersWithParentId($folders, $con, $workspace_filter) {
    if (empty($folders)) {
        return $folders;
    }
    
    // Pre-load all folder parent_ids in one query
    $parentIdCache = [];
    try {
        $query = "SELECT id, parent_id FROM folders";
        if ($workspace_filter) {
            $query .= " WHERE workspace = ?";
            $stmt = $con->prepare($query);
            $stmt->execute([$workspace_filter]);
        } else {
            $stmt = $con->query($query);
        }
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $parentIdCache[(int)$row['id']] = $row['parent_id'] !== null ? (int)$row['parent_id'] : null;
        }
    } catch (Exception $e) {
        // On error, leave parent_id as null
    }
    
    // Enrich folders with cached parent_ids
    foreach ($folders as $folderId => &$folderData) {
        $folderData['parent_id'] = isset($parentIdCache[(int)$folderId]) ? $parentIdCache[(int)$folderId] : null;
    }
    
    return $folders;
}
