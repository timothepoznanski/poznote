<?php
/**
 * Shared export helper functions
 * Used by api_export_folder.php, api_export_structured.php, api_export_entries.php, api_export_note.php
 */

/**
 * Build folder hierarchy to understand the structure
 */
function buildFolderTree($con, $workspace = null) {
    $query = 'SELECT id, name, parent_id FROM folders';
    $params = [];
    if ($workspace !== null) {
        $query .= ' WHERE workspace = ?';
        $params[] = $workspace;
    }
    $query .= ' ORDER BY name ASC';
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $folders = [];
    $folderMap = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $folders[] = $row;
        $folderMap[$row['id']] = $row;
    }
    
    return ['folders' => $folders, 'folderMap' => $folderMap];
}

/**
 * Sanitize folder/file name for filesystem
 */
function sanitizeFilename($name) {
    $name = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], '_', $name);
    $name = trim($name, '. ');
    if (empty($name)) {
        $name = 'Untitled';
    }
    return $name;
}

/**
 * Get the folder path in the ZIP archive for a given folder_id (relative to the export root)
 * @param int|null $folder_id
 * @param array $folderMap
 * @param int|null $rootFolderId If set, stop traversal at this folder (used for single-folder exports)
 */
function getFolderZipPath($folder_id, $folderMap, $rootFolderId = null) {
    if ($folder_id === null || $folder_id === 0) {
        return '';
    }
    if ($rootFolderId !== null && $folder_id == $rootFolderId) {
        return '';
    }
    
    $path = [];
    $currentId = $folder_id;
    $maxDepth = 50;
    $depth = 0;
    
    while ($currentId !== null && $depth < $maxDepth) {
        if (!isset($folderMap[$currentId])) {
            break;
        }
        if ($rootFolderId !== null && $currentId == $rootFolderId) {
            break;
        }
        
        $folder = $folderMap[$currentId];
        array_unshift($path, sanitizeFilename($folder['name']));
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    return !empty($path) ? implode('/', $path) . '/' : '';
}

/**
 * Get all folder IDs that are children of a given folder (recursive)
 */
function getChildFolderIds($folder_id, $folders) {
    $childIds = [];
    foreach ($folders as $folder) {
        if ($folder['parent_id'] == $folder_id) {
            $childIds[] = $folder['id'];
            $childIds = array_merge($childIds, getChildFolderIds($folder['id'], $folders));
        }
    }
    return $childIds;
}

/**
 * Add YAML front matter to Markdown content
 */
function addFrontMatterToMarkdown($content, $metadata, $con) {
    $title = $metadata['heading'] ?? 'New note';
    $tags = $metadata['tags'] ?? '';
    $favorite = !empty($metadata['favorite']) ? 'true' : 'false';
    $created = convertUtcToUserTimezone($metadata['created'] ?? '');
    $updated = convertUtcToUserTimezone($metadata['updated'] ?? '');
    $folder_id = $metadata['folder_id'] ?? null;
    $noteType = $metadata['type'] ?? 'note';
    
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    $folderPath = '';
    if ($folder_id) {
        $folderPath = getFolderPath($folder_id, $con);
    }
    
    $frontMatter = "---\n";
    $frontMatter .= "title: " . json_encode($title, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    
    if (!empty($tagsList)) {
        $frontMatter .= "tags:\n";
        foreach ($tagsList as $tag) {
            $frontMatter .= "  - " . json_encode($tag, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        }
    }
    
    if (!empty($folderPath)) {
        $frontMatter .= "folder: " . json_encode($folderPath, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }

    if ($noteType === 'tasklist') {
        $frontMatter .= "type: tasklist\n";
    }
    
    $frontMatter .= "favorite: " . $favorite . "\n";
    
    if (!empty($created)) {
        $frontMatter .= "created: " . json_encode($created, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    if (!empty($updated)) {
        $frontMatter .= "updated: " . json_encode($updated, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    $frontMatter .= "---\n\n";
    
    return $frontMatter . $content;
}

/**
 * Remove code block copy buttons from HTML export
 */
function removeCopyButtonsFromHtml($html) {
    if ($html === '' || $html === null) {
        return $html;
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);
    $copyButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn')]");
    foreach ($copyButtons as $button) {
        $button->parentNode->removeChild($button);
    }

    $deleteButtons = $xpath->query("//*[contains(@class, 'code-block-delete-btn')]");
    foreach ($deleteButtons as $button) {
        $button->parentNode->removeChild($button);
    }

    return $dom->saveHTML();
}

/**
 * Convert tasklist JSON to Markdown checkbox format
 */
function convertTasklistToMarkdown($jsonContent) {
    $jsonContent = preg_replace('/^\xEF\xBB\xBF/', '', $jsonContent);

    $tasks = json_decode($jsonContent, true);

    if (!is_array($tasks) || empty($tasks)) {
        return '';
    }

    $markdown = '';

    foreach ($tasks as $task) {
        $text = isset($task['text']) ? trim($task['text']) : '';
        $completed = !empty($task['completed']);
        $important = !empty($task['important']);

        if (empty($text)) {
            continue;
        }

        $checkbox = $completed ? '[x]' : '[ ]';

        if ($important) {
            $markdown .= '- ' . $checkbox . ' **' . $text . '** ⭐' . "\n";
        } else {
            $markdown .= '- ' . $checkbox . ' ' . $text . "\n";
        }
    }

    return $markdown;
}
