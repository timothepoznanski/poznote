<?php
/**
 * API Endpoint: Download Note File
 * 
 * Downloads a specific note file (HTML or Markdown)
 * 
 * Method: GET
 * Parameters: 
 *   - id: Note ID (required)
 *   - type: Note type - 'note', 'markdown', 'tasklist', 'excalidraw' (optional, defaults to 'note')
 * 
 * Response:
 * - Success: File download
 * - Error: JSON with error message or plain error
 */

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Check authentication
requireApiAuth();

// Only accept GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use GET.'
    ]);
    exit;
}

// Get parameters
$noteId = $_GET['id'] ?? '';
$noteType = $_GET['type'] ?? 'note';

if (empty($noteId) || !is_numeric($noteId)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Missing or invalid required parameter: id'
    ]);
    exit;
}

// Validate note type
$validTypes = ['note', 'markdown', 'tasklist', 'excalidraw'];
if (!in_array($noteType, $validTypes)) {
    $noteType = 'note';
}

// Get the note from database to verify it exists and user has access
try {
    $stmt = $con->prepare('SELECT id, heading, type, tags FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => 'Note not found or has been deleted'
        ]);
        exit;
    }
    
    // Use the actual type from database if available
    if (!empty($row['type'])) {
        $noteType = $row['type'];
    }
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Database error'
    ]);
    exit;
}

// Build the file path
$filename = getEntryFilename($noteId, $noteType);
$filePath = $filename;

// Security: ensure the path is within the entries directory
$realPath = realpath($filePath);
$expectedDir = realpath(getEntriesPath());

if ($realPath === false || strpos($realPath, $expectedDir) !== 0) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Invalid file path'
    ]);
    exit;
}

// Check if file exists
if (!file_exists($filePath)) {
    http_response_code(404);
    die('Fichier non disponible sur le site');
}

// Check if file is readable
if (!is_readable($filePath)) {
    http_response_code(500);
    die('Cannot read file');
}

// Get the title for the download filename
$title = $row['heading'] ?? 'Note';
// Sanitize filename
$downloadFilename = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $title);
if (empty($downloadFilename)) {
    $downloadFilename = 'note_' . $noteId;
}

// Add appropriate extension
$extension = getFileExtensionForType($noteType);
$downloadFilename .= $extension;

// Read the file content
$content = file_get_contents($filePath);

