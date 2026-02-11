<?php
/**
 * API Endpoint: Download Note File
 * 
 * Downloads a specific note file (HTML or Markdown) with proper styling
 * 
 * Method: GET
 * Parameters: 
 *   - id: Note ID (required)
 *   - type: Note type - 'note', 'markdown', 'tasklist', 'excalidraw' (optional, auto-detected from DB)
 * 
 * Response:
 * - Success: File download with appropriate content type
 * - Error: JSON with error message
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

// Validate note ID parameter
$noteId = $_GET['id'] ?? '';

if (empty($noteId) || !is_numeric($noteId)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Missing or invalid required parameter: id'
    ]);
    exit;
}

// Fetch note from database to verify access and get metadata
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
    
    // Use type from database, fallback to GET parameter or default
    $noteType = !empty($row['type']) ? $row['type'] : ($_GET['type'] ?? 'note');
    
    // Validate note type (security measure)
    $validTypes = ['note', 'markdown', 'tasklist', 'excalidraw'];
    if (!in_array($noteType, $validTypes)) {
        $noteType = 'note';
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

// Build file path and verify security
$filePath = getEntryFilename($noteId, $noteType);

// Security check: ensure path is within entries directory
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

// Verify file exists and is readable
if (!file_exists($filePath)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'File not found'
    ]);
    exit;
}

if (!is_readable($filePath)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Cannot read file'
    ]);
    exit;
}

// Prepare download filename
$title = $row['heading'] ?? 'Note';
$downloadFilename = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $title);
if (empty($downloadFilename)) {
    $downloadFilename = 'note_' . $noteId;
}

// Add appropriate file extension
$extension = getFileExtensionForType($noteType);
$downloadFilename .= $extension;

// Read file content
$content = file_get_contents($filePath);

// CSS styles for exported notes (separated for better maintainability)
const EXPORT_STYLES = '
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
        margin-right: 0.8em;
        cursor: default;
        vertical-align: middle;
    }
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
        margin-right: 0.8em;
        cursor: default;
        vertical-align: middle;
    }
    .task-item .task-text {
        flex: 1;
        font-size: 14px;
        line-height: 1.4;
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

/**
 * Clean HTML content by removing UI elements that shouldn't be exported
 * 
 * @param string $content The HTML content to clean
 * @return string Cleaned HTML content
 */
function cleanHtmlContent($content) {
    // Use regex to remove copy buttons (more reliable than DOM manipulation)
    // Remove elements with class containing 'code-block-copy-btn'
    $content = preg_replace('/<[^>]*class="[^"]*code-block-copy-btn[^"]*"[^>]*>.*?<\/[^>]+>/is', '', $content);
    // Also remove button elements that might be copy buttons
    $content = preg_replace('/<button[^>]*class="[^"]*copy[^"]*"[^>]*>.*?<\/button>/is', '', $content);
    
    return $content;
}

/**
 * Generate complete styled HTML document for export
 * 
 * @param string $content The note content (HTML)
 * @param string $title The note title
 * @param string $tags Comma-separated tag list
 * @return string Complete HTML document with styling
 */
function generateStyledHtml($content, $title, $tags = '') {
    // Clean the content
    $cleanContent = cleanHtmlContent($content);
    
    // Build HTML document
    $html = '<!DOCTYPE html>' . "\n";
    $html .= '<html lang="en">' . "\n";
    $html .= '<head>' . "\n";
    $html .= '<meta charset="utf-8">' . "\n";
    $html .= '<meta name="viewport" content="width=device-width, initial-scale=1.0">' . "\n";
    $html .= '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>' . "\n";
    $html .= '<style>' . EXPORT_STYLES . '</style>' . "\n";
    $html .= '</head>' . "\n";
    $html .= '<body>' . "\n";
    
    // Add metadata section with title and tags
    $html .= '<div class="note-metadata">' . "\n";
    $html .= '<h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>' . "\n";
    
    // Add tags if present
    if (!empty($tags)) {
        $tagsArray = array_filter(array_map('trim', explode(',', $tags)));
        if (count($tagsArray) > 0) {
            $html .= '<div class="note-tags">' . "\n";
            foreach ($tagsArray as $tag) {
                $html .= '<span class="note-tag">' . htmlspecialchars($tag, ENT_QUOTES, 'UTF-8') . '</span>' . "\n";
            }
            $html .= '</div>' . "\n";
        }
    }
    
    $html .= '</div>' . "\n";
    
    // Add note content
    $html .= $cleanContent;
    
    $html .= '</body>' . "\n";
    $html .= '</html>';
    
    return $html;
}

// Get metadata
$title = $row['heading'] ?? 'Note';
$tags = $row['tags'] ?? '';

// Process content based on note type
switch ($noteType) {
    case 'tasklist':
        // Convert JSON tasklist to HTML
        $decoded = json_decode($content, true);
        if (is_array($decoded) && json_last_error() === JSON_ERROR_NONE) {
            $tasksContent = '<div class="task-list-container">' . "\n";
            $tasksContent .= '<div class="tasks-list">' . "\n";
            
            foreach ($decoded as $task) {
                $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES, 'UTF-8') : '';
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
            
            $content = generateStyledHtml($tasksContent, $title, $tags);
        } else {
            // Invalid JSON - show raw content in preformatted block
            $content = generateStyledHtml(
                '<pre>' . htmlspecialchars($content, ENT_QUOTES, 'UTF-8') . '</pre>', 
                $title, 
                $tags
            );
        }
        break;
        
    case 'excalidraw':
        // Excalidraw files are JSON - return as-is without HTML wrapping
        // No processing needed for excalidraw JSON format
        break;
        
    case 'note':
    case 'markdown':
    default:
        // Regular HTML or Markdown notes - wrap with styled HTML
        $content = generateStyledHtml($content, $title, $tags);
        break;
}

// Set appropriate content type and headers
$contentType = ($extension === '.md') ? 'text/markdown' : 
               ($noteType === 'excalidraw' ? 'application/json' : 'text/html');

header('Content-Type: ' . $contentType . '; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $downloadFilename . '"');
header('Content-Length: ' . strlen($content));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Output content and exit
echo $content;
exit;
