<?php
/**
 * HTML to Markdown converter, shared by the REST API (whole-note conversion
 * and the "Paste as Markdown" modal) and the AI assistant, which reads
 * rich-text notes through it so that a rewrite keeps the note's structure.
 *
 * Handles: headers, bold, italic, strikethrough, links, images, line breaks,
 * paragraphs, lists (ordered/unordered/checklists), code blocks, inline code,
 * blockquotes, callouts, toggle blocks, tables, horizontal rules, audio/video.
 */

/**
 * Inline tags kept when reducing a list item to text. List rules run before
 * the inline rules, so these have to survive that step to become **bold**,
 * *italic*, `code` and links; the whitelist matches the one the inline rules
 * use among themselves.
 */
define('POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS', '<strong><b><em><i><code><a><del><s><strike><u><mark><span>');

function poznoteHtmlToMarkdown(string $html): string {
    $md = $html;
    
    // Remove copy buttons from code blocks first
    $md = preg_replace('/<button[^>]*class="[^"]*code-block-copy-btn[^"]*"[^>]*>.*?<\/button>/is', '', $md);
    
    // Remove SVG icons (callout icons, etc.)
    $md = preg_replace('/<svg[^>]*>.*?<\/svg>/is', '', $md);
    
    // ---- Code blocks (must be processed FIRST to protect content) ----
    
    // Handle <pre><code class="language-xxx">...</code></pre>
    $md = preg_replace_callback('/<pre[^>]*>\s*<code[^>]*(?:class=["\'][^"\']*language-([a-zA-Z0-9_+-]+)[^"\']*["\'])[^>]*>(.*?)<\/code>\s*<\/pre>/is', function($matches) {
        $lang = $matches[1];
        $code = html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $code = strip_tags($code);
        return "\n\n```" . $lang . "\n" . trim($code) . "\n```\n\n";
    }, $md);
    
    // Handle <pre><code>...</code></pre> without language
    $md = preg_replace_callback('/<pre[^>]*>\s*<code[^>]*>(.*?)<\/code>\s*<\/pre>/is', function($matches) {
        $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $code = strip_tags($code);
        return "\n\n```\n" . trim($code) . "\n```\n\n";
    }, $md);
    
    // Handle <pre>...</pre> without <code> tag
    $md = preg_replace_callback('/<pre[^>]*>(.*?)<\/pre>/is', function($matches) {
        $code = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $code = strip_tags($code);
        return "\n\n```\n" . trim($code) . "\n```\n\n";
    }, $md);
    
    // ---- Toggle blocks (<details class="toggle-block">) ----
    $md = preg_replace_callback('/<details[^>]*class="[^"]*toggle-block[^"]*"[^>]*>\s*<summary[^>]*>(.*?)<\/summary>\s*(?:<div[^>]*class="[^"]*toggle-content[^"]*"[^>]*>(.*?)<\/div>)?\s*<\/details>/is', function($matches) {
        $summary = strip_tags(trim($matches[1]));
        $content = isset($matches[2]) ? trim($matches[2]) : '';
        $innerMd = $content ? poznoteHtmlToMarkdown($content) : '';
        return "\n\n<details>\n<summary>" . $summary . "</summary>\n\n" . $innerMd . "\n\n</details>\n\n";
    }, $md);
    
    // Handle generic <details>/<summary>
    $md = preg_replace_callback('/<details[^>]*>\s*<summary[^>]*>(.*?)<\/summary>(.*?)<\/details>/is', function($matches) {
        $summary = strip_tags(trim($matches[1]));
        $content = trim($matches[2]);
        $innerMd = $content ? poznoteHtmlToMarkdown($content) : '';
        return "\n\n<details>\n<summary>" . $summary . "</summary>\n\n" . $innerMd . "\n\n</details>\n\n";
    }, $md);
    
    // ---- Callouts (<aside class="callout callout-xxx">) ----
    $md = preg_replace_callback('/<aside[^>]*class="[^"]*callout\s+callout-([a-z]+)[^"]*"[^>]*>\s*<div[^>]*class="[^"]*callout-title[^"]*"[^>]*>.*?<span[^>]*class="[^"]*callout-title-text[^"]*"[^>]*>(.*?)<\/span>\s*<\/div>\s*<div[^>]*class="[^"]*callout-body[^"]*"[^>]*>(.*?)<\/div>\s*<\/aside>/is', function($matches) {
        $type = $matches[1];
        $title = strip_tags(trim($matches[2]));
        $body = trim($matches[3]);
        $innerMd = $body ? poznoteHtmlToMarkdown($body) : '';
        $lines = "> [!" . strtoupper($type) . "] " . $title . "\n";
        foreach (explode("\n", $innerMd) as $line) {
            $lines .= "> " . $line . "\n";
        }
        return "\n\n" . rtrim($lines) . "\n\n";
    }, $md);
    
    // ---- Tables ----
    $md = preg_replace_callback('/<table[^>]*>(.*?)<\/table>/is', function($matches) {
        $tableHtml = $matches[1];
        $rows = [];
        preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $tableHtml, $rowMatches);
        foreach ($rowMatches[1] as $rowHtml) {
            $cells = [];
            preg_match_all('/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/is', $rowHtml, $cellMatches);
            foreach ($cellMatches[1] as $cellHtml) {
                $cells[] = trim(strip_tags($cellHtml));
            }
            if (!empty($cells)) $rows[] = $cells;
        }
        if (empty($rows)) return '';
        $result = "\n\n";
        $result .= "| " . implode(" | ", $rows[0]) . " |\n";
        $result .= "| " . implode(" | ", array_fill(0, count($rows[0]), '---')) . " |\n";
        for ($i = 1; $i < count($rows); $i++) {
            while (count($rows[$i]) < count($rows[0])) $rows[$i][] = '';
            $result .= "| " . implode(" | ", $rows[$i]) . " |\n";
        }
        return $result . "\n";
    }, $md);
    
    // ---- Checklists / Task lists ----
    // Consume the whole <ul>/<ol> so the generic list handlers below cannot
    // re-scan the leftover wrapper and drop the already-converted items.
    $md = preg_replace_callback('/<(ul|ol)[^>]*>(.*?)<\/\1>/is', function($matches) {
        $listHtml = $matches[2];

        // Only treat this list as a checklist if it actually contains checkboxes
        if (!preg_match('/<input[^>]*type=["\']checkbox["\']/i', $listHtml)) {
            return $matches[0];
        }

        preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $listHtml, $liMatches);
        $items = [];
        foreach ($liMatches[1] as $liContent) {
            if (!preg_match('/<input[^>]*type=["\']checkbox["\'][^>]*>/i', $liContent, $inputMatch)) {
                // Plain item inside a checklist: keep it as a normal bullet.
                // Inline tags survive so the rules further down turn them
                // into **bold**, *italic*, `code` and links; stripping them
                // here would flatten the item to plain text.
                $text = trim(strip_tags($liContent, POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS));
                if ($text !== '') $items[] = "- " . $text;
                continue;
            }

            // Search the input tag itself, otherwise [^>]* swallows "checked".
            // Match only a real attribute: "checklist-checkbox" as a class value
            // must not count, and data-checked="0" means unchecked.
            $inputTag = $inputMatch[0];
            if (preg_match('/\sdata-checked=["\']?([01])/i', $inputTag, $dataChecked)) {
                $checked = $dataChecked[1] === '1';
            } else {
                $checked = (bool)preg_match('/\schecked(?=[\s>=\/])/i', $inputTag);
            }

            $text = trim(strip_tags(str_replace($inputMatch[0], '', $liContent), POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS));
            $text = str_replace("\xE2\x80\x8B", '', $text); // zero-width space in empty items
            $items[] = ($checked ? "- [x] " : "- [ ] ") . $text;
        }

        if (empty($items)) return $matches[0];
        return "\n\n" . implode("\n", $items) . "\n\n";
    }, $md);

    // ---- Ordered lists ----
    $md = preg_replace_callback('/<ol[^>]*>(.*?)<\/ol>/is', function($matches) {
        $items = [];
        preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $matches[1], $liMatches);
        $i = 1;
        foreach ($liMatches[1] as $liContent) {
            $items[] = $i . ". " . strip_tags(trim($liContent), POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS);
            $i++;
        }
        return "\n\n" . implode("\n", $items) . "\n\n";
    }, $md);
    
    // ---- Unordered lists ----
    $md = preg_replace_callback('/<ul[^>]*>(.*?)<\/ul>/is', function($matches) {
        $items = [];
        preg_match_all('/<li[^>]*>(.*?)<\/li>/is', $matches[1], $liMatches);
        foreach ($liMatches[1] as $liContent) {
            $text = strip_tags(trim($liContent), POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS);
            if (!empty($text)) $items[] = "- " . $text;
        }
        return "\n\n" . implode("\n", $items) . "\n\n";
    }, $md);
    
    // ---- Orphan checklist items ----
    // Pasted fragments often carry <li> items with no enclosing list, or a
    // wrapper that is never closed; the handlers above all require a closed
    // <ul>/<ol> pair, so without this pass the checkbox state would be lost.
    $md = preg_replace_callback('/<li[^>]*>(.*?)<\/li>/is', function($matches) {
        $liContent = $matches[1];
        if (!preg_match('/<input[^>]*type=["\']checkbox["\'][^>]*>/i', $liContent, $inputMatch)) {
            return $matches[0];
        }
        $inputTag = $inputMatch[0];
        if (preg_match('/\sdata-checked=["\']?([01])/i', $inputTag, $dataChecked)) {
            $checked = $dataChecked[1] === '1';
        } else {
            $checked = (bool)preg_match('/\schecked(?=[\s>=\/])/i', $inputTag);
        }
        $text = trim(strip_tags(str_replace($inputTag, '', $liContent), POZNOTE_HTML_TO_MD_LIST_ITEM_INLINE_TAGS));
        $text = str_replace("\xE2\x80\x8B", '', $text);
        return "\n" . ($checked ? "- [x] " : "- [ ] ") . $text . "\n";
    }, $md);

    // ---- Headers ----
    $md = preg_replace('/<h1[^>]*>(.*?)<\/h1>/is', "\n\n# $1\n\n", $md);
    $md = preg_replace('/<h2[^>]*>(.*?)<\/h2>/is', "\n\n## $1\n\n", $md);
    $md = preg_replace('/<h3[^>]*>(.*?)<\/h3>/is', "\n\n### $1\n\n", $md);
    $md = preg_replace('/<h4[^>]*>(.*?)<\/h4>/is', "\n\n#### $1\n\n", $md);
    $md = preg_replace('/<h5[^>]*>(.*?)<\/h5>/is', "\n\n##### $1\n\n", $md);
    $md = preg_replace('/<h6[^>]*>(.*?)<\/h6>/is', "\n\n###### $1\n\n", $md);
    
    // ---- Structural elements (Paragraphs, Divs, Line breaks) ----
    // Doing this before inline formatting prevents bold/italic from wrapping across blocks
    
    // Horizontal rule
    $md = preg_replace('/<hr\s*\/?>/i', "\n\n---\n\n", $md);
    
    // Line breaks
    $md = preg_replace('/<br\s*\/?>/i', "\n", $md);
    
    // Paragraphs
    $md = preg_replace('/<p[^>]*>(.*?)<\/p>/is', "$1\n\n", $md);
    
    // Divs
    $md = preg_replace('/<div[^>]*>(.*?)<\/div>/is', "$1\n", $md);
    
    // ---- Inline formatting ----
    // Bold: handles both <strong> and <b>, avoids double wrapping
    $md = preg_replace_callback('/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/is', function($matches) {
        $inner = $matches[1];
        // Keep nested formatting but strip others
        $inner = strip_tags($inner, '<em><i><code><a><del><s><strike><u><mark><span>');
        preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
        $text = $parts[2];
        if ($text === '') return $parts[1] . $parts[3];
        return $parts[1] . '**' . $text . '**' . $parts[3];
    }, $md);
    
    // Italic: handles both <em> and <i>, avoids double wrapping
    $md = preg_replace_callback('/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/is', function($matches) {
        if (isset($matches[0]) && preg_match('/class=["\"][^"\"]*(?:\blucide\b|\blucide-)/', $matches[0])) return ''; // Skip Lucide icons
        $inner = $matches[1];
        $inner = strip_tags($inner, '<strong><b><code><a><del><s><strike><u><mark><span>');
        preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
        $text = $parts[2];
        if ($text === '') return $parts[1] . $parts[3];
        return $parts[1] . '*' . $text . '*' . $parts[3];
    }, $md);
    
    // Strikethrough: handles del, s, strike
    $md = preg_replace_callback('/<(?:del|s|strike)[^>]*>(.*?)<\/(?:del|s|strike)>/is', function($matches) {
        $inner = strip_tags($matches[1], '<strong><b><em><i><code><a><u><mark><span>');
        preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
        $text = $parts[2];
        if ($text === '') return $parts[1] . $parts[3];
        return $parts[1] . '~~' . $text . '~~' . $parts[3];
    }, $md);
    
    $md = preg_replace('/<u[^>]*>(.*?)<\/u>/is', "<u>$1</u>", $md);
    
    $md = preg_replace_callback('/<mark[^>]*>(.*?)<\/mark>/is', function($matches) {
        $inner = strip_tags($matches[1], '<strong><b><em><i><code><a><u><span>');
        preg_match('/^(\s*)(.*?)(\s*)$/s', $inner, $parts);
        $text = $parts[2];
        if ($text === '') return $parts[1] . $parts[3];
        return $parts[1] . '==' . $text . '==' . $parts[3];
    }, $md);
    
    // Colors & Backgrounds (preserves span with style)
    // Detect spans with style and keep them if they have color or background
    $md = preg_replace_callback('/<span[^>]*style=["\']([^"\']*(?:color|background)[^"\']*)["\'][^>]*>(.*?)<\/span>/is', function($matches) {
        $style = $matches[1];
        $inner = $matches[2];
        return '<span style="' . $style . '">' . $inner . '</span>';
    }, $md);
    
    // ---- Links & Media ----
    
    // Inline code
    $md = preg_replace_callback('/<code[^>]*>(.*?)<\/code>/is', function($matches) {
        $code = $matches[1];
        if (strpos($code, "\n") !== false || strlen($code) > 100) {
            $code = html_entity_decode($code, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $code = strip_tags($code);
            return "\n\n```\n" . trim($code) . "\n```\n\n";
        }
        return "`" . html_entity_decode(strip_tags($code), ENT_QUOTES | ENT_HTML5, 'UTF-8') . "`";
    }, $md);
    
    // Links
    $md = preg_replace('/<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)<\/a>/is', "[$2]($1)", $md);
    
    // Images
    $md = preg_replace('/<img[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']([^"\']*)["\'][^>]*\/?>/is', "![$1]($2)", $md);
    $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*\/?>/is', "![$2]($1)", $md);
    $md = preg_replace('/<img[^>]*src=["\']([^"\']*)["\'][^>]*\/?>/is', "![]($1)", $md);
    
    // Audio / Video / Iframe
    $md = preg_replace('/<audio[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/audio>/is', '[$1]($1)', $md);
    $md = preg_replace('/<video[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/video>/is', '[$1]($1)', $md);
    $md = preg_replace('/<iframe[^>]*src=["\']([^"\']*)["\'][^>]*>.*?<\/iframe>/is', '[$1]($1)', $md);
    
    // Blockquotes
    $md = preg_replace_callback('/<blockquote[^>]*>(.*?)<\/blockquote>/is', function($matches) {
        $inner = trim(strip_tags($matches[1], '<strong><b><em><i><code><a><u><mark><span>'));
        $lines = explode("\n", $inner);
        $quoted = '';
        foreach ($lines as $line) {
            $quoted .= "> " . trim($line) . "\n";
        }
        return "\n\n" . rtrim($quoted) . "\n\n";
    }, $md);
    
    // ---- Cleanup ----
    
    // Keep only spans the Markdown renderer actually understands, i.e. a
    // lone style attribute (used for colors and highlights). Pasted web
    // content carries spans with extra attributes (Wikipedia ships
    // data-mw-comment-end, ids, classes); the renderer does not match those,
    // so keeping them would print the raw tag as text in the note.
    //
    // Innermost-first: the inner pattern forbids nested span tags, so
    // repeating it unwraps one level per pass and never leaves the stray
    // </span> that a single non-greedy pass produces on nested spans.
    $previous = null;
    $passes = 0;
    while ($previous !== $md && $passes < 20) {
        $previous = $md;
        $md = preg_replace_callback('/<span([^>]*)>((?:(?!<\/?span\b).)*)<\/span>/is', function($matches) {
            $attrs = trim($matches[1]);
            $inner = $matches[2];
            // Only a color/background span carries meaning the Markdown
            // renderer reproduces. Layout styles such as Wikipedia's
            // "display: inline-block" render as a literal tag in the note.
            if (preg_match('/^style=(["\'])([^"\']*(?:color|background)[^"\']*)\1$/i', $attrs)) {
                return '<span ' . $attrs . '>' . $inner . '</span>';
            }
            return $inner;
        }, $md);
        $passes++;
    }

    // Unpaired tags can remain when the source markup is malformed (a
    // <span> that is never closed). Drop opening tags the loop did not
    // keep, plus any closing tag with no matching opener, so neither can
    // reach the note as literal text.
    $openStyledSpans = 0;
    $md = preg_replace_callback('/<span([^>]*)>|<\/span>/i', function($matches) use (&$openStyledSpans) {
        if ($matches[0][1] === '/') {
            if ($openStyledSpans > 0) {
                $openStyledSpans--;
                return '</span>';
            }
            return '';
        }
        $attrs = trim($matches[1]);
        if (preg_match('/^style=(["\'])([^"\']*(?:color|background)[^"\']*)\1$/i', $attrs)) {
            $openStyledSpans++;
            return '<span ' . $attrs . '>';
        }
        return '';
    }, $md);

    // Remove remaining HTML tags (keep details/summary/u/span)
    $md = strip_tags($md, '<details><summary><u><span>');
    
    // ---- Convert HTML entities ----
    $md = html_entity_decode($md, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Replace non-breaking spaces
    $md = str_replace("\xC2\xA0", ' ', $md);
    // Remove zero-width spaces
    $md = str_replace("\xE2\x80\x8B", '', $md);
    
    // Clean up lines that are only whitespace
    $md = preg_replace('/^[ \t]+$/m', '', $md);
    
    // Clean up excessive newlines
    $md = preg_replace('/\n{3,}/', "\n\n", $md);
    $md = trim($md);
    
    return $md;
}
