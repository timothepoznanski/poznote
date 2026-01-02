<?php
/**
 * API Endpoint: Convert Note Type
 * Converts a note between markdown and HTML formats
 * 
 * Parameters:
 * - id: Note ID (required)
 * - target: Target type - 'html' or 'markdown' (required)
 * 
 * Returns:
 * - JSON with success status
 */

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

// Check authentication
requireApiAuth();

header('Content-Type: application/json');

// Only accept POST requests
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

// Get parameters
$noteId = isset($_POST['id']) ? intval($_POST['id']) : 0;
$targetType = isset($_POST['target']) ? strtolower(trim($_POST['target'])) : '';

// Validate parameters
if (!$noteId) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Note ID is required']);
    exit;
}

if (!in_array($targetType, ['html', 'markdown'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid target type. Use "html" or "markdown"']);
    exit;
}

try {
    // Fetch note from database
    $stmt = $con->prepare('SELECT id, heading, type, attachments, folder_id FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note not found']);
        exit;
    }
    
    $currentType = $note['type'] ?? 'note';
    
    // Validate conversion is possible
    if ($targetType === 'html' && $currentType !== 'markdown') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Only markdown notes can be converted to HTML']);
        exit;
    }
    
    if ($targetType === 'markdown' && !in_array($currentType, ['note', 'html'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Only HTML notes can be converted to markdown']);
        exit;
    }
    
    // Get current file path
    $currentFilePath = getEntryFilename($noteId, $currentType);
    
    if (!file_exists($currentFilePath) || !is_readable($currentFilePath)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Note file not found']);
        exit;
    }
    
    $content = file_get_contents($currentFilePath);
    if ($content === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cannot read note file']);
        exit;
    }
    
    // Perform conversion
    if ($targetType === 'html') {
        // Markdown to HTML
        $newContent = convertMarkdownToHtml($content);
        $newType = 'note';
        
        // Remove embedded images from attachments list
        $newAttachments = removeEmbeddedImagesFromAttachments($content, $note['attachments'], $con);
    } else {
        // HTML to Markdown
        $newContent = convertHtmlToMarkdown($content, $noteId, $note['attachments'], $con);
        $newType = 'markdown';
        $newAttachments = $note['attachments']; // Keep attachments for HTML to MD
    }
    
    // Determine new file path
    $newFilePath = getEntryFilename($noteId, $newType);
    
    // Write new file
    if (file_put_contents($newFilePath, $newContent) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to write converted note']);
        exit;
    }
    
    // Update database with new type and attachments
    $stmt = $con->prepare('UPDATE entries SET type = ?, attachments = ?, updated = ? WHERE id = ?');
    $stmt->execute([$newType, $newAttachments, gmdate('Y-m-d H:i:s'), $noteId]);
    
    // Delete old file if different from new file
    if ($currentFilePath !== $newFilePath && file_exists($currentFilePath)) {
        unlink($currentFilePath);
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Note converted successfully',
        'newType' => $newType
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Conversion failed: ' . $e->getMessage()]);
}

/**
 * Remove embedded images from attachments list
 * When converting markdown to HTML, images are embedded in base64,
 * so they should be removed from the attachments list
 */
function removeEmbeddedImagesFromAttachments($markdownContent, $attachmentsJson, $con) {
    if (empty($attachmentsJson)) {
        return $attachmentsJson;
    }
    
    $attachments = json_decode($attachmentsJson, true);
    if (!is_array($attachments) || empty($attachments)) {
        return $attachmentsJson;
    }
    
    // Extract all image URLs from markdown
    $imageUrls = [];
    preg_match_all('/!\[([^\]]*)\]\(([^\)]+?)(?:\s+"([^"]+)")?\)/', $markdownContent, $matches, PREG_SET_ORDER);
    
    foreach ($matches as $match) {
        $url = trim($match[2]);
        $imageUrls[] = $url;
    }
    
    if (empty($imageUrls)) {
        return $attachmentsJson;
    }
    
    // Build list of attachment IDs to remove
    $idsToRemove = [];
    
    foreach ($imageUrls as $url) {
        // Decode HTML entities
        $url = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        // Case 1: api_attachments.php?attachment_id=XXX
        if (stripos($url, 'api_attachments.php') !== false) {
            $parts = parse_url($url);
            $queryString = $parts['query'] ?? '';
            $params = [];
            parse_str($queryString, $params);
            
            $attachmentId = isset($params['attachment_id']) ? (string)$params['attachment_id'] : '';
            if ($attachmentId !== '') {
                $idsToRemove[] = $attachmentId;
            }
        }
        // Case 2: Direct filename or path reference
        else {
            $cleanPath = preg_replace('/^\.\.?\//', '', $url);
            if (strpos($cleanPath, 'data/attachments/') === 0) {
                $cleanPath = substr($cleanPath, strlen('data/attachments/'));
            } elseif (strpos($cleanPath, 'attachments/') === 0) {
                $cleanPath = substr($cleanPath, strlen('attachments/'));
            }
            
            // Find attachment with matching filename
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename']) && $attachment['filename'] === $cleanPath) {
                    if (isset($attachment['id'])) {
                        $idsToRemove[] = (string)$attachment['id'];
                    }
                }
            }
        }
    }
    
    // Remove attachments with matching IDs
    $newAttachments = [];
    foreach ($attachments as $attachment) {
        if (!isset($attachment['id']) || !in_array((string)$attachment['id'], $idsToRemove, true)) {
            $newAttachments[] = $attachment;
        }
    }
    
    return json_encode($newAttachments);
}

