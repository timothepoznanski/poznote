<?php
/**
 * Note information, for the modal of the "..." menu at the bottom-right of the
 * notes page (#noteInfoModal in modals.php, js/note-info-modal.js).
 *
 * Replaces the old info.php page, which left the note to show what amounts to
 * a dozen read-only lines.
 *
 * Every value comes back ready to display: the dates are rendered in the
 * user's timezone and date format, the authors are resolved against the master
 * database, and the counts are already pluralised in the user's language. The
 * modal only has labels and a place to put each string, so nothing here needs
 * the browser's translation dictionary to have loaded.
 *
 *   GET api_note_info.php?note_id=<id>[&workspace=<name>]
 *   -> { "success": true, "info": { ... } }
 *
 * The note is read through the caller's own database connection
 * (db_connect.php), so a note id belonging to another account is simply not
 * found, exactly as the page it replaces behaved.
 */

require_once __DIR__ . '/../auth.php';
requireApiAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

/**
 * A stored UTC timestamp in the user's timezone and date format.
 */
function poznoteNoteInfoDate(?string $dateStr): string {
    if (empty($dateStr)) {
        return t('common.not_available', [], 'Not available');
    }

    $formatted = formatUtcDateTimeForDisplay($dateStr, 'Y-m-d H:i');
    if ($formatted !== '') {
        return $formatted;
    }

    $fallback = convertUtcToUserTimezone($dateStr);

    return $fallback !== '' ? $fallback : t('common.not_available', [], 'Not available');
}

/**
 * The display name of an account, falling back to its username, its email,
 * and finally to its id for an account that has since been deleted.
 */
function poznoteNoteInfoUser(?int $userId): string {
    $userId = (int)($userId ?? 0);
    if ($userId <= 0) {
        return t('common.not_available', [], 'Not available');
    }

    $user = function_exists('getUserProfileById') ? getUserProfileById($userId) : null;
    if (!$user) {
        return t('info.users.deleted', ['id' => $userId], 'User #{{id}}');
    }

    $name = trim((string)($user['display_name'] ?? ''));
    if ($name === '') {
        $name = trim((string)($user['username'] ?? ''));
    }
    if ($name === '' && !empty($user['email'])) {
        $name = trim((string)$user['email']);
    }

    return $name !== '' ? $name : t('info.users.user_id', ['id' => $userId], 'User #{{id}}');
}

function poznoteNoteInfoFail(int $status, string $message): never {
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

$noteId = isset($_GET['note_id']) ? (int)$_GET['note_id'] : 0;
$workspace = isset($_GET['workspace']) ? trim((string)$_GET['workspace']) : '';

if ($noteId <= 0) {
    poznoteNoteInfoFail(400, 'Missing or invalid note_id');
}

$columns = 'heading, folder, folder_id, created, updated, created_by_user_id, updated_by_user_id, favorite, tags, attachments, type, workspace';

try {
    if ($workspace !== '') {
        $stmt = $con->prepare("SELECT $columns FROM entries WHERE id = ? AND trash = 0 AND workspace = ?");
        $stmt->execute([$noteId, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT $columns FROM entries WHERE id = ? AND trash = 0");
        $stmt->execute([$noteId]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    poznoteNoteInfoFail(500, 'Database error');
}

if (!$note) {
    poznoteNoteInfoFail(404, 'Note not found');
}

// An unsaved note carries no title yet, and neither did the page before it
$title = $note['heading'] !== '' && $note['heading'] !== null
    ? $note['heading']
    : t('index.note.new_note', [], 'New note');

$createdByUserId = (int)($note['created_by_user_id'] ?? 0);
if ($createdByUserId <= 0) {
    // Notes written before the column existed: the account reading them owns them
    $createdByUserId = (int)(getCurrentUserId() ?? 0);
}
$updatedByUserId = (int)($note['updated_by_user_id'] ?? 0);
if ($updatedByUserId <= 0) {
    $updatedByUserId = $createdByUserId;
}

// Full folder path, through the shared helper, with the flat folder name of
// old data as a fallback
$folderText = t('modals.folder.no_folder', [], 'No folder');
if (!empty($note['folder_id'])) {
    $folderPath = getFolderPath($note['folder_id'], $con);
    if (!empty($folderPath)) {
        $folderText = $folderPath;
    }
} elseif (!empty($note['folder'])) {
    $folderText = $note['folder'];
}

// Where the note's content lives on disk, as a path relative to the install.
// info.php stripped __DIR__, which stopped matching when the entry points moved
// into src/public/ while data/ stayed one level up: the row had been showing the
// absolute path ever since. The parent directory is the one to strip.
$fullPath = getEntryFilename($noteId, $note['type'] ?? 'note');
$fullPath = str_replace(dirname(__DIR__) . '/', '', $fullPath);

$tags = [];
if (!empty($note['tags'])) {
    $tags = array_filter(array_map('trim', explode(',', $note['tags'])));
}

$attachmentsCount = 0;
if (!empty($note['attachments']) && $note['attachments'] !== '[]') {
    if (substr($note['attachments'], 0, 1) === '[' && substr($note['attachments'], -1) === ']') {
        // JSON format: inline images already shown in the note do not count
        $attachmentsCount = count(array_filter(poznoteFilterVisibleAttachments($note['attachments'])));
    } else {
        // Comma-separated, from before the JSON format
        $attachmentsCount = count(array_filter(array_map('trim', explode(',', $note['attachments']))));
    }
}

$isFavorite = (int)$note['favorite'] === 1;

echo json_encode([
    'success' => true,
    'info' => [
        'title' => $title,
        'workspace' => (string)($note['workspace'] ?? $workspace),
        'folder' => $folderText,
        'created' => poznoteNoteInfoDate($note['created']),
        'created_by' => poznoteNoteInfoUser($createdByUserId),
        'updated' => poznoteNoteInfoDate($note['updated']),
        'updated_by' => poznoteNoteInfoUser($updatedByUserId),
        'tags' => empty($tags) ? t('info.empty.no_tags', [], 'No tags') : implode(', ', $tags),
        'favorite' => $isFavorite,
        'favorite_text' => $isFavorite ? t('common.yes', [], 'Yes') : t('common.no', [], 'No'),
        'attachments' => $attachmentsCount === 1
            ? t('info.attachments.count_singular', ['count' => $attachmentsCount], '1 file')
            : t('info.attachments.count_plural', ['count' => $attachmentsCount], '{{count}} files'),
        'note_id' => $noteId,
        'full_path' => $fullPath,
    ],
], JSON_UNESCAPED_UNICODE);
