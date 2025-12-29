<?php
/**
 * API Endpoint: Export Note
 * Exports a note in HTML or Markdown format
 * 
 * Parameters:
 * - id: Note ID (required)
 * - type: Note type (required)
 * - format: Export format - 'html' or 'markdown' (default: 'html')
 * - disposition: 'attachment' (download, default) or 'inline' (render in browser)
 * 
 * Returns:
 * - HTML: Styled HTML document for download
 * - Markdown: MD file with title and tags in markdown format
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
    // Fetch note from database with all metadata for front matter
    $stmt = $con->prepare('SELECT id, heading, type, tags, favorite, folder_id, created, updated FROM entries WHERE id = ? AND trash = 0');
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
        // Export as Markdown with front matter YAML
        exportAsMarkdown($content, $note, $con);
    } else {
        // For markdown notes, convert markdown to HTML first
        if ($noteType === 'markdown') {
            $content = parseMarkdownToHtml($content);
        }

        // For tasklist notes, convert stored JSON to HTML before styling
        if ($noteType === 'tasklist') {
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
        
        // Export as HTML only
        exportAsHtml($htmlContent, $note['heading'], $disposition);
    }
    
} catch (Exception $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Export failed: ' . $e->getMessage()]);
}

/**
 * Simple markdown to HTML parser
 * Based on the version used in public_note.php
 */
