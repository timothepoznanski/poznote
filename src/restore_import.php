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
                $workspace = $_POST['target_workspace'] ?? null;
                // If no workspace provided, get the first available workspace
                if (empty($workspace)) {
                    $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
                    $workspace = $wsStmt->fetchColumn();
                }
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

/**
 * Remove all <style> tags from HTML content
 * @param string $htmlContent The HTML content to clean
 * @return string The HTML content without <style> tags
 */
function removeStyleTags($htmlContent) {
    // Remove all <style>...</style> tags and their content
    // Using case-insensitive pattern to match <style>, <STYLE>, etc.
    $cleaned = preg_replace('/<style[^>]*>.*?<\/style>/is', '', $htmlContent);
    return $cleaned !== null ? $cleaned : $htmlContent;
}

/**
 * Parse YAML front matter from Markdown content
 * Returns array with 'metadata' and 'content' keys
 */
function parseFrontMatter($content) {
    $metadata = [];
    $bodyContent = $content;
    
    // Normalize line endings to \n (handle CRLF, CR, and LF)
    $content = str_replace(["\r\n", "\r"], "\n", $content);
    
    // Check if content starts with YAML front matter (---)
    if (preg_match('/^---\s*\n(.*?)\n---\s*\n(.*)$/s', $content, $matches)) {
        $yamlContent = $matches[1];
        $bodyContent = $matches[2];
        
        // Parse YAML manually (improved parser)
        $lines = explode("\n", $yamlContent);
        $currentArray = null;
        $lineCount = count($lines);
        
        for ($i = 0; $i < $lineCount; $i++) {
            $line = $lines[$i];
            $trimmedLine = trim($line);
            
            // Skip empty lines
            if (empty($trimmedLine)) continue;
            
            // Check for array item (starts with - after optional spaces)
            if (preg_match('/^\s*-\s+(.+)$/', $line, $arrayMatch)) {
                if ($currentArray !== null) {
                    // Remove quotes from value if present
                    $value = trim($arrayMatch[1]);
                    $value = trim($value, '"\'');
                    $metadata[$currentArray][] = $value;
                }
                continue;
            }
            
            // Check for key-value pair
            if (preg_match('/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/', $trimmedLine, $kvMatch)) {
                $key = $kvMatch[1];
                $value = trim($kvMatch[2]);
                
                // Check if value is empty or if next line is an array item
                $nextLineIsArray = false;
                if ($i + 1 < $lineCount) {
                    $nextLine = trim($lines[$i + 1]);
                    if (preg_match('/^-\s+/', $nextLine)) {
                        $nextLineIsArray = true;
                    }
                }
                
                if (empty($value) || $nextLineIsArray) {
                    // This key will have array values
                    $currentArray = $key;
                    $metadata[$key] = [];
                    
                    // If value is not empty but next line is array, treat value as scalar
                    if (!empty($value) && !$nextLineIsArray) {
                        $value = trim($value, '"\'');
                        if ($value === 'true') {
                            $value = true;
                        } elseif ($value === 'false') {
                            $value = false;
                        }
                        $metadata[$key] = $value;
                        $currentArray = null;
                    }
                } else {
                    // Scalar value
                    $currentArray = null;
                    
                    // Check if value is an inline array: [item1, item2, item3]
                    if (preg_match('/^\[(.*)\]$/', $value, $arrayMatch)) {
                        $items = explode(',', $arrayMatch[1]);
                        $metadata[$key] = array_map(function($item) {
                            return trim(trim($item), '"\'');
                        }, $items);
                    } else {
                        $value = trim($value, '"\'');
                        
                        // Convert boolean strings to actual booleans
                        if ($value === 'true') {
                            $value = true;
                        } elseif ($value === 'false') {
                            $value = false;
                        }
                        
                        $metadata[$key] = $value;
                    }
                }
            }
        }
    }
    
    return [
        'metadata' => $metadata,
        'content' => $bodyContent
    ];
}

/**
 * Extract Obsidian-style inline tags from markdown content
 * Obsidian tags are formatted as #tag (no space after #)
 * This function looks for tags on the first line(s) of the content
 * Returns array with 'tags' (array of tag strings) and 'content' (content with tag line removed)
 */
function extractObsidianTags($content) {
    $tags = [];
    $lines = explode("\n", $content);
    $linesToRemove = 0;
    
    // Check each line from the beginning
    foreach ($lines as $index => $line) {
        $trimmedLine = trim($line);
        
        // Skip empty lines at the beginning
        if (empty($trimmedLine)) {
            $linesToRemove = $index + 1;
            continue;
        }
        
        // Check if this line contains only hashtags (Obsidian tags)
        // Pattern: line starts with #word and contains only #word separated by spaces
        // Make sure it's not a markdown heading (# followed by space then text)
        if (preg_match('/^#[^\s#]/', $trimmedLine)) {
            // This line starts with a hashtag (not a heading)
            // Extract all hashtags from this line
            if (preg_match_all('/#([^\s#]+)/', $trimmedLine, $matches)) {
                $tags = array_merge($tags, $matches[1]);
            }
            $linesToRemove = $index + 1;
            
            // Continue to check next line for more tags
            continue;
        }
        
        // If we reach here, this line is not a tag line, stop looking
        break;
    }
    
    // Remove the tag lines from content
    if ($linesToRemove > 0 && !empty($tags)) {
        $lines = array_slice($lines, $linesToRemove);
        $content = implode("\n", $lines);
        // Trim leading whitespace/newlines
        $content = ltrim($content, "\n\r");
    }
    
    return [
        'tags' => $tags,
        'content' => $content
    ];
}

/**
 * Sanitize tags string: replace spaces with underscores, remove empties, deduplicate
 */
