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
 * Resolve folder path to ID, optionally creating missing segments
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
