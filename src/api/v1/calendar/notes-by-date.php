<?php
/**
 * Calendar API - Notes by Date
 *
 * Returns the number of notes created on each date
 * Used by the mini calendar component to show dots for days with notes
 */

// Authentication check
require_once __DIR__ . '/../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../db_connect.php';
require_once __DIR__ . '/../../../functions.php';

header('Content-Type: application/json');

try {
    // Get workspace filter from query params (optional)
    $workspace_filter = $_GET['workspace'] ?? '';

    // Build query to get notes grouped by creation date
    $query = "
        SELECT
            DATE(created) as date,
            COUNT(*) as count
        FROM entries
        WHERE trash = 0
    ";

    $params = [];

    // Filter by workspace if specified
    if (!empty($workspace_filter)) {
        $query .= " AND workspace = ?";
        $params[] = $workspace_filter;
    }

    $query .= " GROUP BY DATE(created)";

    $stmt = $con->prepare($query);
    $stmt->execute($params);

    $results = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $results[$row['date']] = (int)$row['count'];
    }

    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to fetch calendar data',
        'message' => $e->getMessage()
    ]);
}