function sanitizeTagsString($tags) {
    if (empty($tags)) return '';
    $tagsArray = array_map('trim', explode(',', str_replace(' ', ',', $tags)));
    $validTags = [];
    foreach ($tagsArray as $tag) {
        if (!empty($tag)) {
            $tag = str_replace(' ', '_', $tag);
            $validTags[] = $tag;
        }
    }
    return implode(', ', $validTags);
}

/**
 * Extract metadata (title, tags, favorite, dates) from front matter and Obsidian tags.
 * Returns array with keys: title, tags, favorite, created, updated, content
 */
function extractNoteMetadata($content, $noteType, $fileName, $frontMatterData = null, $obsidianTags = null) {
    $tags = '';
    $favorite = 0;
    $created = null;
    $updated = null;
    $obsidianTags = $obsidianTags === null ? [] : $obsidianTags;

    if ($noteType === 'markdown' && $frontMatterData === null) {
        $parsed = parseFrontMatter($content);
        $frontMatterData = $parsed['metadata'];
        $content = $parsed['content'];

        $obsidianTagsResult = extractObsidianTags($content);
        $obsidianTags = $obsidianTagsResult['tags'];
        $content = $obsidianTagsResult['content'];
    }

    // Extract title
    if ($frontMatterData && isset($frontMatterData['title'])) {
        $title = is_array($frontMatterData['title'])
            ? implode(' ', $frontMatterData['title'])
            : $frontMatterData['title'];
    } else {
        $title = pathinfo($fileName, PATHINFO_FILENAME);
    }

    // Extract tags
    $allTags = [];
    if ($frontMatterData && isset($frontMatterData['tags'])) {
        if (is_array($frontMatterData['tags'])) {
            $allTags = array_merge($allTags, $frontMatterData['tags']);
        } elseif (is_string($frontMatterData['tags'])) {
            $allTags[] = $frontMatterData['tags'];
        }
    }
    if (!empty($obsidianTags)) {
        $allTags = array_merge($allTags, $obsidianTags);
    }
    if (!empty($allTags)) {
        $allTags = array_unique($allTags);
        $tags = implode(', ', $allTags);
    }
    $tags = sanitizeTagsString($tags);

    // Extract favorite
    if ($frontMatterData && isset($frontMatterData['favorite'])) {
        $favorite = ($frontMatterData['favorite'] === true || $frontMatterData['favorite'] === 1) ? 1 : 0;
    }

    // Extract dates
    if ($frontMatterData && isset($frontMatterData['created'])) {
        $created = $frontMatterData['created'];
    }
    if ($frontMatterData && isset($frontMatterData['updated'])) {
        $updated = $frontMatterData['updated'];
    }

    // Validate title
    if (empty($title)) {
        $title = t('restore_import.individual_notes.default_title_with_date', ['date' => date('Y-m-d H:i:s')]);
    }

    return [
        'title' => $title,
        'tags' => $tags,
        'favorite' => $favorite,
        'created' => $created,
        'updated' => $updated,
        'content' => $content,
        'frontMatterData' => $frontMatterData,
        'obsidianTags' => $obsidianTags,
    ];
}

/**
 * Insert a note into the database with optional created/updated timestamps.
 * Uses COALESCE to default to datetime('now') when dates are null.
 */
function insertNoteIntoDb($con, $title, $content, $folderName, $folderId, $workspace, $noteType, $tags, $favorite, $created, $updated) {
    $stmt = $con->prepare("INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, tags, favorite, created, updated, trash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')), 0)");
    $stmt->execute([$title, $content, $folderName, $folderId, $workspace, $noteType, $tags, $favorite, $created, $updated]);
    return $con->lastInsertId();
}

/**
 * Regenerate tasklist IDs and noteId for imported JSON tasklist data.
 * Updates the database entry with the regenerated data.
 */
function regenerateTasklistIds($con, $noteId, $originalJsonData, &$content) {
    if ($originalJsonData === null) return;
    foreach ($originalJsonData as &$task) {
        $task['id'] = (int)(microtime(true) * 10000);
        $task['noteId'] = (int)$noteId;
        usleep(1);
    }
    unset($task);
    $content = json_encode($originalJsonData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
    $updateStmt->execute([$content, $noteId]);
}

/**
 * Write note content to file with appropriate wrapping.
 * Returns true on success, false on failure.
 */
function writeNoteToFile($entriesPath, $noteId, $noteType, $title, $content) {
    $fileExt = ($noteType === 'markdown') ? '.md' : '.html';
    $noteFile = $entriesPath . '/' . $noteId . $fileExt;

    if ($noteType === 'markdown' || $noteType === 'tasklist') {
        $wrappedContent = $content;
    } else {
        if (stripos($content, '<html') === false) {
            $wrappedContent = "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n<title>" . htmlspecialchars($title, ENT_QUOTES) . "</title>\n</head>\n<body>\n" . $content . "\n</body>\n</html>";
        } else {
            $wrappedContent = $content;
        }
    }

    if (file_put_contents($noteFile, $wrappedContent) !== false) {
        chmod($noteFile, 0644);
        return true;
    }
    return false;
}

/**
 * Create folder hierarchy from a path string.
 * Returns the leaf folder ID, or null if path is empty.
 */
function createFolderHierarchyFromPath($con, $workspace, $folderPath, &$folderMap, &$createdFolders) {
    $folderPath = trim($folderPath, '/');

    if (empty($folderPath)) {
        return null;
    }

    if (isset($folderMap[$folderPath])) {
        return $folderMap[$folderPath];
    }

    $segments = explode('/', $folderPath);
    $parentId = null;
    $currentPath = '';

    foreach ($segments as $segment) {
        $currentPath = ($currentPath === '') ? $segment : $currentPath . '/' . $segment;

        if (isset($folderMap[$currentPath])) {
            $parentId = $folderMap[$currentPath];
            continue;
        }

        if ($parentId === null) {
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL");
            $checkStmt->execute([$segment, $workspace]);
        } else {
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id = ?");
            $checkStmt->execute([$segment, $workspace, $parentId]);
        }

        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $folderId = (int)$existing['id'];
            $folderMap[$currentPath] = $folderId;
            $parentId = $folderId;
        } else {
            try {
                $insertStmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id) VALUES (?, ?, ?)");
                $insertStmt->execute([$segment, $workspace, $parentId]);
                $folderId = (int)$con->lastInsertId();
                $folderMap[$currentPath] = $folderId;
                $parentId = $folderId;
                $createdFolders++;
            } catch (PDOException $e) {
                error_log("Error creating folder '$segment': " . $e->getMessage());
                return null;
            }
        }
    }

    return $parentId;
}

