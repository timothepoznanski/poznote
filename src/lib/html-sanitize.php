<?php
/**
 * HTML and Markdown sanitisation, plus the iframe/media embed trust rules.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

// Owned here rather than by functions.php: these functions are the only ones
// that decide whether an embed is trusted, and leaving the constant behind made
// this module fatal on any iframe when loaded on its own.
/**
 * Trusted domains allowed for iframe embeds.
 * Used by both unescapeIframesInHtml() and the Markdown parser.
 */
if (!defined('ALLOWED_IFRAME_DOMAINS')) {
    define('ALLOWED_IFRAME_DOMAINS', [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'player.bilibili.com',
        'www.bilibili.com',
        'bilibili.com',
    ]);
}

/**
 * Decide whether an iframe `src` points at a trusted origin.
 *
 * Uses parse_url() with EXACT host matching (plus subdomains of an allowed
 * domain) so look-alike hosts such as `www.youtube.com.evil.test`, or a
 * trusted domain smuggled into the query string (`/x?u=//youtube.com`), are
 * rejected. Only http(s) and same-origin relative paths are accepted;
 * protocol-relative, javascript:, data: and other schemes are refused.
 */
function poznoteIframeSrcIsTrusted($src): bool {
    $src = trim((string) $src);
    if ($src === '') {
        return false;
    }

    // Reject any explicit scheme that is not http/https (javascript:, data:, ...).
    if (preg_match('#^([a-z][a-z0-9+.\-]*):#i', $src, $schemeMatch)) {
        if (!in_array(strtolower($schemeMatch[1]), ['http', 'https'], true)) {
            return false;
        }
    }

    $host = parse_url($src, PHP_URL_HOST);
    if ($host === null || $host === false || $host === '') {
        // No host -> relative/local path only. A leading "//" with no resolvable
        // host is treated as untrusted.
        if (strpos($src, '//') === 0) {
            return false;
        }
        return $src[0] === '/'
            || strpos($src, './') === 0
            || preg_match('~^audio_player\.php(?:[?#]|$)~i', $src) === 1;
    }

    $host = strtolower($host);
    foreach (ALLOWED_IFRAME_DOMAINS as $domain) {
        $domain = strtolower(trim((string) $domain));
        if ($domain === '') {
            continue;
        }
        if ($host === $domain || substr($host, -(strlen($domain) + 1)) === '.' . $domain) {
            return true;
        }
    }

    return false;
}

/**
 * Decide whether an <audio>/<video> src (or poster) is acceptable:
 * http(s) or a same-origin relative path. Any other scheme is refused.
 */
function poznoteMediaSrcIsTrusted($src): bool {
    $src = trim((string) $src);
    if ($src === '') {
        return false;
    }
    if (preg_match('#^([a-z][a-z0-9+.\-]*):#i', $src, $schemeMatch)) {
        return in_array(strtolower($schemeMatch[1]), ['http', 'https'], true);
    }
    return $src[0] === '/' || strpos($src, './') === 0 || strpos($src, '../') === 0;
}

/**
 * Rebuild an <iframe>, <video> or <audio> tag from a raw attribute string,
 * keeping ONLY allow-listed attributes with re-encoded values.
 *
 * This is the single place that decides which media attributes may reach the
 * page: every path that turns an attribute string back into markup
 * (unescaping stored `&lt;iframe ...&gt;` text, the Markdown parser, ...)
 * must go through it so that inline event handlers or unexpected attributes
 * can never be re-emitted verbatim.
 *
 * @param string $tagName 'iframe', 'video' or 'audio'
 * @param string $attrs   Decoded attribute string (e.g. `src="..." width="560"`)
 * @return string|null    The rebuilt tag, or null when the src is missing/untrusted
 */
