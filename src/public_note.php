<?php
/**
 * Public Note Display
 * Displays a shared note with optional password protection and theme support
 */

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'markdown_parser.php';

$currentLang = getUserLanguage();

// Build CSP frame-src directive from allowed domains
$frameSrcDomains = "'self'";
foreach (ALLOWED_IFRAME_DOMAINS as $domain) {
    $frameSrcDomains .= " https://{$domain}";
}

// Set security headers for public notes
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src {$frameSrcDomains}; frame-ancestors 'self'; form-action 'self';");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");

// ============================================================================
// HELPER FUNCTIONS FOR AUTH PAGES
// ============================================================================

function renderLoginRequiredPage($currentLang) {
    http_response_code(403);
    ?>
    <!doctype html>
    <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <title><?php echo t_h('public.login_required_title', [], 'Login Required', $currentLang); ?></title>
        <link rel="stylesheet" href="css/public_folder.css">
    </head>
    <body class="password-page-body">
        <div class="password-container">
            <div class="lock-icon">🔒</div>
            <h2><?php echo t_h('public.login_required_title', [], 'Login Required', $currentLang); ?></h2>
            <p><?php echo t_h('public.login_required_message', [], 'This content is restricted to specific users. Please log in to access it.', $currentLang); ?></p>
            <a href="login.php" class="btn" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#4a90d9;color:#fff;border-radius:6px;text-decoration:none;"><?php echo t_h('login.login', [], 'Log in', $currentLang); ?></a>
        </div>
    </body>
    </html>
    <?php
    exit;
}