/**
 * Process note file content based on extension.
 * Handles JSON tasklist detection, HTML style tag removal, and TXT to HTML conversion.
 * @return array Keys: content, noteType, originalJsonData
 */
function processNoteFileContent($content, $fileExtension, $noteType) {
    $originalJsonData = null;

    // JSON files: detect tasklist or wrap as HTML
    if ($fileExtension === 'json') {
        $jsonData = json_decode($content, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($jsonData)) {
            $isTasklist = true;
            foreach ($jsonData as $item) {
                if (!is_array($item) || !isset($item['text'])) {
                    $isTasklist = false;
                    break;
                }
            }
            if ($isTasklist) {
                $noteType = 'tasklist';
                $originalJsonData = $jsonData;
            } else {
                $noteType = 'note';
                $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES, 'UTF-8') . '</pre>';
            }
        } else {
            $noteType = 'note';
            $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES, 'UTF-8') . '</pre>';
        }
    }

    // Remove <style> tags from HTML files
    if ($noteType === 'note' && $fileExtension === 'html') {
        $content = removeStyleTags($content);
    }

    // Convert plain text to HTML with preserved line breaks
    if ($noteType === 'note' && $fileExtension === 'txt') {
        $content = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');
        $content = nl2br($content, true);
    }

    return ['content' => $content, 'noteType' => $noteType, 'originalJsonData' => $originalJsonData];
}

/**
 * Import a single note file: process content, extract metadata, insert into DB, and optionally write to file.
 * @param bool $writeFile If false, skips file writing (caller handles it, e.g. for post-insert image processing)
 * @return array Keys: success, error, noteId, noteType, content, title
 */
