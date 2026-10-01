<?php
/**
 * Reading and normalising the JSON a tasklist note stores.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Normalize tasklist storage content to a JSON array string.
 *
 * Older tasklists may be wrapped in HTML/XML markup while the database entry
 * still contains valid raw JSON. This helper extracts and normalizes the JSON
 * payload so callers can safely prefer a valid representation.
 *
 * @param mixed $content Raw stored tasklist content.
 * @return string Normalized JSON array string, or an empty string when invalid.
 */
function normalizeTasklistJsonContent($content) {
    if (!is_string($content)) {
        return '';
    }

    $candidates = [];
    $seen = [];

    $addCandidate = static function ($value) use (&$candidates, &$seen) {
        if (!is_string($value)) {
            return;
        }

        $value = preg_replace('/^\xEF\xBB\xBF/', '', $value);
        $value = trim($value);

        if ($value === '' || isset($seen[$value])) {
            return;
        }

        $seen[$value] = true;
        $candidates[] = $value;
    };

    $extractJsonSegments = static function ($value) use (&$addCandidate) {
        if (!is_string($value) || $value === '') {
            return;
        }

        $firstBracket = strpos($value, '[');
        $lastBracket = strrpos($value, ']');
        if ($firstBracket !== false && $lastBracket !== false && $lastBracket > $firstBracket) {
            $addCandidate(substr($value, $firstBracket, $lastBracket - $firstBracket + 1));
        }

        $firstBrace = strpos($value, '{');
        $lastBrace = strrpos($value, '}');
        if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
            $addCandidate(substr($value, $firstBrace, $lastBrace - $firstBrace + 1));
        }
    };

    $decodedHtml = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $withoutXml = preg_replace('/<\?xml[^>]*\?>/i', '', $decodedHtml);
    $strippedText = trim(strip_tags($withoutXml));

    $addCandidate($content);
    $addCandidate($decodedHtml);
    $addCandidate($strippedText);
    $extractJsonSegments($content);
    $extractJsonSegments($decodedHtml);
    $extractJsonSegments($strippedText);

    foreach ($candidates as $candidate) {
        $decoded = json_decode($candidate, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            continue;
        }

        if (is_array($decoded) && isset($decoded['tasks']) && is_array($decoded['tasks'])) {
            $decoded = $decoded['tasks'];
        }

        if (!is_array($decoded)) {
            continue;
        }

        if ($decoded !== [] && !isset($decoded[0])) {
            continue;
        }

        $decoded = array_values(array_map(static function ($task) {
            if (!is_array($task)) {
                return $task;
            }

            $task['completed'] = !empty($task['completed']) || !empty($task['checked']) || !empty($task['done']);

            if (!isset($task['text']) && isset($task['content'])) {
                $task['text'] = (string) $task['content'];
            }

            unset($task['checked'], $task['done']);

            if (array_key_exists('subtasks', $task)) {
                $task['subtasks'] = normalizeTasklistSubtasks($task['subtasks']);
            }

            return $task;
        }, $decoded));

        $normalized = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($normalized !== false) {
            return $normalized;
        }
    }

    return '';
}

/**
 * Normalize the `subtasks` array a task may carry (one level, each entry
 * `{id, text, completed}`). Entries that are not objects are dropped, the
 * completion flag is a boolean, any other key is kept as stored.
 *
 * @param mixed $subtasks Stored value of the task's `subtasks` key.
 * @return array<int, array<string, mixed>>
 */
function normalizeTasklistSubtasks($subtasks): array {
    if (!is_array($subtasks)) {
        return [];
    }

    $normalized = [];
    foreach ($subtasks as $subtask) {
        if (!is_array($subtask)) {
            continue;
        }

        $subtask['completed'] = !empty($subtask['completed']) || !empty($subtask['checked']) || !empty($subtask['done']);

        if (!isset($subtask['text']) && isset($subtask['content'])) {
            $subtask['text'] = (string) $subtask['content'];
        }

        // One level only: a subtask never carries subtasks of its own.
        unset($subtask['checked'], $subtask['done'], $subtask['subtasks']);

        $normalized[] = $subtask;
    }

    return $normalized;
}

