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
