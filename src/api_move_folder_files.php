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

$source_folder = $_POST['source_folder'] ?? '';
$target_folder = $_POST['target_folder'] ?? '';
$workspace = $_POST['workspace'] ?? 'Poznote';

if (empty($source_folder) || empty($target_folder)) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Source and target folders are required']);
    exit;
}

if ($source_folder === $target_folder) {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Source and target folders cannot be the same']);
    exit;
}

// Prevent moving files from Favorites folder
if ($source_folder === 'Favorites') {
    ob_clean();
    echo json_encode(['success' => false, 'error' => 'Cannot move files from Favorites folder']);
    exit;
}

try {
    // Start transaction
    $con->beginTransaction();
    
    // Get all notes in source folder (excluding trash)
    $sql = "SELECT id, heading FROM entries WHERE trash = 0 AND folder = ?";
    $params = [$source_folder];
    
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
    
    // Update all notes to move them to target folder
    $update_sql = "UPDATE entries SET folder = ?, updated = CURRENT_TIMESTAMP WHERE id = ?";
    $update_stmt = $con->prepare($update_sql);
    
    $moved_count = 0;
    foreach ($notes as $note) {
        if ($update_stmt->execute([$target_folder, $note['id']])) {
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
        'message' => "Successfully moved {$moved_count} files from '{$source_folder}' to '{$target_folder}'"
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
