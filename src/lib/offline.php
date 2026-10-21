<?php
/**
 * Which notes a browser keeps offline, and in what order.
 *
 * Pure functions shared by api/v1/controllers/OfflineController.php (the
 * manifest) and tests/offline.test.php. The controller runs the SQL and reads
 * the files; everything that decides is here, with no database, session or
 * config, so it can be exercised on plain arrays.
 *
 * A note is kept offline for one of four reasons, in this order of priority:
 *   note      it is marked "Keep offline" (entries.offline = 1)
 *   folder    it sits in a folder marked "Keep offline", or under one, unless
 *             a subfolder between them was left out (folders.offline = -1)
 *   favorite  it is a favorite (entries.favorite)
 *   recent    it was modified in the last offline_notes_days days
 * A note whose "Stop keeping offline" was chosen while one of the last three
 * held it (entries.offline = -1) is never kept, whatever the reason.
 * The first three are kept whatever their date; the budgets (a number of
 * notes, a size of text) drop the "recent" ones first, oldest first, then
 * the others, oldest first.
 */

/** The four reasons, most important first. */
const POZNOTE_OFFLINE_REASONS = ['note', 'folder', 'favorite', 'recent'];

/**
 * Types the offline page can show and edit. Excalidraw drawings and the
 * other special types stay online only.
 */
const POZNOTE_OFFLINE_NOTE_TYPES = ['note', 'markdown', 'tasklist'];

/**
 * The offline_notes_days user setting, or the default when never set,
 * within 0 and the maximum. 0 turns offline copies off for the account.
 */
function poznoteOfflineDays($raw, int $default, int $max): int {
    if ($raw === null || $raw === false || trim((string)$raw) === '') {
        return $default;
    }
    return max(0, min($max, (int)$raw));
}

/**
 * Ids of the folders whose notes are kept offline: those marked "Keep
 * offline" and every folder under them, except a subfolder whose "Stop
 * keeping offline" was chosen (folders.offline = -1) and the folders under
 * that one. The nearest mark decides, the folder's own first: 1 keeps, -1
 * leaves out, 0 follows the parent. $folders holds rows with id, parent_id
 * and offline (as `SELECT id, parent_id, offline FROM folders`).
 *
 * @param array<int, array<string, mixed>> $folders
 * @return array<int, true> keyed by folder id
 */
function poznoteOfflineFolderIds(array $folders): array {
    $parent = [];
    $marks = [];
    $anyKept = false;
    foreach ($folders as $folder) {
        $id = (int)($folder['id'] ?? 0);
        if ($id <= 0) {
            continue;
        }
        $parent[$id] = isset($folder['parent_id']) && $folder['parent_id'] !== null ? (int)$folder['parent_id'] : null;
        $mark = (int)($folder['offline'] ?? 0);
        if ($mark !== 0) {
            $marks[$id] = $mark;
            $anyKept = $anyKept || $mark > 0;
        }
    }
    if (!$anyKept) {
        return [];
    }
    $kept = [];
    foreach (array_keys($parent) as $id) {
        // Walk up to the nearest marked folder, this one included
        $current = $id;
        $seen = [];
        while ($current !== null && array_key_exists($current, $parent)) {
            if (isset($seen[$current])) {
                break;
            }
            $seen[$current] = true;
            if (isset($marks[$current])) {
                if ($marks[$current] > 0) {
                    $kept[$id] = true;
                }
                break;
            }
            $current = $parent[$current];
        }
    }
    return $kept;
}

/**
 * Folders shown as kept offline in the menus and marks: those whose notes,
 * subfolders included, are all kept by a "Keep offline" (marked themselves,
 * or in a folder of poznoteOfflineFolderIds() and not left out). A folder
 * with no such note to judge by shows its own rule. Favorites and recent
 * notes do not count: they are not marked. $folders as for
 * poznoteOfflineFolderIds(); $notes holds folder_id and offline for the
 * notes in the trash excluded, of the types of POZNOTE_OFFLINE_NOTE_TYPES.
 *
 * @param array<int, array<string, mixed>> $folders
 * @param array<int, array<string, mixed>> $notes
 * @return array<int, true> keyed by folder id
 */
function poznoteOfflineShownFolderIds(array $folders, array $notes): array {
    $kept = poznoteOfflineFolderIds($folders);
    $parent = [];
    foreach ($folders as $folder) {
        $id = (int)($folder['id'] ?? 0);
        if ($id > 0) {
            $parent[$id] = isset($folder['parent_id']) && $folder['parent_id'] !== null ? (int)$folder['parent_id'] : null;
        }
    }
    $judged = [];
    $missing = [];
    foreach ($notes as $note) {
        $folderId = isset($note['folder_id']) && $note['folder_id'] !== null ? (int)$note['folder_id'] : 0;
        if ($folderId <= 0) {
            continue;
        }
        $mark = (int)($note['offline'] ?? 0);
        $isKept = $mark > 0 || ($mark === 0 && isset($kept[$folderId]));
        // The note counts for its folder and every folder above it
        $current = $folderId;
        $seen = [];
        while ($current !== null && array_key_exists($current, $parent) && !isset($seen[$current])) {
            $seen[$current] = true;
            $judged[$current] = true;
            if (!$isKept) {
                $missing[$current] = true;
            }
            $current = $parent[$current];
        }
    }
    $shown = [];
    foreach (array_keys($parent) as $id) {
        if (isset($judged[$id]) ? !isset($missing[$id]) : isset($kept[$id])) {
            $shown[$id] = true;
        }
    }
    return $shown;
}

/**
 * Ids of the folder $folderId and every folder under it. $folders as for
 * poznoteOfflineFolderIds().
 *
 * @param array<int, array<string, mixed>> $folders
 * @return list<int>
 */
