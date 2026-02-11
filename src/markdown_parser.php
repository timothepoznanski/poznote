<?php
/**
 * Simple markdown to HTML parser for Poznote
 * Extracted from public_note.php for reusability
 */

/**
 * Helper function: Sanitize HTML tag attributes
 * Only keeps safe attributes and escapes their values
 * 
 * @param string $attrs Raw attributes string
 * @param array $allowedAttrs List of allowed attribute names
 * @param array $booleanAttrs List of boolean attribute names (e.g., 'controls', 'muted')
 * @return string Safe attributes string ready for HTML
 */
function sanitizeAttributes($attrs, $allowedAttrs, $booleanAttrs = []) {
    $safeAttrs = [];
    
    // Extract and sanitize individual attributes
    preg_match_all('/(\w+)\s*=\s*["\']([^"\']*)["\']/', $attrs, $attrMatches, PREG_SET_ORDER);
    foreach ($attrMatches as $attr) {
        $attrName = strtolower($attr[1]);
        $attrValue = $attr[2];
        
        // Only allow safe attributes
        if (in_array($attrName, $allowedAttrs)) {
            $safeAttrs[] = $attrName . '="' . htmlspecialchars($attrValue, ENT_QUOTES, 'UTF-8') . '"';
        }
    }
    
    // Handle boolean attributes (e.g., controls, muted, allowfullscreen)
    foreach ($booleanAttrs as $boolAttr) {
        if (stripos($attrs, $boolAttr) !== false && !in_array($boolAttr, array_map(function($a) { return explode('=', $a)[0]; }, $safeAttrs))) {
            $safeAttrs[] = $boolAttr;
        }
    }
    
    return implode(' ', $safeAttrs);
}

/**
 * Parse markdown content and convert it to HTML
 * 
 * @param string $text Markdown content
 * @return string HTML content
 */
