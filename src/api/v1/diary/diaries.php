<?php
/**
 * Diary API - list and create diaries
 *
 * A diary is a root folder flagged is_diary in its workspace. GET returns the
 * workspace's diaries in display order. POST creates a new diary: it flags an
 * existing root folder with that name, or creates the folder first. Diaries
 * are renamed/deleted through the regular folder operations.
 */

require_once __DIR__ . '/../../../auth.php';
requireAuth();

require_once __DIR__ . '/../../../db_connect.php';
require_once __DIR__ . '/../../../functions.php';

header('Content-Type: application/json');

function diariesApiWorkspace(PDO $con, string $requested): ?string {
    $requested = trim($requested);
    if ($requested === '') {
        return getFirstWorkspaceName();
    }
    $stmt = $con->prepare("SELECT 1 FROM workspaces WHERE name = ?");
    $stmt->execute([$requested]);
    return $stmt->fetchColumn() !== false ? $requested : null;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $workspace = diariesApiWorkspace($con, $_GET['workspace'] ?? '');
        if ($workspace === null) {
            http_response_code(404);
            echo json_encode(['error' => 'Workspace not found']);
            exit;
        }
        echo json_encode(['diaries' => getDiaryRoots($con, $workspace)]);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) $input = [];

    $workspace = diariesApiWorkspace($con, (string)($input['workspace'] ?? ''));
    if ($workspace === null) {
        http_response_code(404);
        echo json_encode(['error' => 'Workspace not found']);
        exit;
    }

    // Same rules as FoldersController::validateFolderSegment
    $name = trim((string)($input['name'] ?? ''));
    $error = null;
    if ($name === '') {
        $error = 'Diary name is required';
    } elseif (strlen($name) > 255) {
        $error = 'Diary name too long (max 255 characters)';
    } elseif ($name === '.' || $name === '..') {
        $error = 'Invalid diary name';
    } elseif (in_array($name, ['Favorites', 'Tags', 'Trash', 'Public'], true)) {
        $error = 'Cannot use a reserved folder name: ' . $name;
    } else {
        foreach (['/', '\\', ':', '*', '?', '"', '<', '>', '|'] as $char) {
            if (strpos($name, $char) !== false) {
                $error = 'Diary name contains forbidden character: ' . $char;
                break;
            }
        }
    }
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        exit;
    }

    // Flagging existing diary roots first keeps the legacy name-matched
    // journal from being reported as a plain folder below.
    getDiaryRoots($con, $workspace);

    $stmt = $con->prepare("SELECT id, is_diary FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL");
    $stmt->execute([$name, $workspace]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existing && (int)$existing['is_diary'] === 1) {
        http_response_code(409);
        echo json_encode(['error' => 'A diary with this name already exists', 'code' => 'diary_exists']);
        exit;
    }

    if ($existing) {
        // Turn the existing root folder into a diary; its notes stay in place.
        $con->prepare("UPDATE folders SET is_diary = 1 WHERE id = ?")->execute([(int)$existing['id']]);
        $diaryId = (int)$existing['id'];
        $converted = true;
    } else {
        $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, is_diary, created) VALUES (?, ?, NULL, 1, datetime('now'))");
        $stmt->execute([$name, $workspace]);
        $diaryId = (int)$con->lastInsertId();
        $converted = false;
    }

    echo json_encode([
        'success'   => true,
        'converted' => $converted,
        'diary'     => ['id' => $diaryId, 'name' => $name],
        'workspace' => $workspace
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to process diary request', 'message' => $e->getMessage()]);
}
