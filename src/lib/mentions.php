<?php
/**
 * Mentions: "@username" in a note of a shared workspace (discussion #1621).
 *
 * A mention is plain text. Nothing is stored when it is written, so every
 * way of writing a note (the editors, the API, MCP, the AI chat, a restored
 * revision) mentions the same way, and so do Markdown and rich text notes:
 * a note mentions someone when its text holds "@" followed by the username
 * of a member of its workspace, the owner or one of the accounts it is
 * shared with. The notes are found when they are asked for, by reading the
 * owner's database.
 *
 * What is stored is the one thing the text cannot say: that the person
 * mentioned has dealt with it. mention_handled (master.db, written by the
 * person mentioned, who may not own the note) keeps how many times the note
 * named them at that moment. The note stays "handled" until it names them
 * more often than that: a second "@name" added later asks again, the first
 * one being edited or moved does not.
 */

/** How long the count shown on the rail is kept in the session. */
const POZNOTE_MENTION_COUNT_TTL = 20;

/**
 * Pattern of "@username" in a text. The "@" must not follow a character an
 * email address or a longer name could end with ("joe@tim" names nobody),
 * and the name must stop there: "@tim" is not found in "@timothy", nor in
 * "@tim.b" when "tim.b" may be another account, while the full stop of
 * "ask @tim." ends the sentence.
 */
function poznoteMentionPattern(string $username): string {
    return '/(?<![\p{L}\p{N}_.@\/-])@' . preg_quote($username, '/') . '(?![\p{L}\p{N}_-])(?!\.[\p{L}\p{N}])/iu';
}

/**
 * The text of a note as its reader sees it, from the content kept in
 * entries.entry: Markdown as it is, the task texts of a task list, and rich
 * text without its tags (an address in a link's href mentions nobody).
 */
function poznoteMentionPlainText(string $content, string $type): string {
    if ($type === 'markdown') {
        return $content;
    }
    if ($type === 'tasklist') {
        $tasks = json_decode($content, true);
        if (is_array($tasks)) {
            $texts = [];
            array_walk_recursive($tasks, static function ($value, $key) use (&$texts): void {
                if ($key === 'text' && is_string($value)) {
                    $texts[] = $value;
                }
            });
            $content = implode("\n", $texts);
        }
    }

    // A block that ends is a line that ends: "<p>@tim</p><p>next</p>" must
    // not read "@timnext"
    $content = (string)preg_replace('/<(br|\/p|\/div|\/li|\/h[1-6]|\/td|\/th|\/tr|\/blockquote|\/pre)\b[^>]*>/i', "\n", $content);
    $content = (string)preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', '', $content);
    $text = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return str_replace("\u{00A0}", ' ', $text);
}

/** How many times a text names an account. */
function poznoteCountMentions(string $text, string $username): int {
    if ($username === '' || $text === '') {
        return 0;
    }
    $count = preg_match_all(poznoteMentionPattern($username), $text);

    return $count === false ? 0 : $count;
}

/**
 * The line around the first mention of an account, cut to a few words on
 * each side, or '' when the text does not name it.
 */
function poznoteMentionExcerpt(string $text, string $username, int $radius = 90): string {
    if ($username === '' || !preg_match(poznoteMentionPattern($username), $text, $match, PREG_OFFSET_CAPTURE)) {
        return '';
    }
    $offset = (int)$match[0][1];
    $lineStart = strrpos(substr($text, 0, $offset), "\n");
    $lineStart = $lineStart === false ? 0 : $lineStart + 1;
    $lineEnd = strpos($text, "\n", $offset);
    $lineEnd = $lineEnd === false ? strlen($text) : $lineEnd;

    $before = (string)preg_replace('/\s+/u', ' ', substr($text, $lineStart, $offset - $lineStart));
    $after = (string)preg_replace('/\s+/u', ' ', substr($text, $offset, $lineEnd - $offset));
    if (mb_strlen($before, 'UTF-8') > $radius) {
        $before = '…' . ltrim(mb_substr($before, -$radius, null, 'UTF-8'));
    }
    if (mb_strlen($after, 'UTF-8') > $radius) {
        $after = rtrim(mb_substr($after, 0, $radius, 'UTF-8')) . '…';
    }

    return trim($before . $after);
}

/**
 * True when a note that names someone $count times still asks for them:
 * they never marked it as handled, or it names them more often since.
 */
function poznoteMentionIsOpen(int $count, ?int $handledCount): bool {
    return $count > 0 && ($handledCount === null || $count > $handledCount);
}

/**
 * The functions above are pure (tests/mentions.test.php); the ones below
 * read the databases and load what that takes when they are first called.
 */
function poznoteMentionLoadData(): void {
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../users/UserDataManager.php';
}

