<?php
function handleUnifiedSearch() {
    global $search, $tags_search, $using_unified_search;
    
    $using_unified_search = false;
    
    // Handle unified search
    if (!empty($_POST['unified_search'])) {
        $unified_search = $_POST['unified_search'];
        $search_in_notes = isset($_POST['search_in_notes']) && $_POST['search_in_notes'] !== '';
        $search_in_tags = isset($_POST['search_in_tags']) && $_POST['search_in_tags'] !== '';
        $search_combined = isset($_POST['search_combined']) && $_POST['search_combined'] === '1';
        
        $using_unified_search = true;
        
        // Combined mode: search in both notes and tags
        if ($search_combined) {
            $search = $unified_search;
            $tags_search = $unified_search;
        }
        // Only proceed if at least one option is selected
        else if ($search_in_notes || $search_in_tags) {
            // Set search values based on selected options
            if ($search_in_notes) {
                $search = $unified_search;
            } else {
                $search = '';
            }
            
            if ($search_in_tags) {
                $tags_search = $unified_search;
            } else {
                $tags_search = '';
            }
        }
        // If no options are selected, ignore the search (keep existing search state)
    }
    
    return $using_unified_search;
}

/**
 * Parse search terms with support for quoted phrases
 */
function parseSearchTerms($search) {
    $terms = [];
    $pattern = '/"([^"]+)"|\S+/';
    
    preg_match_all($pattern, $search, $matches);
    
    foreach ($matches[0] as $match) {
        // If the match starts and ends with quotes, it's an exact phrase
        if (preg_match('/^"(.+)"$/', $match, $phrase_match)) {
            $terms[] = ['type' => 'phrase', 'value' => $phrase_match[1]];
        } else {
            // Otherwise it's a simple word
            $terms[] = ['type' => 'word', 'value' => $match];
        }
    }
    
    return $terms;
}

/**
 * Collect a folder's id plus the ids of all its descendants.
 *
 * Used by the folder filter so that browsing a single folder also shows the
 * notes of its subfolders. Walks the parent_id chain level by level; the
 * $seen guard keeps a corrupted parent cycle from looping forever.
 *
 * @param PDO $con Database connection
 * @param string $folderName Name of the root folder to resolve
 * @param string|null $workspace_filter Workspace filter
 * @return int[] Folder ids, empty if the folder name is unknown
 */
function collectFolderSubtreeIds($con, $folderName, $workspace_filter = null) {
    try {
        $query = "SELECT id, parent_id FROM folders";
        $params = [];
        if (!empty($workspace_filter)) {
            $query .= " WHERE workspace = ?";
            $params[] = $workspace_filter;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $childrenByParent = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $parentId = $row['parent_id'] !== null ? (int)$row['parent_id'] : 0;
            $childrenByParent[$parentId][] = (int)$row['id'];
        }

        // Resolve the starting folder(s) by name: duplicates can legitimately
        // exist in separate branches, so every match seeds the walk.
        $rootQuery = "SELECT id FROM folders WHERE name = ?";
        $rootParams = [$folderName];
        if (!empty($workspace_filter)) {
            $rootQuery .= " AND workspace = ?";
            $rootParams[] = $workspace_filter;
        }
        $rootStmt = $con->prepare($rootQuery);
        $rootStmt->execute($rootParams);
        $queue = array_map('intval', $rootStmt->fetchAll(PDO::FETCH_COLUMN));

        $ids = [];
        $seen = [];
        while ($queue) {
            $current = array_shift($queue);
            if (isset($seen[$current])) continue;
            $seen[$current] = true;
            $ids[] = $current;
            if (!empty($childrenByParent[$current])) {
                foreach ($childrenByParent[$current] as $childId) {
                    $queue[] = $childId;
                }
            }
        }
        return $ids;
    } catch (Exception $e) {
        return [];
    }
}

/**
 * Build secure search conditions
 *
 * $created_from and $created_to are user-local dates in YYYY-MM-DD format.
 *
 * When $con is provided, a folder filter also matches the folder's subfolders
 * so the filtered view keeps the folder's tree instead of a single level.
 */
function buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $combined_mode = false, $created_from = '', $created_to = '', $con = null) {
    $where_conditions = ["trash = 0"];
    $search_params = [];
    
    // For combined mode, we want notes OR tags, so we collect them separately
    $notes_condition = null;
    $notes_params = [];
    $tags_condition = null;
    $tags_params = [];
    
    // Intelligent search that excludes Excalidraw content
    // Optimized: Check heading first (indexed), then entry content (slower)
    $search_text = trim((string)$search);
    if ($search_text !== '') {
        // Parse search terms with support for quoted phrases
        $parsed_terms = parseSearchTerms($search_text);

        if (count($parsed_terms) === 1 && $parsed_terms[0]['type'] === 'word') {
            // Single word: Optimized search - check heading first (fast with index), then entry (slower)
            // Using CASE to avoid calling search_clean_entry when heading matches
            // Accent-insensitive search using remove_accents function
            $notes_condition = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?)))";
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
        } elseif (count($parsed_terms) > 0) {
            // Multiple terms or phrase: require ALL terms to appear (AND)
            // Optimized to check heading first for each term
            // Accent-insensitive search using remove_accents function
            $term_conditions = [];
            foreach ($parsed_terms as $term) {
                $term_conditions[] = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?)))";
                $notes_params[] = '%' . $term['value'] . '%';
                $notes_params[] = '%' . $term['value'] . '%';
                $notes_params[] = '%' . $term['value'] . '%';
            }
            $notes_condition = "(" . implode(" AND ", $term_conditions) . ")";
        }
    }
    
    $tags_search_text = trim((string)$tags_search);
    if ($tags_search_text !== '') {
        // Handle multiple tags search - split by comma or space
        $search_tags = array_values(array_filter(
            array_map('trim', preg_split('/[,\s]+/', $tags_search_text)),
            fn($tag) => $tag !== ''
        ));
        
        if (count($search_tags) == 1) {
            // Single tag search - accent-insensitive
            $tags_condition = "remove_accents(tags) LIKE remove_accents(?)";
            $tags_params[] = '%' . $search_tags[0] . '%';
        } elseif (count($search_tags) > 1) {
            // Multiple tags search - all tags must be present - accent-insensitive
            $tag_conditions = [];
            foreach ($search_tags as $tag) {
                $tag_conditions[] = "remove_accents(tags) LIKE remove_accents(?)";
                $tags_params[] = '%' . $tag . '%';
            }
            $tags_condition = "(" . implode(" AND ", $tag_conditions) . ")";
        }
    }
    
    // Combine notes and tags conditions based on mode
    if ($combined_mode && $notes_condition && $tags_condition) {
        // Combined mode: search for notes OR tags match
        $where_conditions[] = "(" . $notes_condition . " OR " . $tags_condition . ")";
        $search_params = array_merge($search_params, $notes_params, $tags_params);
    } else {
        // Standard mode: both conditions must match (AND)
        if ($notes_condition) {
            $where_conditions[] = $notes_condition;
            $search_params = array_merge($search_params, $notes_params);
        }
        if ($tags_condition) {
            $where_conditions[] = $tags_condition;
            $search_params = array_merge($search_params, $tags_params);
        }
    }
    
    // Secure folder filter
    if (!empty($folder_filter)) {
        if ($folder_filter === 'Favorites') {
            $where_conditions[] = "favorite = 1";
        } else {
            // Try to interpret folder_filter as ID first, fallback to name
            if (is_numeric($folder_filter)) {
                $where_conditions[] = "folder_id = ?";
                $search_params[] = intval($folder_filter);
            } else {
                // With a connection available, match the folder and everything
                // below it so subfolders stay visible in the filtered view.
                $subtreeIds = $con ? collectFolderSubtreeIds($con, $folder_filter, $workspace_filter) : [];
                if (count($subtreeIds) > 1) {
                    $placeholders = implode(',', array_fill(0, count($subtreeIds), '?'));
                    $where_conditions[] = "folder_id IN ($placeholders)";
                    $search_params = array_merge($search_params, $subtreeIds);
                } else {
                    $where_conditions[] = "folder = ?";
                    $search_params[] = $folder_filter;
                }
            }
        }
    }

    // Apply workspace filter
    if (!empty($workspace_filter)) {
        $where_conditions[] = "workspace = ?";
        $search_params[] = $workspace_filter;
    }

    $created_from_utc = dateOnlyFilterToUtcBoundary($created_from, false);
    if ($created_from_utc !== null) {
        $where_conditions[] = "created >= ?";
        $search_params[] = $created_from_utc;
    }

    $created_to_utc = dateOnlyFilterToUtcBoundary($created_to, true);
    if ($created_to_utc !== null) {
        $where_conditions[] = "created <= ?";
        $search_params[] = $created_to_utc;
    }
    
    $where_clause = implode(" AND ", $where_conditions);
    
    return [
        'where_clause' => $where_clause,
        'search_params' => $search_params
    ];
}
