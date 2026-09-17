<?php
/**
 * Making a note own the attachments its content points at.
 *
 * An attachment is addressed as /api/v1/notes/<note>/attachments/<id> (an
 * audio embed as audio_player.php?note=<note>&attachment=<id>), an address
 * that only means something for that note, in that account. Content
 * moves, though: copied from one note to another, pasted from an account into
 * another (the ids are then resolved against the wrong account and the image
 * comes out broken, or as another note's file), or copied out of the
 * read-only view of another account's note (account_attachment.php). The
 * pasted text still shows the picture for a while, or never, and nothing says
 * why.
 *
 * So every save of an HTML or markdown note runs through
 * poznoteAdoptForeignAttachments(): a reference that is not one of the note's
 * own attachments is looked up, first in the active account, then in the
 * other accounts the signed-in person can open, its file is COPIED into the
 * note under a new id, and the address is rewritten. A reference nobody can
 * resolve is left as it is. Each copy remembers where it came from
 * ('adopted_from'), so the next save of the same stale text reuses it instead
 * of copying again: the editor still holds the old address until
 * js/attachment-adoption.js swaps it from the save answer.
 *
 * The first three functions are pure (tests/attachment-adoption.test.php).
 */

/**
 * Every attachment address found in a piece of note content, HTML or markdown.
 *
 * @param string      $content
 * @param string|null $currentHost Host of this instance; an absolute URL to
 *                                 another host is not ours to resolve
 * @return array list of ['url' => matched text, 'account' => int|null,
 *               'note' => int, 'attachment' => string, 'kind' => 'file'|'audio',
 *               'download' => bool]
 */
function poznoteFindAttachmentRefs(string $content, ?string $currentHost = null): array
{
    $refs = [];
    // What ends a URL in HTML attributes and in markdown. "=" is NOT one: the
    // match must start where the URL starts, so that an address sitting in
    // the query string of another URL (?u=/api/v1/notes/...) is seen with its
    // real prefix and refused.
    $delimiters = '\s"\'()<>';

    $acceptPrefix = static function (string $prefix) use ($currentHost): bool {
        if (!preg_match('#^(?:(https?:)?//([^/]+))?(?:/[\w.~%-]+)*/?$#i', $prefix, $m)) {
            return false;
        }
        $host = $m[2] ?? '';
        return $host === '' || $currentHost === null || strcasecmp($host, $currentHost) === 0;
    };

    // /api/v1/notes/<note>/attachments/<id>, with or without origin and query
    if (preg_match_all('#([^' . $delimiters . ']*?)api/v1/notes/(\d+)/attachments/([A-Za-z0-9_-]+)((?:\?[^' . $delimiters . ']*)?)#', $content, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            if ($acceptPrefix($m[1])) {
                $refs[] = [
                    'url' => $m[0], 'account' => null, 'note' => (int)$m[2], 'attachment' => $m[3],
                    'kind' => 'file', 'download' => (bool)preg_match('#[?&](?:amp;)?download=1\b#', $m[4]),
                ];
            }
        }
    }

    // audio_player.php?note=<n>&attachment=<id>[&workspace=...], the iframe of
    // an audio embed (the order every builder of that URL uses)
    if (preg_match_all('#([^' . $delimiters . ']*?)audio_player\.php\?note=(\d+)&(?:amp;)?attachment=([A-Za-z0-9_-]+)((?:&[^' . $delimiters . ']*)?)#', $content, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            if ($acceptPrefix($m[1])) {
                $refs[] = [
                    'url' => $m[0], 'account' => null, 'note' => (int)$m[2], 'attachment' => $m[3],
                    'kind' => 'audio', 'download' => false,
                ];
            }
        }
    }

    // account_attachment.php?account=<a>&note=<n>&attachment=<id> (& or &amp;)
    if (preg_match_all('#([^' . $delimiters . ']*?)account_attachment\.php\?account=(\d+)&(?:amp;)?note=(\d+)&(?:amp;)?attachment=([A-Za-z0-9_.-]+)#', $content, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            if ($acceptPrefix($m[1])) {
                $refs[] = [
                    'url' => $m[0], 'account' => (int)$m[2], 'note' => (int)$m[3], 'attachment' => $m[4],
                    'kind' => 'file', 'download' => false,
                ];
            }
        }
    }

    return $refs;
}

/** Identity of a reference, also what 'adopted_from' stores. */
function poznoteAttachmentRefKey(array $ref): string
{
    return (int)($ref['account'] ?? 0) . ':' . (int)$ref['note'] . ':' . $ref['attachment'];
}

/**
 * The references that do not already resolve to one of the note's own
 * attachments at the note's own address.
 *
 * @param array $ownIds ids of the note's attachments
 */
