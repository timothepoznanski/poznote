<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'markdown_parser.php';

// Support token via query param or pretty URL (/token or /workspace/token)
$token = $_GET['token'] ?? '';
if (empty($token)) {
    // Try PATH_INFO (if PHP is configured to populate it)
    $pathToken = '';
    if (!empty($_SERVER['PATH_INFO'])) {
        $p = trim($_SERVER['PATH_INFO'], '/');
        if ($p !== '') {
            // If workspace prefix present, strip it
            if (preg_match('#^workspace/([^/]+)$#', $p, $m)) {
                $pathToken = $m[1];
            } else {
                $parts = explode('/', $p);
                $pathToken = end($parts);
            }
        }
    }

    // If PATH_INFO didn't work, examine REQUEST_URI while stripping script dir
    if (empty($pathToken) && !empty($_SERVER['REQUEST_URI'])) {
        $uri = $_SERVER['REQUEST_URI'];
        $uri = preg_replace('/\?.*$/', '', $uri);
        $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
        if ($scriptDir && strpos($uri, $scriptDir) === 0) {
            $uri = substr($uri, strlen($scriptDir));
        }
        $uri = trim($uri, '/');
        if ($uri !== '' && $uri !== 'index.php') {
            if (preg_match('#^workspace/([^/]+)$#', $uri, $m)) {
                $pathToken = $m[1];
            } else {
                $parts = explode('/', $uri);
                // If the URL points to a static file (has a dot) skip
                $last = end($parts);
                if ($last && strpos($last, '.') === false) {
                    $pathToken = $last;
                }
            }
        }
    }

    if (!empty($pathToken)) {
        $token = $pathToken;
    }

    if (empty($token)) {
        http_response_code(400);
        echo 'Token missing';
        exit;
    }
}

