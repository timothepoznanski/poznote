<?php
/**
 * API Endpoint: Export Note
 * Exports a note in HTML or Markdown format
 * 
 * Parameters:
 * - id: Note ID (required)
 * - type: Note type (required)
 * - format: Export format - 'html' or 'markdown' (default: 'html')
 *   Note: HTML export is only available for 'note' and 'tasklist' types, not for 'markdown' notes
 * - disposition: 'attachment' (download, default) or 'inline' (render in browser)
 * 
 * Returns:
 * - HTML: Styled HTML document for download (note and tasklist types only)
 * - Markdown: MD file with title and tags in markdown format
 * - PDF: Not supported
 */

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'markdown_parser.php';

// Check authentication (API-friendly)
requireApiAuth();

// Only accept GET requests
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Content-Type: application/json');
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use GET.']);
    exit;
}

// Get parameters
$noteId = isset($_GET['id']) ? intval($_GET['id']) : 0;
$noteType = isset($_GET['type']) ? $_GET['type'] : 'note';
$format = isset($_GET['format']) ? strtolower($_GET['format']) : 'html';
$disposition = isset($_GET['disposition']) ? strtolower(trim((string)$_GET['disposition'])) : 'attachment';

// Validate parameters
if (!$noteId) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Note ID is required']);
    exit;
}

if (!in_array($format, ['html', 'markdown', 'json'], true)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid format. Use "html", "markdown" or "json"']);
    exit;
}

if (!in_array($disposition, ['attachment', 'inline'], true)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid disposition. Use "attachment" or "inline"']);
    exit;
}

try {
    // Fetch note from database with all metadata for front matter and attachments
    $stmt = $con->prepare('SELECT id, heading, type, tags, favorite, folder_id, created, updated, attachments FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note not found']);
        exit;
    }
    
    // Always use the actual type from DB when available
    if (!empty($note['type'])) {
        $noteType = $note['type'];
    }

    // Build file path using existing helpers (same behavior as api_download_note.php)
    $filePath = getEntryFilename($noteId, $noteType);

    // Security: ensure path stays within entries directory
    $realPath = realpath($filePath);
    $expectedDir = realpath(getEntriesPath());

    if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
        header('Content-Type: application/json');
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Invalid file path']);
        exit;
    }

    if (!file_exists($filePath) || !is_readable($filePath)) {
        header('Content-Type: application/json');
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note file not found']);
        exit;
    }

    $content = file_get_contents($filePath);
    if ($content === false) {
        header('Content-Type: application/json');
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cannot read note file']);
        exit;
    }

    // JSON export: only for tasklist notes (raw stored JSON)
    if ($format === 'json') {
        if ($noteType !== 'tasklist') {
            header('Content-Type: application/json');
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'JSON export is only available for tasklist notes']);
            exit;
        }

        // Remove UTF-8 BOM if present
        $raw = preg_replace('/^\xEF\xBB\xBF/', '', $content);

        // Validate that stored content is valid JSON
        json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Tasklist content is not valid JSON']);
            exit;
        }

        exportAsJson($raw, $note['heading']);
    }

    // Check format and export accordingly
    if ($format === 'markdown') {
        // For tasklist notes, convert JSON to markdown checkbox format
        if ($noteType === 'tasklist') {
            $content = convertTasklistToMarkdown($content);
        }
        // Export as Markdown with front matter YAML - create ZIP with attachments
        exportAsMarkdownZip($content, $note, $con);
    } else {
        // For markdown notes, convert markdown to HTML first
        if ($noteType === 'markdown') {
            // Use the shared parseMarkdown function from markdown_parser.php
            // Images will remain as attachment URLs - exportAsHtmlZip will handle them
            $content = parseMarkdown($content);
        }
        // For tasklist notes, convert stored JSON to HTML before styling
        elseif ($noteType === 'tasklist') {
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                $tasksContent = '<div class="task-list-container">' . "\n";
                $tasksContent .= '<div class="tasks-list">' . "\n";
                foreach ($decoded as $task) {
                    $text = isset($task['text']) ? htmlspecialchars((string)$task['text'], ENT_QUOTES) : '';
                    $completed = !empty($task['completed']) ? ' completed' : '';
                    $checked = !empty($task['completed']) ? ' checked' : '';
                    $important = !empty($task['important']) ? ' important' : '';
                    $tasksContent .= '<div class="task-item' . $completed . $important . '">';
                    $tasksContent .= '<input type="checkbox" disabled' . $checked . ' /> ';
                    $tasksContent .= '<span class="task-text">' . $text . '</span>';
                    $tasksContent .= '</div>' . "\n";
                }
                $tasksContent .= '</div>' . "\n";
                $tasksContent .= '</div>' . "\n";
                $content = $tasksContent;
            } else {
                $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
            }
        }
        
        // Generate styled HTML
        $htmlContent = generateStyledHtml($content, $note['heading'], $noteType, $note['tags']);
        
        // Export as HTML - create ZIP with attachments if downloading
        if ($disposition === 'attachment') {
            exportAsHtmlZip($htmlContent, $note, $con);
        } else {
            exportAsHtml($htmlContent, $note['heading'], $disposition);
        }
    }
    
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Export failed: ' . $e->getMessage()]);
}