function poznoteRebuildMediaTag(string $tagName, string $attrs): ?string {
    static $allowedAttrs = [
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'title', 'sandbox', 'loading', 'referrerpolicy', 'style', 'class', 'scrolling', 'contenteditable', 'data-is-audio', 'data-audio-src', 'data-converted-from-audio'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'],
    ];
    static $booleanAttrs = ['allowfullscreen', 'allowtransparency', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'];

    $tagName = strtolower($tagName);
    if (!isset($allowedAttrs[$tagName])) {
        return null;
    }

    // Tokenize name[=value] pairs the way a browser would (double-quoted,
    // single-quoted or bare values). Anything that does not parse is dropped.
    preg_match_all('/([a-zA-Z][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/', $attrs, $matches, PREG_SET_ORDER);

    $safeAttrs = [];
    $src = null;
    foreach ($matches as $m) {
        $name = strtolower($m[1]);
        if (!in_array($name, $allowedAttrs[$tagName], true) || isset($safeAttrs[$name])) {
            continue;
        }
        $value = ($m[2] ?? '') !== '' ? $m[2] : ((($m[3] ?? '') !== '') ? $m[3] : ($m[4] ?? ''));

        if (in_array($name, $booleanAttrs, true)) {
            $safeAttrs[$name] = $name;
            continue;
        }
        if ($name === 'src') {
            $src = $value;
        } elseif ($name === 'poster' || $name === 'data-audio-src') {
            if (!poznoteMediaSrcIsTrusted($value)) {
                continue;
            }
        } elseif ($name === 'style') {
            if (preg_match('/expression\s*\(|javascript:|behavior\s*:|@import/i', $value)) {
                continue;
            }
        }
        $safeAttrs[$name] = $name . '="' . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '"';
    }

    $srcTrusted = $src !== null && ($tagName === 'iframe'
        ? poznoteIframeSrcIsTrusted($src)
        : poznoteMediaSrcIsTrusted($src));
    if (!$srcTrusted) {
        return null;
    }

    return '<' . $tagName . ' ' . implode(' ', $safeAttrs) . '></' . $tagName . '>';
}

/**
 * Unescape iframe HTML entities in content
 * This fixes notes that were created with HTML-escaped iframe tags
 * (e.g., &lt;iframe&gt; becomes <iframe>)
 *
 * Escaped tags are inert text for sanitizeHtml(), so anything re-emitted here
 * reaches the page unsanitized: the tag is rebuilt from an attribute
 * allow-list (poznoteRebuildMediaTag) and only for trusted iframe origins.
 * Anything else stays escaped.
 */
function unescapeIframesInHtml($content) {
    if (empty($content)) {
        return $content;
    }

    return preg_replace_callback('/&lt;iframe\s([\s\S]*?)&gt;\s*&lt;\/iframe&gt;/i', function($matches) {
        $attrs = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $tag = poznoteRebuildMediaTag('iframe', $attrs);
        // If not whitelisted, keep it escaped for security
        return $tag ?? $matches[0];
    }, $content);
}

/**
 * Unescape audio/video tags that were saved as escaped HTML
 * Keeps the escaped tag if the src is not a safe URL. Same allow-list
 * rebuild as iframes: no attribute is passed through verbatim.
 */
function unescapeMediaInHtml($content) {
    if (empty($content)) {
        return $content;
    }

    // Unescape iframes first (keeps existing behavior)
    $content = unescapeIframesInHtml($content);

    foreach (['audio', 'video'] as $tagName) {
        $content = preg_replace_callback('/&lt;' . $tagName . '\s([\s\S]*?)&gt;\s*&lt;\/' . $tagName . '&gt;/i', function($matches) use ($tagName) {
            $attrs = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $tag = poznoteRebuildMediaTag($tagName, $attrs);
            return $tag ?? $matches[0];
        }, $content);
    }

    return $content;
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * This function removes dangerous HTML tags and attributes that could be used
 * for Cross-Site Scripting (XSS) attacks while preserving safe formatting.
 * 
 * @param string $html The HTML content to sanitize
 * @return string The sanitized HTML content
 */
function sanitizeHtml($html) {
    if (empty($html)) {
        return $html;
    }
    
    // Allowed HTML tags (safe formatting tags)
    $allowedTags = [
        'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'blockquote', 'pre', 'code', 'hr',
        'img', 'figure', 'figcaption',
        'details', 'summary',
        'mark', 'small', 'sub', 'sup',
        'abbr', 'cite', 'q', 'time',
        'input', 'label', // For task lists
        'iframe', // For YouTube, Vimeo embeds (validated separately)
        'video', // For MP4 embeds
        'audio', // For audio embeds
        'button', 'i', // For Excalidraw buttons and icons
        'aside', // For callout/quote blocks
        'svg', 'path', 'rect', 'polyline' // For callout icons (SVG)
    ];
    
    // Allowed attributes per tag
    $allowedAttrs = [
        'a' => ['href', 'title', 'target', 'rel'],
        'img' => ['src', 'alt', 'title', 'width', 'height', 'data-is-excalidraw', 'data-excalidraw-note-id'],
        'td' => ['colspan', 'rowspan'],
        'th' => ['colspan', 'rowspan', 'scope'],
        'div' => ['class', 'data-tasklist-json', 'data-markdown-content', 'data-excalidraw', 'data-diagram-id', 'data-task-embed', 'contenteditable'],
        'span' => ['class'],
        'input' => ['type', 'checked', 'disabled'],
        'time' => ['datetime'],
        'blockquote' => ['cite'],
        'q' => ['cite'],
        'pre' => ['data-language', 'data-line-numbers', 'data-auto-language'],
        'code' => ['data-language', 'data-auto-language'],
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'title', 'sandbox', 'loading', 'referrerpolicy', 'style', 'class', 'scrolling', 'contenteditable', 'data-is-audio', 'data-audio-src', 'data-converted-from-audio'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'],
        'button' => ['class', 'data-action'],
        'svg' => ['viewBox', 'width', 'height', 'aria-hidden', 'fill', 'xmlns', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'path' => ['d', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'rect' => ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
        'polyline' => ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']
    ];
    
    // Global allowed attributes (safe for all tags)
    $globalAllowedAttrs = ['id', 'class', 'style'];
    
    // Dangerous patterns to remove
    $dangerousPatterns = [
        // Remove javascript: protocol
        '/javascript:/i',
        // Remove data: protocol (except for images which we'll handle separately)
        '/data:(?!image\/)/i',
        // Remove vbscript: protocol
        '/vbscript:/i'
    ];
    
    // Note: We don't do regex-based removal here because it's blind to context
    // (e.g., it would remove <script> even inside <code> blocks where it's legitimate)
    // Instead, we let DOMDocument handle everything as it understands HTML structure
    
    // Use DOMDocument for more precise sanitization
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->encoding = 'UTF-8';
    
    // Load HTML with UTF-8 encoding
    // Use HTML5 meta tag instead of XML declaration to avoid it appearing in output
    $wrappedHtml = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' . $html . '</body></html>';
    @$dom->loadHTML($wrappedHtml, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    
    $xpath = new DOMXPath($dom);

    // Heading anchors are runtime UI controls added by the outline panel.
    // They must never be persisted as note content.
    $runtimeHeadingAnchors = $xpath->query('//a[contains(concat(" ", normalize-space(@class), " "), " heading-anchor ") or @data-heading-anchor="true"]');
    foreach ($runtimeHeadingAnchors as $anchor) {
        if ($anchor->parentNode) {
            $anchor->parentNode->removeChild($anchor);
        }
    }

    // Embedded task-list widgets are runtime UI rebuilt by tasklist-embed.js
    // from the persisted marker; only the marker div and its fallback link
    // belong in stored content.
    $runtimeTaskEmbedWidgets = $xpath->query('//*[contains(concat(" ", normalize-space(@class), " "), " tasklist-embed-widget ")]');
    foreach ($runtimeTaskEmbedWidgets as $widget) {
        if ($widget->parentNode) {
            $widget->parentNode->removeChild($widget);
        }
    }
    
    // Remove all disallowed tags
    $allElements = $xpath->query('//body//*');
    $elementsToRemove = [];
    
    foreach ($allElements as $element) {
        $tagName = strtolower($element->tagName);
        
        // Check if this element is inside a <code> or <pre> block
        $isInCodeBlock = false;
        $parent = $element->parentNode;
        while ($parent && $parent->nodeType === XML_ELEMENT_NODE) {
            $parentTag = strtolower($parent->tagName);
            if ($parentTag === 'code' || $parentTag === 'pre') {
                $isInCodeBlock = true;
                break;
            }
            $parent = $parent->parentNode;
        }
        
        // If it's a dangerous tag inside a code block, encode it as text instead of removing
        if ($isInCodeBlock && in_array($tagName, ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'style'])) {
            // Convert the element to text (encode it)
            $encodedTag = htmlspecialchars($element->ownerDocument->saveHTML($element), ENT_QUOTES, 'UTF-8');
            $textNode = $element->ownerDocument->createTextNode($encodedTag);
            $element->parentNode->replaceChild($textNode, $element);
            continue;
        }
        
        // If tag is not in allowed list, mark for removal
        if (!in_array($tagName, $allowedTags)) {
            $elementsToRemove[] = $element;
            continue;
        }
        
        // Check and sanitize attributes
        $attributesToRemove = [];
        foreach ($element->attributes as $attr) {
            $attrName = strtolower($attr->name);
            $attrValue = $attr->value;
            
            // Check if attribute is allowed for this tag
            $tagAllowedAttrs = $allowedAttrs[$tagName] ?? [];
            $isAllowed = in_array($attrName, $tagAllowedAttrs) || in_array($attrName, $globalAllowedAttrs);
            
            if (!$isAllowed) {
                $attributesToRemove[] = $attrName;
                continue;
            }
            
            // Check for dangerous patterns in attribute values
            foreach ($dangerousPatterns as $pattern) {
                if (preg_match($pattern, $attrValue)) {
                    $attributesToRemove[] = $attrName;
                    continue 2;
                }
            }
            
            // Special validation for href and src attributes
            if ($attrName === 'href' || $attrName === 'src') {
                // For iframes, validate that src is from trusted domains or local paths
                if ($tagName === 'iframe' && $attrName === 'src') {
                    // Strict host match against ALLOWED_IFRAME_DOMAINS, or a
                    // local/relative path (e.g., /audio_player.php)
                    if (!poznoteIframeSrcIsTrusted($attrValue)) {
                        // Not a trusted iframe source - mark entire element for removal
                        $elementsToRemove[] = $element;
                        break; // Exit attribute loop
                    }
                    continue;
                }
                
                // Allow http, https, mailto, and relative URLs
                // Allow data:image for images
                if ($attrName === 'src' && $tagName === 'img' && strpos($attrValue, 'data:image/') === 0) {
                    // Allow data:image URLs for images
                    continue;
                }
                
                if (!preg_match('/^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i', $attrValue) && 
                    strpos($attrValue, 'data:') !== 0) {
                    // If it doesn't start with allowed protocols, it might be relative - keep it
                    // but if it contains suspicious patterns, remove it
                    if (preg_match('/[<>"\']/', $attrValue)) {
                        $attributesToRemove[] = $attrName;
                    }
                }
            }
        }
        
        // Remove dangerous attributes
        foreach ($attributesToRemove as $attrName) {
            $element->removeAttribute($attrName);
        }
    }
    
    // Remove disallowed elements
    foreach ($elementsToRemove as $element) {
        if ($element->parentNode) {
            $element->parentNode->removeChild($element);
        }
    }
    
    // Get the sanitized HTML (only body content)
    $body = $dom->getElementsByTagName('body')->item(0);
    if ($body) {
        $sanitized = '';
        foreach ($body->childNodes as $child) {
            $sanitized .= $dom->saveHTML($child);
        }
    } else {
        $sanitized = $dom->saveHTML();
    }
    
    // Trim whitespace
    $sanitized = trim($sanitized);
    
    // Clean up any remaining dangerous patterns that might have been encoded
    $sanitized = str_replace(['&lt;script', '&lt;/script'], '', $sanitized);
    
    libxml_clear_errors();
    
    return $sanitized;
}

/**
 * Replace fenced code blocks and single-backtick code spans with opaque
 * placeholders.
 *
 * Both Markdown renderers (markdown_parser.php and js/markdown-parser.js)
 * HTML-escape code, so markup quoted as a code sample can never execute and
 * must survive sanitizeMarkdownContent() verbatim (issue #1313). Only a
 * properly closed fence is masked: an unterminated one would otherwise
 * exempt the rest of the note from sanitization.
 *
 * @param string $markdown Raw Markdown, already stripped of NUL bytes
 * @param array $segments Receives the masked segments, indexed by placeholder id
 * @return string The Markdown with code segments replaced by placeholders
 */
function maskMarkdownCodeSegments($markdown, array &$segments) {
    $segments = [];
    $store = function($code) use (&$segments) {
        $index = count($segments);
        $segments[$index] = $code;
        return "\x00MDCODE" . $index . "\x00";
    };
    // Mirrors markdown_parser.php: single backticks, no newline inside.
    $maskInline = function($line) use ($store) {
        return preg_replace_callback('/(?<!\\\\)`([^`\n]+?)(?<!\\\\)`/', function($m) use ($store) {
            return $store($m[0]);
        }, $line);
    };

    $lines = explode("\n", $markdown);
    $output = [];
    $pending = [];   // lines buffered since an opening fence
    $inFence = false;

    foreach ($lines as $line) {
        if (!$inFence) {
            if (preg_match('/^[ \t]*```/', $line)) {
                $inFence = true;
                $pending = [$line];
            } else {
                $output[] = $maskInline($line);
            }
            continue;
        }

        $pending[] = $line;
        if (preg_match('/^[ \t]*```[ \t\r]*$/', $line)) {
            $output[] = $store(implode("\n", $pending));
            $inFence = false;
            $pending = [];
        }
    }

    // Unterminated fence: not a code block for the renderers either, so the
    // buffered lines stay sanitizable.
    foreach ($pending as $line) {
        $output[] = $maskInline($line);
    }

    return implode("\n", $output);
}

/**
 * Put back the code segments masked by maskMarkdownCodeSegments().
 *
 * @param string $markdown The masked Markdown
 * @param array $segments The segments returned by maskMarkdownCodeSegments()
 * @return string The Markdown with its code segments restored
 */
function restoreMarkdownCodeSegments($markdown, array $segments) {
    if (empty($segments)) {
        return $markdown;
    }
    return preg_replace_callback('/\x00MDCODE(\d+)\x00/', function($m) use ($segments) {
        $index = (int)$m[1];
        return array_key_exists($index, $segments) ? $segments[$index] : '';
    }, $markdown);
}

/**
 * Sanitize Markdown content to prevent XSS attacks
 * 
 * Unlike sanitizeHtml(), this function works on raw Markdown text without
 * using DOMDocument, which would mangle Markdown syntax characters like >.
 * It removes dangerous HTML patterns that could be embedded in Markdown
 * while preserving all Markdown syntax.
 *
 * Two rules keep it from eating the author's text (issue #1313): code samples
 * are masked out first, and a dangerous tag pair only matches while its
 * content stays inside one paragraph, so a lone "<script>" mentioned in prose
 * cannot swallow everything up to an unrelated closing tag further down.
 * 
 * @param string $markdown The raw Markdown content to sanitize
 * @return string The sanitized Markdown content
 */
function sanitizeMarkdownContent($markdown) {
    if (empty($markdown)) {
        return $markdown;
    }

    // NUL never belongs to Markdown text, and a note containing one could
    // forge the code placeholders used below.
    $markdown = str_replace("\x00", '', $markdown);

    $codeSegments = [];
    $markdown = maskMarkdownCodeSegments($markdown, $codeSegments);

    // Tag content, bounded to a single paragraph: newlines are allowed, a
    // blank line is not.
    $content = '(?:[^\n]|\n(?![ \t]*\n))*?';

    // Remove <script> tags and their content
    $markdown = preg_replace('/<script\b[^<>]*>' . $content . '<\/script\s*>/i', '', $markdown);

    // Remove <style> tags and their content
    $markdown = preg_replace('/<style\b[^<>]*>' . $content . '<\/style\s*>/i', '', $markdown);

    // Remove <object>, <embed>, <applet> tags and their content
    $markdown = preg_replace('/<(object|embed|applet)\b[^<>]*>' . $content . '<\/\1\s*>/i', '', $markdown);
    $markdown = preg_replace('/<(object|embed|applet)\b[^<>]*\/?>/i', '', $markdown);

    // Remove <form> tags and their content
    $markdown = preg_replace('/<form\b[^<>]*>' . $content . '<\/form\s*>/i', '', $markdown);

    // Remove on* event handlers from any HTML tags embedded in markdown
    // ("/" is an attribute separator for browsers too: <details/onclick=...>)
    $markdown = preg_replace('/(<[a-zA-Z][^<>]*?)[\s\/]+on\w+\s*=\s*(["\']).*?\2/i', '$1', $markdown);
    $markdown = preg_replace('/(<[a-zA-Z][^<>]*?)[\s\/]+on\w+\s*=\s*[^\s<>]*/i', '$1', $markdown);

    // Remove javascript: and vbscript: protocols from href/src attributes
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*javascript:/i', '$1=$2', $markdown);
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*vbscript:/i', '$1=$2', $markdown);

    return restoreMarkdownCodeSegments($markdown, $codeSegments);
}