function renderAccessDeniedPage($currentLang) {
    http_response_code(403);
    ?>
    <!doctype html>
    <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <title><?php echo t_h('public.access_denied_title', [], 'Access Denied', $currentLang); ?></title>
        <link rel="stylesheet" href="css/public_folder.css">
    </head>
    <body class="password-page-body">
        <div class="password-container">
            <div class="lock-icon">⛔</div>
            <h2><?php echo t_h('public.access_denied_title', [], 'Access Denied', $currentLang); ?></h2>
            <p><?php echo t_h('public.access_denied_message', [], 'You do not have permission to view this content.', $currentLang); ?></p>
        </div>
    </body>
    </html>
    <?php
    exit;
}

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
        echo t_h('public.errors.token_or_folder_auth_missing', [], 'Token or folder authorization missing', $currentLang);
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
        $stmt = $con->prepare('SELECT note_id, created, theme, indexable, password, access_mode, allowed_users FROM shared_notes WHERE token = ? AND access_mode IS NOT NULL');
        $stmt->execute([$token]);
        $sharedNote = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // Fallback: Check if authorized via shared folder
    if (!$sharedNote && !empty($folderToken) && !empty($noteIdParam)) {
        $stmt = $con->prepare('SELECT folder_id, theme, indexable, password, allowed_users FROM shared_folders WHERE token = ?');
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
                        'password' => $sharedFolder['password'], // Inherit folder password
                        'access_mode' => 'read_only',
                        'allowed_users' => $sharedFolder['allowed_users'] ?? null
                    ];
                    // Override token for session consistency if needed
                    $token = $folderToken . '_note_' . $noteIdParam; 
                }
            }
        }
    }
    
    if (!$sharedNote) {
        http_response_code(404);
        echo t_h('public.errors.shared_note_not_found_or_denied', [], 'Shared note not found or access denied', $currentLang);
        exit;
    }

    $note_id = $sharedNote['note_id'];
    $indexable = isset($sharedNote['indexable']) ? (int)$sharedNote['indexable'] : 0;
    $storedPassword = $sharedNote['password'];
    $sharedTheme = $sharedNote['theme'] ?? '';
    $taskAccessMode = $sharedNote['access_mode'] ?? 'full';
    if (!in_array($taskAccessMode, ['read_only', 'check_only', 'full'], true)) {
        $taskAccessMode = 'full';
    }

    // ============================================================================
    // USER RESTRICTION CHECK
    // ============================================================================
    $passedUserRestriction = false; // True when user authenticated via allowed_users
    $allowedUsersRaw = $sharedNote['allowed_users'] ?? null;
    if (!empty($allowedUsersRaw)) {
        $allowedUserIds = is_array($allowedUsersRaw) ? $allowedUsersRaw : json_decode($allowedUsersRaw, true);
        if (is_array($allowedUserIds) && !empty($allowedUserIds)) {
            if (session_status() === PHP_SESSION_NONE) {
                $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
                session_name('POZNOTE_SESSION_' . $configured_port);
                session_start();
            }
            $currentUserId = $_SESSION['user_id'] ?? null;
            // The share owner always has access
            $isOwner = $currentUserId !== null && (int)$currentUserId === (int)$activeUserId;
            if (!$isOwner) {
                if ($currentUserId === null) {
                    renderLoginRequiredPage($currentLang);
                }
                if (!in_array((int)$currentUserId, array_map('intval', $allowedUserIds), true)) {
                    renderAccessDeniedPage($currentLang);
                }
            }
            // User is authorized (owner or in allowed_users list) — remember this
            $passedUserRestriction = true;
        }
    }

    $stmt = $con->prepare('SELECT folder_id FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$note_id]);
    $noteFolderData = $stmt->fetch(PDO::FETCH_ASSOC);
    $noteFolderId = $noteFolderData ? (int)$noteFolderData['folder_id'] : null;

    $protectedFolderContext = null;
    if ($noteFolderId !== null) {
        $stmt = $con->prepare(
            'WITH RECURSIVE folder_path(id, parent_id, depth) AS (
                SELECT f.id, f.parent_id, 0
                FROM folders f
                WHERE f.id = ?
                UNION ALL
                SELECT parent.id, parent.parent_id, folder_path.depth + 1
                FROM folders parent
                INNER JOIN folder_path ON folder_path.parent_id = parent.id
            )
            SELECT sf.token, sf.password, sf.allowed_users, folder_path.depth
            FROM folder_path
            INNER JOIN shared_folders sf ON sf.folder_id = folder_path.id
            WHERE (sf.password IS NOT NULL AND sf.password != "")
               OR (sf.allowed_users IS NOT NULL AND sf.allowed_users != "")
            ORDER BY folder_path.depth ASC
            LIMIT 1'
        );
        $stmt->execute([$noteFolderId]);
        $protectedFolderContext = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    $folderAllowedUsersRaw = $protectedFolderContext['allowed_users'] ?? null;
    if (!$passedUserRestriction && !empty($folderAllowedUsersRaw)) {
        $folderAllowedUserIds = is_array($folderAllowedUsersRaw) ? $folderAllowedUsersRaw : json_decode($folderAllowedUsersRaw, true);
        if (is_array($folderAllowedUserIds) && !empty($folderAllowedUserIds)) {
            if (session_status() === PHP_SESSION_NONE) {
                $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
                session_name('POZNOTE_SESSION_' . $configured_port);
                session_start();
            }
            $currentUserId = $_SESSION['user_id'] ?? null;
            $isOwner = $currentUserId !== null && (int)$currentUserId === (int)$activeUserId;
            if (!$isOwner) {
                if ($currentUserId === null) {
                    renderLoginRequiredPage($currentLang);
                }
                if (!in_array((int)$currentUserId, array_map('intval', $folderAllowedUserIds), true)) {
                    renderAccessDeniedPage($currentLang);
                }
            }
            $passedUserRestriction = true;
        }
    }

    // ============================================================================
    // PASSWORD PROTECTION
    // ============================================================================
    
    $requiredAuths = [];

    if (!empty($storedPassword)) {
        $requiredAuths[] = [
            'hash' => $storedPassword,
            'sessionKey' => 'public_note_auth_' . $token
        ];
    }

    // Only enforce folder password when user has NOT been authenticated via allowed_users.
    // When allowed_users passes (user is owner or explicitly authorized), the folder's
    // password should not create an additional barrier on a directly-shared note.
    if (!$passedUserRestriction && !empty($protectedFolderContext['password']) && !empty($protectedFolderContext['token'])) {
        $requiredAuths[] = [
            'hash' => $protectedFolderContext['password'],
            'sessionKey' => 'public_folder_auth_' . $protectedFolderContext['token']
        ];
    }

    if (!empty($requiredAuths)) {
        if (session_status() === PHP_SESSION_NONE) {
            $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
            session_name('POZNOTE_SESSION_' . $configured_port);
        }
        session_start();

        // If accessed via a shared folder, also accept that folder's auth session.
        if (!empty($folderToken)) {
            $requiredAuths[] = [
                'hash' => null,
                'sessionKey' => 'public_folder_auth_' . $folderToken
            ];
        }

        // Deduplicate by session key
        $uniqueAuths = [];
        foreach ($requiredAuths as $authDef) {
            $uniqueAuths[$authDef['sessionKey']] = $authDef;
        }
        $requiredAuths = array_values($uniqueAuths);
        
        $passwordError = false;
        
        // Handle password submission
        if (isset($_POST['note_password'])) {
            $submittedPassword = $_POST['note_password'];
            $matchedAny = false;

            foreach ($requiredAuths as $authDef) {
                if (empty($authDef['hash'])) {
                    continue;
                }
                if (password_verify($submittedPassword, $authDef['hash'])) {
                    $_SESSION[$authDef['sessionKey']] = true;
                    $matchedAny = true;
                }
            }

            if (!$matchedAny) {
                $passwordError = true;
            }
        }
        
        // Display password form if at least one required auth is missing.
        $allAuthenticated = true;
        $hasAnyAuthenticated = false;
        foreach ($requiredAuths as $authDef) {
            if (!empty($_SESSION[$authDef['sessionKey']])) {
                $hasAnyAuthenticated = true;
                continue;
            }
            if (empty($_SESSION[$authDef['sessionKey']])) {
                $allAuthenticated = false;
            }
        }

        $additionalPasswordRequired = false;
        if (!$allAuthenticated && $hasAnyAuthenticated) {
            $additionalPasswordRequired = true;
        }

        if (!$allAuthenticated) {
            ?>
            <!doctype html>
            <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="robots" content="noindex, nofollow">
                <title><?php echo t_h('public.protection.title', [], 'Password Protected', $currentLang); ?></title>
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
                        text-align: center;
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
                        text-align: left;
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
                    .info {
                        color: #0c5460;
                        background: #d1ecf1;
                        border: 1px solid #bee5eb;
                        border-radius: 6px;
                        padding: 10px;
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
                    <h2><?php echo t_h('public.protection.note_heading', [], 'Password Protected', $currentLang); ?></h2>
                    <?php if ($passwordError): ?>
                        <div class="error"><?php echo t_h('public.protection.error_incorrect', [], 'Incorrect password. Please try again.', $currentLang); ?></div>
                    <?php endif; ?>
                    <?php if ($additionalPasswordRequired): ?>
                        <div class="info"><?php echo t_h('public.protection.additional_password_required', [], 'This note requires an additional password. Please enter the next password to continue.', $currentLang); ?></div>
                    <?php endif; ?>
                    <form method="POST">
                        <input type="password" name="note_password" placeholder="<?php echo t_h('public.protection.placeholder', [], 'Enter password', $currentLang); ?>" required autofocus>
                        <button type="submit"><?php echo t_h('public.protection.unlock', [], 'Unlock', $currentLang); ?></button>
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
        echo t_h('public.errors.note_not_found', [], 'Note not found', $currentLang);
        exit;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo t_h('public.errors.server_error', [], 'Server error', $currentLang);
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
        if ($taskAccessMode === 'full') {
            $tasksHtml .= '<div class="task-input-container">';
            $tasksHtml .= '<input type="text" class="task-input public-task-add-input" placeholder="'.t('tasklist.input_placeholder', [], 'Add a task...').'" />';
            $tasksHtml .= '</div>';
        }

        $tasksHtml .= '<div class="tasks-list">';
        foreach ($decoded as $i => $task) {
            $text = isset($task['text']) ? htmlspecialchars($task['text'], ENT_QUOTES) : '';
            $completed = !empty($task['completed']) ? ' completed' : '';
            $checked = !empty($task['completed']) ? ' checked' : '';
            $disabled = $taskAccessMode === 'read_only' ? ' disabled' : '';
            $important = !empty($task['important']) ? ' important' : '';
            $tasksHtml .= '<div class="task-item'.$completed.$important.'" data-index="'.$i.'">';
            $tasksHtml .= '<input type="checkbox" class="task-checkbox" data-index="'.$i.'"'.$checked.$disabled.' /> ';
            $tasksHtml .= '<span class="task-text" data-text="'.$text.'">'.$text.'</span>';
            if ($taskAccessMode === 'full') {
                $tasksHtml .= '<div class="task-actions">';
                $tasksHtml .= '<button class="task-action-btn public-task-delete-btn" title="Delete"><i class="lucide lucide-trash-2"></i></button>';
                $tasksHtml .= '</div>';
            }
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
    <title><?php echo htmlspecialchars($note['heading'] ?: t('untitled', [], 'Untitled', $currentLang)); ?></title>
    <script>window.ALLOWED_IFRAME_DOMAINS = <?php echo json_encode(ALLOWED_IFRAME_DOMAINS); ?>;</script>
    <!-- CSP-compliant theme initialization -->
    <script type="application/json" id="public-note-config"><?php 
        $apiBaseUrl = $scriptDir . '/api/v1';
        echo json_encode([
            'serverTheme' => $theme, 
            'token' => $token, 
            'noteType' => $noteType,
            'taskAccessMode' => $taskAccessMode,
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
    <script>
        (function () {
            try {
                var isDesktop = window.innerWidth > 800;
                var storedCollapsed = localStorage.getItem('outlineCollapsed');
                var shouldCollapseOutline = isDesktop && (storedCollapsed === null || storedCollapsed === 'true');

                if (shouldCollapseOutline) {
                    document.documentElement.classList.add('outline-collapsed');
                }
            } catch (_error) {
                // Ignore localStorage access errors during early paint.
            }
        })();
    </script>
    <link rel="stylesheet" href="css/lucide.css">
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
    <link rel="stylesheet" href="css/outline.css?v=<?php echo filemtime(__DIR__ . '/css/outline.css'); ?>">
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
<body class="public-note-page" data-task-access-mode="<?php echo htmlspecialchars($taskAccessMode, ENT_QUOTES); ?>">
    <div class="public-note-layout">
        <div class="public-note-main" id="publicNoteMain">
            <div class="public-note">
                <div class="public-note-header">
                    <h1><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></h1>
                    <button id="themeToggle" class="theme-toggle-btn" title="Toggle theme">
                        <i class="lucide lucide-moon"></i>
                    </button>
                </div>
                <div class="content"><?php echo $content; ?></div>
            </div>
        </div>

        <div class="outline-mobile-backdrop" id="outlineMobileBackdrop"></div>

        <div class="outline-resize-handle" id="outlineResizeHandle">
            <button
                id="toggleOutlineBtn"
                class="toggle-outline-btn"
                aria-label="Toggle outline panel"
                title="Toggle outline panel">
                <i class="lucide lucide-chevron-right"></i>
            </button>
        </div>

        <div id="outline-panel">
            <div class="outline-header">
                <h2 class="outline-title">Outline</h2>
                <button type="button" class="outline-close-btn" aria-label="<?php echo t_h('common.close'); ?>" title="<?php echo t_h('common.close'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
            <ul class="outline-nav" id="outline-nav">
                <div class="outline-empty">
                    <div class="outline-empty-icon">📄</div>
                    <p class="outline-empty-text">No headings in this note</p>
                </div>
            </ul>
        </div>
    </div>
</body>
<script src="js/copy-code-on-focus.js"></script>
<script src="js/modal-alerts.js"></script>
<script src="js/math-renderer.js?v=<?php echo filemtime(__DIR__ . '/js/math-renderer.js'); ?>"></script>
<script src="js/outline-panel.js?v=<?php echo filemtime(__DIR__ . '/js/outline-panel.js'); ?>"></script>
<script src="js/public-note.js?v=<?php echo filemtime(__DIR__ . '/js/public-note.js'); ?>"></script>
</html>