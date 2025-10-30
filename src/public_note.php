<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

/**
 * Simple markdown to HTML parser for public notes
 * Based on the JavaScript version used in the main application
 */
function parseMarkdown($text) {
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
        // Inline code (must be first to protect code content from other replacements)
        $text = preg_replace('/`([^`]+)`/', '<code>$1</code>', $text);
        
        // Bold and italic
        $text = preg_replace('/\*\*\*([^\*]+)\*\*\*/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/___([^_]+)___/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/\*\*([^\*]+)\*\*/', '<strong>$1</strong>', $text);
        $text = preg_replace('/__([^_]+)__/', '<strong>$1</strong>', $text);
        $text = preg_replace('/\*([^\*]+)\*/', '<em>$1</em>', $text);
        $text = preg_replace('/_([^_]+)_/', '<em>$1</em>', $text);
        
        // Strikethrough
        $text = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $text);
        
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
            // Process line breaks according to GitHub Flavored Markdown rules
            $processedLines = [];
            for ($i = 0; $i < count($currentParagraph); $i++) {
                $line = $currentParagraph[$i];
                if ($i < count($currentParagraph) - 1) {
                    // Check if line ends with 2+ spaces
                    if (preg_match('/\s{2,}$/', $line)) {
                        $processedLines[] = preg_replace('/\s{2,}$/', '', $line) . '<br>';
                    } else {
                        // GitHub style: single line breaks become <br>
                        $processedLines[] = $line . '<br>';
                    }
                } else {
                    // Last line - no <br> needed
                    $processedLines[] = $line;
                }
            }
            $para = implode('', $processedLines);
            $para = $applyInlineStyles($para);
            $result[] = '<p>' . $para . '</p>';
            $currentParagraph = [];
        }
    };
    
    for ($i = 0; $i < count($lines); $i++) {
        $line = $lines[$i];
        
        // Handle code blocks
        if (preg_match('/^```/', $line)) {
            $flushParagraph();
            if (!$inCodeBlock) {
                $inCodeBlock = true;
                $codeBlockLang = trim(preg_replace('/^```/', '', $line));
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
        
        // Empty line - paragraph separator
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
        
        // Task lists (checkboxes) - must be checked before unordered lists
        if (preg_match('/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $checked = strtolower($matches[1]) === 'x';
            $content = $applyInlineStyles($matches[2]);
            $checkbox = '<input type="checkbox" ' . ($checked ? 'checked ' : '') . 'disabled>';
            $listItems = ['<li class="task-list-item">' . $checkbox . ' ' . $content . '</li>'];
            
            // Check if next lines are also task list items
            while ($i + 1 < count($lines) && preg_match('/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $lines[$i + 1], $nextMatches)) {
                $i++;
                $nextChecked = strtolower($nextMatches[1]) === 'x';
                $nextContent = $applyInlineStyles($nextMatches[2]);
                $nextCheckbox = '<input type="checkbox" ' . ($nextChecked ? 'checked ' : '') . 'disabled>';
                $listItems[] = '<li class="task-list-item">' . $nextCheckbox . ' ' . $nextContent . '</li>';
            }
            $result[] = '<ul class="task-list">' . implode('', $listItems) . '</ul>';
            continue;
        }
        
        // Unordered lists
        if (preg_match('/^\s*[\*\-\+]\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $content = $applyInlineStyles($matches[1]);
            $listItems = ['<li>' . $content . '</li>'];
            
            // Check if next lines are also list items
            while ($i + 1 < count($lines) && preg_match('/^\s*[\*\-\+]\s+(.+)$/', $lines[$i + 1], $nextMatches)) {
                $i++;
                $nextContent = $applyInlineStyles($nextMatches[1]);
                $listItems[] = '<li>' . $nextContent . '</li>';
            }
            $result[] = '<ul>' . implode('', $listItems) . '</ul>';
            continue;
        }
        
        // Ordered lists
        if (preg_match('/^\s*\d+\.\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $content = $applyInlineStyles($matches[1]);
            $listItems = ['<li>' . $content . '</li>'];
            
            // Check if next lines are also list items
            while ($i + 1 < count($lines) && preg_match('/^\s*\d+\.\s+(.+)$/', $lines[$i + 1], $nextMatches)) {
                $i++;
                $nextContent = $applyInlineStyles($nextMatches[1]);
                $listItems[] = '<li>' . $nextContent . '</li>';
            }
            $result[] = '<ol>' . implode('', $listItems) . '</ol>';
            continue;
        }
        
        // Tables - detect table rows (lines with | separators)
        if (preg_match('/^\s*\|.+\|\s*$/', $line)) {
            $flushParagraph();
            
            $tableRows = [];
            $hasHeaderSeparator = false;
            
            // Collect all consecutive table rows
            while ($i < count($lines) && preg_match('/^\s*\|.+\|\s*$/', $lines[$i])) {
                $currentLine = trim($lines[$i]);
                
                // Check if this is a header separator line (|---|---|)
                if (preg_match('/^\|[\s\-:|]+\|$/', $currentLine)) {
                    $hasHeaderSeparator = true;
                    $i++;
                    continue;
                }
                
                // Parse table cells
                $cells = array_map('trim', array_slice(explode('|', $currentLine), 1, -1));
                $tableRows[] = $cells;
                $i++;
            }
            $i--; // Adjust because the for loop will increment
            
            // Generate HTML table
            if (count($tableRows) > 0) {
                $tableHTML = '<table>';
                
                // Process rows
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
        
        // Regular text - add to current paragraph
        $currentParagraph[] = $line;
    }
    
    // Flush any remaining paragraph
    $flushParagraph();
    
    // Handle unclosed code block
    if ($inCodeBlock && count($codeBlockContent) > 0) {
        $codeContent = implode("\n", $codeBlockContent);
        $result[] = '<pre><code class="language-' . ($codeBlockLang ?: 'text') . '">' . $codeContent . '</code></pre>';
    }
    
    return implode("\n", $result);
}

$token = $_GET['token'] ?? '';
if (!$token) {
    http_response_code(400);
    echo 'Token missing';
    exit;
}

try {
    $stmt = $con->prepare('SELECT note_id, created FROM shared_notes WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo 'Shared note not found';
        exit;
    }

    $note_id = $row['note_id'];

    $stmt = $con->prepare('SELECT heading, entry, created, updated, type FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        http_response_code(404);
        echo 'Note not found';
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo 'Server error';
    exit;
}

// Render read-only page
// If a file was saved for this note, prefer using it so we preserve the exact content (images, formatting).
$htmlFile = getEntryFilename($note_id, $note['type'] ?? 'note');
$content = '';
if (is_readable($htmlFile)) {
    $content = file_get_contents($htmlFile);
} else {
    // Fallback to DB field if no file exists
    $content = $note['entry'] ?? '';
}

// If this is a tasklist type, try to parse the stored JSON and render a readable task list
if (isset($note['type']) && $note['type'] === 'tasklist') {
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $tasksHtml = '<div class="task-list-container">';
        $tasksHtml .= '<div class="tasks-list">';
        foreach ($decoded as $task) {
            $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES) : '';
            $completed = !empty($task['completed']) ? ' completed' : '';
            $checked = !empty($task['completed']) ? ' checked' : '';
            $tasksHtml .= '<div class="task-item'.$completed.'">';
            $tasksHtml .= '<input type="checkbox" disabled'.$checked.' /> ';
            $tasksHtml .= '<span class="task-text">'.$text.'</span>';
            $tasksHtml .= '</div>';
        }
        $tasksHtml .= '</div></div>';
        $content = $tasksHtml;
    } else {
        // If JSON parse fails, escape raw content
        $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
    }
}

// If this is a markdown type, parse the markdown content and render it as HTML
if (isset($note['type']) && $note['type'] === 'markdown') {
    // The content is raw markdown, we need to convert it to HTML
    $content = parseMarkdown($content);
}
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
// If the app is in a subdirectory, ensure the base includes the script dir
$scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
if ($scriptDir && $scriptDir !== '/') {
    $baseUrl .= $scriptDir;
}

// Replace src and href references that point to relative attachments path
$attachmentsRel = 'data/attachments/';
// Common patterns: src="data/attachments/..." or src='data/attachments/...' or src=/data/attachments/...
$content = preg_replace_callback('#(src|href)=(["\']?)(/?' . preg_quote($attachmentsRel, '#') . ')([^"\'\s>]+)(["\']?)#i', function($m) use ($baseUrl, $attachmentsRel) {
    $attr = $m[1];
    $quote = $m[2] ?: '';
    $path = $m[4];
    // Ensure no duplicate slashes
    $url = rtrim($baseUrl, '/') . '/' . ltrim($attachmentsRel, '/');
    $url = rtrim($url, '/') . '/' . ltrim($path, '/');
    return $attr . '=' . $quote . $url . $quote;
}, $content);

// Light sanitization: remove <script>...</script> blocks and inline event handlers (on*) to reduce XSS risk
$content = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $content);
$content = preg_replace_callback('#<([a-zA-Z0-9]+)([^>]*)>#', function($m) {
    $tag = $m[1];
    $attrs = $m[2];
    // Remove any on* attributes
    $cleanAttrs = preg_replace('/\s+on[a-zA-Z]+=(["\"][^"\\]*["\\"]|[^\s>]*)/i', '', $attrs);
    return '<' . $tag . $cleanAttrs . '>';
}, $content);

?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shared note - <?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></title>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/public_note.css?v=<?php echo filemtime(__DIR__ . '/css/public_note.css'); ?>">
    <link rel="stylesheet" href="css/tasks.css">
    <link rel="stylesheet" href="css/markdown.css?v=<?php echo filemtime(__DIR__ . '/css/markdown.css'); ?>">
</head>
<body>
    <div class="public-note">
    <h1><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></h1>
        <div class="content"><?php echo $content; ?></div>
    </div>
</body>
<script src="js/copy-code-on-focus.js"></script>
</html>