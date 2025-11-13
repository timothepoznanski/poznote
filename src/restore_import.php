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
$import_individual_notes_message = '';
$import_individual_notes_error = '';

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
            
        case 'import_individual_notes':
            if (isset($_FILES['individual_notes_files']) && !empty($_FILES['individual_notes_files']['name'][0])) {
                $workspace = $_POST['target_workspace'] ?? 'Poznote';
                $folder = $_POST['target_folder'] ?? 'Default';
                $result = importIndividualNotes($_FILES['individual_notes_files'], $workspace, $folder);
                if ($result['success']) {
                    $import_individual_notes_message = "Notes imported successfully! " . $result['message'];
                } else {
                    $import_individual_notes_error = "Import error: " . $result['error'];
                }
            } else {
                $import_individual_notes_error = "No notes selected or upload error.";
            }
            break;
    }
}

function extractTaskListFromHTML($htmlContent) {
    $tasks = [];
    
    // Use DOMDocument to parse HTML
    $dom = new DOMDocument();
    @$dom->loadHTML($htmlContent, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    
    $xpath = new DOMXPath($dom);
    $taskItems = $xpath->query('//div[contains(@class, "task-item")]');
    
    foreach ($taskItems as $taskItem) {
        $taskId = $taskItem->getAttribute('data-task-id');
        if (!$taskId) continue;
        
        $classes = $taskItem->getAttribute('class');
        $completed = strpos($classes, 'completed') !== false;
        $important = strpos($classes, 'important') !== false;
        
        // Find task text
        $textSpan = $xpath->query('.//span[contains(@class, "task-text")]', $taskItem)->item(0);
        $text = $textSpan ? trim($textSpan->textContent) : '';
        
        $tasks[] = [
            'id' => floatval($taskId),
            'text' => $text,
            'completed' => $completed,
            'important' => $important
        ];
    }
    
    return json_encode($tasks);
}

function importNotesZip($uploadedFile) {
    global $con;
    
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
    $updatedCount = 0;
    $errors = [];
    
    // Extract each file and create/update database entries
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $filename = $stat['name'];
        
        // Skip directories and non-note files
        if (substr($filename, -1) === '/' || !preg_match('/\.(html|md)$/i', $filename)) {
            continue;
        }
        
        // Get the base filename without path
        $baseFilename = basename($filename);
        
        // Extract note ID from filename (e.g., "123.html" -> 123)
        $noteId = null;
        if (preg_match('/^(\d+)\.(html|md)$/i', $baseFilename, $matches)) {
            $noteId = intval($matches[1]);
            $fileExtension = strtolower($matches[2]);
        } else {
            // Skip files that don't follow the ID.extension pattern
            continue;
        }
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            $errors[] = "Failed to extract content from {$baseFilename}";
            continue;
        }
        
        // Determine note type based on file extension and content
        $noteType = ($fileExtension === 'md') ? 'markdown' : 'note';
        
        // Check if content is valid JSON (indicates tasklist)
        $trimmedContent = trim($content);
        if ($noteType === 'note' && $trimmedContent !== '' && 
            ($trimmedContent[0] === '[' || $trimmedContent[0] === '{')) {
            // Try to decode as JSON
            $jsonTest = json_decode($trimmedContent, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($jsonTest)) {
                $noteType = 'tasklist';
            }
        } elseif ($noteType === 'note' && strpos($content, 'task-item') !== false) {
            // Check if HTML content contains task items (exported tasklist)
            if (preg_match('/<div[^>]*class="[^"]*task-item[^"]*"/', $content)) {
                $noteType = 'tasklist';
                // Convert HTML tasklist to JSON
                $content = extractTaskListFromHTML($content);
            }
        }
        
        // Extract title from content
        $title = 'Imported Note';
        if ($noteType === 'markdown') {
            // For markdown files, try to extract title from first line if it's a heading
            $lines = explode("\n", $content);
            foreach ($lines as $line) {
                $line = trim($line);
                if (preg_match('/^#\s+(.+)$/', $line, $matches)) {
                    $title = trim($matches[1]);
                    break;
                }
            }
        } elseif ($noteType === 'tasklist') {
            // For tasklist files, use the filename without extension as title
            $title = pathinfo($baseFilename, PATHINFO_FILENAME);
        } else {
            // For HTML files, try to extract title from <title> or <h1> tags
            if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $content, $matches)) {
                $extractedTitle = trim(strip_tags($matches[1]));
                if (!empty($extractedTitle)) {
                    $title = $extractedTitle;
                }
            } elseif (preg_match('/<h1[^>]*>(.*?)<\/h1>/is', $content, $matches)) {
                $extractedTitle = trim(strip_tags($matches[1]));
                if (!empty($extractedTitle)) {
                    $title = $extractedTitle;
                }
            }
        }
        
        // Write file to entries directory
        $targetFile = $entriesPath . '/' . $baseFilename;
        if (file_put_contents($targetFile, $content) === false) {
            $errors[] = "Failed to write file {$baseFilename}";
            continue;
        }
        chmod($targetFile, 0644);
        
        try {
            // Check if entry exists in database and get current type
            $checkStmt = $con->prepare("SELECT id, type FROM entries WHERE id = ?");
            $checkStmt->execute([$noteId]);
            $existingEntry = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existingEntry) {
                $oldType = $existingEntry['type'] ?? 'note';
                
                // If type is changing, remove old file with old extension
                if ($oldType !== $noteType) {
                    $oldExtension = ($oldType === 'markdown') ? '.md' : '.html';
                    $oldFile = $entriesPath . '/' . $noteId . $oldExtension;
                    if (file_exists($oldFile)) {
                        @unlink($oldFile);
                    }
                }
                
                // Update existing entry
                $updateStmt = $con->prepare("UPDATE entries SET heading = ?, entry = ?, type = ?, updated = datetime('now') WHERE id = ?");
                $updateStmt->execute([$title, $content, $noteType, $noteId]);
                $updatedCount++;
            } else {
                // Insert new entry with specific ID
                // Get folder_id for 'Default' folder in 'Poznote' workspace
                $folderIdStmt = $con->prepare("SELECT id FROM folders WHERE name = 'Default' AND (workspace = 'Poznote' OR (workspace IS NULL AND 'Poznote' = 'Poznote'))");
                $folderIdStmt->execute();
                $folderData = $folderIdStmt->fetch(PDO::FETCH_ASSOC);
                $folderId = $folderData ? (int)$folderData['id'] : null;
                
                $insertStmt = $con->prepare("INSERT INTO entries (id, heading, entry, folder, folder_id, workspace, type, created, updated, trash, favorite) VALUES (?, ?, ?, 'Default', ?, 'Poznote', ?, datetime('now'), datetime('now'), 0, 0)");
                $insertStmt->execute([$noteId, $title, $content, $folderId, $noteType]);
                $importedCount++;
            }
        } catch (Exception $e) {
            $errors[] = "Database error for {$baseFilename}: " . $e->getMessage();
            continue;
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
    
    $message = "Processed note files: {$importedCount} imported, {$updatedCount} updated (HTML, Markdown, and Tasklist).";
    if (!empty($errors)) {
        $message .= " Errors: " . implode('; ', $errors);
    }
    
    return ['success' => true, 'message' => $message];
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

function importIndividualNotes($uploadedFiles, $workspace = 'Poznote', $folder = 'Default') {
    global $con;
    
    // Check file count limit
    $maxFiles = 50;
    $fileCount = count($uploadedFiles['name']);
    
    if ($fileCount > $maxFiles) {
        return ['success' => false, 'error' => "Too many files selected. Maximum allowed: {$maxFiles}. You selected: {$fileCount}."];
    }
    
    // Validate workspace exists
    $stmt = $con->prepare("SELECT name FROM workspaces WHERE name = ?");
    $stmt->execute([$workspace]);
    if (!$stmt->fetch()) {
        return ['success' => false, 'error' => 'Workspace does not exist'];
    }
    
    $entriesPath = getEntriesPath();
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }
    
    $importedCount = 0;
    $errorCount = 0;
    $errors = [];
    
    // Handle multiple file uploads
    $fileCount = count($uploadedFiles['name']);
    
    for ($i = 0; $i < $fileCount; $i++) {
        // Skip if there was an upload error
        if ($uploadedFiles['error'][$i] !== UPLOAD_ERR_OK) {
            $errorCount++;
            $errors[] = $uploadedFiles['name'][$i] . ': Upload error';
            continue;
        }
        
        $fileName = $uploadedFiles['name'][$i];
        $tmpName = $uploadedFiles['tmp_name'][$i];
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Validate file type
        if (!in_array($fileExtension, ['html', 'md', 'markdown'])) {
            $errorCount++;
            $errors[] = $fileName . ': Invalid file type (only .html, .md, .markdown allowed)';
            continue;
        }
        
        // Read file content
        $content = file_get_contents($tmpName);
        if ($content === false) {
            $errorCount++;
            $errors[] = $fileName . ': Cannot read file';
            continue;
        }
        
        // Determine note type based on file extension
        $noteType = ($fileExtension === 'md' || $fileExtension === 'markdown') ? 'markdown' : 'note';
        
        // Extract title from filename (without extension)
        $title = pathinfo($fileName, PATHINFO_FILENAME);
        
        // Sanitize title
        $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        if (empty($title)) {
            $title = 'Imported Note ' . date('Y-m-d H:i:s');
        }
        
        try {
            // Get folder_id if folder is not default
            $folder_id = null;
            if ($folder !== 'Default' && $folder !== 'Uncategorized') {
                $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
                $fStmt->execute([$folder, $workspace, $workspace]);
                $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
                if ($folderData) {
                    $folder_id = (int)$folderData['id'];
                }
            }
            
            // Insert note into database
            $stmt = $con->prepare("INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, created, updated) VALUES (?, '', ?, ?, ?, ?, datetime('now'), datetime('now'))");
            $stmt->execute([$title, $folder, $folder_id, $workspace, $noteType]);
            $noteId = $con->lastInsertId();
            
            // Save content to file with correct extension
            $fileExtension = ($noteType === 'markdown') ? '.md' : '.html';
            $noteFile = $entriesPath . '/' . $noteId . $fileExtension;
            
            if ($noteType === 'markdown') {
                // For markdown notes, save content as-is
                $wrappedContent = $content;
            } else {
                // For HTML notes, ensure it's properly formatted
                if (stripos($content, '<html') === false) {
                    // Wrap in basic HTML structure if not present
                    $wrappedContent = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<title>" . htmlspecialchars($title, ENT_QUOTES) . "</title>\n</head>\n<body>\n" . $content . "\n</body>\n</html>";
                } else {
                    $wrappedContent = $content;
                }
            }
            
            if (file_put_contents($noteFile, $wrappedContent) !== false) {
                chmod($noteFile, 0644);
                $importedCount++;
            } else {
                $errorCount++;
                $errors[] = $fileName . ': Cannot write file';
                // Delete the database entry if file creation failed
                $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
        } catch (Exception $e) {
            $errorCount++;
            $errors[] = $fileName . ': ' . $e->getMessage();
        }
    }
    
    $message = "Imported {$importedCount} note(s) into workspace '{$workspace}', folder '{$folder}'.";
    if ($errorCount > 0) {
        $message .= " {$errorCount} error(s): " . implode('; ', $errors);
    }
    
    return [
        'success' => $importedCount > 0,
        'message' => $message,
        'error' => $errorCount > 0 ? implode('; ', $errors) : ''
    ];
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Restore / Import - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/restore_import.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/theme-manager.js"></script>
</head>
<body>
    <div class="backup-container">
        <h1>Restore / Import</h1>
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            Back to Notes
        </a>
        <a href="settings.php" class="btn btn-secondary">
            Back to Settings
        </a>

        <br><br>
        
        <!-- Global Messages Section - Always visible at the top -->
        <?php if ($restore_message): ?>
            <div class="alert alert-success">
                <?php echo htmlspecialchars($restore_message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($restore_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($restore_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_message): ?>
            <div class="alert alert-success">
                <?php echo htmlspecialchars($import_notes_message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_message): ?>
            <div class="alert alert-success">
                <?php echo htmlspecialchars($import_attachments_message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_attachments_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_message): ?>
            <div class="alert alert-success">
                <?php echo htmlspecialchars($import_individual_notes_message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_individual_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <div> If you want to know more about why we have several restore methods : <a href="https://github.com/timothepoznanski/poznote/blob/main/BACKUP_RESTORE_GUIDE.md" target="_blank" style="color: #007bff; text-decoration: none;">see documentation here</a>.
        <br><br>
        
        <!-- Parent Restore Section -->
        <div class="backup-section parent-section">
            <h3 class="accordion-header" onclick="toggleAccordion('restoreBackup')">
                <span class="accordion-icon" id="restoreBackupIcon">▶</span>
                Want to restore a backup file?
            </h3>
            <div id="restoreBackup" class="accordion-content" style="display: none;">
            
        <!-- Standard Complete Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('standardRestore')">
                <span class="accordion-icon" id="standardRestoreIcon">▶</span>
                Is your backup file less than 500MB? 
            </h3>
            <div id="standardRestore" class="accordion-content" style="display: none;">
            <p>Upload a complete backup ZIP file. This method is fast and simple.</p>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                    <small class="form-text text-muted">Maximum recommended size: 500MB. For larger files, use chunked upload below.</small>
                </div>
                
                <button type="button" id="completeRestoreBtn" class="btn btn-primary" onclick="showCompleteRestoreConfirmation()">
                    <span> Start Restore
                </button>
                <!-- Spinner shown while processing restore -->
                <div id="restoreSpinner" class="restore-spinner" role="status" aria-live="polite" aria-hidden="true" style="display:none;">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only">Processing restore...</span>
                    <span class="restore-spinner-text">Processing restore... This may take a few moments.</span>
                </div>
            </form>
            </div>
        </div>

        <!-- Chunked Complete Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('chunkedRestore')">
                <span class="accordion-icon" id="chunkedRestoreIcon">▶</span>
                Is your backup file between 500MB and 800MB?
            </h3>
            <div id="chunkedRestore" class="accordion-content" style="display: none;">
            <p>Upload a complete backup ZIP file. Use this method to avoid HTTP timeouts and memory issues.</p>            <div id="chunkedUploadStatus" style="display: none;">
                <div class="progress-bar">
                    <div id="chunkedProgress" class="progress-fill" style="width: 0%;">0%</div>
                </div>
                <div id="chunkedStatusText">Preparing upload...</div>
            </div>

            <div id="chunkedUploadForm">
                <div class="form-group">
                    <input type="file" id="chunked_backup_file" accept=".zip">
                    <small class="form-text text-muted">Recommended for files over 500MB to 800MB. Files are uploaded in 5MB chunks.</small>
                </div>
                
                <button type="button" id="chunkedRestoreBtn" class="btn btn-primary" onclick="startChunkedRestore()" disabled>
                    Start Restore
                </button>
            </div>
            </div>
        </div>

        <!-- Direct Copy Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('directCopyRestore')">
                <span class="accordion-icon" id="directCopyRestoreIcon">▶</span>
                Is your backup file over 800MB?
            </h3>
            <div id="directCopyRestore" class="accordion-content" style="display: none;">
            <p>For very large backup files, use this simple direct file copy method. <a href="https://github.com/timothepoznanski/poznote/blob/main/BACKUP_RESTORE_GUIDE.md" target="_blank" style="color: #007bff; text-decoration: none;">See documentation for details</a>.</p>

            <form method="post">
                <input type="hidden" name="action" value="check_cli_upload">
                <button type="button" class="btn btn-primary" onclick="showDirectCopyRestoreConfirmation()">
                    Start Restore
                </button>
            </form>

            <?php if (isset($_POST['action']) && $_POST['action'] === 'check_cli_upload'): ?>
                <?php
                $cliBackupPath = '/tmp/backup_restore.zip';
                if (file_exists($cliBackupPath)) {
                    $fileSize = filesize($cliBackupPath);
                    $fileSizeMB = round($fileSize / 1024 / 1024, 2);
                    echo "<div class='alert alert-info'>";
                    echo "<strong>Backup file found:</strong> {$fileSizeMB}MB<br>";
                    echo "<strong>Ready to restore?</strong> This will replace all data in ALL workspaces.";
                    echo "</div>";

                    // Show confirmation form
                    echo "<form method='post' id='directCopyRestoreForm' style='margin-top: 10px;'>";
                    echo "<input type='hidden' name='action' value='restore_cli_upload'>";
                    echo "<button type='button' class='btn btn-warning' onclick='showDirectCopyRestoreConfirmation()'>";
                    echo "Yes, Restore from Direct Copy";
                    echo "</button>";
                    echo "</form>";
                } else {
                    echo "<div class='alert alert-warning'>";
                    echo "No backup file found in container at <code>/tmp/backup_restore.zip</code><br>";
                    echo "Please run the docker cp command first.";
                    echo "</div>";
                }
                ?>
            <?php endif; ?>

            <?php if (isset($_POST['action']) && $_POST['action'] === 'restore_cli_upload'): ?>
                <?php
                $cliBackupPath = '/tmp/backup_restore.zip';
                if (file_exists($cliBackupPath)) {
                    $result = restoreCompleteBackup(['tmp_name' => $cliBackupPath, 'name' => 'cli_backup.zip'], true);
                    if ($result['success']) {
                        echo "<div class='alert alert-success'>Direct file copy restore completed successfully! " . htmlspecialchars($result['message']) . "</div>";
                        // Clean up the file after successful restore
                        unlink($cliBackupPath);
                    } else {
                        echo "<div class='alert alert-danger'>Direct file copy restore failed: " . htmlspecialchars($result['error']) . "</div>";
                    }
                } else {
                    echo "<div class='alert alert-danger'>Backup file not found for restoration.</div>";
                }
                ?>
            <?php endif; ?>
            </div>
        </div>
        
            </div>
        </div>
        
        <!-- Individual Notes Import Section -->
        <div class="backup-section">
            <h3 class="accordion-header" onclick="toggleAccordion('individualNotes')">
                <span class="accordion-icon" id="individualNotesIcon">▶</span>
                Want to import HTML or Markdown files?
            </h3>
            <div id="individualNotes" class="accordion-content" style="display: none;">
            <p>Notes will be imported into the <b>Default</b> folder of the <b>Poznote</b> workspace.<br><br>The title will be automatically created from the file name (without the extension).</p>

            <form method="post" enctype="multipart/form-data" id="individualNotesForm">
                <input type="hidden" name="action" value="import_individual_notes">
                <input type="hidden" name="target_workspace" value="Poznote">
                <input type="hidden" name="target_folder" value="Default">
                
                <div class="form-group">
                    <input type="file" id="individual_notes_files" name="individual_notes_files[]" accept=".html,.md,.markdown" multiple required>
                    <small class="form-text text-muted">You can select multiple files at once (maximum 50 files). Supported formats: .html, .md, .markdown</small>
                </div>
                <br>
                
                <button type="button" class="btn btn-primary" onclick="showIndividualNotesImportConfirmation()">
                    Start Import Individual Notes
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

    <!-- Chunked Restore Confirmation Modal -->
    <div id="chunkedRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Complete Restore (Chunked)?</h3>
            <p id="chunkedRestoreWarning"><strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideChunkedRestoreConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithChunkedRestore()">
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

    <!-- Direct Copy Restore Confirmation Modal -->
    <div id="directCopyRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Complete Restore (Direct Copy)?</h3>
            <p><strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideDirectCopyRestoreConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithDirectCopyRestore()">
                    Yes, Complete Restore
                </button>
            </div>
        </div>
    </div>

    <!-- Individual Notes Import Confirmation Modal -->
    <div id="individualNotesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Import Individual Notes?</h3>
            <p id="individualNotesImportSummary">This will import notes into the Default folder of the Poznote workspace.</p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideIndividualNotesImportConfirmation()">
                    Cancel
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithIndividualNotesImport()">
                    Yes, Import Notes
                </button>
            </div>
        </div>
    </div>
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
    <script src="js/chunked-uploader.js"></script>
    <script>
        // Accordion functionality
        function toggleAccordion(sectionId) {
            const content = document.getElementById(sectionId);
            const icon = document.getElementById(sectionId + 'Icon');
            
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        }

        // Standard upload file size check
        document.getElementById('complete_backup_file').addEventListener('change', function(e) {
            const file = e.target.files[0];
            const button = document.getElementById('completeRestoreBtn');
            const sizeText = document.querySelector('#completeRestoreBtn').parentElement.querySelector('small');
            
            if (file && file.name.toLowerCase().endsWith('.zip')) {
                const sizeMB = file.size / (1024 * 1024);
                
                button.disabled = false;
                button.textContent = 'Start Complete Restore (Standard)';
                
                if (sizeMB > 500) {
                    sizeText.textContent = '⚠️ File is ' + sizeMB.toFixed(1) + 'MB. Standard upload may be slow or fail - consider using chunked upload below.';
                    sizeText.style.color = '#dc3545';
                } else {
                    sizeText.textContent = 'Maximum recommended size: 500MB. For larger files, use chunked upload below.';
                    sizeText.style.color = '#6c757d';
                }
            }
        });

        // Chunked upload functionality
        let chunkedUploader = null;

        // Enable/disable chunked restore button based on file selection
        document.getElementById('chunked_backup_file').addEventListener('change', function(e) {
            const file = e.target.files[0];
            const button = document.getElementById('chunkedRestoreBtn');
            const sizeText = document.querySelector('#chunkedUploadForm small');
            
            if (file && file.name.toLowerCase().endsWith('.zip')) {
                const sizeMB = file.size / (1024 * 1024);
                
                button.disabled = false;
                button.textContent = `Start Chunked Restore (${formatFileSize(file.size)})`;
                button.onclick = showChunkedRestoreConfirmation;
                
                if (sizeMB < 500) {
                    sizeText.textContent = 'Note: For small files, standard upload is usually faster. But you can still use chunked upload if preferred.';
                } else {
                    sizeText.textContent = 'Recommended for files over 500MB to 800MB. Files are uploaded in 5MB chunks.';
                }
            } else {
                button.disabled = true;
                button.textContent = 'Start Chunked Restore';
                button.onclick = showChunkedRestoreConfirmation;
                sizeText.textContent = 'Recommended for files over 500MB to 800MB. Files are uploaded in 5MB chunks.';
            }
        });

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (chunkedUploader) {
                chunkedUploader.cleanup();
            }
        });
    </script>
</body>
</html>

<script>
// Ensure Back to Notes opens the stored workspace if present
(function(){ try {
    var stored = localStorage.getItem('poznote_selected_workspace');
    if (stored) {
        var a = document.getElementById('backToNotesLink'); 
        if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
    }
} catch(e){} })();
</script>