/**
 * Convert tasklist JSON to Markdown checkbox format
 *
 * @param string $jsonContent JSON string containing tasklist data
 * @return string Markdown formatted tasklist with checkboxes
 */
function convertTasklistToMarkdown($jsonContent) {
    // Remove UTF-8 BOM if present
    $jsonContent = preg_replace('/^\xEF\xBB\xBF/', '', $jsonContent);

    // Parse JSON
    $tasks = json_decode($jsonContent, true);

    if (!is_array($tasks) || empty($tasks)) {
        return '';
    }

    $markdown = '';

    foreach ($tasks as $task) {
        $text = isset($task['text']) ? trim($task['text']) : '';
        $completed = !empty($task['completed']);
        $important = !empty($task['important']);

        // Skip empty tasks
        if (empty($text)) {
            continue;
        }

        // Build checkbox syntax: - [ ] or - [x]
        $checkbox = $completed ? '[x]' : '[ ]';

        // Add important marker if task is marked as important
        if ($important) {
            $markdown .= '- ' . $checkbox . ' **' . $text . '** ⭐' . "\n";
        } else {
            $markdown .= '- ' . $checkbox . ' ' . $text . "\n";
        }
    }

    return $markdown;
}

/**
 * Convert all local images in HTML to base64 data URIs
 */
function convertImagesToBase64InHtml($html) {
    return preg_replace_callback('/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/i', function($matches) {
        $beforeSrc = $matches[1];
        $src = $matches[2];
        $afterSrc = $matches[3];
        
        // Convert to base64 if it's a local image
        $newSrc = convertImageToBase64($src);
        
        return '<img ' . $beforeSrc . 'src="' . $newSrc . '"' . $afterSrc . '>';
    }, $html);
}

/**
 * Convert local image path to base64 data URI
 */
