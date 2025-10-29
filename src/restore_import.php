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
    
    // Ensure required data directories exist
    $dataDir = dirname(__DIR__) . '/data';
    $requiredDirs = ['attachments', 'database', 'entries'];
    foreach ($requiredDirs as $dir) {
        $fullPath = $dataDir . '/' . $dir;
        if (!is_dir($fullPath)) {
            mkdir($fullPath, 0755, true);
            // Set proper ownership if running as root (Docker context)
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                chown($fullPath, 'www-data');
                chgrp($fullPath, 'www-data');
            }
        }
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
            $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
            
            // Include both HTML and Markdown files
            if ($extension === 'html' || $extension === 'md') {
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
                $insertStmt = $con->prepare("INSERT INTO entries (id, heading, entry, folder, workspace, type, created, updated, trash, favorite) VALUES (?, ?, ?, 'Default', 'Poznote', ?, datetime('now'), datetime('now'), 0, 0)");
                $insertStmt->execute([$noteId, $title, $content, $noteType]);
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
    $maxFiles = 20;
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
        
        // For markdown files, try to extract title from first line if it's a heading
        if ($noteType === 'markdown') {
            $lines = explode("\n", $content);
            foreach ($lines as $line) {
                $line = trim($line);
                if (preg_match('/^#\s+(.+)$/', $line, $matches)) {
                    $title = trim($matches[1]);
                    break;
                } elseif (!empty($line) && $line[0] !== '#') {
                    // Stop at first non-heading, non-empty line
                    break;
                }
            }
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
        
        // Sanitize title
        $title = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
        if (empty($title)) {
            $title = 'Imported Note ' . date('Y-m-d H:i:s');
        }
        
        try {
            // Insert note into database
            $stmt = $con->prepare("INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, '', ?, ?, ?, datetime('now'), datetime('now'))");
            $stmt->execute([$title, $folder, $workspace, $noteType]);
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
        
        <!-- Complete Import Section -->
        <div class="backup-section">
            <h3>Complete Restore</h3>
            <p>Upload a complete backup ZIP file to restore database, notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</p>
            
            <?php if ($restore_message && isset($_POST['action']) && $_POST['action'] === 'complete_restore'): ?>
                <div class="alert alert-success">
                    <?php echo htmlspecialchars($restore_message); ?>
                </div>
            <?php endif; ?>
            
            <?php if ($restore_error && isset($_POST['action']) && $_POST['action'] === 'complete_restore'): ?>
                <div class="alert alert-danger">
                    <?php echo htmlspecialchars($restore_error); ?>
                </div>
            <?php endif; ?>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                </div>
                
                <button type="button" id="completeRestoreBtn" class="btn btn-primary" onclick="showCompleteRestoreConfirmation()">
                    <span> Complete Restore
                </button>
                <!-- Spinner shown while processing restore -->
                <div id="restoreSpinner" class="restore-spinner" role="status" aria-live="polite" aria-hidden="true" style="display:none;">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only">Processing restore...</span>
                    <span class="restore-spinner-text">Processing restore... This may take a few moments.</span>
                </div>
            </form>
        </div>
        
        <!-- Individual Notes Import Section -->
        <div class="backup-section">
            <h3>Import Individual Notes</h3>
            <p>Import one or more HTML or Markdown notes. <br><br>Notes will be imported into the <b>Default</b> folder of the <b>Poznote</b> workspace.</p>
            
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

            <form method="post" enctype="multipart/form-data" id="individualNotesForm">
                <input type="hidden" name="action" value="import_individual_notes">
                <input type="hidden" name="target_workspace" value="Poznote">
                <input type="hidden" name="target_folder" value="Default">
                
                <div class="form-group">
                    <input type="file" id="individual_notes_files" name="individual_notes_files[]" accept=".html,.md,.markdown" multiple required>
                    <small class="form-text text-muted">You can select multiple files at once (maximum 20 files). Supported formats: .html, .md, .markdown</small>
                </div>
                <br>
                
                <button type="button" class="btn btn-primary" onclick="showIndividualNotesImportConfirmation()">
                    Import Notes
                </button>
            </form>
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

    <!-- Individual Notes Import Confirmation Modal -->
    <div id="individualNotesImportConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3>Import Individual Notes?</h3>
            <p id="individualNotesImportSummary">This will import the selected notes into the specified workspace and folder.</p>
            
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
    if (stored) {
        var a = document.getElementById('backToNotesLink'); 
        if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
    }
} catch(e){} })();
</script>