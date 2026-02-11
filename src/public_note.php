<?php
/**
 * Public Note Display
 * Displays a shared note with optional password protection and theme support
 */

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'markdown_parser.php';

// Build CSP frame-src directive from allowed domains
$frameSrcDomains = "'self'";
foreach (ALLOWED_IFRAME_DOMAINS as $domain) {
    $frameSrcDomains .= " https://{$domain}";
}

// Set security headers for public notes
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src {$frameSrcDomains};");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================
// Support token via query param (?token=xxx) or pretty URL (/token or /workspace/token)

function extractTokenFromPath($path) {
    if (empty($path)) {
        return '';
    }
    
    $path = trim($path, '/');
    if ($path === '' || $path === 'index.php') {
        return '';
    }
    
    // Check for workspace/token pattern
    if (preg_match('#^workspace/([^/]+)$#', $path, $matches)) {
        return $matches[1];
    }
    
    // Get last segment if it's not a file (no dot)
    $parts = explode('/', $path);
    $last = end($parts);
    if ($last && strpos($last, '.') === false) {
        return $last;
    }
    
    return '';
}

$token = $_GET['token'] ?? '';
$folderToken = $_GET['folder_token'] ?? '';
$noteIdParam = $_GET['id'] ?? '';

if (empty($token) && (empty($folderToken) || empty($noteIdParam))) {
    // Try PATH_INFO first
    if (!empty($_SERVER['PATH_INFO'])) {
        $token = extractTokenFromPath($_SERVER['PATH_INFO']);
    }
    
    // Fallback to REQUEST_URI
    if (empty($token) && !empty($_SERVER['REQUEST_URI'])) {
        $uri = preg_replace('/\?.*$/', '', $_SERVER['REQUEST_URI']);
        $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
        
        if ($scriptDir && strpos($uri, $scriptDir) === 0) {
            $uri = substr($uri, strlen($scriptDir));
        }
        
        $token = extractTokenFromPath($uri);
    }
    
    if (empty($token) && (empty($folderToken) || empty($noteIdParam))) {
        http_response_code(400);
        echo 'Token or folder authorization missing';
        exit;
    }
}

// ============================================================================
// DATABASE: FETCH SHARED NOTE DATA
// ============================================================================