function importSingleNoteFile($con, $content, $fileName, $fileExtension, $workspace, $folderName, $folderId, $entriesPath, $writeFile = true) {
    $noteType = ($fileExtension === 'md' || $fileExtension === 'markdown') ? 'markdown' : 'note';

    $processed = processNoteFileContent($content, $fileExtension, $noteType);
    $content = $processed['content'];
    $noteType = $processed['noteType'];
    $originalJsonData = $processed['originalJsonData'];

    // Parse front matter and Obsidian tags for markdown
    $frontMatterData = null;
    $obsidianTags = [];
    if ($noteType === 'markdown') {
        $parsed = parseFrontMatter($content);
        $frontMatterData = $parsed['metadata'];
        $content = $parsed['content'];

        $obsidianTagsResult = extractObsidianTags($content);
        $obsidianTags = $obsidianTagsResult['tags'];
        $content = $obsidianTagsResult['content'];
    }

    // Extract metadata (title, tags, favorite, dates)
    $meta = extractNoteMetadata($content, $noteType, $fileName, $frontMatterData, $obsidianTags);
    $title = $meta['title'];
    $tags = $meta['tags'];
    $favorite = $meta['favorite'];
    $created = $meta['created'];
    $updated = $meta['updated'];
    $content = $meta['content'];
    $frontMatterData = $meta['frontMatterData'];

    // Override folder from front matter if present
    if ($frontMatterData && isset($frontMatterData['folder']) && !empty($frontMatterData['folder'])) {
        $folderName = $frontMatterData['folder'];
        $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
        $fStmt->execute([$folderName, $workspace]);
        $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
        $folderId = $folderData ? (int)$folderData['id'] : null;
    }

    // Insert into database
    $noteId = insertNoteIntoDb($con, $title, $content, $folderName, $folderId, $workspace, $noteType, $tags, $favorite, $created, $updated);

    // Regenerate tasklist IDs if needed
    if ($noteType === 'tasklist') {
        regenerateTasklistIds($con, $noteId, $originalJsonData, $content);
    }

    // Write note to file (unless caller handles it)
    if ($writeFile) {
        if (!writeNoteToFile($entriesPath, $noteId, $noteType, $title, $content)) {
            $deleteStmt = $con->prepare("DELETE FROM entries WHERE id = ?");
            $deleteStmt->execute([$noteId]);
            return ['success' => false, 'error' => 'Cannot write file'];
        }
    }

    return ['success' => true, 'noteId' => (int)$noteId, 'noteType' => $noteType, 'content' => $content, 'title' => $title];
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
    
    $maxFiles = (int)(getenv('POZNOTE_IMPORT_MAX_ZIP_FILES') ?: 300);
    
    // First pass: count valid files in the ZIP to enforce limit BEFORE importing anything
    $validFileCount = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $filename = $stat['name'];
        
        // Skip directories and non-note files
        if (substr($filename, -1) === '/' || !preg_match('/\.(html|md)$/i', $filename)) {
            continue;
        }
        
        // Get the base filename without path
        $baseFilename = basename($filename);
        
        // Only count files that follow the ID.extension pattern
        if (preg_match('/^(\d+)\.(html|md)$/i', $baseFilename)) {
            $validFileCount++;
        }
    }
    
    // Check if the number of valid files exceeds the limit
    if ($validFileCount > $maxFiles) {
        $zip->close();
        unlink($tempFile);
        return [
            'success' => false,
            'error' => t('restore_import.individual_notes.errors.too_many_files', ['max' => $maxFiles, 'count' => $validFileCount])
        ];
    }
    
    $importedCount = 0;
    $updatedCount = 0;
    $errors = [];
    
    // Second pass: extract each file and create/update database entries
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
        
        // Clean content for search (remove base64 images, excalidraw data, etc.)
        $cleanedContent = cleanContentForSearch($content);
        
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
                $updateStmt->execute([$title, $cleanedContent, $noteType, $noteId]);
                $updatedCount++;
            } else {
                // Insert new entry with specific ID
                // No folder (uncategorized) - use the first available workspace
                $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
                $defaultWs = $wsStmt->fetchColumn() ?: 'Default';
                $insertStmt = $con->prepare("INSERT INTO entries (id, heading, entry, folder, folder_id, workspace, type, created, updated, trash, favorite) VALUES (?, ?, ?, NULL, NULL, ?, ?, datetime('now'), datetime('now'), 0, 0)");
                $insertStmt->execute([$noteId, $title, $cleanedContent, $defaultWs, $noteType]);
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

function importIndividualNotesZip($uploadedFile, $workspace = null, $folder = null) {
    global $con;
    
    // If no workspace provided, get the first available workspace
    if (empty($workspace)) {
        $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
        $workspace = $wsStmt->fetchColumn();
        if (!$workspace) {
            return ['success' => false, 'error' => t('restore_import.individual_notes.errors.no_workspace_available', [], 'No workspace available')];
        }
    }
    
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
    
    $maxFiles = (int)(getenv('POZNOTE_IMPORT_MAX_ZIP_FILES') ?: 300);
    
    // Track if we started a transaction for cleanup purposes
    $transactionStarted = false;
    
    // Detect if ZIP contains folder structure and find common root
    $hasSubfolders = false;
    $hasFilesAtRoot = false;
    $rootFolderName = null;
    $allFilesShareSameRoot = true;
    $filesAnalyzed = [];
    
    // Analyze ZIP structure - collect all file paths
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $fileName = $stat['name'];
        
        // Skip directories themselves and hidden files
        if (substr($fileName, -1) === '/' || basename($fileName)[0] === '.') {
            continue;
        }
        
        // Get file extension
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Only consider valid note files
        if (!in_array($fileExtension, ['html', 'md', 'markdown', 'txt'])) {
            continue;
        }
        
        $filesAnalyzed[] = $fileName;
        
        // Check if file is in a subdirectory
        $dirPath = dirname($fileName);
        if ($dirPath !== '.' && $dirPath !== '') {
            $hasSubfolders = true;
            
            // Extract root folder name
            $parts = explode('/', $fileName);
            if (count($parts) > 1) {
                $firstSegment = $parts[0];
                
                if ($rootFolderName === null) {
                    $rootFolderName = $firstSegment;
                } else if ($rootFolderName !== $firstSegment) {
                    // Found a file with a different root folder
                    $allFilesShareSameRoot = false;
                }
            }
        } else {
            // File is at root level - mark that we have files at root
            $hasFilesAtRoot = true;
        }
    }
    
    // If we have files at both root level and in subfolders, they don't share the same root
    if ($hasFilesAtRoot && $hasSubfolders) {
        $allFilesShareSameRoot = false;
    }
    
    // Only use rootFolderName if ALL files share the same root
    if (!$allFilesShareSameRoot || $rootFolderName === null) {
        $rootFolderName = null;
    }
    
    // Map to store folder paths to folder IDs
    $folderMap = [];
    $createdFolders = 0;
    
    // First pass: count valid files in the ZIP to enforce limit BEFORE importing anything
    $validFileCount = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $fileName = $stat['name'];
        
        // Skip directories and hidden files
        if (substr($fileName, -1) === '/' || basename($fileName)[0] === '.') {
            continue;
        }
        
        // Get file extension
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Only count HTML, MD, Markdown and TXT files
        if (in_array($fileExtension, ['html', 'md', 'markdown', 'txt'])) {
            $validFileCount++;
        }
    }
    
    // Check if the number of valid files exceeds the limit
    if ($validFileCount > $maxFiles) {
        $zip->close();
        unlink($tempFile);
        return [
            'success' => false,
            'error' => t('restore_import.individual_notes.errors.too_many_files', ['max' => $maxFiles, 'count' => $validFileCount])
        ];
    }
    
    // Get attachments directory for importing images
    $attachmentsPath = getAttachmentsPath();
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        // Try to create the attachments directory
        if (!mkdir($attachmentsPath, 0755, true)) {
            $zip->close();
            unlink($tempFile);
            return ['success' => false, 'error' => 'Cannot create attachments directory'];
        }
    }
    
    // Pre-extract all images from the ZIP and build a mapping of original filename to stored filename
    // This handles Obsidian-style image references like ![[image.png]]
    $imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    $importedImages = []; // Maps original filename (lowercase) to stored attachment info
    $importedImagesCount = 0;
    
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $fileName = $stat['name'];
        
        // Skip directories and hidden files/folders
        if (substr($fileName, -1) === '/' || basename($fileName)[0] === '.') {
            continue;
        }
        
        // Skip files in hidden folders (like .obsidian)
        if (preg_match('/\/\./', $fileName) || strpos($fileName, '.') === 0) {
            $parts = explode('/', $fileName);
            $skipFile = false;
            foreach ($parts as $part) {
                if (!empty($part) && $part[0] === '.') {
                    $skipFile = true;
                    break;
                }
            }
            if ($skipFile) continue;
        }
        
        // Get file extension
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Only process image files
        if (!in_array($fileExtension, $imageExtensions)) {
            continue;
        }
        
        // Extract image content
        $imageContent = $zip->getFromIndex($i);
        if ($imageContent === false) {
            continue;
        }
        
        // Get the original filename (basename only, for matching with ![[filename]])
        $originalFilename = basename($fileName);
        
        // Generate unique filename for storage
        $uniqueFilename = uniqid() . '_' . time() . '.' . $fileExtension;
        $targetPath = $attachmentsPath . '/' . $uniqueFilename;
        
        // Save the image
        if (file_put_contents($targetPath, $imageContent) !== false) {
            chmod($targetPath, 0644);
            
            // Store mapping using lowercase key for case-insensitive matching
            $importedImages[strtolower($originalFilename)] = [
                'unique_filename' => $uniqueFilename,
                'original_filename' => $originalFilename,
                'file_size' => strlen($imageContent),
                'file_type' => 'image/' . ($fileExtension === 'jpg' ? 'jpeg' : $fileExtension)
            ];
            $importedImagesCount++;
        }
    }
    
    $importedCount = 0;
    $errorCount = 0;
    $errors = [];
    
    // Use shared helper wrapped in closure for local use
    $createFolderHierarchy = function($folderPath) use ($con, $workspace, &$folderMap, &$createdFolders) {
        return createFolderHierarchyFromPath($con, $workspace, $folderPath, $folderMap, $createdFolders);
    };
    
    // Configure SQLite for better performance and reduce locking
    try {
        $con->exec("PRAGMA journal_mode=WAL");
        $con->exec("PRAGMA synchronous=NORMAL");
        $con->exec("PRAGMA busy_timeout=10000"); // 10 seconds timeout
    } catch (PDOException $e) {
        error_log("Warning: Could not set SQLite pragmas: " . $e->getMessage());
    }
    
    // Start a transaction for all imports to improve performance
    try {
        $con->beginTransaction();
        $transactionStarted = true;
    } catch (PDOException $e) {
        $zip->close();
        unlink($tempFile);
        return ['success' => false, 'error' => 'Cannot start database transaction: ' . $e->getMessage()];
    }
    
    // Second pass: actually import the files
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $fileName = $stat['name'];
        
        // Skip directories and hidden files
        if (substr($fileName, -1) === '/' || basename($fileName)[0] === '.') {
            continue;
        }
        
        // Get file extension
        $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        
        // Only process HTML, MD, Markdown and TXT files
        if (!in_array($fileExtension, ['html', 'md', 'markdown', 'txt'])) {
            continue;
        }
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            $errorCount++;
            $errors[] = basename($fileName) . ': ' . t('restore_import.individual_notes.errors.cannot_read_file');
            continue;
        }
        
        // Determine folder from ZIP structure (if hasSubfolders is true)
        $targetFolderId = null;
        $targetFolderName = $folder; // Use provided folder as default
        
        if ($hasSubfolders) {
            // Extract directory path from file path
            $dirPath = dirname($fileName);
            
            // Remove root folder if all files are in a single root folder
            if ($rootFolderName && strpos($dirPath, $rootFolderName) === 0) {
                $dirPath = substr($dirPath, strlen($rootFolderName));
                $dirPath = trim($dirPath, '/');
            }
            
            // Create folder hierarchy if path is not empty
            if (!empty($dirPath) && $dirPath !== '.') {
                $targetFolderId = $createFolderHierarchy($dirPath);
                // Get the leaf folder name for legacy support
                $segments = explode('/', $dirPath);
                $targetFolderName = end($segments);
            }
        } else if ($folder !== null && $folder !== '') {
            // Use the provided folder parameter if no subfolders in ZIP
            $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
            $fStmt->execute([$folder, $workspace]);
            $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $targetFolderId = (int)$folderData['id'];
                $targetFolderName = $folder;
            }
        }
        
        try {
            // Import note using shared helper (skip file write - image processing may modify content)
            $result = importSingleNoteFile($con, $content, $fileName, $fileExtension, $workspace, $targetFolderName, $targetFolderId, $entriesPath, false);
            if (!$result['success']) {
                $errorCount++;
                $errors[] = basename($fileName) . ': ' . $result['error'];
                continue;
            }
            $noteId = $result['noteId'];
            $noteType = $result['noteType'];
            $content = $result['content'];
            $title = $result['title'];
            
            // Process Obsidian-style image references ![[image.png]] and convert to standard markdown
            // Also build the attachments array for this note
            $noteAttachments = [];
            if ($noteType === 'markdown' && !empty($importedImages)) {
                // Match Obsidian wikilink image syntax: ![[filename.ext]] or ![[filename.ext|alt text]]
                $content = preg_replace_callback('/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/', function($matches) use ($noteId, $importedImages, &$noteAttachments) {
                    $imageName = trim($matches[1]);
                    $altText = isset($matches[2]) ? trim($matches[2]) : $imageName;
                    
                    // Look up the image in our imported images (case-insensitive)
                    $imageKey = strtolower(basename($imageName));
                    
                    if (isset($importedImages[$imageKey])) {
                        $imageInfo = $importedImages[$imageKey];
                        
                        // Add to note's attachments if not already added
                        $alreadyAdded = false;
                        foreach ($noteAttachments as $att) {
                            if ($att['filename'] === $imageInfo['unique_filename']) {
                                $alreadyAdded = true;
                                break;
                            }
                        }
                        
                        if (!$alreadyAdded) {
                            $attachmentId = uniqid();
                            $noteAttachments[] = [
                                'id' => $attachmentId,
                                'filename' => $imageInfo['unique_filename'],
                                'original_filename' => $imageInfo['original_filename'],
                                'file_size' => $imageInfo['file_size'],
                                'file_type' => $imageInfo['file_type'],
                                'uploaded_at' => date('Y-m-d H:i:s')
                            ];
                        } else {
                            // Find the existing attachment ID
                            foreach ($noteAttachments as $att) {
                                if ($att['filename'] === $imageInfo['unique_filename']) {
                                    $attachmentId = $att['id'];
                                    break;
                                }
                            }
                        }
                        
                        // Convert to standard markdown with API path
                        return '![' . $altText . '](/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . ')';
                    }
                    
                    // Image not found in imported images, keep original syntax but convert to standard markdown
                    return '![' . $altText . '](' . $imageName . ')';
                }, $content);
                
                // Also handle standard markdown images that reference local files
                // ![alt](image.png) or ![alt](./image.png)
                $content = preg_replace_callback('/!\[([^\]]*)\]\((?:\.\/)?([^)\/][^)]*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|ico))\)/i', function($matches) use ($noteId, $importedImages, &$noteAttachments) {
                    $altText = $matches[1];
                    $imageName = $matches[2];
                    
                    // Look up the image in our imported images (case-insensitive)
                    $imageKey = strtolower(basename($imageName));
                    
                    if (isset($importedImages[$imageKey])) {
                        $imageInfo = $importedImages[$imageKey];
                        
                        // Add to note's attachments if not already added
                        $alreadyAdded = false;
                        $attachmentId = null;
                        foreach ($noteAttachments as $att) {
                            if ($att['filename'] === $imageInfo['unique_filename']) {
                                $alreadyAdded = true;
                                $attachmentId = $att['id'];
                                break;
                            }
                        }
                        
                        if (!$alreadyAdded) {
                            $attachmentId = uniqid();
                            $noteAttachments[] = [
                                'id' => $attachmentId,
                                'filename' => $imageInfo['unique_filename'],
                                'original_filename' => $imageInfo['original_filename'],
                                'file_size' => $imageInfo['file_size'],
                                'file_type' => $imageInfo['file_type'],
                                'uploaded_at' => date('Y-m-d H:i:s')
                            ];
                        }
                        
                        // Convert to API path
                        return '![' . $altText . '](/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . ')';
                    }
                    
                    // Image not found, keep original
                    return $matches[0];
                }, $content);
                
                // Update the note's attachments in the database if any were added
                if (!empty($noteAttachments)) {
                    $attachmentsJson = json_encode($noteAttachments);
                    $updateStmt = $con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
                    $updateStmt->execute([$attachmentsJson, $noteId]);
                }
            }
            
            // Save content to file
            if (writeNoteToFile($entriesPath, $noteId, $noteType, $title, $content)) {
                $importedCount++;
            } else {
                $errorCount++;
                $errors[] = basename($fileName) . ': Cannot write file';
                $stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
                $stmt->execute([$noteId]);
            }
            
        } catch (Exception $e) {
            $errorCount++;
            $errors[] = basename($fileName) . ': ' . $e->getMessage();
        }
    }
    
    // Commit the transaction
    try {
        if ($transactionStarted) {
            $con->commit();
        }
    } catch (PDOException $e) {
        if ($transactionStarted) {
            $con->rollBack();
        }
        $zip->close();
        unlink($tempFile);
        return ['success' => false, 'error' => 'Database transaction failed: ' . $e->getMessage()];
    }
    
    $zip->close();
    unlink($tempFile);
    
    // Build result message
    $messageParts = [];
    
    if ($hasSubfolders && $createdFolders > 0) {
        $messageParts[] = t('restore_import.messages.notes_imported_with_folders', ['count' => $importedCount, 'folders' => $createdFolders, 'workspace' => $workspace], 'Imported {{count}} note(s) and created {{folders}} folder(s) in workspace "{{workspace}}".');
    } else {
        $folderDisplay = empty($folder) ? t('restore_import.sections.individual_notes.no_folder', [], 'No folder (root level)') : $folder;
        $messageParts[] = t('restore_import.messages.notes_imported_zip', ['count' => $importedCount, 'workspace' => $workspace, 'folder' => $folderDisplay], 'Imported {{count}} note(s) from ZIP into workspace "{{workspace}}", folder "{{folder}}".');
    }
    
    // Add info about imported images
    if ($importedImagesCount > 0) {
        $messageParts[] = $importedImagesCount . ' image(s) imported as attachments';
    }
    
    if ($errorCount > 0) {
        $messageParts[] = "{$errorCount} error(s): " . implode('; ', array_slice($errors, 0, 5));
    }
    
    $message = implode("\n", $messageParts);
    
    return ['success' => true, 'message' => $message];
}

