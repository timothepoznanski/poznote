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
 * Build secure search conditions
 */
function buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter, $combined_mode = false) {
    $where_conditions = ["trash = 0"];
    $search_params = [];
    
    // For combined mode, we want notes OR tags, so we collect them separately
    $notes_condition = null;
    $notes_params = [];
    $tags_condition = null;
    $tags_params = [];
    
    // Intelligent search that excludes Excalidraw content
    // Optimized: Check heading first (indexed), then entry content (slower)
    if (!empty($search)) {
        // Parse search terms with support for quoted phrases
        $parsed_terms = parseSearchTerms($search);

        if (count($parsed_terms) <= 1 && $parsed_terms[0]['type'] === 'word') {
            // Single word: Optimized search - check heading first (fast with index), then entry (slower)
            // Using CASE to avoid calling search_clean_entry when heading matches
            // Accent-insensitive search using remove_accents function
            $notes_condition = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry)) LIKE remove_accents(?)))";
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
            $notes_params[] = '%' . $parsed_terms[0]['value'] . '%';
        } else {
            // Multiple terms or phrase: require ALL terms to appear (AND)
            // Optimized to check heading first for each term
            // Accent-insensitive search using remove_accents function
            $term_conditions = [];
            foreach ($parsed_terms as $term) {
                $term_conditions[] = "(remove_accents(heading) LIKE remove_accents(?) OR (remove_accents(heading) NOT LIKE remove_accents(?) AND remove_accents(search_clean_entry(entry)) LIKE remove_accents(?)))";
                $notes_params[] = '%' . $term['value'] . '%';
                $notes_params[] = '%' . $term['value'] . '%';
                $notes_params[] = '%' . $term['value'] . '%';
            }
            $notes_condition = "(" . implode(" AND ", $term_conditions) . ")";
        }
    }
    
    if (!empty($tags_search)) {
        // Handle multiple tags search - split by comma or space
        $search_tags = array_filter(array_map('trim', preg_split('/[,\s]+/', $tags_search)));
        
        if (count($search_tags) == 1) {
            // Single tag search - accent-insensitive
            $tags_condition = "remove_accents(tags) LIKE remove_accents(?)";
            $tags_params[] = '%' . $search_tags[0] . '%';
        } else {
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
