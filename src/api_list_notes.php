<?php
require 'auth.php';
requireApiAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

$workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? null;
$folder = $_GET['folder'] ?? $_POST['folder'] ?? null;
$get_folders = $_GET['get_folders'] ?? $_POST['get_folders'] ?? null;

try {
    // If a workspace parameter is provided, ensure it exists in the workspaces table.
    if ($workspace) {
        $chk = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
        $chk->execute([$workspace]);
        if ((int)$chk->fetchColumn() === 0) {
            // Special-case: map 'Poznote' if requested even when absent in table (db_connect ensures default exists),
            // otherwise return an explicit error for unknown workspace.
            echo json_encode(['success' => false, 'message' => t('api.errors.workspace_not_found', [], 'Workspace not found')]);
            exit;
        }
    }

    if ($get_folders) {
        // Return list of folders with IDs and full paths
        $folders = [];
        
        // Get folders from folders table (primary source) with parent_id
        $sql = "SELECT id, name, parent_id FROM folders";
        $params = [];
        
        if ($workspace) {
            $sql .= " WHERE workspace = ?";
            $params[] = $workspace;
        }
        
        $sql .= " ORDER BY name";
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        
        $folderData = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $folderId = (int)$row['id'];
            $folderData[$folderId] = [
                'id' => $folderId,
                'name' => $row['name'],
                'parent_id' => $row['parent_id'] ? (int)$row['parent_id'] : null
            ];
        }
        
        // Build folder paths recursively
        function buildFolderPathFromArray($folderId, $folderData) {
            if (!isset($folderData[$folderId])) {
                return '';
            }
            $folder = $folderData[$folderId];
            if ($folder['parent_id']) {
                $parentPath = buildFolderPathFromArray($folder['parent_id'], $folderData);
                return $parentPath . '/' . $folder['name'];
            }
            return $folder['name'];
        }
        
        // Add path to each folder
        foreach ($folderData as $folderId => $folder) {
            $folders[$folderId] = [
                'id' => $folderId,
                'name' => $folder['name'],
                'path' => buildFolderPathFromArray($folderId, $folderData)
            ];
        }
        
        echo json_encode(['success' => true, 'folders' => $folders], JSON_FORCE_OBJECT);
        exit;
    }

    // Get notes
    $sql = "SELECT id, heading, tags, folder, folder_id, workspace, updated, created FROM entries WHERE trash = 0";
    $params = [];
    
    if ($workspace) {
        $sql .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    if ($folder) {
        $sql .= " AND folder = ?";
        $params[] = $folder;
    }
    
    // Sorting: accept explicit 'sort' parameter (GET or POST) but map to safe clauses
    $sort = $_GET['sort'] ?? $_POST['sort'] ?? null;
    
    // Whitelist allowed values
    // For updated_desc and created_desc, notes without folder should appear first, then grouped by folder, then sorted by date
    $allowed = [
        'updated_desc' => 'CASE WHEN folder_id IS NULL THEN 0 ELSE 1 END, folder, updated DESC',
        'created_desc' => 'CASE WHEN folder_id IS NULL THEN 0 ELSE 1 END, folder, created DESC',
        'heading_asc'  => 'folder, heading COLLATE NOCASE ASC'
    ];
    
    // Default order (use updated_desc logic as default)
    $order_by = $allowed['updated_desc'];

    if ($sort && isset($allowed[$sort])) {
        $order_by = $allowed[$sort];
    } else if (!$sort) {
        // If no explicit sort provided, try loading saved preference from settings table
        try {
            $stmtPref = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmtPref->execute(['note_list_sort']);
            $pref = $stmtPref->fetchColumn();
            if ($pref && isset($allowed[$pref])) {
                $order_by = $allowed[$pref];
            }
        } catch (Exception $e) {
            // ignore preference load errors, keep default
        }
    }

    $sql .= " ORDER BY " . $order_by;
    
    $stmt = $con->prepare($sql);
    $stmt->execute($params);
    
    $notes = array();
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $notes[] = $row;
    }

    echo json_encode(['success' => true, 'notes' => $notes]);

} catch (Exception $e) {
    error_log("Error in api_list_notes.php: " . $e->getMessage());
    echo json_encode(['success' => false, 'error' => 'Database error occurred']);
}

?>
