<?php
/**
 * Calendar API - Diary entry lookup for a specific date
 *
 * Returns the diary entry (note titled YYYY-MM-DD inside the diary subtree)
 * for the requested date, plus the folder path and workspace to use when the
 * entry does not exist yet. Used by the mini calendar day popup to offer an
 * "open or create diary entry" action.
 */

// Authentication check
require_once __DIR__ . '/../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../db_connect.php';
require_once __DIR__ . '/../../../functions.php';

header('Content-Type: application/json');

try {
    $date = $_GET['date'] ?? '';

    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid date format. Use YYYY-MM-DD']);
        exit;
    }

    // Same fallback as diary.php: creation must always land in a real workspace.
    $workspace = trim($_GET['workspace'] ?? '');
    if ($workspace === '') {
        $workspace = getFirstWorkspaceName();
    }

    $entryId = findDiaryEntryIdForDate($con, $workspace, $date);

    echo json_encode([
        'exists'    => $entryId !== null,
        'id'        => $entryId,
        'folder'    => getDiaryRootFolderName($con, $workspace) . '/' . $m[1] . '/' . $m[2],
        'workspace' => $workspace
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to fetch diary entry',
        'message' => $e->getMessage()
    ]);
}
