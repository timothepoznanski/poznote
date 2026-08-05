<?php
/**
 * Shared note-import helpers.
 *
 * These functions are used by restore_import.php (the Settings > Import page)
 * and by api_import_dropped_notes.php (drag-and-drop import from the sidebar).
 * They expect config.php, functions.php and db_connect.php to be loaded already.
 */

if (!defined('POZNOTE_IMPORT_HELPERS_LOADED')) {
    define('POZNOTE_IMPORT_HELPERS_LOADED', true);

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
 * Convert Markdown checkbox list content to Poznote tasklist JSON.
 * Returns JSON string, or null when the content does not look like a tasklist.
 */
function convertMarkdownCheckboxListToTasklistJson($markdownContent) {
    $markdownContent = str_replace(["\r\n", "\r"], "\n", $markdownContent);
    $trimmedContent = trim($markdownContent);

    if ($trimmedContent === '') {
        return json_encode([], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    $tasks = [];
    $lines = explode("\n", $markdownContent);

    foreach ($lines as $line) {
        if (!preg_match('/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/u', $line, $matches)) {
            continue;
        }

        $text = trim($matches[2]);
        $important = false;

        if (preg_match('/\s+⭐\s*$/u', $text)) {
            $important = true;
            $text = preg_replace('/\s+⭐\s*$/u', '', $text);
            $text = preg_replace('/^\*\*(.*)\*\*$/us', '$1', trim($text));
        }

        $text = trim($text);
        if ($text === '') {
            continue;
        }

        $tasks[] = [
            'id' => (int) (microtime(true) * 10000),
            'text' => $text,
            'completed' => strtolower($matches[1]) === 'x',
            'noteId' => '',
            'important' => $important,
        ];
        usleep(1);
    }

    if (empty($tasks)) {
        return null;
    }

    return json_encode($tasks, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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

function isSequentialArray($value) {
    if (!is_array($value)) {
        return false;
    }

    if ($value === []) {
        return true;
    }

    return array_keys($value) === range(0, count($value) - 1);
}

/**
 * Normalize imported tasklist payloads stored as raw JSON.
 * Accepts the native Poznote array format and {"tasks": [...]} wrappers.
 * Returns a normalized JSON string or null when the content is not a tasklist.
 */
function normalizeImportedTasklistJson($content) {
    if (!is_string($content)) {
        return null;
    }

    $normalized = normalizeTasklistJsonContent($content);
    if ($normalized === '') {
        return null;
    }

    $decoded = json_decode($normalized, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        return null;
    }

    if (!isSequentialArray($decoded)) {
        return null;
    }

    if ($decoded === []) {
        return $normalized;
    }

    $hasTaskMetadata = false;

    foreach ($decoded as $task) {
        if (!is_array($task) || !array_key_exists('text', $task)) {
            return null;
        }

        if (array_key_exists('completed', $task) || array_key_exists('important', $task) || array_key_exists('noteId', $task) || array_key_exists('id', $task)) {
            $hasTaskMetadata = true;
        }
    }

    return $hasTaskMetadata ? $normalized : null;
}

/**
 * Detect tasklist imports from raw JSON files or exported HTML tasklist markup.
 * Returns normalized content and the detected note type.
 */
function detectImportedTasklistContent($content, $fileExtension, $noteType) {
    if ($noteType !== 'note') {
        return ['content' => $content, 'noteType' => $noteType, 'originalJsonData' => null];
    }

    $normalizedTasklistJson = normalizeImportedTasklistJson($content);
    if ($normalizedTasklistJson !== null) {
        return [
            'content' => $normalizedTasklistJson,
            'noteType' => 'tasklist',
            'originalJsonData' => json_decode($normalizedTasklistJson, true)
        ];
    }

    if ($fileExtension === 'html' && stripos($content, 'task-item') !== false && preg_match('/<div[^>]*class="[^"]*task-item[^"]*"/', $content)) {
        $tasklistJson = extractTaskListFromHTML($content);
        $decodedTasklist = json_decode($tasklistJson, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decodedTasklist)) {
            return [
                'content' => $tasklistJson,
                'noteType' => 'tasklist',
                'originalJsonData' => $decodedTasklist
            ];
        }
    }

    return ['content' => $content, 'noteType' => $noteType, 'originalJsonData' => null];
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
    $detectedTasklist = detectImportedTasklistContent($content, $fileExtension, $noteType);
    $content = $detectedTasklist['content'];
    $noteType = $detectedTasklist['noteType'];
    $originalJsonData = $detectedTasklist['originalJsonData'];

    if ($noteType === 'note' && $fileExtension === 'json') {
        $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES, 'UTF-8') . '</pre>';
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
    $quotaError = poznoteCheckNoteQuota($con)
        ?? poznoteCheckStorageQuota(strlen((string)$content));
    if ($quotaError !== null) {
        return ['success' => false, 'error' => $quotaError];
    }
    // Keep the per-request usage cache accurate while a multi-file import loops
    // over this function, so later files see the space consumed by earlier ones.
    $quotaLimits = poznoteGetUserQuotaLimits();
    if ($quotaLimits['max_storage_bytes'] > 0 && poznoteUserQuotasApply()) {
        poznoteGetActiveUserStorageUsageBytes(strlen((string)$content));
    }

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

        $frontMatterType = $frontMatterData['type'] ?? null;
        if ($frontMatterType === 'tasklist') {
            $tasklistJson = convertMarkdownCheckboxListToTasklistJson($content);
            if ($tasklistJson !== null) {
                $noteType = 'tasklist';
                $content = $tasklistJson;
                $originalJsonData = json_decode($tasklistJson, true);
            }
        }

        if ($noteType === 'markdown') {
            $obsidianTagsResult = extractObsidianTags($content);
            $obsidianTags = $obsidianTagsResult['tags'];
            $content = $obsidianTagsResult['content'];
        }
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
        $frontMatterFolder = $frontMatterData['folder'];

        if (strpos($frontMatterFolder, '/') !== false) {
            // Path-format value (e.g., "1 personal/etsy shop") — resolve the full hierarchy
            $tempFolderMap = [];
            $tempCreated = 0;
            $folderId = createFolderHierarchyFromPath($con, $workspace, $frontMatterFolder, $tempFolderMap, $tempCreated);
            $segments = explode('/', $frontMatterFolder);
            $folderName = end($segments);
        } else {
            // Simple folder name — look up by name
            $folderName = $frontMatterFolder;
            $fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ?");
            $fStmt->execute([$folderName, $workspace]);
            $folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
            $folderId = $folderData ? (int)$folderData['id'] : null;
        }
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

function addImportedPoznoteAttachmentToNote(&$noteAttachments, $imageInfo) {
    if (empty($imageInfo['unique_filename'])) {
        return null;
    }

    foreach ($noteAttachments as $attachment) {
        if (($attachment['filename'] ?? null) === $imageInfo['unique_filename']) {
            return $attachment['id'] ?? null;
        }
    }

    $extension = pathinfo($imageInfo['unique_filename'], PATHINFO_EXTENSION);
    $attachmentId = uniqid();
    $noteAttachments[] = [
        'id' => $attachmentId,
        'filename' => $imageInfo['unique_filename'],
        'original_filename' => 'attachment' . ($extension ? '.' . $extension : ''),
        'file_size' => $imageInfo['file_size'] ?? 0,
        'file_type' => $imageInfo['file_type'] ?? 'application/octet-stream',
        'uploaded_at' => date('Y-m-d H:i:s')
    ];

    return $attachmentId;
}

function resolveImportedPoznoteAttachmentId($attachmentReference, array $attachmentIdMap) {
    $reference = html_entity_decode(trim((string)$attachmentReference), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $reference = strtok($reference, '?#');
    $reference = basename(str_replace('\\', '/', $reference));
    $reference = rawurldecode($reference);

    if (isset($attachmentIdMap[$reference])) {
        return $reference;
    }

    $withoutExtension = preg_replace('/\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|mov|webm|mp3|wav|ogg|m4a|txt|md|markdown|json|csv|xml|zip|tar|gz|7z|rar)$/i', '', $reference);
    if ($withoutExtension !== $reference && isset($attachmentIdMap[$withoutExtension])) {
        return $withoutExtension;
    }

    return $reference;
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
    
    $maxFiles = (int)(poznoteResolveGlobalSetting('import_max_zip_files', 'POZNOTE_IMPORT_MAX_ZIP_FILES', '300'));
    
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
        $detectedTasklist = detectImportedTasklistContent($content, $fileExtension, $noteType);
        $content = $detectedTasklist['content'];
        $noteType = $detectedTasklist['noteType'];
        
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
    $skippedCount = 0;
    $errors = [];
    $skippedFiles = [];
    
    // Extract each file
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $filename = $stat['name'];
        
        // Skip directories
        if (substr($filename, -1) === '/') {
            continue;
        }
        
        // Extract file content
        $content = $zip->getFromIndex($i);
        if ($content === false) {
            continue;
        }

        $validation = poznoteValidateAttachmentFile($filename, null, $content);
        if (!$validation['success']) {
            $skippedCount++;
            $sourcePath = str_replace('\\', '/', $filename);
            $targetFilename = poznoteNormalizeAttachmentFilename($filename);
            $skippedFiles[] = [
                'source_path' => $sourcePath,
                'target_filename' => $targetFilename,
                'reason' => $validation['error']
            ];
            $errors[] = $sourcePath . ': ' . $validation['error'];
            continue;
        }

        // Store on local disk or in the S3 bucket
        if (poznoteStoreAttachmentContent($content, $validation['filename'], $validation['mime_type'] ?? 'application/octet-stream')) {
            $importedCount++;
        }
    }

    $zip->close();
    unlink($tempFile);

    if ($importedCount === 0 && $skippedCount > 0) {
        $skippedDetailsMessage = poznoteFormatSkippedAttachmentDetails($skippedFiles);
        return [
            'success' => false,
            'error' => t(
                'restore_import.import_attachments.errors.no_allowed_files',
                ['details' => $skippedDetailsMessage !== '' ? $skippedDetailsMessage : implode('; ', array_slice($errors, 0, 5))],
                'No attachments were imported because the ZIP only contained blocked file types. {{details}}'
            ),
            'skipped_attachments' => $skippedFiles
        ];
    }

    $message = t('restore_import.import_attachments.summary', ['count' => $importedCount]);
    if ($skippedCount > 0) {
        $message .= ' ' . t(
            'restore_import.import_attachments.skipped_blocked',
            ['count' => $skippedCount],
            '{{count}} file(s) skipped because their type is not allowed.'
        );
        $skippedDetailsMessage = poznoteFormatSkippedAttachmentDetails($skippedFiles);
        if ($skippedDetailsMessage !== '') {
            $message .= "\n" . $skippedDetailsMessage;
        }
    }

    return ['success' => true, 'message' => $message, 'skipped_attachments' => $skippedFiles];
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
    
    $maxFiles = (int)(poznoteResolveGlobalSetting('import_max_zip_files', 'POZNOTE_IMPORT_MAX_ZIP_FILES', '300'));
    
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
        if (!createDirectoryWithPermissions($attachmentsPath)) {
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
    $attachmentIdMap = []; // Maps attachment IDs from exported notes to stored attachment info
    
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
        
        // Check if this is from an attachments/ folder (Poznote export)
        if (preg_match('#(?:^|/)attachments/([^/]+)$#', $fileName, $matches)) {
            $attachmentId = preg_replace('/\.' . preg_quote($fileExtension, '/') . '$/i', '', basename($matches[1]));
            
            // Generate unique filename for storage
            $uniqueFilename = uniqid() . '_' . time() . '.' . $fileExtension;

            // Save the image (local disk or S3 bucket)
            if (poznoteStoreAttachmentContent($imageContent, $uniqueFilename, 'image/' . ($fileExtension === 'jpg' ? 'jpeg' : $fileExtension))) {
                // Store mapping by attachment ID for Poznote exports
                $attachmentIdMap[$attachmentId] = [
                    'unique_filename' => $uniqueFilename,
                    'file_size' => strlen($imageContent),
                    'file_type' => 'image/' . ($fileExtension === 'jpg' ? 'jpeg' : $fileExtension)
                ];
                $importedImagesCount++;
            }
        } else {
            // Regular image (Obsidian-style or loose images)
            // Get the original filename (basename only, for matching with ![[filename]])
            $originalFilename = basename($fileName);
            
            // Generate unique filename for storage
            $uniqueFilename = uniqid() . '_' . time() . '.' . $fileExtension;

            // Save the image (local disk or S3 bucket)
            if (poznoteStoreAttachmentContent($imageContent, $uniqueFilename, 'image/' . ($fileExtension === 'jpg' ? 'jpeg' : $fileExtension))) {
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
            // Skip 'Uncategorized' — it is a placeholder used by structured exports for unfoldered notes
            if (!empty($dirPath) && $dirPath !== '.' && $dirPath !== 'Uncategorized') {
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
            if ($noteType === 'markdown' && (!empty($importedImages) || !empty($attachmentIdMap))) {
                if (!empty($importedImages)) {
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
                }
                
                // Handle Poznote-exported markdown images: (../)attachments/{attachmentId}.ext
                if (!empty($attachmentIdMap)) {
                    $content = preg_replace_callback('/!\[([^\]]*)\]\((?:\.\.\/|\.\/|\/)*attachments\/([^\)]+)\)/i', function($matches) use ($noteId, $attachmentIdMap, &$noteAttachments) {
                        $altText = $matches[1];
                        $oldAttachmentId = resolveImportedPoznoteAttachmentId($matches[2], $attachmentIdMap);
                        
                        if (isset($attachmentIdMap[$oldAttachmentId])) {
                            $imageInfo = $attachmentIdMap[$oldAttachmentId];
                            $newAttachmentId = addImportedPoznoteAttachmentToNote($noteAttachments, $imageInfo);
                            if ($newAttachmentId === null) {
                                return $matches[0];
                            }
                            
                            // Convert to API path
                            return '![' . $altText . '](/api/v1/notes/' . $noteId . '/attachments/' . $newAttachmentId . ')';
                        }
                        
                        // Attachment not found, keep original
                        return $matches[0];
                    }, $content);

                    // Markdown notes can contain raw HTML blocks (notably Excalidraw containers).
                    $content = preg_replace_callback('#(src|href)=(["\']?)(?:\.\.\/|\.\/|\/)*attachments/([^"\'>\s]+)\2#i', function($matches) use ($noteId, $attachmentIdMap, &$noteAttachments) {
                        $attr = $matches[1];
                        $quote = $matches[2];
                        $oldAttachmentId = resolveImportedPoznoteAttachmentId($matches[3], $attachmentIdMap);

                        if (isset($attachmentIdMap[$oldAttachmentId])) {
                            $imageInfo = $attachmentIdMap[$oldAttachmentId];
                            $newAttachmentId = addImportedPoznoteAttachmentToNote($noteAttachments, $imageInfo);
                            if ($newAttachmentId === null) {
                                return $matches[0];
                            }

                            return $attr . '=' . $quote . '/api/v1/notes/' . $noteId . '/attachments/' . $newAttachmentId . $quote;
                        }

                        return $matches[0];
                    }, $content);
                }
                
                // Update the note's attachments in the database if any were added
                if (!empty($noteAttachments)) {
                    $attachmentsJson = json_encode($noteAttachments);
                    $updateStmt = $con->prepare("UPDATE entries SET attachments = ? WHERE id = ?");
                    $updateStmt->execute([$attachmentsJson, $noteId]);
                }
            } else if ($noteType === 'note' && !empty($attachmentIdMap)) {
                // For HTML notes, handle Poznote-exported attachments: (../)attachments/{attachmentId}.ext
                $content = preg_replace_callback('#(src|href)=(["\']?)(?:\.\.\/|\.\/|\/)*attachments/([^"\'>\s]+)\2#i', function($matches) use ($noteId, $attachmentIdMap, &$noteAttachments) {
                    $attr = $matches[1];
                    $quote = $matches[2];
                    $oldAttachmentId = resolveImportedPoznoteAttachmentId($matches[3], $attachmentIdMap);
                    
                    if (isset($attachmentIdMap[$oldAttachmentId])) {
                        $imageInfo = $attachmentIdMap[$oldAttachmentId];
                        
                        $newAttachmentId = addImportedPoznoteAttachmentToNote($noteAttachments, $imageInfo);
                        if ($newAttachmentId === null) {
                            return $matches[0];
                        }
                        
                        // Return full src/href attribute with API URL
                        return $attr . '=' . $quote . '/api/v1/notes/' . $noteId . '/attachments/' . $newAttachmentId . $quote;
                    }
                    
                    // Attachment not found, keep original
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
    $maxFiles = (int)(poznoteResolveGlobalSetting('import_max_individual_files', 'POZNOTE_IMPORT_MAX_INDIVIDUAL_FILES', '50'));
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

}
