<?php
/**
 * AI Chat endpoint — proxies chat requests to an OpenAI-compatible server
 * (Ollama, LM Studio, OpenAI, ...) configured in the AI Assistant settings.
 *
 * Actions:
 *   POST ?action=chat  JSON {messages: [{role, content}...], note_id?}
 *                      → SSE stream (OpenAI chat.completion.chunk passthrough)
 *   POST ?action=test  → JSON {success, models?: [...], error?}
 */
require 'auth.php';
requireApiAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);

$action = $_GET['action'] ?? $_POST['action'] ?? 'chat';

/**
 * Build the chat completions URL from the configured base URL.
 * Accepts "http://host:11434", "http://host:11434/v1" or a full
 * ".../chat/completions" URL.
 */
function aiChatCompletionsUrl($baseUrl) {
    $url = rtrim(trim($baseUrl), '/');
    if ($url === '') return '';
    if (substr($url, -17) === '/chat/completions') return $url;
    if (substr($url, -3) !== '/v1') $url .= '/v1';
    return $url . '/chat/completions';
}

function aiChatModelsUrl($baseUrl) {
    $url = rtrim(trim($baseUrl), '/');
    if ($url === '') return '';
    if (substr($url, -17) === '/chat/completions') {
        $url = substr($url, 0, -17);
    }
    if (substr($url, -3) !== '/v1') $url .= '/v1';
    return $url . '/models';
}

function aiChatJsonError($httpCode, $message) {
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

$aiEnabled = getSetting('ai_chat_enabled', '0') === '1';
$aiUrl = trim((string)getSetting('ai_chat_url', ''));
$aiModel = trim((string)getSetting('ai_chat_model', ''));
$aiApiKey = trim((string)getSetting('ai_chat_api_key', ''));

if ($action === 'test') {
    $testUrl = trim((string)($_POST['url'] ?? $aiUrl));
    if ($testUrl === '') {
        aiChatJsonError(400, 'No server URL configured');
    }
    $ch = curl_init(aiChatModelsUrl($testUrl));
    $headers = ['Accept: application/json'];
    $testKey = trim((string)($_POST['api_key'] ?? $aiApiKey));
    if ($testKey !== '') {
        $headers[] = 'Authorization: Bearer ' . $testKey;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    header('Content-Type: application/json');
    if ($body === false) {
        echo json_encode(['success' => false, 'error' => $err]);
        exit;
    }
    if ($status < 200 || $status >= 300) {
        echo json_encode(['success' => false, 'error' => 'HTTP ' . $status]);
        exit;
    }
    $models = [];
    $decoded = json_decode($body, true);
    foreach (($decoded['data'] ?? []) as $m) {
        if (!empty($m['id'])) $models[] = $m['id'];
    }
    echo json_encode(['success' => true, 'models' => $models]);
    exit;
}

if ($action !== 'chat') {
    aiChatJsonError(400, 'Unknown action');
}

if (!$aiEnabled || $aiUrl === '' || $aiModel === '') {
    aiChatJsonError(400, 'AI assistant is not configured');
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || !isset($input['messages']) || !is_array($input['messages'])) {
    aiChatJsonError(400, 'Invalid request body');
}

// Sanitize conversation: only role/content pairs, bounded size
$messages = [];
foreach (array_slice($input['messages'], -40) as $msg) {
    if (!is_array($msg)) continue;
    $role = $msg['role'] ?? '';
    $content = $msg['content'] ?? '';
    if (!in_array($role, ['user', 'assistant'], true) || !is_string($content)) continue;
    if (strlen($content) > 32000) {
        $content = substr($content, 0, 32000);
    }
    $messages[] = ['role' => $role, 'content' => $content];
}
if (empty($messages)) {
    aiChatJsonError(400, 'No messages provided');
}

// Build system prompt, optionally with the current note as context
$system = 'You are the AI assistant built into Poznote, a personal note-taking app. '
    . 'Help the user with their notes: answer questions, summarize, rewrite, brainstorm. '
    . 'Be concise. Answer in the language the user writes in.';

$noteId = isset($input['note_id']) ? intval($input['note_id']) : 0;
if ($noteId > 0) {
    $stmt = $con->prepare('SELECT id, heading, entry, type, tags, folder FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$noteId]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($note) {
        $noteType = $note['type'] ?? 'note';
        $filename = getEntryFilename($note['id'], $noteType);
        $content = is_readable($filename) ? (string)file_get_contents($filename) : (string)($note['entry'] ?? '');

        if ($noteType === 'tasklist') {
            $items = json_decode(resolveTasklistStoredContent($content, $note['entry'] ?? ''), true);
            if (is_array($items)) {
                $lines = [];
                foreach ($items as $item) {
                    if (!is_array($item)) continue;
                    $lines[] = (!empty($item['completed']) ? '[x] ' : '[ ] ') . (string)($item['text'] ?? '');
                }
                $content = implode("\n", $lines);
            }
        } elseif ($noteType !== 'markdown') {
            // HTML notes: convert to readable plain text
            $content = preg_replace('/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr)>/i', "\n", $content);
            $content = html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        $maxLen = 24000;
        $truncated = false;
        if (strlen($content) > $maxLen) {
            $content = substr($content, 0, $maxLen);
            $truncated = true;
        }

        $system .= "\n\nThe user currently has this note open:\n"
            . 'Title: ' . (string)($note['heading'] ?? 'Untitled') . "\n"
            . (!empty($note['tags']) ? 'Tags: ' . $note['tags'] . "\n" : '')
            . "Content:\n---\n" . $content . "\n---"
            . ($truncated ? "\n(note content truncated)" : '');
    }
}

array_unshift($messages, ['role' => 'system', 'content' => $system]);

$payload = json_encode([
    'model' => $aiModel,
    'messages' => $messages,
    'stream' => true,
]);

// Prepare SSE response
set_time_limit(0);
ignore_user_abort(false);
while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');

$headers = ['Content-Type: application/json', 'Accept: text/event-stream'];
if ($aiApiKey !== '') {
    $headers[] = 'Authorization: Bearer ' . $aiApiKey;
}

$upstreamStatus = null;
$errorBody = '';

$ch = curl_init(aiChatCompletionsUrl($aiUrl));
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 600,
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$upstreamStatus, &$errorBody) {
        if ($upstreamStatus === null) {
            $upstreamStatus = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        }
        if ($upstreamStatus >= 400) {
            // Collect the error body instead of streaming it through
            $errorBody .= $chunk;
            return strlen($chunk);
        }
        echo $chunk;
        flush();
        return strlen($chunk);
    },
]);

$ok = curl_exec($ch);
$curlErr = curl_error($ch);
curl_close($ch);

if ($upstreamStatus !== null && $upstreamStatus >= 400) {
    $detail = 'HTTP ' . $upstreamStatus;
    $decoded = json_decode($errorBody, true);
    if (isset($decoded['error']['message'])) {
        $detail .= ': ' . $decoded['error']['message'];
    } elseif (isset($decoded['error']) && is_string($decoded['error'])) {
        $detail .= ': ' . $decoded['error'];
    }
    echo 'data: ' . json_encode(['poznote_error' => $detail]) . "\n\n";
} elseif ($ok === false && $upstreamStatus === null) {
    echo 'data: ' . json_encode(['poznote_error' => $curlErr ?: 'Connection failed']) . "\n\n";
}
echo "data: [DONE]\n\n";
flush();
