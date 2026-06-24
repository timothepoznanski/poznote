<?php
require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'note_loader.php';
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
                    'label' => t_h('common.back_to_home', [], 'Dashboard', $currentLang),
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
                redirectPublicPostToGet('public_folder.php?token=' . rawurlencode($token));
            } else {
                $passwordError = true;
            }
        }
        
        if (!isset($_SESSION[$sessionKey]) || $_SESSION[$sessionKey] !== true) {
            $stylesheetHref = getVersionedPublicAppAssetHref('css/public_folder.css');
            $variablesStylesheetHref = getVersionedPublicAppAssetHref('css/dark-mode/variables.css');
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
                <link rel="stylesheet" href="<?php echo htmlspecialchars($variablesStylesheetHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
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
    $stmt = $con->prepare('SELECT id, name, workspace, icon, icon_color FROM folders WHERE id = ?');
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
                    'label' => t_h('common.back_to_home', [], 'Dashboard', $currentLang),
                ],
            ],
        ]);
    }

    // Faster approach: fetch all folders to build hierarchy in memory
    $allFoldersPool = [];
    $stmt = $con->prepare('SELECT id, name, parent_id, display_order, icon, icon_color FROM folders WHERE workspace = ? ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE');
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

    $subfoldersByParent = [];
    foreach ($allSubfolderIds as $subfolderId) {
        if (!isset($allFoldersPool[$subfolderId])) {
            continue;
        }

        $parentId = $allFoldersPool[$subfolderId]['parent_id'];
        if ($parentId === null) {
            continue;
        }

        $parentKey = (int)$parentId;
        if (!isset($subfoldersByParent[$parentKey])) {
            $subfoldersByParent[$parentKey] = [];
        }
        $subfoldersByParent[$parentKey][] = $allFoldersPool[$subfolderId];
    }

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
    $notesWhereClause = "e.folder_id IN ($placeholders) AND e.trash = 0";
    $notesQueryParams = $allRelevantFolderIds;
    $noteAgeCutoff = getNoteAgeFilterCutoff(getNoteAgeFilterDays($con));
    if ($noteAgeCutoff !== null) {
        $notesWhereClause .= ' AND e.updated >= ?';
        $notesQueryParams[] = $noteAgeCutoff;
    }

    $stmt = $con->prepare("
        SELECT e.id, e.heading, e.created, e.type, e.folder_id, e.icon, e.icon_color, sn.token
        FROM entries e
        LEFT JOIN shared_notes sn ON e.id = sn.note_id AND sn.access_mode IS NOT NULL
        WHERE $notesWhereClause
        ORDER BY e.created DESC
    ");
    $stmt->execute($notesQueryParams);
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

    // Prepare folder names and icons for titles and sort groups
    $folderNames = [];
    $folderIcons = [];
    foreach ($allRelevantFolderIds as $fid) {
        if ($fid == $folder_id) {
            $folderNames[$fid] = $folder['name'];
            $folderIcons[$fid] = ['icon' => $folder['icon'] ?? null, 'icon_color' => $folder['icon_color'] ?? null];
        } else {
            $folderNames[$fid] = $allFoldersPool[$fid]['name'] ?? 'Subfolder';
            $folderIcons[$fid] = ['icon' => $allFoldersPool[$fid]['icon'] ?? null, 'icon_color' => $allFoldersPool[$fid]['icon_color'] ?? null];
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    echo t_h('public.errors.server_error', [], 'Server error', $currentLang);
    exit;
}

// Determine theme
$theme = 'light';
$allowedPublicThemes = ['dark', 'light', 'black'];
if (!empty($row['theme']) && in_array($row['theme'], $allowedPublicThemes, true)) {
    $theme = $row['theme'];
} elseif (isset($_GET['theme']) && in_array($_GET['theme'], $allowedPublicThemes, true)) {
    $theme = $_GET['theme'];
}
$effectiveTheme = $theme === 'black' ? 'dark' : $theme;
$themeClass = $theme === 'black' ? ' class="theme-black"' : '';

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
<html data-theme="<?php echo htmlspecialchars($effectiveTheme); ?>"<?php echo $themeClass; ?>>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php if ($indexable == 0): ?>
    <meta name="robots" content="noindex, nofollow">
    <?php endif; ?>
    <title><?php echo htmlspecialchars($folder['name']); ?></title>
    <script src="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('js/public-note-theme-init.js'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
    <link rel="stylesheet" href="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('css/lucide.css'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <link rel="stylesheet" href="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('css/dark-mode/variables.css'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <link rel="stylesheet" href="/css/dark-mode/layout.css">
    <link rel="stylesheet" href="/css/dark-mode/menus.css">
    <link rel="stylesheet" href="/css/dark-mode/editor.css">
    <link rel="stylesheet" href="/css/dark-mode/modals.css">
    <link rel="stylesheet" href="/css/dark-mode/components.css">
    <link rel="stylesheet" href="/css/dark-mode/pages.css">
    <link rel="stylesheet" href="/css/dark-mode/markdown.css">
    <link rel="stylesheet" href="/css/dark-mode/kanban.css">
    <link rel="stylesheet" href="/css/dark-mode/icons.css">
    <link rel="stylesheet" href="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('css/public_folder.css'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
</head>
<body class="public-folder-body" 
      data-share-token="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-no-results="<?php echo t_h('public_folder.no_filter_results', [], 'No results.'); ?>"
      data-txt-view-notes="<?php echo t_h('public_folder.view_notes', [], 'View as list'); ?>"
      data-txt-view-kanban="<?php echo t_h('public_folder.view_kanban', [], 'View as Kanban'); ?>"
      data-txt-expand-folder="<?php echo t_h('public.expand_folder', [], 'Expand folder'); ?>"
      data-txt-collapse-folder="<?php echo t_h('public.collapse_folder', [], 'Collapse folder'); ?>"
      data-txt-expand-all="<?php echo t_h('public.expand_all', [], 'Expand all'); ?>"
      data-txt-collapse-all="<?php echo t_h('public.collapse_all', [], 'Collapse all'); ?>">
    <div class="header-controls">
        <button id="viewToggle" class="view-toggle" onclick="toggleView()" title="<?php echo t_h('public_folder.view_kanban', [], 'View as Kanban'); ?>">
            <i class="lucide lucide-columns-2" id="viewIcon"></i>
        </button>
        <button class="theme-toggle" onclick="toggleTheme()">
            <i class="lucide lucide-moon" id="themeIcon"></i>
        </button>
    </div>

    <?php
    $folderCustomIcon = !empty($folder['icon']) ? convertFontAwesomeToLucide($folder['icon']) : null;
    $folderCustomIconColor = !empty($folder['icon_color']) ? $folder['icon_color'] : null;
    $folderIconStyle = $folderCustomIconColor ? ' style="color: ' . htmlspecialchars($folderCustomIconColor, ENT_QUOTES) . ' !important;"' : '';
    $folderIconColorAttr = $folderCustomIconColor ? ' data-icon-color="' . htmlspecialchars($folderCustomIconColor, ENT_QUOTES) . '"' : '';
    $isEmojiIcon = $folderCustomIcon && !str_contains($folderCustomIcon, 'lucide');
    ?>
    <h1>
        <?php if ($isEmojiIcon): ?>
            <span class="folder-h1-emoji"><?php echo htmlspecialchars($folderCustomIcon); ?></span>
        <?php elseif ($folderCustomIcon): ?>
            <?php $iconClasses = str_contains($folderCustomIcon, 'lucide') ? $folderCustomIcon : 'lucide lucide-folder-open'; if (!str_contains($iconClasses, 'lucide ')) $iconClasses = 'lucide ' . $iconClasses; ?>
            <i class="<?php echo htmlspecialchars($iconClasses); ?>"<?php echo $folderIconStyle . $folderIconColorAttr; ?>></i>
        <?php else: ?>
            <i class="lucide lucide-folder-open"></i>
        <?php endif; ?>
        <?php echo htmlspecialchars($folder['name']); ?>
    </h1>

    <?php if (!empty($sharedNotes)): ?>
        <div class="public-folder-filter">
            <div class="filter-input-wrapper">
                <input type="text" id="folderFilterInput" class="filter-input" placeholder="<?php echo t_h('public_folder.filter_placeholder', [], 'Filter notes by title'); ?>" autocomplete="off" />
                <button id="clearFilterBtn" class="clear-filter-btn" type="button" aria-label="Clear search" style="display: none;">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
            <div id="folderFilterStats" class="filter-stats" style="display: none;"></div>
            <button id="publicFolderToggleAll" class="public-folder-toggle-all" type="button">
                <i class="lucide lucide-folder-minus"></i>
                <span><?php echo t_h('public.collapse_all', [], 'Collapse all'); ?></span>
            </button>
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
            // Render root notes first, then descendant folders recursively.
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

            <?php foreach ($subfoldersByParent[(int)$folder_id] ?? [] as $subfolder): ?>
                <?php renderPublicFolderBranch((int)$subfolder['id'], $subfoldersByParent, $notesByFolder, $folderNames, $folderIcons, $noteBaseUrl, $token, 0); ?>
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

        $showNoteIcons = getSetting('show_note_icons', '1') === '1';
        $noteIconRaw = ($showNoteIcons && !empty($note['icon'])) ? convertFontAwesomeToLucide($note['icon']) : null;
        $noteIconColor = ($showNoteIcons && !empty($note['icon_color'])) ? $note['icon_color'] : null;
        $noteIconStyle = $noteIconColor ? ' style="color: ' . htmlspecialchars($noteIconColor, ENT_QUOTES) . ' !important;"' : '';
        $noteIconColorAttr = $noteIconColor ? ' data-icon-color="' . htmlspecialchars($noteIconColor, ENT_QUOTES) . '"' : '';
        $noteIsEmoji = $noteIconRaw && !str_contains($noteIconRaw, 'lucide');
        $noteIconClasses = null;
        if (!$noteIsEmoji && $noteIconRaw) {
            $noteIconClasses = str_contains($noteIconRaw, 'lucide ') ? $noteIconRaw : 'lucide ' . $noteIconRaw;
        }
        ?>
        <li class="public-note-item" data-title="<?php echo htmlspecialchars($noteTitleLower, ENT_QUOTES, 'UTF-8'); ?>">
            <a class="public-note-link" href="<?php echo htmlspecialchars($noteUrl); ?>" target="_blank" rel="noopener">
                <?php if ($noteIsEmoji): ?>
                    <span class="note-icon-emoji"><?php echo htmlspecialchars($noteIconRaw); ?></span>
                <?php elseif ($noteIconClasses): ?>
                    <i class="<?php echo htmlspecialchars($noteIconClasses); ?>"<?php echo $noteIconStyle . $noteIconColorAttr; ?>></i>
                <?php elseif ($showNoteIcons): ?>
                    <i class="lucide lucide-file-alt"></i>
                <?php endif; ?>
                <span class="public-note-title"><?php echo htmlspecialchars($noteTitle); ?></span>
            </a>
        </li>
        <?php
    }

    function publicFolderBranchHasNotes($folderId, $subfoldersByParent, $notesByFolder) {
        if (!empty($notesByFolder[$folderId])) {
            return true;
        }

        foreach ($subfoldersByParent[$folderId] ?? [] as $childFolder) {
            if (publicFolderBranchHasNotes((int)$childFolder['id'], $subfoldersByParent, $notesByFolder)) {
                return true;
            }
        }

        return false;
    }

    function renderPublicFolderBranch($folderId, $subfoldersByParent, $notesByFolder, $folderNames, $folderIcons, $noteBaseUrl, $folderToken, $depth = 0) {
        if (!publicFolderBranchHasNotes($folderId, $subfoldersByParent, $notesByFolder)) {
            return;
        }

        $folderNotes = $notesByFolder[$folderId] ?? [];

        $subIconRaw = !empty($folderIcons[$folderId]['icon']) ? convertFontAwesomeToLucide($folderIcons[$folderId]['icon']) : null;
        $subIconColor = !empty($folderIcons[$folderId]['icon_color']) ? $folderIcons[$folderId]['icon_color'] : null;
        $subIconStyle = $subIconColor ? ' style="color: ' . htmlspecialchars($subIconColor, ENT_QUOTES) . ' !important;"' : '';
        $subIconColorAttr = $subIconColor ? ' data-icon-color="' . htmlspecialchars($subIconColor, ENT_QUOTES) . '"' : '';
        $subIsEmoji = $subIconRaw && !str_contains($subIconRaw, 'lucide');
        if (!$subIsEmoji && $subIconRaw) {
            $subIconClasses = str_contains($subIconRaw, 'lucide ') ? $subIconRaw : 'lucide ' . $subIconRaw;
        } else {
            $subIconClasses = null;
        }
        ?>
        <div class="public-folder-group" data-folder-id="<?php echo (int)$folderId; ?>" style="--public-folder-depth: <?php echo (int)$depth; ?>">
            <h2 class="public-folder-group-title">
                <button type="button" class="public-folder-toggle" aria-expanded="true">
                    <i class="lucide lucide-chevron-down"></i>
                </button>
                <?php if ($subIsEmoji): ?>
                    <span class="folder-h1-emoji"><?php echo htmlspecialchars($subIconRaw); ?></span>
                <?php elseif ($subIconClasses): ?>
                    <i class="<?php echo htmlspecialchars($subIconClasses); ?>"<?php echo $subIconStyle . $subIconColorAttr; ?>></i>
                <?php else: ?>
                    <i class="lucide lucide-folder"></i>
                <?php endif; ?>
                <?php echo htmlspecialchars($folderNames[$folderId] ?? 'Subfolder'); ?>
            </h2>

            <?php if (!empty($folderNotes)): ?>
                <ul class="notes-list">
                    <?php foreach ($folderNotes as $note): ?>
                        <?php renderPublicNoteItem($note, $noteBaseUrl, $folderToken); ?>
                    <?php endforeach; ?>
                </ul>
            <?php endif; ?>

            <?php foreach ($subfoldersByParent[$folderId] ?? [] as $childFolder): ?>
                <?php renderPublicFolderBranch((int)$childFolder['id'], $subfoldersByParent, $notesByFolder, $folderNames, $folderIcons, $noteBaseUrl, $folderToken, $depth + 1); ?>
            <?php endforeach; ?>
        </div>
        <?php
    }
    ?>

    <script src="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('js/pwa-helpers.js'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
    <script src="<?php echo htmlspecialchars(getVersionedPublicAppAssetHref('js/public_folder.js'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
</body>
</html>