function poznoteForeignAttachmentRefs(array $refs, int $noteId, array $ownIds): array
{
    $own = array_fill_keys(array_map('strval', $ownIds), true);
    return array_values(array_filter($refs, static function (array $ref) use ($noteId, $own): bool {
        return !($ref['account'] === null && $ref['note'] === $noteId && isset($own[$ref['attachment']]));
    }));
}

/**
 * The note's own address of an attachment, in the shape the reference had:
 * a file, a forced download, or the player of an audio embed. No workspace
 * in it: the name copied along may not exist where the content landed.
 */
function poznoteOwnAttachmentAddress(int $noteId, string $attachmentId, array $ref = []): string
{
    if (($ref['kind'] ?? 'file') === 'audio') {
        return '/audio_player.php?note=' . $noteId . '&attachment=' . rawurlencode($attachmentId);
    }
    return '/api/v1/notes/' . $noteId . '/attachments/' . rawurlencode($attachmentId)
        . (!empty($ref['download']) ? '?download=1' : '');
}

/**
 * Replaces each matched address by the note's own address of the new id.
 *
 * @param array $newIdByUrl matched text => attachment id in the note
 * @param array $refByUrl   matched text => its reference (shape of the address)
 */
function poznoteRewriteAttachmentRefs(string $content, int $noteId, array $newIdByUrl, array $refByUrl = []): string
{
    if (empty($newIdByUrl)) {
        return $content;
    }
    // Longest first: an address with a query string contains the bare one.
    uksort($newIdByUrl, static function (string $a, string $b): int {
        return strlen($b) <=> strlen($a);
    });
    $pairs = [];
    foreach ($newIdByUrl as $url => $newId) {
        $address = poznoteOwnAttachmentAddress($noteId, (string)$newId, $refByUrl[$url] ?? []);
        // Inside an HTML attribute the "&" of the player's query is written &amp;
        $pairs[$url] = strpos($url, '&amp;') !== false ? str_replace('&', '&amp;', $address) : $address;
    }
    return strtr($content, $pairs);
}

/**
 * Attachment record of a note in a given database, or null.
 */
