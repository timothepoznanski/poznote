<?php
require_once 'auth.php';
require_once 'config.php';

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
        case 'backup':
            $result = createBackup();
            // createBackup() handles download directly, so we only get here on error
            if (!$result['success']) {
                $error = "Export error: " . $result['error'];
            }
            break;
            
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
                    $import_notes_message = "Notes imported successfully! " . $result['count'] . " files processed.";
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
                    $import_attachments_message = $result['message'] ?? "Attachments imported successfully! " . $result['count'] . " files processed.";
                } else {
                    $import_attachments_error = "Import error: " . $result['error'];
                }
            } else {
                $import_attachments_error = "No attachments file selected or upload error.";
            }
            break;
    }
}

function createBackup() {
    $timestamp = date('Y-m-d_H-i-s');
    $filename = "poznote_export_{$timestamp}.sql";
    
    $host = MYSQL_HOST;
    $user = MYSQL_USER;
    $password = MYSQL_PASSWORD;
    $database = MYSQL_DATABASE;
    
    // Use mysqldump to create export and send directly to browser
    $command = "mysqldump --single-transaction --routines --triggers -h {$host} -u {$user} -p{$password} {$database} 2>/dev/null";
    
    ob_start();
    $handle = popen($command, 'r');
    
    if ($handle) {
        $output = stream_get_contents($handle);
        $returnCode = pclose($handle);
        
        if ($returnCode === 0 && !empty($output) && strpos($output, 'CREATE TABLE') !== false) {
            // Send file directly to browser for download
            header('Content-Type: application/sql');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($output));
            header('Cache-Control: no-cache, must-revalidate');
            header('Expires: 0');
            
            ob_end_clean();
            echo $output;
            exit;
        } else {
            ob_end_clean();
            return ['success' => false, 'error' => 'Export failed or returned empty result'];
        }
    } else {
        ob_end_clean();
        return ['success' => false, 'error' => 'Unable to execute mysqldump'];
    }
}

function restoreBackup($uploadedFile) {
    // Check file type
    $allowedTypes = ['application/sql', 'text/plain', 'application/octet-stream'];
    if (!in_array($uploadedFile['type'], $allowedTypes) && 
        !preg_match('/\.sql$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .sql file'];
    }
    
    $tempFile = '/tmp/poznote_restore_' . uniqid() . '.sql';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Validate SQL file content
    $content = file_get_contents($tempFile);
    if (empty($content)) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'SQL file is empty'];
    }
    
    // Check if file contains mysqldump error messages
    if (strpos($content, 'mysqldump: Error:') !== false || 
        strpos($content, 'Access denied') !== false) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'SQL file contains export errors. Please generate a new export.'];
    }
    
    // Basic SQL validation
    if (strpos($content, 'CREATE TABLE') === false && 
        strpos($content, 'INSERT INTO') === false &&
        strpos($content, 'DROP TABLE') === false) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'File does not appear to be a valid SQL dump'];
    }
    
    $host = MYSQL_HOST;
    $user = MYSQL_USER;
    $password = MYSQL_PASSWORD;
    $database = MYSQL_DATABASE;
    
    // Restore database
    $command = "mysql -h {$host} -u {$user} -p{$password} {$database} < {$tempFile} 2>&1";
    
    exec($command, $output, $returnCode);
    
    // Clean up temporary file
    if (file_exists($tempFile)) {
        unlink($tempFile);
    }
    
    if ($returnCode === 0) {
        return ['success' => true];
    } else {
        $errorMessage = implode("\n", $output);
        // Clean up common mysqldump error messages that might be in the file
        $errorMessage = str_replace('mysqldump: Error:', 'SQL Import Error:', $errorMessage);
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
    
    // Determine entries directory
    $entriesPaths = [
        realpath('entries'),
        realpath('../data/entries'),
    ];
    
    $entriesPath = null;
    foreach ($entriesPaths as $path) {
        if ($path && is_dir($path)) {
            $entriesPath = $path;
            break;
        }
    }
    
    if (!$entriesPath) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Entries directory not found'];
    }
    
    // Extract ZIP file
    $zip = new ZipArchive();
    $result = $zip->open($tempFile);
    
    if ($result !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot open ZIP file. Error code: ' . $result];
    }
    
    $extractedCount = 0;
    
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $filename = $zip->getNameIndex($i);
        
        // Only extract HTML files, skip directories and non-HTML files
        if (!str_ends_with($filename, '/') && pathinfo($filename, PATHINFO_EXTENSION) === 'html') {
            $baseName = basename($filename);
            $targetPath = $entriesPath . '/' . $baseName;
            
            // Extract file
            if ($zip->extractTo($entriesPath, $filename)) {
                // Move to correct location if extracted to subdirectory
                $extractedPath = $entriesPath . '/' . $filename;
                if ($extractedPath !== $targetPath && file_exists($extractedPath)) {
                    rename($extractedPath, $targetPath);
                    // Clean up any empty directories
                    $dir = dirname($extractedPath);
                    if ($dir !== $entriesPath && is_dir($dir) && count(scandir($dir)) === 2) {
                        rmdir($dir);
                    }
                }
                $extractedCount++;
            }
        }
    }
    
    $zip->close();
    unlink($tempFile);
    
    // Set proper permissions
    chmod($entriesPath, 0755);
    $files = glob($entriesPath . '/*.html');
    foreach ($files as $file) {
        chmod($file, 0644);
    }
    
    return ['success' => true, 'count' => $extractedCount];
}

