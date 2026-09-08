<?php
/**
 * Card previews and the checklist items pulled out of a note's body.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Build a short plain-text excerpt (or task preview) for a note card.
 * Shared by the dashboard and diary board views.
 * @return array{text: string, tasks: ?array, search: string, image: ?string}
 */
function buildNoteCardPreview($noteId, $type) {
    $file = getEntryFilename($noteId, $type);
    if (!is_readable($file)) {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    if ($type === 'tasklist') {
        $json = normalizeTasklistJsonContent($raw);
        $items = json_decode($json !== '' ? $json : $raw, true);
        $tasks = [];
        $taskSearch = [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $label = trim((string)($item['text'] ?? ''));
                if ($label === '') continue;
                $taskSearch[] = $label;
                if (count($tasks) < 4) {
                    $tasks[] = ['text' => $label, 'done' => !empty($item['completed'])];
                }
            }
        }
        return ['text' => '', 'tasks' => $tasks, 'search' => implode(' ', $taskSearch), 'image' => null];
    }

    // First image of the note, shown as a card thumbnail. Only attachment
    // URLs, http(s) sources and small data URIs are kept (a multi-MB base64
    // image would bloat the page's embedded JSON).
    $image = null;
    if ($type === 'markdown') {
        if (preg_match('/!\[[^\]]*\]\(\s*([^)\s]+)/', $raw, $im)) {
            $image = $im[1];
        }
    } else {
        if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $raw, $im)) {
            $image = html_entity_decode($im[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    if ($image !== null) {
        $isSmallDataUri = stripos($image, 'data:image/') === 0 && strlen($image) < 65536;
        if (!$isSmallDataUri && !preg_match('#^(/?api/v1/notes/\d+/attachments/|https?://|attachments/)#i', $image)) {
            $image = null;
        }
    }

    if ($type === 'markdown') {
        $text = preg_replace('/```[^\n]*\n([\s\S]*?)```/', ' $1 ', $raw);
        $text = preg_replace('/^#{1,6}\s+/m', '', $text);
        $text = preg_replace('/!\[[^\]]*\]\([^)]*\)/', ' ', $text);
        $text = preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $text);
        $text = str_replace(['**', '__', '*', '`', '> '], ' ', $text);
    } else {
        // HTML notes: turn line-breaking tags into newlines before stripping
        // so the excerpt keeps the note's line structure.
        $text = preg_replace('/<br\s*\/?>/i', "\n", $raw);
        $text = preg_replace('/<\/?(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table)(\s[^>]*)?>/i', "\n", $text);
    }

    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = str_replace("\r", '', $text);
    // Collapse spaces but keep single line breaks: views that want them render
    // the excerpt with white-space: pre-line (diary), others show spaces.
    $text = preg_replace('/[^\S\n]+/u', ' ', $text);
    $text = preg_replace('/ ?\n ?/u', "\n", $text);
    $text = preg_replace('/\n{2,}/u', "\n", $text);
    $text = trim((string)$text);
    $previewText = $text;
    if ($previewText !== '' && mb_strlen($previewText, 'UTF-8') > 220) {
        $previewText = rtrim(mb_substr($previewText, 0, 220, 'UTF-8')) . '…';
    }

    $search = preg_replace('/\s+/u', ' ', $text);
    return ['text' => $previewText, 'tasks' => null, 'search' => $search, 'image' => $image];
}

/**
 * Checklist items of a regular (HTML or markdown) note, in document order,
 * as the global tasks page lists them next to the tasklist notes.
 *
 * Each item is ['index' => int, 'text' => string, 'completed' => bool]. The
 * index is what the client uses to toggle the item back in the note source,
 * so it must be computed the same way on both sides:
 *   - HTML notes: the ordinal of the item's <input class="checklist-checkbox">
 *     among all such inputs of the note (js: input.checklist-checkbox);
 *   - markdown notes: the 0-based line number of the "- [ ] text" line.
 * Items with an empty label are skipped but still consume an index.
 *
 * @return array<int, array{index:int, text:string, completed:bool}>
 */
function extractNoteChecklistItems(string $content, string $type): array {
    if ($type === 'markdown') {
        return extractMarkdownChecklistItems($content);
    }
    if ($type === 'note') {
        return extractHtmlChecklistItems($content);
    }
    return [];
}

/**
 * Checklist items of an HTML note (see extractNoteChecklistItems). The
 * checkbox markup is the one js/checklist.js writes: the checked state lives
 * in data-checked when present (the editor keeps it in sync), otherwise in
 * the checked attribute (the sanitizer only persists the latter). The item
 * label is the text following the checkbox up to the end of its <li>, the
 * start of a nested list, or the next checkbox.
 */
function extractHtmlChecklistItems(string $html): array {
    if ($html === '' || stripos($html, 'checklist-checkbox') === false) {
        return [];
    }
    if (!preg_match_all('/<input\b[^>]*>/i', $html, $matches, PREG_OFFSET_CAPTURE)) {
        return [];
    }

    $items = [];
    $index = 0;
    foreach ($matches[0] as $match) {
        $tag = $match[0];
        if (!preg_match('/\bclass\s*=\s*["\']([^"\']*)["\']/i', $tag, $classMatch)
            || !preg_match('/(?:^|\s)checklist-checkbox(?:\s|$)/', $classMatch[1])) {
            continue;
        }

        $rest = substr($html, $match[1] + strlen($tag));
        $end = preg_match('/<(?:ul|ol)\b|<\/li\s*>|<input\b/i', $rest, $endMatch, PREG_OFFSET_CAPTURE)
            ? $endMatch[0][1]
            : strlen($rest);
        $text = html_entity_decode(strip_tags(substr($rest, 0, $end)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string)preg_replace('/\s+/u', ' ', str_replace(["\u{200B}", "\u{00A0}"], ' ', $text)));

        if (preg_match('/\sdata-checked=["\']?([01])/i', $tag, $dataChecked)) {
            $completed = $dataChecked[1] === '1';
        } else {
            $completed = (bool)preg_match('/\schecked(?=[\s>=\/])/i', $tag);
        }

        if ($text !== '') {
            $items[] = ['index' => $index, 'text' => $text, 'completed' => $completed];
        }
        $index++;
    }

    return $items;
}

/**
 * Task list items of a markdown note (see extractNoteChecklistItems): every
 * "- [ ] text" / "- [x] text" line outside fenced code blocks, matched with
 * the same pattern as markdown_parser.php. The index is the line number in
 * the "\n"-split source, which is how the client addresses the line again.
 */
function extractMarkdownChecklistItems(string $markdown): array {
    if ($markdown === '' || (strpos($markdown, '[ ]') === false && stripos($markdown, '[x]') === false)) {
        return [];
    }

    $items = [];
    $inFence = false;
    $lines = explode("\n", $markdown);
    foreach ($lines as $lineNumber => $rawLine) {
        $line = rtrim($rawLine, "\r");
        if (preg_match('/^\s*(```|~~~)/', $line)) {
            $inFence = !$inFence;
            continue;
        }
        if ($inFence) {
            continue;
        }
        if (!preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $line, $m)) {
            continue;
        }
        // Plain-text label: links keep their text, emphasis/code markers go
        $text = preg_replace('/!?\[([^\]]*)\]\([^)]*\)/', '$1', $m[3]);
        $text = str_replace(['**', '__', '~~', '`'], '', (string)$text);
        $text = trim((string)preg_replace('/\s+/u', ' ', $text));
        if ($text === '') {
            continue;
        }
        $items[] = [
            'index'     => (int)$lineNumber,
            'text'      => $text,
            'completed' => strtolower($m[2]) === 'x',
        ];
    }

    return $items;
}
