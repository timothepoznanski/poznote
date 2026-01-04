<?php
require_once 'auth.php';
requireApiAuth();

require_once 'config.php';
require_once 'db_connect.php';

header('Content-Type: application/json');

try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Also support POST data
    if (!$input) {
        $input = $_POST;
    }
    
    $id = $input['id'] ?? null;
    $workspace = $input['workspace'] ?? null;
    
    if (!$id) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Note ID is required'
        ]);
        exit;
    }
    
    // Check if note exists and is in trash
    $checkSql = "SELECT id, heading, trash FROM entries WHERE id = ?";
    $checkParams = [$id];
    
    if ($workspace) {
        $checkSql .= " AND workspace = ?";
        $checkParams[] = $workspace;
    }
    
    $checkStmt = $con->prepare($checkSql);
    $checkStmt->execute($checkParams);
    $note = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'Note not found'
        ]);
        exit;
    }
    
    if ($note['trash'] == 0) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Note is not in trash'
        ]);
        exit;
    }
    
    // Restore note (set trash = 0)
    $updateSql = "UPDATE entries SET trash = 0 WHERE id = ?";
    $updateParams = [$id];
    
    if ($workspace) {
        $updateSql .= " AND workspace = ?";
        $updateParams[] = $workspace;
    }
    
    $updateStmt = $con->prepare($updateSql);
    $result = $updateStmt->execute($updateParams);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'message' => 'Note restored successfully',
            'note_id' => (int)$id,
            'note_heading' => $note['heading']
        ], JSON_PRETTY_PRINT);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Failed to restore note'
        ]);
    }
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
