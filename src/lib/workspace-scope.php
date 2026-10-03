<?php
/**
 * Which notes and folders does a request name?
 *
 * A session opened on a workspace someone shared runs against the owner's
 * database and must stay inside that workspace. auth.php checks every note or
 * folder id a request carries against it (enforceSharedWorkspaceScopeOnRequest),
 * and this module is the part that finds those ids.
 *
 * The check and the handler must read the same request. The handlers are
 * lenient: the router hands any path segment over, they cast with intval() or
 * accept whatever is_numeric() does, and they decode a JSON body whatever its
 * Content-Type. So an id counts here only in its plain decimal spelling, and
 * a value a handler could still turn into a number ("12abc", "+12", "1e1",
 * "12.0", a list where one id is expected) makes the whole request refused
 * instead of being skipped as "not an id".
 *
 * Pure functions on purpose: no session, no database, see
 * tests/workspace-scope.test.php.
 */

/** Parameters that name a note. */
const POZNOTE_SCOPE_NOTE_KEYS = ['note_id', 'noteId', 'note_ids', 'target_note_id', 'linked_note_id', 'source_note_id', 'original_note_id', 'note', 'select_linked_note'];

/** Parameters that name a folder. */
const POZNOTE_SCOPE_FOLDER_KEYS = ['folder_id', 'folderId', 'folder_ids', 'parent_id', 'parent_folder_id', 'source_folder_id', 'new_parent_id', 'new_parent_folder_id', 'target_folder_id', 'destination_folder_id', 'kanban', 'diary'];

/** The parameters that carry a list of ids. */
const POZNOTE_SCOPE_LIST_KEYS = ['note_ids', 'folder_ids'];

/**
 * The two parameters index.php reads behind its own "AND workspace = ?"
 * filter. A plain number in them is checked like any other id; anything else
 * is left to that filter.
 */
const POZNOTE_SCOPE_LENIENT_KEYS = ['note', 'select_linked_note'];

/** The scripts that name their note "id". */
const POZNOTE_SCOPE_ID_SCRIPTS = ['api_export_note.php', 'api_download_note.php'];

/**
 * Collect the ids found under $keys in one source of parameters.
 *
 * @param array $source $_GET, $_POST or a decoded JSON body
 * @param string[] $keys
 * @param int[] $into ids are appended here
 * @return bool false when a value is not a plain id but could be read as one
 */
function poznoteScopeCollectIds(array $source, array $keys, array &$into): bool {
    foreach ($keys as $key) {
        if (!isset($source[$key])) {
            continue;
        }
        $values = $source[$key];
        $lenient = in_array($key, POZNOTE_SCOPE_LENIENT_KEYS, true);
        if (is_array($values)) {
            // intval() of a non-empty array is 1: a single id is never a list
            if (!$lenient && !in_array($key, POZNOTE_SCOPE_LIST_KEYS, true)) {
                return false;
            }
        } elseif (is_string($values) && strpos($values, ',') !== false) {
            $values = explode(',', $values);
        } else {
            $values = [$values];
        }
        foreach ($values as $value) {
            if (!is_scalar($value)) {
                if ($lenient) {
                    continue;
                }
                return false;
            }
            $text = trim((string)$value);
            if ($text === '') {
                continue;
            }
            if (ctype_digit($text)) {
                if ((int)$text > 0) {
                    $into[] = (int)$text;
                }
                continue;
            }
            // Not a plain number, yet a cast or a comparison in SQL would
            // still read one out of it
            if (!$lenient && ((int)$text !== 0 || is_numeric($text))) {
                return false;
            }
        }
    }

    return true;
}

/**
 * The note and folder ids a request names, in its API path and in its
 * parameters.
 *
 * @param string $path Path of the request URI, without the query string
 * @param array $get $_GET
 * @param array $post $_POST
 * @param array $body The JSON body, decoded, or [] when there is none
 * @param string $scriptBaseName basename of SCRIPT_NAME
 * @return array{notes: int[], folders: int[]}|null null when the request
 *         carries an id that is not a plain number and must be refused
 */
function poznoteScopeRequestIds(string $path, array $get, array $post, array $body, string $scriptBaseName): ?array {
    $noteIds = [];
    $folderIds = [];

    // The id segment of an API path: a plain number is an id, a word is one
    // of the fixed routes (/notes/search, /folders/counts) and names no row.
    if (preg_match('#/api/v1/(notes|folders|trash)/([^/]+)#', $path, $m)) {
        if (ctype_digit($m[2])) {
            if ($m[1] === 'folders') {
                $folderIds[] = (int)$m[2];
            } else {
                $noteIds[] = (int)$m[2];
            }
        } elseif (!preg_match('/^[A-Za-z][A-Za-z0-9_-]*$/', $m[2])) {
            return null;
        }
    }

    foreach ([$get, $post, $body] as $source) {
        if (!poznoteScopeCollectIds($source, POZNOTE_SCOPE_NOTE_KEYS, $noteIds)
            || !poznoteScopeCollectIds($source, POZNOTE_SCOPE_FOLDER_KEYS, $folderIds)) {
            return null;
        }
    }
    if (in_array($scriptBaseName, POZNOTE_SCOPE_ID_SCRIPTS, true) && !poznoteScopeCollectIds($get, ['id'], $noteIds)) {
        return null;
    }

    return [
        'notes' => array_values(array_unique($noteIds)),
        'folders' => array_values(array_unique($folderIds)),
    ];
}
