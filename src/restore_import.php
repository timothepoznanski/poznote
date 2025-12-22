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

$currentLang = getUserLanguage();

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
                    $restore_message = t('restore_import.messages.database_restored');
                } else {
                    $restore_error = t('restore_import.errors.restore_error', ['error' => $result['error']]);
                }
            } else {
                $restore_error = t('restore_import.errors.no_backup_file_or_upload');
            }
            break;
            
        case 'complete_restore':
            if (isset($_FILES['complete_backup_file']) && $_FILES['complete_backup_file']['error'] === UPLOAD_ERR_OK) {
                $result = restoreCompleteBackup($_FILES['complete_backup_file']);
                if ($result['success']) {
                    $restore_message = t('restore_import.messages.complete_backup_restored', ['message' => $result['message']]);
                } else {
                    $restore_error = t('restore_import.errors.complete_restore_error', ['error' => $result['error'], 'message' => $result['message']]);
                }
            } else {
                $restore_error = t('restore_import.errors.no_complete_backup_file_or_upload');
            }
            break;
            
        case 'import_notes':
            if (isset($_FILES['notes_file']) && $_FILES['notes_file']['error'] === UPLOAD_ERR_OK) {
                $result = importNotesZip($_FILES['notes_file']);
                if ($result['success']) {
                    $import_notes_message = t('restore_import.messages.notes_imported', ['message' => $result['message']]);
                } else {
                    $import_notes_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_notes_error = t('restore_import.errors.no_notes_file_or_upload');
            }
            break;
            
        case 'import_attachments':
            if (isset($_FILES['attachments_file']) && $_FILES['attachments_file']['error'] === UPLOAD_ERR_OK) {
                $result = importAttachmentsZip($_FILES['attachments_file']);
                if ($result['success']) {
                    $import_attachments_message = t('restore_import.messages.attachments_imported', ['message' => $result['message']]);
                } else {
                    $import_attachments_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_attachments_error = t('restore_import.errors.no_attachments_file_or_upload');
            }
            break;
            
        case 'import_individual_notes':
            if (isset($_FILES['individual_notes_files']) && !empty($_FILES['individual_notes_files']['name'][0])) {
                $workspace = $_POST['target_workspace'] ?? 'Poznote';
                $folder = $_POST['target_folder'] ?? null;
                
                // Check if a single ZIP file was uploaded
                $fileCount = count($_FILES['individual_notes_files']['name']);
                $firstFileName = $_FILES['individual_notes_files']['name'][0];
                $isZipFile = (preg_match('/\.zip$/i', $firstFileName) && $fileCount === 1);
                
                if ($isZipFile) {
                    // Single ZIP file upload - use ZIP import
                    $singleZipFile = [
                        'name' => $_FILES['individual_notes_files']['name'][0],
                        'type' => $_FILES['individual_notes_files']['type'][0],
                        'tmp_name' => $_FILES['individual_notes_files']['tmp_name'][0],
                        'error' => $_FILES['individual_notes_files']['error'][0],
                        'size' => $_FILES['individual_notes_files']['size'][0]
                    ];
                    $result = importIndividualNotesZip($singleZipFile, $workspace, $folder);
                } else {
                    // Multiple individual files or mixed files
                    $result = importIndividualNotes($_FILES['individual_notes_files'], $workspace, $folder);
                }
                
                if ($result['success']) {
                    $import_individual_notes_message = $result['message'];
                } else {
                    $import_individual_notes_error = t('restore_import.errors.import_error', ['error' => $result['error']]);
                }
            } else {
                $import_individual_notes_error = t('restore_import.errors.no_notes_selected_or_upload');
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
        return ['success' => false, 'error' => t('restore_import.errors.file_type_zip_only')];
    }
    
    $tempFile = '/tmp/poznote_notes_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => t('restore_import.errors.error_uploading_file')];
    }
    
    // Get entries directory using the proper function
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.errors.cannot_find_entries_directory')];
    }
    
    // Extract ZIP
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.errors.cannot_open_zip')];
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
            $errors[] = t('restore_import.errors.failed_extract_content', ['file' => $baseFilename]);
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
        $title = t('restore_import.import_notes.default_title');
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
            $errors[] = t('restore_import.errors.failed_write_file', ['file' => $baseFilename]);
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
                // No folder (uncategorized)
                $insertStmt = $con->prepare("INSERT INTO entries (id, heading, entry, folder, folder_id, workspace, type, created, updated, trash, favorite) VALUES (?, ?, ?, NULL, NULL, 'Poznote', ?, datetime('now'), datetime('now'), 0, 0)");
                $insertStmt->execute([$noteId, $title, $content, $noteType]);
                $importedCount++;
            }
        } catch (Exception $e) {
            $errors[] = t('restore_import.errors.database_error_for_file', ['file' => $baseFilename, 'message' => $e->getMessage()]);
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
    
    $message = t('restore_import.import_notes.summary', ['imported' => $importedCount, 'updated' => $updatedCount]);
    if (!empty($errors)) {
        $message .= ' ' . t('restore_import.errors.errors_prefix') . ' ' . implode('; ', $errors);
    }
    
    return ['success' => true, 'message' => $message];
}

