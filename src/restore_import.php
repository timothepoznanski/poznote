<?php
require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    header('Location: login.php');
    exit;
}

$message = '';
$error = '';

// Variables for specific section messages
$restore_message = '';
$restore_error = '';
$import_notes_message = '';
$import_notes_error = '';
$import_attachments_message = '';
$import_attachments_error = '';

// Process actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'restore':
            if (isset($_FILES['backup_file']) && $_FILES['backup_file']['error'] === UPLOAD_ERR_OK) {
                $result = restoreBackup($_FILES['backup_file']);
                if ($result['success']) {
                    $restore_message = "Database restored successfully!";
                } else {
                    $restore_error = "Restore error: " . $result['error'];
                }
            } else {
                $restore_error = "No backup file selected or upload error.";
            }
            break;
            
        case 'complete_restore':
            if (isset($_FILES['complete_backup_file']) && $_FILES['complete_backup_file']['error'] === UPLOAD_ERR_OK) {
                $result = restoreCompleteBackup($_FILES['complete_backup_file']);
                if ($result['success']) {
                    $restore_message = "Complete backup restored successfully! " . $result['message'];
                } else {
                    $restore_error = "Complete restore error: " . $result['error'] . " - " . $result['message'];
                }
            } else {
                $restore_error = "No complete backup file selected or upload error.";
            }
            break;
            
        case 'import_notes':
            if (isset($_FILES['notes_file']) && $_FILES['notes_file']['error'] === UPLOAD_ERR_OK) {
                $result = importNotesZip($_FILES['notes_file']);
                if ($result['success']) {
                    $import_notes_message = "Notes imported successfully! " . $result['message'];
                } else {
                    $import_notes_error = "Import error: " . $result['error'];
                }
            } else {
                $import_notes_error = "No notes file selected or upload error.";
            }
            break;
            
        case 'import_attachments':
            if (isset($_FILES['attachments_file']) && $_FILES['attachments_file']['error'] === UPLOAD_ERR_OK) {
                $result = importAttachmentsZip($_FILES['attachments_file']);
                if ($result['success']) {
                    $import_attachments_message = "Attachments imported successfully! " . $result['message'];
                } else {
                    $import_attachments_error = "Import error: " . $result['error'];
                }
            } else {
                $import_attachments_error = "No attachments file selected or upload error.";
            }
            break;
    }
}

function restoreCompleteBackup($uploadedFile) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_complete_restore_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Extract ZIP to temporary directory
    $tempExtractDir = '/tmp/poznote_restore_' . uniqid();
    if (!mkdir($tempExtractDir, 0755, true)) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot create temporary directory'];
    }
    
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        rmdir($tempExtractDir);
        return ['success' => false, 'error' => 'Cannot open ZIP file'];
    }
    
    $zip->extractTo($tempExtractDir);
    $zip->close();
    unlink($tempFile);
    
    $results = [];
    $hasErrors = false;
    
    // Restore database if SQL file exists
    $sqlFile = $tempExtractDir . '/database/poznote_backup.sql';
    if (file_exists($sqlFile)) {
        $dbResult = restoreDatabaseFromFile($sqlFile);
        $results[] = 'Database: ' . ($dbResult['success'] ? 'Restored successfully' : 'Failed - ' . $dbResult['error']);
        if (!$dbResult['success']) $hasErrors = true;
    } else {
        $results[] = 'Database: No SQL file found in backup';
    }
    
    // Restore entries if entries directory exists
    $entriesDir = $tempExtractDir . '/entries';
    if (is_dir($entriesDir)) {
        $entriesResult = restoreEntriesFromDir($entriesDir);
        $results[] = 'Notes: ' . ($entriesResult['success'] ? 'Restored ' . $entriesResult['count'] . ' files' : 'Failed - ' . $entriesResult['error']);
        if (!$entriesResult['success']) $hasErrors = true;
    } else {
        $results[] = 'Notes: No entries directory found in backup';
    }
    
    // Restore attachments if attachments directory exists
    $attachmentsDir = $tempExtractDir . '/attachments';
    if (is_dir($attachmentsDir)) {
        $attachmentsResult = restoreAttachmentsFromDir($attachmentsDir);
        $results[] = 'Attachments: ' . ($attachmentsResult['success'] ? 'Restored ' . $attachmentsResult['count'] . ' files' : 'Failed - ' . $attachmentsResult['error']);
        if (!$attachmentsResult['success']) $hasErrors = true;
    } else {
        $results[] = 'Attachments: No attachments directory found in backup';
    }
    
    // Clean up temporary directory
    deleteDirectory($tempExtractDir);
    
    return [
        'success' => !$hasErrors,
        'message' => implode('; ', $results),
        'error' => $hasErrors ? 'Some components failed to restore' : ''
    ];
}

