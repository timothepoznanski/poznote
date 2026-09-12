<?php
/**
 * Note snapshots: retention, expiry and the attachments only they still reference.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * A stored snapshot count, or the default when it is out of range.
 *
 * A setting can hold anything a hand-written API call put there. Falling back
 * to the default matters more here than anywhere else: a count read as 0 would
 * mean "purge every snapshot", which is the opposite of what the feature is
 * for.
 */
function poznoteClampSnapshotsKeepCount($value, int $min, int $max, int $default): int {
    $count = (int) $value;
    if ($count < $min || $count > $max) {
        return $default;
    }

    return $count;
}

/**
 * How many automatic (daily) snapshots are kept per note (user setting,
 * default 3). Manual snapshots are not limited.
 */
function getSnapshotsKeepCount() {
    return poznoteClampSnapshotsKeepCount(
        getSetting('snapshots_keep_count', POZNOTE_SNAPSHOTS_DEFAULT_COUNT),
        POZNOTE_SNAPSHOTS_MIN_COUNT,
        POZNOTE_SNAPSHOTS_MAX_COUNT,
        POZNOTE_SNAPSHOTS_DEFAULT_COUNT
    );
}

/**
 * How many safety snapshots (taken before an AI assistant or the MCP server
 * rewrites a note) are kept per note. User setting, default 20: an instance
 * doing many MCP edits rolls through that in an afternoon, and one doing none
 * has no reason to keep 20 copies of every note (issue #1365).
 */
function getSafetySnapshotsKeepCount() {
    return poznoteClampSnapshotsKeepCount(
        getSetting('snapshots_safety_keep_count', POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT),
        POZNOTE_SNAPSHOTS_SAFETY_MIN_COUNT,
        POZNOTE_SNAPSHOTS_SAFETY_MAX_COUNT,
        POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT
    );
}

function getNoteSnapshotsDir($noteId) {
    return dirname(getEntriesPath()) . '/snapshots/' . (int) $noteId;
}

/**
 * Contents of every snapshot file of a note (HTML and Markdown alike).
 */
function poznoteReadNoteSnapshotContents($noteId) {
    $snapshotDir = getNoteSnapshotsDir($noteId);
    if (!is_dir($snapshotDir)) {
        return [];
    }

    $contents = [];
    foreach (scandir($snapshotDir) ?: [] as $file) {
        if (!preg_match('/\.(html|md)$/', $file)) {
            continue;
        }

        $content = @file_get_contents($snapshotDir . '/' . $file);
        if (is_string($content) && $content !== '') {
            $contents[] = $content;
        }
    }

    return $contents;
}

function poznoteAttachmentIsReferencedInSnapshots($noteId, array $attachment, ?array $snapshotContents = null) {
    if ($snapshotContents === null) {
        $snapshotContents = poznoteReadNoteSnapshotContents($noteId);
    }

    foreach ($snapshotContents as $content) {
        if (poznoteAttachmentIsReferencedInContent($attachment, $content)) {
            return true;
        }
    }

    return false;
}

/**
 * Delete the snapshot-only attachments of a note that no snapshot references
 * any more (called after snapshots are purged). Attachments the current
 * content still references are made visible again instead.
 */
