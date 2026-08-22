<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';
require_once 'version_helper.php';

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
        <link rel="stylesheet" href="<?php echo poznoteAsset('css/lucide.css'); ?>">
        <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/variables.css'); ?>">
        <link href="<?php echo poznoteAsset('css/modals/base.css'); ?>" rel="stylesheet">
        <link href="<?php echo poznoteAsset('css/modals/specific-modals.css'); ?>" rel="stylesheet">
        <link href="<?php echo poznoteAsset('css/modals/attachments.css'); ?>" rel="stylesheet">
        <link href="<?php echo poznoteAsset('css/modals/share-modal.css'); ?>" rel="stylesheet">
        <link href="<?php echo poznoteAsset('css/modals/alerts-utilities.css'); ?>" rel="stylesheet">
        <link href="<?php echo poznoteAsset('css/modals/responsive.css'); ?>" rel="stylesheet">
        <link rel="stylesheet" href="<?php echo poznoteAsset('css/export-attachments.css'); ?>">
    </head>
    <body class="ai-page">
        <div class="summary-page">
            <div class="summary-header">
                <h1>Attachments Export</h1>
                <p class="subtitle-text">No attachments found</p>
            </div>
            
            <div class="summary-content">
                <div class="empty-state-container">
                    <div class="empty-state-icon">
                        <i class="lucide lucide-paperclip"></i>
                    </div>
                    <h2 class="empty-state-title">No attachments found</h2>
                    <p class="empty-state-description">
                        There are currently no attachments in your notes.
                    </p>
                    <p class="empty-state-description">
                        To add attachments to your notes, use the <strong><i class="lucide lucide-paperclip"></i></strong> button in the note editor.
                    </p>
                </div>
            </div>
            
            <div class="action-buttons">
                <a href="backup_export.php" class="btn btn-secondary">
                    <i class="lucide lucide-download"></i> Other export options
                </a>
            </div>
        </div>
        
        <script src="<?php echo poznoteAsset('js/export-attachments.js'); ?>"></script>
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
$addedToZip = [];
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
                    $addedToZip[$relativePath] = true;
                    $attachmentCount++;
                }
            }
        }
    }
}

// Fetch the attachments referenced in the database from the bucket (files
// still on disk, e.g. not yet migrated, were already added above). Gated on
// the credentials so files left in the bucket after S3 storage was turned
// off are exported too.
if (poznoteAttachmentsBucketMayHoldFiles()) {
    foreach ($metadataInfo as $info) {
        $filename = $info['attachment_data']['filename'] ?? '';
        if ($filename === '' || isset($addedToZip[$filename])) {
            continue;
        }
        $localCopy = poznoteAttachmentLocalFile($filename);
        if ($localCopy !== null) {
            $zip->addFile($localCopy, 'files/' . $filename);
            $addedToZip[$filename] = true;
            $attachmentCount++;
        }
    }

    // A file the bucket answers 404 for is simply gone, but a bucket that
    // errored means the lookups after it were skipped: the archive may be
    // missing files with no way to tell which. This export is exactly what
    // users rely on to save their S3 attachments, so refuse rather than
    // ship a zip that looks complete and is not (same rule as the complete
    // backup in backup_zip.php).
    if (AttachmentStorage::remoteFailedThisRequest()) {
        $zip->close();
        @unlink($zipFileName);
        ob_end_clean();
        http_response_code(502);
        die(t('backup_export.errors.s3_unreachable', [],
            'The S3 bucket could not be read while building the archive, so some attachments would be missing from it. Nothing was saved. Check the bucket and try again.'));
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
