<?php
require 'auth.php';
requireAuth();

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
    $query_right .= " AND (workspace = '" . addslashes($workspace) . "' OR (workspace IS NULL AND '" . addslashes($workspace) . "' = 'Poznote'))";
}
$query_right .= ' ORDER BY updated DESC';
$res_right = $con->query($query_right);

if ($res_right && $res_right) {
    $indexContent .= '<ul>';
    while($row = $res_right->fetch(PDO::FETCH_ASSOC)) {
        $title = htmlspecialchars($row["heading"] ?: 'Untitled note', ENT_QUOTES, 'UTF-8');
    $folder = htmlspecialchars($row["folder"] ?: 'Default', ENT_QUOTES, 'UTF-8');
        $tags = $row["tags"] ? ' - ' . htmlspecialchars($row["tags"], ENT_QUOTES, 'UTF-8') : '';
        $indexContent .= '<li><a href="./'.$row['id'].'.html">'.$title.'</a> (' . $folder . $tags.')</li>';
    }
    $indexContent .= '</ul>';
} else {
    $indexContent .= '<p>No notes found.</p>';
}

$indexContent .= '<p>Export date: ' . date('Y-m-d H:i:s') . '</p>';
$indexContent .= '</body></html>';
$zip->addFromString('index.html', $indexContent);

// Add all HTML files from entries directory
$files = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($rootPath), 
    RecursiveIteratorIterator::LEAVES_ONLY
);

foreach ($files as $name => $file) {
    if (!$file->isDir()) {
        $filePath = $file->getRealPath();
        $relativePath = substr($filePath, strlen($rootPath) + 1);
        
        // Only add HTML files, skip index.php and other non-HTML files
        if (pathinfo($relativePath, PATHINFO_EXTENSION) === 'html') {
            if (file_exists($filePath) && is_readable($filePath)) {
                $zip->addFile($filePath, $relativePath);
                $fileCount++;
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
