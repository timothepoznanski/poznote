<?php
require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';

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
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        /* Custom confirmation modal for import */
        .import-confirm-modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            backdrop-filter: blur(2px);
        }

        .import-confirm-modal-content {
            background-color: #ffffff;
            margin: 10% auto;
            padding: 0;
            border: none;
            border-radius: 12px;
            width: 480px;
            max-width: 90%;
            font-family: 'Inter', sans-serif;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            overflow: hidden;
            animation: modalSlideIn 0.3s ease-out;
        }

        @keyframes modalSlideIn {
            from { transform: translateY(-50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        .import-confirm-header {
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: white;
            padding: 20px 24px;
            text-align: center;
            border-bottom: none;
        }

        .import-confirm-header i {
            font-size: 2.5rem;
            margin-bottom: 8px;
            display: block;
            opacity: 0.9;
        }

        .import-confirm-header h3 {
            margin: 0;
            font-size: 1.4rem;
            font-weight: 600;
            color: white;
        }

        .import-confirm-body {
            padding: 24px;
            text-align: center;
        }

        .import-confirm-warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            color: #856404;
        }

        .import-confirm-warning strong {
            color: #dc3545;
            display: block;
            margin-bottom: 8px;
            font-size: 1.1rem;
        }

        .import-confirm-list {
            text-align: left;
            margin: 12px 0;
            padding-left: 20px;
        }

        .import-confirm-list li {
            margin: 6px 0;
            color: #495057;
        }

        .import-confirm-buttons {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
        }

        .import-confirm-buttons button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-family: 'Inter', sans-serif;
            font-weight: 500;
            transition: all 0.2s;
            min-width: 120px;
        }

        .btn-danger-confirm {
            background-color: #dc3545;
            color: white;
        }

        .btn-danger-confirm:hover {
            background-color: #c82333;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }

        .btn-secondary-cancel {
            background-color: #f8f9fa;
            color: #6c757d;
            border: 1px solid #dee2e6;
        }

        .btn-secondary-cancel:hover {
            background-color: #e9ecef;
            color: #495057;
        }
    </style>
</head>
<body>
    <div class="backup-container">
        <h1><i class="fas fa-upload"></i> Restore (Import)</h1>
        <p>Import data from backup files.</p>
        
        <div class="navigation">
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
            <a href="backup_export.php" class="btn btn-secondary">
                <i class="fas fa-download"></i> Go to Backup (Export)
            </a>
        </div>
        
        <!-- Information Section -->
        <div class="warning">
            <h4>⚠️ Important Notes:</h4>
            <ul>
                <li><strong>Database restore</strong> will replace ALL your current data</li>
                <li><strong>Notes import</strong> will add to existing notes (no overwrite)</li>
                <li><strong>Attachments import</strong> will add to existing attachments (no overwrite)</li>
                <li>Always backup your current data before restoring</li>
            </ul>
        </div>
        
        <!-- Import Database Section -->
        <div class="backup-section">
            <h3><i class="fas fa-database"></i> Import Database</h3>
            <p><strong>⚠️ Warning:</strong> This will replace all your current data!</p>
            
            <?php if ($restore_message): ?>
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($restore_message); ?>
                </div>
            <?php endif; ?>
            
            <?php if ($restore_error): ?>
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
                <button type="button" class="btn btn-primary" onclick="showImportConfirmation()">
                    <i class="fas fa-upload"></i> Import Database
                </button>
            </form>
        </div>
        
        <!-- Import Notes Section -->
        <div class="backup-section">
            <h3><i class="fas fa-file-upload"></i> Import Notes</h3>
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
                <button type="submit" class="btn btn-primary" onclick="return confirm('This will import all HTML files from the ZIP. Continue?')">
                    <i class="fas fa-upload"></i> Import Notes (ZIP)
                </button>
            </form>
        </div>
        
        <!-- Import Attachments Section -->
        <div class="backup-section">
            <h3><i class="fas fa-paperclip"></i> Import Attachments</h3>
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
                <button type="submit" class="btn btn-primary" onclick="return confirm('This will import all files from the ZIP to attachments folder. Continue?')">
                    <i class="fas fa-upload"></i> Import Attachments (ZIP)
                </button>
            </form>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <!-- Custom Import Confirmation Modal -->
    <div id="importConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <div class="import-confirm-header">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Database Import Warning</h3>
            </div>
            <div class="import-confirm-body">
                <div class="import-confirm-warning">
                    <strong>⚠️ CRITICAL WARNING</strong>
                    This action will completely replace your current database!
                </div>
                
                <p><strong>This will permanently delete:</strong></p>
                <ul class="import-confirm-list">
                    <li>All your existing notes and content</li>
                    <li>All folders and organization</li>
                    <li>All tags and categories</li>
                    <li>All settings and preferences</li>
                    <li>All attachments and files</li>
                </ul>
                
                <p style="color: #dc3545; font-weight: 600; margin-top: 16px;">
                    This action cannot be undone!
                </p>
                
                <div class="import-confirm-buttons">
                    <button type="button" class="btn-secondary-cancel" onclick="hideImportConfirmation()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button type="button" class="btn-danger-confirm" onclick="proceedWithImport()">
                        <i class="fas fa-upload"></i> Yes, Import Database
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        function showImportConfirmation() {
            const fileInput = document.getElementById('backup_file');
            if (!fileInput.files.length) {
                alert('Please select a SQL file first.');
                return;
            }
            document.getElementById('importConfirmModal').style.display = 'block';
        }

        function hideImportConfirmation() {
            document.getElementById('importConfirmModal').style.display = 'none';
        }

        function proceedWithImport() {
            // Submit the form
            const form = document.querySelector('form[method="post"]');
            form.submit();
        }

        // Close modal when clicking outside
        document.getElementById('importConfirmModal').addEventListener('click', function(e) {
            if (e.target === this) {
                hideImportConfirmation();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                hideImportConfirmation();
            }
        });
    </script>
</body>
</html>