function importIndividualNotes($uploadedFiles, $workspace = null, $folder = null) {
    global $con;
    
    // If no workspace provided, get the first available workspace
    if (empty($workspace)) {
        $wsStmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
        $workspace = $wsStmt->fetchColumn();
        if (!$workspace) {
            return ['success' => false, 'error' => t('restore_import.individual_notes.errors.no_workspace_available', [], 'No workspace available')];
        }
    }
    
    // Check file count limit
    $maxFiles = (int)(getenv('POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES') ?: 50);
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
        if (!in_array($fileExtension, ['html', 'md', 'markdown', 'txt', 'json'])) {
            $errorCount++;
            $errors[] = $fileName . ': ' . t('restore_import.individual_notes.errors.invalid_file_type', ['allowed' => '.html, .md, .markdown, .txt, .json']);
            continue;
        }
        
        // Read file content
        $content = file_get_contents($tmpName);
        if ($content === false) {
            $errorCount++;
            $errors[] = $fileName . ': ' . t('restore_import.individual_notes.errors.cannot_read_file');
            continue;
        }
        
        // Resolve folder_id if folder is provided
        $folder_id = null;
        if ($folder !== null && $folder !== '') {
            $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
            $fStmt->execute([$folder, $workspace]);
            $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
            if ($folderData) {
                $folder_id = (int)$folderData['id'];
            }
        }
        
        try {
            $result = importSingleNoteFile($con, $content, $fileName, $fileExtension, $workspace, $folder, $folder_id, $entriesPath);
            if ($result['success']) {
                $importedCount++;
            } else {
                $errorCount++;
                $errors[] = $fileName . ': ' . $result['error'];
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
    <title><?php echo getPageTitle(); ?></title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
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
        <div class="navigation-buttons" style="justify-content: center;">
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_settings'); ?>
            </a>
        </div>
        
        <!-- Global Messages Section - Always visible at the top -->
        <?php if ($restore_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($restore_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($restore_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($restore_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_notes_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_attachments_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_attachments_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_attachments_error); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_message): ?>
            <div class="alert alert-success">
                <?php echo nl2br(htmlspecialchars($import_individual_notes_message)); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($import_individual_notes_error): ?>
            <div class="alert alert-danger">
                <?php echo htmlspecialchars($import_individual_notes_error); ?>
            </div>
        <?php endif; ?>
        
        <!-- Restore From Backup Card -->
        <div class="backup-section">
            <div class="card-container">
                <div class="card-header" data-action="toggle-card" data-target="restoreBackupContent">
                    <h3>
                        <?php echo t_h('restore_import.sections.restore_from_backup.title'); ?>
                    </h3>
                </div>
                <div class="card-content" id="restoreBackupContent">
            
        <!-- Standard Complete Restore Section -->
        <div class="sub-card">
            <div class="sub-card-header" data-action="toggle-sub-card" data-target="standardRestoreContent">
                <h4>
                    <?php echo t_h('restore_import.sections.standard_restore.title'); ?>
                </h4>
            </div>
            <div class="sub-card-content" id="standardRestoreContent">
                <p><?php echo t_h('restore_import.sections.standard_restore.description'); ?></p>

            <form method="post" enctype="multipart/form-data">
                <input type="hidden" name="action" value="complete_restore">
                <div class="form-group">
                    <input type="file" id="complete_backup_file" name="complete_backup_file" accept=".zip" required>
                    <small class="form-text text-muted"><?php echo t_h('restore_import.sections.standard_restore.helper'); ?></small>
                </div>
                
                <button type="button" id="completeRestoreBtn" class="btn btn-primary" data-action="show-complete-restore-confirmation">
                    <span><?php echo t_h('restore_import.buttons.start_restore'); ?></span>
                </button>
                <!-- Spinner shown while processing restore -->
                <div id="restoreSpinner" class="restore-spinner initially-hidden" role="status" aria-live="polite" aria-hidden="true">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.processing_long'); ?></span>
                </div>
            </form>
            </div>
        </div>

        <!-- Direct Copy Restore Section -->
        <div class="sub-card">
            <div class="sub-card-header" data-action="toggle-sub-card" data-target="directCopyRestoreContent">
                <h4>
                    <?php echo t_h('restore_import.sections.direct_copy_restore.title'); ?>
                </h4>
            </div>
            <div class="sub-card-content" id="directCopyRestoreContent">
                <p>
                <?php echo t_h('restore_import.sections.direct_copy_restore.step1'); ?>
            </p>
            <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;"><code style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace;"><?php echo t_h('restore_import.sections.direct_copy_restore.docker_command'); ?></code></pre>
            <p>
                <?php echo t_h('restore_import.sections.direct_copy_restore.step2'); ?>
            </p>

            <form method="post">
                <input type="hidden" name="action" value="check_cli_upload">
                <button type="button" class="btn btn-primary" data-action="show-direct-copy-restore-confirmation">
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
                    echo "<form method='post' id='directCopyRestoreForm' class='form-with-margin-top'>";
                    echo "<input type='hidden' name='action' value='restore_cli_upload'>";
                    echo "<button type='button' class='btn btn-warning' data-action='show-direct-copy-restore-confirmation'>";
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
                        echo "<div class='alert alert-success'>" . t_h('restore_import.direct_copy.completed_successfully_prefix') . " " . nl2br(htmlspecialchars($result['message'])) . "</div>";
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
        
        <!-- Individual Notes Import Card -->
        <div class="backup-section">
            <div class="card-container">
                <div class="card-header" data-action="toggle-card" data-target="individualNotesContent">
                    <h3>
                        <?php echo t_h('restore_import.sections.individual_notes.title'); ?>
                    </h3>
                </div>
                <div class="card-content" id="individualNotesContent">

            <form method="post" enctype="multipart/form-data" id="individualNotesForm">
                <input type="hidden" name="action" value="import_individual_notes">
                
                <div class="form-group form-group-spaced">
                    <label for="target_workspace_select" class="form-label">
                        1. <?php echo t_h('restore_import.sections.individual_notes.workspace', 'Target Workspace'); ?>
                    </label>
                    <select id="target_workspace_select" name="target_workspace" class="form-control form-select-styled" required>
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.loading', 'Loading...'); ?></option>
                    </select>
                </div>
                
                <div class="form-group form-group-spaced">
                    <label for="target_folder_select" class="form-label">
                        2. <?php echo t_h('restore_import.sections.individual_notes.folder', 'Target Folder'); ?>
                    </label>
                    <small class="form-text form-text-block form-text-danger">
                        <?php echo t_h('restore_import.sections.individual_notes.frontmatter_warning', 'Si une note MD contient une clé folder dans un front matter, cette valeur écrasera celle sélectionnée ci-dessous. Il faut donc avant tout vous assurer que le dossier existe déjà'); ?>
                    </small>
                    <small class="form-text form-text-block form-text-info">
                        <strong><?php echo t_h('restore_import.sections.individual_notes.zip_folders_info', 'ZIP avec structure de dossiers :'); ?></strong> <?php echo t_h('restore_import.sections.individual_notes.zip_folders_description', 'Si votre ZIP contient des dossiers, ils seront automatiquement créés comme folders dans Poznote, en préservant leur hiérarchie (sous-dossiers inclus).'); ?>
                    </small>
                    <select id="target_folder_select" name="target_folder" class="form-control form-select-styled">
                        <option value=""><?php echo t_h('restore_import.sections.individual_notes.no_folder', 'No folder (root level)'); ?></option>
                    </select>
                </div>
                
                <div class="form-group form-group-spaced">
                    <label for="individual_notes_files" class="form-label">
                        3. <?php echo t_h('restore_import.sections.individual_notes.select_files', 'Select Files'); ?>
                    </label>
                    <small class="form-text text-muted form-text-muted-block">
                        <span class="text-danger">
                        <?php 
                        $maxIndividualFiles = (int)(getenv('POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES') ?: 50);
                        $maxZipFiles = (int)(getenv('POZNOTE_IMPORT_MAX_ZIP_FILES') ?: 300);
                        echo t_h('restore_import.sections.individual_notes.files_info', ['maxIndividualFiles' => $maxIndividualFiles, 'maxZipFiles' => $maxZipFiles], 'Multiple files (max {{maxIndividualFiles}}) or single ZIP archive (max {{maxZipFiles}} files). These limits can be changed,');
                        echo ' <a href="https://github.com/timothepoznanski/poznote#import-individual-notes" target="_blank" rel="noopener">';
                        echo t_h('restore_import.sections.individual_notes.files_info_link', 'see documentation');
                        echo '</a>.';
                        ?>
                        </span><br>
                        <?php echo t_h('restore_import.sections.individual_notes.supported_formats', 'Supported: .html, .md, .markdown, .txt, .zip'); ?>
                    </small>
                    <input type="file" id="individual_notes_files" name="individual_notes_files[]" accept=".html,.md,.markdown,.txt,.json,.zip" multiple required class="form-file-input">
                </div>
                
                <button type="button" class="btn btn-primary btn-with-margin-top" data-action="show-individual-notes-import-confirmation" id="individualNotesImportBtn">
                    <?php echo t_h('restore_import.buttons.start_import', 'Start Import'); ?>
                </button>
                
                <!-- Spinner shown while processing import -->
                <div id="individualNotesImportSpinner" class="restore-spinner initially-hidden spinner-with-margin-top" role="status" aria-live="polite" aria-hidden="true">
                    <div class="restore-spinner-circle" aria-hidden="true"></div>
                    <span class="sr-only"><?php echo t_h('restore_import.spinner.processing'); ?></span>
                    <span class="restore-spinner-text"><?php echo t_h('restore_import.spinner.importing_notes', 'Importation des notes en cours...'); ?></span>
                </div>
            </form>
                </div>
            </div>
        </div>
        
        <?php if (isCurrentUserAdmin()): ?>
        <!-- Disaster Recovery Card -->
        <div class="backup-section">
            <div class="card-container">
                <div class="card-header" data-action="toggle-card" data-target="maintenanceContent">
                    <h3>
                        <?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?>
                    </h3>
                </div>
                <div class="card-content" id="maintenanceContent">
                    <p class="admin-subtitle maintenance-description" style="margin-bottom: 20px;"><?php echo t_h('multiuser.admin.maintenance.description', [], 'Poznote stores your notes in individual user folders. The main system index (master.db) tracks which user owns which folder. If you lose this index, this tool will scan your folders to automatically recreate the user accounts and restore all public sharing links.'); ?></p>
                    
                    <button type="button" class="btn btn-secondary btn-maintenance" data-action="run-repair">
                        <?php echo t_h('multiuser.admin.maintenance.repair_registry', [], 'Reconstruct System Index'); ?>
                    </button>
                </div>
            </div>
        </div>
        <?php endif; ?>
        
        <!-- Bottom padding for better spacing -->
        <div class="section-bottom-spacer"></div>
    </div>

    <!-- Simple Import Confirmation Modal -->
    <div id="importConfirmModal" class="import-confirm-modal">
        <div class="import-confirm-modal-content">
            <h3><?php echo t_h('restore_import.modals.import_confirm.title'); ?></h3>
            <p><?php echo t_h('restore_import.modals.import_confirm.body'); ?></p>
            
            <div class="import-confirm-buttons">
                <button type="button" class="btn-cancel" data-action="hide-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-import">
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
                <button type="button" class="btn-cancel" data-action="hide-complete-restore-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-complete-restore">
                    <?php echo t_h('restore_import.modals.complete_restore.confirm'); ?>
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
                <button type="button" class="btn-cancel" data-action="hide-notes-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-notes-import">
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
                <button type="button" class="btn-cancel" data-action="hide-attachments-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-attachments-import">
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
                <button type="button" class="btn-cancel" data-action="hide-direct-copy-restore-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-direct-copy-restore">
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
                <button type="button" class="btn-cancel" data-action="hide-individual-notes-import-confirmation">
                    <?php echo t_h('common.cancel'); ?>
                </button>
                <button type="button" class="btn-confirm" data-action="proceed-individual-notes-import">
                    <?php echo t_h('restore_import.modals.import_individual_notes.confirm'); ?>
                </button>
            </div>
        </div>
    </div>
    <div id="customAlert" class="custom-alert">
        <div class="custom-alert-content">
            <h3 id="alertTitle"><?php echo t_h('restore_import.alerts.no_file_selected.title'); ?></h3>
            <p id="alertMessage"><?php echo t_h('restore_import.alerts.no_file_selected.body'); ?></p>
            <button type="button" class="alert-ok-button" data-action="hide-custom-alert">
                <?php echo t_h('restore_import.alerts.ok'); ?>
            </button>
        </div>
    </div>
    
    <!-- Custom Status Modal -->
    <div class="modal" id="statusModal">
        <div class="modal-content">
            <h2 class="modal-title" id="statusModalTitle"></h2>
            <p id="statusModalMessage" style="white-space: pre-wrap; margin-bottom: 25px;"></p>
            <div class="form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="statusModalCancelBtn"></button>
                <button type="button" class="btn btn-primary" id="statusModalConfirmBtn"></button>
            </div>
        </div>
    </div>
    
    <!-- Configuration for JavaScript -->
    <script type="application/json" id="restore-import-config"><?php
        echo json_encode([
            'maxIndividualFiles' => (int)(getenv('POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES') ?: 50),
            'maxZipFiles' => (int)(getenv('POZNOTE_IMPORT_MAX_ZIP_FILES') ?: 300)
        ]);
    ?></script>
    <script src="js/restore-import.js"></script>
</body>
</html>