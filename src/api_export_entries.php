<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';
require_once 'export_helpers.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the correct entries path using our centralized function
$rootPath = getEntriesPath();

$zip = new ZipArchive();
// Create ZIP file in temporary directory with proper permissions
$tempDir = sys_get_temp_dir();
$zipFileName = $tempDir . '/poznote_export_' . date('Y-m-d_His') . '.zip';

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
$query_params = [];
if ($workspace !== null) {
    $query_right .= ' AND workspace = ?';
    $query_params[] = $workspace;
}
$query_right .= ' ORDER BY updated DESC';
$stmt_right = $con->prepare($query_right);
$stmt_right->execute($query_params);
$noteTypeMap = [];

if ($stmt_right) {
    $indexContent .= '<ul>';
    while($row = $stmt_right->fetch(PDO::FETCH_ASSOC)) {
        $title = htmlspecialchars($row["heading"] ?: 'New note', ENT_QUOTES, 'UTF-8');
        
        // Get the complete folder path including parents
        $folder_id = $row["folder_id"] ?? null;
        $folderPath = getFolderPath($folder_id, $con);
        $folder = htmlspecialchars($folderPath, ENT_QUOTES, 'UTF-8');
        
        $tags = $row["tags"] ? ' - ' . htmlspecialchars($row["tags"], ENT_QUOTES, 'UTF-8') : '';
        
        // Determine the correct file extension based on note type
        $noteType = $row["type"] ?? 'note';
        $noteTypeMap[(int) $row['id']] = $noteType;
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
                    $noteId = intval(pathinfo($relativePath, PATHINFO_FILENAME));
                    $noteType = $noteTypeMap[$noteId] ?? null;
                    if ($noteType === null) {
                        $typeStmt = $con->prepare('SELECT type FROM entries WHERE id = ? AND trash = 0');
                        $typeStmt->execute([$noteId]);
                        $noteType = $typeStmt->fetchColumn() ?: 'note';
                        $noteTypeMap[$noteId] = $noteType;
                    }

                    // Preserve raw tasklist JSON stored in .html files.
                    $content = file_get_contents($filePath);
                    if ($content !== false) {
                        if ($noteType !== 'tasklist') {
                            $content = removeCopyButtonsFromHtml($content);
                        }
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
