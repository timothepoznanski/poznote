<?php
/**
 * Calendar API - Diary entry lookup for a specific date
 *
 * Returns the diary entry (the dated note inside the diary subtree) for the
 * requested date, plus the folder path, workspace, note type and the title to
 * use when the entry does not exist yet. The `date` parameter is always
 * YYYY-MM-DD; `title` carries it in the configured diary date format. Used by
 * the mini calendar day popup to offer an "open or create diary entry" action.
 *
 * With several diaries in the workspace, the `diaries` array lists the entry
 * status of each one; the top-level fields describe the diary selected with
 * the optional `diary` parameter (root folder id), defaulting to the first.
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

    $noteType = getDiaryDefaultNoteType();
    // Title to create the entry with, in the configured diary date format.
    $entryTitle = formatDiaryEntryTitle($date);
    $diaries = [];
    foreach (getDiaryRoots($con, $workspace) as $root) {
        $entryId = findDiaryEntryIdForDate($con, $workspace, $date, $root['id']);
        $diaries[] = [
            'id'        => $root['id'],
            'name'      => $root['name'],
            'exists'    => $entryId !== null,
            'noteId'    => $entryId,
            'folder'    => $root['name'] . '/' . $m[1] . '/' . $m[2],
            'workspace' => $workspace,
            'noteType'  => $noteType,
            'title'     => $entryTitle
        ];
    }
    if (empty($diaries)) {
        // No diary yet: describe the default one so the client can create it.
        $defaultName = getDiaryRootFolderName($con, $workspace);
        $diaries[] = [
            'id'        => null,
            'name'      => $defaultName,
            'exists'    => false,
            'noteId'    => null,
            'folder'    => $defaultName . '/' . $m[1] . '/' . $m[2],
            'workspace' => $workspace,
            'noteType'  => $noteType,
            'title'     => $entryTitle
        ];
    }

    $selected = $diaries[0];
    $diaryParam = isset($_GET['diary']) ? (int)$_GET['diary'] : 0;
    if ($diaryParam > 0) {
        foreach ($diaries as $d) {
            if ($d['id'] === $diaryParam) { $selected = $d; break; }
        }
    }

    echo json_encode([
        'exists'    => $selected['exists'],
        'id'        => $selected['noteId'],
        'folder'    => $selected['folder'],
        'workspace' => $workspace,
        'noteType'  => $noteType,
        'title'     => $entryTitle,
        'diaries'   => $diaries
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Failed to fetch diary entry',
        'message' => $e->getMessage()
    ]);
}
