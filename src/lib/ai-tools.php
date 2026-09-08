<?php
/**
 * Everything the AI assistant can do to the user's data.
 *
 * Split out of api_ai_chat.php, which was a 2 213-line entry point carrying a
 * whole library. That file now keeps only the HTTP and streaming concerns; the
 * tool handlers and their helpers live here, outside the docroot.
 *
 * aiExecuteTool() dispatches to one aiTool*() handler per tool. It used to be a
 * single 760-line function with 22 `if ($name === ...)` branches in a row.
 */

// Declared rather than assumed. These used to be loaded by api_ai_chat.php
// before it reached this code, which made the file impossible to load or test
// on its own. auth.php comes first because it configures the session cookie
// before starting the session, exactly as the entry points do; require_once
// makes all of this a no-op when a page has already loaded them.
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../markdown_parser.php';
require_once __DIR__ . '/../html_to_markdown.php';

define('AI_NOTE_READ_LIMIT', 16000);
define('AI_INLINE_IMAGE_PREFIX', '/poznote-inline-image/');

/**
 * Markdown view of a rich-text note for the model, produced by the same
 * converter as the "Convert to Markdown" action so that headings, lists,
 * links, tables and images survive a read-modify-write (the plain text of
 * strip_tags lost them all, and the model then wrote Markdown syntax into
 * the HTML note). Inline base64 images would eat the whole read budget:
 * they are swapped for short placeholders that aiRestoreInlineImages() maps
 * back when the note is written.
 */
function aiHtmlToMarkdown($html) {
    $n = 0;
    $html = preg_replace_callback('/(<img\b[^>]*\bsrc=["\'])data:image\/[^"\']*(["\'])/i', function ($m) use (&$n) {
        $n++;
        return $m[1] . AI_INLINE_IMAGE_PREFIX . $n . $m[2];
    }, $html);
    return poznoteHtmlToMarkdown($html);
}

/**
 * Put the inline images of the stored note back where the model kept their
 * placeholders. A placeholder whose image no longer exists is left as is.
 */
function aiRestoreInlineImages($html, $storedHtml) {
    preg_match_all('/<img\b[^>]*\bsrc=["\'](data:image\/[^"\']*)["\']/i', $storedHtml, $m);
    $sources = $m[1];
    return preg_replace_callback('~' . preg_quote(AI_INLINE_IMAGE_PREFIX, '~') . '(\d+)~', function ($mm) use ($sources) {
        return $sources[(int)$mm[1] - 1] ?? $mm[0];
    }, $html);
}

/**
 * True when the model sent HTML rather than the Markdown it was asked for:
 * parseMarkdown() would escape the tags into visible text.
 */
function aiLooksLikeHtml($content) {
    $content = ltrim((string)$content);
    return $content !== '' && $content[0] === '<'
        && preg_match('/<\/(p|div|h[1-6]|ul|ol|li|table|blockquote|pre)>/i', $content) === 1;
}

/**
 * Read a note's content as Markdown (task lists and rich-text HTML notes
 * converted). The result's 'format' says what the note itself is.
 * Returns null if the note doesn't exist, is trashed, or (when $workspace is
 * given) belongs to another workspace.
 */
function aiReadNote($con, $noteId, $maxLen = 24000, $workspace = '') {
    $stmt = $con->prepare('SELECT id, heading, entry, type, tags, folder, folder_id, workspace, created, updated, favorite, reminder_at, reminder_recurrence FROM entries WHERE id = ? AND trash = 0' . ($workspace !== '' ? ' AND workspace = ?' : ''));
    $stmt->execute($workspace !== '' ? [intval($noteId), $workspace] : [intval($noteId)]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) return null;

    $noteType = $note['type'] ?? 'note';
    $filename = getEntryFilename($note['id'], $noteType);
    $content = is_readable($filename) ? (string)file_get_contents($filename) : (string)($note['entry'] ?? '');

    $format = 'markdown';
    $tasks = null;
    $checklist = null;
    if ($noteType === 'tasklist') {
        $format = 'tasklist';
        $items = json_decode(resolveTasklistStoredContent($content, $note['entry'] ?? ''), true);
        if (is_array($items) && isset($items['tasks']) && is_array($items['tasks'])) $items = $items['tasks'];
        if (is_array($items)) {
            $lines = [];
            $tasks = [];
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $lines[] = (!empty($item['completed']) ? '[x] ' : '[ ] ') . (string)($item['text'] ?? '');
                $tasks[] = aiTaskView($item);
            }
            $content = implode("\n", $lines);
        }
    } elseif ($noteType === 'note' || $noteType === 'markdown') {
        // Checkboxes the model can flip one by one with set_checklist_item
        // (the index is what that tool takes)
        $items = extractNoteChecklistItems($content, $noteType);
        if ($items !== []) {
            $checklist = $items;
        }
    }
    if ($noteType === 'note' || $noteType === 'html') {
        $format = 'html';
        $content = aiHtmlToMarkdown($content);
    } elseif ($noteType !== 'markdown') {
        // Other types (drawings, ...): readable plain text
        $format = $noteType;
        $content = preg_replace('/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/i', "\n", $content);
        $content = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    $truncated = false;
    if (strlen($content) > $maxLen) {
        $content = substr($content, 0, $maxLen);
        $truncated = true;
    }

    $result = [
        'id' => (int)$note['id'],
        'title' => (string)($note['heading'] ?? 'Untitled'),
        'tags' => aiParseTags($note['tags'] ?? ''),
        'folder' => $note['folder_id'] !== null ? aiFolderPath($con, (int)$note['folder_id']) : '',
        'favorite' => (int)($note['favorite'] ?? 0) === 1,
        'workspace' => (string)($note['workspace'] ?? ''),
        'created' => aiUtcToLocal((string)($note['created'] ?? '')),
        'updated' => aiUtcToLocal((string)($note['updated'] ?? '')),
        'reminder_at' => aiUtcToLocal($note['reminder_at'] ?? null),
        'format' => $format,
        'content' => $content,
        'truncated' => $truncated,
    ];
    if ($result['reminder_at'] !== null && !empty($note['reminder_recurrence'])) {
        $result['reminder_recurrence'] = (string)$note['reminder_recurrence'];
    }
    if ($tasks !== null) {
        $result['tasks'] = $tasks;
        $result['hint'] = 'Task list note: change its tasks with add_task, update_task and delete_task (by task id or text), not with update_note_content.';
    }
    if ($checklist !== null) {
        $result['checklist'] = $checklist;
        $result['hint'] = 'The checklist items above can be checked or unchecked one at a time with set_checklist_item (by index or text) without rewriting the note.';
    }
    if ($format === 'html') {
        // Repeated next to the content: models that skim the system prompt
        // still see it right where they read the note
        $result['hint'] = 'Rich-text note shown as Markdown. To edit it, send Markdown (never HTML) to update_note_content; it is converted back.';
    }
    return $result;
}

/**
 * Tool-result error when another editor holds the note's edit lock, so the
 * assistant never overwrites a note someone is editing right now (the next
 * autosave of that editor would silently drop the AI's change anyway).
 * Null when the write may proceed.
 */