function poznoteOfflineFolderSubtree(array $folders, int $folderId): array {
    $children = [];
    foreach ($folders as $folder) {
        if (isset($folder['parent_id']) && $folder['parent_id'] !== null) {
            $children[(int)$folder['parent_id']][] = (int)$folder['id'];
        }
    }
    $subtree = [];
    $queue = [$folderId];
    while ($queue) {
        $id = array_shift($queue);
        if (isset($subtree[$id])) {
            continue;
        }
        $subtree[$id] = true;
        foreach ($children[$id] ?? [] as $child) {
            $queue[] = $child;
        }
    }
    return array_keys($subtree);
}

/**
 * Why a note is kept offline, or null when it is not. $note holds id,
 * folder_id, favorite, offline and updated (UTC, 'Y-m-d H:i:s'); $cutoff is
 * the oldest "updated" that still counts as recent, in the same format;
 * $folderIds is what poznoteOfflineFolderIds() returned.
 *
 * @param array<string, mixed> $note
 * @param array<int, true> $folderIds
 */
function poznoteOfflineReason(array $note, string $cutoff, array $folderIds): ?string {
    return poznoteOfflineReasons($note, $cutoff, $folderIds)[0] ?? null;
}

/**
 * Every reason a note is kept offline for, the most important first (the one
 * poznoteOfflineReason() gives): a favorite marked "Keep offline" is both.
 * "recent" only comes alone, for the notes the date rule alone keeps (a
 * recent date says nothing more about a note kept anyway). Empty when the
 * note is not kept. Same arguments as poznoteOfflineReason().
 *
 * @param array<string, mixed> $note
 * @param array<int, true> $folderIds
 * @return list<string>
 */
function poznoteOfflineReasons(array $note, string $cutoff, array $folderIds): array {
    $mark = (int)($note['offline'] ?? 0);
    if ($mark < 0) {
        return [];
    }
    $reasons = [];
    if ($mark > 0) {
        $reasons[] = 'note';
    }
    $folderId = isset($note['folder_id']) && $note['folder_id'] !== null ? (int)$note['folder_id'] : 0;
    if ($folderId > 0 && isset($folderIds[$folderId])) {
        $reasons[] = 'folder';
    }
    if (!empty($note['favorite'])) {
        $reasons[] = 'favorite';
    }
    $updated = (string)($note['updated'] ?? '');
    if (!$reasons && $updated !== '' && strcmp($updated, $cutoff) >= 0) {
        $reasons[] = 'recent';
    }
    return $reasons;
}

/**
 * The order the copies are made in: the notes kept whatever their date
 * before the recent ones, the most recently modified first within each
 * group. $a and $b carry a 'reason' (as poznoteOfflineReason) and 'updated'.
 *
 * @param array<string, mixed> $a
 * @param array<string, mixed> $b
 */
function poznoteOfflineCompare(array $a, array $b): int {
    $pinnedA = ($a['reason'] ?? 'recent') !== 'recent';
    $pinnedB = ($b['reason'] ?? 'recent') !== 'recent';
    if ($pinnedA !== $pinnedB) {
        return $pinnedA ? -1 : 1;
    }
    $byDate = strcmp((string)($b['updated'] ?? ''), (string)($a['updated'] ?? ''));
    if ($byDate !== 0) {
        return $byDate;
    }
    return (int)($b['id'] ?? 0) <=> (int)($a['id'] ?? 0);
}

/**
 * The notes that fit the two budgets, in the order of poznoteOfflineCompare():
 * at most $maxNotes notes and $maxBytes of text, whichever comes first, the
 * first note always kept. $sizeOf($note) returns the size of a note's text
 * and is called only while there is room, so the controller never reads a
 * file it will not send.
 *
 * @param array<int, array<string, mixed>> $notes
 * @return array<int, array<string, mixed>> the kept notes, each with 'bytes'
 */
function poznoteOfflineFit(array $notes, int $maxNotes, int $maxBytes, callable $sizeOf): array {
    usort($notes, 'poznoteOfflineCompare');
    $kept = [];
    $bytes = 0;
    foreach ($notes as $note) {
        if (count($kept) >= $maxNotes) {
            break;
        }
        $size = (int)$sizeOf($note);
        if ($bytes + $size > $maxBytes && !empty($kept)) {
            break;
        }
        $bytes += $size;
        $note['bytes'] = $size;
        $kept[] = $note;
    }
    return $kept;
}

/**
 * A token that changes when a note's list of attachments changes. Adding a
 * file writes only entries.attachments, so the version token (date, title,
 * content) stays the same: without this, a browser would keep an old list
 * of files until the text changed. $attachmentsJson is the column as
 * stored; '' when the note has no attachment.
 */
function poznoteOfflineFilesToken($attachmentsJson): string {
    $decoded = is_string($attachmentsJson) && $attachmentsJson !== '' ? json_decode($attachmentsJson, true) : null;
    if (!is_array($decoded)) {
        return '';
    }
    $ids = [];
    foreach ($decoded as $attachment) {
        if (is_array($attachment) && !empty($attachment['id'])) {
            $ids[] = (string)$attachment['id'];
        }
    }
    if (empty($ids)) {
        return '';
    }
    sort($ids, SORT_STRING);
    return md5(implode(',', $ids));
}

/**
 * The version token of a note, as the notes API sends it: the update
 * timestamp, the heading and a hash of the content, so two writes landing
 * within the same second still yield distinct tokens. NotesController and
 * OfflineController must agree on it, which is why it lives here.
 */
function poznoteNoteVersion(string $updated, string $heading, string $content): string {
    return md5($updated . '|' . $heading . '|' . md5($content));
}
