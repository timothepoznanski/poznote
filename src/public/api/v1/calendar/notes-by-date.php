<?php
/**
 * Calendar API - Notes by Date
 *
 * Returns the number of notes created (or, with mode=modified, last
 * modified) on each date, days being taken in the user's timezone
 * Used by the mini calendar component to show dots for days with notes
 */

// Authentication check
require_once __DIR__ . '/../../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../../db_connect.php';
require_once __DIR__ . '/../../../../functions.php';

header('Content-Type: application/json');

try {
    // Get workspace filter from query params (optional)
    $workspace_filter = $_GET['workspace'] ?? '';

    // Created (default) or last modified. Notes never saved since their
    // creation have no updated value, so they fall back to created.
    $column = ($_GET['mode'] ?? '') === 'modified' ? 'COALESCE(updated, created)' : 'created';

    $query = "
        SELECT $column AS ts
        FROM entries
        WHERE trash = 0
    ";

    $params = [];

    // Filter by workspace if specified
    if (!empty($workspace_filter)) {
        $query .= " AND workspace = ?";
        $params[] = $workspace_filter;
    }

    $stmt = $con->prepare($query);
    $stmt->execute($params);

    // Timestamps are stored in UTC, so they are grouped here rather than
    // with DATE(): a note saved at 00:30 in Paris belongs to that day, not
    // to the UTC day before.
    $utc = new DateTimeZone('UTC');
    $userTz = new DateTimeZone(getUserTimezone());
    $results = [];
    while (($ts = $stmt->fetchColumn()) !== false) {
        if (empty($ts)) continue;
        try {
            $day = (new DateTime($ts, $utc))->setTimezone($userTz)->format('Y-m-d');
        } catch (Exception $e) {
            continue;
        }
        $results[$day] = ($results[$day] ?? 0) + 1;
    }

    echo json_encode($results);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to fetch calendar data',
        'message' => $e->getMessage()
    ]);
}