/**
 * Convert Markdown content to HTML
 * Uses the same parser as api_export_note.php for consistency
 */
function convertMarkdownToHtml($markdown) {
    global $con;
    // Convert with embedded images (base64)
    return parseMarkdownToHtmlForConversion($markdown, true, $con);
}

/**
 * Convert local image path to base64 data URI
 * Same logic as api_export_note.php
 */
function convertImageToBase64ForConversion($imagePath, $con) {
    // Only convert local attachment images, not external URLs
    if (preg_match('/^https?:\/\//i', $imagePath)) {
        return $imagePath;
    }
    
    $attachmentsPath = getAttachmentsPath();
    $fullPath = null;
    
    // Decode HTML entities first (in case URL is already escaped)
    $imagePath = html_entity_decode($imagePath, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Case 1: api_attachments.php?action=download&note_id=X&attachment_id=Y
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
        $cleanPath = preg_replace('/^\.\.?\//', '', $imagePath);
        
        if (strpos($cleanPath, 'data/attachments/') === 0) {
            $cleanPath = substr($cleanPath, strlen('data/attachments/'));
        } elseif (strpos($cleanPath, 'attachments/') === 0) {
            $cleanPath = substr($cleanPath, strlen('attachments/'));
        }
        
        $fullPath = $attachmentsPath . '/' . $cleanPath;
    }
    
    if (!$fullPath) {
        return $imagePath;
    }
    
    $realPath = realpath($fullPath);
    $expectedDir = realpath($attachmentsPath);
    
    if ($realPath === false || $expectedDir === false || strpos($realPath, $expectedDir) !== 0) {
        return $imagePath;
    }
    
    if (!file_exists($realPath) || !is_readable($realPath)) {
        return $imagePath;
    }
    
    $imageData = file_get_contents($realPath);
    if ($imageData === false) {
        return $imagePath;
    }
    
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $realPath);
    finfo_close($finfo);
    
    $base64 = base64_encode($imageData);
    return 'data:' . $mimeType . ';base64,' . $base64;
}

/**
 * Markdown to HTML parser (same logic as api_export_note.php)
 * 
 * @param string $text The markdown text
 * @param bool $embedImages Whether to convert images to base64
 * @param PDO $con Database connection for image lookup
 */