function poznoteEnsureMentionTable(PDO $master): void {
    static $done = false;
    if ($done) {
        return;
    }
    $master->exec("
        CREATE TABLE IF NOT EXISTS mention_handled (
            owner_user_id INTEGER NOT NULL,
            note_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            handled_count INTEGER NOT NULL,
            handled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (owner_user_id, note_id, user_id),
            FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");
    $done = true;
}

/**
 * The shared workspaces an account is a member of, its own ones first: rows
 * of owner_user_id, owner_username, workspace_name. A workspace shared with
 * nobody has no one to mention and is not listed.
 */
function poznoteMentionWorkspaces(int $userId): array {
    if ($userId <= 0) {
        return [];
    }
    poznoteMentionLoadData();
    $workspaces = [];
    $own = array_keys(getWorkspaceShareGranteesByWorkspace($userId));
    if ($own) {
        $profile = getUserProfileById($userId);
        $ownName = (string)($profile['username'] ?? '');
        foreach ($own as $workspaceName) {
            $workspaces[] = ['owner_user_id' => $userId, 'owner_username' => $ownName, 'workspace_name' => (string)$workspaceName];
        }
    }

    return array_merge($workspaces, getWorkspacesSharedWithUser($userId));
}

/**
 * Usernames of the members of a workspace, its owner first, or [] when it
 * is shared with nobody.
 *
 * @return string[]
 */
function poznoteMentionMembers(int $ownerUserId, string $workspaceName): array {
    poznoteMentionLoadData();
    $grantees = getWorkspaceShareGranteesByWorkspace($ownerUserId)[$workspaceName] ?? [];
    if (!$grantees) {
        return [];
    }
    $names = [];
    foreach (array_merge([$ownerUserId], $grantees) as $memberId) {
        $profile = getUserProfileById((int)$memberId);
        $name = trim((string)($profile['username'] ?? ''));
        if ($name !== '') {
            $names[] = $name;
        }
    }

    return $names;
}

function poznoteMentionUserConnection(int $userId): ?PDO {
    static $connections = [];
    if (array_key_exists($userId, $connections)) {
        return $connections[$userId];
    }
    $con = null;
    poznoteMentionLoadData();
    try {
        $dbPath = (new UserDataManager($userId))->getUserDatabasePath();
        if (is_file($dbPath)) {
            $con = new PDO('sqlite:' . $dbPath);
            $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $con->exec('PRAGMA busy_timeout = 5000');
        }
    } catch (Throwable $e) {
        error_log('Poznote: mentions cannot open the database of account ' . $userId . ': ' . $e->getMessage());
        $con = null;
    }

    return $connections[$userId] = $con;
}

/**
 * The notes that name an account, across the shared workspaces it is a
 * member of, most recently modified first inside each workspace.
 *
 * @param string[]|null $onlyWorkspaces of $onlyOwnerUserId, to read one
 *        account's workspaces instead of all of them
 * @return array<int,array<string,mixed>> rows of owner_user_id,
 *         owner_username, workspace, note_id, title, type, excerpt, count,
 *         handled, updated, updated_by
 */
function poznoteCollectMentions(int $userId, bool $includeHandled = false, ?int $onlyOwnerUserId = null, ?array $onlyWorkspaces = null): array {
    poznoteMentionLoadData();
    $profile = $userId > 0 ? getUserProfileById($userId) : null;
    $username = trim((string)($profile['username'] ?? ''));
    if ($username === '') {
        return [];
    }

    try {
        $master = getMasterConnection();
        poznoteEnsureMentionTable($master);
        $stmt = $master->prepare('SELECT owner_user_id, note_id, handled_count FROM mention_handled WHERE user_id = ?');
        $stmt->execute([$userId]);
        $handled = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $handled[(int)$row['owner_user_id']][(int)$row['note_id']] = (int)$row['handled_count'];
        }
    } catch (Throwable $e) {
        error_log('Poznote: mentions cannot read their state: ' . $e->getMessage());
        return [];
    }

    $like = '%@' . strtr($username, ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
    $usernames = [];
    $mentions = [];

    foreach (poznoteMentionWorkspaces($userId) as $workspace) {
        $ownerUserId = (int)$workspace['owner_user_id'];
        $workspaceName = (string)$workspace['workspace_name'];
        if ($onlyOwnerUserId !== null && $ownerUserId !== $onlyOwnerUserId) {
            continue;
        }
        if ($onlyWorkspaces !== null && !in_array($workspaceName, $onlyWorkspaces, true)) {
            continue;
        }
        $con = poznoteMentionUserConnection($ownerUserId);
        if ($con === null) {
            continue;
        }

        try {
            $stmt = $con->prepare("
                SELECT id, heading, entry, type, updated, updated_by_user_id
                FROM entries
                WHERE trash = 0 AND workspace = ? AND entry LIKE ? ESCAPE '\\'
                ORDER BY updated DESC, id DESC
            ");
            $stmt->execute([$workspaceName, $like]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            error_log('Poznote: mentions cannot read workspace "' . $workspaceName . '" of account ' . $ownerUserId . ': ' . $e->getMessage());
            continue;
        }

        foreach ($rows as $row) {
            $noteId = (int)$row['id'];
            $type = (string)($row['type'] ?? 'note');
            $text = poznoteMentionPlainText((string)$row['entry'], $type);
            $count = poznoteCountMentions($text, $username);
            if ($count === 0) {
                continue;
            }

            $handledCount = $handled[$ownerUserId][$noteId] ?? null;
            if ($handledCount !== null && $count < $handledCount) {
                // Some of the mentions that were handled are gone: the next
                // one to be added must count as a new one
                poznoteStoreMentionHandled($userId, $ownerUserId, $noteId, $count);
                $handledCount = $count;
            }
            $isOpen = poznoteMentionIsOpen($count, $handledCount);
            if (!$isOpen && !$includeHandled) {
                continue;
            }

            $editorId = (int)($row['updated_by_user_id'] ?? 0) ?: $ownerUserId;
            if (!isset($usernames[$editorId])) {
                $editor = getUserProfileById($editorId);
                $usernames[$editorId] = trim((string)($editor['username'] ?? ''));
            }

            $mentions[] = [
                'owner_user_id' => $ownerUserId,
                'owner_username' => (string)$workspace['owner_username'],
                'workspace' => $workspaceName,
                'note_id' => $noteId,
                'title' => (string)($row['heading'] ?? ''),
                'type' => $type,
                'excerpt' => poznoteMentionExcerpt($text, $username),
                'count' => $count,
                'handled' => !$isOpen,
                'updated' => (string)($row['updated'] ?? ''),
                'updated_by' => $usernames[$editorId],
            ];
        }
    }

    return $mentions;
}

function poznoteStoreMentionHandled(int $userId, int $ownerUserId, int $noteId, ?int $count): void {
    poznoteMentionLoadData();
    $master = getMasterConnection();
    poznoteEnsureMentionTable($master);
    if ($count === null || $count <= 0) {
        $master->prepare('DELETE FROM mention_handled WHERE owner_user_id = ? AND note_id = ? AND user_id = ?')
            ->execute([$ownerUserId, $noteId, $userId]);
    } else {
        $master->prepare("
            INSERT INTO mention_handled (owner_user_id, note_id, user_id, handled_count, handled_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(owner_user_id, note_id, user_id) DO UPDATE SET handled_count = excluded.handled_count, handled_at = excluded.handled_at
        ")->execute([$ownerUserId, $noteId, $userId, $count]);
    }
    unset($_SESSION['mention_count_cache']);
}

/**
 * Mark the mentions of an account in a note as handled, or as open again.
 * False when the note does not name the account in a workspace it is a
 * member of: there is nothing to mark, and no one else's note to probe.
 */
function poznoteSetMentionHandled(int $userId, int $ownerUserId, int $noteId, bool $handled): bool {
    foreach (poznoteCollectMentions($userId, true, $ownerUserId) as $mention) {
        if ($mention['note_id'] === $noteId) {
            poznoteStoreMentionHandled($userId, $ownerUserId, $noteId, $handled ? (int)$mention['count'] : null);
            return true;
        }
    }

    return false;
}

/**
 * How many notes are waiting for an account, for the rail. Asked on every
 * page, so the answer is kept for a few seconds in the session.
 */
function poznoteOpenMentionCount(int $userId): int {
    if ($userId <= 0) {
        return 0;
    }
    $cached = $_SESSION['mention_count_cache'] ?? null;
    if (is_array($cached) && (int)($cached['user'] ?? 0) === $userId && (int)($cached['until'] ?? 0) >= time()) {
        return (int)($cached['count'] ?? 0);
    }
    $count = count(poznoteCollectMentions($userId));
    if (session_status() === PHP_SESSION_ACTIVE) {
        $_SESSION['mention_count_cache'] = ['user' => $userId, 'count' => $count, 'until' => time() + POZNOTE_MENTION_COUNT_TTL];
    }

    return $count;
}

/**
 * Ids of the notes of one workspace that are waiting for an account, for the
 * marker of the notes list.
 *
 * @return int[]
 */
function poznoteOpenMentionNoteIds(int $userId, int $ownerUserId, string $workspaceName): array {
    if ($userId <= 0 || $ownerUserId <= 0 || $workspaceName === '') {
        return [];
    }

    return array_map(
        static function (array $mention): int { return (int)$mention['note_id']; },
        poznoteCollectMentions($userId, false, $ownerUserId, [$workspaceName])
    );
}
