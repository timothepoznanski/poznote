<?php
require_once 'auth.php';
requireApiAuth();

require_once 'config.php';
require_once 'db_connect.php';

header('Content-Type: application/json');

try {
    // Get optional filters from query parameters
    $workspace = $_GET['workspace'] ?? null;
    $search = $_GET['search'] ?? null;
    
    // Base query - only trash notes
    $sql = "SELECT id, heading, subheading, tags, folder, workspace, type, updated, created 
            FROM entries WHERE trash = 1";
    
    $params = [];
    
    // Add workspace filter
    if ($workspace) {
        $sql .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $params[] = $workspace;
        $params[] = $workspace;
    }
    
    // Add search filter
    if ($search) {
        $sql .= " AND (heading LIKE ? OR subheading LIKE ? OR tags LIKE ?)";
        $searchTerm = "%$search%";
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
    }
    
    // Order by most recently updated
    $sql .= " ORDER BY updated DESC";
    
    // Execute query
    $stmt = $con->prepare($sql);
    $stmt->execute($params);
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get trash count
    $countSql = "SELECT COUNT(*) as total FROM entries WHERE trash = 1";
    $countParams = [];
    
    if ($workspace) {
        $countSql .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
        $countParams[] = $workspace;
        $countParams[] = $workspace;
    }
    
    $countStmt = $con->prepare($countSql);
    $countStmt->execute($countParams);
    $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];
    
    // Return response
    echo json_encode([
        'success' => true,
        'total' => (int)$total,
        'count' => count($notes),
        'notes' => $notes,
        'filters' => [
            'workspace' => $workspace,
            'search' => $search
        ]
    ], JSON_PRETTY_PRINT);
    
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
