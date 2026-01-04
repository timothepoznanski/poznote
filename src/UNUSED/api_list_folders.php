<?php
require 'auth.php';
requireApiAuth();

header('Content-Type: application/json');
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use GET.']);
    exit;
}

$workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : getFirstWorkspaceName();
$includeHierarchy = isset($_GET['include_hierarchy']) && (string)$_GET['include_hierarchy'] !== ''
    ? filter_var($_GET['include_hierarchy'], FILTER_VALIDATE_BOOLEAN)
    : false;

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

    $stmt = $con->prepare('SELECT id, name, parent_id, created FROM folders WHERE workspace = ?');
    $stmt->execute([$workspace]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $foldersById = [];
    foreach ($rows as $r) {
        $id = (int)$r['id'];
        $foldersById[$id] = [
            'id' => $id,
            'name' => (string)$r['name'],
            'parent_id' => $r['parent_id'] !== null ? (int)$r['parent_id'] : null,
            'created' => $r['created'],
        ];
    }

    // Compute paths with memoization
    $pathCache = [];
    $computePath = function($id) use (&$computePath, &$pathCache, &$foldersById) {
        if (isset($pathCache[$id])) return $pathCache[$id];
        if (!isset($foldersById[$id])) return null;

        $maxDepth = 50;
        $parts = [];
        $cur = $id;
        $depth = 0;
        while ($cur !== null && $depth < $maxDepth) {
            if (!isset($foldersById[$cur])) break;
            array_unshift($parts, $foldersById[$cur]['name']);
            $cur = $foldersById[$cur]['parent_id'];
            $depth++;
        }
        $pathCache[$id] = implode('/', $parts);
        return $pathCache[$id];
    };

    if ($includeHierarchy) {
        $childrenByParent = [];
        foreach ($foldersById as $f) {
            $pid = $f['parent_id'];
            $key = ($pid === null) ? 'root' : (string)$pid;
            if (!isset($childrenByParent[$key])) $childrenByParent[$key] = [];
            $childrenByParent[$key][] = $f['id'];
        }

        // Sort children by name (case-insensitive)
        foreach ($childrenByParent as $key => $ids) {
            usort($ids, function($a, $b) use (&$foldersById) {
                return strcasecmp($foldersById[$a]['name'], $foldersById[$b]['name']);
            });
            $childrenByParent[$key] = $ids;
        }

        $buildNode = function($id) use (&$buildNode, &$childrenByParent, &$foldersById, $computePath) {
            $f = $foldersById[$id];
            $key = (string)$id;
            $children = [];
            if (isset($childrenByParent[$key])) {
                foreach ($childrenByParent[$key] as $childId) {
                    $children[] = $buildNode($childId);
                }
            }
            return [
                'id' => $f['id'],
                'name' => $f['name'],
                'parent_id' => $f['parent_id'],
                'path' => $computePath($id),
                'children' => $children,
            ];
        };

        $tree = [];
        foreach (($childrenByParent['root'] ?? []) as $rootId) {
            $tree[] = $buildNode($rootId);
        }

        echo json_encode([
            'success' => true,
            'workspace' => $workspace,
            'include_hierarchy' => true,
            'folders' => $tree,
        ]);
        exit;
    }

    // Flat list
    $flat = [];
    foreach ($foldersById as $id => $f) {
        $flat[] = [
            'id' => $f['id'],
            'name' => $f['name'],
            'parent_id' => $f['parent_id'],
            'path' => $computePath($id),
        ];
    }

    usort($flat, function($a, $b) {
        return strcasecmp($a['path'], $b['path']);
    });

    echo json_encode([
        'success' => true,
        'workspace' => $workspace,
        'include_hierarchy' => false,
        'folders' => $flat,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
}
