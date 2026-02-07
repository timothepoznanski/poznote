<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the folder ID to export
$folder_id = $_GET['folder_id'] ?? null;

if ($folder_id === null || !is_numeric($folder_id)) {
    ob_end_clean();
    die('Invalid folder ID');
}

// Get folder information
$stmt = $con->prepare('SELECT name, workspace FROM folders WHERE id = ?');
$stmt->execute([$folder_id]);
$folder = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$folder) {
    ob_end_clean();
    die('Folder not found');
}

$folder_name = $folder['name'];
$workspace = $folder['workspace'];

// Get the correct entries path using our centralized function
$rootPath = getEntriesPath();

$zip = new ZipArchive();
// Create ZIP file in temporary directory with proper permissions
$tempDir = sys_get_temp_dir();
$zipFileName = $tempDir . '/poznote_folder_' . uniqid() . '.zip';

// Debug: Check if entries directory exists
if (!$rootPath) {
    ob_end_clean();
    die('Entries directory not found in any expected location');
}

$result = $zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE);
if ($result !== TRUE) {
    ob_end_clean();
    die('Cannot create ZIP file. Error code: ' . $result);
}

$fileCount = 0;

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
 * Get the folder path in the ZIP archive for a given folder_id (relative to the export root)
 */
function getFolderZipPath($folder_id, $folderMap, $rootFolderId) {
    if ($folder_id === null || $folder_id === 0) {
        return '';
    }
    
    // If this is the root folder we're exporting, return empty path
    if ($folder_id == $rootFolderId) {
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
        
        // Stop when we reach the root folder we're exporting
        if ($currentId == $rootFolderId) {
            break;
        }
        
        // Add sanitized folder name to the beginning of the path
        array_unshift($path, sanitizeFilename($folder['name']));
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
        
        // Also stop if we've reached the root folder
        if ($currentId == $rootFolderId) {
            break;
        }
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

// Get all child folders of the target folder
$targetFolderIds = [$folder_id];
$targetFolderIds = array_merge($targetFolderIds, getChildFolderIds($folder_id, $allFolders));

// Create README in the root explaining the structure
$readmeContent = "# Poznote Folder Export: " . $folder_name . "\n\n";
$readmeContent .= "This archive contains the folder '" . $folder_name . "' and all its contents from Poznote.\n\n";
$readmeContent .= "Export date: " . date('Y-m-d H:i:s') . "\n\n";
$readmeContent .= "## Structure\n\n";
$readmeContent .= "- Subfolders are preserved in the archive\n";
$readmeContent .= "- Notes are saved with their original type (.html or .md)\n";
$readmeContent .= "- Markdown files include YAML front matter with metadata (title, tags, etc.)\n\n";

$zip->addFromString('README.md', $readmeContent);

// Query all notes in this folder and its subfolders (excluding trash)
$placeholders = implode(',', array_fill(0, count($targetFolderIds), '?'));
$query_notes = "SELECT * FROM entries WHERE trash = 0 AND folder_id IN ($placeholders) ORDER BY folder_id, heading";
$stmt = $con->prepare($query_notes);
$stmt->execute($targetFolderIds);

// Track folders that have been created in the ZIP to avoid duplicates
$createdFolders = [];

// Process each note
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $noteId = $row['id'];
    $heading = $row['heading'] ?: 'New note';
    $note_folder_id = $row['folder_id'] ?? null;
    $noteType = $row['type'] ?? 'note';
    
    // Determine file extension
    $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
    
    // Get the folder path in the ZIP (relative to our root folder)
    $zipFolderPath = getFolderZipPath($note_folder_id, $folderMap, $folder_id);
    
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
        }
        
        $zip->addFromString($noteFileName, $content);
        $fileCount++;
    }
}

// Add empty .gitkeep files to empty subfolders to ensure they're preserved
foreach ($allFolders as $folder) {
    // Only process folders that are descendants of our target folder
    if (!in_array($folder['id'], $targetFolderIds)) {
        continue;
    }
    
    // Skip the root folder itself
    if ($folder['id'] == $folder_id) {
        continue;
    }
    
    $zipPath = getFolderZipPath($folder['id'], $folderMap, $folder_id);
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

// Create a safe filename for the download
$safeFilename = sanitizeFilename($folder_name);

// Send file to browser
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $safeFilename . '_export.zip"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>
