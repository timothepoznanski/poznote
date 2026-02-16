<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the correct entries path using our centralized function
$rootPath = getEntriesPath();

// Debug: Check if entries directory exists
if (!$rootPath) {
    ob_end_clean();
    die('Entries directory not found in any expected location');
}

$fileCount = 0;
$workspace = $_GET['workspace'] ?? null;

// Get workspace name if workspace is specified
$workspaceName = 'all';
if ($workspace !== null) {
    $stmt_ws = $con->prepare('SELECT name FROM workspaces WHERE name = ?');
    $stmt_ws->execute([$workspace]);
    $ws_row = $stmt_ws->fetch(PDO::FETCH_ASSOC);
    if ($ws_row) {
        $workspaceName = $ws_row['name'];
    }
}

// Generate filename with workspace name and date
$tempDir = sys_get_temp_dir();
$dateStr = date('Y-m-d_His');
// Sanitize workspace name: replace spaces and special characters with underscores
$safeWorkspaceName = preg_replace('/\s+/', '_', $workspaceName); // Replace spaces with underscores
$safeWorkspaceName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $safeWorkspaceName); // Replace other special chars
$safeWorkspaceName = preg_replace('/_+/', '_', $safeWorkspaceName); // Replace multiple underscores with single
$safeWorkspaceName = trim($safeWorkspaceName, '_'); // Remove leading/trailing underscores
$zipFileName = $tempDir . '/poznote_structured_' . $safeWorkspaceName . '_' . $dateStr . '.zip';

$zip = new ZipArchive();
$result = $zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE);
if ($result !== TRUE) {
    ob_end_clean();
    die('Cannot create ZIP file. Error code: ' . $result);
}

// Build folder hierarchy to understand the structure
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
    $res = $stmt;
    $folders = [];
    $folderMap = [];
    
    while ($row = $res->fetch(PDO::FETCH_ASSOC)) {
        $folders[] = $row;
        $folderMap[$row['id']] = $row;
    }
    
    return ['folders' => $folders, 'folderMap' => $folderMap];
}

/**
 * Sanitize folder/file name for filesystem
 */
function sanitizeFilename($name) {
    // Replace invalid characters with underscores
    $name = str_replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], '_', $name);
    // Remove leading/trailing dots and spaces
    $name = trim($name, '. ');
    // If empty after sanitization, use a default name
    if (empty($name)) {
        $name = 'Untitled';
    }
    return $name;
}

/**
 * Get the folder path in the ZIP archive for a given folder_id
 */
function getFolderZipPath($folder_id, $folderMap) {
    if ($folder_id === null || $folder_id === 0) {
        return '';
    }
    
    $path = [];
    $currentId = $folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && $depth < $maxDepth) {
        if (!isset($folderMap[$currentId])) {
            break;
        }
        
        $folder = $folderMap[$currentId];
        
        // Add sanitized folder name to the beginning of the path
        array_unshift($path, sanitizeFilename($folder['name']));
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    return !empty($path) ? implode('/', $path) . '/' : '';
}

/**
 * Get all folder IDs that are children of a given folder
 */
function getChildFolderIds($folder_id, $folders) {
    $childIds = [];
    foreach ($folders as $folder) {
        if ($folder['parent_id'] == $folder_id) {
            $childIds[] = $folder['id'];
            // Recursively get children
            $childIds = array_merge($childIds, getChildFolderIds($folder['id'], $folders));
        }
    }
    return $childIds;
}

// Build folder tree
$folderTree = buildFolderTree($con, $workspace);
$folderMap = $folderTree['folderMap'];
$allFolders = $folderTree['folders'];

// Create README in the root explaining the structure
$readmeContent = "# Poznote Structured Export\n\n";
$readmeContent .= "This archive contains your Poznote notes organized in folders matching your Poznote folder structure.\n\n";

// Add workspace name
$readmeContent .= "**Workspace:** " . $workspaceName . "\n\n";

// Add export date
$readmeContent .= "**Export date:** " . date('Y-m-d H:i:s') . "\n\n";