try {
    $sharedNote = null;
    $isFolderShared = false;

    if (!empty($token)) {
        $stmt = $con->prepare('SELECT note_id, created, theme, indexable, password FROM shared_notes WHERE token = ?');
        $stmt->execute([$token]);
        $sharedNote = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // Fallback: Check if authorized via shared folder
    if (!$sharedNote && !empty($folderToken) && !empty($noteIdParam)) {
        $stmt = $con->prepare('SELECT folder_id, theme, indexable, password FROM shared_folders WHERE token = ?');
        $stmt->execute([$folderToken]);
        $sharedFolder = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($sharedFolder) {
            $rootFolderId = $sharedFolder['folder_id'];
            
            // Verify note exists and belongs to this folder or its descendants
            // We need to fetch the workspace to be safe or just trust the folder tree
            $stmt = $con->prepare('SELECT id, folder_id FROM entries WHERE id = ? AND trash = 0');
            $stmt->execute([$noteIdParam]);
            $noteEntry = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($noteEntry) {
                $noteFolderId = (int)$noteEntry['folder_id'];
                
                // Check if it's the root or a descendant
                if ($noteFolderId === (int)$rootFolderId) {
                    $isFolderShared = true;
                } else {
                    // Fetch all folders in the workspace of the root folder
                    $stmt = $con->prepare('SELECT workspace FROM folders WHERE id = ?');
                    $stmt->execute([$rootFolderId]);
                    $workspaceResult = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    if ($workspaceResult) {
                        $ws = $workspaceResult['workspace'];
                        $stmt = $con->prepare('SELECT id, parent_id FROM folders WHERE workspace = ?');
                        $stmt->execute([$ws]);
                        $allFoldersPool = [];
                        while ($f = $stmt->fetch(PDO::FETCH_ASSOC)) {
                            $allFoldersPool[$f['id']] = $f;
                        }
                        
                        // Recursive check
                        function isDescendantOf($targetId, $folderToSearch, $pool) {
                            $current = $pool[$folderToSearch] ?? null;
                            while ($current && $current['parent_id'] !== null) {
                                if ((int)$current['parent_id'] === (int)$targetId) return true;
                                $current = $pool[$current['parent_id']] ?? null;
                            }
                            return false;
                        }
                        
                        if (isDescendantOf($rootFolderId, $noteFolderId, $allFoldersPool)) {
                            $isFolderShared = true;
                        }
                    }
                }

                if ($isFolderShared) {
                    $sharedNote = [
                        'note_id' => $noteEntry['id'],
                        'created' => date('Y-m-d H:i:s'), // Mock
                        'theme' => $sharedFolder['theme'], // Inherit folder theme
                        'indexable' => $sharedFolder['indexable'],
                        'password' => $sharedFolder['password'] // Inherit folder password
                    ];
                    // Override token for session consistency if needed
                    $token = $folderToken . '_note_' . $noteIdParam; 
                }
            }
        }
    }
    
    if (!$sharedNote) {
        http_response_code(404);
        echo 'Shared note not found or access denied';
        exit;
    }

    $note_id = $sharedNote['note_id'];
    $indexable = isset($sharedNote['indexable']) ? (int)$sharedNote['indexable'] : 0;
    $storedPassword = $sharedNote['password'];
    $sharedTheme = $sharedNote['theme'] ?? '';

    // ============================================================================
    // PASSWORD PROTECTION
    // ============================================================================
    
    if (!empty($storedPassword)) {
        session_start();
        $sessionKey = 'public_note_auth_' . $token;
        
        // If accessed via a shared folder, also check the folder's session key
        $folderSessionKey = !empty($folderToken) ? ('public_folder_auth_' . $folderToken) : '';
        
        $passwordError = false;
        
        // Handle password submission
        if (isset($_POST['note_password'])) {
            if (password_verify($_POST['note_password'], $storedPassword)) {
                $_SESSION[$sessionKey] = true;
                if ($folderSessionKey) $_SESSION[$folderSessionKey] = true;
            } else {
                $passwordError = true;
            }
        }
        
        // Display password form if not authenticated (check both keys)
        $isAuthenticated = !empty($_SESSION[$sessionKey]) || ($folderSessionKey && !empty($_SESSION[$folderSessionKey]));
        if (!$isAuthenticated) {
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
                        padding: 40px;
                        border-radius: 8px;
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
                    <?php if ($passwordError): ?>
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

    // ============================================================================
    // DATABASE: FETCH NOTE CONTENT
    // ============================================================================
    
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

// ============================================================================
// CONTENT LOADING
// ============================================================================
// Load content from file if available, otherwise from database

$htmlFile = getEntryFilename($note_id, $note['type'] ?? 'note');
$content = '';

if (is_readable($htmlFile)) {
    $content = file_get_contents($htmlFile);
} else {
    $content = $note['entry'] ?? '';
}

// ============================================================================
// CONTENT RENDERING BY TYPE
// ============================================================================

$noteType = $note['type'] ?? 'note';

// Markdown with tasklist: add task input
if ($noteType === 'markdown' && strpos($content, 'class="task-list"') !== false) {
    $addTaskHtml = '<div class="public-markdown-task-add-container" style="margin-top: 20px; padding: 10px; border-top: 1px solid #eee;">';
    $addTaskHtml .= '<input type="text" class="task-input public-markdown-task-add-input" placeholder="'.t('tasklist.input_placeholder', [], 'Add a task...').'" />';
    $addTaskHtml .= '</div>';
    $content .= $addTaskHtml;
}

// Tasklist: parse JSON and render tasks
if ($noteType === 'tasklist') {
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
        $content = '<pre>' . htmlspecialchars($content, ENT_QUOTES) . '</pre>';
    }
}

// Markdown: convert to HTML
if ($noteType === 'markdown') {
    $content = parseMarkdown($content);
}

// ============================================================================
// URL REWRITING FOR ATTACHMENTS
// ============================================================================

$baseUrl = '//' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');

if ($scriptDir && $scriptDir !== '/') {
    $baseUrl .= $scriptDir;
}

// Convert relative attachment paths to absolute URLs
// Handles: data/attachments/ and data/users/ID/attachments/
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

// Convert API attachment URLs to absolute URLs
$content = preg_replace_callback('#(src|href)=(["\']?)(/?api/v1/notes/\d+/attachments/[^"\'\s>]+)(["\']?)#i', function($m) use ($baseUrl) {
    $attr = $m[1];
    $quote = $m[2] ?: '';
    $apiPath = $m[3];
    
    // Ensure no duplicate slashes
    $url = rtrim($baseUrl, '/') . '/' . ltrim($apiPath, '/');
    return $attr . '=' . $quote . $url . $quote;
}, $content);

// ============================================================================
// XSS SANITIZATION
// ============================================================================
// Protect media elements, sanitize scripts, then restore protected elements

$protectedElements = [];
$protectedIndex = 0;

// Protect video tags
$content = preg_replace_callback('/<video\s+([^>]*)>\s*<\/video>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
    $placeholder = "\x00PVIDEO" . $protectedIndex . "\x00";
    $protectedElements[$protectedIndex] = $matches[0];
    $protectedIndex++;
    return $placeholder;
}, $content);

// Protect audio tags
$content = preg_replace_callback('/<audio\s+([^>]*)>\s*<\/audio>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
    $placeholder = "\x00PAUDIO" . $protectedIndex . "\x00";
    $protectedElements[$protectedIndex] = $matches[0];
    $protectedIndex++;
    return $placeholder;
}, $content);

// Protect iframe tags
$content = preg_replace_callback('/<iframe\s+([^>]+)>\s*<\/iframe>/is', function($matches) use (&$protectedElements, &$protectedIndex) {
    $placeholder = "\x00PIFRAME" . $protectedIndex . "\x00";
    $protectedElements[$protectedIndex] = $matches[0];
    $protectedIndex++;
    return $placeholder;
}, $content);

// Remove script tags and inline event handlers
$content = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $content);
$content = preg_replace_callback('#<([a-zA-Z0-9]+)([^>]*)>#', function($m) {
    $tag = $m[1];
    $attrs = $m[2];
    // Remove any on* attributes
    $cleanAttrs = preg_replace('/\s+on[a-zA-Z]+=(["\"][^"\\]*["\\"]|[^\s>]*)/i', '', $attrs);
    return '<' . $tag . $cleanAttrs . '>';
}, $content);

