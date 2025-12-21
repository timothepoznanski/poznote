<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

$json = file_get_contents('php://input');
$data = json_decode($json, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

function resolvePathToId(PDO $con, string $workspace, string $folderPath): ?int {
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

try {
    $workspace = isset($data['workspace']) ? trim((string)$data['workspace']) : null;

    $folderId = isset($data['folder_id']) ? (int)$data['folder_id'] : null;
    $folderPath = isset($data['folder_path']) ? trim((string)$data['folder_path']) : null;

    $newParentId = array_key_exists('new_parent_folder_id', $data) ? (int)$data['new_parent_folder_id'] : null;
    $newParentPath = isset($data['new_parent_folder']) ? trim((string)$data['new_parent_folder']) : null;

    // Resolve the folder to move
    $folderRow = null;
    if ($folderId !== null && $folderId > 0) {
        $stmt = $con->prepare('SELECT id, name, workspace, parent_id FROM folders WHERE id = ?');
        $stmt->execute([$folderId]);
        $folderRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$folderRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Folder not found']);
            exit;
        }
        if ($workspace === null || $workspace === '') {
            $workspace = (string)$folderRow['workspace'];
        }
    } elseif ($folderPath !== null && $folderPath !== '') {
        if ($workspace === null || $workspace === '') {
            $workspace = 'Poznote';
        }
        $resolvedId = resolvePathToId($con, $workspace, $folderPath);
        if ($resolvedId === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Folder not found']);
            exit;
        }
        $folderId = $resolvedId;
        $stmt = $con->prepare('SELECT id, name, workspace, parent_id FROM folders WHERE id = ?');
        $stmt->execute([$folderId]);
        $folderRow = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'folder_id or folder_path is required']);
        exit;
    }

    // Validate workspace exists
    if ($workspace === null || $workspace === '') {
        $workspace = 'Poznote';
    }
    $wsStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
    $wsStmt->execute([$workspace]);
    if ((int)$wsStmt->fetchColumn() === 0) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Workspace not found']);
        exit;
    }

    // Resolve new parent (allow root)
    $targetParentId = null;
    if (isset($data['new_parent_folder_id'])) {
        if ($newParentId !== null && $newParentId > 0) {
            $pStmt = $con->prepare('SELECT id, workspace FROM folders WHERE id = ?');
            $pStmt->execute([$newParentId]);
            $pRow = $pStmt->fetch(PDO::FETCH_ASSOC);
            if (!$pRow) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'New parent folder not found']);
                exit;
            }
            if ((string)$pRow['workspace'] !== $workspace) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'New parent folder must be in the same workspace']);
                exit;
            }
            $targetParentId = (int)$pRow['id'];
        } else {
            $targetParentId = null;
        }
    } elseif ($newParentPath !== null && $newParentPath !== '') {
        $resolvedParent = resolvePathToId($con, $workspace, $newParentPath);
        if ($resolvedParent === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'New parent folder not found']);
            exit;
        }
        $targetParentId = $resolvedParent;
    } else {
        // If neither provided, treat as move to root
        $targetParentId = null;
    }

    $folderId = (int)$folderId;
    $folderName = (string)$folderRow['name'];

    if ($targetParentId !== null && $targetParentId === $folderId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Folder cannot be its own parent']);
        exit;
    }

    // Prevent cycles: new parent cannot be a descendant of folder
    if ($targetParentId !== null) {
        $cur = $targetParentId;
        $depth = 0;
        $maxDepth = 50;
        while ($cur !== null && $depth < $maxDepth) {
            if ($cur === $folderId) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Invalid move: would create a cycle']);
                exit;
            }
            $q = $con->prepare('SELECT parent_id FROM folders WHERE id = ?');
            $q->execute([$cur]);
            $curParent = $q->fetchColumn();
            $cur = ($curParent !== null) ? (int)$curParent : null;
            $depth++;
        }
    }

    // Uniqueness check under target parent
    if ($targetParentId === null) {
        $cStmt = $con->prepare('SELECT COUNT(*) FROM folders WHERE workspace = ? AND parent_id IS NULL AND name = ? AND id != ?');
        $cStmt->execute([$workspace, $folderName, $folderId]);
    } else {
        $cStmt = $con->prepare('SELECT COUNT(*) FROM folders WHERE workspace = ? AND parent_id = ? AND name = ? AND id != ?');
        $cStmt->execute([$workspace, $targetParentId, $folderName, $folderId]);
    }

    if ((int)$cStmt->fetchColumn() > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'A folder with this name already exists in the destination']);
        exit;
    }

    $uStmt = $con->prepare('UPDATE folders SET parent_id = ? WHERE id = ?');
    $uStmt->execute([$targetParentId, $folderId]);

    // Compute updated path
    $stmt = $con->prepare('SELECT id, name, parent_id FROM folders WHERE workspace = ?');
    $stmt->execute([$workspace]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $byId = [];
    foreach ($rows as $r) {
        $id = (int)$r['id'];
        $byId[$id] = [
            'id' => $id,
            'name' => (string)$r['name'],
            'parent_id' => $r['parent_id'] !== null ? (int)$r['parent_id'] : null,
        ];
    }

    $pathCache = [];
    $computePath = function($id) use (&$computePath, &$pathCache, &$byId) {
        if (isset($pathCache[$id])) return $pathCache[$id];
        if (!isset($byId[$id])) return null;

        $parts = [];
        $cur = $id;
        $depth = 0;
        $maxDepth = 50;
        while ($cur !== null && $depth < $maxDepth) {
            if (!isset($byId[$cur])) break;
            array_unshift($parts, $byId[$cur]['name']);
            $cur = $byId[$cur]['parent_id'];
            $depth++;
        }
        $pathCache[$id] = implode('/', $parts);
        return $pathCache[$id];
    };

    echo json_encode([
        'success' => true,
        'message' => 'Folder moved successfully',
        'folder' => [
            'id' => $folderId,
            'name' => $folderName,
            'workspace' => $workspace,
            'parent_id' => $targetParentId,
            'path' => $computePath($folderId),
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
