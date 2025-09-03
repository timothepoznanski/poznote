<?php
/**
 * Initialisation des paramètres et variables globales
 */

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
            $stmt_ws = $con->query("SELECT name FROM workspaces ORDER BY CASE WHEN name = 'Poznote' THEN 0 ELSE 1 END, name");
            while ($r = $stmt_ws->fetch(PDO::FETCH_ASSOC)) {
                $workspaces[] = $r['name'];
            }
        } catch (Exception $e) {
            // ignore - leave as empty array
            $workspaces = [];
        }
    }

    if (!isset($labels) || !is_array($labels)) {
        // Labels table is optional in some installs; default to empty labels map
        $labels = [];
    }
}

/**
 * Initialise les paramètres de recherche
 */
function initializeSearchParams() {
    $search = $_POST['search'] ?? $_GET['search'] ?? '';
    $tags_search = $_POST['tags_search'] ?? $_GET['tags_search'] ?? $_GET['tags_search_from_list'] ?? '';
    $note = $_GET['note'] ?? '';
    $folder_filter = $_GET['folder'] ?? '';
    $workspace_filter = $_GET['workspace'] ?? $_POST['workspace'] ?? 'Poznote';
    
    // Handle search type preservation when clearing search
    $preserve_notes = isset($_GET['preserve_notes']) && $_GET['preserve_notes'] === '1';
    $preserve_tags = isset($_GET['preserve_tags']) && $_GET['preserve_tags'] === '1';
    $preserve_folders = isset($_GET['preserve_folders']) && $_GET['preserve_folders'] === '1';
    
    return [
        'search' => $search,
        'tags_search' => $tags_search,
        'note' => $note,
        'folder_filter' => $folder_filter,
        'workspace_filter' => $workspace_filter,
        'preserve_notes' => $preserve_notes,
        'preserve_tags' => $preserve_tags,
        'preserve_folders' => $preserve_folders
    ];
}

/**
 * Génère la map d'affichage des workspaces pour JavaScript
 */
function generateWorkspaceDisplayMap($workspaces, $labels) {
    $display_map = [];
    foreach ($workspaces as $w) {
        if (isset($labels[$w]) && $labels[$w] !== '') {
            $display_map[$w] = $labels[$w];
        } else {
            $display_map[$w] = ($w === 'Poznote') ? 'Poznote' : $w;
        }
    }
    return $display_map;
}