function convertImageToBase64($imagePath) {
    global $con;
    
    // Only convert local attachment images, not external URLs
    if (preg_match('/^https?:\/\//i', $imagePath)) {
        return $imagePath;
    }
    
    $attachmentsPath = getAttachmentsPath();
    $fullPath = null;
    
    // Decode HTML entities first (in case URL is already escaped)
    $imagePath = html_entity_decode($imagePath, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Case 1: api_attachments.php?action=download&note_id=X&attachment_id=Y
    // Note: attachments are stored in entries.attachments (JSON), not a separate table.
    if (stripos($imagePath, 'api_attachments.php') !== false) {
        $parts = parse_url($imagePath);
        $queryString = $parts['query'] ?? '';
        $params = [];
        parse_str($queryString, $params);

        $noteId = isset($params['note_id']) ? (int)$params['note_id'] : 0;
        $attachmentId = isset($params['attachment_id']) ? (string)$params['attachment_id'] : '';
        $workspace = isset($params['workspace']) ? (string)$params['workspace'] : null;

        if ($noteId > 0 && $attachmentId !== '') {
            try {
                if ($workspace !== null && $workspace !== '') {
                    $stmt = $con->prepare('SELECT attachments FROM entries WHERE id = ? AND workspace = ?');
                    $stmt->execute([$noteId, $workspace]);
                } else {
                    $stmt = $con->prepare('SELECT attachments FROM entries WHERE id = ?');
                    $stmt->execute([$noteId]);
                }

                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                $attachments = (!empty($row['attachments'])) ? json_decode($row['attachments'], true) : [];
                if (is_array($attachments)) {
                    foreach ($attachments as $attachment) {
                        if (isset($attachment['id']) && (string)$attachment['id'] === $attachmentId && !empty($attachment['filename'])) {
                            $fullPath = $attachmentsPath . '/' . $attachment['filename'];
                            break;
                        }
                    }
                }
            } catch (Exception $e) {
                return $imagePath;
            }
        }
    }
    // Case 2: Regular file paths
    else {
        // Remove leading ../ or ./ if present
        $cleanPath = preg_replace('/^\.\.?\//', '', $imagePath);
        
        // Remove 'data/(users/X/)?attachments/' prefix if present
        if (preg_match('#^data/(?:users/\d+/)?attachments/#i', $cleanPath)) {
            $cleanPath = preg_replace('#^data/(?:users/\d+/)?attachments/#i', '', $cleanPath);
        }
        // Remove 'attachments/' prefix if present
        elseif (strpos($cleanPath, 'attachments/') === 0) {
            $cleanPath = substr($cleanPath, strlen('attachments/'));
        }
        
        $fullPath = $attachmentsPath . '/' . $cleanPath;
    }
    
    // If no valid path was found, return original
    if (!$fullPath) {
        return $imagePath;
    }
    
    // Security check: ensure path is within attachments directory
    $realPath = realpath($fullPath);
    $expectedDir = realpath($attachmentsPath);
    
    if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
        return $imagePath; // Return original path if security check fails
    }
    
    if (!file_exists($realPath) || !is_readable($realPath)) {
        return $imagePath; // Return original path if file not found
    }
    
    // Get file contents and convert to base64
    $imageData = file_get_contents($realPath);
    if ($imageData === false) {
        return $imagePath;
    }
    
    // Determine MIME type
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $realPath);
    finfo_close($finfo);
    
    // Create data URI
    $base64 = base64_encode($imageData);
    return 'data:' . $mimeType . ';base64,' . $base64;
}

/**
 * Generate styled HTML document
 */