function importAttachmentsZip($uploadedFile) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => t('restore_import.errors.file_type_zip_only')];
    }
    
    $tempFile = '/tmp/poznote_attachments_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => t('restore_import.errors.error_uploading_file')];
    }
    
    // Get attachments directory using the proper function
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.errors.cannot_find_attachments_directory')];
    }
    
    // Extract ZIP
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.errors.cannot_open_zip')];
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
    
    return ['success' => true, 'message' => t('restore_import.import_attachments.summary', ['count' => $importedCount])];
}

function importIndividualNotesZip($uploadedFile, $workspace = 'Poznote', $folder = null) {
    global $con;
    
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => t('restore_import.errors.file_type_zip_only')];
    }
    
    $tempFile = '/tmp/poznote_individual_notes_import_' . uniqid() . '.zip';
    
    // Move uploaded file
    if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
        return ['success' => false, 'error' => t('restore_import.errors.error_uploading_file')];
    }
    
    // Validate workspace exists
    $stmt = $con->prepare("SELECT name FROM workspaces WHERE name = ?");
    $stmt->execute([$workspace]);
    if (!$stmt->fetch()) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.individual_notes.errors.workspace_not_found')];
    }
    
    $entriesPath = getEntriesPath();
    if (!$entriesPath || !is_dir($entriesPath)) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.individual_notes.errors.entries_dir_not_found')];
    }
    
    // Open ZIP file
    $zip = new ZipArchive;
    $res = $zip->open($tempFile);
    
    if ($res !== TRUE) {
        unlink($tempFile);
        return ['success' => false, 'error' => t('restore_import.errors.cannot_open_zip')];
    }
    
    $importedCount = 0;
    $errorCount = 0;
    $errors = [];
    $maxFiles = (int)($_ENV['POZNOTE_IMPORT_MAX_ZIP_FILES'] ?? 300);
    
    // Iterate through all files in ZIP
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $fileName = $stat['name'];
        
        // Skip directories and hidden files
        if (substr($fileName, -1) === '/' || basename($fileName)[0] === '.') {
            continue;
        }
        
        // Get file extension
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Only process HTML, MD, and Markdown files
        if (!in_array($fileExtension, ['html', 'md', 'markdown'])) {
            continue;
        }
        
        // Check file limit
        if ($importedCount + $errorCount >= $maxFiles) {
            $errors[] = t('restore_import.individual_notes.errors.too_many_files', ['max' => $maxFiles, 'count' => $zip->numFiles]);
            break;
        }
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            $errorCount++;
            $errors[] = basename($fileName) . ': ' . t('restore_import.individual_notes.errors.cannot_read_file');
            continue;
        }
        
        // Determine note type based on file extension
        $noteType = ($fileExtension === 'md' || $fileExtension === 'markdown') ? 'markdown' : 'note';
        
        // Extract title from filename (without extension and path)
        $title = pathinfo($fileName, PATHINFO_FILENAME);
        
        // Sanitize title
        $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        if (empty($title)) {
            $title = t('restore_import.individual_notes.default_title_with_date', ['date' => date('Y-m-d H:i:s')]);
        }
        
        try {
            // Get folder_id if folder is provided
            $folder_id = null;
            if ($folder !== null && $folder !== '') {
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
            $fileExt = ($noteType === 'markdown') ? '.md' : '.html';
            $noteFile = $entriesPath . '/' . $noteId . $fileExt;
            
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
                $errors[] = basename($fileName) . ': Cannot write file';
                // Delete the database entry if file creation failed
                $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
        } catch (Exception $e) {
            $errorCount++;
            $errors[] = basename($fileName) . ': ' . $e->getMessage();
        }
    }
    
    $zip->close();
    unlink($tempFile);
    
    $folderDisplay = empty($folder) ? t('restore_import.sections.individual_notes.no_folder', [], 'No folder (root level)') : $folder;
    $message = t('restore_import.messages.notes_imported_zip', ['count' => $importedCount, 'workspace' => $workspace, 'folder' => $folderDisplay], 'Imported {{count}} note(s) from ZIP into workspace "{{workspace}}", folder "{{folder}}".');
    if ($errorCount > 0) {
        $message .= " {$errorCount} error(s): " . implode('; ', array_slice($errors, 0, 5));
    }
    
    return ['success' => true, 'message' => $message];
}

