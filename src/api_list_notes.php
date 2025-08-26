<?php
require 'auth.php';
requireApiAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

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
            echo json_encode(['success' => false, 'message' => 'Workspace not found']);
            exit;
        }
    }

    if ($get_folders) {
        // Return list of folders
        $folders = [];
        
        // Get folders from entries table
        $sql = "SELECT DISTINCT folder FROM entries WHERE trash = 0 AND folder IS NOT NULL AND folder != ''";
        $params = [];
        
        if ($workspace) {
            $sql .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $params[] = $workspace;
            $params[] = $workspace;
        }
        
        $sql .= " ORDER BY folder";
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if ($row['folder']) {
                $folders[] = $row['folder'];
            }
        }
        
        // Also get empty folders from folders table
        $sql = "SELECT name FROM folders";
        $params = [];
        
        if ($workspace) {
            $sql .= " WHERE (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
            $params[] = $workspace;
            $params[] = $workspace;
        }
        
        $sql .= " ORDER BY name";
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (!in_array($row['name'], $folders)) {
                $folders[] = $row['name'];
            }
        }
        
        // Add default folder name if not present
        if (!in_array('Default', $folders) && !in_array('Uncategorized', $folders)) {
            array_unshift($folders, 'Default');
        }
        
        sort($folders);
        
        echo json_encode(['success' => true, 'folders' => $folders]);
        exit;
    }

    // Get notes
    $sql = "SELECT id, heading, tags, folder, workspace, updated FROM entries WHERE trash = 0";
    $params = [];
    
    if ($workspace) {
        $sql .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $params[] = $workspace;
        $params[] = $workspace;
    }
    
    if ($folder) {
        $sql .= " AND folder = ?";
        $params[] = $folder;
    }
    
    $sql .= " ORDER BY folder, updated DESC";
    
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