function parseMarkdown($text) {
    if (!$text) return '';
    
    // STEP 1: Extract and protect code blocks from HTML escaping
    $protectedCodeBlocks = [];
    $codeBlockIndex = 0;
    
    $text = preg_replace_callback('/```([^\n]*)\n(.*?)```/s', function($matches) use (&$protectedCodeBlocks, &$codeBlockIndex) {
        $lang = trim($matches[1]);
        $code = $matches[2];
        $placeholder = "\x00CODEBLOCK" . $codeBlockIndex . "\x00";
        
        if (strtolower($lang) === 'mermaid') {
            // Mermaid diagrams stay unescaped for rendering
            $protectedCodeBlocks[$codeBlockIndex] = '<div class="mermaid">' . $code . '</div>';
        } else {
            // Escape HTML in code blocks so it displays as text
            $escapedCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
            $protectedCodeBlocks[$codeBlockIndex] = '<pre><code>' . $escapedCode . '</code></pre>';
        }
        $codeBlockIndex++;
        return "\n" . $placeholder . "\n";
    }, $text);
    
    // STEP 2: Extract and protect math equations (display mode: $$...$$)
    $protectedMathBlocks = [];
    $mathBlockIndex = 0;
    
    $text = preg_replace_callback('/\$\$(.+?)\$\$/s', function($matches) use (&$protectedMathBlocks, &$mathBlockIndex) {
        $math = trim($matches[1]);
        $placeholder = "\x00MATHBLOCK" . $mathBlockIndex . "\x00";
        $protectedMathBlocks[$mathBlockIndex] = $math;
        $mathBlockIndex++;
        return "\n" . $placeholder . "\n";
    }, $text);
    
    // STEP 3: Extract and protect inline math equations ($...$)
    $protectedMathInline = [];
    $mathInlineIndex = 0;
    
    $text = preg_replace_callback('/(?<!\$)\$(?!\$)(.+?)\$/', function($matches) use (&$protectedMathInline, &$mathInlineIndex) {
        $math = trim($matches[1]);
        $placeholder = "\x00MATHINLINE" . $mathInlineIndex . "\x00";
        $protectedMathInline[$mathInlineIndex] = $math;
        $mathInlineIndex++;
        return $placeholder;
    }, $text);
    
    // STEP 4: Extract and protect images, links, and HTML elements from escaping
    $protectedElements = [];
    $protectedIndex = 0;
    
    // Protect images first: ![alt](url "title")
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
    
    // Protect inline span tags with style attributes (for colors, backgrounds, etc.)
    // Match: <span style="...">content</span>
    $text = preg_replace_callback('/<span\s+style="([^"]+)">([^<]*)<\/span>/i', function($matches) use (&$protectedElements, &$protectedIndex) {
        $styleAttr = $matches[1];
        $content = $matches[2];
        $placeholder = "\x00PSPAN" . $protectedIndex . "\x00";
        $spanTag = '<span style="' . htmlspecialchars($styleAttr, ENT_QUOTES, 'UTF-8') . '">' . htmlspecialchars($content, ENT_QUOTES, 'UTF-8') . '</span>';
        $protectedElements[$protectedIndex] = $spanTag;
        $protectedIndex++;
        return $placeholder;
    }, $text);

    // Protect details and summary tags
    $text = preg_replace_callback('/<(details|summary)([^>]*)>/i', function($matches) use (&$protectedElements, &$protectedIndex) {
        $tag = $matches[1];
        $attrs = $matches[2];
        $placeholder = "\x00PTAG" . $protectedIndex . "\x00";
        $protectedElements[$protectedIndex] = '<' . $tag . $attrs . '>';
        $protectedIndex++;
        return $placeholder;
    }, $text);

    $text = preg_replace_callback('/<\/(details|summary)>/i', function($matches) use (&$protectedElements, &$protectedIndex) {
        $tag = $matches[1];
        $placeholder = "\x00PTAG" . $protectedIndex . "\x00";
        $protectedElements[$protectedIndex] = '</' . $tag . '>';
        $protectedIndex++;
        return $placeholder;
    }, $text);

    // Protect iframe tags (for YouTube, Vimeo, and other embeds)
    // Only allow iframes from trusted sources for security
    $text = preg_replace_callback('/<iframe\s+([^>]+)>\s*<\/iframe>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
        $attrs = $matches[1];
        
        // Extract src attribute to validate the source
        if (preg_match('/src\s*=\s*["\']([^"\']+)["\']/i', $attrs, $srcMatch)) {
            $src = $srcMatch[1];
            
            // Use centralized whitelist from functions.php (ALLOWED_IFRAME_DOMAINS constant)
            $allowedDomains = defined('ALLOWED_IFRAME_DOMAINS') ? ALLOWED_IFRAME_DOMAINS : [
                'youtube.com', 'www.youtube.com',
                'youtube-nocookie.com', 'www.youtube-nocookie.com',
            ];
            
            // Check if the src matches any allowed domain
            $isAllowed = false;
            foreach ($allowedDomains as $domain) {
                if (stripos($src, '//' . $domain) !== false || stripos($src, '.' . $domain) !== false) {
                    $isAllowed = true;
                    break;
                }
            }
            
            if ($isAllowed) {
                $placeholder = "\x00PIFRAME" . $protectedIndex . "\x00";
                // Sanitize attributes: only allow safe attributes
                $safeAttrs = [];
                
                // Extract and sanitize individual attributes
                preg_match_all('/(\w+)\s*=\s*["\']([^"\']*)["\']/', $attrs, $attrMatches, PREG_SET_ORDER);
                foreach ($attrMatches as $attr) {
                    $attrName = strtolower($attr[1]);
                    $attrValue = $attr[2];
                    
                    // Only allow safe attributes
                    if (in_array($attrName, ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'loading', 'referrerpolicy', 'sandbox', 'style', 'class'])) {
                        $safeAttrs[] = $attrName . '="' . htmlspecialchars($attrValue, ENT_QUOTES, 'UTF-8') . '"';
                    }
                }
                
                // Handle boolean attributes like allowfullscreen
                if (stripos($attrs, 'allowfullscreen') !== false && !in_array('allowfullscreen', array_map(function($a) { return explode('=', $a)[0]; }, $safeAttrs))) {
                    $safeAttrs[] = 'allowfullscreen';
                }
                
                $iframeTag = '<iframe ' . implode(' ', $safeAttrs) . '></iframe>';
                $protectedElements[$protectedIndex] = $iframeTag;
                $protectedIndex++;
                return $placeholder;
            }
        }
        
        // If not allowed, return the original (will be escaped)
        return $matches[0];
    }, $text);

    // Protect video tags (for MP4 embeds and other video formats)
    $text = preg_replace_callback('/<video\s+([^>]*)>\s*<\/video>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
        $attrs = $matches[1];
        $placeholder = "\x00PVIDEO" . $protectedIndex . "\x00";
        
        $allowedAttrs = ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'];
        $booleanAttrs = ['controls', 'muted', 'playsinline', 'loop', 'autoplay'];
        $safeAttrsString = sanitizeAttributes($attrs, $allowedAttrs, $booleanAttrs);
        
        $videoTag = '<video ' . $safeAttrsString . '></video>';
        $protectedElements[$protectedIndex] = $videoTag;
        $protectedIndex++;
        return $placeholder;
    }, $text);

    // Protect audio tags (for MP3, WAV, and other audio formats)
    $text = preg_replace_callback('/<audio\s+([^>]*)>\s*<\/audio>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
        $attrs = $matches[1];
        $placeholder = "\x00PAUDIO" . $protectedIndex . "\x00";

        $allowedAttrs = ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'];
        $booleanAttrs = ['controls', 'muted', 'loop', 'autoplay'];
        $safeAttrsString = sanitizeAttributes($attrs, $allowedAttrs, $booleanAttrs);

        $audioTag = '<audio ' . $safeAttrsString . '></audio>';
        $protectedElements[$protectedIndex] = $audioTag;
        $protectedIndex++;
        return $placeholder;
    }, $text);
    
    // STEP 5: Escape HTML to prevent XSS attacks
    $html = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    
    // STEP 6: Process inline markdown styles (bold, italic, code, etc.)
    // This helper applies inline formatting after HTML escaping
    $applyInlineStyles = function($text) use (&$protectedElements, &$protectedMathInline) {
        // Protect inline code from other formatting
        $protectedCode = [];
        $codeIndex = 0;
        $text = preg_replace_callback('/`([^`]+)`/', function($matches) use (&$protectedCode, &$codeIndex) {
            $placeholder = "\x00CODE" . $codeIndex . "\x00";
            $protectedCode[$codeIndex] = '<code>' . $matches[1] . '</code>';
            $codeIndex++;
            return $placeholder;
        }, $text);
        
        // Auto-link URLs in angle brackets: <https://example.com>
        $text = preg_replace('/&lt;(https?:\/\/[^>]+)&gt;/', '<a href="$1" target="_blank" rel="noopener">$1</a>', $text);
        
        // Bold and italic (order matters: do *** and ___ before ** and __)
        $text = preg_replace('/\*\*\*([^\*]+)\*\*\*/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/___([^_]+)___/', '<strong><em>$1</em></strong>', $text);
        $text = preg_replace('/\*\*([^\*]+)\*\*/', '<strong>$1</strong>', $text);
        $text = preg_replace('/__([^_]+)__/', '<strong>$1</strong>', $text);
        $text = preg_replace('/\*([^\*]+)\*/', '<em>$1</em>', $text);
        $text = preg_replace('/_([^_]+)_/', '<em>$1</em>', $text);
        
        // Strikethrough: ~~text~~
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
        
        // Restore protected elements (images, links, spans, tags, iframes, videos, and audio)
        $text = preg_replace_callback('/\x00P(IMG|LNK|SPAN|TAG|IFRAME|VIDEO|AUDIO)(\d+)\x00/', function($matches) use ($protectedElements) {
            $index = (int)$matches[2];
            return isset($protectedElements[$index]) ? $protectedElements[$index] : $matches[0];
        }, $text);
        
        return $text;
    };
    
    // STEP 7: Process block-level elements (headers, lists, tables, etc.)
    $lines = explode("\n", $html);
    $result = [];
    $currentParagraph = [];
    $paragraphStartLine = -1;
    
    // Helper: Flush accumulated paragraph lines into a <p> tag
    $flushParagraph = function() use (&$currentParagraph, &$result, &$paragraphStartLine, $applyInlineStyles) {
        if (count($currentParagraph) > 0) {
            // GitHub Flavored Markdown: single line breaks become <br>
            $processedLines = [];
            for ($i = 0; $i < count($currentParagraph); $i++) {
                $line = $currentParagraph[$i];
                if ($i < count($currentParagraph) - 1) {
                    // Check if line ends with 2+ spaces (manual line break)
                    if (preg_match('/\s{2,}$/', $line)) {
                        $processedLines[] = preg_replace('/\s{2,}$/', '', $line) . '<br>';
                    } else {
                        // Normal line: add <br> for GFM compatibility
                        $processedLines[] = $line . '<br>';
                    }
                } else {
                    // Last line in paragraph: no <br> needed
                    $processedLines[] = $line;
                }
            }
            $para = implode('', $processedLines);
            $para = $applyInlineStyles($para);
            $result[] = '<p data-line="' . $paragraphStartLine . '">' . $para . '</p>';
            $currentParagraph = [];
            $paragraphStartLine = -1;
        }
    };
    
    for ($i = 0; $i < count($lines); $i++) {
        $line = $lines[$i];

        // Check for protected HTML block tags (details, summary)
        // This ensures they are treated as block-level elements
        if (preg_match('/^\x00PTAG\d+\x00/', $line)) {
            $flushParagraph();
            $result[] = $applyInlineStyles($line);
            continue;
        }
        
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
            // Preserve blank lines by adding a non-breaking space paragraph
            // Count consecutive blank lines to preserve multiple blank lines
            $blankLineCount = 1;
            while ($i + 1 < count($lines) && trim($lines[$i + 1]) === '') {
                $blankLineCount++;
                $i++;
            }
            
            // Check if the next non-empty line is a block element (code block, header, list, etc.)
            // If so, don't add blank line placeholders as block elements have their own spacing
            $nextNonEmptyIndex = $i + 1;
            $isNextBlockElement = false;
            if ($nextNonEmptyIndex < count($lines)) {
                $nextLine = $lines[$nextNonEmptyIndex];
                // Check for various block-level elements
                $isNextBlockElement = (
                    preg_match('/\x00CODEBLOCK\d+\x00/', $nextLine) ||  // Code block
                    preg_match('/\x00MATHBLOCK\d+\x00/', $nextLine) ||  // Math block
                    preg_match('/^\x00PTAG\d+\x00/', $nextLine) ||      // HTML tags
                    preg_match('/^#{1,6}\s+/', $nextLine) ||            // Headers
                    preg_match('/^(\*{3,}|-{3,}|_{3,})$/', $nextLine) || // Horizontal rules
                    preg_match('/^&gt;\s/', $nextLine) ||               // Blockquotes
                    preg_match('/^\s*[\*\-\+]\s+\[([ xX])\]\s+/', $nextLine) || // Task lists
                    preg_match('/^\s*[\*\-\+]\s+/', $nextLine) ||       // Unordered lists
                    preg_match('/^\s*\d+\.\s+/', $nextLine) ||          // Ordered lists
                    preg_match('/^\s*\|.+\|\s*$/', $nextLine)           // Tables
                );
            }
            
            // Preserve blank lines based on context:
            // - Before block elements: keep (count - 1) blank lines (block has natural spacing)
            // - Before text: keep all blank lines
            if ($isNextBlockElement) {
                for ($bl = 0; $bl < ($blankLineCount - 1); $bl++) {
                    $result[] = '<p class="blank-line">&nbsp;</p>';
                }
            } else {
                for ($bl = 0; $bl < $blankLineCount; $bl++) {
                    $result[] = '<p class="blank-line">&nbsp;</p>';
                }
            }
            continue;
        }
        
        // Headers
        if (preg_match('/^(#{1,6})\s+(.+)$/', $line, $matches)) {
            $flushParagraph();
            $level = strlen($matches[1]);
            $content = $applyInlineStyles($matches[2]);
            $result[] = '<h' . $level . ' data-line="' . $i . '">' . $content . '</h' . $level . '>';
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
        
        // Helper: Parse nested lists (supports task lists, ordered, and unordered)
        $parseNestedList = function($startIndex, $isTaskList = false) use (&$lines, $applyInlineStyles, &$parseNestedList) {
            $listItems = [];
            $currentIndex = $startIndex;
            $baseIndent = null;
            $baseMarkerType = null; // 'bullet' (-, *, +) or 'number' (1.)
            
            while ($currentIndex < count($lines)) {
                $currentLine = $lines[$currentIndex];
                
                // Handle blank lines within lists (don't break the list if continuation follows)
                if (trim($currentLine) === '' && $baseIndent !== null) {
                    // Look ahead to see if list continues after blank line(s)
                    $lookAheadIndex = $currentIndex + 1;
                    $foundContinuation = false;
                    
                    while ($lookAheadIndex < count($lines)) {
                        $lookAheadLine = $lines[$lookAheadIndex];
                        
                        // If we hit another blank line, keep looking
                        if (trim($lookAheadLine) === '') {
                            $lookAheadIndex++;
                            continue;
                        }
                        
                        // Check if this is a list item that continues our list
                        if ($isTaskList) {
                            $lookMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $lookAheadLine, $lookMatches);
                            $lookMarkerType = null;
                        } else {
                            $lookMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $lookAheadLine, $lookMatches);
                            if ($lookMatch) {
                                $lookMarker = $lookMatches[2];
                                $lookMarkerType = preg_match('/\d+\./', $lookMarker) ? 'number' : 'bullet';
                            } else {
                                $lookMarkerType = null;
                            }
                        }
                        
                        // Check if it's a list item with same type and indentation
                        if ($lookMatch && $baseIndent !== null && strlen($lookMatches[1]) === $baseIndent && 
                            ($isTaskList || $lookMarkerType === $baseMarkerType)) {
                            $foundContinuation = true;
                        }
                        
                        break; // Stop after finding non-blank content
                    }
                    
                    if ($foundContinuation) {
                        $currentIndex++; // Skip blank line and continue
                        continue;
                    } else {
                        break; // End of list
                    }
                }
                
                // Parse list item (task list or regular list)
                if ($isTaskList) {
                    $listMatch = preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $currentLine, $matches);
                    $marker = null;
                    $markerType = null;
                } else {
                    $listMatch = preg_match('/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/', $currentLine, $matches);
                    $marker = isset($matches[2]) ? $matches[2] : null;
                    $markerType = ($marker && preg_match('/\d+\./', $marker)) ? 'number' : 'bullet';
                }
                
                if (!$listMatch) {
                    break; // Not a list item
                }
                
                $indent = strlen($matches[1]);
                $content = $matches[3];
                
                // First item: establish base indentation and marker type
                if ($baseIndent === null) {
                    $baseIndent = $indent;
                    $baseMarkerType = $markerType;
                }
                
                // Special behavior: Marker type change at root level (indent=0) creates nested list
                // Example: * item1 \n 1. nested1 \n 2. nested2 \n * item2
                if (!$isTaskList && $indent === 0 && $baseIndent === 0 && 
                    $markerType !== $baseMarkerType && count($listItems) > 0) {
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
                        $checkbox = '<input type="checkbox" class="markdown-task-checkbox" data-line="' . $currentIndex . '" ' . ($isChecked ? 'checked ' : '') . '>';
                        $itemHtml = '<li class="task-list-item" data-line="' . $currentIndex . '">' . $checkbox . ' <span class="task-text" data-text="' . htmlspecialchars($content, ENT_QUOTES) . '">' . $applyInlineStyles($content) . '</span>';
                    } else {
                        $itemHtml = '<li data-line="' . $currentIndex . '">' . $applyInlineStyles($content);
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
        if ($paragraphStartLine === -1) {
            $paragraphStartLine = $i;
        }
        $currentParagraph[] = $line;
    }
    
    // Flush any remaining paragraph
    $flushParagraph();
    
    return implode("\n", $result);
}