try {
    $stmt = $con->prepare('SELECT note_id, created, theme, indexable, password FROM shared_notes WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo 'Shared note not found';
        exit;
    }

    $note_id = $row['note_id'];
    $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
    $storedPassword = $row['password'];

    // Check if password protection is enabled
    if (!empty($storedPassword)) {
        session_start();
        $sessionKey = 'public_note_auth_' . $token;
        
        // Check if password was submitted
        if (isset($_POST['note_password'])) {
            $submittedPassword = $_POST['note_password'];
            if (password_verify($submittedPassword, $storedPassword)) {
                // Password correct, store in session
                $_SESSION[$sessionKey] = true;
            } else {
                // Password incorrect
                $passwordError = true;
            }
        }
        
        // If not authenticated, show password form
        if (!isset($_SESSION[$sessionKey]) || $_SESSION[$sessionKey] !== true) {
            // Show password entry form
            ?>
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="robots" content="noindex, nofollow">
                <title>Password Protected</title>
                <style>
                    body {
                        font-family: 'Inter', sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        background: #f5f5f5;
                    }
                    .password-container {
                        /* background: white; */
                        padding: 40px;
                        border-radius: 8px;
                        justify-items: center;
                        /* box-shadow: 0 2px 10px rgba(0,0,0,0.1); */
                        max-width: 400px;
                        width: 90%;
                    }
                    h2 {
                        margin-top: 0;
                        color: #333;
                    }
                    p {
                        color: #666;
                        margin-bottom: 20px;
                    }
                    input[type="password"] {
                        width: 100%;
                        padding: 12px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        box-sizing: border-box;
                        font-size: 14px;
                        margin-bottom: 15px;
                    }
                    button {
                        width: 100%;
                        padding: 12px;
                        background: #007bff;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 14px;
                        cursor: pointer;
                        font-weight: 500;
                    }
                    button:hover {
                        background: #0056b3;
                    }
                    .error {
                        color: #dc3545;
                        margin-bottom: 15px;
                        font-size: 14px;
                    }
                    .lock-icon {
                        font-size: 48px;
                        text-align: center;
                        margin-bottom: 20px;
                        color: #007bff;
                    }
                </style>
            </head>
            <body>
                <div class="password-container">
                    <div class="lock-icon">🔒</div>
                    <h2>Password Protected</h2>
                    <?php if (isset($passwordError)): ?>
                        <div class="error">Incorrect password. Please try again.</div>
                    <?php endif; ?>
                    <form method="POST">
                        <input type="password" name="note_password" placeholder="Enter password" required autofocus>
                        <button type="submit">Unlock</button>
                    </form>
                </div>
            </body>
            </html>
            <?php
            exit;
        }
    }

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
// If a file was saved for this note, prefer using it so we preserve the exact content (images, formatting).
$htmlFile = getEntryFilename($note_id, $note['type'] ?? 'note');
$content = '';
if (is_readable($htmlFile)) {
    $content = file_get_contents($htmlFile);
} else {
    // Fallback to DB field if no file exists
    $content = $note['entry'] ?? '';
}

// If this is markdown, we might want to add an "Add task" input at the bottom if it contains a tasklist
if (isset($note['type']) && $note['type'] === 'markdown') {
    if (strpos($content, 'class="task-list"') !== false) {
        $addTaskHtml = '<div class="public-markdown-task-add-container" style="margin-top: 20px; padding: 10px; border-top: 1px solid #eee;">';
        $addTaskHtml .= '<input type="text" class="task-input public-markdown-task-add-input" placeholder="'.t('tasklist.input_placeholder', [], 'Add a task...').'" />';
        $addTaskHtml .= '</div>';
        $content .= $addTaskHtml;
    }
}

// If this is a tasklist type, try to parse the stored JSON and render a readable task list
if (isset($note['type']) && $note['type'] === 'tasklist') {
    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        // Sort tasks: uncompleted first, then completed
        usort($decoded, function($a, $b) {
            $aComp = !empty($a['completed']) ? 1 : 0;
            $bComp = !empty($b['completed']) ? 1 : 0;
            return $aComp <=> $bComp;
        });

        $tasksHtml = '<div class="task-list-container">';
        // Add item input
        $tasksHtml .= '<div class="task-input-container">';
        $tasksHtml .= '<input type="text" class="task-input public-task-add-input" placeholder="'.t('tasklist.input_placeholder', [], 'Add a task...').'" />';
        $tasksHtml .= '</div>';

        $tasksHtml .= '<div class="tasks-list">';
        foreach ($decoded as $i => $task) {
            $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES) : '';
            $completed = !empty($task['completed']) ? ' completed' : '';
            $checked = !empty($task['completed']) ? ' checked' : '';
            $important = !empty($task['important']) ? ' important' : '';
            $tasksHtml .= '<div class="task-item'.$completed.$important.'" data-index="'.$i.'">';
            $tasksHtml .= '<input type="checkbox" class="task-checkbox" data-index="'.$i.'"'.$checked.' /> ';
            $tasksHtml .= '<span class="task-text" data-text="'.$text.'">'.$text.'</span>';
            $tasksHtml .= '<div class="task-actions">';

            $tasksHtml .= '<button class="task-action-btn public-task-delete-btn" title="Delete"><i class="fas fa-trash"></i></button>';
            $tasksHtml .= '</div>';
            $tasksHtml .= '</div>';
        }
        $tasksHtml .= '</div></div>';
        $content = $tasksHtml;
    } else {
        // If JSON parse fails, escape raw content
        $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
    }
}

// If this is a markdown type, parse the markdown content and render it as HTML
if (isset($note['type']) && $note['type'] === 'markdown') {
    // The content is raw markdown, we need to convert it to HTML
    $content = parseMarkdown($content);
}
$baseUrl = '//' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
// If the app is in a subdirectory, ensure the base includes the script dir
$scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
if ($scriptDir && $scriptDir !== '/') {
    $baseUrl .= $scriptDir;
}