function importIndividualNotes($uploadedFiles, $workspace = 'Poznote', $folder = null) {
    global $con;
    
    // Check file count limit
    $maxFiles = (int)($_ENV['POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES'] ?? 50);
    $fileCount = count($uploadedFiles['name']);
    
    if ($fileCount > $maxFiles) {
        return [
            'success' => false,
            'error' => t('restore_import.individual_notes.errors.too_many_files', ['max' => $maxFiles, 'count' => $fileCount])
        ];
    }
    
    // Validate workspace exists
    $stmt = $con->prepare("SELECT name FROM workspaces WHERE name = ?");
    $stmt->execute([$workspace]);
    if (!$stmt->fetch()) {
        return ['success' => false, 'error' => t('restore_import.individual_notes.errors.workspace_not_found')];
    }
    
    $entriesPath = getEntriesPath();
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => t('restore_import.individual_notes.errors.entries_dir_not_found')];
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
            $errors[] = $uploadedFiles['name'][$i] . ': ' . t('restore_import.individual_notes.errors.upload_error');
            continue;
        }
        
        $fileName = $uploadedFiles['name'][$i];
        $tmpName = $uploadedFiles['tmp_name'][$i];
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Validate file type
        if (!in_array($fileExtension, ['html', 'md', 'markdown'])) {
            $errorCount++;
            $errors[] = $fileName . ': ' . t('restore_import.individual_notes.errors.invalid_file_type', ['allowed' => '.html, .md, .markdown']);
            continue;
        }
        
        // Read file content
        $content = file_get_contents($tmpName);
        if ($content === false) {
            $errorCount++;
            $errors[] = $fileName . ': ' . t('restore_import.individual_notes.errors.cannot_read_file');
            continue;
        }
        
        // Determine note type based on file extension
        $noteType = ($fileExtension === 'md' || $fileExtension === 'markdown') ? 'markdown' : 'note';
        
        // Extract title from filename (without extension)
        $title = pathinfo($fileName, PATHINFO_FILENAME);
        
        // Sanitize title
        $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        if (empty($title)) {
            $title = t('restore_import.individual_notes.default_title_with_date', ['date' => date('Y-m-d H:i:s')]);
        }
        
        try {
            // Get folder_id if folder is provided
            $folder_id = null;
            if ($folder !== null && $folder !== '') {
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
    
    $folderDisplay = empty($folder) ? t('restore_import.sections.individual_notes.no_folder', [], 'No folder (root level)') : $folder;
    $message = t('restore_import.messages.notes_imported', ['count' => $importedCount, 'workspace' => $workspace, 'folder' => $folderDisplay], 'Imported {{count}} note(s) into workspace "{{workspace}}", folder "{{folder}}".');
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
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <title><?php echo t_h('restore_import.page.title'); ?> - <?php echo t_h('app.name'); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/restore_import.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
    <script src="js/globals.js"></script>
    <script src="js/theme-manager.js"></script>
</head>
<body>
    <div class="backup-container">
        <h1><?php echo t_h('restore_import.page.title'); ?></h1>
        <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>
        <a href="settings.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_settings'); ?>
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
        
        <div>
            <?php echo t_h('restore_import.page.more_info_prefix'); ?>
            <a href="https://github.com/timothepoznanski/poznote/blob/main/BACKUP_RESTORE_GUIDE.md" target="_blank" style="color: #007bff; text-decoration: none;">
                <?php echo t_h('restore_import.page.more_info_link'); ?>
            </a>.
        <br><br>
        
        <!-- Parent Restore Section -->
        <div class="backup-section parent-section">
            <h3 class="accordion-header" onclick="toggleAccordion('restoreBackup')">
                <span class="accordion-icon" id="restoreBackupIcon">▶</span>
                <?php echo t_h('restore_import.sections.restore_from_backup.title'); ?>
            </h3>
            <div id="restoreBackup" class="accordion-content" style="display: none;">
            
        <!-- Standard Complete Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('standardRestore')">
                <span class="accordion-icon" id="standardRestoreIcon">▶</span>
                <?php echo t_h('restore_import.sections.standard_restore.title'); ?>
            </h3>
            <div id="standardRestore" class="accordion-content" style="display: none;">
            <p><?php echo t_h('restore_import.sections.standard_restore.description'); ?></p>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                    <small class="form-text text-muted"><?php echo t_h('restore_import.sections.standard_restore.helper'); ?></small>
                </div>
                
                <button type="button" id="completeRestoreBtn" class="btn btn-primary" onclick="showCompleteRestoreConfirmation()">
                    <span><?php echo t_h('restore_import.buttons.start_restore'); ?></span>
                </button>
                <!-- Spinner shown while processing restore -->
                <div id="restoreSpinner" class="restore-spinner" role="status" aria-live="polite" aria-hidden="true" style="display:none;">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.processing_long'); ?></span>
                </div>
            </form>
            </div>
        </div>

        <!-- Chunked Complete Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('chunkedRestore')">
                <span class="accordion-icon" id="chunkedRestoreIcon">▶</span>
                <?php echo t_h('restore_import.sections.chunked_restore.title'); ?>
            </h3>
            <div id="chunkedRestore" class="accordion-content" style="display: none;">
            <p><?php echo t_h('restore_import.sections.chunked_restore.description'); ?></p>
            <div id="chunkedUploadStatus" style="display: none;">
                <div class="progress-bar">
                    <div id="chunkedProgress" class="progress-fill" style="width: 0%;">0%</div>
                </div>
                <div id="chunkedStatusText"><?php echo t_h('restore_import.chunked.preparing_upload'); ?></div>
            </div>

            <div id="chunkedUploadForm">
                <div class="form-group">
                    <input type="file" id="chunked_backup_file" accept=".zip">
                    <small class="form-text text-muted"><?php echo t_h('restore_import.sections.chunked_restore.helper'); ?></small>
                </div>
                
                <button type="button" id="chunkedRestoreBtn" class="btn btn-primary" onclick="startChunkedRestore()" disabled>
                    <?php echo t_h('restore_import.buttons.start_restore'); ?>
                </button>
            </div>
            </div>
        </div>

        <!-- Direct Copy Restore Section -->
        <div class="backup-section child-section">
            <h3 class="accordion-header" onclick="toggleAccordion('directCopyRestore')">
                <span class="accordion-icon" id="directCopyRestoreIcon">▶</span>
                <?php echo t_h('restore_import.sections.direct_copy_restore.title'); ?>
            </h3>
            <div id="directCopyRestore" class="accordion-content" style="display: none;">
            <p>
                <?php echo t_h('restore_import.sections.direct_copy_restore.description_prefix'); ?>
                <a href="https://github.com/timothepoznanski/poznote/blob/main/BACKUP_RESTORE_GUIDE.md" target="_blank" style="color: #007bff; text-decoration: none;">
                    <?php echo t_h('restore_import.sections.direct_copy_restore.description_link'); ?>
                </a>.
            </p>

            <form method="post">
                <input type="hidden" name="action" value="check_cli_upload">
                <button type="button" class="btn btn-primary" onclick="showDirectCopyRestoreConfirmation()">
                    <?php echo t_h('restore_import.buttons.start_restore'); ?>
                </button>
            </form>

            <?php if (isset($_POST['action']) && $_POST['action'] === 'check_cli_upload'): ?>
                <?php
                $cliBackupPath = '/tmp/backup_restore.zip';
                if (file_exists($cliBackupPath)) {
                    $fileSize = filesize($cliBackupPath);
                    $fileSizeMB = round($fileSize / 1024 / 1024, 2);
                    echo "<div class='alert alert-info'>";
                    echo "<strong>" . t_h('restore_import.direct_copy.backup_file_found') . "</strong> {$fileSizeMB}MB<br>";
                    echo "<strong>" . t_h('restore_import.direct_copy.ready_to_restore') . "</strong> " . t_h('restore_import.direct_copy.replace_all_data_warning');
                    echo "</div>";

                    // Show confirmation form
                    echo "<form method='post' id='directCopyRestoreForm' style='margin-top: 10px;'>";
                    echo "<input type='hidden' name='action' value='restore_cli_upload'>";
                    echo "<button type='button' class='btn btn-warning' onclick='showDirectCopyRestoreConfirmation()'>";
                    echo t_h('restore_import.direct_copy.buttons.yes_restore_direct_copy');
                    echo "</button>";
                    echo "</form>";
                } else {
                    echo "<div class='alert alert-warning'>";
                    echo t_h('restore_import.direct_copy.no_backup_found_prefix') . " <code>/tmp/backup_restore.zip</code><br>";
                    echo t_h('restore_import.direct_copy.no_backup_found_hint');
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
                        echo "<div class='alert alert-success'>" . t_h('restore_import.direct_copy.completed_successfully_prefix') . " " . htmlspecialchars($result['message']) . "</div>";
                        // Clean up the file after successful restore
                        unlink($cliBackupPath);
                    } else {
                        echo "<div class='alert alert-danger'>" . t_h('restore_import.direct_copy.failed_prefix') . " " . htmlspecialchars($result['error']) . "</div>";
                    }
                } else {
                    echo "<div class='alert alert-danger'>" . t_h('restore_import.direct_copy.backup_not_found_for_restoration') . "</div>";
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
                <?php echo t_h('restore_import.sections.individual_notes.title'); ?>
            </h3>
            <div id="individualNotes" class="accordion-content" style="display: none;">
            <p><?php echo t('restore_import.sections.individual_notes.description_html'); ?></p>

            <form method="post" enctype="multipart/form-data" id="individualNotesForm">
                <input type="hidden" name="action" value="import_individual_notes">
                
                <div class="form-group" style="margin-bottom: 1.25rem;">
                    <label for="target_workspace_select" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333;">
                        <?php echo t_h('restore_import.sections.individual_notes.workspace', 'Target Workspace'); ?>
                    </label>
                    <select id="target_workspace_select" name="target_workspace" class="form-control" required onchange="loadFoldersForImport(this.value)" style="font-size: 15px; padding: 0.5rem;">
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.loading', 'Loading...'); ?></option>
                    </select>
                </div>
                
                <div class="form-group" style="margin-bottom: 1.25rem;">
                    <label for="target_folder_select" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333;">
                        <?php echo t_h('restore_import.sections.individual_notes.folder', 'Target Folder'); ?>
                        <span style="font-weight: 400; color: #666; font-size: 0.9em;">(<?php echo t_h('restore_import.sections.individual_notes.optional', 'optional'); ?>)</span>
                    </label>
                    <select id="target_folder_select" name="target_folder" class="form-control" style="font-size: 15px; padding: 0.5rem;">
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.no_folder', 'No folder (root level)'); ?></option>
                    </select>
                </div>
                
                <div class="form-group" style="margin-bottom: 1.25rem;">
                    <label for="individual_notes_files" style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #333;">
                        <?php echo t_h('restore_import.sections.individual_notes.select_files', 'Select Files'); ?>
                    </label>
                    <input type="file" id="individual_notes_files" name="individual_notes_files[]" accept=".html,.md,.markdown,.zip" multiple required style="padding: 0.5rem;">
                    <small class="form-text text-muted" style="display: block; margin-top: 0.5rem; line-height: 1.5;">
                        <?php echo t_h('restore_import.sections.individual_notes.files_info', 'Multiple files (max 50) or single ZIP archive (max 300 files)'); ?><br>
                        <?php echo t_h('restore_import.sections.individual_notes.supported_formats', 'Supported: .html, .md, .markdown, .zip'); ?>
                    </small>
                </div>
                
                <button type="button" class="btn btn-primary" onclick="showIndividualNotesImportConfirmation()" style="margin-top: 1rem;" id="individualNotesImportBtn">
                    <?php echo t_h('restore_import.buttons.start_import_individual_notes', 'Start Import'); ?>
                </button>
                
                <!-- Spinner shown while processing import -->
                <div id="individualNotesImportSpinner" class="restore-spinner" role="status" aria-live="polite" aria-hidden="true" style="display:none; margin-top: 1rem;">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.importing_notes', 'Importation des notes en cours...'); ?></span>
                </div>
            </form>
            </div>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <!-- Simple Import Confirmation Modal -->
    <div id="importConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_confirm.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_confirm.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideImportConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithImport()">
                    <?php echo t_h('restore_import.modals.import_confirm.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Complete Restore Confirmation Modal -->
    <div id="completeRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.complete_restore.title'); ?></h3>
            <p><strong><?php echo t_h('common.warning'); ?>:</strong> <?php echo t('restore_import.modals.complete_restore.body_html'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideCompleteRestoreConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithCompleteRestore()">
                    <?php echo t_h('restore_import.modals.complete_restore.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Chunked Restore Confirmation Modal -->
    <div id="chunkedRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.complete_restore_chunked.title'); ?></h3>
            <p id="chunkedRestoreWarning"><strong><?php echo t_h('common.warning'); ?>:</strong> <?php echo t('restore_import.modals.complete_restore_chunked.body_html'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideChunkedRestoreConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithChunkedRestore()">
                    <?php echo t_h('restore_import.modals.complete_restore_chunked.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Notes Import Confirmation Modal -->
    <div id="notesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_notes.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_notes.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideNotesImportConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithNotesImport()">
                    <?php echo t_h('restore_import.modals.import_notes.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Attachments Import Confirmation Modal -->
    <div id="attachmentsImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_attachments.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_attachments.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideAttachmentsImportConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithAttachmentsImport()">
                    <?php echo t_h('restore_import.modals.import_attachments.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Direct Copy Restore Confirmation Modal -->
    <div id="directCopyRestoreConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.complete_restore_direct_copy.title'); ?></h3>
            <p><strong><?php echo t_h('common.warning'); ?>:</strong> <?php echo t('restore_import.modals.complete_restore_direct_copy.body_html'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideDirectCopyRestoreConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithDirectCopyRestore()">
                    <?php echo t_h('restore_import.modals.complete_restore_direct_copy.confirm'); ?>
                </button>
            </div>
        </div>
    </div>

    <!-- Individual Notes Import Confirmation Modal -->
    <div id="individualNotesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_individual_notes.title'); ?></h3>
            <p id="individualNotesImportSummary"><?php echo t_h('restore_import.modals.import_individual_notes.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" onclick="hideIndividualNotesImportConfirmation()">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" onclick="proceedWithIndividualNotesImport()">
                    <?php echo t_h('restore_import.modals.import_individual_notes.confirm'); ?>
                </button>
            </div>
        </div>
    </div>
    <div id="customAlert" class="custom-alert">
        <div class="custom-alert-content">
            <h3 id="alertTitle"><?php echo t_h('restore_import.alerts.no_file_selected.title'); ?></h3>
            <p id="alertMessage"><?php echo t_h('restore_import.alerts.no_file_selected.body'); ?></p>
            <button type="button" class="alert-ok-button" onclick="hideCustomAlert()">
                <?php echo t_h('restore_import.alerts.ok'); ?>
            </button>
        </div>
    </div>
    
    <script src="js/restore-import.js"></script>
    <script src="js/chunked-uploader.js"></script>
    <script>
        (function () {
            const trLocal = (key, fallback, vars) => {
                if (typeof window.t === 'function') {
                    return window.t(key, vars || null, fallback);
                }
                if (fallback != null) {
                    return fallback;
                }
                return key;
            };

            // Accordion functionality (onclick handlers expect a global)
            if (typeof window.toggleAccordion !== 'function') {
                window.toggleAccordion = function (sectionId) {
                    const content = document.getElementById(sectionId);
                    const icon = document.getElementById(sectionId + 'Icon');

                    if (content.style.display === 'none' || content.style.display === '') {
                        content.style.display = 'block';
                        icon.textContent = '▼';
                    } else {
                        content.style.display = 'none';
                        icon.textContent = '▶';
                    }
                };
            }

        // Standard upload file size check
        document.getElementById('complete_backup_file').addEventListener('change', function(e) {
            const file = e.target.files[0];
            const button = document.getElementById('completeRestoreBtn');
            const sizeText = document.querySelector('#completeRestoreBtn').parentElement.querySelector('small');
            
            if (file && file.name.toLowerCase().endsWith('.zip')) {
                const sizeMB = file.size / (1024 * 1024);
                
                button.disabled = false;
                button.textContent = trLocal('restore_import.inline.standard.button', 'Start Complete Restore (Standard)');
                
                if (sizeMB > 500) {
                    sizeText.textContent = trLocal(
                        'restore_import.inline.standard.too_large',
                        '⚠️ File is ' + sizeMB.toFixed(1) + 'MB. Standard upload may be slow or fail - consider using chunked upload below.',
                        { size: sizeMB.toFixed(1) }
                    );
                    sizeText.style.color = '#dc3545';
                } else {
                    sizeText.textContent = trLocal(
                        'restore_import.sections.standard_restore.helper',
                        'Maximum recommended size: 500MB. For larger files, use chunked upload below.'
                    );
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
                button.textContent = `${trLocal('restore_import.inline.chunked.button_prefix', 'Start Chunked Restore')} (${formatFileSize(file.size)})`;
                button.onclick = showChunkedRestoreConfirmation;
                
                if (sizeMB < 500) {
                    sizeText.textContent = trLocal(
                        'restore_import.inline.chunked.small_file_note',
                        'Note: For small files, standard upload is usually faster. But you can still use chunked upload if preferred.'
                    );
                } else {
                    sizeText.textContent = trLocal(
                        'restore_import.sections.chunked_restore.helper',
                        'Recommended for files over 500MB to 800MB. Files are uploaded in 5MB chunks.'
                    );
                }
            } else {
                button.disabled = true;
                button.textContent = trLocal('restore_import.inline.chunked.button_prefix', 'Start Chunked Restore');
                button.onclick = showChunkedRestoreConfirmation;
                sizeText.textContent = trLocal(
                    'restore_import.sections.chunked_restore.helper',
                    'Recommended for files over 500MB to 800MB. Files are uploaded in 5MB chunks.'
                );
            }
        });

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 ' + trLocal('restore_import.units.bytes', 'Bytes');
            const k = 1024;
            const sizes = [
                trLocal('restore_import.units.bytes', 'Bytes'),
                trLocal('restore_import.units.kb', 'KB'),
                trLocal('restore_import.units.mb', 'MB'),
                trLocal('restore_import.units.gb', 'GB')
            ];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (chunkedUploader) {
                chunkedUploader.cleanup();
            }
        });
        })();
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