// Generate complete HTML with proper styling for all note types
function generateStyledHtml($content, $title, $noteType, $tags = '') {
    // Clean up content: remove copy buttons and other UI elements that shouldn't be exported
    // Use DOMDocument for proper HTML manipulation
    $doc = new DOMDocument();
    // Suppress warnings for malformed HTML
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8" ?>' . $content, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    
    // Remove copy buttons
    $xpath = new DOMXPath($doc);
    $copyButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn')]");
    foreach ($copyButtons as $button) {
        $button->parentNode->removeChild($button);
    }
    
    // Get cleaned content
    $content = $doc->saveHTML();
    
    // Common CSS styles for all exported notes
    $commonStyles = '
        body {
            font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
            line-height: 1.6;
            color: #333;
        }
        h1 { 
            margin-bottom: 20px;
            font-size: 2em;
            font-weight: bold;
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 0.3em;
        }
        h2 {
            font-size: 1.5em;
            font-weight: bold;
            margin: 0.75em 0;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 0.3em;
        }
        h3 {
            font-size: 1.25em;
            font-weight: bold;
            margin: 0.83em 0;
        }
        h4, h5, h6 {
            font-weight: bold;
            margin: 1em 0;
        }
        p {
            margin: 0 0 1em 0;
            line-height: 1.6;
        }
        code {
            background-color: #f4f4f4;
            padding: 2px 6px;
            font-family: "Courier New", Courier, monospace;
            font-size: 0.9em;
            color: #333;
            border-radius: 3px;
        }
        pre {
            background-color: #f4f4f4;
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1em 0;
        }
        pre code {
            background-color: transparent;
            padding: 0;
            color: inherit;
            border-radius: 0;
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            margin: 1em 0;
            color: #666;
            font-style: italic;
        }
        ul, ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        li {
            margin: 0.5em 0;
            line-height: 1.6;
        }
        ul {
            list-style-type: disc;
        }
        ol {
            list-style-type: decimal;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin: 1em 0;
        }
        hr {
            border: 0;
            border-top: 2px solid #e0e0e0;
            margin: 2em 0;
        }
        strong {
            font-weight: bold;
        }
        em {
            font-style: italic;
        }
        del {
            text-decoration: line-through;
            color: #999;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        table th, table td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        table th {
            background-color: #f4f4f4;
            font-weight: bold;
        }
        table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        ul.task-list {
            list-style: none;
            padding-left: 0;
        }
        li.task-list-item {
            list-style: none;
            position: relative;
            padding-left: 0;
        }
        li.task-list-item input[type="checkbox"] {
            margin-right: 0.5em;
            cursor: default;
            vertical-align: middle;
        }
        .mermaid {
            margin: 1em 0;
            text-align: center;
            background-color: white;
            padding: 10px;
            border-radius: 4px;
        }
        .note-metadata {
            margin-bottom: 2em;
            padding-bottom: 1em;
            border-bottom: 1px solid #e0e0e0;
        }
        .note-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }
        .note-tag {
            display: inline-block;
            background-color: #e8f4f8;
            color: #0066cc;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 500;
        }
    ';
    
    $html = '<!DOCTYPE html>' . "\n";
    $html .= '<html lang="en">' . "\n";
    $html .= '<head>' . "\n";
    $html .= '<meta charset="utf-8">' . "\n";
    $html .= '<meta name="viewport" content="width=device-width, initial-scale=1.0">' . "\n";
    $html .= '<title>' . htmlspecialchars($title, ENT_QUOTES) . '</title>' . "\n";
    $html .= '<style>' . $commonStyles . '</style>' . "\n";
    $html .= '</head>' . "\n";
    $html .= '<body>' . "\n";
    $html .= '<div class="note-metadata">' . "\n";
    $html .= '<h1>' . htmlspecialchars($title, ENT_QUOTES) . '</h1>' . "\n";
    
    // Add tags if present
    if (!empty($tags)) {
        $tagsArray = array_filter(array_map('trim', explode(',', $tags)));
        if (count($tagsArray) > 0) {
            $html .= '<div class="note-tags">' . "\n";
            foreach ($tagsArray as $tag) {
                $html .= '<span class="note-tag">' . htmlspecialchars($tag, ENT_QUOTES) . '</span>' . "\n";
            }
            $html .= '</div>' . "\n";
        }
    }
    
    $html .= '</div>' . "\n";
    $html .= $content;
    $html .= '</body>' . "\n";
    $html .= '</html>';
    
    return $html;
}

// Get tags from the note row
$tags = $row['tags'] ?? '';

// If this is a tasklist type, convert JSON to HTML
if ($noteType === 'tasklist') {
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $tasksContent = '<div class="task-list-container">' . "\n";
        $tasksContent .= '<div class="tasks-list">' . "\n";
        foreach ($decoded as $task) {
            $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES) : '';
            $completed = !empty($task['completed']) ? ' completed' : '';
            $checked = !empty($task['completed']) ? ' checked' : '';
            $tasksContent .= '<div class="task-item'.$completed.'">';
            $tasksContent .= '<input type="checkbox" disabled'.$checked.' /> ';
            $tasksContent .= '<span class="task-text">'.$text.'</span>';
            $tasksContent .= '</div>' . "\n";
        }
        $tasksContent .= '</div>' . "\n";
        $tasksContent .= '</div>' . "\n";
        $content = generateStyledHtml($tasksContent, $title, $noteType, $tags);
    } else {
        // If JSON parse fails, wrap raw content in pre tag
        $content = generateStyledHtml('<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>', $title, $noteType, $tags);
    }
} elseif ($noteType === 'note' || $noteType === 'markdown') {
    // For regular HTML and markdown notes, wrap in styled HTML
    $content = generateStyledHtml($content, $title, $noteType, $tags);
}

// Send the file to the browser
$contentType = ($extension === '.md') ? 'text/markdown' : 'text/html';

header('Content-Type: ' . $contentType . '; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $downloadFilename . '"');
header('Content-Length: ' . strlen($content));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Output the content
echo $content;
exit;
?>
