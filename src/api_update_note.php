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

// Check if this is a beacon save
$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : null);
if ($action === 'beacon_save') {
    // Handle beacon save (minimal processing for reliability)
    $id = isset($_POST['note_id']) ? intval($_POST['note_id']) : 0;
    $content = isset($_POST['content']) ? $_POST['content'] : '';
    $workspace = isset($_POST['workspace']) && $_POST['workspace'] !== '' ? $_POST['workspace'] : null;
    
    if (empty($id) || empty($content)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid beacon save data']);
        exit;
    }
    
    // Get note type
    $typeStmt = $con->prepare("SELECT type FROM entries WHERE id = ?");
    $typeStmt->execute([$id]);
    $noteType = $typeStmt->fetchColumn();
    if ($noteType === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Note not found']);
        exit;
    }
    
    // Write file
    $filename = getEntryFilename($id, $noteType);
    $entriesDir = dirname($filename);
    if (!is_dir($entriesDir)) {
        mkdir($entriesDir, 0755, true);
    }
    $write_result = file_put_contents($filename, $content);
    if ($write_result === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write file']);
        exit;
    }
    
    // Update database
    $stmt = $con->prepare("UPDATE entries SET entry = ?, updated = datetime('now') WHERE id = ?");
    if ($stmt->execute([$content, $id])) {
        echo json_encode(['success' => true, 'id' => $id]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error']);
    }
    exit;
}

// Parse JSON body for regular saves
$input = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON in request body']);
    exit;
}

$id = isset($input['id']) ? intval($input['id']) : 0;
$originalHeading = isset($input['heading']) ? trim($input['heading']) : '';
$entry = isset($input['entry']) ? $input['entry'] : '';
$tags = isset($input['tags']) ? trim($input['tags']) : '';
$folder = isset($input['folder']) ? trim($input['folder']) : 'Poznote';
$workspace = isset($input['workspace']) && $input['workspace'] !== '' ? $input['workspace'] : null;

// Use the provided entry content for all note types
$entrycontent = $entry;

if (empty($id)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'id is required']);
    exit;
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

// Get the current note type to determine file extension
$typeStmt = $con->prepare("SELECT type FROM entries WHERE id = ?");
$typeStmt->execute([$id]);
$noteType = $typeStmt->fetchColumn();
if ($noteType === false) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Note not found']);
    exit;
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

// Ensure entry file path exists and write file with appropriate extension
$filename = getEntryFilename($id, $noteType);
$entriesDir = dirname($filename);
if (!is_dir($entriesDir)) {
    mkdir($entriesDir, 0755, true);
}
if (!empty($entry)) {
    // For markdown notes, ensure we save clean markdown content, not HTML
    $contentToSave = $entry;
    if ($noteType === 'markdown') {
        // If the entry contains HTML elements (like <div class="markdown-editor">), extract the text content
        if (strpos($entry, '<div class="markdown-editor"') !== false) {
            // Extract text from between the editor tags
            if (preg_match('/<div class="markdown-editor"[^>]*>(.*?)<\/div>/', $entry, $matches)) {
                $contentToSave = strip_tags($matches[1]);
                $contentToSave = html_entity_decode($contentToSave, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            } else {
                // Fallback: strip all HTML tags
                $contentToSave = strip_tags($entry);
                $contentToSave = html_entity_decode($contentToSave, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            }
        }
    }
    
    $write_result = file_put_contents($filename, $contentToSave);
    if ($write_result === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write file']);
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
