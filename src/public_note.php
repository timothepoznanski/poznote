<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

$token = $_GET['token'] ?? '';
if (!$token) {
    http_response_code(400);
    echo 'Token missing';
    exit;
}

try {
    $stmt = $con->prepare('SELECT note_id, created FROM shared_notes WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo 'Shared note not found';
        exit;
    }

    $note_id = $row['note_id'];

    $stmt = $con->prepare('SELECT heading, entry, created, updated, type FROM entries WHERE id = ?');
    $stmt->execute([$note_id]);
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$note) {
        http_response_code(404);
        echo 'Note not found';
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo 'Server error';
    exit;
}

// Render read-only page
// If an HTML file was saved for this note (data/entries/<id>.html), prefer using it so we preserve the exact HTML (images, formatting).
$htmlFile = getEntriesRelativePath() . $note_id . '.html';
$content = '';
if (is_readable($htmlFile)) {
    $content = file_get_contents($htmlFile);
} else {
    // Fallback to DB field if no file exists
    $content = $note['entry'] ?? '';
}

// If this is a tasklist type, try to parse the stored JSON and render a readable task list
if (isset($note['type']) && $note['type'] === 'tasklist') {
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        $tasksHtml = '<div class="task-list-container">';
        $tasksHtml .= '<div class="tasks-list">';
        foreach ($decoded as $task) {
            $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES) : '';
            $completed = !empty($task['completed']) ? ' completed' : '';
            $checked = !empty($task['completed']) ? ' checked' : '';
            $tasksHtml .= '<div class="task-item'.$completed.'">';
            $tasksHtml .= '<input type="checkbox" disabled'.$checked.' /> ';
            $tasksHtml .= '<span class="task-text">'.$text.'</span>';
            $tasksHtml .= '</div>';
        }
        $tasksHtml .= '</div></div>';
        $content = $tasksHtml;
    } else {
        // If JSON parse fails, escape raw content
        $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
    }
}
$baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
// If the app is in a subdirectory, ensure the base includes the script dir
$scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
if ($scriptDir && $scriptDir !== '/') {
    $baseUrl .= $scriptDir;
}

// Replace src and href references that point to relative attachments path
$attachmentsRel = getAttachmentsRelativePath(); // returns 'data/attachments/'
// Common patterns: src="data/attachments/..." or src='data/attachments/...' or src=/data/attachments/...
$content = preg_replace_callback('#(src|href)=(["\']?)(/?' . preg_quote($attachmentsRel, '#') . ')([^"\'\s>]+)(["\']?)#i', function($m) use ($baseUrl, $attachmentsRel) {
    $attr = $m[1];
    $quote = $m[2] ?: '';
    $path = $m[4];
    // Ensure no duplicate slashes
    $url = rtrim($baseUrl, '/') . '/' . ltrim($attachmentsRel, '/');
    $url = rtrim($url, '/') . '/' . ltrim($path, '/');
    return $attr . '=' . $quote . $url . $quote;
}, $content);

// Light sanitization: remove <script>...</script> blocks and inline event handlers (on*) to reduce XSS risk
$content = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $content);
$content = preg_replace_callback('#<([a-zA-Z0-9]+)([^>]*)>#', function($m) {
    $tag = $m[1];
    $attrs = $m[2];
    // Remove any on* attributes
    $cleanAttrs = preg_replace('/\s+on[a-zA-Z]+=(["\"][^"\\]*["\\"]|[^\s>]*)/i', '', $attrs);
    return '<' . $tag . $cleanAttrs . '>';
}, $content);

?>
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shared note - <?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></title>
    <link rel="stylesheet" href="css/public_note.css">
    <link rel="stylesheet" href="css/tasks.css">
</head>
<body>
    <div class="public-note">
    <h1><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></h1>
        <div class="content"><?php echo $content; ?></div>
    </div>
</body>
<script src="js/copy-code-on-focus.js"></script>
</html>