function poznoteFindNoteAttachment(PDO $pdo, int $noteId, string $attachmentId): ?array
{
    $stmt = $pdo->prepare('SELECT attachments, linked_note_id FROM entries WHERE id = ?');
    $stmt->execute([$noteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && !empty($row['linked_note_id'])) {
        $stmt->execute([(int)$row['linked_note_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: $row;
    }
    $list = $row && !empty($row['attachments']) ? json_decode((string)$row['attachments'], true) : [];
    foreach (is_array($list) ? $list : [] as $attachment) {
        if ((string)($attachment['id'] ?? '') === $attachmentId && !empty($attachment['filename'])) {
            return $attachment;
        }
    }
    return null;
}

/**
 * See the file header.
 *
 * @param PDO   $con                 database of the active account
 * @param array $existingAttachments the note's attachment records
 * @return array ['content' => string, 'new_attachments' => array,
 *               'adopted' => list of ['url', 'id', 'new_url'] for the client]
 */
function poznoteAdoptForeignAttachments(PDO $con, int $noteId, string $content, array $existingAttachments): array
{
    $result = ['content' => $content, 'new_attachments' => [], 'adopted' => []];
    // Cheap way out for the vast majority of saves: none of the three shapes.
    if ($content === '' || (strpos($content, '/attachments/') === false
        && strpos($content, 'account_attachment.php') === false
        && strpos($content, 'audio_player.php') === false)) {
        return $result;
    }

    $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : null;
    $ownIds = array_map(static function ($a) { return (string)($a['id'] ?? ''); }, $existingAttachments);
    $foreign = poznoteForeignAttachmentRefs(poznoteFindAttachmentRefs($content, $host), $noteId, $ownIds);
    if (empty($foreign)) {
        return $result;
    }

    $activeUserId = function_exists('getCurrentUserId') ? (int)(getCurrentUserId() ?? 0) : 0;
    // Other accounts are only searched for a person signed in to the web app.
    // A request carrying API credentials (Basic, Bearer, the MCP service
    // token) acts for the one account it names: the API lets user credentials
    // reach their own data only, and this must not be a way around it.
    $isWebSession = function_exists('isRealUserAuthenticated') && isRealUserAuthenticated()
        && !(function_exists('hasApiAuthCredentials') && hasApiAuthCredentials());
    $authUserId = $isWebSession && function_exists('getAuthenticatedUserId')
        ? (int)(getAuthenticatedUserId() ?? 0)
        : 0;
    $otherAccountIds = [];
    if ($authUserId > 0 && function_exists('getUserAccessibleAccountIds')) {
        foreach (getUserAccessibleAccountIds($authUserId) as $accountId) {
            if ((int)$accountId !== $activeUserId) {
                $otherAccountIds[] = (int)$accountId;
            }
        }
    }

    $adoptedFrom = [];
    foreach ($existingAttachments as $attachment) {
        if (!empty($attachment['adopted_from'])) {
            $adoptedFrom[(string)$attachment['adopted_from']] = (string)$attachment['id'];
        }
    }
    $own = array_fill_keys($ownIds, true);

    $accountDb = static function (int $accountId): ?PDO {
        static $opened = [];
        if (!array_key_exists($accountId, $opened)) {
            $opened[$accountId] = null;
            require_once __DIR__ . '/../users/UserDataManager.php';
            $path = (new UserDataManager($accountId))->getUserDatabasePath();
            if (is_file($path)) {
                try {
                    $pdo = new PDO('sqlite:' . $path);
                    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    $pdo->exec('PRAGMA busy_timeout = 5000');
                    $pdo->exec('PRAGMA query_only = 1');
                    $opened[$accountId] = $pdo;
                } catch (Exception $e) {
                    error_log('attachment adoption: cannot open account ' . $accountId . ': ' . $e->getMessage());
                }
            }
        }
        return $opened[$accountId];
    };

    $newIdByUrl = [];
    $refByUrl = [];
    foreach ($foreign as $ref) {
        $key = poznoteAttachmentRefKey($ref);
        $refByUrl[$ref['url']] = $ref;

        // The note's own file under another note's address: only the address is wrong.
        if ($ref['account'] === null && isset($own[$ref['attachment']])) {
            $newIdByUrl[$ref['url']] = $ref['attachment'];
            continue;
        }
        // Copied by an earlier save of this same text.
        if (isset($adoptedFrom[$key])) {
            $newIdByUrl[$ref['url']] = $adoptedFrom[$key];
            continue;
        }

        // Where the file lives: [account id, record]
        $source = null;
        if ($ref['account'] === null || $ref['account'] === $activeUserId) {
            $record = poznoteFindNoteAttachment($con, $ref['note'], $ref['attachment']);
            if ($record !== null && !($ref['note'] === $noteId)) {
                $source = [$activeUserId, $record];
            }
        }
        if ($source === null) {
            $candidates = $ref['account'] === null
                ? $otherAccountIds
                : (in_array($ref['account'], $otherAccountIds, true) ? [$ref['account']] : []);
            foreach ($candidates as $accountId) {
                $pdo = $accountDb($accountId);
                $record = $pdo ? poznoteFindNoteAttachment($pdo, $ref['note'], $ref['attachment']) : null;
                if ($record !== null) {
                    $source = [$accountId, $record];
                    break;
                }
            }
        }
        if ($source === null) {
            continue;
        }

        [$sourceAccountId, $record] = $source;
        if (function_exists('poznoteAttachmentIsSnapshotOnly') && poznoteAttachmentIsSnapshotOnly($record)) {
            continue;
        }
        $sourceStorage = $sourceAccountId === $activeUserId || $sourceAccountId <= 0
            ? poznoteAttachmentStorage()
            : AttachmentStorage::forUser($sourceAccountId);
        $localPath = $sourceStorage->localFile((string)$record['filename']);
        if ($localPath === null || !is_readable($localPath)) {
            continue;
        }
        $size = (int)filesize($localPath);
        if (function_exists('poznoteCheckAttachmentStorageQuota') && poznoteCheckAttachmentStorageQuota($size) !== null) {
            continue;
        }

        $newId = uniqid();
        $extension = pathinfo((string)$record['filename'], PATHINFO_EXTENSION);
        $newFilename = $newId . '_' . time() . ($extension !== '' ? '.' . $extension : '');
        $fileType = (string)($record['file_type'] ?? 'application/octet-stream');
        if (!poznoteAttachmentStorage()->storeFile($localPath, $newFilename, $fileType)) {
            continue;
        }

        $newRecord = [
            'id' => $newId,
            'filename' => $newFilename,
            'original_filename' => (string)($record['original_filename'] ?? $newFilename),
            'file_size' => $size,
            'file_type' => $fileType,
            'uploaded_at' => date('Y-m-d H:i:s'),
            'adopted_from' => $key,
        ];
        $result['new_attachments'][] = $newRecord;
        $adoptedFrom[$key] = $newId;
        $newIdByUrl[$ref['url']] = $newId;
    }

    if (!empty($newIdByUrl)) {
        $result['content'] = poznoteRewriteAttachmentRefs($content, $noteId, $newIdByUrl, $refByUrl);
        foreach ($newIdByUrl as $url => $newId) {
            $result['adopted'][] = [
                'url' => html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'id' => $newId,
                'new_url' => poznoteOwnAttachmentAddress($noteId, (string)$newId, $refByUrl[$url] ?? []),
            ];
        }
    }
    return $result;
}
