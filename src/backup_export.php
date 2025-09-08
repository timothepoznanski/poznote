<?php
require_once 'auth.php';
require_once 'config.php';
include 'functions.php';
require_once 'db_connect.php';

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$message = '';
$error = '';

// Process actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'backup':
            $result = createBackup();
            // createBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = "Export error: " . $result['error'];
            }
            break;
        case 'complete_backup':
            $result = createCompleteBackup();
            // createCompleteBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = "Complete backup error: " . $result['error'];
            }
            break;
    }
}

function createCompleteBackup() {
    $dbPath = SQLITE_DATABASE;
    $tempDir = sys_get_temp_dir();
    $zipFileName = $tempDir . '/poznote_complete_backup_' . date('Y-m-d_H-i-s') . '.zip';
    
    $zip = new ZipArchive();
    if ($zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
        return ['success' => false, 'error' => 'Cannot create ZIP file'];
    }
    
    // Add SQL dump
    $command = "sqlite3 {$dbPath} .dump 2>&1";
    $output = [];
    exec($command, $output, $returnCode);
    
    if ($returnCode === 0) {
        $sqlContent = implode("\n", $output);
        $zip->addFromString('database/poznote_backup.sql', $sqlContent);
    } else {
        $zip->close();
        unlink($zipFileName);
        return ['success' => false, 'error' => 'Failed to create database backup'];
    }
    
    // Add HTML entries
    $entriesPath = getEntriesPath();
    if ($entriesPath && is_dir($entriesPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($entriesPath), 
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($entriesPath) + 1);
                
                if (pathinfo($relativePath, PATHINFO_EXTENSION) === 'html') {
                    $zip->addFile($filePath, 'entries/' . $relativePath);
                }
            }
        }
    }
    
    // Add attachments
    $attachmentsPath = getAttachmentsPath();
    if ($attachmentsPath && is_dir($attachmentsPath)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($attachmentsPath), 
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        
        foreach ($files as $name => $file) {
            if (!$file->isDir()) {
                $filePath = $file->getRealPath();
                $relativePath = substr($filePath, strlen($attachmentsPath) + 1);
                
                // Skip hidden files
                if (!str_starts_with($relativePath, '.')) {
                    $zip->addFile($filePath, 'attachments/' . $relativePath);
                }
            }
        }
    }
    
    // Add metadata file for attachments
    include 'db_connect.php';
    $query = "SELECT id, heading, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $queryResult = $con->query($query);
    $metadataInfo = [];
    
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
    
    if (!empty($metadataInfo)) {
        $metadataContent = json_encode($metadataInfo, JSON_PRETTY_PRINT);
        $zip->addFromString('attachments/poznote_attachments_metadata.json', $metadataContent);
    }
    
    // Add README
    $readmeContent = "Poznote Complete Backup\n";
    $readmeContent .= "========================\n\n";
    $readmeContent .= "This backup contains:\n";
    $readmeContent .= "- database/poznote_backup.sql: Complete database dump\n";
    $readmeContent .= "- entries/: All HTML note files\n";
    $readmeContent .= "- attachments/: All attachment files\n";
    $readmeContent .= "- attachments/poznote_attachments_metadata.json: Attachment metadata\n\n";
    $readmeContent .= "Created on: " . date('Y-m-d H:i:s') . "\n";
    $readmeContent .= "Poznote version: " . (file_exists('version.txt') ? trim(file_get_contents('version.txt')) : 'Unknown') . "\n";
    
    $zip->addFromString('README.txt', $readmeContent);
    
    $zip->close();
    
    // Send file to browser
    if (file_exists($zipFileName) && filesize($zipFileName) > 0) {
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="poznote_complete_backup_' . date('Y-m-d_H-i-s') . '.zip"');
        header('Content-Length: ' . filesize($zipFileName));
        header('Cache-Control: no-cache, must-revalidate');
        header('Expires: 0');
        
        readfile($zipFileName);
        unlink($zipFileName);
        exit;
    } else {
        unlink($zipFileName);
        return ['success' => false, 'error' => 'Failed to create backup file'];
    }
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Backup (Export) - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/modal.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
</head>
<body>
    <div class="backup-container">
        <h1><i class="fas fa-upload"></i> Backup (Export)</h1>
        
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
        </a>
        <a href="restore_import.php" class="btn btn-secondary">
            <i class="fas fa-download"></i> Go to Restore (Import)
        </a>

        <br><br>
        
        <!-- Complete Backup Section -->
        <div class="backup-section">
            <h3><i class="fas fa-archive"></i> Complete Backup</h3>
            <p>Download a complete backup containing database, notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span> in a single ZIP file.</p>
            <form method="post">
                <input type="hidden" name="action" value="complete_backup">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download Complete Backup (ZIP)
                </button>
            </form>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>
    
    <script src="js/backup-export.js"></script>
    <script>
    (function(){ try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored && stored !== 'Poznote') {
            var a = document.getElementById('backToNotesLink'); if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
        }
    } catch(e){} })();
    </script>
</body>
</html>