function generateStyledHtml($content, $title, $noteType, $tags) {
    // Parse tags (stored as comma-separated string)
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    // Clean content: remove copy buttons
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    // Prefix an XML encoding header to avoid mojibake without depending on mbstring
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $content, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    
    $xpath = new DOMXPath($dom);
    $copyButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn')]");
    foreach ($copyButtons as $button) {
        $button->parentNode->removeChild($button);
    }
    
    $cleanContent = $dom->saveHTML();
    
    // Build HTML document
    $html = '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>' . htmlspecialchars($title) . '</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.2;
            color: #333;
            background: white;
            padding: 40px;
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .note-metadata {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }
        
        .note-title {
            font-size: 32px;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 15px;
        }
        
        .note-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .note-tag {
            display: inline-block;
            padding: 4px 12px;
            background: #f0f0f0;
            border: 1px solid #d0d0d0;
            border-radius: 12px;
            font-size: 13px;
            color: #555;
        }
        
        .note-content {
            font-size: 16px;
            line-height: 1.2;
        }
        
        /* Code blocks */
        pre {
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
            margin: 16px 0;
            font-family: "Consolas", "Monaco", "Courier New", monospace;
            font-size: 14px;
            line-height: 1.5;
        }
        
        code {
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "Consolas", "Monaco", "Courier New", monospace;
            font-size: 14px;
        }
        
        pre code {
            background: transparent;
            padding: 0;
            border-radius: 0;
        }
        
        /* Headings */
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        
        h1 { font-size: 28px; }
        h2 { font-size: 24px; }
        h3 { font-size: 20px; }
        h4 { font-size: 18px; }
        h5 { font-size: 16px; }
        h6 { font-size: 14px; }
        
        /* Lists */
        ul, ol {
            margin: 16px 0;
            padding-left: 32px;
        }
        
        li {
            margin: 8px 0;
        }
        
        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        th {
            background: #f5f5f5;
            font-weight: 600;
        }
        
        /* Links */
        a {
            color: #0066cc;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        /* Blockquotes */
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            margin: 16px 0;
            color: #666;
        }
        
        /* Images */
        img {
            max-width: 100%;
            height: auto;
            margin: 16px 0;
        }
        
        /* Task lists */
        .task-list-item {
            list-style: none;
        }
        
        .task-list-item input[type="checkbox"] {
            margin-right: 8px;
        }

        /* Tasklist notes (JSON-based tasklists) */
        .task-list-container {
            padding: 10px 0;
        }

        .tasks-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 15px;
        }

        .task-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fafafa;
        }

        .task-item input[type="checkbox"] {
            margin-right: 10px;
            cursor: default;
            vertical-align: middle;
        }

        .task-item .task-text {
            flex: 1;
            font-size: 14px;
            line-height: 1.4;
            overflow-wrap: anywhere;
            word-break: break-word;
        }

        .task-item.completed {
            background: #f0f8f0;
            border-color: #c8e6c9;
            opacity: 0.8;
        }

        .task-item.completed .task-text {
            text-decoration: line-through;
            color: #666;
        }

        .task-item.important {
            border-color: #ffcccc;
            background: #fff6f6;
        }

        .task-item.important .task-text {
            color: #c62828;
            font-weight: 600;
        }
        
        /* Blank lines to preserve spacing in markdown */
        p.blank-line {
            margin: 0;
            min-height: 1.6em;
            line-height: 1.6;
        }
        
        @media print {
            body {
                padding: 20px;
            }
            
            .note-metadata {
                page-break-after: avoid;
            }
            
            /* Hide elements that should not be printed */
            @page {
                margin: 2cm;
            }
            
            /* Avoid breaking inside elements */
            pre, blockquote, table {
                page-break-inside: avoid;
            }
            
            /* Keep headings with following content */
            h1, h2, h3, h4, h5, h6 {
                page-break-after: avoid;
            }
            
            /* Optimize images for print */
            img {
                max-width: 100% !important;
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="note-metadata">
        <h1 class="note-title">' . htmlspecialchars($title) . '</h1>';
    
    if (!empty($tagsList)) {
        $html .= '<div class="note-tags">';
        foreach ($tagsList as $tag) {
            $html .= '<span class="note-tag">' . htmlspecialchars($tag) . '</span>';
        }
        $html .= '</div>';
    }
    
    $html .= '
    </div>
    <div class="note-content">
        ' . $cleanContent . '
    </div>
</body>
</html>';
    
    return $html;
}

/**
 * Export as HTML file
 */
function exportAsHtml($htmlContent, $title, $disposition = 'attachment') {
    $filename = sanitizeFilename($title) . '.html';
    
    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: ' . $disposition . '; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    echo $htmlContent;
    exit;
}

/**
 * Export note as HTML in a ZIP file with all attachments
 */
function exportAsHtmlZip($htmlContent, $note, $con) {
    if (!class_exists('ZipArchive')) {
        // Fallback to simple HTML export if ZipArchive is not available
        exportAsHtml($htmlContent, $note['heading'], 'attachment');
        return;
    }
    
    $noteId = $note['id'];
    $title = $note['heading'] ?? 'New note';
    $attachments = (!empty($note['attachments'])) ? json_decode($note['attachments'], true) : [];
    
    // If no attachments, just export HTML without ZIP
    if (empty($attachments) || !is_array($attachments)) {
        exportAsHtml($htmlContent, $title, 'attachment');
        return;
    }
    
    // Create temporary ZIP file
    $tempZipFile = tempnam(sys_get_temp_dir(), 'poznote_export_');
    $zip = new ZipArchive();
    
    if ($zip->open($tempZipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        // Fallback if ZIP creation fails
        exportAsHtml($htmlContent, $title, 'attachment');
        return;
    }
    
    // Build a mapping of attachment IDs to their extensions
    $attachmentExtensions = [];
    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
            $attachmentExtensions[$attachment['id']] = $ext ? '.' . $ext : '';
        }
    }
    
    // Modify HTML to use local attachments folder with extensions
    $htmlContent = preg_replace_callback(
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = $matches[1];
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return 'attachments/' . $attachmentId . $extension;
        },
        $htmlContent
    );
    
    // Add HTML file to ZIP
    $htmlFilename = sanitizeFilename($title) . '.html';
    $zip->addFromString($htmlFilename, $htmlContent);
    
    // Add attachments to ZIP
    $attachmentsPath = getAttachmentsPath();
    $addedAttachments = [];
    
    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            $attachmentFile = $attachmentsPath . '/' . $attachment['filename'];
            
            if (file_exists($attachmentFile) && is_readable($attachmentFile)) {
                // Use attachment ID as filename in ZIP to match the HTML references
                $zipAttachmentName = 'attachments/' . $attachment['id'];
                
                // Determine extension from original filename
                $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                if ($ext) {
                    $zipAttachmentName .= '.' . $ext;
                }
                
                $zip->addFile($attachmentFile, $zipAttachmentName);
                $addedAttachments[] = $attachment['id'];
            }
        }
    }
    
    $zip->close();
    
    // If no attachments could be added, delete ZIP and export HTML only
    if (empty($addedAttachments)) {
        @unlink($tempZipFile);
        exportAsHtml($htmlContent, $title, 'attachment');
        return;
    }
    
    // Send ZIP file
    $zipFilename = sanitizeFilename($title) . '.zip';
    $fileSize = filesize($tempZipFile);
    
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . $fileSize);
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    readfile($tempZipFile);
    @unlink($tempZipFile);
    exit;
}

