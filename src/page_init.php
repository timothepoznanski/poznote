<?php
/**
 * Initialization of global parameters and variables
 */

require_once 'functions.php';

/**
 * Initialise les workspaces et labels
 */
function initializeWorkspacesAndLabels($con) {
    global $workspaces, $labels;
    
    // Ensure $workspaces and $labels are defined to avoid PHP notices
    if (!isset($workspaces) || !is_array($workspaces)) {
        $workspaces = [];
        try {
            // Try to read workspaces from the DB if the table exists
            $stmt_ws = $con->query("SELECT name FROM workspaces ORDER BY name");
            while ($r = $stmt_ws->fetch(PDO::FETCH_ASSOC)) {
                $workspaces[] = $r['name'];
            }
        } catch (Exception $e) {
            // ignore - leave as empty array
            $workspaces = [];
        }
    }

    if (!isset($labels) || !is_array($labels)) {
        // Labels table is not yet implemented; defaults to empty map.
        // When implemented, $labels should map workspace names to display labels.
        $labels = [];
    }
}

/**
 * Initialize search parameters
 */
function initializeSearchParams() {
    $search = $_POST['search'] ?? $_GET['search'] ?? '';
    $tags_search = $_POST['tags_search'] ?? $_GET['tags_search'] ?? '';
    $note = $_GET['note'] ?? '';
    $folder_filter = $_GET['folder'] ?? '';
    
    // Handle search type preservation when clearing search
    $preserve_notes = isset($_GET['preserve_notes']) && $_GET['preserve_notes'] === '1';
    $preserve_tags = isset($_GET['preserve_tags']) && $_GET['preserve_tags'] === '1';
    
    // Handle combined search mode - check both POST and GET
    $search_combined = (isset($_POST['search_combined']) && $_POST['search_combined'] === '1') ||
                       (isset($_GET['search_combined']) && $_GET['search_combined'] === '1');
    
    return [
        'search' => $search,
        'tags_search' => $tags_search,
        'note' => $note,
        'folder_filter' => $folder_filter,
        'workspace_filter' => getWorkspaceFilter(),
        'preserve_notes' => $preserve_notes,
        'preserve_tags' => $preserve_tags,
        'search_combined' => $search_combined
    ];
}

/**
 * Generate workspace display map for JavaScript
 */
function generateWorkspaceDisplayMap($workspaces, $labels) {
    $display_map = [];
    foreach ($workspaces as $w) {
        if (isset($labels[$w]) && $labels[$w] !== '') {
            $display_map[$w] = $labels[$w];
        } else {
            $display_map[$w] = $w;
        }
    }
    return $display_map;
}