function restoreDatabaseFromFile($sqlFile) {
    $content = file_get_contents($sqlFile);
    if (!$content) {
        return ['success' => false, 'error' => 'Cannot read SQL file'];
    }
    
    $dbPath = SQLITE_DATABASE;
    
    // First, backup current database
    $backupPath = $dbPath . '.backup.' . date('Y-m-d_H-i-s');
    if (file_exists($dbPath)) {
        copy($dbPath, $backupPath);
    }
    
    // Remove current database
    if (file_exists($dbPath)) {
        unlink($dbPath);
    }
    
    // Restore database
    $command = "sqlite3 {$dbPath} < {$sqlFile} 2>&1";
    
    exec($command, $output, $returnCode);
    
    if ($returnCode === 0) {
        return ['success' => true];
    } else {
        $errorMessage = implode("\n", $output);
        return ['success' => false, 'error' => $errorMessage];
    }
}

function restoreEntriesFromDir($sourceDir) {
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    $importedCount = 0;
    
    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            
            if (pathinfo($relativePath, PATHINFO_EXTENSION) === 'html') {
                $targetFile = $entriesPath . '/' . basename($relativePath);
                if (copy($filePath, $targetFile)) {
                    chmod($targetFile, 0644);
                    $importedCount++;
                }
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

function restoreAttachmentsFromDir($sourceDir) {
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        return ['success' => false, 'error' => 'Cannot find attachments directory'];
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir), 
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    
    $importedCount = 0;
    
    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            
            // Skip metadata file
            if (basename($relativePath) === 'poznote_attachments_metadata.json') {
                continue;
            }
            
            $targetFile = $attachmentsPath . '/' . basename($relativePath);
            if (copy($filePath, $targetFile)) {
                chmod($targetFile, 0644);
                $importedCount++;
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    
    foreach ($files as $fileinfo) {
        $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
        $todo($fileinfo->getRealPath());
    }
    
    rmdir($dir);
}

function restoreBackup($uploadedFile) {
    // Check file type
    if (!preg_match('/\.sql$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .sql file'];
    }
    
    $tempFile = '/tmp/poznote_restore_' . uniqid() . '.sql';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Validate SQL file content
    $content = file_get_contents($tempFile);
    if (strpos($content, 'CREATE TABLE') === false && strpos($content, 'INSERT') === false) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'File does not appear to be a valid SQL dump'];
    }
    
    $dbPath = SQLITE_DATABASE;
    
    // First, backup current database
    $backupPath = $dbPath . '.backup.' . date('Y-m-d_H-i-s');
    if (file_exists($dbPath)) {
        copy($dbPath, $backupPath);
    }
    
    // Remove current database
    if (file_exists($dbPath)) {
        unlink($dbPath);
    }
    
    // Restore database
    $command = "sqlite3 {$dbPath} < {$tempFile} 2>&1";
    
    exec($command, $output, $returnCode);
    
    // Clean up temporary file
    if (file_exists($tempFile)) {
        unlink($tempFile);
    }
    
    if ($returnCode === 0) {
        return ['success' => true];
    } else {
        $errorMessage = implode("\n", $output);
        // Clean up common SQL import error messages that might be in the file
        $errorMessage = str_replace('SQLite Import Error:', 'SQL Import Error:', $errorMessage);
        return ['success' => false, 'error' => $errorMessage];
    }
}

