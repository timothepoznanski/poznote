<?php
/**
 * HTML to Markdown Parser
 * Converts HTML content to Markdown format
 */

function parseHTMLToMarkdown($html) {
    // Remove script and style tags
    $html = preg_replace('/<script\b[^>]*>(.*?)<\/script>/is', '', $html);
    $html = preg_replace('/<style\b[^>]*>(.*?)<\/style>/is', '', $html);
    
    // Convert <br> and <hr> tags
    $html = preg_replace('/<br\s*\/?>/i', "\n", $html);
    $html = preg_replace('/<hr\s*\/?>/i', "\n---\n", $html);
    
    // Headers (h1-h6)
    for ($i = 6; $i >= 1; $i--) {
        $hash = str_repeat('#', $i);
        $html = preg_replace_callback(
            '/<h' . $i . '[^>]*>(.*?)<\/h' . $i . '>/is',
            function($matches) use ($hash) {
                return "\n" . $hash . ' ' . strip_tags($matches[1]) . "\n";
            },
            $html
        );
    }
    
    // Bold and strong
    $html = preg_replace('/<(strong|b)>(.*?)<\/\1>/is', '**$2**', $html);
    
    // Italic and emphasis
    $html = preg_replace('/<(em|i)>(.*?)<\/\1>/is', '*$2*', $html);
    
    // Strikethrough
    $html = preg_replace('/<(s|strike|del)>(.*?)<\/\1>/is', '~~$2~~', $html);
    
    // Code inline
    $html = preg_replace('/<code>(.*?)<\/code>/is', '`$1`', $html);
    
    // Code blocks
    $html = preg_replace_callback(
        '/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/is',
        function($matches) {
            return "\n```\n" . html_entity_decode(strip_tags($matches[1])) . "\n```\n";
        },
        $html
    );
    
    // Links
    $html = preg_replace_callback(
        '/<a\s+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is',
        function($matches) {
            return '[' . strip_tags($matches[2]) . '](' . $matches[1] . ')';
        },
        $html
    );
    
    // Images
    $html = preg_replace_callback(
        '/<img\s+[^>]*src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*\/?>/is',
        function($matches) {
            return '![' . $matches[2] . '](' . $matches[1] . ')';
        },
        $html
    );
    $html = preg_replace_callback(
        '/<img\s+[^>]*alt=["\']([^"\']*)["\'][^>]*src=["\']([^"\']+)["\'][^>]*\/?>/is',
        function($matches) {
            return '![' . $matches[1] . '](' . $matches[2] . ')';
        },
        $html
    );
    $html = preg_replace_callback(
        '/<img\s+[^>]*src=["\']([^"\']+)["\'][^>]*\/?>/is',
        function($matches) {
            return '![](' . $matches[1] . ')';
        },
        $html
    );
    
    // Unordered lists
    $html = preg_replace_callback(
        '/<ul[^>]*>(.*?)<\/ul>/is',
        function($matches) {
            $items = preg_replace_callback(
                '/<li[^>]*>(.*?)<\/li>/is',
                function($m) {
                    return '- ' . trim(strip_tags($m[1])) . "\n";
                },
                $matches[1]
            );
            return "\n" . $items . "\n";
        },
        $html
    );
    
    // Ordered lists
    $html = preg_replace_callback(
        '/<ol[^>]*>(.*?)<\/ol>/is',
        function($matches) {
            $counter = 1;
            $items = preg_replace_callback(
                '/<li[^>]*>(.*?)<\/li>/is',
                function($m) use (&$counter) {
                    return $counter++ . '. ' . trim(strip_tags($m[1])) . "\n";
                },
                $matches[1]
            );
            return "\n" . $items . "\n";
        },
        $html
    );
    
    // Blockquotes
    $html = preg_replace_callback(
        '/<blockquote[^>]*>(.*?)<\/blockquote>/is',
        function($matches) {
            $lines = explode("\n", trim(strip_tags($matches[1])));
            $quoted = array_map(function($line) {
                return '> ' . trim($line);
            }, $lines);
            return "\n" . implode("\n", $quoted) . "\n";
        },
        $html
    );
    
    // Tables
    $html = preg_replace_callback(
        '/<table[^>]*>(.*?)<\/table>/is',
        function($matches) {
            $table = $matches[1];
            $markdown = "\n";
            
            // Extract headers
            if (preg_match('/<thead[^>]*>(.*?)<\/thead>/is', $table, $thead)) {
                preg_match_all('/<th[^>]*>(.*?)<\/th>/is', $thead[1], $headers);
                $headerRow = '| ' . implode(' | ', array_map('strip_tags', $headers[1])) . ' |';
                $separator = '| ' . implode(' | ', array_fill(0, count($headers[1]), '---')) . ' |';
                $markdown .= $headerRow . "\n" . $separator . "\n";
            }
            
            // Extract body rows
            if (preg_match('/<tbody[^>]*>(.*?)<\/tbody>/is', $table, $tbody)) {
                preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $tbody[1], $rows);
                foreach ($rows[1] as $row) {
                    preg_match_all('/<td[^>]*>(.*?)<\/td>/is', $row, $cells);
                    $markdown .= '| ' . implode(' | ', array_map('strip_tags', $cells[1])) . ' |' . "\n";
                }
            }
            
            return $markdown . "\n";
        },
        $html
    );
    
    // Paragraphs
    $html = preg_replace('/<p[^>]*>(.*?)<\/p>/is', "\n$1\n", $html);
    
    // Divs
    $html = preg_replace('/<div[^>]*>(.*?)<\/div>/is', "$1\n", $html);
    
    // Remove remaining HTML tags
    $html = strip_tags($html);
    
    // Decode HTML entities
    $html = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    
    // Clean up extra newlines
    $html = preg_replace('/\n{3,}/', "\n\n", $html);
    
    // Trim whitespace
    $html = trim($html);
    
    return $html;
}
?>
