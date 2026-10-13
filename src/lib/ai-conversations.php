<?php
/**
 * The conversations of the AI assistant, kept on the server.
 *
 * The chat panel used to hold its conversation in the browser alone. Each
 * conversation is now a row of the account's own database, the one that
 * holds the notes it talks about: it follows the user from one browser to
 * another and leaves nothing behind on a shared computer.
 *
 * A row belongs to the signed-in user, not to the account. Several people
 * can work in one account (a workspace shared with them, an administrator
 * opening it on someone's behalf), and none of them reads the conversations
 * of another: every function here takes the user id and filters on it.
 *
 * Conversations are listed per workspace, as the assistant is scoped to the
 * workspace it was opened in, and only the most recent ones are kept.
 *
 * Nothing but a PDO handle is needed: tests/ai-conversations.test.php runs
 * these functions on an in-memory database.
 */

/** Conversations kept per user and workspace. */
const AI_CONVERSATIONS_MAX = 10;
/** The conversation window of the chat: messages kept, and bytes per message. */
const AI_CONVERSATION_MESSAGES_MAX = 40;
const AI_CONVERSATION_MESSAGE_MAX = 32000;
const AI_CONVERSATION_TITLE_MAX = 120;

/**
 * Messages as received from the browser reduced to what a conversation
 * holds: user and assistant turns with a text, the most recent ones, each
 * cut to the size the chat accepts.
 */
function aiSanitizeChatMessages($raw): array
{
    $messages = [];
    foreach (array_slice(is_array($raw) ? $raw : [], -AI_CONVERSATION_MESSAGES_MAX) as $message) {
        if (!is_array($message)) {
            continue;
        }
        $role = $message['role'] ?? '';
        $content = $message['content'] ?? '';
        if (!in_array($role, ['user', 'assistant'], true) || !is_string($content)) {
            continue;
        }
        // Cut on a character boundary: half a character would make the text invalid
        $messages[] = ['role' => $role, 'content' => mb_strcut($content, 0, AI_CONVERSATION_MESSAGE_MAX, 'UTF-8')];
    }
    return $messages;
}

/** Ids are made up by the browser: opaque, and only ever compared. */
function aiConversationIsValidId($id): bool
{
    return is_string($id) && preg_match('/^[a-z0-9]{8,32}$/', $id) === 1;
}

/** What a conversation is listed as: its first question, on one line. */
function aiConversationTitle(array $messages): string
{
    $first = $messages[0]['content'] ?? '';
    foreach ($messages as $message) {
        if ($message['role'] === 'user') {
            $first = $message['content'];
            break;
        }
    }
    return mb_substr(trim((string)preg_replace('/\s+/u', ' ', $first)), 0, AI_CONVERSATION_TITLE_MAX);
}

/**
 * Create the table on first use, as ActivityLog does for its own: the
 * schema heals itself without a step in the versioned bootstrap of
 * db_connect.php.
 */
function aiConversationsEnsureTable(PDO $con): void
{
    $con->exec('CREATE TABLE IF NOT EXISTS ai_conversations (
        user_id INTEGER NOT NULL,
        id TEXT NOT NULL,
        workspace TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT \'\',
        messages TEXT NOT NULL,
        updated INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
    )');
    $con->exec('CREATE INDEX IF NOT EXISTS idx_ai_conversations_list ON ai_conversations(user_id, workspace, updated)');
}

/**
 * The conversations of a user in a workspace, most recent first, without
 * their messages: [['id', 'title', 'updated' => Unix time]].
 */
function aiConversationsList(PDO $con, int $userId, string $workspace): array
{
    aiConversationsEnsureTable($con);
    $stmt = $con->prepare('SELECT id, title, updated FROM ai_conversations
        WHERE user_id = ? AND workspace = ? ORDER BY updated DESC, id DESC LIMIT ' . AI_CONVERSATIONS_MAX);
    $stmt->execute([$userId, $workspace]);
    $list = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $list[] = ['id' => (string)$row['id'], 'title' => (string)$row['title'], 'updated' => (int)$row['updated']];
    }
    return $list;
}

/** One conversation with its messages, or null when this user has none by that id there. */
function aiConversationGet(PDO $con, int $userId, string $workspace, string $id): ?array
{
    aiConversationsEnsureTable($con);
    $stmt = $con->prepare('SELECT messages, updated FROM ai_conversations WHERE user_id = ? AND workspace = ? AND id = ?');
    $stmt->execute([$userId, $workspace, $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    return [
        'id' => $id,
        'updated' => (int)$row['updated'],
        'messages' => aiSanitizeChatMessages(json_decode((string)$row['messages'], true)),
    ];
}

/**
 * Store a conversation, new or carried on, then drop what is not kept: the
 * user's conversations beyond the most recent ones of that workspace, and
 * anyone's in a workspace that no longer exists. $messages comes from
 * aiSanitizeChatMessages(); $now is the Unix time of the save.
 */
function aiConversationSave(PDO $con, int $userId, string $workspace, string $id, array $messages, int $now): bool
{
    if ($userId <= 0 || $workspace === '' || !aiConversationIsValidId($id) || $messages === []) {
        return false;
    }
    $json = json_encode($messages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        return false;
    }
    aiConversationsEnsureTable($con);
    $con->prepare('INSERT OR REPLACE INTO ai_conversations (user_id, id, workspace, title, messages, updated) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$userId, $id, $workspace, aiConversationTitle($messages), $json, $now]);

    $con->prepare('DELETE FROM ai_conversations WHERE user_id = ? AND workspace = ? AND id NOT IN (
            SELECT id FROM ai_conversations WHERE user_id = ? AND workspace = ?
            ORDER BY updated DESC, id DESC LIMIT ' . AI_CONVERSATIONS_MAX . '
        )')->execute([$userId, $workspace, $userId, $workspace]);
    $con->exec('DELETE FROM ai_conversations WHERE workspace NOT IN (SELECT name FROM workspaces)');
    return true;
}

function aiConversationDelete(PDO $con, int $userId, string $id): void
{
    aiConversationsEnsureTable($con);
    $con->prepare('DELETE FROM ai_conversations WHERE user_id = ? AND id = ?')->execute([$userId, $id]);
}

/** Conversations follow their workspace when it is renamed. */
function aiConversationsRenameWorkspace(PDO $con, string $oldName, string $newName): void
{
    aiConversationsEnsureTable($con);
    $con->prepare('UPDATE ai_conversations SET workspace = ? WHERE workspace = ?')->execute([$newName, $oldName]);
}
