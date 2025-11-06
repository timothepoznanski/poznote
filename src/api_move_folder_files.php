<?php
require_once 'config.php';
require_once 'auth.php';
requireApiAuth();

require_once 'db_connect.php';

// Start output buffering to prevent any accidental output
ob_start();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_clean();
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$source_folder_id = isset($_POST['source_folder_id']) ? intval($_POST['source_folder_id']) : null;
$target_folder_id = isset($_POST['target_folder_id']) ? intval($_POST['target_folder_id']) : null;
$workspace = $_POST['workspace'] ?? 'Poznote';

if ($source_folder_id === null) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Source folder ID is required']);
    exit;
}

if ($target_folder_id === null) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Target folder ID is required']);
    exit;
}

// Verify both source and target exist
if ($source_folder_id === 0 || $target_folder_id === 0) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Invalid folder ID']);
    exit;
}

if ($source_folder_id === $target_folder_id) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Source and target folders cannot be the same']);
    exit;
}

try {
    // Start transaction
    $con->beginTransaction();
    
    // Verify source folder exists
    $folderStmt = $con->prepare("SELECT name FROM folders WHERE id = ?");
    $folderStmt->execute([$source_folder_id]);
    $sourceFolderData = $folderStmt->fetch(PDO::FETCH_ASSOC);
    if (!$sourceFolderData) {
        $con->rollBack();
        ob_clean();
        echo json_encode(['success' => false, 'error' => 'Source folder not found']);
        exit;
    }
    $source_folder_name = $sourceFolderData['name'];
    
    // Verify target folder exists AND belongs to the correct workspace
    $folderStmt = $con->prepare("SELECT name, workspace FROM folders WHERE id = ?");
    $folderStmt->execute([$target_folder_id]);
    $targetFolderData = $folderStmt->fetch(PDO::FETCH_ASSOC);
    if (!$targetFolderData) {
        $con->rollBack();
        ob_clean();
        error_log("Target folder ID $target_folder_id not found in folders table");
        echo json_encode(['success' => false, 'error' => 'Target folder not found (ID: ' . $target_folder_id . ')']);
        exit;
    }
    
    // Verify workspace match
    $targetWorkspace = $targetFolderData['workspace'] ?: 'Poznote';
    if ($targetWorkspace !== $workspace && !($targetWorkspace === null && $workspace === 'Poznote')) {
        $con->rollBack();
        ob_clean();
        error_log("Target folder ID $target_folder_id belongs to workspace '$targetWorkspace', not '$workspace'");
        echo json_encode(['success' => false, 'error' => 'Target folder belongs to a different workspace']);
        exit;
    }
    
    $target_folder_name = $targetFolderData['name'];
    
    // Get all notes in source folder (excluding trash)
    $sql = "SELECT id, heading, folder FROM entries WHERE trash = 0 AND folder_id = ?";
    $params = [$source_folder_id];
    
    // Apply workspace filter
    if (!empty($workspace)) {
        $sql .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $params[] = $workspace;
        $params[] = $workspace;
    }
    
    $stmt = $con->prepare($sql);
    $stmt->execute($params);
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($notes)) {
        $con->rollBack();
        ob_clean();
        echo json_encode(['success' => false, 'error' => 'No files found in source folder']);
        exit;
    }
    
    // Update all notes to move them to target folder (update both folder_id and folder name)
    $update_sql = "UPDATE entries SET folder_id = ?, folder = ?, updated = CURRENT_TIMESTAMP WHERE id = ?";
    $update_stmt = $con->prepare($update_sql);
    
    $moved_count = 0;
    foreach ($notes as $note) {
        if ($update_stmt->execute([$target_folder_id, $target_folder_name, $note['id']])) {
            $moved_count++;
        }
    }
    
    // Commit transaction
    $con->commit();
    
    // Clean output buffer and send JSON response
    ob_clean();
    echo json_encode([
        'success' => true, 
        'moved_count' => $moved_count,
        'message' => "Successfully moved {$moved_count} files from '{$source_folder_name}' to '{$target_folder_name}'"
    ]);

} catch (Exception $e) {
    // Rollback transaction on error
    $con->rollBack();
    error_log("Error moving folder files: " . $e->getMessage());
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Database error occurred: ' . $e->getMessage()]);
}

// End output buffering
ob_end_flush();
?>
