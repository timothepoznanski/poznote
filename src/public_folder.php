<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'markdown_parser.php';

// Support token via query param or pretty URL
$token = $_GET['token'] ?? '';
if (empty($token)) {
    $pathToken = '';
    if (!empty($_SERVER['PATH_INFO'])) {
        $p = trim($_SERVER['PATH_INFO'], '/');
        if ($p !== '') {
            $parts = explode('/', $p);
            $pathToken = end($parts);
        }
    }

    if (empty($pathToken) && !empty($_SERVER['REQUEST_URI'])) {
        $uri = $_SERVER['REQUEST_URI'];
        $uri = preg_replace('/\?.*$/', '', $uri);
        $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
        if ($scriptDir && strpos($uri, $scriptDir) === 0) {
            $uri = substr($uri, strlen($scriptDir));
        }
        $uri = trim($uri, '/');
        if ($uri !== '' && $uri !== 'index.php') {
            $parts = explode('/', $uri);
            $last = end($parts);
            if ($last && strpos($last, '.') === false) {
                $pathToken = $last;
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
    $stmt = $con->prepare('SELECT folder_id, created, theme, indexable, password FROM shared_folders WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo 'Shared folder not found';
        exit;
    }

    $folder_id = $row['folder_id'];
    $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
    $storedPassword = $row['password'];

    // Check if password protection is enabled
    if (!empty($storedPassword)) {
        session_start();
        $sessionKey = 'public_folder_auth_' . $token;
        
        if (isset($_POST['folder_password'])) {
            $submittedPassword = $_POST['folder_password'];
            if (password_verify($submittedPassword, $storedPassword)) {
                $_SESSION[$sessionKey] = true;
            } else {
                $passwordError = true;
            }
        }
        
        if (!isset($_SESSION[$sessionKey]) || $_SESSION[$sessionKey] !== true) {
            ?>
            <!doctype html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="robots" content="noindex, nofollow">
                <title>Password Protected</title>
                <link rel="stylesheet" href="/css/public_folder.css">
            </head>
            <body class="password-page-body">
                <div class="password-container">
                    <div class="lock-icon">🔒</div>
                    <h2>Password Protected Folder</h2>
                    <?php if (isset($passwordError)): ?>
                        <div class="error">Incorrect password. Please try again.</div>
                    <?php endif; ?>
                    <form method="POST">
                        <input type="password" name="folder_password" placeholder="Enter password" required autofocus>
                        <button type="submit">Unlock</button>
                    </form>
                </div>
            </body>
            </html>
            <?php
            exit;
        }
    }

    // Get folder information
    $stmt = $con->prepare('SELECT name, workspace FROM folders WHERE id = ?');
    $stmt->execute([$folder_id]);
    $folder = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$folder) {
        http_response_code(404);
        echo 'Folder not found';
        exit;
    }

    // Get all notes in this folder with their share tokens
    $stmt = $con->prepare('
        SELECT e.id, e.heading, e.created, e.type, sn.token 
        FROM entries e 
        LEFT JOIN shared_notes sn ON e.id = sn.note_id
        WHERE (e.folder_id = ? OR e.folder = ?) AND e.trash = 0 
        ORDER BY e.created DESC
    ');
    $stmt->execute([$folder_id, $folder['name']]);
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $sharedNotes = [];
    foreach ($notes as $note) {
        if (!empty($note['token'])) {
            $sharedNotes[] = $note;
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    echo 'Server error';
    exit;
}

// Determine theme
$theme = 'light';
if (!empty($row['theme']) && in_array($row['theme'], ['dark', 'light'])) {
    $theme = $row['theme'];
} elseif (isset($_GET['theme']) && in_array($_GET['theme'], ['dark', 'light'])) {
    $theme = $_GET['theme'];
}

// Build base URL for note links
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$noteBaseUrl = $protocol . '://' . $host;
?>
<!doctype html>
<html data-theme="<?php echo htmlspecialchars($theme); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php if ($indexable == 0): ?>
    <meta name="robots" content="noindex, nofollow">
    <?php endif; ?>
    <title><?php echo htmlspecialchars($folder['name']); ?> - Shared Folder</title>
    <link rel="stylesheet" href="/css/fontawesome.min.css">
    <link rel="stylesheet" href="/css/solid.min.css">
    <link rel="stylesheet" href="/css/light.min.css">
    <link rel="stylesheet" href="/css/dark-mode.css">
    <link rel="stylesheet" href="/css/public_folder.css">
</head>
<body class="public-folder-body" data-txt-no-results="No results.">
    <button class="theme-toggle" onclick="toggleTheme()">
        <i class="fas fa-moon" id="themeIcon"></i>
    </button>

    <h1><i class="fas fa-folder-open"></i> <?php echo htmlspecialchars($folder['name']); ?></h1>

    <?php if (!empty($sharedNotes)): ?>
        <div class="public-folder-filter">
            <div class="filter-input-wrapper">
                <input type="text" id="folderFilterInput" class="filter-input" placeholder="<?php echo t_h('public_folder.filter_placeholder', [], 'Search notes'); ?>" autocomplete="off" />
                <button id="clearFilterBtn" class="clear-filter-btn" type="button" aria-label="Clear search" style="display: none;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="folderFilterStats" class="filter-stats" style="display: none;"></div>
        </div>
    <?php endif; ?>

    <?php if (empty($sharedNotes)): ?>
        <div id="folderEmptyMessage" class="empty-folder">
            <i class="fas fa-folder-open"></i>
            <p>This folder is empty</p>
        </div>
    <?php else: ?>
        <ul id="folderNotesList" class="notes-list">
            <?php foreach ($sharedNotes as $note): ?>
                <?php
                    $noteTitle = $note['heading'] ?: 'Untitled';
                    $noteTitleLower = $noteTitle;
                    if (function_exists('mb_strtolower')) {
                        $noteTitleLower = mb_strtolower($noteTitleLower, 'UTF-8');
                    } else {
                        $noteTitleLower = strtolower($noteTitleLower);
                    }
                ?>
                <li class="public-note-item" data-title="<?php echo htmlspecialchars($noteTitleLower, ENT_QUOTES, 'UTF-8'); ?>">
                    <a class="public-note-link" href="<?php echo htmlspecialchars($noteBaseUrl . '/' . $note['token']); ?>" target="_blank" rel="noopener">
                        <i class="fas fa-file-alt"></i>
                        <span class="public-note-title"><?php echo htmlspecialchars($noteTitle); ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
        </ul>
        <div id="folderNoResults" class="empty-folder is-hidden">
            <i class="fas fa-search"></i>
            <p><?php echo t_h('public_folder.no_filter_results', [], 'No results.'); ?></p>
        </div>
    <?php endif; ?>

    <script src="/js/public_folder.js"></script>
</body>
</html>