function importAttachmentsZip($uploadedFile) {
    global $con;
    
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_attachments_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => 'Error uploading file'];
    }
    
    // Find attachments directory
    $attachmentsPaths = [
        realpath('attachments'),
        realpath('../data/attachments'),
    ];
    
    $attachmentsPath = null;
    foreach ($attachmentsPaths as $path) {
        if ($path && is_dir($path)) {
            $attachmentsPath = $path;
            break;
        }
    }
    
    if (!$attachmentsPath) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Attachments directory not found'];
    }
    
    // Open ZIP file
    $zip = new ZipArchive();
    $result = $zip->open($tempFile);
    
    if ($result !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot open ZIP file. Error code: ' . $result];
    }
    
    $extractedCount = 0;
    $linkedCount = 0;
    $metadata = [];
    $hasMetadata = false;
    
    // First: Check if we have metadata (simplified)
    $metadataContent = $zip->getFromName('poznote_attachments_metadata.json');
    if ($metadataContent) {
        $decoded = json_decode($metadataContent, true);
        if ($decoded && is_array($decoded)) {
            $metadata = $decoded;
            $hasMetadata = true;
        }
    }
    
    // Second: Extract all files (simplified logic)
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $filename = $zip->getNameIndex($i);
        
        // Skip directories and special files
        if (!str_ends_with($filename, '/') && 
            $filename !== 'README.txt' && 
            $filename !== 'poznote_attachments_metadata.json') {
            
            $baseName = basename($filename);
            $targetPath = $attachmentsPath . '/' . $baseName;
            
            // Extract file
            if ($zip->extractTo($attachmentsPath, $filename)) {
                $extractedPath = $attachmentsPath . '/' . $filename;
                if ($extractedPath !== $targetPath && file_exists($extractedPath)) {
                    rename($extractedPath, $targetPath);
                    $dir = dirname($extractedPath);
                    if ($dir !== $attachmentsPath && is_dir($dir) && count(scandir($dir)) === 2) {
                        rmdir($dir);
                    }
                }
                $extractedCount++;
            }
        }
    }
    
    $zip->close();
    unlink($tempFile);
    
    // Set permissions
    chmod($attachmentsPath, 0755);
    $files = glob($attachmentsPath . '/*');
    foreach ($files as $file) {
        if (is_file($file)) {
            chmod($file, 0644);
        }
    }
    
    // Third: Link files to notes if we have metadata (with error handling)
    if ($hasMetadata && !empty($metadata) && isset($con)) {
        foreach ($metadata as $item) {
            if (!isset($item['note_id']) || !isset($item['attachment_data'])) {
                continue; // Skip malformed entries
            }
            
            $noteId = $item['note_id'];
            $attachmentData = $item['attachment_data'];
            $filename = $attachmentData['filename'] ?? '';
            
            if (empty($filename) || !file_exists($attachmentsPath . '/' . $filename)) {
                continue; // Skip if file doesn't exist
            }
            
            try {
                // Check if note exists
                $checkQuery = "SELECT id, attachments FROM entries WHERE id = ?";
                $stmt = $con->prepare($checkQuery);
                $stmt->bind_param("i", $noteId);
                $stmt->execute();
                $result = $stmt->get_result();
                
                if ($result->num_rows > 0) {
                    $row = $result->fetch_assoc();
                    $currentAttachments = $row['attachments'] ? json_decode($row['attachments'], true) : [];
                    
                    if (!is_array($currentAttachments)) {
                        $currentAttachments = [];
                    }
                    
                    // Check if attachment already exists
                    $exists = false;
                    foreach ($currentAttachments as $existing) {
                        if (isset($existing['filename']) && $existing['filename'] === $filename) {
                            $exists = true;
                            break;
                        }
                    }
                    
                    if (!$exists) {
                        $currentAttachments[] = $attachmentData;
                        $updateQuery = "UPDATE entries SET attachments = ? WHERE id = ?";
                        $updateStmt = $con->prepare($updateQuery);
                        $attachmentsJson = json_encode($currentAttachments);
                        $updateStmt->bind_param("si", $attachmentsJson, $noteId);
                        if ($updateStmt->execute()) {
                            $linkedCount++;
                        }
                    }
                }
            } catch (Exception $e) {
                // Continue processing other files even if one fails
                continue;
            }
        }
    }
    
    // Create result message
    if ($hasMetadata) {
        $message = "✅ Successfully imported {$extractedCount} files and linked {$linkedCount} attachments to notes";
    } else {
        $message = "⚠️ Successfully imported {$extractedCount} files (no metadata found - files copied but not linked to notes)";
    }
    
    return [
        'success' => true, 
        'count' => $extractedCount, 
        'linked' => $linkedCount,
        'message' => $message
    ];
}

