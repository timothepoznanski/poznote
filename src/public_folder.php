<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'markdown_parser.php';
require_once 'public_helpers.php';

$currentLang = getUserLanguage();

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
        echo t_h('public.errors.token_missing', [], 'Token missing', $currentLang);
        exit;
    }
}

try {
    $stmt = $con->prepare('SELECT folder_id, created, theme, indexable, password, allowed_users FROM shared_folders WHERE token = ?');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $statusMsg = t_h('public.errors.shared_folder_not_found', [], "Shared folder not found.\n\nThis can happen after a restore.\n\nAn administrator may need to rebuild the master database in Settings > Administration Tools to repair shared links.", $currentLang);
        [$statusTitle, $statusDetail] = array_pad(explode("\n\n", $statusMsg, 2), 2, '');
        renderPublicStatusPage($currentLang, [
            'status' => 404,
            'icon' => '🧭',
            'badge' => '404',
            'title' => rtrim(trim($statusTitle), '.'),
            'message' => $statusDetail,
            'actions' => [
                [
                    'href' => '/index.php',
                    'label' => t_h('common.back_to_home', [], 'Go to Home', $currentLang),
                ],
            ],
        ]);
    }

    $folder_id = $row['folder_id'];
    $indexable = isset($row['indexable']) ? (int)$row['indexable'] : 0;
    $storedPassword = $row['password'];

    // ============================================================================
    // USER RESTRICTION CHECK
    // ============================================================================
    $passedUserRestriction = checkPublicUserRestriction($row['allowed_users'] ?? null, $activeUserId, $currentLang);

    // Only enforce password when user has NOT been authenticated via allowed_users.
    // When allowed_users passes, the password should not create an additional barrier.
    if (!$passedUserRestriction && !empty($storedPassword)) {
        if (session_status() === PHP_SESSION_NONE) {
            $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
            session_name('POZNOTE_SESSION_' . $configured_port);
        }
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
            $stylesheetHref = getVersionedPublicAppAssetHref('css/public_folder.css');
            $themeInitHref = getVersionedPublicAppAssetHref('js/theme-init.js');
            ?>
            <!doctype html>
            <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="robots" content="noindex, nofollow">
                <title><?php echo t_h('public.protection.title', [], 'Password Protected', $currentLang); ?></title>
                <script src="<?php echo htmlspecialchars($themeInitHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
                <link rel="stylesheet" href="<?php echo htmlspecialchars($stylesheetHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
            </head>
            <body class="password-page-body">
                <div class="password-container">
                    <h2><?php echo t_h('public.protection.folder_heading', [], 'Password Protected Folder', $currentLang); ?></h2>
                    <?php if (isset($passwordError)): ?>
                        <div class="error"><?php echo t_h('public.protection.error_incorrect', [], 'Incorrect password. Please try again.', $currentLang); ?></div>
                    <?php endif; ?>
                    <form method="POST" class="password-form">
                        <input type="password" name="folder_password" placeholder="<?php echo t_h('public.protection.placeholder', [], 'Enter password', $currentLang); ?>" required autofocus>
                        <button type="submit"><?php echo t_h('public.protection.unlock', [], 'Unlock', $currentLang); ?></button>
                    </form>
                </div>
            </body>
            </html>
            <?php
            exit;
        }
    }

    // Get folder information
    $stmt = $con->prepare('SELECT id, name, workspace FROM folders WHERE id = ?');
    $stmt->execute([$folder_id]);
    $folder = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$folder) {
        $folderMsg = t_h('public.errors.folder_not_found', [], "Folder not found.\n\nThis can happen after a restore.\n\nAn administrator may need to rebuild the master database in Settings > Administration Tools to repair shared links.", $currentLang);
        [$folderTitle, $folderDetail] = array_pad(explode("\n\n", $folderMsg, 2), 2, '');
        renderPublicStatusPage($currentLang, [
            'status' => 404,
            'icon' => '🧭',
            'badge' => '404',
            'title' => rtrim(trim($folderTitle), '.'),
            'message' => $folderDetail,
            'actions' => [
                [
                    'href' => '/index.php',
                    'label' => t_h('common.back_to_home', [], 'Go to Home', $currentLang),
                ],
            ],
        ]);
    }

    // Faster approach: fetch all folders to build hierarchy in memory
    $allFoldersPool = [];
    $stmt = $con->prepare('SELECT id, name, parent_id FROM folders WHERE workspace = ?');
    $stmt->execute([$folder['workspace']]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $allFoldersPool[$row['id']] = $row;
    }

    // Function to get all descendant IDs for a given folder
    function getDescendantIds($parentId, $foldersPool) {
        $ids = [];
        foreach ($foldersPool as $fid => $f) {
            if ($f['parent_id'] !== null && (int)$f['parent_id'] === (int)$parentId) {
                $id = (int)$fid;
                $ids[] = $id;
                $ids = array_merge($ids, getDescendantIds($id, $foldersPool));
            }
        }
        return array_values(array_unique($ids));
    }

    $allSubfolderIds = getDescendantIds($folder_id, $allFoldersPool);
    $allRelevantFolderIds = array_merge([$folder_id], $allSubfolderIds);
    $placeholders = implode(',', array_fill(0, count($allRelevantFolderIds), '?'));

    // Get direct subfolders for Kanban mapping
    $directSubfolders = [];
    $directSubfolderIds = [];
    foreach ($allFoldersPool as $fid => $f) {
        if ((int)$f['parent_id'] === (int)$folder_id) {
            $directSubfolders[] = $f;
            $directSubfolderIds[] = $fid;
        }
    }

    // Map each descendant to its root-level ancestor (direct child of the shared folder)
    $descendantToDirectChild = [];
    foreach ($directSubfolderIds as $dsId) {
        $dsDescendants = getDescendantIds($dsId, $allFoldersPool);
        foreach ($dsDescendants as $ddId) {
            $descendantToDirectChild[$ddId] = $dsId;
        }
    }

    // Get all notes in this collection
    // IMPORTANT: Include notes even without individual tokens if they belong to this shared folder hierarchy?
    // Keep explicit note shares when they exist, but inherited folder access must not create implicit note shares.
    // However, we'll try to be more inclusive in the query.
    $stmt = $con->prepare("
        SELECT e.id, e.heading, e.created, e.type, e.folder_id, sn.token 
        FROM entries e 
        LEFT JOIN shared_notes sn ON e.id = sn.note_id AND sn.access_mode IS NOT NULL
        WHERE e.folder_id IN ($placeholders) AND e.trash = 0 
        ORDER BY e.created DESC
    ");
    $stmt->execute($allRelevantFolderIds);
    $allNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $sharedNotes = [];
    $notesByFolder = [];
    $kanbanData = [$folder_id => []];
    foreach ($directSubfolderIds as $sid) $kanbanData[$sid] = [];

    foreach ($allNotes as $note) {
        $sharedNotes[] = $note;
        $fid = (int)$note['folder_id'];

        // For List View
        if (!isset($notesByFolder[$fid])) $notesByFolder[$fid] = [];
        $notesByFolder[$fid][] = $note;

        // For Kanban View
        if ($fid === (int)$folder_id) {
            $kanbanData[$folder_id][] = $note;
        } elseif (isset($kanbanData[$fid])) {
            $kanbanData[$fid][] = $note;
        } elseif (isset($descendantToDirectChild[$fid])) {
            $rootDirId = $descendantToDirectChild[$fid];
            $kanbanData[$rootDirId][] = $note;
        }
    }

    // Prepare folder names for titles and sort groups
    $folderNames = [];
    foreach ($allRelevantFolderIds as $fid) {
        if ($fid == $folder_id) {
            $folderNames[$fid] = $folder['name'];
        } else {
            $folderNames[$fid] = $allFoldersPool[$fid]['name'] ?? 'Subfolder';
        }
    }

    // Sort subfolder groups by name for the list view
    uksort($notesByFolder, function($a, $b) use ($folderNames, $folder_id) {
        if ($a == $folder_id) return -1;
        if ($b == $folder_id) return 1;
        return strcasecmp($folderNames[$a] ?? '', $folderNames[$b] ?? '');
    });

} catch (Exception $e) {
    http_response_code(500);
    echo t_h('public.errors.server_error', [], 'Server error', $currentLang);
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
// Detect HTTPS including reverse proxy headers
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
         || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
         || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
         ? 'https' : 'http';
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
    <title><?php echo htmlspecialchars($folder['name']); ?></title>
    <link rel="stylesheet" href="/css/lucide.css">
    <link rel="stylesheet" href="/css/dark-mode/variables.css">
    <link rel="stylesheet" href="/css/dark-mode/layout.css">
    <link rel="stylesheet" href="/css/dark-mode/menus.css">
    <link rel="stylesheet" href="/css/dark-mode/editor.css">
    <link rel="stylesheet" href="/css/dark-mode/modals.css">
    <link rel="stylesheet" href="/css/dark-mode/components.css">
    <link rel="stylesheet" href="/css/dark-mode/pages.css">
    <link rel="stylesheet" href="/css/dark-mode/markdown.css">
    <link rel="stylesheet" href="/css/dark-mode/kanban.css">
    <link rel="stylesheet" href="/css/dark-mode/icons.css">
    <link rel="stylesheet" href="/css/public_folder.css">
</head>
<body class="public-folder-body" 
      data-txt-no-results="<?php echo t_h('public_folder.no_filter_results', [], 'No results.'); ?>"
      data-txt-view-notes="<?php echo t_h('public_folder.view_notes', [], 'View as list'); ?>"
      data-txt-view-kanban="<?php echo t_h('public_folder.view_kanban', [], 'View as Kanban'); ?>">
    <div class="header-controls">
        <button id="viewToggle" class="view-toggle" onclick="toggleView()" title="<?php echo t_h('public_folder.view_kanban', [], 'View as Kanban'); ?>">
            <i class="lucide lucide-columns-2" id="viewIcon"></i>
        </button>
        <button class="theme-toggle" onclick="toggleTheme()">
            <i class="lucide lucide-moon" id="themeIcon"></i>
        </button>
    </div>

    <h1><i class="lucide lucide-folder-open"></i> <?php echo htmlspecialchars($folder['name']); ?></h1>

    <?php if (!empty($sharedNotes)): ?>
        <div class="public-folder-filter">
            <div class="filter-input-wrapper">
                <input type="text" id="folderFilterInput" class="filter-input" placeholder="<?php echo t_h('public_folder.filter_placeholder', [], 'Filter notes'); ?>" autocomplete="off" />
                <button id="clearFilterBtn" class="clear-filter-btn" type="button" aria-label="Clear search" style="display: none;">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
            <div id="folderFilterStats" class="filter-stats" style="display: none;"></div>
        </div>
    <?php endif; ?>

    <?php if (empty($sharedNotes)): ?>
        <div id="folderEmptyMessage" class="empty-folder">
            <i class="lucide lucide-folder-open"></i>
            <p>This folder is empty</p>
        </div>
    <?php else: ?>
        <div id="listView">
            <?php 
            // Separate direct notes and subfolder notes
            $directNotes = $notesByFolder[$folder_id] ?? [];
            unset($notesByFolder[$folder_id]);
            ?>

            <?php if (!empty($directNotes)): ?>
                <ul class="notes-list">
                    <?php foreach ($directNotes as $note): ?>
                        <?php renderPublicNoteItem($note, $noteBaseUrl, $token); ?>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>

            <?php foreach ($notesByFolder as $fid => $fNotes): ?>
                <?php if (!empty($fNotes)): ?>
                    <div class="public-folder-group">
                        <h2 class="public-folder-group-title"><i class="lucide lucide-folder"></i> <?php echo htmlspecialchars($folderNames[$fid] ?? 'Subfolder'); ?></h2>
                        <ul class="notes-list">
                            <?php foreach ($fNotes as $note): ?>
                                <?php renderPublicNoteItem($note, $noteBaseUrl, $token); ?>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                <?php endif; ?>
            <?php endforeach; ?>
        </div>

        <div id="kanbanView" class="is-hidden">
            <div class="kanban-board-public">
                <!-- Parent Folder Column -->
                <?php if (!empty($kanbanData[$folder_id])): ?>
                <div class="kanban-col">
                    <div class="kanban-col-header">
                        <span class="kanban-col-title"><i class="lucide lucide-inbox"></i> <?php echo t_h('kanban.uncategorized', [], 'Uncategorized'); ?></span>
                        <span class="kanban-col-count"><?php echo count($kanbanData[$folder_id]); ?></span>
                    </div>
                    <div class="kanban-col-cards">
                        <?php foreach ($kanbanData[$folder_id] as $note): 
                            $noteUrl = !empty($note['token']) ? ($noteBaseUrl . '/' . $note['token'] . '?folder_token=' . $token) : ($noteBaseUrl . '/public_note.php?id=' . $note['id'] . '&folder_token=' . $token);
                        ?>
                            <a href="<?php echo htmlspecialchars($noteUrl); ?>" class="kanban-public-card" target="_blank" rel="noopener">
                                <span class="kanban-card-title"><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></span>
                                <span class="kanban-card-meta"><?php echo date('Y-m-d', strtotime($note['created'])); ?></span>
                            </a>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Subfolder Columns -->
                <?php foreach ($directSubfolders as $sf): ?>
                    <?php if (!empty($kanbanData[$sf['id']])): ?>
                    <div class="kanban-col">
                        <div class="kanban-col-header">
                            <span class="kanban-col-title"><i class="lucide lucide-folder"></i> <?php echo htmlspecialchars($sf['name']); ?></span>
                            <span class="kanban-col-count"><?php echo count($kanbanData[$sf['id']]); ?></span>
                        </div>
                        <div class="kanban-col-cards">
                            <?php foreach ($kanbanData[$sf['id']] as $note): 
                                $noteUrl = !empty($note['token']) ? ($noteBaseUrl . '/' . $note['token'] . '?folder_token=' . $token) : ($noteBaseUrl . '/public_note.php?id=' . $note['id'] . '&folder_token=' . $token);
                            ?>
                                <a href="<?php echo htmlspecialchars($noteUrl); ?>" class="kanban-public-card" target="_blank" rel="noopener">
                                    <span class="kanban-card-title"><?php echo htmlspecialchars($note['heading'] ?: 'Untitled'); ?></span>
                                    <span class="kanban-card-meta"><?php echo date('Y-m-d', strtotime($note['created'])); ?></span>
                                </a>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
        </div>

        <div id="folderNoResults" class="empty-folder is-hidden">
            <i class="lucide lucide-search"></i>
            <p><?php echo t_h('public_folder.no_filter_results', [], 'No results.'); ?></p>
        </div>
    <?php endif; ?>

    <?php
    /**
     * Helper to render a single note item in the list view
     */
    function renderPublicNoteItem($note, $noteBaseUrl, $folderToken = '') {
        $noteTitle = $note['heading'] ?: 'Untitled';
        $noteTitleLower = $noteTitle;
        if (function_exists('mb_strtolower')) {
            $noteTitleLower = mb_strtolower($noteTitleLower, 'UTF-8');
        } else {
            $noteTitleLower = strtolower($noteTitleLower);
        }
        
        $noteUrl = !empty($note['token']) ? ($noteBaseUrl . '/' . $note['token'] . '?folder_token=' . $folderToken) : ($noteBaseUrl . '/public_note.php?id=' . $note['id'] . '&folder_token=' . $folderToken);
        ?>
        <li class="public-note-item" data-title="<?php echo htmlspecialchars($noteTitleLower, ENT_QUOTES, 'UTF-8'); ?>">
            <a class="public-note-link" href="<?php echo htmlspecialchars($noteUrl); ?>" target="_blank" rel="noopener">
                <i class="lucide lucide-file-alt"></i>
                <span class="public-note-title"><?php echo htmlspecialchars($noteTitle); ?></span>
            </a>
        </li>
        <?php
    }
    ?>

    <script src="/js/pwa-helpers.js"></script>
    <script src="/js/public_folder.js"></script>
</body>
</html>