function poznotePruneSnapshotOnlyAttachments(PDO $con, $noteId) {
    $noteId = (int) $noteId;
    if ($noteId <= 0) {
        return;
    }

    $stmt = $con->prepare('SELECT attachments, entry, type FROM entries WHERE id = ?');
    $stmt->execute([$noteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return;
    }

    $currentContent = (string) ($row['entry'] ?? '');
    $noteFile = getEntryFilename($noteId, $row['type'] ?? 'note');
    if (is_readable($noteFile)) {
        $fileContent = file_get_contents($noteFile);
        if ($fileContent !== false) {
            $currentContent = $fileContent;
        }
    }

    $attachments = poznoteDecodeAttachments($row['attachments'] ?? '');
    $hasSnapshotOnly = false;
    foreach ($attachments as $attachment) {
        if (poznoteAttachmentIsSnapshotOnly($attachment)) {
            $hasSnapshotOnly = true;
            break;
        }
    }
    if (!$hasSnapshotOnly) {
        return;
    }

    $snapshotContents = poznoteReadNoteSnapshotContents($noteId);
    $kept = [];
    $changed = false;

    foreach ($attachments as $attachment) {
        if (!poznoteAttachmentIsSnapshotOnly($attachment)) {
            $kept[] = $attachment;
            continue;
        }

        if (poznoteAttachmentIsReferencedInContent($attachment, $currentContent)) {
            unset($attachment['snapshot_only']);
            $kept[] = $attachment;
            $changed = true;
            continue;
        }

        if (poznoteAttachmentIsReferencedInSnapshots($noteId, $attachment, $snapshotContents)) {
            $kept[] = $attachment;
            continue;
        }

        poznoteDeleteAttachmentFile($attachment['filename'] ?? '');
        $changed = true;
    }

    if ($changed) {
        $update = $con->prepare('UPDATE entries SET attachments = ? WHERE id = ?');
        $update->execute([json_encode($kept), $noteId]);
    }
}

/**
 * Delete the snapshots of a note older than POZNOTE_SNAPSHOTS_MAX_AGE_DAYS,
 * automatic and manual alike, then drop the attachments only they kept.
 * Returns the number of snapshots removed.
 */
function poznoteExpireNoteSnapshots(PDO $con, $noteId) {
    $noteId = (int) $noteId;
    $snapshotDir = getNoteSnapshotsDir($noteId);
    if ($noteId <= 0 || !is_dir($snapshotDir)) {
        return 0;
    }

    $cutoff = time() - POZNOTE_SNAPSHOTS_MAX_AGE_DAYS * 86400;
    $removed = 0;

    foreach (scandir($snapshotDir) ?: [] as $file) {
        if (!preg_match('/^((\d{4}-\d{2}-\d{2})(?:--[A-Za-z0-9_-]+)?)\.\.?(html|md)$/', $file, $matches)) {
            continue;
        }

        $metaFile = $snapshotDir . '/' . $matches[1] . '.meta.json';
        $meta = json_decode((string) @file_get_contents($metaFile), true) ?: [];
        $createdAtRaw = trim((string) ($meta['created_at'] ?? ''));
        $createdAt = $createdAtRaw !== '' ? strtotime($createdAtRaw . ' UTC') : false;
        if ($createdAt === false) {
            $createdAt = strtotime($matches[2] . ' UTC');
        }
        if ($createdAt === false || $createdAt >= $cutoff) {
            continue;
        }

        @unlink($snapshotDir . '/' . $file);
        @unlink($metaFile);
        $removed++;
    }

    if ($removed > 0) {
        poznotePruneSnapshotOnlyAttachments($con, $noteId);
        if (count(scandir($snapshotDir) ?: []) <= 2) {
            @rmdir($snapshotDir);
        }
    }

    return $removed;
}

/**
 * Expire the snapshots of every note of the current user, at most once a day.
 * There is no scheduler: opening a note only expires that note's snapshots,
 * so notes left untouched would keep theirs (and the attachments they pin)
 * forever without this sweep.
 */
function poznoteExpireAllSnapshotsOccasionally(PDO $con) {
    $today = gmdate('Y-m-d');
    if ((string) getSetting('snapshots_expiry_sweep_at', '') === $today) {
        return;
    }

    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $stmt->execute(['snapshots_expiry_sweep_at', $today]);
    } catch (Exception $e) {
        return;
    }

    $snapshotsRoot = dirname(getEntriesPath()) . '/snapshots';
    if (!is_dir($snapshotsRoot)) {
        return;
    }

    $noteExists = $con->prepare('SELECT 1 FROM entries WHERE id = ?');

    foreach (scandir($snapshotsRoot) ?: [] as $entry) {
        if (!ctype_digit($entry)) {
            continue;
        }

        // Snapshots of a note that no longer exists at all (deleted while the
        // cleanup failed, or a database restored from an older backup)
        $noteExists->execute([(int) $entry]);
        if ($noteExists->fetchColumn() === false) {
            deleteNoteSnapshots((int) $entry);
            continue;
        }

        poznoteExpireNoteSnapshots($con, (int) $entry);
    }

    // Attachments kept for snapshots that no longer exist (a database restored
    // from a backup brings the flags back, not the snapshot files)
    try {
        $flagged = $con->query("SELECT id FROM entries WHERE attachments LIKE '%\"snapshot_only\"%'");
        foreach ($flagged->fetchAll(PDO::FETCH_COLUMN) as $noteId) {
            poznotePruneSnapshotOnlyAttachments($con, (int) $noteId);
        }
    } catch (Exception $e) {
        // Cleanup only: never break the page load
        error_log('functions: poznoteExpireAllSnapshotsOccasionally() failed: ' . $e->getMessage());
    }
}

/**
 * Take a snapshot of a note right before an automated writer (the AI
 * assistant, the MCP server) replaces its content, so hours of edits are
 * never one bad rewrite away from being lost. Best-effort: a failure is
 * logged and never blocks the write. One snapshot per note per request,
 * whatever the number of tool calls that touch it. Returns true when a
 * snapshot was actually written.
 */
function poznoteCreateSafetySnapshot(PDO $con, $noteId, string $origin): bool {
    static $done = [];

    $noteId = (int) $noteId;
    if ($noteId <= 0) {
        return false;
    }
    if (isset($done[$noteId])) {
        return false;
    }
    $done[$noteId] = true;

    try {
        require_once __DIR__ . '/../api/v1/controllers/SnapshotsController.php';
        $controller = new SnapshotsController($con);
        $result = $controller->createSafetySnapshot($noteId, $origin);
        if (empty($result['success'])) {
            error_log('Safety snapshot (' . $origin . ') failed for note ' . $noteId . ': ' . ($result['error'] ?? 'unknown error'));
            return false;
        }
        return !empty($result['created']);
    } catch (Throwable $e) {
        error_log('Safety snapshot (' . $origin . ') failed for note ' . $noteId . ': ' . $e->getMessage());
        return false;
    }
}

function deleteNoteSnapshots($noteId) {
    $noteId = (int) $noteId;
    if ($noteId <= 0) {
        return;
    }

    $snapshotDir = getNoteSnapshotsDir($noteId);
    if (!is_dir($snapshotDir)) {
        return;
    }

    $deletePath = static function (string $path) use (&$deletePath): void {
        if (is_dir($path)) {
            $entries = scandir($path);
            if ($entries !== false) {
                foreach ($entries as $entry) {
                    if ($entry === '.' || $entry === '..') {
                        continue;
                    }

                    $deletePath($path . '/' . $entry);
                }
            }

            @rmdir($path);
            return;
        }

        @unlink($path);
    };

    $deletePath($snapshotDir);
}
