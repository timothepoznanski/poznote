<?php
/**
 * API Endpoint: Note Content
 *
 * Returns the raw stored content of a note for a given note id.
 *
 * Method: GET
 * Parameters:
 *   - id: Note ID (required)
 *
 * Response (JSON):
 *   - success: boolean
 *   - id: number
 *   - type: string
 *   - content: string
 */

require_once 'auth.php';
requireApiAuth();

header('Content-Type: application/json; charset=utf-8');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use GET.']);
    exit;
}

$noteIdParam = $_GET['id'] ?? '';
$reference = $_GET['reference'] ?? null;
$workspace = $_GET['workspace'] ?? null;

if (($noteIdParam === '' || $noteIdParam === null) && ($reference === null || trim($reference) === '')) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing parameter: provide id or reference']);
    exit;
}

if ($noteIdParam !== '' && $noteIdParam !== null && !is_numeric($noteIdParam)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid parameter: id must be numeric']);
    exit;
}

$noteId = ($noteIdParam !== '' && $noteIdParam !== null) ? (int)$noteIdParam : null;

try {
    $row = null;

    // Helper: build optional workspace filter like other endpoints
    $useWorkspaceFilter = ($workspace !== null && $workspace !== '');

    if ($noteId !== null) {
        if ($useWorkspaceFilter) {
            $stmt = $con->prepare("SELECT id, heading, type, workspace FROM entries WHERE id = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$noteId, $workspace, $workspace]);
        } else {
            $stmt = $con->prepare('SELECT id, heading, type, workspace FROM entries WHERE id = ? AND trash = 0');
            $stmt->execute([$noteId]);
        }
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        $reference = trim((string)$reference);

        // For title-based lookup, strongly recommend providing workspace to avoid ambiguity.
        if (!$useWorkspaceFilter) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'workspace is required when using reference']);
            exit;
        }

        if (is_numeric($reference)) {
            $refId = (int)$reference;
            $stmt = $con->prepare("SELECT id, heading, type, workspace FROM entries WHERE id = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$refId, $workspace, $workspace]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        } else {
            $stmt = $con->prepare("SELECT id, heading, type, workspace FROM entries WHERE trash = 0 AND heading LIKE ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote')) ORDER BY updated DESC LIMIT 1");
            $stmt->execute(['%' . $reference . '%', $workspace, $workspace]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    }

    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note not found or has been deleted']);
        exit;
    }

    $noteType = !empty($row['type']) ? $row['type'] : 'note';
    $noteId = (int)$row['id'];
    $noteHeading = $row['heading'] ?? '';
    $noteWorkspace = $row['workspace'] ?? null;

    $filename = getEntryFilename($noteId, $noteType);
    $filePath = $filename;

    // Security: ensure the path is within the entries directory
    $realPath = realpath($filePath);
    $expectedDir = realpath(getEntriesPath());

    if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid file path']);
        exit;
    }

    if (!file_exists($filePath) || !is_readable($filePath)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note file not available']);
        exit;
    }

    $content = file_get_contents($filePath);
    if ($content === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cannot read note file']);
        exit;
    }

    echo json_encode(
        [
            'success' => true,
            'id' => $noteId,
            'heading' => $noteHeading,
            'workspace' => $noteWorkspace,
            'type' => $noteType,
            'content' => $content
        ],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
    exit;

} catch (Exception $e) {
    error_log('Error in api_note_content.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error occurred']);
    exit;
}
