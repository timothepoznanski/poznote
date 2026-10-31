<?php
/**
 * How the AI assistant gets through a long note (issue #1710): the parts
 * get_note hands out, what has been read of a note during one answer, and the
 * exact-match replacements of replace_in_note. Pure string work, loadable on
 * its own: tests/ai-note-edit.test.php does.
 *
 * Offsets count bytes of the note's Markdown view, not characters: the limit
 * is there to bound what goes to the model, and a character of Korean weighs
 * more than a character of English there too.
 */

/** Most replacements one replace_in_note call may carry. */
const AI_NOTE_REPLACEMENTS_MAX = 200;

/** True when this byte continues a UTF-8 character rather than starting one. */
function aiNoteIsUtf8Continuation(string $content, int $offset): bool
{
    return (ord($content[$offset]) & 0xC0) === 0x80;
}

/**
 * One part of a note, at most $maxLen bytes from $offset. Never cuts inside a
 * UTF-8 character, and ends on a line end when one lies in the last quarter
 * of the part, so that a table row or a sentence is not split for nothing.
 *
 * @return array{content: string, offset: int, next_offset: ?int, total_length: int}
 *         next_offset is null on the last part. offset is the one really used.
 */
function aiNotePage(string $content, int $offset, int $maxLen): array
{
    $total = strlen($content);
    $offset = max(0, min($offset, $total));
    while ($offset > 0 && $offset < $total && aiNoteIsUtf8Continuation($content, $offset)) {
        $offset--;
    }
    if ($total - $offset <= $maxLen) {
        return ['content' => substr($content, $offset), 'offset' => $offset, 'next_offset' => null, 'total_length' => $total];
    }

    $end = $offset + max(1, $maxLen);
    while ($end > $offset && aiNoteIsUtf8Continuation($content, $end)) {
        $end--;
    }
    if ($end === $offset) {
        // A limit smaller than this one character: still move forward
        $end = $offset + 1;
        while ($end < $total && aiNoteIsUtf8Continuation($content, $end)) {
            $end++;
        }
    }
    $part = substr($content, $offset, $end - $offset);
    $lastNewline = strrpos($part, "\n");
    if ($lastNewline !== false && ($lastNewline + 1) * 4 >= strlen($part) * 3) {
        $part = substr($part, 0, $lastNewline + 1);
        $end = $offset + $lastNewline + 1;
    }
    return ['content' => $part, 'offset' => $offset, 'next_offset' => $end < $total ? $end : null, 'total_length' => $total];
}

/** @return array<int, array<string, list<array{int, int}>>> */
function &aiNoteReadLog(): array
{
    static $log = [];
    return $log;
}

/**
 * Note that the model was given this range of this version of a note. The log
 * lives as long as the request, which is also how long the model keeps the
 * tool results: the panel only sends the text of the earlier messages back.
 */
function aiNoteReadRecord(int $noteId, string $viewHash, int $start, int $end): void
{
    $log = &aiNoteReadLog();
    $log[$noteId][$viewHash][] = [$start, $end];
}

/** True when the model has been given all of this version of the note. */
function aiNoteReadIsComplete(int $noteId, string $viewHash, int $totalLength): bool
{
    $ranges = aiNoteReadLog()[$noteId][$viewHash] ?? [];
    sort($ranges);
    $reached = 0;
    foreach ($ranges as [$start, $end]) {
        if ($start > $reached) {
            return false;
        }
        $reached = max($reached, $end);
    }
    return $reached >= $totalLength;
}

function aiNoteReadReset(): void
{
    $log = &aiNoteReadLog();
    $log = [];
}

/**
 * Apply replace_in_note's list in order, all or nothing. A text that is not
 * there, or that is there several times without 'all', is an error rather than
 * a guess: the model has to say which occurrence it means.
 *
 * @return array{content: string, replaced: int}|array{error: string}
 */
function aiApplyNoteReplacements(string $content, mixed $replacements): array
{
    if (!is_array($replacements) || $replacements === []) {
        return ['error' => 'replacements must be a non-empty list of {find, replace}.'];
    }
    if (count($replacements) > AI_NOTE_REPLACEMENTS_MAX) {
        return ['error' => 'Too many replacements in one call (' . AI_NOTE_REPLACEMENTS_MAX . ' max): nothing was changed. Send them in several calls.'];
    }
    $replaced = 0;
    foreach (array_values($replacements) as $i => $item) {
        $where = 'Replacement ' . ($i + 1) . ': ';
        $find = is_array($item) ? ($item['find'] ?? null) : null;
        $replace = is_array($item) ? ($item['replace'] ?? null) : null;
        if (!is_string($find) || $find === '' || !is_string($replace)) {
            return ['error' => $where . 'find must be a non-empty text and replace a text. Nothing was changed.'];
        }
        $count = substr_count($content, $find);
        if ($count === 0) {
            return ['error' => $where . 'find was not found, it must match the text of get_note exactly. Nothing was changed.'];
        }
        $all = filter_var($item['all'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($count > 1 && !$all) {
            return ['error' => $where . 'find matches ' . $count . ' places. Include more of the surrounding text to match one, or set all to true. Nothing was changed.'];
        }
        $content = str_replace($find, $replace, $content);
        $replaced += $count;
    }
    return ['content' => $content, 'replaced' => $replaced];
}