// Restore protected elements
$content = preg_replace_callback('/\x00P(VIDEO|AUDIO|IFRAME)(\d+)\x00/', function($matches) use ($protectedElements) {
    $index = (int)$matches[2];
    return isset($protectedElements[$index]) ? $protectedElements[$index] : $matches[0];
}, $content);

// ============================================================================
// THEME DETERMINATION
// ============================================================================
// Priority: 1) Stored theme 2) URL parameter 3) Default (light)

$theme = 'light';

if (!empty($sharedTheme) && in_array($sharedTheme, ['dark', 'light'])) {
    $theme = $sharedTheme;
} elseif (isset($_GET['theme']) && in_array($_GET['theme'], ['dark', 'light'])) {
    $theme = $_GET['theme'];
}

// ============================================================================
// HTML OUTPUT
// ============================================================================
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
    <script>window.ALLOWED_IFRAME_DOMAINS = <?php echo json_encode(ALLOWED_IFRAME_DOMAINS); ?>;</script>
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
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/variables.css') ? filemtime(__DIR__ . '/css/dark-mode/variables.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/layout.css') ? filemtime(__DIR__ . '/css/dark-mode/layout.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/menus.css') ? filemtime(__DIR__ . '/css/dark-mode/menus.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/editor.css') ? filemtime(__DIR__ . '/css/dark-mode/editor.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/modals.css') ? filemtime(__DIR__ . '/css/dark-mode/modals.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/components.css') ? filemtime(__DIR__ . '/css/dark-mode/components.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/pages.css') ? filemtime(__DIR__ . '/css/dark-mode/pages.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/markdown.css') ? filemtime(__DIR__ . '/css/dark-mode/markdown.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/kanban.css') ? filemtime(__DIR__ . '/css/dark-mode/kanban.css') : '1'; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo file_exists(__DIR__ . '/css/dark-mode/icons.css') ? filemtime(__DIR__ . '/css/dark-mode/icons.css') : '1'; ?>">
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