<?php
/**
 * Management of folder and note display
 */

// Constants
define('FAVORITES_FOLDER_NAME', 'Favorites');

/**
 * Calculate total number of notes in a folder and all its subfolders recursively
 * 
 * @param array $folderData Folder data containing notes and optionally children
 * @return int Total count of notes
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
 * Organize notes by folder
 * Returns array with 'folders' and 'uncategorized_notes' keys
 * OPTIMIZED: Pre-loads all folder data to avoid N+1 queries
 * 
 * @param PDOStatement $stmt_left Statement containing notes to organize
 * @param PDO $con Database connection
 * @param string|null $workspace_filter Optional workspace filter
 * @param string $default_sort Default sort order ('updated_desc', 'heading_asc', 'created_desc')
 * @return array Array with 'folders' and 'uncategorized_notes' keys
 */
function organizeNotesByFolder($stmt_left, $con, $workspace_filter, $default_sort = 'updated_desc') {
    $folders = [];
    $uncategorized_notes = []; // Notes without folder
    
    // PRE-LOAD all folders in one query to avoid N+1 problem
    $folders_cache = [];
    $folders_query = "SELECT id, name, icon, icon_color, kanban_enabled, sort_setting FROM folders";
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
            'icon' => $folder_row['icon'] ?? null,
            'icon_color' => $folder_row['icon_color'] ?? null,
            'kanban_enabled' => (int)($folder_row['kanban_enabled'] ?? 0),
            'sort_setting' => $folder_row['sort_setting'] ?? null
        ];
    }
    
    while($row1 = $stmt_left->fetch(PDO::FETCH_ASSOC)) {
        $folderId = isset($row1["folder_id"]) && $row1["folder_id"] ? (int)$row1["folder_id"] : null;

        // If no folder_id, this note has no folder - add to uncategorized list
        if ($folderId === null) {
            $uncategorized_notes[] = $row1;
            continue;
        }

        // Use pre-loaded folder data (FAST - no DB query)
        $folderName = null;
        $folderIcon = null;
        $folderIconColor = null;
        $kanbanEnabled = 0;
        $sortSetting = null;
        
        if (isset($folders_cache[$folderId])) {
            $folderName = $folders_cache[$folderId]['name'];
            $folderIcon = $folders_cache[$folderId]['icon'];
            $folderIconColor = $folders_cache[$folderId]['icon_color'];
            $kanbanEnabled = $folders_cache[$folderId]['kanban_enabled'];
            $sortSetting = $folders_cache[$folderId]['sort_setting'];
        }

        if (!isset($folders[$folderId])) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'icon' => $folderIcon,
                'icon_color' => $folderIconColor,
                'kanban_enabled' => $kanbanEnabled,
                'sort_setting' => $sortSetting,
                'notes' => []
            ];
        }

        $folders[$folderId]['notes'][] = $row1;
    }
    
    // Sort notes within folders based on folder-specific sort_setting or default sort
    foreach ($folders as &$folder) {
        $sortType = null;
        
        // Folder-specific sort setting overrides global default
        if (isset($folder['sort_setting']) && !empty($folder['sort_setting'])) {
            $sortType = $folder['sort_setting'];
        } else {
            // Map global setting to folder sort type
            switch ($default_sort) {
                case 'heading_asc':
                    $sortType = 'alphabet';
                    break;
                case 'created_desc':
                    $sortType = 'created';
                    break;
                case 'updated_desc':
                default:
                    $sortType = 'modified';
                    break;
            }
        }
        
        // Ensure effective sort type is used for UI rendering (e.g., checkmark display)
        if ($sortType) {
            $folder['sort_setting'] = $sortType;
        }
        
        // Apply sort based on determined type
        if ($sortType === 'alphabet') {
            usort($folder['notes'], function($a, $b) {
                // Use heading, fallback to empty string for natural case-insensitive sorting
                $headingA = isset($a['heading']) ? mb_strtolower($a['heading'], 'UTF-8') : '';
                $headingB = isset($b['heading']) ? mb_strtolower($b['heading'], 'UTF-8') : '';
                return strnatcasecmp($headingA, $headingB);
            });
        } elseif ($sortType === 'created') {
            usort($folder['notes'], function($a, $b) {
                $createdA = $a['created'] ?? '';
                $createdB = $b['created'] ?? '';
                // Newest first
                return strcmp($createdB, $createdA);
            });
        } elseif ($sortType === 'modified') {
            usort($folder['notes'], function($a, $b) {
                $updatedA = $a['updated'] ?? '';
                $updatedB = $b['updated'] ?? '';
                // Newest first
                return strcmp($updatedB, $updatedA);
            });
        }
    }
    
    return [
        'folders' => $folders,
        'uncategorized_notes' => $uncategorized_notes
    ];
}

