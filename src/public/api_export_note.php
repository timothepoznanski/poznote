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

require_once __DIR__ . '/../auth.php';

// Check authentication (API-friendly) BEFORE db_connect so the connection
// targets the authenticated user's database, not the fallback (user 1)
requireApiAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../markdown_parser.php';
require_once __DIR__ . '/../export_helpers.php';

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

if (!in_array($format, ['html', 'markdown', 'json', 'html_embedded'], true)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid format. Use "html", "markdown", "json" or "html_embedded"']);
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
    $stmt = $con->prepare('SELECT id, heading, type, tags, favorite, folder_id, created, updated, attachments, entry FROM entries WHERE id = ? AND trash = 0');
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

    if ($noteType === 'tasklist') {
        $content = resolveTasklistStoredContent($content, $note['entry'] ?? '');
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
                    $tasksContent .= renderTasklistSubtasksHtml($task);
                    $tasksContent .= '</div>' . "\n";
                }
                $tasksContent .= '</div>' . "\n";
                $tasksContent .= '</div>' . "\n";
                $content = $tasksContent;
            } else {
                $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
            }
        }
        
        if ($format === 'html_embedded') {
            // For embedded HTML, we need to convert images before generating styled HTML
            // because generateStyledHtml might add classes or wrappers that complicate matching
            $content = convertImagesToBase64InHtml($content);
            $disposition = 'attachment';
        }

        // Export as HTML - create ZIP with attachments if downloading
        $isZipExport = ($disposition === 'attachment' && $format === 'html');

        // Attachments are only linkable in the ZIP export, where the files are
        // actually shipped in an attachments/ folder next to the page
        $headerAttachments = $isZipExport ? buildExportAttachmentList($note) : [];

        $referenceResolver = buildExportNoteReferenceResolver($con, $noteId);

        // A markdown note sent to the print dialog is laid out by the app's
        // own stylesheets, so the paper matches the note as it is read
        if ($disposition === 'inline' && $format === 'html' && $noteType === 'markdown') {
            exportAsHtml(generatePrintHtml($content, $note, $referenceResolver), $note['heading'], 'inline');
        }

        // Generate styled HTML
        $htmlContent = generateStyledHtml($content, $note['heading'], $noteType, $note['tags'], $headerAttachments, $referenceResolver);

        if ($isZipExport) {
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
 * Convert all local images in HTML to base64 data URIs
 */
function convertImagesToBase64InHtml($html) {
    if (empty($html)) return $html;
    
    // Pattern to match <img> tags and extract src
    // Standard Poznote image format: <img src="/api/v1/notes/185/attachments/69ce2ed9a270f" ...>
    // Or: <img src="api_attachments.php?action=download&id=..." ...>
    return preg_replace_callback('/<img\s+[^>]*?src=["\']([^"\']+)["\'][^>]*?>/i', function($matches) {
        $fullTag = $matches[0];
        $src = $matches[1];
        
        // Convert to base64 if it\'s a local image
        $newSrc = convertImageToBase64($src);
        
        // Replace ONLY the src attribute in the full tag to preserve other attributes (style, class, etc.)
        // Using preg_replace for safer replacement of the specific src attribute
        return preg_replace('/(src=["\'])' . preg_quote($src, '/') . '(["\'])/i', '$1' . $newSrc . '$2', $fullTag);
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
    
    // Normalize path to remove domain if present
    if (preg_match('#^https?://[^/]+(/.*)$#i', $imagePath, $normMatches)) {
        $imagePath = $normMatches[1];
    }

    // Pattern for API V1 links: /api/v1/notes/{note_id}/attachments/{attachment_id}
    if (preg_match('#/api/v1/notes/(\d+)/attachments/([^/?\#]+)#i', $imagePath, $matches)) {
        $noteId = (int)$matches[1];
        $attachmentId = (string)$matches[2];
        
        try {
            $stmt = $con->prepare('SELECT attachments FROM entries WHERE id = ?');
            $stmt->execute([$noteId]);
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
            error_log('api_export_note: convertImageToBase64() failed: ' . $e->getMessage());
        }
    }
    // Pattern for attachment links: api_attachments.php?action=download&note_id=X&attachment_id=Y
    elseif (stripos($imagePath, 'api_attachments.php') !== false) {
        $queryString = parse_url($imagePath, PHP_URL_QUERY) ?? '';
        $params = [];
        parse_str($queryString, $params);

        $noteId = isset($params['note_id']) ? (int)$params['note_id'] : 0;
        $attachmentId = isset($params['attachment_id']) ? (string)$params['attachment_id'] : '';
        // Also check if id is used instead of attachment_id (common in some internal calls)
        if ($attachmentId === '' && isset($params['id'])) {
            $attachmentId = (string)$params['id'];
        }
        $workspace = isset($params['workspace']) ? (string)$params['workspace'] : null;

        if ($attachmentId !== '') {
            try {
                // If noteId is missing, try to infer from context or search (though noteId is preferred)
                if ($noteId > 0) {
                    if ($workspace !== null && $workspace !== '') {
                        $stmt = $con->prepare('SELECT attachments FROM entries WHERE id = ? AND workspace = ?');
                        $stmt->execute([$noteId, $workspace]);
                    } else {
                        $stmt = $con->prepare('SELECT attachments FROM entries WHERE id = ?');
                        $stmt->execute([$noteId]);
                    }
                } else {
                    // Fallback: search across all notes for this attachment ID
                    $stmt = $con->prepare('SELECT attachments FROM entries WHERE attachments LIKE ? LIMIT 1');
                    $stmt->execute(['%' . $attachmentId . '%']);
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
                // Silent fail
                error_log('api_export_note: convertImageToBase64() failed: ' . $e->getMessage());
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
    
    // If no valid path was found OR it doesn\'t exist, try a global search by ID
    if (!$fullPath || !file_exists($fullPath)) {
        // Look for anything that looks like a 13-character hex ID (Poznote style)
        if (preg_match('/([a-f0-9]{13})/i', $imagePath, $idMatches)) {
            $attachmentId = $idMatches[1];
            try {
                $stmt = $con->prepare('SELECT attachments FROM entries WHERE attachments LIKE ? LIMIT 1');
                $stmt->execute(['%' . $attachmentId . '%']);
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
                error_log('api_export_note: convertImageToBase64() failed: ' . $e->getMessage());
            }
        }
    }
    
    // If we still don\'t have a path, return original
    if (!$fullPath) {
        return $imagePath;
    }
    
    // Security check: ensure path is within attachments directory
    $realPath = realpath($fullPath);
    $expectedDir = realpath($attachmentsPath);

    if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
        // The file may live in the bucket instead of on disk, including
        // after S3 storage was turned off with files still there.
        // basename() keeps the lookup confined to this user's prefix.
        $realPath = poznoteAttachmentsBucketMayHoldFiles() ? poznoteAttachmentLocalFile(basename((string)$fullPath)) : null;
        if ($realPath === null) {
            return $imagePath; // Return original path if security check fails
        }
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
/**
 * Drop the header attachments row. Used on the fallback paths where the page
 * ships without its attachments/ folder, so the links would lead nowhere.
 */
function stripExportAttachmentLinks($html) {
    return preg_replace('#<div class="note-attachments">.*?</div>#s', '', $html, 1);
}

/**
 * Strip the editing affordances from rendered note content and link its
 * [[Note Title]] references, for a page nobody edits.
 */
function cleanExportContent($content, $referenceResolver = null) {
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    // Prefix an XML encoding header to avoid mojibake without depending on mbstring
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $content, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);
    // Code block UI affordances (copy / delete / language badge / line numbers)
    $actionButtons = $xpath->query("//*[contains(@class, 'code-block-copy-btn') or contains(@class, 'code-block-delete-btn') or contains(@class, 'code-block-lang-btn') or contains(@class, 'code-block-line-numbers-btn')]");
    foreach ($actionButtons as $button) {
        $button->parentNode->removeChild($button);
    }

    if ($referenceResolver !== null && strpos($content, '[[') !== false) {
        linkExportNoteReferences($dom, $xpath, $referenceResolver);
    }

    // Save the body content only to avoid XML header or duplicate body/html tags
    $body = $dom->getElementsByTagName('body')->item(0);
    if (!$body) {
        // Strip the xml processing instruction added above for UTF-8 handling
        return preg_replace('/^<\?xml[^>]*\?>\s*/', '', $dom->saveHTML());
    }
    $cleanContent = '';
    foreach ($body->childNodes as $child) {
        $cleanContent .= $dom->saveHTML($child);
    }
    return $cleanContent;
}

/**
 * Page handed to the browser's print dialog for a markdown note. It loads the
 * stylesheets of index.php around the markup the note has there, so headings,
 * lists, quotes, code and callouts print as they read in the app, in the light
 * theme whatever theme the app is in. Diagrams, formulas and code colours are
 * drawn by the same libraries, and window.poznotePrintReady resolves once
 * they are in.
 */
function generatePrintHtml($content, $note, $referenceResolver = null) {
    require_once __DIR__ . '/../version_helper.php';
    require_once __DIR__ . '/index_css.php';

    $noteId = (int)$note['id'];
    $cleanContent = cleanExportContent($content, $referenceResolver);
    // The server marks a code block without a language as "CODE", which the
    // stylesheets would print as a badge the app does not show
    $cleanContent = str_replace(' data-language="CODE"', '', $cleanContent);

    $v = poznoteBuildAssetCacheVersion(getAppVersion());
    $indexCssVersion = poznoteGetIndexCssAssetVersion();
    if ($indexCssVersion !== '') {
        $v .= '-' . $indexCssVersion;
    }
    $v = rawurlencode($v);

    $fontSize = (int)getSetting('note_font_size', '15');
    if ($fontSize < 8 || $fontSize > 40) {
        $fontSize = 15;
    }

    // The settings that change how a note reads, as index.php passes them on
    $settingOff = function ($key, $default) {
        return in_array(getSetting($key, $default), ['0', 'false'], true);
    };
    $bodyClasses = 'note-print-page';
    if ($settingOff('code_block_word_wrap', '1')) {
        $bodyClasses .= ' code-block-no-wrap';
    }
    if (!$settingOff('code_block_line_numbers', '0')) {
        $bodyClasses .= ' code-block-line-numbers';
    }
    if ($settingOff('markdown_heading_underline', '1')) {
        $bodyClasses .= ' markdown-no-heading-underline';
    }
    $bodyStyle = '';
    $markdownColored = getSetting('markdown_colored', '0');
    if (poznoteMarkdownColoredEnabled($markdownColored)) {
        $bodyClasses .= ' markdown-colored';
        $bodyStyle = poznoteMarkdownColoredStyle($markdownColored, getSetting('markdown_colored_custom', ''));
    }

    $tagsHtml = '';
    $tagsList = empty($note['tags']) ? [] : array_filter(array_map('trim', explode(',', $note['tags'])));
    if (!empty($tagsList)) {
        $tagsHtml = '<div class="note-print-tags">';
        foreach ($tagsList as $tag) {
            $tagsHtml .= '<span class="note-print-tag">' . htmlspecialchars($tag) . '</span>';
        }
        $tagsHtml .= '</div>';
    }

    $title = htmlspecialchars((string)$note['heading']);

    return '<!DOCTYPE html>
<html lang="' . htmlspecialchars(getUserLanguage(), ENT_QUOTES) . '" data-theme="light" class="theme-light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>' . $title . '</title>
    <link rel="stylesheet" href="index_css.php?group=core&amp;v=' . $v . '">
    <link rel="stylesheet" href="index_css.php?group=modals&amp;v=' . $v . '">
    <link rel="stylesheet" href="js/katex/katex.min.css?v=' . $v . '">
    <link rel="stylesheet" href="css/syntax-highlight.css?v=' . $v . '">
    <style>
        :root { --note-font-size: ' . $fontSize . 'px; }

        /* The app is a fixed frame with panes that scroll: on paper the note
           is the whole page and runs over as many sheets as it needs */
        html, body.note-print-page {
            height: auto;
            min-height: 0;
            overflow: visible;
            background: #fff;
        }

        body.note-print-page {
            display: block;
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px;
        }

        .note-print-page #right_pane,
        .note-print-page #right_col,
        .note-print-page .notecard,
        .note-print-page .innernote,
        .note-print-page .noteentry {
            position: static;
            display: block;
            width: auto;
            max-width: none;
            height: auto;
            min-height: 0;
            max-height: none;
            margin: 0;
            padding: 0;
            overflow: visible;
            border: 0;
            box-shadow: none;
            background: transparent;
        }

        .note-print-header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #e0e0e0;
        }

        .note-print-title {
            font-size: 28px;
            font-weight: 700;
            line-height: 1.25;
            color: #1a1a1a;
        }

        .note-print-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }

        .note-print-tag {
            padding: 3px 10px;
            border: 1px solid #d0d0d0;
            border-radius: 12px;
            background: #f0f0f0;
            font-size: 12px;
            color: #555;
        }

        /* Nothing is clicked on paper */
        .note-print-page .code-block-copy-btn,
        .note-print-page .mermaid-zoom-btn {
            display: none !important;
        }

        @page {
            margin: 2cm;
        }

        @media print {
            body.note-print-page {
                max-width: none;
                padding: 0;
            }

            .note-print-header {
                break-after: avoid;
            }

            .note-print-page :is(pre, blockquote, table, img, .callout, .mermaid, .math-block) {
                break-inside: avoid;
            }

            .note-print-page :is(h1, h2, h3, h4, h5, h6) {
                break-after: avoid;
            }
        }
    </style>
</head>
<body class="' . $bodyClasses . '"' . ($bodyStyle !== '' ? ' style="' . htmlspecialchars($bodyStyle, ENT_QUOTES) . '"' : '') . '>
    <div id="right_pane"><div id="right_col"><div class="notecard" id="note' . $noteId . '"><div class="innernote">
        <div class="note-print-header">
            <div class="note-print-title">' . $title . '</div>' . $tagsHtml . '
        </div>
        <div class="noteentry" id="entry' . $noteId . '" data-note-id="' . $noteId . '" data-note-type="markdown"><div class="markdown-preview">' . $cleanContent . '</div></div>
    </div></div></div></div>
    <script src="js/highlight/highlight.min.js?v=' . $v . '"></script>
    <script src="js/highlight/powershell.min.js?v=' . $v . '"></script>
    <script src="js/syntax-highlight.js?v=' . $v . '"></script>
    <script src="js/math-renderer.js?v=' . $v . '"></script>
    <script src="js/mermaid-theme.js?v=' . $v . '"></script>
    <script>
        (function () {
            var v = "' . $v . '";
            var entry = document.querySelector(".noteentry");

            function load(src) {
                return new Promise(function (resolve) {
                    var script = document.createElement("script");
                    script.src = src + "?v=" + v;
                    script.onload = resolve;
                    // A library that fails to load leaves its blocks as text
                    script.onerror = resolve;
                    document.head.appendChild(script);
                });
            }

            function renderMath() {
                if (!entry.querySelector(".math-block, .math-inline")) return Promise.resolve();
                return load("js/katex/katex.min.js").then(function () {
                    if (typeof window.renderMathInElement === "function") window.renderMathInElement(entry);
                });
            }

            function renderDiagrams() {
                var nodes = entry.querySelectorAll(".mermaid");
                if (!nodes.length) return Promise.resolve();
                return load("js/mermaid/mermaid.min.js").then(function () {
                    if (typeof mermaid === "undefined") return;
                    var config = { startOnLoad: false };
                    try {
                        if (typeof window.poznoteMermaidTheme === "function") config = window.poznoteMermaidTheme().config;
                    } catch (e) {}
                    mermaid.initialize(config);
                    return mermaid.run({ nodes: nodes, suppressErrors: true });
                }).catch(function () {});
            }

            // A folded callout would print as its title alone: open them all
            // for the print, then fold back the ones that were closed.
            var folded = [];
            window.addEventListener("beforeprint", function () {
                Array.prototype.forEach.call(document.querySelectorAll("details.callout:not([open])"), function (el) {
                    el.open = true;
                    folded.push(el);
                });
            });
            window.addEventListener("afterprint", function () {
                folded.forEach(function (el) { el.open = false; });
                folded = [];
            });

            window.poznotePrintReady = Promise.all([
                renderMath(),
                renderDiagrams(),
                document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
            ]);
        })();
    </script>
</body>
</html>';
}

/**
 * Returns the lookup used to turn a [[Note Title]] of the exported note into
 * a link. It answers like GET /api/v1/notes/resolve: the most recently
 * updated note of the same workspace whose title contains the reference.
 */
function buildExportNoteReferenceResolver($con, $noteId) {
    $workspace = null;
    try {
        $stmt = $con->prepare('SELECT workspace FROM entries WHERE id = ?');
        $stmt->execute([$noteId]);
        $workspace = $stmt->fetchColumn();
    } catch (Exception $e) {
        error_log('api_export_note: workspace lookup failed: ' . $e->getMessage());
    }
    $workspace = ($workspace === false || $workspace === null) ? '' : (string)$workspace;
    $cache = [];

    return function ($reference) use ($con, $workspace, &$cache) {
        if (array_key_exists($reference, $cache)) {
            return $cache[$reference];
        }
        $found = null;
        try {
            if (is_numeric($reference)) {
                $sql = 'SELECT id, heading, workspace FROM entries WHERE trash = 0 AND id = ?';
                $params = [intval($reference)];
            } else {
                $sql = 'SELECT id, heading, workspace FROM entries WHERE trash = 0 AND remove_accents(heading) LIKE remove_accents(?)';
                $params = ['%' . $reference . '%'];
            }
            if ($workspace !== '') {
                $sql .= ' AND workspace = ?';
                $params[] = $workspace;
            }
            $stmt = $con->prepare($sql . ' ORDER BY updated DESC LIMIT 1');
            $stmt->execute($params);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                $found = $row;
            }
        } catch (Exception $e) {
            error_log('api_export_note: note reference lookup failed: ' . $e->getMessage());
        }
        $cache[$reference] = $found;
        return $found;
    };
}

/**
 * Turn the [[Note Title]] references of the exported content into links, as
 * note-reference.js does in the app once a note is rendered. Code is left
 * alone, and a title that matches no note is marked as a broken link.
 */
function linkExportNoteReferences($dom, $xpath, $referenceResolver) {
    $textNodes = [];
    foreach ($xpath->query("//text()[contains(., '[[') and not(ancestor::code) and not(ancestor::pre)]") as $textNode) {
        $textNodes[] = $textNode;
    }

    foreach ($textNodes as $textNode) {
        $parts = preg_split('/\[\[([^\]]+)\]\]/', $textNode->nodeValue, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false || count($parts) < 3) {
            continue;
        }
        $fragment = $dom->createDocumentFragment();
        foreach ($parts as $index => $part) {
            // Odd entries are the captured titles
            if ($index % 2 === 0) {
                if ($part !== '') {
                    $fragment->appendChild($dom->createTextNode($part));
                }
                continue;
            }
            $target = $referenceResolver($part);
            if ($target) {
                $link = $dom->createElement('a');
                $link->setAttribute('href', 'index.php?note=' . intval($target['id']) . '&workspace=' . rawurlencode((string)$target['workspace']));
                $link->setAttribute('class', 'note-internal-link');
            } else {
                $link = $dom->createElement('span');
                $link->setAttribute('class', 'note-internal-link note-link-broken');
            }
            $link->appendChild($dom->createTextNode($part));
            $fragment->appendChild($link);
        }
        $textNode->parentNode->replaceChild($fragment, $textNode);
    }
}

/**
 * Build the "Attachments" section appended to an exported Markdown note.
 * Only files added to the ZIP are listed, and images already embedded in the
 * body are skipped, mirroring the HTML export header row.
 */
function buildExportAttachmentMarkdown($attachments, $addedAttachmentIds, $content) {
    $lines = [];
    foreach ($attachments as $attachment) {
        if (empty($attachment['id']) || empty($attachment['filename'])) {
            continue;
        }
        if (!in_array($attachment['id'], $addedAttachmentIds, true)) {
            continue;
        }

        $filename = (string)($attachment['original_filename'] ?? $attachment['filename']);
        $extension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
        $exportName = $attachment['id'] . ($extension ? '.' . $extension : '');

        // Skip images already embedded in the body
        if (strpos($content, 'attachments/' . $exportName) !== false) {
            continue;
        }

        // Escape the ] and ) that would otherwise break the link syntax
        $label = str_replace([']', '['], ['\\]', '\\['], $filename);
        $lines[] = '- [' . $label . '](attachments/' . rawurlencode($exportName) . ')';
    }

    if (empty($lines)) {
        return '';
    }

    return "\n\n## Attachments\n\n" . implode("\n", $lines) . "\n";
}

/**
 * Remove header links pointing at attachments that could not be added to the
 * ZIP (unreadable file, bucket fetch failure), and drop the row if it empties.
 */
function pruneExportAttachmentLinks($html, $attachments, $addedAttachmentIds) {
    $missing = [];
    foreach ($attachments as $attachment) {
        if (empty($attachment['id']) || empty($attachment['filename'])) {
            continue;
        }
        if (in_array($attachment['id'], $addedAttachmentIds, true)) {
            continue;
        }
        $extension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
        $missing[] = $attachment['id'] . ($extension ? '.' . $extension : '');
    }

    foreach ($missing as $exportName) {
        $html = preg_replace(
            '#<a href="attachments/' . preg_quote(rawurlencode($exportName), '#') . '"[^>]*>.*?</a>\s*#s',
            '',
            $html
        );
    }

    // An emptied row would render as a stray blank block
    return preg_replace('#<div class="note-attachments">\s*</div>#s', '', $html, 1);
}

/**
 * Decode a note's attachments and stamp each one with the basename it gets in
 * the exported ZIP (attachment id + original extension), matching how
 * exportAsHtmlZip() and exportAsMarkdownZip() name the files they add.
 */
function buildExportAttachmentList($note) {
    $attachments = poznoteFilterVisibleAttachments($note['attachments'] ?? '');

    $list = [];
    foreach ($attachments as $attachment) {
        if (empty($attachment['id']) || empty($attachment['filename'])) {
            continue;
        }
        $extension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
        $attachment['export_name'] = $attachment['id'] . ($extension ? '.' . $extension : '');
        $list[] = $attachment;
    }

    return $list;
}

/**
 * Build the attachments row shown in the exported page header.
 * Images already rendered inline in the note body are skipped, mirroring the
 * attachment links row of the app. $attachments must carry the exported ZIP
 * basename (id + extension) in 'export_name'; returns '' when nothing to list.
 */
function buildExportAttachmentLinks($attachments, $content) {
    if (empty($attachments) || !is_array($attachments)) {
        return '';
    }

    $links = [];
    foreach ($attachments as $attachment) {
        if (empty($attachment['id']) || empty($attachment['export_name'])) {
            continue;
        }

        $filename = (string)($attachment['original_filename'] ?? $attachment['filename'] ?? $attachment['id']);

        $mimeType = (string)($attachment['file_type'] ?? $attachment['mime_type'] ?? '');
        $isImage = strpos($mimeType, 'image/') === 0;
        if (!$isImage) {
            $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            $isImage = in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'], true);
        }

        // An inline image is already visible in the body; listing it again is noise
        if ($isImage) {
            $reference = 'attachments/' . $attachment['id'];
            if (strpos($content, $reference) !== false || strpos($content, urlencode($reference)) !== false) {
                continue;
            }
        }

        $href = 'attachments/' . rawurlencode((string)$attachment['export_name']);
        $links[] = '<a href="' . htmlspecialchars($href, ENT_QUOTES) . '"'
            . ' download="' . htmlspecialchars($filename, ENT_QUOTES) . '">'
            . htmlspecialchars($filename, ENT_QUOTES) . '</a>';
    }

    if (empty($links)) {
        return '';
    }

    return '<div class="note-attachments">' . implode(' ', $links) . '</div>';
}

function generateStyledHtml($content, $title, $noteType, $tags, $attachments = [], $referenceResolver = null) {
    // Parse tags (stored as comma-separated string)
    $tagsList = [];
    if (!empty($tags)) {
        $tagsList = array_filter(array_map('trim', explode(',', $tags)));
    }
    
    $cleanContent = cleanExportContent($content, $referenceResolver);
    
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

        .note-attachments {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            margin-top: 15px;
            font-size: 14px;
        }

        .note-attachments a {
            color: #0645ad;
            text-decoration: none;
            border-bottom: 1px solid rgba(6, 69, 173, 0.35);
        }

        .note-attachments a:hover {
            border-bottom-color: #0645ad;
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
        
        /* A [[Note Title]] that matches no note, as the app shows it */
        .note-link-broken {
            color: #dc3545;
            text-decoration: line-through;
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
            /* This page is light whatever the system prefers, and an
               Excalidraw preview reads the scheme to decide how to draw its
               photos. */
            color-scheme: light;
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
            flex-wrap: wrap;
            align-items: center;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fafafa;
        }

        /* Subtasks: a full-width block under the line of their task */
        .task-subtasks {
            flex: 0 0 100%;
            margin-top: 6px;
            padding-left: 24px;
            box-sizing: border-box;
        }

        .task-subitem {
            display: flex;
            align-items: baseline;
            padding: 2px 0;
            font-size: 13px;
            line-height: 1.4;
        }

        .task-subitem-text {
            flex: 1;
            overflow-wrap: anywhere;
        }

        .task-subitem.completed .task-subitem-text {
            text-decoration: line-through;
            color: #666;
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

        /* Callouts (Note, Tip, Important, Warning, Caution). This page is
           standalone, so the rules of tasks.css are repeated here with the
           light theme colours. Unknown types keep the note blue. */
        .callout {
            display: block;
            border-left: 3px solid #007db8;
            padding: 8px 0 8px 12px;
            margin: 12px 0;
        }

        .callout .callout-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 15px;
            font-weight: 600;
            color: #007db8;
        }

        .callout .callout-body {
            line-height: 1.45;
        }

        .callout .callout-body hr {
            border: 0;
            border-top: 1px solid currentColor;
            opacity: 0.25;
            margin: 0.85em 0;
        }

        .callout .callout-icon-svg {
            flex: 0 0 16px;
            width: 16px;
            height: 16px;
            margin-right: 8px;
            fill: currentColor;
            opacity: 0.75;
        }

        details.callout > summary.callout-title {
            list-style: none;
        }

        details.callout > summary.callout-title::-webkit-details-marker {
            display: none;
        }

        .callout .callout-fold-icon {
            flex: 0 0 12px;
            width: 12px;
            height: 12px;
            fill: currentColor;
            opacity: 0.6;
        }

        details.callout:not([open]) > summary.callout-title {
            margin-bottom: 0;
        }

        details.callout:not([open]) .callout-fold-icon {
            transform: rotate(-90deg);
        }

        .callout-tip { border-left-color: #218838; }
        .callout-tip .callout-title { color: #218838; }
        .callout-important { border-left-color: #9333ea; }
        .callout-important .callout-title { color: #9333ea; }
        .callout-warning { border-left-color: #856404; }
        .callout-warning .callout-title { color: #856404; }
        .callout-caution { border-left-color: #c82333; }
        .callout-caution .callout-title { color: #c82333; }

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
            pre, blockquote, table, .callout {
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

    $html .= buildExportAttachmentLinks($attachments, $cleanContent);

    $html .= '
    </div>
    <div class="note-content">
        ' . $cleanContent . '
    </div>
    <script>
        // A folded callout would print as its title alone: open them all for
        // the print, then fold back the ones that were closed.
        (function () {
            var folded = [];
            window.addEventListener("beforeprint", function () {
                Array.prototype.forEach.call(document.querySelectorAll("details.callout:not([open])"), function (el) {
                    el.open = true;
                    folded.push(el);
                });
            });
            window.addEventListener("afterprint", function () {
                folded.forEach(function (el) { el.open = false; });
                folded = [];
            });
        })();
    </script>
</body>
</html>';
    
    return $html;
}

/**
 * Export as HTML file
 */
function exportAsHtml($htmlContent, $title, $disposition = 'attachment') {
    $filename = sanitizeDownloadFilename($title) . '.html';
    
    header('Content-Type: text/html; charset=utf-8');
    header('Content-Disposition: ' . $disposition . '; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    // Unbuffered: the file must reach the browser as the exporter built it,
    // and a large note must not be copied into memory a second time.
    poznoteEndOutputBuffers();
    echo $htmlContent;
    exit;
}

/**
 * Export note as HTML in a ZIP file with all attachments
 */
function exportAsHtmlZip($htmlContent, $note, $con) {
    if (!class_exists('ZipArchive')) {
        // Fallback to simple HTML export if ZipArchive is not available
        exportAsHtml(stripExportAttachmentLinks($htmlContent), $note['heading'], 'attachment');
        return;
    }

    $noteId = $note['id'];
    $title = $note['heading'] ?? 'New note';
    $attachments = poznoteFilterVisibleAttachments($note['attachments'] ?? '');

    // If no attachments, just export HTML without ZIP
    if (empty($attachments) || !is_array($attachments)) {
        exportAsHtml(stripExportAttachmentLinks($htmlContent), $title, 'attachment');
        return;
    }

    // Create temporary ZIP file
    $tempZipFile = tempnam(sys_get_temp_dir(), 'poznote_export_');
    $zip = new ZipArchive();

    if ($zip->open($tempZipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        // Fallback if ZIP creation fails
        exportAsHtml(stripExportAttachmentLinks($htmlContent), $title, 'attachment');
        return;
    }
    
    // Build a mapping of attachment IDs to their extensions
    $attachmentExtensions = [];
    $attachmentDownloadNames = [];
    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
            $attachmentExtensions[$attachment['id']] = $ext ? '.' . $ext : '';
            $attachmentDownloadNames[$attachment['id'] . ($ext ? '.' . $ext : '')] = $attachment['original_filename'] ?? $attachment['filename'];
        }
    }

    // Modify HTML to use local attachments folder with extensions
    $htmlContent = preg_replace_callback(
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9._-]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = resolveAttachmentReferenceId($matches[1], $attachmentExtensions);
            $extension = $attachmentExtensions[$attachmentId] ?? '';
            return 'attachments/' . $attachmentId . $extension;
        },
        $htmlContent
    );
    $htmlContent = addDownloadAttributesToAttachmentLinks($htmlContent, $attachmentDownloadNames);

    // Add attachments to ZIP first: the header links must only mention files
    // that actually made it into the archive
    $attachmentsPath = getAttachmentsPath();
    $addedAttachments = [];

    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            // Readable local path (fetched from the bucket in S3 mode)
            $attachmentFile = poznoteAttachmentLocalFile($attachment['filename']);

            if ($attachmentFile !== null) {
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

    // If no attachments could be added, delete ZIP and export HTML only
    if (empty($addedAttachments)) {
        $zip->close();
        @unlink($tempZipFile);
        exportAsHtml(stripExportAttachmentLinks($htmlContent), $title, 'attachment');
        return;
    }

    $htmlContent = pruneExportAttachmentLinks($htmlContent, $attachments, $addedAttachments);

    // Add HTML file to ZIP
    $htmlFilename = sanitizeDownloadFilename($title) . '.html';
    $zip->addFromString($htmlFilename, $htmlContent);

    $zip->close();

    // Send ZIP file
    $zipFilename = sanitizeDownloadFilename($title) . '.zip';
    $fileSize = filesize($tempZipFile);
    
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . $fileSize);
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    poznoteSendFile($tempZipFile);
    @unlink($tempZipFile);
    exit;
}

/**
 * Sanitize filename for download
 */
function sanitizeDownloadFilename($filename) {
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
    $created = convertUtcToUserTimezone($note['created'] ?? '');
    $updated = convertUtcToUserTimezone($note['updated'] ?? '');
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
    $filename = sanitizeDownloadFilename($title) . '.md';
    
    header('Content-Type: text/markdown; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    // Unbuffered: the file must reach the browser as the exporter built it,
    // and a large note must not be copied into memory a second time.
    poznoteEndOutputBuffers();
    echo $markdownContent;
    exit;
}

/**
 * Export note as Markdown in ZIP file with all attachments
 */
function exportAsMarkdownZip($content, $note, $con) {
    $noteId = $note['id'];
    $title = $note['heading'] ?? 'New note';
    $attachments = poznoteFilterVisibleAttachments($note['attachments'] ?? '');

    // If no ZipArchive or no attachments, export as simple markdown
    if (!class_exists('ZipArchive') || empty($attachments) || !is_array($attachments)) {
        exportAsMarkdown($content, $note, $con);
        return;
    }
    
    // Prepare markdown content
    $tags = $note['tags'] ?? '';
    $favorite = !empty($note['favorite']) ? 'true' : 'false';
    $created = convertUtcToUserTimezone($note['created'] ?? '');
    $updated = convertUtcToUserTimezone($note['updated'] ?? '');
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
        '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9._-]+)#',
        function($matches) use ($attachmentExtensions) {
            $attachmentId = resolveAttachmentReferenceId($matches[1], $attachmentExtensions);
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
    
    // Add attachments to ZIP first: the links appended below must only mention
    // files that actually made it into the archive
    $attachmentsPath = getAttachmentsPath();
    $addedAttachments = [];

    foreach ($attachments as $attachment) {
        if (isset($attachment['id']) && isset($attachment['filename'])) {
            // Readable local path (fetched from the bucket in S3 mode)
            $attachmentFile = poznoteAttachmentLocalFile($attachment['filename']);

            if ($attachmentFile !== null) {
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
    
    // If no attachments could be added, export simple markdown
    if (empty($addedAttachments)) {
        $zip->close();
        @unlink($tempZipFile);
        exportAsMarkdown($content, $note, $con);
        return;
    }

    $markdownContent .= buildExportAttachmentMarkdown($attachments, $addedAttachments, $markdownContent);

    // Add markdown file to ZIP
    $mdFilename = sanitizeDownloadFilename($title) . '.md';
    $zip->addFromString($mdFilename, $markdownContent);

    $zip->close();

    // Send ZIP file
    $zipFilename = sanitizeDownloadFilename($title) . '.zip';
    $fileSize = filesize($tempZipFile);
    
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . $fileSize);
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: Sat, 26 Jul 1997 05:00:00 GMT');
    
    poznoteSendFile($tempZipFile);
    @unlink($tempZipFile);
    exit;
}

/**
 * Export as JSON file (raw tasklist JSON)
 */
function exportAsJson($rawJson, $title) {
    $filename = sanitizeDownloadFilename($title) . '.json';

    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-cache, must-revalidate');
    header('Expires: 0');

    // Unbuffered: the file must reach the browser as the exporter built it,
    // and a large note must not be copied into memory a second time.
    poznoteEndOutputBuffers();
    echo $rawJson;
    exit;
}
