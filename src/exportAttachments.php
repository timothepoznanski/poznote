<?php
require 'auth.php';
requireAuth();

include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the correct attachments path using our centralized function
$attachmentsPath = getAttachmentsPath();

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
$metadataInfo = [];

// Collect all attachment information from database
$query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
$queryResult = $con->query($query);

if ($queryResult && $queryResult->num_rows > 0) {
    while ($row = $queryResult->fetch_assoc()) {
        $attachments = json_decode($row['attachments'], true);
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $metadataInfo[] = [
                        'note_id' => $row['id'],
                        'note_heading' => $row['heading'],
                        'attachment_data' => $attachment
                    ];
                }
            }
        }
    }
}

// Add physical files to ZIP
if ($attachmentsPath && is_dir($attachmentsPath)) {
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
                    $zip->addFile($filePath, 'files/' . $relativePath);
                    $attachmentCount++;
                }
            }
        }
    }
}

// Add metadata file with linking information
if (!empty($metadataInfo)) {
    $metadataContent = json_encode($metadataInfo, JSON_PRETTY_PRINT);
    $zip->addFromString('poznote_attachments_metadata.json', $metadataContent);
}

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

// Create a metadata file with attachment-to-note mappings
$metadata = [];
$query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != ''";
$queryResult = $con->query($query);

if ($queryResult) {
    while ($row = $queryResult->fetch_assoc()) {
        $attachments = json_decode($row['attachments'], true);
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                $metadata[] = [
                    'note_id' => $row['id'],
                    'note_heading' => $row['heading'],
                    'attachment' => $attachment
                ];
            }
        }
    }
}

// Add metadata file to ZIP
$metadataContent = json_encode($metadata, JSON_PRETTY_PRINT);
$zip->addFromString('_poznote_attachments_metadata.json', $metadataContent);

// Create a simple index file
$indexContent = '<html><head><title>Attachments Index</title></head><body>';
$indexContent .= '<h1>' . APP_NAME_DISPLAYED . ' Attachments Export</h1>';
$indexContent .= '<p>Total attachments: ' . $attachmentCount . '</p>';
$indexContent .= '<p>Total notes with attachments: ' . count($metadata) . '</p>';
$indexContent .= '<p>Export date: ' . date('Y-m-d H:i:s') . '</p>';
if ($attachmentCount == 0) {
    $indexContent .= '<p>No attachments found in your notes.</p>';
} else {
    $indexContent .= '<p><strong>Note:</strong> This export includes metadata file for proper restoration.</p>';
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
