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
 * Construit les conditions de recherche sécurisées
 */
function buildSearchConditions($search, $tags_search, $folder_filter, $workspace_filter) {
    $where_conditions = ["trash = 0"];
    $search_params = [];
    
    // Simple secure search (basic version)
    if (!empty($search)) {
        // Split search string into individual terms (whitespace separated)
        $search_terms = array_filter(array_map('trim', preg_split('/\s+/', $search)));

        if (count($search_terms) <= 1) {
            // Single term: preserve previous behavior
            $where_conditions[] = "(heading LIKE ? OR entry LIKE ?)";
            $search_params[] = '%' . $search . '%';
            $search_params[] = '%' . $search . '%';
        } else {
            // Multiple terms: require ALL terms to appear (AND)
            $term_conditions = [];
            foreach ($search_terms as $t) {
                $term_conditions[] = "(heading LIKE ? OR entry LIKE ?)";
                $search_params[] = '%' . $t . '%';
                $search_params[] = '%' . $t . '%';
            }
            $where_conditions[] = "(" . implode(" AND ", $term_conditions) . ")";
        }
    }
    
    if (!empty($tags_search)) {
        // Handle multiple tags search - split by comma or space
        $search_tags = array_filter(array_map('trim', preg_split('/[,\s]+/', $tags_search)));
        
        if (count($search_tags) == 1) {
            // Single tag search
            $where_conditions[] = "tags LIKE ?";
            $search_params[] = '%' . $search_tags[0] . '%';
        } else {
            // Multiple tags search - all tags must be present
            $tag_conditions = [];
            foreach ($search_tags as $tag) {
                $tag_conditions[] = "tags LIKE ?";
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
            $where_conditions[] = "folder = ?";
            $search_params[] = $folder_filter;
        }
    }

    // Apply workspace filter
    if (!empty($workspace_filter)) {
        $where_conditions[] = "(workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        // We push workspace twice to match the two placeholders
        $search_params[] = $workspace_filter;
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
