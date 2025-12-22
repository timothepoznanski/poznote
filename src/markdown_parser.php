<?php
/**
 * Simple markdown to HTML parser for Poznote
 * Extracted from public_note.php for reusability
 */

/**
 * Parse markdown content and convert it to HTML
 * 
 * @param string $text Markdown content
 * @return string HTML content
 */
function parseMarkdown($text) {
    if (!$text) return '';
    
    // First, extract and protect code blocks from HTML escaping
    $protectedCodeBlocks = [];
    $codeBlockIndex = 0;
    
    $text = preg_replace_callback('/```([^\n]*)\n(.*?)```/s', function($matches) use (&$protectedCodeBlocks, &$codeBlockIndex) {
        $lang = trim($matches[1]);
        $code = $matches[2];
        $placeholder = "\x00CODEBLOCK" . $codeBlockIndex . "\x00";
        
        if (strtolower($lang) === 'mermaid') {
            // Mermaid code stays unescaped
            $protectedCodeBlocks[$codeBlockIndex] = '<div class="mermaid">' . $code . '</div>';
        } else {
            // Escape HTML in code blocks so it displays as text
            $escapedCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
            // Don't use class="language-xxx" to avoid triggering syntax highlighting
            $protectedCodeBlocks[$codeBlockIndex] = '<pre><code>' . $escapedCode . '</code></pre>';
        }
        $codeBlockIndex++;
        return "\n" . $placeholder . "\n";
    }, $text);
    
    // Extract and protect images and links from HTML escaping
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
        
        // Check if this line contains a protected code block placeholder
        if (preg_match('/\x00CODEBLOCK\d+\x00/', $line)) {
            $flushParagraph();
            // Restore the code block directly
            $line = preg_replace_callback('/\x00CODEBLOCK(\d+)\x00/', function($matches) use ($protectedCodeBlocks) {
                $index = (int)$matches[1];
                return isset($protectedCodeBlocks[$index]) ? $protectedCodeBlocks[$index] : $matches[0];
            }, $line);
            $result[] = $line;
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
        
        // Helper function to parse nested lists
        $parseNestedList = function($startIndex, $isTaskList = false) use (&$lines, $applyInlineStyles, &$parseNestedList) {
            $listItems = [];
            $currentIndex = $startIndex;
            $baseIndent = null;
            
            while ($currentIndex < count($lines)) {
                $currentLine = $lines[$currentIndex];
                
                // Check if this is a list item
                if ($isTaskList) {
                    $listMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $currentLine, $matches);
                } else {
                    $listMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $currentLine, $matches);
                }
                
                if (!$listMatch) {
                    break; // Not a list item, end of list
                }
                
                $indent = strlen($matches[1]);
                $content = $isTaskList ? $matches[3] : $matches[3];
                
                // If this is the first item, set the base indentation
                if ($baseIndent === null) {
                    $baseIndent = $indent;
                }
                
                if ($indent === $baseIndent) {
                    // Same level item
                    if ($isTaskList) {
                        $isChecked = strtolower($matches[2]) === 'x';
                        $checkbox = '<input type="checkbox" ' . ($isChecked ? 'checked ' : '') . 'disabled>';
                        $itemHtml = '<li class="task-list-item">' . $checkbox . ' <span>' . $applyInlineStyles($content) . '</span>';
                    } else {
                        $itemHtml = '<li>' . $applyInlineStyles($content);
                    }
                    
                    // Check if next items are more indented (nested)
                    $nextIndex = $currentIndex + 1;
                    if ($nextIndex < count($lines)) {
                        $nextLine = $lines[$nextIndex];
                        if ($isTaskList) {
                            $nextMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $nextLine, $nextMatches);
                        } else {
                            $nextMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $nextLine, $nextMatches);
                        }
                        
                        if ($nextMatch && strlen($nextMatches[1]) > $indent) {
                            // Parse nested list recursively
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
                    // Less indented, end of current list
                    break;
                } else {
                    // This shouldn't happen if we're parsing correctly
                    break;
                }
                
                $currentIndex++;
            }
            
            return [
                'items' => $listItems,
                'endIndex' => $currentIndex - 1
            ];
        };
        
        // Task lists (checkboxes) - must be checked before unordered lists
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
    
    return implode("\n", $result);
}
