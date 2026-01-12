<?php
function handleUnifiedSearch() {
    global $search, $tags_search, $using_unified_search;
    
    $using_unified_search = false;
    
    // Handle unified search
    if (!empty($_POST['unified_search'])) {
        $unified_search = $_POST['unified_search'];
        $search_in_notes = isset($_POST['search_in_notes']) && $_POST['search_in_notes'] !== '';
        $search_in_tags = isset($_POST['search_in_tags']) && $_POST['search_in_tags'] !== '';
        
        $using_unified_search = true;
        
        // Only proceed if at least one option is selected
        if ($search_in_notes || $search_in_tags) {
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
 * Build secure search conditions
 */
function buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter) {
    $where_conditions = ["trash = 0"];
    $search_params = [];
    
    // Intelligent search that excludes Excalidraw content
    // Optimized: Check heading first (indexed), then entry content (slower)
    if (!empty($search)) {
        // Parse search terms with support for quoted phrases
        $parsed_terms = parseSearchTerms($search);

        if (count($parsed_terms) <= 1 && $parsed_terms[0]['type'] === 'word') {
            // Single word: Optimized search - check heading first (fast with index), then entry (slower)
            // Using CASE to avoid calling search_clean_entry when heading matches
            // Accent-insensitive search using remove_accents function
            $where_conditions[] = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry)) LIKE remove_accents(?)))";
            $search_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $search_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $search_params[] = '%' . $parsed_terms[0]['value'] . '%';
        } else {
            // Multiple terms or phrase: require ALL terms to appear (AND)
            // Optimized to check heading first for each term
            // Accent-insensitive search using remove_accents function
            $term_conditions = [];
            foreach ($parsed_terms as $term) {
                $term_conditions[] = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry)) LIKE remove_accents(?)))";
                $search_params[] = '%' . $term['value'] . '%';
                $search_params[] = '%' . $term['value'] . '%';
                $search_params[] = '%' . $term['value'] . '%';
            }
            $where_conditions[] = "(" . implode(" AND ", $term_conditions) . ")";
        }
    }
    
    if (!empty($tags_search)) {
        // Handle multiple tags search - split by comma or space
        $search_tags = array_filter(array_map('trim', preg_split('/[,\s]+/', $tags_search)));
        
        if (count($search_tags) == 1) {
            // Single tag search - accent-insensitive
            $where_conditions[] = "remove_accents(tags) LIKE remove_accents(?)";
            $search_params[] = '%' . $search_tags[0] . '%';
        } else {
            // Multiple tags search - all tags must be present - accent-insensitive
            $tag_conditions = [];
            foreach ($search_tags as $tag) {
                $tag_conditions[] = "remove_accents(tags) LIKE remove_accents(?)";
                $search_params[] = '%' . $tag . '%';
            }
            $where_conditions[] = "(" . implode(" AND ", $tag_conditions) . ")";
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
                $where_conditions[] = "folder = ?";
                $search_params[] = $folder_filter;
            }
        }
    }

    // Apply workspace filter
    if (!empty($workspace_filter)) {
        $where_conditions[] = "workspace = ?";
        $search_params[] = $workspace_filter;
    }
    
    
    
    $where_clause = implode(" AND ", $where_conditions);
    
    return [
        'where_clause' => $where_clause,
        'search_params' => $search_params
    ];
}

/**
 * Traite les dossiers exclus de la recherche
 */