$readmeContent .= "## Structure\n\n";
$readmeContent .= "- Each folder from Poznote is represented as a directory in this archive\n";
$readmeContent .= "- Notes are saved with their original type (.html or .md)\n";
$readmeContent .= "- Markdown files include YAML front matter with metadata (title, tags, etc.)\n";
$readmeContent .= "- Notes without a folder are placed in the 'Uncategorized' directory\n\n";

$zip->addFromString('README.md', $readmeContent);

// Query all notes (excluding trash)
$query_notes = 'SELECT * FROM entries WHERE trash = 0';
$notes_params = [];
if ($workspace !== null) {
    $query_notes .= ' AND workspace = ?';
    $notes_params[] = $workspace;
}
$query_notes .= ' ORDER BY folder_id, heading';
$stmt_notes = $con->prepare($query_notes);
$stmt_notes->execute($notes_params);
$res_notes = $stmt_notes;

// Track folders that have been created in the ZIP to avoid duplicates
$createdFolders = [];

// Process each note
while ($row = $res_notes->fetch(PDO::FETCH_ASSOC)) {
    $noteId = $row['id'];
    $heading = $row['heading'] ?: 'New note';
    $folder_id = $row['folder_id'] ?? null;
    $noteType = $row['type'] ?? 'note';
    
    // Determine file extension
    $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
    
    // Get the folder path in the ZIP
    $zipFolderPath = getFolderZipPath($folder_id, $folderMap);
    
    // If no folder, use "Uncategorized"
    if (empty($zipFolderPath)) {
        $zipFolderPath = 'Uncategorized/';
    }
    
    // Mark folder as created
    if (!isset($createdFolders[$zipFolderPath])) {
        $createdFolders[$zipFolderPath] = true;
    }
    
    // Create a safe filename from the heading
    $safeHeading = sanitizeFilename($heading);
    
    // Handle duplicate filenames by appending the note ID
    $noteFileName = $zipFolderPath . $safeHeading . '_' . $noteId . '.' . $fileExtension;
    
    // Get the note content from the file
    $entryFilePath = getEntryFilename($noteId, $noteType);
    
    if (file_exists($entryFilePath) && is_readable($entryFilePath)) {
        $content = file_get_contents($entryFilePath);
        
        // For Markdown files, add front matter with metadata
        if ($fileExtension === 'md') {
            $content = addFrontMatterToMarkdown($content, $row, $con);
        } else {
            $content = removeCopyButtonsFromHtml($content);
        }
        
        $zip->addFromString($noteFileName, $content);
        $fileCount++;
    }
}

// Add empty .gitkeep files to empty folders to ensure they're preserved
foreach ($allFolders as $folder) {
    $zipPath = getFolderZipPath($folder['id'], $folderMap);
    if (!empty($zipPath) && !isset($createdFolders[$zipPath])) {
        // Check if this folder has any child folders with notes
        $hasContent = false;
        foreach ($createdFolders as $path => $val) {
            if (strpos($path, $zipPath) === 0 && $path !== $zipPath) {
                $hasContent = true;
                break;
            }
        }
        
        // Add .gitkeep to preserve empty folders
        if (!$hasContent) {
            $zip->addFromString($zipPath . '.gitkeep', '');
        }
    }
}

/**
 * Add YAML front matter to Markdown content
 */
function addFrontMatterToMarkdown($content, $metadata, $con) {
    $title = $metadata['heading'] ?? 'New note';
    $tags = $metadata['tags'] ?? '';
    $favorite = !empty($metadata['favorite']) ? 'true' : 'false';
    $created = $metadata['created'] ?? '';
    $updated = $metadata['updated'] ?? '';
    $folder_id = $metadata['folder_id'] ?? null;
    
    // Parse tags (stored as comma-separated string)
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    // Get folder path if exists
    $folderPath = '';
    if ($folder_id) {
        $folderPath = getFolderPath($folder_id, $con);
    }
    
    // Build YAML front matter
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

    return $dom->saveHTML();
}

$zip->close();

// Clear any output buffer
ob_end_clean();

// Check if ZIP file was created successfully
if (!file_exists($zipFileName)) {
    die('Export file could not be created - ZIP file not found');
}

if (filesize($zipFileName) == 0) {
    unlink($zipFileName);
    die('Export file could not be created - ZIP file is empty');
}

// Send file to browser
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="poznote_structured_export.zip"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>
