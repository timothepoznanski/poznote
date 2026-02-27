<?php
/**
 * Calendar API - Notes on Specific Date
 *
 * Returns all notes created on a specific date
 * Used by the mini calendar component to open notes from a selected day
 */

// Authentication check
require_once __DIR__ . '/../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../db_connect.php';
require_once __DIR__ . '/../../../functions.php';

header('Content-Type: application/json');

try {
    // Get the date parameter
    $date = $_GET['date'] ?? '';

    if (empty($date)) {
        http_response_code(400);
        echo json_encode(['error' => 'Date parameter is required']);
        exit;
    }

    // Validate date format (YYYY-MM-DD)
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid date format. Use YYYY-MM-DD']);
        exit;
    }

    // Get workspace filter from query params (optional)
    $workspace_filter = $_GET['workspace'] ?? '';

    // Build query to get notes created on this date
    $query = "
        SELECT id, heading
        FROM entries
        WHERE DATE(created) = ?
        AND trash = 0
    ";

    $params = [$date];

    // Filter by workspace if specified
    if (!empty($workspace_filter)) {
        $query .= " AND workspace = ?";
        $params[] = $workspace_filter;
    }

    $query .= " ORDER BY created ASC";

    $stmt = $con->prepare($query);
    $stmt->execute($params);

    $notes = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $notes[] = [
            'id' => $row['id'],
            'title' => $row['heading'] ?: 'Untitled'
        ];
    }

    echo json_encode($notes);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to fetch notes',
        'message' => $e->getMessage()
    ]);
}
