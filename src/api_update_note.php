<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'default_folder_settings.php';

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Parse JSON body
$input = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

$id = isset($input['id']) ? trim($input['id']) : '';
$originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
$entry = isset($input['entry']) ? $input['entry'] : '';
$entrycontent = isset($input['entrycontent']) ? $input['entrycontent'] : '';
$workspace = isset($input['workspace']) ? trim($input['workspace']) : null;
$folder = isset($input['folder']) ? trim($input['folder']) : getDefaultFolderForNewNotes($workspace);
$tags = isset($input['tags']) ? trim($input['tags']) : '';

if (empty($id)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'id is required']);
    exit;
}

// Protection: Prevent modification of the special "THINGS TO KNOW BEFORE TESTING" note
// Check both the new title and the current title in the database
if ($originalHeading === 'THINGS TO KNOW BEFORE TESTING') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'This note is protected and cannot be modified']);
    exit;
}

// Also check the current title in the database
try {
    $currentStmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
    $currentStmt->execute([$id]);
    $currentHeading = $currentStmt->fetchColumn();
    if ($currentHeading === 'THINGS TO KNOW BEFORE TESTING') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'This note is protected and cannot be modified']);
        exit;
    }
} catch (Exception $e) {
    // Continue if we can't check current heading
}

if ($originalHeading === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'heading is required']);
    exit;
}

// Validate workspace if provided
if (!empty($workspace)) {
    $wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
    $wsStmt->execute([$workspace]);
    if ($wsStmt->fetchColumn() == 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Workspace not found']);
        exit;
    }
}

// Validate folder existence for non-default folders
if (!isDefaultFolder($folder, $workspace)) {
    if ($workspace) {
        $fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $fStmt->execute([$folder, $workspace, $workspace]);
    } else {
        $fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
        $fStmt->execute([$folder]);
    }
    $folderExists = $fStmt->fetchColumn() > 0;
    if (!$folderExists) {
        if ($workspace) {
            $eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $eStmt->execute([$folder, $workspace, $workspace]);
        } else {
            $eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
            $eStmt->execute([$folder]);
        }
        $folderExists = $eStmt->fetchColumn() > 0;
    }
    if (!$folderExists) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Folder not found']);
        exit;
    }
}

// Validate tags format
if (!empty($tags)) {
    $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
    $validTags = [];
    foreach ($tagsArray as $tag) {
        if (!empty($tag)) {
            $tag = str_replace(' ', '_', $tag);
            $validTags[] = $tag;
        }
    }
    $tags = implode(',', $validTags);
}

// Enforce uniqueness of heading within workspace (exclude current id)
$checkQuery = "SELECT id FROM entries WHERE heading = ? AND trash = 0";
$params = [$originalHeading];
if ($workspace !== null) {
    $checkQuery .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
    $params[] = $workspace;
    $params[] = $workspace;
}
$checkQuery .= " AND id != ?";
$params[] = $id;
$checkStmt = $con->prepare($checkQuery);
$checkStmt->execute($params);
$conflictId = $checkStmt->fetchColumn();
if ($conflictId !== false && $conflictId !== null && $conflictId != 0) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Another note with the same title exists in this workspace']);
    exit;
}

// Ensure entry file path exists and write HTML if provided
$filename = getEntriesRelativePath() . $id . ".html";
$entriesDir = dirname($filename);
if (!is_dir($entriesDir)) {
    mkdir($entriesDir, 0755, true);
}
if (!empty($entry)) {
    $write_result = file_put_contents($filename, $entry);
    if ($write_result === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write HTML file']);
        exit;
    }
}

// Prepare update query
if ($workspace !== null) {
    $query = "UPDATE entries SET heading = ?, entry = ?, updated = datetime('now'), tags = ?, folder = ?, workspace = ?, entry = ? WHERE id = ?";
    // Note: entrycontent saved into 'entry' column for compatibility with other APIs
    $stmt = $con->prepare("UPDATE entries SET heading = ?, entry = ?, tags = ?, folder = ?, workspace = ?, updated = datetime('now') WHERE id = ?");
    $executeParams = [$originalHeading, $entrycontent, $tags, $folder, $workspace, $id];
} else {
    $stmt = $con->prepare("UPDATE entries SET heading = ?, entry = ?, tags = ?, folder = ?, updated = datetime('now') WHERE id = ?");
    $executeParams = [$originalHeading, $entrycontent, $tags, $folder, $id];
}

try {
    if ($stmt->execute($executeParams)) {
        echo json_encode(['success' => true, 'id' => $id, 'title' => $originalHeading]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error while updating note']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database exception: ' . $e->getMessage()]);
}

?>
