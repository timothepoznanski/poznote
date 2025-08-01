<?php
require 'auth.php';
requireAuth();

include 'functions.php';
require 'config.php';
include 'db_connect.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Try multiple possible attachment paths from different working directories
$attachmentsPaths = [
    realpath('attachments'),                // Production: mounted directly in webroot
    realpath('../data/attachments'),        // Development: data folder outside src
];

$attachmentsPath = null;
foreach ($attachmentsPaths as $path) {
    if ($path && is_dir($path)) {
        $attachmentsPath = $path;
        break;
    }
}

$zip = new ZipArchive();
// Create ZIP file in temporary directory with proper permissions
$tempDir = sys_get_temp_dir();
$zipFileName = $tempDir . '/attachments_' . uniqid() . '.zip';

$result = $zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE);
if ($result !== TRUE) {
    ob_end_clean();
    die('Cannot create ZIP file. Error code: ' . $result);
}

$attachmentCount = 0;

// Check if attachments directory exists and add files
if ($attachmentsPath && is_dir($attachmentsPath)) {
    // Add all files from attachments directory
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($attachmentsPath), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($attachmentsPath) + 1);
            
            // Skip hidden files like .gitkeep
            if (!str_starts_with($relativePath, '.')) {
                if (file_exists($filePath) && is_readable($filePath)) {
                    $zip->addFile($filePath, $relativePath);
                    $attachmentCount++;
                }
            }
        }
    }
}

// Create a simple index file
$indexContent = '<html><head><title>Attachments Index</title></head><body>';
$indexContent .= '<h1>Poznote Attachments Export</h1>';
$indexContent .= '<p>Total attachments: ' . $attachmentCount . '</p>';
$indexContent .= '<p>Export date: ' . date('Y-m-d H:i:s') . '</p>';
if ($attachmentCount == 0) {
    $indexContent .= '<p>No attachments found in your notes.</p>';
}
$indexContent .= '</body></html>';
$zip->addFromString('index.html', $indexContent);

$zip->close();

// Clear any output buffer
ob_end_clean();

// Check if ZIP file was created successfully
if (!file_exists($zipFileName)) {
    die('Attachments export file could not be created - ZIP file not found');
}

if (filesize($zipFileName) == 0) {
    unlink($zipFileName);
    die('Attachments export file could not be created - ZIP file is empty');
}

// Send file to browser
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="poznote_attachments_export.zip"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>
