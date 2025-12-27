<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

/**
 * Resolve a folder path (e.g., "Projects/2024") to a folder id.
 * Returns null if not found.
 */
function resolveFolderPathToId(PDO $con, string $workspace, string $folderPath): ?int {
    $folderPath = trim($folderPath);
    if ($folderPath === '') return null;

    $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
    if (empty($segments)) return null;

    $parentId = null;
    foreach ($segments as $seg) {
        $stmt = $con->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS ?');
        $stmt->execute([$seg, $workspace, $parentId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;
        $parentId = (int)$row['id'];
    }

    return $parentId;
}

/**
 * Validate a single folder segment (not a path).
 */
function validateFolderSegment(string $segment): ?string {
    $segment = trim($segment);
    if ($segment === '') return 'Folder name is required';
    if (strlen($segment) > 255) return 'Folder name too long (max 255 characters)';

    // Forbidden characters in folder names (segments)
    $forbidden = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    foreach ($forbidden as $char) {
        if (strpos($segment, $char) !== false) {
            return "Folder name contains forbidden character: $char";
        }
    }

    // Prevent creating folders with reserved system names
    $reserved = ['Favorites', 'Tags', 'Trash', 'Public'];
    if (in_array($segment, $reserved, true)) {
        return 'Cannot create folder with reserved name: ' . $segment;
    }

    // Basic path traversal protection
    if ($segment === '.' || $segment === '..') {
        return 'Invalid folder name';
    }

    return null;
}

// Verify HTTP method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

// Read JSON data
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Inputs
$workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : getFirstWorkspaceName();
$folder_path = isset($data['folder_path']) ? trim((string)$data['folder_path']) : null;
$create_parents = isset($data['create_parents']) ? (bool)$data['create_parents'] : false;

$folder_name = isset($data['folder_name']) ? trim((string)$data['folder_name']) : null;
$parent_folder = isset($data['parent_folder']) ? trim((string)$data['parent_folder']) : null;
$parent_folder_id = isset($data['parent_folder_id']) ? (int)$data['parent_folder_id'] : null;

// Require either folder_path OR folder_name
if (($folder_path === null || $folder_path === '') && ($folder_name === null || $folder_name === '')) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'folder_name or folder_path is required']);
    exit;
}

// If folder_path provided, ignore folder_name/parent_* and create using the path
if ($folder_path !== null && $folder_path !== '') {
    // normalize: strip leading/trailing slashes
    $folder_path = trim($folder_path, "/ \t\n\r\0\x0B");
}

// If folder_name provided, validate it as a segment
if ($folder_path === null || $folder_path === '') {
    $err = validateFolderSegment((string)$folder_name);
    if ($err !== null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $err]);
        exit;
    }
}

try {
    // Validate workspace exists
    if ($workspace !== '') {
        $wsStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
        $wsStmt->execute([$workspace]);
        if ((int)$wsStmt->fetchColumn() === 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Workspace not found']);
            exit;
        }
    }

    $createdParents = [];

    // Path-based creation
    if ($folder_path !== null && $folder_path !== '') {
        $segments = array_values(array_filter(array_map('trim', explode('/', $folder_path)), fn($s) => $s !== ''));
        if (empty($segments)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid folder_path']);
            exit;
        }

        $parentId = null;
        $finalFolderId = null;
        $finalName = null;
        $finalWasCreated = false;

        foreach ($segments as $idx => $seg) {
            $err = validateFolderSegment($seg);
            if ($err !== null) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => $err]);
                exit;
            }

            $isLast = ($idx === count($segments) - 1);

            // Does this segment already exist under current parent?
            $findStmt = $con->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS ?');
            $findStmt->execute([$seg, $workspace, $parentId]);
            $existing = $findStmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                if ($isLast) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'Folder already exists', 'folder' => ['id' => (int)$existing['id']]]);
                    exit;
                }
                $parentId = (int)$existing['id'];
                continue;
            }

            if (!$create_parents && !$isLast) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Parent folder does not exist', 'missing_segment' => $seg]);
                exit;
            }

            // ok to create last, always

            // Create the segment folder
            $insertStmt = $con->prepare('INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime(\'now\'))');
            $ok = $insertStmt->execute([$seg, $workspace, $parentId]);
            if (!$ok) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to insert folder']);
                exit;
            }
            $newId = (int)$con->lastInsertId();
            if (!$isLast) {
                $createdParents[] = ['id' => $newId, 'name' => $seg, 'parent_id' => $parentId];
            }
            if ($isLast) {
                $finalWasCreated = true;
            }

            $parentId = $newId;
            $finalFolderId = $newId;
            $finalName = $seg;
        }

        if (!$finalWasCreated) {
            // Defensive: should never happen because existing finals are handled above
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'Folder already exists']);
            exit;
        }

        $folder_id = $finalFolderId;
        $folder_name = $finalName;
        $parent_folder_id = null;
        // Re-fetch parent_id for response
        $pStmt = $con->prepare('SELECT parent_id FROM folders WHERE id = ?');
        $pStmt->execute([$folder_id]);
        $parent_folder_id = $pStmt->fetchColumn();

        $path = function_exists('getFolderPath') ? getFolderPath($folder_id, $con) : $folder_path;

        echo json_encode([
            'success' => true,
            'message' => 'Folder created successfully',
            'folder' => [
                'id' => $folder_id,
                'name' => $folder_name,
                'workspace' => $workspace,
                'parent_id' => $parent_folder_id,
                'path' => $path
            ],
            'created_parents' => $createdParents
        ]);
        exit;
    }

    // Name + parent creation
    $parentId = null;
    if ($parent_folder_id !== null && $parent_folder_id > 0) {
        $checkParent = $con->prepare('SELECT id FROM folders WHERE id = ? AND workspace = ?');
        $checkParent->execute([$parent_folder_id, $workspace]);
        if (!$checkParent->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Parent folder not found']);
            exit;
        }
        $parentId = $parent_folder_id;
    } elseif ($parent_folder !== null && $parent_folder !== '') {
        $resolvedParent = resolveFolderPathToId($con, $workspace, $parent_folder);
        if ($resolvedParent === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Parent folder not found']);
            exit;
        }
        $parentId = $resolvedParent;
    }

    // Check if folder already exists under the same parent
    if ($parentId === null) {
        $checkStmt = $con->prepare('SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL');
        $checkStmt->execute([$folder_name, $workspace]);
    } else {
        $checkStmt = $con->prepare('SELECT COUNT(*) FROM folders WHERE name = ? AND workspace = ? AND parent_id = ?');
        $checkStmt->execute([$folder_name, $workspace, $parentId]);
    }
    $count = (int)$checkStmt->fetchColumn();
    if ($count > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'A folder with this name already exists in this location']);
        exit;
    }

    // Create folder in database
    $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
    $result = $stmt->execute([$folder_name, $workspace, $parentId]);
    
    if (!$result) {
        echo json_encode(['success' => false, 'error' => 'Failed to insert folder']);
        exit;
    }
    
    $folder_id = $con->lastInsertId();

    $path = function_exists('getFolderPath') ? getFolderPath((int)$folder_id, $con) : (string)$folder_name;
    
    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder' => [
            'id' => $folder_id,
            'name' => $folder_name,
            'workspace' => $workspace,
            'parent_id' => $parentId,
            'path' => $path
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
?>
