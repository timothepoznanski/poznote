<?php
/**
 * Initialization of global parameters and variables
 */

require_once 'functions.php';

/**
 * Initialise les workspaces et labels
 */
function initializeWorkspacesAndLabels($con) {
    global $workspaces, $labels, $workspace_display_names;
    
    // Ensure $workspaces and $labels are defined to avoid PHP notices
    if (!isset($workspaces) || !is_array($workspaces)) {
        $workspaces = [];
        $workspace_display_names = [];
        try {
            // Try to read workspaces from the DB if the table exists
            $stmt_ws = $con->query("SELECT name, display_name FROM workspaces ORDER BY CASE WHEN name = 'Poznote' THEN 0 ELSE 1 END, name");
            while ($r = $stmt_ws->fetch(PDO::FETCH_ASSOC)) {
                $workspaces[] = $r['name'];
                $workspace_display_names[$r['name']] = $r['display_name'] ?? null;
            }
        } catch (Exception $e) {
            // ignore - leave as empty array
            $workspaces = [];
            $workspace_display_names = [];
        }
    }

    if (!isset($labels) || !is_array($labels)) {
        // Labels table is optional in some installs; default to empty labels map
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
    return [
        'search' => $search,
        'tags_search' => $tags_search,
        'note' => $note,
        'folder_filter' => $folder_filter,
        'workspace_filter' => getWorkspaceFilter(),
        'preserve_notes' => $preserve_notes,
        'preserve_tags' => $preserve_tags
    ];
}

/**
 * Generate workspace display map for JavaScript
 */
function generateWorkspaceDisplayMap($workspaces, $labels) {
    global $workspace_display_names;
    $display_map = [];
    foreach ($workspaces as $w) {
        // First check for display_name from the database
        if (isset($workspace_display_names[$w]) && $workspace_display_names[$w] !== '' && $workspace_display_names[$w] !== null) {
            $display_map[$w] = $workspace_display_names[$w];
        } elseif (isset($labels[$w]) && $labels[$w] !== '') {
            $display_map[$w] = $labels[$w];
        } else {
            $display_map[$w] = ($w === 'Poznote') ? 'Poznote' : $w;
        }
    }
    return $display_map;
}

/**
 * Get the display name for a workspace
 */
function getWorkspaceDisplayName($workspaceName) {
    global $workspace_display_names, $labels, $con;
    
    // Check display_name from database first
    if (isset($workspace_display_names[$workspaceName]) && $workspace_display_names[$workspaceName] !== '' && $workspace_display_names[$workspaceName] !== null) {
        return $workspace_display_names[$workspaceName];
    }
    
    // Try to fetch from database if not in global
    if (!isset($workspace_display_names)) {
        try {
            $stmt = $con->prepare("SELECT display_name FROM workspaces WHERE name = ?");
            $stmt->execute([$workspaceName]);
            $displayName = $stmt->fetchColumn();
            if ($displayName !== false && $displayName !== null && $displayName !== '') {
                return $displayName;
            }
        } catch (Exception $e) {
            // ignore
        }
    }
    
    // Fall back to labels
    if (isset($labels[$workspaceName]) && $labels[$workspaceName] !== '') {
        return $labels[$workspaceName];
    }
    
    // Return the workspace name as-is
    return $workspaceName;
}