/**
 * Add empty folders from the folders table
 * Uses folder_id as key to maintain consistency
 * 
 * @param PDO $con Database connection
 * @param array $folders Existing folders array
 * @param string|null $workspace_filter Optional workspace filter
 * @return array Updated folders array including empty folders
 */
function addEmptyFolders($con, $folders, $workspace_filter) {
    $folders_sql = "SELECT id, name, icon, icon_color, kanban_enabled, sort_setting FROM folders";
    $params = [];
    if (!empty($workspace_filter)) {
        $folders_sql .= " WHERE workspace = ?";
        $params[] = $workspace_filter;
    }
    $folders_sql .= " ORDER BY name";

    $empty_folders_query = $con->prepare($folders_sql);
    $empty_folders_query->execute($params);
    while($folder_row = $empty_folders_query->fetch(PDO::FETCH_ASSOC)) {
        $folderId = (int)$folder_row['id'];
        $folderName = $folder_row['name'];
        $folderIcon = $folder_row['icon'] ?? null;
        $folderIconColor = $folder_row['icon_color'] ?? null;
        $kanbanEnabled = (int)($folder_row['kanban_enabled'] ?? 0);
        $sortSetting = $folder_row['sort_setting'] ?? null;

        if (!isset($folders[$folderId])) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folderName,
                'icon' => $folderIcon,
                'icon_color' => $folderIconColor,
                'kanban_enabled' => $kanbanEnabled,
                'sort_setting' => $sortSetting,
                'notes' => []
            ];
        } else {
            // Update icon, color, kanban_enabled and sort_setting if folder already exists
            $folders[$folderId]['icon'] = $folderIcon;
            $folders[$folderId]['icon_color'] = $folderIconColor;
            $folders[$folderId]['kanban_enabled'] = $kanbanEnabled;
            $folders[$folderId]['sort_setting'] = $sortSetting;
        }
    }

    return $folders;
}

/**
 * Ensure Favorites folder always exists (even if empty)
 * 
 * @param array $folders Existing folders array
 * @return array Updated folders array with Favorites folder
 */
function ensureFavoritesFolder($folders) {
    // Check if Favorites folder exists
    $hasFavorites = false;
    foreach ($folders as $folder) {
        if (isset($folder['name']) && $folder['name'] === FAVORITES_FOLDER_NAME) {
            $hasFavorites = true;
            break;
        }
    }
    
    // Add empty Favorites folder if it doesn't exist
    if (!$hasFavorites) {
        // Use 'favorites' as special key (lowercase) to distinguish from regular folders
        $folders['favorites'] = [
            'id' => null,  // No real DB ID for Favorites pseudo-folder
            'name' => FAVORITES_FOLDER_NAME,
            'notes' => []
        ];
    }
    
    return $folders;
}

/**
 * Sort folders (Favorites first, then alphabetically by name)
 * Works with folder arrays containing 'id' and 'name'
 * 
 * @param array $folders Folders to sort
 * @return array Sorted folders array
 */
function sortFolders($folders) {
    uksort($folders, function($a, $b) use ($folders) {
        $folderA = $folders[$a];
        $folderB = $folders[$b];
        $nameA = $folderA['name'];
        $nameB = $folderB['name'];
        
        if ($nameA === FAVORITES_FOLDER_NAME) return -1;
        if ($nameB === FAVORITES_FOLDER_NAME) return 1;
        return strcasecmp($nameA, $nameB);
    });
    
    return $folders;
}

/**
 * Determines if a folder should be open in the UI
 * Accepts the full folder data array
 * 
 * @param PDO $con Database connection (kept for API compatibility, currently unused)
 * @param array|null $folderData Folder data array with 'id' and 'name'
 * @param bool $is_search_mode Whether in search mode
 * @param array $folders_with_results Folders that have search results
 * @param string $note Currently selected note ID
 * @param string|null $current_note_folder Folder of currently selected note
 * @param string|null $default_note_folder Default note's folder
 * @param string|null $workspace_filter Workspace filter
 * @param int $total_notes Total number of notes
 * @return bool Whether the folder should be open
 */
