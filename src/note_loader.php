<?php
/**
 * Gestion du chargement et de la sélection des notes
 */

/**
 * Determine the note to display and prepare queries
 */
function loadNoteData($con, &$note, $workspace_filter) {
    $default_note_folder = null;
    $res_right = null;
    $current_note_folder = null;
    
    if($note != '') {
        // If the note is not empty, it means we have just clicked on a note (now using ID)
        $note_id = intval($note);
        $stmt = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND id = ? AND workspace = ?");
        $stmt->execute([$note_id, $workspace_filter]);
        $note_data = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if($note_data) {
            $current_note_folder = $note_data["folder"] ?: null;
            // Prepare result for right column (ensure it's in the workspace)
            $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND id = ? AND workspace = ?");
            $stmt_right->execute([$note_id, $workspace_filter]);
            $res_right = $stmt_right;
        } else {
            // If the requested note doesn't exist, display the last updated note
            $note = ''; // Reset note to trigger showing latest note
            $latest_note_data = getLatestNote($con, $workspace_filter);
            $res_right = $latest_note_data['res_right'];
            $default_note_folder = $latest_note_data['default_note_folder'];
        }
    } else {
        // No specific note requested, check if we have notes to show the latest one
        $latest_note_data = getLatestNote($con, $workspace_filter);
        $res_right = $latest_note_data['res_right'];
        $default_note_folder = $latest_note_data['default_note_folder'];
    }
    
    return [
        'default_note_folder' => $default_note_folder,
        'current_note_folder' => $current_note_folder,
        'res_right' => $res_right
    ];
}

/**
 * Récupère la dernière note mise à jour
 */
function getLatestNote($con, $workspace_filter) {
    $check_stmt = $con->prepare("SELECT COUNT(*) as note_count FROM entries WHERE trash = 0 AND workspace = ?");
    $check_stmt->execute([$workspace_filter]);
    $note_count = $check_stmt->fetch(PDO::FETCH_ASSOC)['note_count'];
    
    $res_right = null;
    $default_note_folder = null;
    
    if ($note_count > 0) {
        // Show the most recently updated note in the selected workspace
        $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND workspace = ? ORDER BY updated DESC LIMIT 1");
        $stmt_right->execute([$workspace_filter]);
        $latest_note = $stmt_right->fetch(PDO::FETCH_ASSOC);
        
        if ($latest_note) {
            $default_note_folder = $latest_note["folder"] ?: null;
            // Re-execute query so $res_right is a fresh PDOStatement for the display loop
            // (PDO cursors cannot be reset after fetch)
            $stmt_right = $con->prepare("SELECT * FROM entries WHERE trash = 0 AND workspace = ? ORDER BY updated DESC LIMIT 1");
            $stmt_right->execute([$workspace_filter]);
            $res_right = $stmt_right;
        }
    }
    
    return [
        'res_right' => $res_right,
        'default_note_folder' => $default_note_folder
    ];
}

/**
 * Prépare les requêtes pour les résultats de recherche
 */
function prepareSearchResults($con, $is_search_mode, &$note, $where_clause, $search_params, $workspace_filter) {
    $res_right = null;
    
    if ($is_search_mode) {
        // If a specific note is selected, show that note instead of the most recent one
        if (!empty($note)) {
            // Build query to show the selected note if it matches search criteria
            $where_clause_with_note = $where_clause . " AND id = ?";
            $search_params_with_note = array_merge($search_params, [intval($note)]);
            
            $query_right_with_note = "SELECT * FROM entries WHERE $where_clause_with_note LIMIT 1";
            
            $stmt_right = $con->prepare($query_right_with_note);
            $stmt_right->execute($search_params_with_note);
            $selected_note_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
            
            if ($selected_note_result) {
                $note = $selected_note_result['id'];
                // Re-execute: PDO cursors cannot be reset after fetch
                $stmt_right = $con->prepare($query_right_with_note);
                $stmt_right->execute($search_params_with_note);
                $res_right = $stmt_right;
            } else {
                // Selected note doesn't match search criteria, show most recent matching note
                $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
                $stmt_right = $con->prepare($query_right_secure);
                $stmt_right->execute($search_params);
                $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
                if ($search_result) {
                    $note = $search_result['id'];
                    // Re-execute: PDO cursors cannot be reset after fetch
                    $stmt_right = $con->prepare($query_right_secure);
                    $stmt_right->execute($search_params);
                    $res_right = $stmt_right;
                } else {
                    $res_right = null; // No results found
                }
            }
        } else {
            // No specific note selected, show most recent matching note
            $query_right_secure = "SELECT * FROM entries WHERE $where_clause ORDER BY updated DESC LIMIT 1";
            $stmt_right = $con->prepare($query_right_secure);
            $stmt_right->execute($search_params);
            $search_result = $stmt_right->fetch(PDO::FETCH_ASSOC);
            if ($search_result) {
                $note = $search_result['id'];
                // Re-execute: PDO cursors cannot be reset after fetch
                $stmt_right = $con->prepare($query_right_secure);
                $stmt_right->execute($search_params);
                $res_right = $stmt_right;
            } else {
                $res_right = null; // No results found
            }
        }
    }
    
    return $res_right;
}
