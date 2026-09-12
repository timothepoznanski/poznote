<?php
/**
 * Turning a folder id into a path, and a path back into an id.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Get the complete folder path including parent folders
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return string The complete folder path (e.g., "Parent/Child")
 */
function getFolderPath($folder_id, $con) {
    static $cache = [];
    static $folderData = null;
    
    if ($folder_id === null || $folder_id === 0) {
        return 'Default';
    }
    
    // Return cached path if available
    if (isset($cache[$folder_id])) {
        return $cache[$folder_id];
    }
    
    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }
    
    $path = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        
        // Add folder name to the beginning of the path
        array_unshift($path, $folder['name']);
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    $result = !empty($path) ? implode('/', $path) : 'Default';
    $cache[$folder_id] = $result;
    return $result;
}

/**
 * Get the complete folder path as individual segments (root first)
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return array Array of ['id' => int, 'name' => string] from root folder down to the folder itself
 */
function getFolderPathSegments($folder_id, $con) {
    static $folderData = null;

    if ($folder_id === null || $folder_id === 0) {
        return [];
    }

    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }

    $segments = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;

    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        array_unshift($segments, ['id' => $currentId, 'name' => $folder['name']]);
        $currentId = $folder['parent_id'];
        $depth++;
    }

    return $segments;
}

/**
 * Every folder of a workspace carrying this exact name, with its full path.
 *
 * A bare folder name is not an address: "08" can be both Diary/2026/08 and
 * Archive/2025/08. Callers that accept one use this to tell "there is exactly
 * one folder called that" from "the caller has to be more specific".
 *
 * @param string $workspace The workspace name
 * @param string $name The folder name to look for, at any depth
 * @param PDO|null $con Database connection
 * @return array<int, array{id: int, path: string, parent_id: int|null}>
 */
function poznoteFindFoldersNamed($workspace, $name, $con = null) {
    if ($con === null) {
        global $con;
    }
    if (!$con) return [];

    $name = trim((string)$name);
    if ($name === '') return [];

    $stmt = $con->prepare('SELECT id, name, parent_id FROM folders WHERE workspace = ?');
    $stmt->execute([$workspace]);

    $byId = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $byId[(int)$row['id']] = [
            'name' => (string)$row['name'],
            'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null,
        ];
    }

    $pathOf = static function (int $id) use ($byId): string {
        $parts = [];
        $current = $id;
        $depth = 0;
        while ($current !== null && isset($byId[$current]) && $depth < 50) {
            array_unshift($parts, $byId[$current]['name']);
            $current = $byId[$current]['parent_id'];
            $depth++;
        }
        return implode('/', $parts);
    };

    $matches = [];
    foreach ($byId as $id => $folder) {
        if ($folder['name'] === $name) {
            $matches[] = ['id' => $id, 'path' => $pathOf($id), 'parent_id' => $folder['parent_id']];
        }
    }

    usort($matches, fn($a, $b) => strcasecmp($a['path'], $b['path']));

    return $matches;
}

/**
 * Resolve folder path to ID, optionally creating missing segments
 *
 * A path with no "/" is first looked up at the root of the workspace, then,
 * when nothing is there, among every folder of the workspace: a caller naming
 * "08" for an existing Diary/2026/08 means that folder, not a second one at
 * the root (issue #1374). Only an unambiguous name resolves that way; when
 * several folders share it, the path stays unresolved and $createIfMissing
 * decides. Use poznoteFindFoldersNamed() to detect that case beforehand and
 * ask the caller for a full path.
 * 
 * @param string $workspace The workspace name
 * @param string $folderPath The full folder path (e.g., "A/B/C")
 * @param bool $createIfMissing Whether to create folders if they don't exist
 * @param PDO $con Database connection
 * @return int|null The resolved folder ID or null if not found/created
 */
function resolveFolderPathToId($workspace, $folderPath, $createIfMissing = false, $con = null) {
    if ($con === null) {
        global $con;
    }
    if (!$con) return null;

    $folderPath = trim($folderPath);
    if ($folderPath === '' || strtolower($folderPath) === 'default') return null;
    
    $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
    if (empty($segments)) return null;

    if (count($segments) === 1) {
        $rootStmt = $con->prepare('SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL');
        $rootStmt->execute([$segments[0], $workspace]);
        $rootId = $rootStmt->fetchColumn();
        if ($rootId !== false) {
            return (int)$rootId;
        }

        $matches = poznoteFindFoldersNamed($workspace, $segments[0], $con);
        if (count($matches) === 1) {
            return (int)$matches[0]['id'];
        }
    }
    
    $parentId = null;
    foreach ($segments as $seg) {
        $sql = "SELECT id FROM folders WHERE name = ? AND workspace = ?";
        $params = [$seg, $workspace];
        if ($parentId === null) {
            $sql .= " AND parent_id IS NULL";
        } else {
            $sql .= " AND parent_id = ?";
            $params[] = $parentId;
        }
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) {
            $parentId = (int)$row['id'];
        } elseif ($createIfMissing) {
            // Create the folder segment
            $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
            $stmt->execute([$seg, $workspace, $parentId]);
            $parentId = (int)$con->lastInsertId();
        } else {
            return null;
        }
    }
    
    return $parentId;
}