function parseMarkdownToHtml($text) {
    if (!$text) return '';
    
    // First, extract and protect images and links from HTML escaping
    $protectedElements = [];
    $protectedIndex = 0;
    
    // Protect images first ![alt](url "title")
    $text = preg_replace_callback('/!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/', function($matches) use (&$protectedElements, &$protectedIndex) {
        $alt = $matches[1];
        $url = $matches[2];
        $title = isset($matches[3]) ? $matches[3] : '';
        $placeholder = "\x00PIMG" . $protectedIndex . "\x00";
        if ($title) {
            $imgTag = '<img src="' . htmlspecialchars($url) . '" alt="' . htmlspecialchars($alt) . '" title="' . htmlspecialchars($title) . '">';
        } else {
            $imgTag = '<img src="' . htmlspecialchars($url) . '" alt="' . htmlspecialchars($alt) . '">';
        }
        $protectedElements[$protectedIndex] = $imgTag;
        $protectedIndex++;
        return $placeholder;
    }, $text);
    
    // Protect links [text](url "title")
    $text = preg_replace_callback('/\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/', function($matches) use (&$protectedElements, &$protectedIndex) {
        $linkText = $matches[1];
        $url = $matches[2];
        $title = isset($matches[3]) ? $matches[3] : '';
        $placeholder = "\x00PLNK" . $protectedIndex . "\x00";
        if ($title) {
            $linkTag = '<a href="' . htmlspecialchars($url) . '" title="' . htmlspecialchars($title) . '" target="_blank" rel="noopener">' . htmlspecialchars($linkText) . '</a>';
        } else {
            $linkTag = '<a href="' . htmlspecialchars($url) . '" target="_blank" rel="noopener">' . htmlspecialchars($linkText) . '</a>';
        }
        $protectedElements[$protectedIndex] = $linkTag;
        $protectedIndex++;
        return $placeholder;
    }, $text);
    
    // Now escape HTML to prevent XSS
    $html = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    
    // Helper function to apply inline styles (bold, italic, code, etc.)
    $applyInlineStyles = function($text) use (&$protectedElements) {
        // First, protect inline code content from other replacements
        $protectedCode = [];
        $codeIndex = 0;
        $text = preg_replace_callback('/`([^`]+)`/', function($matches) use (&$protectedCode, &$codeIndex) {
            $placeholder = "\x00CODE" . $codeIndex . "\x00";
            $protectedCode[$codeIndex] = '<code>' . $matches[1] . '</code>';
            $codeIndex++;
            return $placeholder;
        }, $text);
        
        // Handle angle bracket URLs <https://example.com>
        $text = preg_replace('/&lt;(https?:\/\/[^\s&gt;]+)&gt;/', '<a href="$1" target="_blank" rel="noopener">$1</a>', $text);
        
        // Bold and italic
        $text = preg_replace('/\*\*\*([^\*]+)\*\*\*/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/___([^_]+)___/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/\*\*([^\*]+)\*\*/', '<strong>$1</strong>', $text);
        $text = preg_replace('/__([^_]+)__/', '<strong>$1</strong>', $text);
        $text = preg_replace('/\*([^\*]+)\*/', '<em>$1</em>', $text);
        $text = preg_replace('/_([^_]+)_/', '<em>$1</em>', $text);
        
        // Strikethrough
        $text = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $text);
        
        // Restore protected code elements
        $text = preg_replace_callback('/\x00CODE(\d+)\x00/', function($matches) use ($protectedCode) {
            $index = (int)$matches[1];
            return isset($protectedCode[$index]) ? $protectedCode[$index] : $matches[0];
        }, $text);
        
        // Restore protected elements (images and links)
        $text = preg_replace_callback('/\x00P(IMG|LNK)(\d+)\x00/', function($matches) use ($protectedElements) {
            $index = (int)$matches[2];
            return isset($protectedElements[$index]) ? $protectedElements[$index] : $matches[0];
        }, $text);
        
        return $text;
    };
    
    // Process line by line for block-level elements
    $lines = explode("\n", $html);
    $result = [];
    $currentParagraph = [];
    $inCodeBlock = false;
    $codeBlockLang = '';
    $codeBlockContent = [];
    
    $flushParagraph = function() use (&$currentParagraph, &$result, $applyInlineStyles) {
        if (count($currentParagraph) > 0) {
            $processedLines = [];
            for ($i = 0; $i < count($currentParagraph); $i++) {
                $line = $currentParagraph[$i];
                if ($i < count($currentParagraph) - 1) {
                    if (preg_match('/\s{2,}$/', $line)) {
                        $processedLines[] = preg_replace('/\s{2,}$/', '', $line) . '<br>';
                    } else {
                        $processedLines[] = $line . '<br>';
                    }
                } else {
                    $processedLines[] = $line;
                }
            }
            $para = implode('', $processedLines);
            $para = $applyInlineStyles($para);
            $result[] = '<p>' . $para . '</p>';
            $currentParagraph = [];
        }
    };
    
    $parseNestedList = function($startIndex, $isTaskList = false) use (&$lines, $applyInlineStyles, &$parseNestedList) {
        $listItems = [];
        $currentIndex = $startIndex;
        $baseIndent = null;
        
        while ($currentIndex < count($lines)) {
            $currentLine = $lines[$currentIndex];
            
            if ($isTaskList) {
                $listMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $currentLine, $matches);
            } else {
                $listMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $currentLine, $matches);
            }
            
            if (!$listMatch) {
                break;
            }
            
            $indent = strlen($matches[1]);
            $content = $isTaskList ? $matches[3] : $matches[3];
            
            if ($baseIndent === null) {
                $baseIndent = $indent;
            }
            
            if ($indent === $baseIndent) {
                if ($isTaskList) {
                    $isChecked = strtolower($matches[2]) === 'x';
                    $checkbox = '<input type="checkbox" ' . ($isChecked ? 'checked ' : '') . 'disabled>';
                    $itemHtml = '<li class="task-list-item">' . $checkbox . ' ' . $applyInlineStyles($content);
                } else {
                    $itemHtml = '<li>' . $applyInlineStyles($content);
                }
                
                $nextIndex = $currentIndex + 1;
                if ($nextIndex < count($lines)) {
                    $nextLine = $lines[$nextIndex];
                    if ($isTaskList) {
                        $nextMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $nextLine, $nextMatches);
                    } else {
                        $nextMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $nextLine, $nextMatches);
                    }
                    
                    if ($nextMatch && strlen($nextMatches[1]) > $indent) {
                        $nestedResult = $parseNestedList($nextIndex, $isTaskList);
                        $isOrderedNested = !$isTaskList && preg_match('/\d+\./', $nextMatches[2]);
                        $listTag = $isOrderedNested ? 'ol' : 'ul';
                        $listClass = $isTaskList ? ' class="task-list"' : '';
                        $itemHtml .= '<' . $listTag . $listClass . '>' . implode('', $nestedResult['items']) . '</' . $listTag . '>';
                        $currentIndex = $nestedResult['endIndex'];
                    }
                }
                
                $itemHtml .= '</li>';
                $listItems[] = $itemHtml;
            } else if ($indent < $baseIndent) {
                break;
            } else {
                break;
            }
            
            $currentIndex++;
        }
        
        return [
            'items' => $listItems,
            'endIndex' => $currentIndex - 1
        ];
    };
    
    for ($i = 0; $i < count($lines); $i++) {
        $line = $lines[$i];
        
        // Handle code blocks
        if (preg_match('/^\s*```/', $line)) {
            $flushParagraph();
            if (!$inCodeBlock) {
                $inCodeBlock = true;
                $codeBlockLang = trim(preg_replace('/^\s*```/', '', $line));
                $codeBlockContent = [];
            } else {
                $inCodeBlock = false;
                $codeContent = implode("\n", $codeBlockContent);
                $result[] = '<pre><code class="language-' . ($codeBlockLang ?: 'text') . '">' . $codeContent . '</code></pre>';
                $codeBlockContent = [];
                $codeBlockLang = '';
            }
            continue;
        }
        
        if ($inCodeBlock) {
            $codeBlockContent[] = $line;
            continue;
        }
        
        // Empty line
        if (trim($line) === '') {
            $flushParagraph();
            continue;
        }
        
        // Headers
        if (preg_match('/^(#{1,6})\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $level = strlen($matches[1]);
            $content = $applyInlineStyles($matches[2]);
            $result[] = '<h' . $level . '>' . $content . '</h' . $level . '>';
            continue;
        }
        
        // Horizontal rules
        if (preg_match('/^(\*{3,}|-{3,}|_{3,})$/', $line)) {
            $flushParagraph();
            $result[] = '<hr>';
            continue;
        }
        
        // Blockquotes
        if (preg_match('/^&gt;\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $content = $applyInlineStyles($matches[1]);
            $result[] = '<blockquote>' . $content . '</blockquote>';
            continue;
        }
        
        // Task lists
        if (preg_match('/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $line)) {
            $flushParagraph();
            $listResult = $parseNestedList($i, true);
            $result[] = '<ul class="task-list">' . implode('', $listResult['items']) . '</ul>';
            $i = $listResult['endIndex'];
            continue;
        }
        
        // Unordered lists
        if (preg_match('/^\s*[\*\-\+]\s+(.+)$/', $line)) {
            $flushParagraph();
            $listResult = $parseNestedList($i, false);
            $result[] = '<ul>' . implode('', $listResult['items']) . '</ul>';
            $i = $listResult['endIndex'];
            continue;
        }
        
        // Ordered lists
        if (preg_match('/^\s*\d+\.\s+(.+)$/', $line)) {
            $flushParagraph();
            $listResult = $parseNestedList($i, false);
            $result[] = '<ol>' . implode('', $listResult['items']) . '</ol>';
            $i = $listResult['endIndex'];
            continue;
        }
        
        // Tables
        if (preg_match('/^\s*\|.+\|\s*$/', $line)) {
            $flushParagraph();
            
            $tableRows = [];
            $hasHeaderSeparator = false;
            
            while ($i < count($lines) && preg_match('/^\s*\|.+\|\s*$/', $lines[$i])) {
                $currentLine = trim($lines[$i]);
                
                if (preg_match('/^\|[\s\-:|]+\|$/', $currentLine)) {
                    $hasHeaderSeparator = true;
                    $i++;
                    continue;
                }
                
                $cells = array_map('trim', array_slice(explode('|', $currentLine), 1, -1));
                $tableRows[] = $cells;
                $i++;
            }
            $i--;
            
            if (count($tableRows) > 0) {
                $tableHTML = '<table>';
                
                for ($r = 0; $r < count($tableRows); $r++) {
                    $row = $tableRows[$r];
                    $isHeaderRow = ($r === 0 && $hasHeaderSeparator);
                    $cellTag = $isHeaderRow ? 'th' : 'td';
                    
                    $tableHTML .= '<tr>';
                    for ($c = 0; $c < count($row); $c++) {
                        $cellContent = $applyInlineStyles($row[$c]);
                        $tableHTML .= '<' . $cellTag . '>' . $cellContent . '</' . $cellTag . '>';
                    }
                    $tableHTML .= '</tr>';
                }
                
                $tableHTML .= '</table>';
                $result[] = $tableHTML;
            }
            continue;
        }
        
        // Regular text
        $currentParagraph[] = $line;
    }
    
    // Flush remaining paragraph
    $flushParagraph();
    
    // Handle unclosed code block
    if ($inCodeBlock && count($codeBlockContent) > 0) {
        $codeContent = implode("\n", $codeBlockContent);
        $result[] = '<pre><code class="language-' . ($codeBlockLang ?: 'text') . '">' . $codeContent . '</code></pre>';
    }
    
    return implode("\n", $result);
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
