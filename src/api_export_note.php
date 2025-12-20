<?php
/**
 * API Endpoint: Export Note
 * Exports a note in HTML format
 * 
 * Parameters:
 * - id: Note ID (required)
 * - type: Note type (required)
 * - format: Export format - 'html' (default: 'html')
 * - disposition: 'attachment' (download, default) or 'inline' (render in browser)
 * 
 * Returns:
 * - HTML: Styled HTML document for download
 * - PDF: Not supported
 */

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

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

if (!in_array($format, ['html'])) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid format. Use "html"']);
    exit;
}

if (!in_array($disposition, ['attachment', 'inline'], true)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid disposition. Use "attachment" or "inline"']);
    exit;
}

try {
    // Fetch note from database
    $stmt = $con->prepare('SELECT id, heading, type, tags FROM entries WHERE id = ? AND trash = 0');
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

    // Generate styled HTML
    $htmlContent = generateStyledHtml($content, $note['heading'], $noteType, $note['tags']);
    
    // Export as HTML only
    exportAsHtml($htmlContent, $note['heading'], $disposition);
    
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Export failed: ' . $e->getMessage()]);
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
            line-height: 1.6;
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
            line-height: 1.8;
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
