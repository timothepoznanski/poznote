<?php
/**
 * Import note files dropped onto the notes sidebar (drag & drop import).
 *
 * Reuses the same import pipeline as Settings > Import, but is session
 * authenticated and returns JSON so it can be called from the main note view.
 */
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'import_helpers.php';

header('Content-Type: application/json');

// Public (read-only) workspaces must never be able to create notes.
denyPublicWorkspaceWriteAccess();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (empty($_FILES['files']) || empty($_FILES['files']['name'][0])) {
    echo json_encode([
        'success' => false,
        'error' => t('restore_import.errors.no_notes_selected_or_upload', [], 'No files were received.')
    ]);
    exit;
}

// Resolve the destination workspace. Fall back to the first one if unset.
$workspace = trim((string)($_POST['workspace'] ?? ''));
if ($workspace === '') {
    $workspace = trim((string)getWorkspaceFilter());
}
if ($workspace === '') {
    $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
    $workspace = (string)$wsStmt->fetchColumn();
}

// Destination folder: the folder the files were dropped on, when given.
// An empty value means "root level" (no folder).
$folder = null;
$folderId = isset($_POST['folder_id']) && $_POST['folder_id'] !== '' ? (int)$_POST['folder_id'] : null;
if ($folderId) {
    $fStmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND workspace = ?");
    $fStmt->execute([$folderId, $workspace]);
    $folderName = $fStmt->fetchColumn();
    if ($folderName !== false) {
        $folder = (string)$folderName;
    }
}

// Notes cannot be imported into these virtual/system folders.
$systemFolders = ['Favorites', 'Tags', 'Trash', 'Public'];
if ($folder !== null && in_array($folder, $systemFolders, true)) {
    echo json_encode([
        'success' => false,
        'error' => t(
            'restore_import.drag_drop.errors.system_folder',
            ['folder' => $folder],
            'Notes cannot be imported into the "{{folder}}" folder.'
        )
    ]);
    exit;
}

try {
    $isZip = count($_FILES['files']['name']) === 1
        && preg_match('/\.zip$/i', (string)$_FILES['files']['name'][0]);

    if ($isZip) {
        $singleZipFile = [
            'name' => $_FILES['files']['name'][0],
            'type' => $_FILES['files']['type'][0],
            'tmp_name' => $_FILES['files']['tmp_name'][0],
            'error' => $_FILES['files']['error'][0],
            'size' => $_FILES['files']['size'][0]
        ];
        $result = importIndividualNotesZip($singleZipFile, $workspace, $folder);
    } else {
        $result = importIndividualNotes($_FILES['files'], $workspace, $folder);
    }

    echo json_encode([
        'success' => !empty($result['success']),
        'message' => $result['message'] ?? '',
        'error' => $result['error'] ?? ''
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