$backups = [];
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Export/Import</title>
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
</head>
<body>
    <div class="backup-container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h2><i class="fas fa-database"></i> Database Export / Import</h2>
            <a href="index.php" class="btn-back" style="text-decoration: none; color: #666; font-size: 14px; padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; transition: all 0.2s;">
                <i class="fas fa-arrow-left" style="margin-right: 6px;"></i>Retour aux notes
            </a>
        </div>
        
        <!-- Information Section -->
            <div class="warning">
                <h4>For a complete restoration, export all three components:</h4>
                <ol>
                    <li><strong>Notes</strong> - Your note content (HTML files)</li>
                    <li><strong>Attachments</strong> - Attachments files</li>
                    <li><strong>Database</strong> - Structure, tags, folders, settings</li>
                </ol>
                <h4>For offline reading (no Poznote needed), export only html notes.</h4>

        </div>
        
        <!-- Export Notes Section -->
        <div class="backup-section">
            <h3><i class="fas fa-file-archive"></i> Export Notes</h3>
            <p>Download all notes as HTML files in a ZIP archive (perfect for offline reading).</p>
            <button type="button" class="btn btn-primary" onclick="startDownload();">
                <i class="fas fa-download"></i> Download Notes (ZIP)
            </button>
        </div>
        
        <!-- Export Attachments Section -->
        <div class="backup-section">
            <h3><i class="fas fa-paperclip"></i> Export Attachments</h3>
            <p>Download all attached files in a ZIP archive.</p>
            <button type="button" class="btn btn-primary" onclick="startAttachmentsDownload();">
                <i class="fas fa-download"></i> Download Attachments (ZIP)
            </button>
        </div>
        
        <!-- Export Database Section -->
        <div class="backup-section">
            <h3><i class="fas fa-download"></i> Export Database</h3>
            <p>Download database structure (SQL format).</p>
            <form method="post">
                <input type="hidden" name="action" value="backup">
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-download"></i> Download Database (SQL)
                </button>
            </form>
        </div>
        
        <!-- Import Database Section -->
        <div class="backup-section">
            <h3><i class="fas fa-upload"></i> Import Database</h3>
            <?php if (!empty($restore_message)): ?>
                <div class="message success"><?php echo htmlspecialchars($restore_message); ?></div>
            <?php endif; ?>
            <?php if (!empty($restore_error)): ?>
                <div class="message error"><?php echo htmlspecialchars($restore_error); ?></div>
            <?php endif; ?>
            <div class="warning">
                <strong>Warning:</strong> This will replace your current database completely. Make sure you have a backup first.
            </div>
            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="restore">
                <div class="form-group">
                    <label for="backup_file">SQL file to import:</label>
                    <input type="file" id="backup_file" name="backup_file" accept=".sql" required>
                </div>
                <button type="submit" class="btn btn-success" onclick="return confirm('Are you sure you want to import this database? This will replace all your current data.')">
                    <i class="fas fa-upload"></i> Import Database
                </button>
            </form>
        </div>
        
        <!-- Import Notes Section -->
        <div class="backup-section">
            <h3><i class="fas fa-file-upload"></i> Import Notes</h3>
            <?php if (!empty($import_notes_message)): ?>
                <div class="message success"><?php echo htmlspecialchars($import_notes_message); ?></div>
            <?php endif; ?>
            <?php if (!empty($import_notes_error)): ?>
                <div class="message error"><?php echo htmlspecialchars($import_notes_error); ?></div>
            <?php endif; ?>
            <p>Upload a ZIP file containing HTML notes to import.</p>
            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="import_notes">
                <div class="form-group">
                    <label for="notes_file">ZIP file containing notes:</label>
                    <input type="file" id="notes_file" name="notes_file" accept=".zip" required>
                </div>
                <button type="submit" class="btn btn-success" onclick="return confirm('This will import all HTML files from the ZIP. Continue?')">
                    <i class="fas fa-upload"></i> Import Notes (ZIP)
                </button>
            </form>
        </div>
        
        <!-- Import Attachments Section -->
        <div class="backup-section">
            <h3><i class="fas fa-paperclip"></i> Import Attachments</h3>
            <?php if (!empty($import_attachments_message)): ?>
                <div class="message success"><?php echo htmlspecialchars($import_attachments_message); ?></div>
            <?php endif; ?>
            <?php if (!empty($import_attachments_error)): ?>
                <div class="message error"><?php echo htmlspecialchars($import_attachments_error); ?></div>
            <?php endif; ?>
            <p>Upload a ZIP file containing attachments to import.</p>
            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="import_attachments">
                <div class="form-group">
                    <label for="attachments_file">ZIP file containing attachments:</label>
                    <input type="file" id="attachments_file" name="attachments_file" accept=".zip" required>
                </div>
                <button type="submit" class="btn btn-success" onclick="return confirm('This will import all files from the ZIP to attachments folder. Continue?')">
                    <i class="fas fa-upload"></i> Import Attachments (ZIP)
                </button>
            </form>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>
    
    <script>
    // Function to download notes as ZIP
    function startDownload() {
        // Create a direct link to the export script
        window.location.href = 'exportEntries.php';
    }
    
    // Function to download attachments as ZIP
    function startAttachmentsDownload() {
        // Create a direct link to the attachments export script
        window.location.href = 'exportAttachments.php';
    }
    </script>
</body>
</html>