/**
 * Sanitize filename
 */
function sanitizeFilename($filename) {
    $filename = preg_replace('/[^a-zA-Z0-9-_ ]/', '', $filename);
    $filename = trim($filename);
    if (empty($filename)) {
        $filename = 'poznote-export';
    }
    return $filename;
}

/**
 * Export as Markdown file with YAML front matter
 */
function exportAsMarkdown($content, $note, $con) {
    $title = $note['heading'] ?? 'New note';
    $tags = $note['tags'] ?? '';
    $favorite = !empty($note['favorite']) ? 'true' : 'false';
    $created = $note['created'] ?? '';
    $updated = $note['updated'] ?? '';
    $folder_id = $note['folder_id'] ?? null;
    
    // Parse tags (stored as comma-separated string)
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    // Get folder path if exists
    $folderPath = '';
    if ($folder_id && function_exists('getFolderPath')) {
        $folderPath = getFolderPath($folder_id, $con);
    }
    
    // Build markdown content with YAML front matter
    $markdownContent = "---\n";
    $markdownContent .= "title: " . json_encode($title, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    
    if (!empty($tagsList)) {
        $markdownContent .= "tags:\n";
        foreach ($tagsList as $tag) {
            $markdownContent .= "  - " . json_encode($tag, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        }
    }
    
    if (!empty($folderPath)) {
        $markdownContent .= "folder: " . json_encode($folderPath, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }
    
    $markdownContent .= "favorite: " . $favorite . "\n";
    
    if (!empty($created)) {
        $markdownContent .= "created: " . json_encode($created, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    if (!empty($updated)) {
        $markdownContent .= "updated: " . json_encode($updated, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    $markdownContent .= "---\n\n";
    
    // Add the actual note content
    $markdownContent .= $content;
    
    // Set headers for file download
    $filename = sanitizeFilename($title) . '.md';
    
    header('Content-Type: text/markdown; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    echo $markdownContent;
    exit;
}

/**
 * Export note as Markdown in ZIP file with all attachments
 */
function exportAsMarkdownZip($content, $note, $con) {
    $noteId = $note['id'];
    $title = $note['heading'] ?? 'New note';
    $attachments = (!empty($note['attachments'])) ? json_decode($note['attachments'], true) : [];
    
    // If no ZipArchive or no attachments, export as simple markdown
    if (!class_exists('ZipArchive') || empty($attachments) || !is_array($attachments)) {
        exportAsMarkdown($content, $note, $con);
        return;
    }
    
    // Prepare markdown content
    $tags = $note['tags'] ?? '';
    $favorite = !empty($note['favorite']) ? 'true' : 'false';
    $created = $note['created'] ?? '';
    $updated = $note['updated'] ?? '';
    $folder_id = $note['folder_id'] ?? null;
    
    // Parse tags
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    // Get folder path
    $folderPath = '';
    if ($folder_id && function_exists('getFolderPath')) {
        $folderPath = getFolderPath($folder_id, $con);
    }
    
    // Build markdown with YAML front matter
    $markdownContent = "---\n";
    $markdownContent .= "title: " . json_encode($title, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    
    if (!empty($tagsList)) {
        $markdownContent .= "tags:\n";
        foreach ($tagsList as $tag) {
            $markdownContent .= "  - " . json_encode($tag, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        }
    }
    
    if (!empty($folderPath)) {
        $markdownContent .= "folder: " . json_encode($folderPath, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }
    
    $markdownContent .= "favorite: " . $favorite . "\n";
    
    if (!empty($created)) {
        $markdownContent .= "created: " . json_encode($created, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    if (!empty($updated)) {
        $markdownContent .= "updated: " . json_encode($updated, JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    $markdownContent .= "---\n\n";
    $markdownContent .= $content;
    
    // Build a mapping of attachment IDs to their extensions
    $attachmentExtensions = [];
    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
            $attachmentExtensions[$attachment['id']] = $ext ? '.' . $ext : '';
        }
    }
    
    // Modify markdown to use local attachments folder with extensions
    $markdownContent = preg_replace_callback(
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = $matches[1];
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return 'attachments/' . $attachmentId . $extension;
        },
        $markdownContent
    );
    
    // Create temporary ZIP file
    $tempZipFile = tempnam(sys_get_temp_dir(), 'poznote_export_md_');
    $zip = new ZipArchive();
    
    if ($zip->open($tempZipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        // Fallback to simple markdown
        exportAsMarkdown($content, $note, $con);
        return;
    }
    
    // Add markdown file to ZIP
    $mdFilename = sanitizeFilename($title) . '.md';
    $zip->addFromString($mdFilename, $markdownContent);
    
    // Add attachments to ZIP
    $attachmentsPath = getAttachmentsPath();
    $addedAttachments = [];
    
    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            $attachmentFile = $attachmentsPath . '/' . $attachment['filename'];
            
            if (file_exists($attachmentFile) && is_readable($attachmentFile)) {
                // Use attachment ID as filename in ZIP to match markdown references
                $zipAttachmentName = 'attachments/' . $attachment['id'];
                
                // Determine extension from original filename
                $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                if ($ext) {
                    $zipAttachmentName .= '.' . $ext;
                }
                
                $zip->addFile($attachmentFile, $zipAttachmentName);
                $addedAttachments[] = $attachment['id'];
            }
        }
    }
    
    $zip->close();
    
    // If no attachments could be added, export simple markdown
    if (empty($addedAttachments)) {
        @unlink($tempZipFile);
        exportAsMarkdown($content, $note, $con);
        return;
    }
    
    // Send ZIP file
    $zipFilename = sanitizeFilename($title) . '.zip';
    $fileSize = filesize($tempZipFile);
    
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . $fileSize);
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    readfile($tempZipFile);
    @unlink($tempZipFile);
    exit;
}

/**
 * Export as JSON file (raw tasklist JSON)
 */
function exportAsJson($rawJson, $title) {
    $filename = sanitizeFilename($title) . '.json';

    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: 0');

    echo $rawJson;
    exit;
}