function importNotesZip($uploadedFile) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_notes_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Get entries directory using the proper function
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }
    
    // Extract ZIP
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot open ZIP file'];
    }
    
    $importedCount = 0;
    
    // Extract each file
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $filename = $stat['name'];
        
        // Skip directories and non-HTML files
        if (substr($filename, -1) === '/' || !preg_match('/\.html$/i', $filename)) {
            continue;
        }
        
        // Get the base filename without path
        $baseFilename = basename($filename);
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content !== false) {
            $targetFile = $entriesPath . '/' . $baseFilename;
            if (file_put_contents($targetFile, $content) !== false) {
                chmod($targetFile, 0644);
                $importedCount++;
            }
        }
    }
    
    $zip->close();
    // If the ZIP contained an index.html that was restored into the entries folder,
    // remove it to avoid showing a generic index page among notes.
    $indexFile = rtrim($entriesPath, '/') . '/index.html';
    if (file_exists($indexFile)) {
        @unlink($indexFile);
    }

    unlink($tempFile);
    
    return ['success' => true, 'message' => "Imported {$importedCount} HTML files."];
}

function importAttachmentsZip($uploadedFile) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_attachments_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Get attachments directory using the proper function
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot find attachments directory'];
    }
    
    // Extract ZIP
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot open ZIP file'];
    }
    
    $importedCount = 0;
    
    // Extract each file
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $filename = $stat['name'];
        
        // Skip directories
        if (substr($filename, -1) === '/') {
            continue;
        }
        
        // Get the base filename without path
        $baseFilename = basename($filename);
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content !== false) {
            $targetFile = $attachmentsPath . '/' . $baseFilename;
            if (file_put_contents($targetFile, $content) !== false) {
                chmod($targetFile, 0644);
                $importedCount++;
            }
        }
    }
    
    $zip->close();
    unlink($tempFile);
    
    return ['success' => true, 'message' => "Imported {$importedCount} attachment files."];
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Restore (Import) - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/modal.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <style>
        /* Simple confirmation modal */
        .import-confirm-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.4);
            /* Use flex centering when the element is shown (JS sets inline display:flex) */
            align-items: center;
            justify-content: center;
        }

        .import-confirm-modal-content {
            background-color: #fefefe;
            /* remove large top margin so the flex centering can work properly */
            margin: 0 auto;
            padding: 20px;
            border: none;
            border-radius: 8px;
            width: 400px;
            max-width: 90%;
            max-height: 90vh;
            overflow: auto;
            font-family: 'Inter', sans-serif;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            text-align: center;
            box-sizing: border-box;
        }

        .import-confirm-modal-content h3 {
            margin-top: 0;
            margin-bottom: 15px;
            color: rgb(55, 53, 47);
            font-size: 18px;
            font-weight: 600;
        }

        .import-confirm-modal-content p {
            margin-bottom: 20px;
            color: #555;
            line-height: 1.5;
        }

        .import-confirm-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
        }

        .import-confirm-buttons button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-family: 'Inter', sans-serif;
            transition: background-color 0.2s;
        }

        .btn-confirm {
            background-color: #007DB8;
            color: white;
        }

        .btn-confirm:hover {
            background-color: #005a8a;
        }

        .btn-cancel {
            background-color: #f8f9fa;
            color: #333;
            border: 1px solid #ddd;
        }

        .btn-cancel:hover {
            background-color: #e9ecef;
        }

        /* Alert message styling */
        .custom-alert {
            display: none;
            position: fixed;
            z-index: 1001;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.4);
            align-items: center;
            justify-content: center;
        }

        .custom-alert-content {
            background-color: #fefefe;
            margin: 0 auto;
            padding: 20px;
            border: none;
            border-radius: 8px;
            width: 350px;
            max-width: 90%;
            max-height: 80vh;
            overflow: auto;
            font-family: 'Inter', sans-serif;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            text-align: center;
        }

        .custom-alert-content h3 {
            margin-top: 0;
            margin-bottom: 15px;
            color: #dc3545;
            font-size: 18px;
            font-weight: 600;
        }

        .custom-alert-content p {
            margin-bottom: 20px;
            color: #555;
            line-height: 1.5;
        }

        .alert-ok-button {
            padding: 8px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-family: 'Inter', sans-serif;
            transition: background-color 0.2s;
            background-color: #007DB8;
            color: white;
        }

        .alert-ok-button:hover {
            background-color: #005a8a;
        }
    </style>