function aiNoteEditLockError(int $noteId): ?string {
    $blockingLock = getBlockingNoteEditLock(
        (int)(getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0)),
        $noteId,
        (int)(getAuthenticatedUserId() ?? getCurrentUserId() ?? ($_SESSION['user_id'] ?? 0))
    );
    if ($blockingLock === null) {
        return null;
    }
    return json_encode([
        'error' => 'This note is currently being edited by ' . describeNoteEditLockHolder($blockingLock)
            . '. It cannot be modified until they are done.',
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Move a note to the trash the way the REST API does (NotesController::delete):
 * the shortcuts pointing at it go along. Returns how many shortcuts followed.
 */
function aiTrashNote(PDO $con, int $noteId, $actorUserId): int {
    $now = gmdate('Y-m-d H:i:s');
    $update = $con->prepare('UPDATE entries SET trash = 1, trashed_at = ?, updated = ?, updated_by_user_id = ? WHERE id = ? AND trash = 0');
    $linked = $con->prepare('SELECT id FROM entries WHERE linked_note_id = ? AND trash = 0');
    $linked->execute([$noteId]);
    $followed = 0;
    foreach ($linked->fetchAll(PDO::FETCH_COLUMN) as $linkedId) {
        $update->execute([$now, $now, $actorUserId, (int)$linkedId]);
        $followed++;
    }
    $update->execute([$now, $now, $actorUserId, $noteId]);
    return $followed;
}

/** A folder and every descendant, parents first (FoldersController::getAllFolderIds). */
function aiFolderSubtreeIds(PDO $con, int $folderId, string $workspace): array {
    $ids = [$folderId];
    $stmt = $con->prepare('SELECT id FROM folders WHERE parent_id = ? AND workspace = ?');
    $stmt->execute([$folderId, $workspace]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $childId) {
        $ids = array_merge($ids, aiFolderSubtreeIds($con, (int)$childId, $workspace));
    }
    return $ids;
}

/** "Parent/Child" path of a folder, '' for the root. */
function aiFolderPath(PDO $con, $folderId): string {
    $parts = [];
    $stmt = $con->prepare('SELECT name, parent_id FROM folders WHERE id = ?');
    $guard = 0;
    while ($folderId !== null && (int)$folderId > 0 && $guard++ < 50) {
        $stmt->execute([(int)$folderId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) break;
        array_unshift($parts, (string)$row['name']);
        $folderId = $row['parent_id'] !== null ? (int)$row['parent_id'] : null;
    }
    return implode('/', $parts);
}

/**
 * The folder the model names: an id, or a path ("Work/2026") matched
 * case-insensitively segment by segment from the root. A bare name that is
 * not a root folder also matches a nested folder when exactly one carries
 * it. Returns the folders row (id, name, parent_id, favorite) or null.
 */
function aiResolveFolder(PDO $con, string $workspace, $ref): ?array {
    if (is_int($ref) || (is_string($ref) && ctype_digit(trim($ref)))) {
        $stmt = $con->prepare('SELECT id, name, parent_id, favorite FROM folders WHERE id = ? AND workspace = ?');
        $stmt->execute([(int)$ref, $workspace]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) return $row;
    }
    $path = trim((string)$ref, " /\t\n\r");
    if ($path === '') return null;
    $segments = array_values(array_filter(array_map('trim', explode('/', $path)), fn($s) => $s !== ''));
    $parentId = null;
    $row = null;
    foreach ($segments as $i => $segment) {
        $sql = 'SELECT id, name, parent_id, favorite FROM folders WHERE workspace = ? AND name = ? COLLATE NOCASE AND '
            . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?');
        $params = $parentId === null ? [$workspace, $segment] : [$workspace, $segment, $parentId];
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            if ($i === 0 && count($segments) === 1) {
                $stmt = $con->prepare('SELECT id, name, parent_id, favorite FROM folders WHERE workspace = ? AND name = ? COLLATE NOCASE');
                $stmt->execute([$workspace, $segment]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                return count($rows) === 1 ? $rows[0] : null;
            }
            return null;
        }
        $parentId = (int)$row['id'];
    }
    return $row;
}

/** Same rules as FoldersController::validateFolderSegment. Error text or null. */
function aiValidateFolderName(string $name): ?string {
    $name = trim($name);
    if ($name === '') return 'Folder name is required';
    if (strlen($name) > 255) return 'Folder name too long (max 255 characters)';
    foreach (['/', '\\', ':', '*', '?', '"', '<', '>', '|'] as $char) {
        if (strpos($name, $char) !== false) return 'Folder name contains forbidden character: ' . $char;
    }
    if (in_array($name, ['Favorites', 'Tags', 'Trash', 'Public', '.', '..'], true)) return 'Reserved folder name: ' . $name;
    return null;
}

/** Every folder of the workspace with its path and direct note count, sorted by path. */
function aiListFolders(PDO $con, string $workspace): array {
    $stmt = $con->prepare('SELECT id, name, parent_id, favorite FROM folders WHERE workspace = ?');
    $stmt->execute([$workspace]);
    $byId = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byId[(int)$row['id']] = $row;
    }
    $counts = [];
    $countStmt = $con->prepare('SELECT folder_id, COUNT(*) AS n FROM entries WHERE trash = 0 AND workspace = ? AND folder_id IS NOT NULL GROUP BY folder_id');
    $countStmt->execute([$workspace]);
    foreach ($countStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $counts[(int)$row['folder_id']] = (int)$row['n'];
    }
    $paths = [];
    $resolve = function ($id, $depth = 0) use (&$resolve, &$byId, &$paths) {
        if (isset($paths[$id])) return $paths[$id];
        $row = $byId[$id];
        $parentId = $row['parent_id'] !== null ? (int)$row['parent_id'] : null;
        $prefix = ($parentId !== null && isset($byId[$parentId]) && $depth < 50) ? $resolve($parentId, $depth + 1) . '/' : '';
        $paths[$id] = $prefix . (string)$row['name'];
        return $paths[$id];
    };
    $folders = [];
    foreach ($byId as $id => $row) {
        $folders[] = [
            'id' => $id,
            'path' => $resolve($id),
            'notes' => $counts[$id] ?? 0,
            'favorite' => (int)($row['favorite'] ?? 0) === 1,
        ];
    }
    usort($folders, fn($a, $b) => strnatcasecmp($a['path'], $b['path']));
    return $folders;
}

/**
 * Tags as the app stores them (NotesController::sanitizeTags): no spaces
 * inside a tag (underscores instead), no duplicates. Takes the stored
 * comma-separated string or a list from the model.
 */
function aiParseTags($raw): array {
    $parts = [];
    if (is_array($raw)) {
        foreach ($raw as $chunk) {
            foreach (explode(',', (string)$chunk) as $part) {
                $parts[] = str_replace(' ', '_', trim($part));
            }
        }
    } else {
        $parts = preg_split('/[,\s]+/', (string)$raw) ?: [];
    }
    $tags = [];
    $seen = [];
    foreach ($parts as $part) {
        $tag = trim((string)$part);
        if ($tag === '') continue;
        $key = mb_strtolower($tag);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $tags[] = $tag;
    }
    return $tags;
}

/**
 * Local date or date-time from the model ('YYYY-MM-DD', 'YYYY-MM-DD HH:MM'
 * or 'YYYY-MM-DDTHH:MM'), normalized to the task format ('YYYY-MM-DD' or
 * 'YYYY-MM-DDTHH:MM'). Null when invalid.
 */
function aiNormalizeLocalDateTime($value): ?string {
    if (!is_string($value)) return null;
    $value = trim($value);
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?(?::\d{2})?$/', $value, $m)) return null;
    if (!checkdate((int)substr($m[1], 5, 2), (int)substr($m[1], 8, 2), (int)substr($m[1], 0, 4))) return null;
    if (!empty($m[2])) {
        [$h, $i] = explode(':', $m[2]);
        if ((int)$h > 23 || (int)$i > 59) return null;
        return $m[1] . 'T' . $m[2];
    }
    return $m[1];
}

/**
 * Local 'YYYY-MM-DD[THH:MM]' in the user's timezone to a UTC 'Y-m-d H:i:s'.
 * A date without a time fires at 09:00 local, matching the UI default.
 */
function aiLocalToUtc(string $local): ?string {
    $local = strlen($local) > 10 ? $local . ':00' : $local . 'T09:00:00';
    try {
        $timezone = new DateTimeZone(getUserTimezone());
        return (new DateTime($local, $timezone))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return null;
    }
}

/** UTC 'Y-m-d H:i:s' from the database to the user's local 'Y-m-d H:i'. */
function aiUtcToLocal($utc): ?string {
    if (!is_string($utc) || trim($utc) === '') return null;
    try {
        return (new DateTime($utc, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone(getUserTimezone()))->format('Y-m-d H:i');
    } catch (Exception $e) {
        return $utc;
    }
}

/** '<count><unit>' recurrence (RemindersController::normalizeRecurrence): null for none, false when invalid. */
function aiNormalizeRecurrence($value) {
    if ($value === null) return null;
    if (!is_string($value)) return false;
    $value = strtolower(trim($value));
    if ($value === '' || $value === 'none') return null;
    return preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', $value) ? $value : false;
}

/**
 * Render a task id the way it appears in the stored JSON: ids are JS floats
 * such as 1786657214842.3545, which a plain string cast would round.
 */
function aiTaskIdToString($id): string {
    if (is_float($id)) return json_encode($id);
    return is_scalar($id) ? (string)$id : '';
}

/**
 * Tasklist note of the workspace with its raw task array (every stored key
 * kept, so a write from here loses nothing the editor wrote), or a JSON
 * error string.
 */
function aiLoadTasklist(PDO $con, int $noteId, string $workspace) {
    $stmt = $con->prepare('SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $workspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    if (($note['type'] ?? '') !== 'tasklist') {
        return json_encode(['error' => 'This note is not a task list (type "' . $note['type'] . '"). For the checkboxes of a regular note use set_checklist_item; for its text use update_note_content.']);
    }
    $filename = getEntryFilename($noteId, 'tasklist');
    $fileContent = is_file($filename) ? (string)@file_get_contents($filename) : '';
    $tasks = json_decode(resolveTasklistStoredContent($fileContent, (string)($note['entry'] ?? '')), true);
    if (!is_array($tasks)) $tasks = [];
    if (isset($tasks['tasks']) && is_array($tasks['tasks'])) $tasks = $tasks['tasks'];
    if ($tasks !== [] && !isset($tasks[0])) $tasks = [];
    $note['tasks'] = array_values(array_filter($tasks, 'is_array'));
    return $note;
}

/**
 * The task the model refers to, by id or by text (exact match first, then a
 * unique substring, both case-insensitive). Index in $tasks, or null when
 * nothing or several tasks match.
 */
function aiFindTaskIndex(array $tasks, $ref): ?int {
    $needle = trim((string)$ref);
    if ($needle === '') return null;
    foreach ($tasks as $i => $task) {
        if (isset($task['id']) && aiTaskIdToString($task['id']) === $needle) return (int)$i;
    }
    $lower = mb_strtolower($needle);
    foreach ($tasks as $i => $task) {
        if (mb_strtolower(trim((string)($task['text'] ?? ''))) === $lower) return (int)$i;
    }
    $found = null;
    foreach ($tasks as $i => $task) {
        if (mb_strpos(mb_strtolower((string)($task['text'] ?? '')), $lower) !== false) {
            if ($found !== null) return null;
            $found = (int)$i;
        }
    }
    return $found;
}

/** Important incomplete, then incomplete, then completed: the order the UI keeps (js/tasklist-core.js). */
function aiRegroupTasks(array $tasks): array {
    $important = [];
    $normal = [];
    $completed = [];
    foreach ($tasks as $task) {
        if (!empty($task['completed'])) $completed[] = $task;
        elseif (!empty($task['important'])) $important[] = $task;
        else $normal[] = $task;
    }
    return array_merge($important, $normal, $completed);
}

/** A task id in the frontend's format (float timestamp), unique in the list. */
function aiGenerateTaskId(array $tasks) {
    $existing = [];
    foreach ($tasks as $task) {
        if (isset($task['id'])) $existing[aiTaskIdToString($task['id'])] = true;
    }
    do {
        $candidate = round(microtime(true) * 1000) + (mt_rand(1, 999999) / 1000000);
    } while (isset($existing[aiTaskIdToString($candidate)]));
    return $candidate;
}

/** What the model sees of a task. */
function aiTaskView(array $task): array {
    $view = [
        'id' => isset($task['id']) ? aiTaskIdToString($task['id']) : '',
        'text' => (string)($task['text'] ?? ''),
        'completed' => !empty($task['completed']),
        'important' => !empty($task['important']),
    ];
    $dueAt = $task['dueAt'] ?? null;
    if (is_string($dueAt) && preg_match('/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/', $dueAt, $m)) {
        $view['due_at'] = substr($dueAt, 0, empty($m[1]) ? 10 : 16);
        $view['reminder'] = !empty($task['dueReminder']);
        if (!empty($task['dueRecurrence'])) $view['recurrence'] = (string)$task['dueRecurrence'];
    }
    return $view;
}

/**
 * Write the tasks back (file and database), unless another editor holds the
 * note. JSON error string, or null when written.
 */
function aiPersistTasks(PDO $con, int $noteId, array $tasks, $actorUserId): ?string {
    $lockError = aiNoteEditLockError($noteId);
    if ($lockError !== null) return $lockError;
    $content = json_encode(array_values($tasks), JSON_UNESCAPED_UNICODE);
    if ($content === false) return json_encode(['error' => 'Failed to encode tasks']);
    $filename = getEntryFilename($noteId, 'tasklist');
    $existingBytes = is_file($filename) ? (int)filesize($filename) : 0;
    $quotaError = poznoteCheckStorageQuota(strlen($content) - $existingBytes);
    if ($quotaError !== null) return json_encode(['error' => $quotaError]);
    createDirectoryWithPermissions(dirname($filename));
    if (file_put_contents($filename, $content) === false) return json_encode(['error' => 'Failed to write note file']);
    $con->prepare('UPDATE entries SET entry = ?, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([$content, gmdate('Y-m-d H:i:s'), $actorUserId, $noteId]);
    return null;
}

function aiDeleteTaskReminder(PDO $con, int $noteId, string $taskId) {
    $con->prepare('DELETE FROM notifications WHERE note_id = ? AND task_id = ? AND dismissed = 0')->execute([$noteId, $taskId]);
}

/**
 * Pending notification of a task, rewritten from its due date and reminder
 * flag (TasksController::syncTaskReminder). In-app only: the assistant never
 * opts a task into email delivery.
 */
function aiSyncTaskReminder(PDO $con, int $noteId, array $task) {
    $taskId = isset($task['id']) ? aiTaskIdToString($task['id']) : '';
    if ($taskId === '') return;
    aiDeleteTaskReminder($con, $noteId, $taskId);
    $dueAt = $task['dueAt'] ?? null;
    if (empty($task['dueReminder']) || !is_string($dueAt) || $dueAt === '' || !empty($task['completed'])) return;
    $triggerAt = aiLocalToUtc($dueAt);
    if ($triggerAt === null) return;
    $recurrence = $task['dueRecurrence'] ?? null;
    if (!is_string($recurrence) || !preg_match('/^[1-9]\d{0,2}[ihdwmy]$/', $recurrence)) $recurrence = null;
    $con->prepare("INSERT INTO notifications (note_id, task_id, type, message, trigger_at, email_enabled, recurrence, created) VALUES (?, ?, 'reminder', ?, ?, 0, ?, datetime('now'))")
        ->execute([$noteId, $taskId, (string)($task['text'] ?? ''), $triggerAt, $recurrence]);
}

/**
 * Flip one "- [ ]" line of a markdown note. $index is the line number, as
 * extractMarkdownChecklistItems() reports it. Null when that line is not a
 * checklist item.
 */
function aiSetMarkdownChecklistLine(string $content, int $index, bool $completed): ?string {
    $lines = explode("\n", $content);
    if (!isset($lines[$index])) return null;
    $line = rtrim($lines[$index], "\r");
    if (!preg_match('/^(\s*[\*\-\+]\s+)\[[ xX]\](\s+.*)$/', $line, $m)) return null;
    $lines[$index] = $m[1] . ($completed ? '[x]' : '[ ]') . $m[2];
    return implode("\n", $lines);
}

/**
 * Flip the n-th checklist checkbox of a rich-text note (n = document order
 * of input.checklist-checkbox, as extractHtmlChecklistItems() counts them),
 * writing the same markup js/checklist.js does: checked and data-checked on
 * the box, checklist-item-checked on its item. Null when there is no such
 * checkbox.
 */
function aiSetHtmlChecklistItem(string $html, int $index, bool $completed): ?string {
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->loadHTML('<?xml encoding="utf-8" ?><div id="ai-checklist-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);
    $boxes = $xpath->query('//input[contains(concat(" ", normalize-space(@class), " "), " checklist-checkbox ")]');
    if ($boxes === false || $index < 0 || $index >= $boxes->length) return null;
    $box = $boxes->item($index);
    if ($completed) {
        $box->setAttribute('checked', 'checked');
        $box->setAttribute('data-checked', '1');
    } else {
        $box->removeAttribute('checked');
        $box->setAttribute('data-checked', '0');
    }
    for ($item = $box->parentNode; $item instanceof DOMElement; $item = $item->parentNode) {
        $classes = preg_split('/\s+/', trim($item->getAttribute('class'))) ?: [];
        if (!in_array('checklist-item', $classes, true)) continue;
        $classes = array_values(array_filter($classes, fn($c) => $c !== '' && $c !== 'checklist-item-checked'));
        if ($completed) $classes[] = 'checklist-item-checked';
        $item->setAttribute('class', implode(' ', $classes));
        break;
    }
    $root = $dom->getElementById('ai-checklist-root');
    if (!$root) return null;
    $out = '';
    foreach ($root->childNodes as $child) {
        $out .= $dom->saveHTML($child);
    }
    return $out;
}

/**
 * Dispatches one tool call from the assistant.
 *
 * This used to be a single 760-line function: 22 `if ($name === ...)` branches
 * in a row. Each branch is now its own handler below, and the map is explicit
 * on purpose: $name comes from the model's tool call, so it must never be able
 * to select a function by itself.
 */
function aiExecuteTool($con, $name, $args, $chatWorkspace)
{
    if (!is_array($args)) $args = [];
    $actorUserId = $_SESSION['user_id'] ?? null;

    static $handlers = [
        'search_notes' => 'aiToolSearchNotes',
        'get_note' => 'aiToolGetNote',
        'list_recent_notes' => 'aiToolListRecentNotes',
        'rename_note' => 'aiToolRenameNote',
        'update_note_content' => 'aiToolUpdateNoteContent',
        'create_note' => 'aiToolCreateNote',
        'delete_note' => 'aiToolDeleteNote',
        'delete_folder' => 'aiToolDeleteFolder',
        'update_note_tags' => 'aiToolUpdateNoteTags',
        'list_tags' => 'aiToolListTags',
        'list_folders' => 'aiToolListFolders',
        'create_folder' => 'aiToolCreateFolder',
        'rename_folder' => 'aiToolRenameFolder',
        'move_note_to_folder' => 'aiToolMoveNoteToFolder',
        'set_note_favorite' => 'aiToolSetNoteFavorite',
        'set_folder_favorite' => 'aiToolSetFolderFavorite',
        'set_note_reminder' => 'aiToolSetNoteReminder',
        'remove_note_reminder' => 'aiToolRemoveNoteReminder',
        'add_task' => 'aiToolAddTask',
        'update_task' => 'aiToolUpdateTask',
        'delete_task' => 'aiToolDeleteTask',
        'set_checklist_item' => 'aiToolSetChecklistItem',
    ];

    if (!isset($handlers[$name])) {
        return json_encode(['error' => 'Unknown tool: ' . $name]);
    }

    return $handlers[$name]($con, $args, $chatWorkspace, $actorUserId);
}

/** Tool `search_notes`. */
function aiToolSearchNotes($con, array $args, $chatWorkspace, $actorUserId): string
{
    $query = trim((string)($args['query'] ?? ''));
    if ($query === '') {
        return json_encode(['error' => 'query is required']);
    }
    $limit = max(1, min(20, intval($args['limit'] ?? 8)));

    $sql = "SELECT id, heading, folder, workspace, tags, updated, search_clean_entry(entry, type) AS content
            FROM entries
            WHERE trash = 0
              AND workspace = ?
              AND (remove_accents(heading) LIKE remove_accents(?)
                   OR remove_accents(search_clean_entry(entry, type)) LIKE remove_accents(?))
            ORDER BY updated DESC LIMIT " . $limit;
    $params = [$chatWorkspace, '%' . $query . '%', '%' . $query . '%'];
    $stmt = $con->prepare($sql);
    $stmt->execute($params);

    $results = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $content = (string)($row['content'] ?? '');
        // Character-based (not byte-based) excerpt centered on the match,
        // so multibyte text is never cut mid-character
        $pos = function_exists('mb_stripos') ? mb_stripos($content, $query, 0, 'UTF-8') : stripos($content, $query);
        if ($pos === false) $pos = 0;
        $start = max(0, $pos - 120);
        $snippet = trim(mb_substr($content, $start, 400, 'UTF-8'));
        $results[] = [
            'id' => (int)$row['id'],
            'title' => (string)$row['heading'],
            'folder' => (string)$row['folder'],
            'workspace' => (string)$row['workspace'],
            'tags' => (string)$row['tags'],
            'updated' => (string)$row['updated'],
            'snippet' => $snippet,
        ];
    }
    return json_encode(['count' => count($results), 'notes' => $results], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** Tool `get_note`. */
function aiToolGetNote($con, array $args, $chatWorkspace, $actorUserId): string
{
    $note = aiReadNote($con, intval($args['note_id'] ?? 0), AI_NOTE_READ_LIMIT, $chatWorkspace);
    if ($note === null) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    return json_encode($note, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** Tool `list_recent_notes`. */
function aiToolListRecentNotes($con, array $args, $chatWorkspace, $actorUserId): string
{
    $limit = max(1, min(50, intval($args['limit'] ?? 20)));
    $sql = 'SELECT id, heading, type, tags, folder_id, workspace, updated, favorite FROM entries WHERE trash = 0 AND workspace = ?';
    $params = [$chatWorkspace];
    if (!empty($args['favorites_only'])) {
        $sql .= ' AND favorite = 1';
    }
    $folderFilter = $args['folder'] ?? null;
    if ($folderFilter !== null && trim((string)$folderFilter) !== '') {
        $folder = aiResolveFolder($con, $chatWorkspace, $folderFilter);
        if ($folder === null) {
            return json_encode(['error' => 'Folder not found in the current workspace: ' . $folderFilter . '. Call list_folders to see the existing ones.'], JSON_UNESCAPED_UNICODE);
        }
        $sql .= ' AND folder_id = ?';
        $params[] = (int)$folder['id'];
    }
    $tagFilter = mb_strtolower(trim((string)($args['tag'] ?? '')));
    $sql .= ' ORDER BY updated DESC';
    $stmt = $con->prepare($sql);
    $stmt->execute($params);
    $results = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tags = aiParseTags($row['tags'] ?? '');
        if ($tagFilter !== '' && !in_array($tagFilter, array_map('mb_strtolower', $tags), true)) {
            continue;
        }
        $results[] = [
            'id' => (int)$row['id'],
            'title' => (string)$row['heading'],
            'type' => (string)($row['type'] ?? 'note'),
            'folder' => $row['folder_id'] !== null ? aiFolderPath($con, (int)$row['folder_id']) : '',
            'tags' => $tags,
            'favorite' => (int)($row['favorite'] ?? 0) === 1,
            'workspace' => (string)$row['workspace'],
            'updated' => aiUtcToLocal((string)$row['updated']),
        ];
        if (count($results) >= $limit) break;
    }
    return json_encode(['count' => count($results), 'notes' => $results], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** Tool `rename_note`. */
function aiToolRenameNote($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    $newTitle = trim((string)($args['new_title'] ?? ''));
    if ($noteId <= 0 || $newTitle === '') {
        return json_encode(['error' => 'note_id and new_title are required']);
    }
    if (mb_strlen($newTitle) > 255) {
        $newTitle = mb_substr($newTitle, 0, 255);
    }
    $stmt = $con->prepare('SELECT id, heading, workspace, folder_id FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $lockError = aiNoteEditLockError($noteId);
    if ($lockError !== null) {
        return $lockError;
    }
    $folderId = $note['folder_id'] !== null ? (int)$note['folder_id'] : null;
    $check = $con->prepare('SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ? AND workspace = ? AND ' . ($folderId !== null ? 'folder_id = ' . $folderId : 'folder_id IS NULL'));
    $check->execute([$newTitle, $noteId, $note['workspace']]);
    if ($check->fetchColumn() > 0) {
        $newTitle = generateUniqueTitle($newTitle, $noteId, $note['workspace'], $folderId);
    }
    $now = gmdate('Y-m-d H:i:s');
    $con->prepare('UPDATE entries SET heading = ?, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([$newTitle, $now, $actorUserId, $noteId]);
    // Shortcuts pointing at this note mirror its title
    $con->prepare('UPDATE entries SET heading = ?, updated = ?, updated_by_user_id = ? WHERE linked_note_id = ? AND trash = 0')
        ->execute([$newTitle, $now, $actorUserId, $noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'previous_title' => $note['heading'], 'new_title' => $newTitle], JSON_UNESCAPED_UNICODE);
}

/** Tool `update_note_content`. */
function aiToolUpdateNoteContent($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    $content = $args['content'] ?? null;
    if ($noteId <= 0 || !is_string($content)) {
        return json_encode(['error' => 'note_id and content are required']);
    }
    if (strlen($content) > 200000) {
        return json_encode(['error' => 'Content too large (200 KB max)']);
    }
    $stmt = $con->prepare('SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $lockError = aiNoteEditLockError($noteId);
    if ($lockError !== null) {
        return $lockError;
    }
    $noteType = $note['type'] ?? 'note';
    if ($noteType !== 'markdown' && $noteType !== 'note') {
        return json_encode(['error' => 'Only markdown and HTML notes can be edited (this note is of type "' . $noteType . '")']);
    }
    // get_note truncates long notes, so a "complete new content" written
    // from such a read would silently drop the rest: refuse instead
    $current = aiReadNote($con, $noteId, AI_NOTE_READ_LIMIT, $chatWorkspace);
    if ($current !== null && $current['truncated']) {
        return json_encode(['error' => 'This note is too long for the assistant to rewrite safely: get_note only shows its first part, so the rest would be lost. Tell the user to edit it by hand.']);
    }
    $filename = getEntryFilename($noteId, $noteType);
    if ($noteType === 'markdown') {
        $content = sanitizeMarkdownContent($content);
    } else {
        // Rich-text note: the assistant writes Markdown (see the tool
        // description), converted with the same parser as the "Convert
        // to HTML" action. A model that sent HTML anyway is taken at its
        // word, parseMarkdown() would only escape its tags.
        if (!aiLooksLikeHtml($content)) {
            $content = parseMarkdownForRichText($content);
        }
        $content = sanitizeHtml($content);
        if (strpos($content, AI_INLINE_IMAGE_PREFIX) !== false) {
            $stored = is_readable($filename) ? (string)file_get_contents($filename) : (string)($note['entry'] ?? '');
            $content = aiRestoreInlineImages($content, $stored);
        }
    }
    createDirectoryWithPermissions(dirname($filename));
    if (file_put_contents($filename, $content) === false) {
        return json_encode(['error' => 'Failed to write note file']);
    }
    $con->prepare('UPDATE entries SET entry = ?, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([$content, gmdate('Y-m-d H:i:s'), $actorUserId, $noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => $note['heading']], JSON_UNESCAPED_UNICODE);
}

/** Tool `create_note`. */
function aiToolCreateNote($con, array $args, $chatWorkspace, $actorUserId): string
{
    $title = trim((string)($args['title'] ?? ''));
    $content = (string)($args['content'] ?? '');
    if ($title === '') {
        return json_encode(['error' => 'title is required']);
    }
    if (mb_strlen($title) > 255) {
        $title = mb_substr($title, 0, 255);
    }
    if (strlen($content) > 200000) {
        return json_encode(['error' => 'Content too large (200 KB max)']);
    }
    $quotaError = poznoteCheckNoteQuota($con)
        ?? poznoteCheckStorageQuota(strlen($content));
    if ($quotaError !== null) {
        return json_encode(['error' => $quotaError]);
    }
    $workspace = $chatWorkspace;
    // Optional folder (must exist: the model can create it first) and tags
    $folderId = null;
    $folderName = null;
    $folderRef = $args['folder'] ?? '';
    if ($folderRef !== null && trim((string)$folderRef) !== '') {
        $folder = aiResolveFolder($con, $workspace, $folderRef);
        if ($folder === null) {
            return json_encode(['error' => 'Folder not found in the current workspace: ' . $folderRef . '. Call list_folders to see the existing ones, or create_folder to create it.'], JSON_UNESCAPED_UNICODE);
        }
        $folderId = (int)$folder['id'];
        $folderName = (string)$folder['name'];
    }
    $tags = isset($args['tags']) && is_array($args['tags']) ? aiParseTags($args['tags']) : [];
    $check = $con->prepare('SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND workspace = ? AND ' . ($folderId !== null ? 'folder_id = ' . $folderId : 'folder_id IS NULL'));
    $check->execute([$title, $workspace]);
    if ($check->fetchColumn() > 0) {
        $title = generateUniqueTitle($title, null, $workspace, $folderId);
    }
    $content = sanitizeMarkdownContent($content);
    $now = gmdate('Y-m-d H:i:s');
    $ins = $con->prepare('INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, created, updated, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$ins->execute([$title, $content, implode(', ', $tags), $folderName, $folderId, $workspace, 'markdown', $now, $now, $actorUserId, $actorUserId])) {
        return json_encode(['error' => 'Failed to create note']);
    }
    $newId = (int)$con->lastInsertId();
    $filename = getEntryFilename($newId, 'markdown');
    createDirectoryWithPermissions(dirname($filename));
    file_put_contents($filename, $content);
    $result = ['ok' => true, 'note_id' => $newId, 'title' => $title, 'workspace' => $workspace];
    if ($folderId !== null) $result['folder'] = aiFolderPath($con, $folderId);
    if ($tags !== []) $result['tags'] = $tags;
    return json_encode($result, JSON_UNESCAPED_UNICODE);
}

/** Tool `delete_note`. */
function aiToolDeleteNote($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0) {
        return json_encode(['error' => 'note_id is required']);
    }
    $stmt = $con->prepare('SELECT id, heading FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace (already in the trash?)']);
    }
    $lockError = aiNoteEditLockError($noteId);
    if ($lockError !== null) {
        return $lockError;
    }
    $followed = aiTrashNote($con, $noteId, $actorUserId);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'moved_to_trash' => true, 'shortcuts_trashed' => $followed], JSON_UNESCAPED_UNICODE);
}

/** Tool `delete_folder`. */
function aiToolDeleteFolder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $folder = aiResolveFolder($con, $chatWorkspace, $args['folder'] ?? '');
    if ($folder === null) {
        return json_encode(['error' => 'Folder not found in the current workspace. Call list_folders to see the existing ones.']);
    }
    $folderId = (int)$folder['id'];
    $path = aiFolderPath($con, $folderId);
    $ids = aiFolderSubtreeIds($con, $folderId, $chatWorkspace);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $con->prepare("SELECT id, heading FROM entries WHERE folder_id IN ($placeholders) AND workspace = ? AND trash = 0");
    $stmt->execute(array_merge($ids, [$chatWorkspace]));
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Never trash a note out from under someone editing it
    foreach ($notes as $n) {
        $lockError = aiNoteEditLockError((int)$n['id']);
        if ($lockError !== null) {
            return $lockError;
        }
    }
    // Same steps as FoldersController::delete: the notes of the whole
    // subtree go to the trash (they keep their folder name for the trash
    // page), the folder share links are freed, the folder rows go away
    try {
        $con->beginTransaction();
        if ($notes !== []) {
            $con->prepare("UPDATE entries SET trash = 1, trashed_at = datetime('now') WHERE folder_id IN ($placeholders) AND workspace = ? AND trash = 0")
                ->execute(array_merge($ids, [$chatWorkspace]));
        }
        unregisterSharedLinksForFolders($con, $ids);
        $con->prepare("DELETE FROM folders WHERE id IN ($placeholders) AND workspace = ?")->execute(array_merge($ids, [$chatWorkspace]));
        $con->commit();
    } catch (Exception $e) {
        if ($con->inTransaction()) {
            $con->rollBack();
        }
        return json_encode(['error' => 'Failed to delete the folder: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    return json_encode([
        'ok' => true,
        'folder' => $path,
        'subfolders_deleted' => count($ids) - 1,
        'notes_moved_to_trash' => count($notes),
        'note_titles' => array_map(fn($n) => (string)$n['heading'], $notes),
    ], JSON_UNESCAPED_UNICODE);
}

/** Tool `update_note_tags`. */
function aiToolUpdateNoteTags($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0) {
        return json_encode(['error' => 'note_id is required']);
    }
    $stmt = $con->prepare('SELECT id, heading, tags FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $tags = aiParseTags($note['tags'] ?? '');
    $previous = $tags;
    if (isset($args['replace']) && is_array($args['replace'])) {
        $tags = aiParseTags($args['replace']);
    }
    if (isset($args['add']) && is_array($args['add'])) {
        $tags = aiParseTags(array_merge($tags, aiParseTags($args['add'])));
    }
    if (isset($args['remove']) && is_array($args['remove'])) {
        $drop = array_map('mb_strtolower', aiParseTags($args['remove']));
        $tags = array_values(array_filter($tags, fn($t) => !in_array(mb_strtolower($t), $drop, true)));
    }
    $con->prepare('UPDATE entries SET tags = ?, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([implode(', ', $tags), gmdate('Y-m-d H:i:s'), $actorUserId, $noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'previous_tags' => $previous, 'tags' => $tags], JSON_UNESCAPED_UNICODE);
}

/** Tool `list_tags`. */
function aiToolListTags($con, array $args, $chatWorkspace, $actorUserId): string
{
    $stmt = $con->prepare("SELECT tags FROM entries WHERE trash = 0 AND workspace = ? AND tags IS NOT NULL AND tags != ''");
    $stmt->execute([$chatWorkspace]);
    $counts = [];
    $names = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        foreach (aiParseTags($row['tags']) as $tag) {
            $key = mb_strtolower($tag);
            $counts[$key] = ($counts[$key] ?? 0) + 1;
            $names[$key] = $names[$key] ?? $tag;
        }
    }
    $tags = [];
    foreach ($counts as $key => $count) {
        $tags[] = ['tag' => $names[$key], 'notes' => $count];
    }
    usort($tags, fn($a, $b) => strnatcasecmp($a['tag'], $b['tag']));
    return json_encode(['count' => count($tags), 'tags' => $tags], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** Tool `list_folders`. */
function aiToolListFolders($con, array $args, $chatWorkspace, $actorUserId): string
{
    $folders = aiListFolders($con, $chatWorkspace);
    return json_encode(['count' => count($folders), 'folders' => $folders], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/** Tool `create_folder`. */
function aiToolCreateFolder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $path = trim((string)($args['path'] ?? ''), " /\t\n\r");
    $segments = array_values(array_filter(array_map('trim', explode('/', $path)), fn($s) => $s !== ''));
    if (empty($segments)) {
        return json_encode(['error' => 'path is required']);
    }
    $parentId = null;
    $created = [];
    foreach ($segments as $segment) {
        $error = aiValidateFolderName($segment);
        if ($error !== null) {
            return json_encode(['error' => $error], JSON_UNESCAPED_UNICODE);
        }
        $sql = 'SELECT id FROM folders WHERE workspace = ? AND name = ? COLLATE NOCASE AND ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?');
        $params = $parentId === null ? [$chatWorkspace, $segment] : [$chatWorkspace, $segment, $parentId];
        $find = $con->prepare($sql);
        $find->execute($params);
        $existingId = $find->fetchColumn();
        if ($existingId) {
            $parentId = (int)$existingId;
            continue;
        }
        $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))")
            ->execute([$segment, $chatWorkspace, $parentId]);
        $parentId = (int)$con->lastInsertId();
        $created[] = $segment;
    }
    return json_encode([
        'ok' => true,
        'folder_id' => $parentId,
        'path' => aiFolderPath($con, $parentId),
        'already_existed' => empty($created),
        'created_segments' => $created,
    ], JSON_UNESCAPED_UNICODE);
}

/** Tool `rename_folder`. */
function aiToolRenameFolder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $folder = aiResolveFolder($con, $chatWorkspace, $args['folder'] ?? '');
    if ($folder === null) {
        return json_encode(['error' => 'Folder not found in the current workspace. Call list_folders to see the existing ones.']);
    }
    $newName = trim((string)($args['new_name'] ?? ''));
    $error = aiValidateFolderName($newName);
    if ($error !== null) {
        return json_encode(['error' => $error], JSON_UNESCAPED_UNICODE);
    }
    $folderId = (int)$folder['id'];
    $parentId = $folder['parent_id'] !== null ? (int)$folder['parent_id'] : null;
    $sql = 'SELECT COUNT(*) FROM folders WHERE workspace = ? AND name = ? AND id != ? AND ' . ($parentId === null ? 'parent_id IS NULL' : 'parent_id = ?');
    $params = $parentId === null ? [$chatWorkspace, $newName, $folderId] : [$chatWorkspace, $newName, $folderId, $parentId];
    $check = $con->prepare($sql);
    $check->execute($params);
    if ((int)$check->fetchColumn() > 0) {
        return json_encode(['error' => 'A folder named "' . $newName . '" already exists at that location'], JSON_UNESCAPED_UNICODE);
    }
    $oldName = (string)$folder['name'];
    $con->prepare('UPDATE folders SET name = ? WHERE id = ?')->execute([$newName, $folderId]);
    // entries.folder mirrors the folder's own name (FoldersController::update)
    $con->prepare('UPDATE entries SET folder = ? WHERE folder_id = ?')->execute([$newName, $folderId]);
    return json_encode(['ok' => true, 'folder_id' => $folderId, 'previous_name' => $oldName, 'path' => aiFolderPath($con, $folderId)], JSON_UNESCAPED_UNICODE);
}

/** Tool `move_note_to_folder`. */
function aiToolMoveNoteToFolder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0) {
        return json_encode(['error' => 'note_id is required']);
    }
    $stmt = $con->prepare('SELECT id, heading, folder_id FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $target = $args['folder'] ?? '';
    $targetId = null;
    $targetName = null;
    if ($target !== null && trim((string)$target) !== '' && !in_array(mb_strtolower(trim((string)$target)), ['root', 'none', '/'], true)) {
        $folder = aiResolveFolder($con, $chatWorkspace, $target);
        if ($folder === null) {
            return json_encode(['error' => 'Folder not found in the current workspace: ' . $target . '. Call list_folders to see the existing ones, or create_folder to create it.'], JSON_UNESCAPED_UNICODE);
        }
        $targetId = (int)$folder['id'];
        $targetName = (string)$folder['name'];
    }
    $previousPath = $note['folder_id'] !== null ? aiFolderPath($con, (int)$note['folder_id']) : '';
    if (($note['folder_id'] !== null ? (int)$note['folder_id'] : null) === $targetId) {
        return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'folder' => $previousPath, 'unchanged' => true], JSON_UNESCAPED_UNICODE);
    }
    // Titles are unique per folder: a clash gets the same numbered suffix the UI adds
    $title = (string)$note['heading'];
    $check = $con->prepare('SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0 AND id != ? AND workspace = ? AND ' . ($targetId !== null ? 'folder_id = ' . $targetId : 'folder_id IS NULL'));
    $check->execute([$title, $noteId, $chatWorkspace]);
    if ((int)$check->fetchColumn() > 0) {
        $title = generateUniqueTitle($title, $noteId, $chatWorkspace, $targetId);
    }
    $con->prepare('UPDATE entries SET heading = ?, folder = ?, folder_id = ?, display_order = 0, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([$title, $targetName, $targetId, gmdate('Y-m-d H:i:s'), $actorUserId, $noteId]);
    // Legacy implicit shares inherited from the old folder do not follow the note (FoldersController::moveNoteToFolder)
    $legacy = $con->prepare('SELECT token FROM shared_notes WHERE note_id = ? AND access_mode IS NULL LIMIT 1');
    $legacy->execute([$noteId]);
    $legacyToken = $legacy->fetchColumn();
    if ($legacyToken) {
        unregisterSharedLink($legacyToken);
        $con->prepare('DELETE FROM shared_notes WHERE note_id = ? AND access_mode IS NULL')->execute([$noteId]);
    }
    $result = ['ok' => true, 'note_id' => $noteId, 'title' => $title, 'previous_folder' => $previousPath, 'folder' => $targetId !== null ? aiFolderPath($con, $targetId) : ''];
    if ($title !== (string)$note['heading']) {
        $result['renamed_to_avoid_duplicate'] = true;
    }
    return json_encode($result, JSON_UNESCAPED_UNICODE);
}

/** Tool `set_note_favorite`. */
function aiToolSetNoteFavorite($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0 || !array_key_exists('favorite', $args)) {
        return json_encode(['error' => 'note_id and favorite are required']);
    }
    $favorite = filter_var($args['favorite'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    $stmt = $con->prepare('SELECT id, heading FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $con->prepare('UPDATE entries SET favorite = ? WHERE id = ?')->execute([$favorite, $noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'favorite' => $favorite === 1], JSON_UNESCAPED_UNICODE);
}

/** Tool `set_folder_favorite`. */
function aiToolSetFolderFavorite($con, array $args, $chatWorkspace, $actorUserId): string
{
    if (!array_key_exists('favorite', $args)) {
        return json_encode(['error' => 'folder and favorite are required']);
    }
    $folder = aiResolveFolder($con, $chatWorkspace, $args['folder'] ?? '');
    if ($folder === null) {
        return json_encode(['error' => 'Folder not found in the current workspace. Call list_folders to see the existing ones.']);
    }
    $favorite = filter_var($args['favorite'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    $con->prepare('UPDATE folders SET favorite = ? WHERE id = ?')->execute([$favorite, (int)$folder['id']]);
    return json_encode(['ok' => true, 'folder_id' => (int)$folder['id'], 'path' => aiFolderPath($con, (int)$folder['id']), 'favorite' => $favorite === 1], JSON_UNESCAPED_UNICODE);
}

/** Tool `set_note_reminder`. */
function aiToolSetNoteReminder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0) {
        return json_encode(['error' => 'note_id is required']);
    }
    $local = aiNormalizeLocalDateTime($args['reminder_at'] ?? null);
    if ($local === null) {
        return json_encode(['error' => 'reminder_at is required, as "YYYY-MM-DD HH:MM" (or "YYYY-MM-DD" for 09:00) in the user\'s timezone']);
    }
    $recurrence = aiNormalizeRecurrence($args['recurrence'] ?? null);
    if ($recurrence === false) {
        return json_encode(['error' => 'Invalid recurrence: expected "<count><unit>" with unit i (minutes), h, d, w, m or y, e.g. "1d", "2w", "1m"']);
    }
    $stmt = $con->prepare('SELECT id, heading FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $triggerAt = aiLocalToUtc($local);
    if ($triggerAt === null) {
        return json_encode(['error' => 'Invalid reminder_at']);
    }
    $message = trim((string)($args['message'] ?? ''));
    // Same bookkeeping as RemindersController::setReminder, in-app only
    $con->prepare('UPDATE entries SET reminder_at = ?, reminder_recurrence = ? WHERE id = ?')->execute([$triggerAt, $recurrence, $noteId]);
    $con->prepare('DELETE FROM notifications WHERE note_id = ? AND dismissed = 0 AND task_id IS NULL')->execute([$noteId]);
    $con->prepare("INSERT INTO notifications (note_id, type, message, trigger_at, email_enabled, created) VALUES (?, 'reminder', ?, ?, 0, datetime('now'))")
        ->execute([$noteId, $message !== '' ? $message : (string)$note['heading'], $triggerAt]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'reminder_at' => aiUtcToLocal($triggerAt), 'recurrence' => $recurrence], JSON_UNESCAPED_UNICODE);
}

/** Tool `remove_note_reminder`. */
function aiToolRemoveNoteReminder($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0) {
        return json_encode(['error' => 'note_id is required']);
    }
    $stmt = $con->prepare('SELECT id, heading, reminder_at FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $con->prepare('UPDATE entries SET reminder_at = NULL, reminder_recurrence = NULL WHERE id = ?')->execute([$noteId]);
    $con->prepare('DELETE FROM notifications WHERE note_id = ? AND dismissed = 0 AND task_id IS NULL')->execute([$noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'had_reminder' => !empty($note['reminder_at'])], JSON_UNESCAPED_UNICODE);
}

/** Tool `add_task`. */
function aiToolAddTask($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    $text = trim((string)($args['text'] ?? ''));
    if ($noteId <= 0 || $text === '') {
        return json_encode(['error' => 'note_id and text are required']);
    }
    $note = aiLoadTasklist($con, $noteId, $chatWorkspace);
    if (is_string($note)) return $note;
    $task = [
        'id' => aiGenerateTaskId($note['tasks']),
        'text' => $text,
        'noteId' => $noteId,
        'completed' => false,
        'important' => !empty($args['important']),
        'dueAt' => null,
    ];
    if (isset($args['due_at']) && trim((string)$args['due_at']) !== '') {
        $dueAt = aiNormalizeLocalDateTime($args['due_at']);
        if ($dueAt === null) {
            return json_encode(['error' => 'Invalid due_at: expected "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"']);
        }
        $task['dueAt'] = $dueAt;
        $task['dueReminder'] = !empty($args['reminder']);
    } elseif (!empty($args['reminder'])) {
        return json_encode(['error' => 'reminder requires due_at']);
    }
    $tasks = $note['tasks'];
    $tasks[] = $task;
    $error = aiPersistTasks($con, $noteId, aiRegroupTasks($tasks), $actorUserId);
    if ($error !== null) return $error;
    if (!empty($task['dueReminder'])) {
        aiSyncTaskReminder($con, $noteId, $task);
    }
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'task' => aiTaskView($task)], JSON_UNESCAPED_UNICODE);
}

/** Tool `update_task`. */
function aiToolUpdateTask($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0 || !isset($args['task'])) {
        return json_encode(['error' => 'note_id and task are required']);
    }
    $note = aiLoadTasklist($con, $noteId, $chatWorkspace);
    if (is_string($note)) return $note;
    $tasks = $note['tasks'];
    $index = aiFindTaskIndex($tasks, $args['task']);
    if ($index === null) {
        return json_encode(['error' => 'No single task matches "' . (string)$args['task'] . '" in this note. Read the note with get_note and use the task id or its exact text.'], JSON_UNESCAPED_UNICODE);
    }
    $previous = $tasks[$index];
    $task = $previous;
    $changed = [];
    if (array_key_exists('completed', $args)) {
        $task['completed'] = filter_var($args['completed'], FILTER_VALIDATE_BOOLEAN);
        $changed[] = 'completed';
    }
    if (array_key_exists('important', $args)) {
        $task['important'] = filter_var($args['important'], FILTER_VALIDATE_BOOLEAN);
        $changed[] = 'important';
    }
    if (array_key_exists('text', $args)) {
        $text = trim((string)$args['text']);
        if ($text === '') {
            return json_encode(['error' => 'text cannot be empty']);
        }
        $task['text'] = $text;
        $changed[] = 'text';
    }
    if (array_key_exists('due_at', $args)) {
        if ($args['due_at'] === null || trim((string)$args['due_at']) === '') {
            $task['dueAt'] = null;
            $task['dueReminder'] = false;
        } else {
            $dueAt = aiNormalizeLocalDateTime($args['due_at']);
            if ($dueAt === null) {
                return json_encode(['error' => 'Invalid due_at: expected "YYYY-MM-DD" or "YYYY-MM-DD HH:MM", or "" to clear']);
            }
            $task['dueAt'] = $dueAt;
        }
        $changed[] = 'due_at';
    }
    if (array_key_exists('reminder', $args)) {
        $task['dueReminder'] = filter_var($args['reminder'], FILTER_VALIDATE_BOOLEAN);
        $changed[] = 'reminder';
    }
    if (empty($changed)) {
        return json_encode(['error' => 'Nothing to change: pass completed, important, text, due_at or reminder']);
    }
    // Completing a task retires its pending reminder, mirroring the UI
    if (!empty($task['completed'])) {
        $task['dueReminder'] = false;
    }
    if (!empty($task['dueReminder']) && empty($task['dueAt'])) {
        return json_encode(['error' => 'reminder requires a due_at']);
    }
    $tasks[$index] = $task;
    $error = aiPersistTasks($con, $noteId, aiRegroupTasks($tasks), $actorUserId);
    if ($error !== null) return $error;
    foreach (['dueAt', 'dueReminder', 'dueRecurrence', 'completed', 'text'] as $key) {
        $old = $previous[$key] ?? null;
        $new = $task[$key] ?? null;
        if (in_array($key, ['dueReminder', 'completed'], true)) {
            $old = !empty($old);
            $new = !empty($new);
        }
        if ($old !== $new) {
            aiSyncTaskReminder($con, $noteId, $task);
            break;
        }
    }
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'changed' => $changed, 'task' => aiTaskView($task)], JSON_UNESCAPED_UNICODE);
}

/** Tool `delete_task`. */
function aiToolDeleteTask($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0 || !isset($args['task'])) {
        return json_encode(['error' => 'note_id and task are required']);
    }
    $note = aiLoadTasklist($con, $noteId, $chatWorkspace);
    if (is_string($note)) return $note;
    $tasks = $note['tasks'];
    $index = aiFindTaskIndex($tasks, $args['task']);
    if ($index === null) {
        return json_encode(['error' => 'No single task matches "' . (string)$args['task'] . '" in this note. Read the note with get_note and use the task id or its exact text.'], JSON_UNESCAPED_UNICODE);
    }
    $removed = $tasks[$index];
    array_splice($tasks, $index, 1);
    $error = aiPersistTasks($con, $noteId, $tasks, $actorUserId);
    if ($error !== null) return $error;
    if (isset($removed['id'])) {
        aiDeleteTaskReminder($con, $noteId, aiTaskIdToString($removed['id']));
    }
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'deleted_task' => aiTaskView($removed), 'remaining' => count($tasks)], JSON_UNESCAPED_UNICODE);
}