function parseMarkdownToHtmlForConversion($text, $embedImages = false, $con = null) {
    if (!$text) return '';
    
    // First, extract and protect images and links from HTML escaping
    $protectedElements = [];
    $protectedIndex = 0;
    
    // Protect images first ![alt](url "title")
    $text = preg_replace_callback('/!\[([^\]]*)\]\(([^\)]+?)(?:\s+"([^"]+)")?\)/', function($matches) use (&$protectedElements, &$protectedIndex, $embedImages, $con) {
        $alt = $matches[1];
        $url = trim($matches[2]);
        $title = isset($matches[3]) ? $matches[3] : '';
        
        // Convert to base64 if requested
        if ($embedImages && $con) {
            $url = convertImageToBase64ForConversion($url, $con);
        }
        
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
    
    // Helper function to apply inline styles
    $applyInlineStyles = function($text) use (&$protectedElements) {
        // Protect inline code
        $protectedCode = [];
        $codeIndex = 0;
        $text = preg_replace_callback('/`([^`]+)`/', function($matches) use (&$protectedCode, &$codeIndex) {
            $placeholder = "\x00CODE" . $codeIndex . "\x00";
            $protectedCode[$codeIndex] = '<code>' . $matches[1] . '</code>';
            $codeIndex++;
            return $placeholder;
        }, $text);
        
        // Bold and italic
        $text = preg_replace('/\*\*\*([^\*]+)\*\*\*/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/___([^_]+)___/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/\*\*([^\*]+)\*\*/', '<strong>$1</strong>', $text);
        $text = preg_replace('/__([^_]+)__/', '<strong>$1</strong>', $text);
        $text = preg_replace('/\*([^\*]+)\*/', '<em>$1</em>', $text);
        $text = preg_replace('/_([^_]+)_/', '<em>$1</em>', $text);
        
        // Strikethrough
        $text = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $text);
        
        // Restore protected code
        $text = preg_replace_callback('/\x00CODE(\d+)\x00/', function($matches) use ($protectedCode) {
            $index = (int)$matches[1];
            return isset($protectedCode[$index]) ? $protectedCode[$index] : $matches[0];
        }, $text);
        
        // Restore protected elements
        $text = preg_replace_callback('/\x00P(IMG|LNK)(\d+)\x00/', function($matches) use ($protectedElements) {
            $index = (int)$matches[2];
            return isset($protectedElements[$index]) ? $protectedElements[$index] : $matches[0];
        }, $text);
        
        return $text;
    };
    
    // Process line by line
    $lines = explode("\n", $html);
    $result = [];
    $currentParagraph = [];
    $inCodeBlock = false;
    $codeBlockContent = [];
    
    $flushParagraph = function() use (&$currentParagraph, &$result, $applyInlineStyles) {
        if (count($currentParagraph) > 0) {
            $para = implode('<br>', $currentParagraph);
            $para = $applyInlineStyles($para);
            $result[] = '<p>' . $para . '</p>';
            $currentParagraph = [];
        }
    };
    
    for ($i = 0; $i < count($lines); $i++) {
        $line = $lines[$i];
        
        // Code blocks
        if (preg_match('/^```/', $line)) {
            if (!$inCodeBlock) {
                $flushParagraph();
                $inCodeBlock = true;
                $codeBlockContent = [];
            } else {
                $result[] = '<pre><code>' . implode("\n", $codeBlockContent) . '</code></pre>';
                $inCodeBlock = false;
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
            $headerText = $applyInlineStyles($matches[2]);
            $result[] = '<h' . $level . '>' . $headerText . '</h' . $level . '>';
            continue;
        }
        
        // Blockquotes
        if (preg_match('/^&gt;\s*(.*)$/', $line, $matches)) {
            $flushParagraph();
            $quoteText = $applyInlineStyles($matches[1]);
            $result[] = '<blockquote>' . $quoteText . '</blockquote>';
            continue;
        }
        
        // Horizontal rule
        if (preg_match('/^(-{3,}|\*{3,}|_{3,})$/', trim($line))) {
            $flushParagraph();
            $result[] = '<hr>';
            continue;
        }
        
        // Unordered lists
        if (preg_match('/^[\*\-\+]\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $listItems = [];
            while ($i < count($lines) && preg_match('/^[\*\-\+]\s+(.+)$/', $lines[$i], $m)) {
                $listItems[] = '<li>' . $applyInlineStyles($m[1]) . '</li>';
                $i++;
            }
            $i--;
            $result[] = '<ul>' . implode('', $listItems) . '</ul>';
            continue;
        }
        
        // Ordered lists
        if (preg_match('/^\d+\.\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $listItems = [];
            while ($i < count($lines) && preg_match('/^\d+\.\s+(.+)$/', $lines[$i], $m)) {
                $listItems[] = '<li>' . $applyInlineStyles($m[1]) . '</li>';
                $i++;
            }
            $i--;
            $result[] = '<ol>' . implode('', $listItems) . '</ol>';
            continue;
        }
        
        // Regular text
        $currentParagraph[] = $line;
    }
    
    // Flush remaining
    $flushParagraph();
    
    // Handle unclosed code block
    if ($inCodeBlock && count($codeBlockContent) > 0) {
        $result[] = '<pre><code>' . implode("\n", $codeBlockContent) . '</code></pre>';
    }
    
    return implode("\n", $result);
}

/**
 * Convert HTML content to Markdown
 * Also handles embedded base64 images by saving them as attachments
 */
function convertHtmlToMarkdown($html, $noteId, $existingAttachmentsJson, $con) {
    $markdown = $html;
    
    // Parse existing attachments
    $attachments = $existingAttachmentsJson ? json_decode($existingAttachmentsJson, true) : [];
    if (!is_array($attachments)) {
        $attachments = [];
    }
    
    $attachmentsPath = getAttachmentsPath();
    
    // Convert embedded base64 images to attachments
    $markdown = preg_replace_callback(
        '/<img[^>]+src=["\']data:image\/([^;]+);base64,([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*>/i',
        function($matches) use ($noteId, &$attachments, $attachmentsPath, $con) {
            $imageType = $matches[1];
            $base64Data = $matches[2];
            $alt = isset($matches[3]) ? $matches[3] : 'image';
            
            // Generate unique filename
            $extension = $imageType === 'jpeg' ? 'jpg' : $imageType;
            $attachmentId = uniqid();
            $filename = $attachmentId . '.' . $extension;
            $originalFilename = ($alt && $alt !== 'image') ? $alt . '.' . $extension : 'image_' . $attachmentId . '.' . $extension;
            
            // Decode and save image
            $imageData = base64_decode($base64Data);
            if ($imageData !== false) {
                $filePath = $attachmentsPath . '/' . $filename;
                if (file_put_contents($filePath, $imageData) !== false) {
                    // Add to attachments array
                    $attachments[] = [
                        'id' => $attachmentId,
                        'filename' => $filename,
                        'original_filename' => $originalFilename,
                        'file_size' => strlen($imageData),
                        'file_type' => 'image/' . $imageType,
                        'uploaded_at' => date('Y-m-d H:i:s')
                    ];
                    
                    // Return markdown image syntax
                    return '![' . $alt . '](api_attachments.php?action=download&note_id=' . $noteId . '&attachment_id=' . $attachmentId . ')';
                }
            }
            
            // If conversion failed, just use alt text
            return $alt ? "[$alt]" : '';
        },
        $markdown
    );
    
    // Convert regular img tags to markdown
    $markdown = preg_replace_callback(
        '/<img[^>]+src=["\']([^"\']+)["\'][^>]*(?:alt=["\']([^"\']*)["\'])?[^>]*>/i',
        function($matches) {
            $src = $matches[1];
            $alt = isset($matches[2]) ? $matches[2] : '';
            return '![' . $alt . '](' . $src . ')';
        },
        $markdown
    );
    
    // Convert links
    $markdown = preg_replace_callback(
        '/<a[^>]+href=["\']([^"\']+)["\'][^>]*>([^<]+)<\/a>/i',
        function($matches) {
            return '[' . $matches[2] . '](' . $matches[1] . ')';
        },
        $markdown
    );
    
    // Convert headers
    $markdown = preg_replace('/<h1[^>]*>([^<]+)<\/h1>/i', '# $1', $markdown);
    $markdown = preg_replace('/<h2[^>]*>([^<]+)<\/h2>/i', '## $1', $markdown);
    $markdown = preg_replace('/<h3[^>]*>([^<]+)<\/h3>/i', '### $1', $markdown);
    $markdown = preg_replace('/<h4[^>]*>([^<]+)<\/h4>/i', '#### $1', $markdown);
    $markdown = preg_replace('/<h5[^>]*>([^<]+)<\/h5>/i', '##### $1', $markdown);
    $markdown = preg_replace('/<h6[^>]*>([^<]+)<\/h6>/i', '###### $1', $markdown);
    
    // Convert bold and italic
    $markdown = preg_replace('/<strong>([^<]+)<\/strong>/i', '**$1**', $markdown);
    $markdown = preg_replace('/<b>([^<]+)<\/b>/i', '**$1**', $markdown);
    $markdown = preg_replace('/<em>([^<]+)<\/em>/i', '*$1*', $markdown);
    $markdown = preg_replace('/<i>([^<]+)<\/i>/i', '*$1*', $markdown);
    
    // Convert code
    $markdown = preg_replace('/<pre><code>([^<]+)<\/code><\/pre>/is', "```\n$1\n```", $markdown);
    $markdown = preg_replace('/<code>([^<]+)<\/code>/i', '`$1`', $markdown);
    
    // Convert blockquotes
    $markdown = preg_replace_callback(
        '/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i',
        function($matches) {
            $lines = explode("\n", strip_tags($matches[1]));
            return implode("\n", array_map(function($line) {
                return '> ' . trim($line);
            }, $lines));
        },
        $markdown
    );
    
    // Convert lists
    $markdown = preg_replace_callback(
        '/<ul[^>]*>([\s\S]*?)<\/ul>/i',
        function($matches) {
            return preg_replace('/<li[^>]*>([^<]+)<\/li>/i', '- $1', $matches[1]);
        },
        $markdown
    );
    
    $markdown = preg_replace_callback(
        '/<ol[^>]*>([\s\S]*?)<\/ol>/i',
        function($matches) {
            $counter = 0;
            return preg_replace_callback('/<li[^>]*>([^<]+)<\/li>/i', function($m) use (&$counter) {
                $counter++;
                return $counter . '. ' . $m[1];
            }, $matches[1]);
        },
        $markdown
    );
    
    // Convert line breaks and paragraphs
    $markdown = preg_replace('/<br\s*\/?>/i', "\n", $markdown);
    $markdown = preg_replace('/<\/p>\s*<p>/i', "\n\n", $markdown);
    $markdown = preg_replace('/<\/?p[^>]*>/i', '', $markdown);
    
    // Remove remaining HTML tags
    $markdown = preg_replace('/<div[^>]*>/i', '', $markdown);
    $markdown = preg_replace('/<\/div>/i', "\n", $markdown);
    $markdown = strip_tags($markdown);
    
    // Decode HTML entities
    $markdown = html_entity_decode($markdown, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Clean up whitespace
    $markdown = preg_replace('/\n{3,}/', "\n\n", $markdown);
    $markdown = trim($markdown);
    
    // Update attachments in database if new ones were added
    if (!empty($attachments)) {
        $attachmentsJson = json_encode($attachments);
        $stmt = $con->prepare('UPDATE entries SET attachments = ? WHERE id = ?');
        $stmt->execute([$attachmentsJson, $noteId]);
    }
    
    return $markdown;
}