</head>
<body>
    <div class="backup-container">
        <h1><i class="fas fa-download"></i> Restore (Import)</h1>
        <p>Import data from backup files.</p>
        
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
        </a>
        <a href="backup_export.php" class="btn btn-secondary">
            <i class="fas fa-upload"></i> Go to Backup (Export)
        </a>
        <br><br>
        
        <!-- Complete Import Section -->
        <div class="backup-section">
            <h3><i class="fas fa-archive"></i> Complete Restore</h3>
            
            <?php if ($restore_message && isset($_POST['action']) && $_POST['action'] === 'complete_restore'): ?>
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($restore_message); ?>
                </div>
            <?php endif; ?>
            
            <?php if ($restore_error && isset($_POST['action']) && $_POST['action'] === 'complete_restore'): ?>
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($restore_error); ?>
                </div>
            <?php endif; ?>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                </div>
                
                <button type="button" class="btn btn-primary" onclick="showCompleteRestoreConfirmation()">
                    <i class="fas fa-upload"></i> Complete Restore
                </button>
            </form>
            
            <div class="info-box" style="background: #e3f2fd; border: 1px solid #1976d2; border-radius: 4px; padding: 12px; margin: 15px 0; font-size: 14px;">
                <i class="fas fa-info-circle" style="color: #1976d2; margin-right: 8px;"></i>
                <strong>Automatic Backup:</strong> Your current database will be automatically backed up before restore. 
                Backup files are stored in <code>data/database/</code> with format <code>poznote.db.backup.YYYY-MM-DD_HH-MM-SS</code>.
            </div>
        </div>
        
        <!-- Advanced Import Section -->
        <div class="backup-section">
            <h3><i class="fas fa-cogs"></i> Advanced Import Options</h3>
            <p>For specific needs, you can import individual components separately.</p>
            <button type="button" class="btn btn-secondary" onclick="toggleAdvancedImport()">
                <i class="fas fa-chevron-down"></i> Show Advanced Import Options
            </button>
        </div>
        
        <!-- Advanced Import Options (hidden by default) -->
        <div id="advancedImportOptions" style="display: none;">
            <!-- Import Database Section -->
            <div class="backup-section">
                <h3><i class="fas fa-database"></i> Import Database Only</h3>
                <p><strong>⚠️ Warning:</strong> This will replace note titles, tags, search index and metadata, but not the actual note content!</p>
                
                <?php if ($restore_message && (!isset($_POST['action']) || $_POST['action'] !== 'complete_restore')): ?>
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($restore_message); ?>
                    </div>
                <?php endif; ?>
                
                <?php if ($restore_error && (!isset($_POST['action']) || $_POST['action'] !== 'complete_restore')): ?>
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($restore_error); ?>
                    </div>
                <?php endif; ?>

                <form method="post" enctype="multipart/form-data">
                    <input type="hidden" name="action" value="restore">
                    <div class="form-group">
                        <label for="backup_file">SQL file to import:</label>
                        <input type="file" id="backup_file" name="backup_file" accept=".sql" required>
                    </div>
                    
                    <div class="info-box" style="background: #e3f2fd; border: 1px solid #1976d2; border-radius: 4px; padding: 12px; margin: 15px 0; font-size: 14px;">
                        <i class="fas fa-info-circle" style="color: #1976d2; margin-right: 8px;"></i>
                        <strong>Automatic Backup:</strong> Your current database will be automatically backed up before import. 
                        Backup files are stored in <code>data/database/</code> with format <code>poznote.db.backup.YYYY-MM-DD_HH-MM-SS</code>.
                    </div>
                    
                    <button type="button" class="btn btn-primary" onclick="showImportConfirmation()">
                        <i class="fas fa-upload"></i> Import Database
                    </button>
                </form>
            </div>
            
            <!-- Import Notes Section -->
            <div class="backup-section">
                <h3><i class="fas fa-file-upload"></i> Import Notes Only</h3>
                <p>Upload a ZIP file containing HTML notes to import. Notes will be added to your existing collection.</p>
                
                <?php if ($import_notes_message): ?>
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($import_notes_message); ?>
                    </div>
                <?php endif; ?>
                
                <?php if ($import_notes_error): ?>
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($import_notes_error); ?>
                    </div>
                <?php endif; ?>
                
                <form method="post" enctype="multipart/form-data">
                    <input type="hidden" name="action" value="import_notes">
                    <div class="form-group">
                        <label for="notes_file">ZIP file containing notes:</label>
                        <input type="file" id="notes_file" name="notes_file" accept=".zip" required>
                    </div>
                    <button type="button" class="btn btn-primary" onclick="showNotesImportConfirmation()">
                        <i class="fas fa-upload"></i> Import Notes (ZIP)
                    </button>
                </form>
            </div>
            
            <!-- Import Attachments Section -->
            <div class="backup-section">
                <h3><i class="fas fa-paperclip"></i> Import Attachments Only</h3>
                <p>Upload a ZIP file containing attachments to import. Files will be added to your attachments folder.</p>
                
                <?php if ($import_attachments_message): ?>
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($import_attachments_message); ?>
                    </div>
                <?php endif; ?>
                
                <?php if ($import_attachments_error): ?>
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($import_attachments_error); ?>
                    </div>
                <?php endif; ?>
                
                <form method="post" enctype="multipart/form-data">
                    <input type="hidden" name="action" value="import_attachments">
                    <div class="form-group">
                        <label for="attachments_file">ZIP file containing attachments:</label>
                        <input type="file" id="attachments_file" name="attachments_file" accept=".zip" required>
                    </div>
                    <button type="button" class="btn btn-primary" onclick="showAttachmentsImportConfirmation()">
                        <i class="fas fa-upload"></i> Import Attachments (ZIP)
                    </button>
                </form>
            </div>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <!-- Simple Import Confirmation Modal -->
    <div id="importConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Are you sure?</h3>
            <p>This will replace note titles, tags, search index and metadata, but not the actual note content. This action cannot be undone.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideImportConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithImport()">
                    Yes, Import
                </button>
            </div>
        </div>
    </div>

    <!-- Complete Restore Confirmation Modal -->
    <div id="completeRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Complete Restore?</h3>
            <p><strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideCompleteRestoreConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithCompleteRestore()">
                    Yes, Complete Restore
                </button>
            </div>
        </div>
    </div>

    <!-- Notes Import Confirmation Modal -->
    <div id="notesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Import Notes?</h3>
            <p>This will import all HTML files from the ZIP. Files will be added to your existing notes collection.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideNotesImportConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithNotesImport()">
                    Yes, Import Notes
                </button>
            </div>
        </div>
    </div>

    <!-- Attachments Import Confirmation Modal -->
    <div id="attachmentsImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Import Attachments?</h3>
            <p>This will import all files from the ZIP to attachments folder. Files will be added to your existing attachments.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideAttachmentsImportConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithAttachmentsImport()">
                    Yes, Import Attachments
                </button>
            </div>
        </div>
    </div>

    <!-- Custom Alert Modal -->
    <div id="customAlert" class="custom-alert">
        <div class="custom-alert-content">
            <h3 id="alertTitle">No File Selected</h3>
            <p id="alertMessage">Please select a file before proceeding with the import.</p>
            <button type="button" class="alert-ok-button" onclick="hideCustomAlert()">
                OK
            </button>
        </div>
    </div>
    
    <script src="js/restore-import.js"></script>
</body>
</html>

<script>
// Ensure Back to Notes opens the stored workspace if present
(function(){ try {
    var stored = localStorage.getItem('poznote_selected_workspace');
    if (stored && stored !== 'Poznote') {
        var a = document.getElementById('backToNotesLink'); if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
    }
} catch(e){} })();
</script>