/** Tool `set_checklist_item`. */
function aiToolSetChecklistItem($con, array $args, $chatWorkspace, $actorUserId): string
{
    $noteId = intval($args['note_id'] ?? 0);
    if ($noteId <= 0 || !isset($args['item']) || !array_key_exists('completed', $args)) {
        return json_encode(['error' => 'note_id, item and completed are required']);
    }
    $stmt = $con->prepare('SELECT id, heading, type, entry FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$noteId, $chatWorkspace]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        return json_encode(['error' => 'Note not found in the current workspace']);
    }
    $noteType = (string)($note['type'] ?? 'note');
    if ($noteType === 'tasklist') {
        return json_encode(['error' => 'This note is a task list: use update_task instead']);
    }
    if ($noteType !== 'markdown' && $noteType !== 'note') {
        return json_encode(['error' => 'This note has no checklist (type "' . $noteType . '")']);
    }
    $lockError = aiNoteEditLockError($noteId);
    if ($lockError !== null) {
        return $lockError;
    }
    $filename = getEntryFilename($noteId, $noteType);
    $content = is_readable($filename) ? (string)file_get_contents($filename) : (string)($note['entry'] ?? '');
    $items = extractNoteChecklistItems($content, $noteType);
    if ($items === []) {
        return json_encode(['error' => 'This note has no checklist items']);
    }
    $ref = $args['item'];
    $found = null;
    if (is_int($ref) || (is_string($ref) && ctype_digit(trim($ref)))) {
        foreach ($items as $item) {
            if ($item['index'] === (int)$ref) { $found = $item; break; }
        }
    }
    if ($found === null) {
        $needle = mb_strtolower(trim((string)$ref));
        foreach ($items as $item) {
            if (mb_strtolower($item['text']) === $needle) { $found = $item; break; }
        }
        if ($found === null && $needle !== '') {
            foreach ($items as $item) {
                if (mb_strpos(mb_strtolower($item['text']), $needle) !== false) {
                    if ($found !== null) { $found = null; break; }
                    $found = $item;
                }
            }
        }
    }
    if ($found === null) {
        return json_encode(['error' => 'No single checklist item matches "' . (string)$ref . '". Read the note with get_note and use the item index or its exact text.', 'items' => $items], JSON_UNESCAPED_UNICODE);
    }
    $completed = filter_var($args['completed'], FILTER_VALIDATE_BOOLEAN);
    $newContent = $noteType === 'markdown'
        ? aiSetMarkdownChecklistLine($content, (int)$found['index'], $completed)
        : aiSetHtmlChecklistItem($content, (int)$found['index'], $completed);
    if ($newContent === null) {
        return json_encode(['error' => 'Could not locate the checkbox in the note']);
    }
    createDirectoryWithPermissions(dirname($filename));
    if (file_put_contents($filename, $newContent) === false) {
        return json_encode(['error' => 'Failed to write note file']);
    }
    $con->prepare('UPDATE entries SET entry = ?, updated = ?, updated_by_user_id = ? WHERE id = ?')
        ->execute([$newContent, gmdate('Y-m-d H:i:s'), $actorUserId, $noteId]);
    return json_encode(['ok' => true, 'note_id' => $noteId, 'title' => (string)$note['heading'], 'item' => ['index' => $found['index'], 'text' => $found['text'], 'completed' => $completed]], JSON_UNESCAPED_UNICODE);
}
