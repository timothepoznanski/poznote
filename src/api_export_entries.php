<?php
require 'auth.php';
requireApiAuth();

include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the correct entries path using our centralized function
$rootPath = getEntriesPath();

$zip = new ZipArchive();
// Create ZIP file in temporary directory with proper permissions
$tempDir = sys_get_temp_dir();
$zipFileName = $tempDir . '/entries_' . uniqid() . '.zip';

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

// Create index file
$indexContent = '<html><head><meta charset="UTF-8"><title>Note Index</title></head><body>';
$indexContent .= '<h1>Poznote Notes Export</h1>';
$workspace = $_GET['workspace'] ?? null;

$query_right = 'SELECT * FROM entries WHERE trash = 0';
if ($workspace !== null) {
    $query_right .= " AND workspace = '" . addslashes($workspace) . "'";
}
$query_right .= ' ORDER BY updated DESC';
$res_right = $con->query($query_right);

if ($res_right && $res_right) {
    $indexContent .= '<ul>';
    while($row = $res_right->fetch(PDO::FETCH_ASSOC)) {
        $title = htmlspecialchars($row["heading"] ?: 'New note', ENT_QUOTES, 'UTF-8');
        
        // Get the complete folder path including parents
        $folder_id = $row["folder_id"] ?? null;
        $folderPath = getFolderPath($folder_id, $con);
        $folder = htmlspecialchars($folderPath, ENT_QUOTES, 'UTF-8');
        
        $tags = $row["tags"] ? ' - ' . htmlspecialchars($row["tags"], ENT_QUOTES, 'UTF-8') : '';
        
        // Determine the correct file extension based on note type
        $noteType = $row["type"] ?? 'note';
        $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
        
        $indexContent .= '<li><a href="./'.$row['id'].'.'.$fileExtension.'">'.$title.'</a> (' . $folder . $tags.')</li>';
    }
    $indexContent .= '</ul>';
} else {
    $indexContent .= '<p>No notes found.</p>';
}

$indexContent .= '<p>Export date: ' . date('Y-m-d H:i:s') . '</p>';
$indexContent .= '</body></html>';
$zip->addFromString('index.html', $indexContent);

// Add all note files (HTML and Markdown) from entries directory
// For Markdown files, add front matter with metadata
$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($rootPath), 
    RecursiveIteratorIterator::LEAVES_ONLY
);

foreach ($files as $name => $file) {
    if (!$file->isDir()) {
        $filePath = $file->getRealPath();
        $relativePath = substr($filePath, strlen($rootPath) + 1);
        $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
        
        // Include both HTML and Markdown files, skip index.php and other non-note files
        if ($extension === 'html' || $extension === 'md') {
            if (file_exists($filePath) && is_readable($filePath)) {
                // For Markdown files, add front matter with metadata
                if ($extension === 'md') {
                    $noteId = intval(pathinfo($relativePath, PATHINFO_FILENAME));
                    
                    // Get metadata from database
                    $metaStmt = $con->prepare('SELECT heading, tags, favorite, folder_id, created, updated FROM entries WHERE id = ? AND trash = 0');
                    $metaStmt->execute([$noteId]);
                    $metadata = $metaStmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($metadata) {
                        $content = file_get_contents($filePath);
                        $frontMatterContent = addFrontMatterToMarkdown($content, $metadata, $con);
                        $zip->addFromString($relativePath, $frontMatterContent);
                        $fileCount++;
                    } else {
                        // No metadata found, add file as-is
                        $zip->addFile($filePath, $relativePath);
                        $fileCount++;
                    }
                } else {
                    // For HTML files, remove copy buttons before adding
                    $content = file_get_contents($filePath);
                    if ($content !== false) {
                        $content = removeCopyButtonsFromHtml($content);
                        $zip->addFromString($relativePath, $content);
                    } else {
                        $zip->addFile($filePath, $relativePath);
                    }
                    $fileCount++;
                }
            }
        }
    }
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
    if ($folder_id && function_exists('getFolderPath')) {
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

// Send file to browser
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="poznote_notes_export.zip"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>
