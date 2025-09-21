<?php
require 'auth.php';
requireAuth();

include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

// First, check if there are any attachments at all
$checkQuery = "SELECT COUNT(*) as count FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
$checkResult = $con->query($checkQuery);
$hasAttachments = false;

if ($checkResult) {
    $row = $checkResult->fetch(PDO::FETCH_ASSOC);
    if ($row['count'] > 0) {
        // Double-check by looking at the actual content
        $detailQuery = "SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $detailResult = $con->query($detailQuery);
        while ($detailRow = $detailResult->fetch(PDO::FETCH_ASSOC)) {
            $attachments = json_decode($detailRow['attachments'], true);
            if (is_array($attachments) && !empty($attachments)) {
                $hasAttachments = true;
                break;
            }
        }
    }
}

// If no attachments found, display a user-friendly message instead of downloading empty file
if (!$hasAttachments) {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poznote - Attachments Export</title>
        <link href="css/index.css" rel="stylesheet">
        <link href="css/modals.css" rel="stylesheet">
        <link rel="stylesheet" href="css/ai.css">
    </head>
    <body class="ai-page">
        <div class="summary-page">
            <div class="summary-header">
                <h1>Attachments Export</h1>
                <p style="color: #6c757d; margin: 10px 0 0 0; font-size: 14px;">No attachments found</p>
            </div>
            
            <div class="summary-content">
                <div style="text-align: center;">
                    <div style="font-size: 48px; color: #6c757d; margin-bottom: 20px;">
                        <i class="fa-paperclip"></i>
                    </div>
                    <h2 style="color: #333; margin-bottom: 15px; font-size: 24px;">No attachments found</h2>
                    <p style="color: #666; line-height: 1.6; margin-bottom: 20px; font-size: 16px;">
                        There are currently no attachments in your notes.
                    </p>
                    <p style="color: #666; line-height: 1.6; margin-bottom: 0; font-size: 16px;">
                        To add attachments to your notes, use the <strong><i class="fa-paperclip"></i></strong> button in the note editor.
                    </p>
                </div>
            </div>
            
            <div class="action-buttons">
                <a href="index.php" class="btn btn-primary">
                    Back to notes
                </a>
                <a href="backup_export.php" class="btn btn-secondary">
                    <i class="fa-download"></i> Other export options
                </a>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}

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

if ($queryResult) {
    while ($row = $queryResult->fetch(PDO::FETCH_ASSOC)) {
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

// Create a simple index file
$indexContent = '<html><head><title>Attachments Index</title></head><body>';
$indexContent .= '<h1>Poznote Attachments Export</h1>';
$indexContent .= '<p>Total attachments: ' . $attachmentCount . '</p>';
$indexContent .= '<p>Total notes with attachments: ' . count($metadataInfo) . '</p>';
$indexContent .= '<p>Export date: ' . date('Y-m-d H:i:s') . '</p>';
$indexContent .= '<p><strong>Note:</strong> This export includes metadata file for proper restoration.</p>';
$indexContent .= '</body></html>';
$zip->addFromString('index.html', $indexContent);

$zip->close();

// Clear any output buffer
ob_end_clean();

// Check if ZIP file was created successfully
if (!file_exists($zipFileName)) {
    die('Attachments export file could not be created - ZIP file creation failed');
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