function shouldFolderBeOpen($con, $folderData, $is_search_mode, $folders_with_results, $note, $current_note_folder, $default_note_folder, $workspace_filter, $total_notes) {
    if (!$folderData || !isset($folderData['id']) || !isset($folderData['name'])) {
        return false;
    }
    
    $folderId = $folderData['id'];
    $folderName = $folderData['name'];

    // Favorites folder is always open
    if ($folderName === FAVORITES_FOLDER_NAME) {
        return true;
    }
    
    // Check if this folder was explicitly requested to be opened (e.g., after creating a subfolder)
    if (isset($_GET['open_folder'])) {
        $openFolderKey = htmlspecialchars($_GET['open_folder'], ENT_QUOTES, 'UTF-8');
        if ($openFolderKey === 'folder_' . $folderId) {
            return true;
        }
    }
    
    if($total_notes <= 3) {
        // If we have very few notes (demo notes just created), open all folders
        return true;
    } else if($is_search_mode) {
        // In search mode: open folders that have results (direct or in subfolders)
        if (isset($folders_with_results[$folderName])) {
            return true;
        }
        return countNotesRecursively($folderData) > 0;
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
 * Generate available actions for a folder
 * OPTIMIZED: Uses cached shared folders data to avoid N+1 queries
 * 
 * @param int $folderId Folder ID
 * @param string $folderName Folder name
 * @param PDO $con Database connection
 * @param string|null $workspace_filter Workspace filter
 * @param int $noteCount Number of notes in folder
 * @param string|null $currentSort Current sort setting
 * @return string HTML for folder actions
 */
function generateFolderActions($folderId, $folderName, $con, $workspace_filter, $noteCount = 0, $currentSort = null) {
    static $sharedFoldersCache = null;
    
    $actions = "";
    
    // Escape folder name for HTML attribute context
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
    
    if ($folderName !== FAVORITES_FOLDER_NAME) {
        // Create three-dot menu
        $actions .= "<div class='folder-actions-toggle' data-action='toggle-folder-actions-menu' data-folder-id='$folderId' title='" . t_h('notes_list.folder_actions.menu', [], 'Actions') . "'>";
        $actions .= "<i class='lucide lucide-more-vertical'></i>";
        $actions .= "</div>";
        
        // Create dropdown menu
        $actions .= "<div class='folder-actions-menu' id='folder-actions-menu-$folderId'>";
        
        // Create note action
        $actions .= "<div class='folder-actions-menu-item' data-action='create-note-in-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-plus-circle'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.create', [], 'Create note') . "</span>";
        $actions .= "</div>";
        
        // Kanban view action
        $actions .= "<div class='folder-actions-menu-item kanban-view-action' data-action='open-kanban-view' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-columns-2'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view') . "</span>";
        $actions .= "</div>";

        // Open all notes in tabs action (only if folder has notes, hidden on mobile)
        if ($noteCount > 0) {
            $actions .= "<div class='folder-actions-menu-item open-all-tabs-action' data-action='open-all-notes-in-tabs' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='lucide lucide-layers'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.open_all_in_tabs', [], 'Open all notes') . "</span>";
            $actions .= "</div>";
        }
        
        // Move all files action (only if folder has notes)
        if ($noteCount > 0) {
            $actions .= "<div class='folder-actions-menu-item' data-action='move-folder-files' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='lucide lucide-folder-open'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.move_all_files', [], 'Move all files') . "</span>";
            $actions .= "</div>";
        }
        
        // Move folder action
        $actions .= "<div class='folder-actions-menu-item' data-action='move-entire-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-share-2'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder') . "</span>";
        $actions .= "</div>";
        
        // Download folder action (only if folder has notes)
        if ($noteCount > 0) {
            $actions .= "<div class='folder-actions-menu-item' data-action='download-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='lucide lucide-download'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.download_folder', [], 'Download folder') . "</span>";
            $actions .= "</div>";
        }
        
        // Share folder action
        if ($isShared) {
            $actions .= "<div class='folder-actions-menu-item shared' data-action='share-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='lucide lucide-cloud'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.is_public', [], 'Is public') . "</span>";
            $actions .= "</div>";
        } else {
            $actions .= "<div class='folder-actions-menu-item' data-action='share-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
            $actions .= "<i class='lucide lucide-cloud'></i>";
            $actions .= "<span>" . t_h('notes_list.folder_actions.share_folder', [], 'Make public') . "</span>";
            $actions .= "</div>";
        }
        
        // Rename folder action
        $actions .= "<div class='folder-actions-menu-item' data-action='rename-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-pencil'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.rename_folder', [], 'Rename') . "</span>";
        $actions .= "</div>";
        
        // Change folder icon action
        $actions .= "<div class='folder-actions-menu-item' data-action='change-folder-icon' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-palette'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.change_icon', [], 'Change icon') . "</span>";
        $actions .= "</div>";
        
        // Sort Options Definition
        $sortTypes = [
            'alphabet' => ['icon' => 'lucide lucide-arrow-down-a-z', 'label' => t_h('sort.alphabet', [], 'Name')],
            'created' => ['icon' => 'lucide lucide-calendar-plus', 'label' => t_h('sort.created', [], 'Date Created')],
            'modified' => ['icon' => 'lucide lucide-calendar', 'label' => t_h('sort.modified', [], 'Date Modified')]
        ];

        // Determine active label
        $currentLabel = isset($sortTypes[$currentSort]) ? $sortTypes[$currentSort]['label'] : t_h('sort.header', [], 'Sort by');

        // Sort Submenu Toggle (Accordion style)
        $actions .= "<div class='folder-actions-menu-item' data-action='toggle-sort-submenu' data-folder-id='$folderId'>";
        $actions .= "<i class='lucide lucide-arrow-up-down-amount-down'></i>";
        $actions .= "<span class='sort-header-label'>" . $currentLabel . "</span>";
        $actions .= "</div>";

        // Sort Options Container
        $actions .= "<div class='sort-submenu' style='display: none; background: rgba(0,0,0,0.03);'>";

        foreach ($sortTypes as $type => $data) {
            $isActive = ($currentSort === $type);
            $activeClass = $isActive ? ' active' : '';
            
            $actions .= "<div class='folder-actions-menu-item$activeClass submenu-item' data-action='sort-folder' data-sort-type='$type' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName' style='padding-left: 28px;'>";
            $actions .= "<i class='" . $data['icon'] . "'></i>";
            $actions .= "<span class='sort-option-label'>" . $data['label'] . "</span>";
            $actions .= "</div>";
        }
        $actions .= "</div>"; // Close sort-submenu
        
        // Delete folder action
        $actions .= "<div class='folder-actions-menu-item danger' data-action='delete-folder' data-folder-id='$folderId' data-folder-name='$htmlEscapedFolderName'>";
        $actions .= "<i class='lucide lucide-trash-2'></i>";
        $actions .= "<span>" . t_h('notes_list.folder_actions.delete_folder', [], 'Delete') . "</span>";
        $actions .= "</div>";
        
        $actions .= "</div>"; // Close dropdown menu
    }
    
    return $actions;
}

/**
 * Generate link for a note while preserving search state
 * 
 * @param string $search Search query
 * @param string $tags_search Tags search query
 * @param string $folder_filter Folder filter
 * @param string $workspace_filter Workspace filter
 * @param bool $preserve_notes Whether to preserve notes state
 * @param bool $preserve_tags Whether to preserve tags state
 * @param int $note_id Note ID
 * @param bool $search_combined Whether to combine search
 * @return string URL for the note
 */
function generateNoteLink($search, $tags_search, $folder_filter, $workspace_filter, $preserve_notes, $preserve_tags, $note_id, $search_combined = false) {
    $params = [];
    if (!empty($search)) $params[] = 'search=' . urlencode($search);
    if (!empty($tags_search)) $params[] = 'tags_search=' . urlencode($tags_search);
    if (!empty($folder_filter)) $params[] = 'folder=' . urlencode($folder_filter);
    if (!empty($workspace_filter)) $params[] = 'workspace=' . urlencode($workspace_filter);
    if ($preserve_notes) $params[] = 'preserve_notes=1';
    if ($preserve_tags) $params[] = 'preserve_tags=1';
    if ($search_combined) $params[] = 'search_combined=1';
    $params[] = 'note=' . intval($note_id);
    
    return 'index.php?' . implode('&', $params);
}

/**
 * Count total number of notes to determine if all folders should be opened
 * OPTIMIZED: Uses prepared statement for security and caches result per workspace
 * 
 * @param PDO $con Database connection
 * @param string|null $workspace_filter Optional workspace filter
 * @return int Total number of notes
 */
function getTotalNotesCount($con, $workspace_filter) {
    static $cache = [];
    
    // Create cache key based on workspace filter
    $cacheKey = $workspace_filter ?? '__all__';
    
    // Return cached value if available
    if (isset($cache[$cacheKey])) {
        return $cache[$cacheKey];
    }
    
    $total_notes_query = "SELECT COUNT(*) as total FROM entries WHERE trash = 0";
    $params = [];
    if (isset($workspace_filter) && $workspace_filter !== '') {
        $total_notes_query .= " AND workspace = ?";
        $params[] = $workspace_filter;
    }
    $stmt = $con->prepare($total_notes_query);
    $stmt->execute($params);
    $cache[$cacheKey] = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
    return $cache[$cacheKey];
}

/**
 * Organize folders into hierarchical structure
 * 
 * @param array $folders Flat array of folders
 * @return array Hierarchical array of root folders with children
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
 * Enrich folders with parent_id from database
 * OPTIMIZED: Uses a single query to fetch all parent_ids at once
 * 
 * @param array $folders Folders array
 * @param PDO $con Database connection
 * @param string|null $workspace_filter Optional workspace filter
 * @return array Folders with parent_id enriched
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
