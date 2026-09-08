<?php
/**
 * Default note titles and the uniqueness rule applied to a new one.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Default note titles as they may already be stored in existing databases,
 * derived from src/i18n/* index.note.new_note values.
 */
function getDefaultNoteTitles(): array {
    static $titles = null;

    if ($titles === null) {
        $titles = [];
        foreach (glob(__DIR__ . '/i18n/*.json') ?: [] as $file) {
            $lang = basename($file, '.json');
            $dict = loadI18nDictionary($lang);
            $title = i18nGet($dict, 'index.note.new_note');
            if ($title !== null && trim($title) !== '') {
                $titles[] = $title;
            }
        }

        $titles = array_values(array_unique($titles));
        if (empty($titles)) {
            $titles = ['New note'];
        }
    }

    return $titles;
}

/**
 * Safe JSON payload for exposing default note titles to client scripts.
 */
function getDefaultNoteTitlesJson(): string {
    return json_encode(
        getDefaultNoteTitles(),
        JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
    ) ?: '["New note"]';
}

/**
 * Return metadata when a title is one of the localized default note titles,
 * optionally with a numeric suffix like " (2)".
 */
function matchDefaultNoteTitle($title): ?array {
    $normalizedTitle = trim((string)$title);
    if ($normalizedTitle === '') {
        return null;
    }

    foreach (getDefaultNoteTitles() as $defaultTitle) {
        $pattern = '/^' . preg_quote($defaultTitle, '/') . '(?: \((\d+)\))?$/u';
        if (preg_match($pattern, $normalizedTitle, $matches)) {
            return [
                'title' => $defaultTitle,
                'number' => $matches[1] ?? null,
            ];
        }
    }

    return null;
}

/**
 * Translate stored default note titles to the current UI language.
 */
function translateDefaultNoteTitle($title): string {
    $match = matchDefaultNoteTitle($title);
    if ($match === null) {
        return (string)$title;
    }

    if ($match['number'] !== null && $match['number'] !== '') {
        return t('index.note.new_note_numbered', ['number' => $match['number']], 'New note (' . $match['number'] . ')');
    }

    return t('index.note.new_note', [], 'New note');
}

/**
 * Generate a unique note title to prevent duplicates
 * Default to "New note" when empty.
 * If a title already exists, add a numeric suffix like " (1)", " (2)", ...
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null, $folder_id = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = t('index.note.new_note', [], 'New note');
    }
    
    // Check if title already exists (excluding the current note if updating)
    // Uniqueness is scoped to folder + workspace
    $query = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0";
    $params = [$title];

    // Check uniqueness within the same folder
    if ($folder_id !== null) {
        $query .= " AND folder_id = ?";
        $params[] = $folder_id;
    } else {
        $query .= " AND folder_id IS NULL";
    }

    // If workspace specified, restrict uniqueness to that workspace
    if ($workspace !== null) {
        $query .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    if ($excludeId !== null) {
        $query .= " AND id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $count = $stmt->fetchColumn();
    
    // If no duplicate, return the title as is
    if ($count == 0) {
        return $title;
    }
    
    // If duplicate exists, add a number suffix
    $counter = 1;
    $baseTitle = $title;
    
    do {
        $title = $baseTitle . ' (' . $counter . ')';
        
    $stmt = $con->prepare($query);
    $params[0] = $title; // Update the title in params
    $stmt->execute($params);
        $count = $stmt->fetchColumn();
        
        $counter++;
    } while ($count > 0);
    
    return $title;
}