/**
 * Subtasks of a decoded task, reduced to what a reader displays: entries
 * without text are left out.
 *
 * @param mixed $task Decoded task.
 * @return array<int, array{id: mixed, text: string, completed: bool}>
 */
function getTasklistSubtasks($task): array {
    if (!is_array($task) || !isset($task['subtasks'])) {
        return [];
    }

    $subtasks = [];
    foreach (normalizeTasklistSubtasks($task['subtasks']) as $subtask) {
        $text = $subtask['text'] ?? '';
        $text = is_scalar($text) ? trim((string) $text) : '';
        if ($text === '') {
            continue;
        }

        $subtasks[] = [
            'id' => is_scalar($subtask['id'] ?? null) ? $subtask['id'] : null,
            'text' => $text,
            'completed' => $subtask['completed'],
        ];
    }

    return $subtasks;
}

/**
 * Position, in the stored `subtasks` array of a task, of the subtask that
 * getTasklistSubtasks() lists at $displayIndex: what a page that rendered the
 * list sends back to designate one of them. Null when there is none.
 *
 * @param mixed $task Decoded task.
 * @return int|string|null
 */
function resolveTasklistSubtaskKey($task, int $displayIndex) {
    if (!is_array($task) || !isset($task['subtasks']) || !is_array($task['subtasks'])) {
        return null;
    }

    $position = 0;
    foreach ($task['subtasks'] as $key => $subtask) {
        if (!is_array($subtask)) {
            continue;
        }
        $text = $subtask['text'] ?? ($subtask['content'] ?? '');
        if (!is_scalar($text) || trim((string) $text) === '') {
            continue;
        }
        if ($position === $displayIndex) {
            return $key;
        }
        $position++;
    }

    return null;
}

/**
 * Static markup of a task's subtasks for the read-only renderings (exports,
 * trash, shared pages), placed inside the task's `.task-item`. Empty string
 * when the task has none.
 *
 * The class names deliberately avoid the substrings "task-item" and
 * "task-text": extractTaskListFromHTML() finds the tasks of an imported page
 * with contains() on those.
 *
 * @param mixed $task Decoded task.
 * @param callable|null $formatText Turns a subtask label into safe HTML
 *        (defaults to htmlspecialchars).
 * @param callable|null $checkboxAttributes Receives the subtask position (the
 *        one resolveTasklistSubtaskKey() takes) and returns extra attributes
 *        for its checkbox (defaults to " disabled").
 */
function renderTasklistSubtasksHtml($task, ?callable $formatText = null, ?callable $checkboxAttributes = null): string {
    $subtasks = getTasklistSubtasks($task);
    if ($subtasks === []) {
        return '';
    }

    $html = '<div class="task-subtasks">';
    foreach ($subtasks as $index => $subtask) {
        $text = $formatText !== null
            ? $formatText($subtask['text'])
            : htmlspecialchars($subtask['text'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $attributes = $checkboxAttributes !== null ? $checkboxAttributes($index) : ' disabled';

        $html .= '<div class="task-subitem' . ($subtask['completed'] ? ' completed' : '') . '">';
        $html .= '<input type="checkbox" class="task-subitem-checkbox"' . ($subtask['completed'] ? ' checked' : '') . $attributes . ' /> ';
        $html .= '<span class="task-subitem-text">' . $text . '</span>';
        $html .= '</div>';
    }
    $html .= '</div>';

    return $html;
}

/**
 * Pick the first valid tasklist payload between file storage and database.
 *
 * @param mixed $primaryContent Preferred content, typically file storage.
 * @param mixed $fallbackContent Fallback content, typically database storage.
 * @return string Best-effort tasklist content.
 */
function resolveTasklistStoredContent($primaryContent, $fallbackContent = '') {
    $normalizedPrimary = normalizeTasklistJsonContent($primaryContent);
    if ($normalizedPrimary !== '') {
        return $normalizedPrimary;
    }

    $normalizedFallback = normalizeTasklistJsonContent($fallbackContent);
    if ($normalizedFallback !== '') {
        return $normalizedFallback;
    }

    return (string) ($fallbackContent !== '' ? $fallbackContent : $primaryContent);
}