// Replace src and href references that point to relative attachments path
// This handles both legacy "data/attachments/" and multi-user "data/users/ID/attachments/"
$content = preg_replace_callback('#(src|href)=(["\']?)(/?data/(?:users/\d+/)?attachments/)([^"\'\s>]+)(["\']?)#i', function($m) use ($baseUrl) {
    $attr = $m[1];
    $quote = $m[2] ?: '';
    $relPath = $m[3];
    $fileName = $m[4];
    
    // Ensure no duplicate slashes
    $url = rtrim($baseUrl, '/') . '/' . ltrim($relPath, '/');
    $url = rtrim($url, '/') . '/' . ltrim($fileName, '/');
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
<?php
// Determine theme: prefer stored theme on the shared link, else URL param, else default 'light'
$theme = 'light';
if (!empty($row['theme']) && in_array($row['theme'], ['dark', 'light'])) {
    $theme = $row['theme'];
} elseif (isset($_GET['theme']) && in_array($_GET['theme'], ['dark', 'light'])) {
    $theme = $_GET['theme'];
}
?>
<!doctype html>
<html data-theme="<?php echo htmlspecialchars($theme); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php if ($indexable == 0): ?>
    <meta name="robots" content="noindex, nofollow">
    <?php endif; ?>
    <title>Shared note - <?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></title>
    <!-- CSP-compliant theme initialization -->
    <script type="application/json" id="public-note-config"><?php 
        $apiBaseUrl = $scriptDir . '/api/v1';
        echo json_encode([
            'serverTheme' => $theme, 
            'token' => $token, 
            'apiBaseUrl' => $apiBaseUrl,
            'i18n' => [
                'addTask' => t('tasklist.input_placeholder', [], 'Add a task...'),
                'editTask' => t('image_menu.edit', [], 'Edit') . ' :',
                'deleteTask' => t('common.delete', [], 'Delete') . ' ?',
                'confirm' => t('common.confirm', [], 'Confirm'),
                'cancel' => t('common.cancel', [], 'Cancel'),
                'ok' => t('common.ok', [], 'OK')
            ]
        ]); 
    ?></script>
    <script>
        // Simple window.t for modal-alerts.js compatibility (used by window.confirm)
        (function() {
            try {
                const configElement = document.getElementById('public-note-config');
                if (configElement) {
                    const config = JSON.parse(configElement.textContent);
                    window.t = function(key, vars, fallback) {
                        if (key === 'common.confirm') return config.i18n.confirm;
                        if (key === 'common.cancel') return config.i18n.cancel;
                        return fallback || key;
                    };
                }
            } catch (e) {
                console.error('Error initializing i18n for public note', e);
            }
        })();
    </script>
    <script src="js/public-note-theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/solid.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode.css') ? filemtime(__DIR__ . '/css/dark-mode.css') : '1'; ?>">
    <link rel="stylesheet" href="css/public_note.css?v=<?php echo filemtime(__DIR__ . '/css/public_note.css'); ?>">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/tasks.css">
    <link rel="stylesheet" href="css/markdown.css?v=<?php echo filemtime(__DIR__ . '/css/markdown.css'); ?>">
    <link rel="stylesheet" href="css/syntax-highlight.css?v=<?php echo file_exists(__DIR__ . '/css/syntax-highlight.css') ? filemtime(__DIR__ . '/css/syntax-highlight.css') : '1'; ?>">
    <link rel="stylesheet" href="js/katex/katex.min.css?v=<?php echo filemtime(__DIR__ . '/js/katex/katex.min.css'); ?>">
    <script src="js/mermaid/mermaid.min.js?v=<?php echo filemtime(__DIR__ . '/js/mermaid/mermaid.min.js'); ?>"></script>
    <script src="js/katex/katex.min.js?v=<?php echo filemtime(__DIR__ . '/js/katex/katex.min.js'); ?>"></script>
    <script src="js/katex/auto-render.min.js?v=<?php echo filemtime(__DIR__ . '/js/katex/auto-render.min.js'); ?>"></script>
    <script src="js/highlight/highlight.min.js?v=<?php echo file_exists(__DIR__ . '/js/highlight/highlight.min.js') ? filemtime(__DIR__ . '/js/highlight/highlight.min.js') : '1'; ?>"></script>
    <script src="js/highlight/powershell.min.js?v=<?php echo file_exists(__DIR__ . '/js/highlight/powershell.min.js') ? filemtime(__DIR__ . '/js/highlight/powershell.min.js') : '1'; ?>"></script>
    <script src="js/syntax-highlight.js?v=<?php echo file_exists(__DIR__ . '/js/syntax-highlight.js') ? filemtime(__DIR__ . '/js/syntax-highlight.js') : '1'; ?>"></script>
</head>
<body>
    <div class="public-note">
        <div class="public-note-header">
            <h1><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></h1>
            <button id="themeToggle" class="theme-toggle-btn" title="Toggle theme">
                <i class="fas fa-moon"></i>
            </button>
        </div>
        <div class="content"><?php echo $content; ?></div>
    </div>
</body>
<script src="js/copy-code-on-focus.js"></script>
<script src="js/modal-alerts.js"></script>
<script src="js/math-renderer.js?v=<?php echo filemtime(__DIR__ . '/js/math-renderer.js'); ?>"></script>
<script src="js/public-note.js?v=<?php echo filemtime(__DIR__ . '/js/public-note.js'); ?>"></script>
</html>