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
    
    // Extract and protect math equations (display mode: $$...$$)
    $protectedMathBlocks = [];
    $mathBlockIndex = 0;
    
    $text = preg_replace_callback('/\$\$(.+?)\$\$/s', function($matches) use (&$protectedMathBlocks, &$mathBlockIndex) {
        $math = trim($matches[1]);
        $placeholder = "\x00MATHBLOCK" . $mathBlockIndex . "\x00";
        // Store the raw math content to be processed after HTML escaping
        $protectedMathBlocks[$mathBlockIndex] = $math;
        $mathBlockIndex++;
        return "\n" . $placeholder . "\n";
    }, $text);
    
    // Extract and protect inline math equations ($...$)
    $protectedMathInline = [];
    $mathInlineIndex = 0;
    
    $text = preg_replace_callback('/(?<!\$)\$(?!\$)(.+?)\$/', function($matches) use (&$protectedMathInline, &$mathInlineIndex) {
        $math = trim($matches[1]);
        $placeholder = "\x00MATHINLINE" . $mathInlineIndex . "\x00";
        // Store the raw math content to be processed after HTML escaping
        $protectedMathInline[$mathInlineIndex] = $math;
        $mathInlineIndex++;
        return $placeholder;
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
    $applyInlineStyles = function($text) use (&$protectedElements, &$protectedMathInline) {
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
        $text = preg_replace('/&lt;(https?:\/\/[^>]+)&gt;/', '<a href="$1" target="_blank" rel="noopener">$1</a>', $text);
        
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
        
        // Restore protected inline math elements
        $text = preg_replace_callback('/\x00MATHINLINE(\d+)\x00/', function($matches) use ($protectedMathInline) {
            $index = (int)$matches[1];
            if (isset($protectedMathInline[$index])) {
                $mathContent = $protectedMathInline[$index];
                return '<span class="math-inline" data-math="' . htmlspecialchars($mathContent, ENT_QUOTES, 'UTF-8') . '"></span>';
            }
            return $matches[0];
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
        
        // Check if this line contains a protected math block placeholder
        if (preg_match('/\x00MATHBLOCK\d+\x00/', $line)) {
            $flushParagraph();
            // Restore the math block directly as HTML element
            $line = preg_replace_callback('/\x00MATHBLOCK(\d+)\x00/', function($matches) use ($protectedMathBlocks) {
                $index = (int)$matches[1];
                if (isset($protectedMathBlocks[$index])) {
                    $mathContent = $protectedMathBlocks[$index];
                    return '<span class="math-block" data-math="' . htmlspecialchars($mathContent, ENT_QUOTES, 'UTF-8') . '"></span>';
                }
                return $matches[0];
            }, $line);
            $result[] = $line;
            continue;
        }
        
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
        
        // Blockquotes - collect multi-line blockquotes
        if (preg_match('/^&gt;\s*(.*)$/', $line, $matches)) {
            $flushParagraph();
            $blockquoteLines = [];
            $blockquoteLines[] = $matches[1];

            // Continue collecting consecutive blockquote lines
            while ($i + 1 < count($lines) && preg_match('/^&gt;\s*(.*)$/', $lines[$i + 1], $nextMatch)) {
                $i++;
                $blockquoteLines[] = $nextMatch[1];
            }

            // Detect GitHub-style callouts (e.g. Note, Tip, Important, Warning, Caution)
            $firstLine = isset($blockquoteLines[0]) ? trim($blockquoteLines[0]) : '';
            $calloutType = null;
            $calloutRemainder = '';

            // Match callout keywords (optionally bolded, with optional separator and text after)
            if (preg_match('/^\s*(?:\*\*|__)?(Note|Tip|Important|Warning|Caution)(?:\*\*|__)?(?:[:\s\-]+(.*))?$/i', $firstLine, $lm)) {
                $calloutType = strtolower($lm[1]);
                $calloutRemainder = isset($lm[2]) ? trim($lm[2]) : '';
            }

            if ($calloutType) {
                // Build callout aside element
                $bodyLines = [];
                if ($calloutRemainder !== '') {
                    $bodyLines[] = $calloutRemainder;
                }
                // append remaining blockquote lines (after the title line)
                for ($bi = 1; $bi < count($blockquoteLines); $bi++) {
                    $bodyLines[] = $blockquoteLines[$bi];
                }

                // Use translation if available
                $defaultTitle = ucfirst($calloutType);
                if (function_exists('t')) {
                    $titleHtml = t('slash_menu.callout_' . $calloutType, [], $defaultTitle);
                } else {
                    $titleHtml = $defaultTitle;
                }
                $bodyHtml = implode('<br>', array_map(function($l) use ($applyInlineStyles) { return $applyInlineStyles($l); }, $bodyLines));

                // GitHub-style callout icons (matching the screenshot)
                switch ($calloutType) {
                    case 'note':
                        // Info icon (circle with i)
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
                        break;
                    case 'tip':
                        // Light bulb icon
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>';
                        break;
                    case 'important':
                        // Exclamation in circle icon
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.75v4.5a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"></path></svg>';
                        break;
                    case 'warning':
                        // Triangle with exclamation
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';
                        break;
                    case 'caution':
                        // Octagon with exclamation
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.75.75 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
                        break;
                    default:
                        $iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
                        break;
                }

                $result[] = '<aside class="callout callout-' . $calloutType . '">'
                         . '<div class="callout-title">' . $iconSvg . '<span class="callout-title-text">' . $applyInlineStyles($titleHtml) . '</span></div>'
                         . '<div class="callout-body">' . $bodyHtml . '</div>'
                         . '</aside>';
            } else {
                // Regular blockquote
                $content = implode('<br>', array_map(function($line) use ($applyInlineStyles) {
                    return $applyInlineStyles($line);
                }, $blockquoteLines));

                $result[] = '<blockquote>' . $content . '</blockquote>';
            }
            continue;
        }
        
        // Helper function to parse nested lists
        $parseNestedList = function($startIndex, $isTaskList = false, $expectedMarker = null) use (&$lines, $applyInlineStyles, &$parseNestedList) {
            $listItems = [];
            $currentIndex = $startIndex;
            $baseIndent = null;
            $baseMarkerType = null; // 'bullet' or 'number'
            
            while ($currentIndex < count($lines)) {
                $currentLine = $lines[$currentIndex];
                
                // Check if this is a list item
                if ($isTaskList) {
                    $listMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $currentLine, $matches);
                    $marker = null;
                    $markerType = null;
                } else {
                    $listMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $currentLine, $matches);
                    $marker = isset($matches[2]) ? $matches[2] : null;
                    // Determine marker type: number (1.) or bullet (-, *, +)
                    $markerType = ($marker && preg_match('/\d+\./', $marker)) ? 'number' : 'bullet';
                }
                
                if (!$listMatch) {
                    break; // Not a list item, end of list
                }
                
                $indent = strlen($matches[1]);
                $content = $isTaskList ? $matches[3] : $matches[3];
                
                // If this is the first item, set the base indentation and marker type
                if ($baseIndent === null) {
                    $baseIndent = $indent;
                    $baseMarkerType = $markerType;
                }
                
                // If marker type changed at SAME indentation level at root (indent=0),
                // treat it as nested under the last item (Poznote-specific behavior)
                if (!$isTaskList && $indent === 0 && $baseIndent === 0 && 
                    $markerType !== $baseMarkerType && count($listItems) > 0) {
                    // Collect all consecutive items with this different marker type
                    $nestedItems = [];
                    $nestedListTag = ($markerType === 'number') ? 'ol' : 'ul';
                    $tempIndex = $currentIndex;
                    
                    while ($tempIndex < count($lines)) {
                        $tempLine = $lines[$tempIndex];
                        if (!preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $tempLine, $tempMatches)) {
                            break;
                        }
                        $tempIndent = strlen($tempMatches[1]);
                        $tempMarker = $tempMatches[2];
                        $tempMarkerType = preg_match('/\d+\./', $tempMarker) ? 'number' : 'bullet';
                        
                        // Stop if we're back to the base marker type or different indentation
                        if ($tempIndent !== 0 || $tempMarkerType !== $markerType) {
                            break;
                        }
                        
                        $nestedItems[] = '<li>' . $applyInlineStyles($tempMatches[3]) . '</li>';
                        $tempIndex++;
                    }
                    
                    // Add nested list to last item
                    if (count($nestedItems) > 0) {
                        $lastIdx = count($listItems) - 1;
                        $listItems[$lastIdx] = preg_replace('/<\/li>$/', '', $listItems[$lastIdx]);
                        $listItems[$lastIdx] .= '<' . $nestedListTag . '>' . implode('', $nestedItems) . '</' . $nestedListTag . '></li>';
                        $currentIndex = $tempIndex;
                        continue;
                    }
                }
                
                // If marker type changed at SAME indentation level (non-root), this is a different list
                if (!$isTaskList && $indent === $baseIndent && $markerType !== $baseMarkerType) {
                    break; // Different list type at same level
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
