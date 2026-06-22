<?php
/**
 * Notes board - visual dashboard of notes grouped by folder.
 */
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';
require_once 'GitSync.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

/**
 * Build a short plain-text excerpt (or task preview) for a board card.
 * @return array{text: string, tasks: ?array, search: string}
 */
function dashboardBuildNotePreview($noteId, $type) {
    $file = getEntryFilename($noteId, $type);
    if (!is_readable($file)) {
        return ['text' => '', 'tasks' => null, 'search' => ''];
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return ['text' => '', 'tasks' => null, 'search' => ''];
    }

    if ($type === 'tasklist') {
        $json = normalizeTasklistJsonContent($raw);
        $items = json_decode($json !== '' ? $json : $raw, true);
        $tasks = [];
        $taskSearch = [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $label = trim((string)($item['text'] ?? ''));
                if ($label === '') continue;
                $taskSearch[] = $label;
                if (count($tasks) < 4) {
                    $tasks[] = ['text' => $label, 'done' => !empty($item['completed'])];
                }
            }
        }
        return ['text' => '', 'tasks' => $tasks, 'search' => implode(' ', $taskSearch)];
    }

    if ($type === 'markdown') {
        $text = preg_replace('/```[^\n]*\n([\s\S]*?)```/', ' $1 ', $raw);
        $text = preg_replace('/^#{1,6}\s+/m', '', $text);
        $text = preg_replace('/!\[[^\]]*\]\([^)]*\)/', ' ', $text);
        $text = preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $text);
        $text = str_replace(['**', '__', '*', '`', '> '], ' ', $text);
    } else {
        $text = $raw;
    }

    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = trim((string)$text);
    $previewText = $text;
    if ($previewText !== '' && mb_strlen($previewText, 'UTF-8') > 220) {
        $previewText = rtrim(mb_substr($previewText, 0, 220, 'UTF-8')) . '…';
    }

    return ['text' => $previewText, 'tasks' => null, 'search' => $text];
}

function dashboardFolderHasNotes(int $id, array &$folders): bool {
    if (!empty($folders[$id]['notes'])) return true;
    foreach ($folders[$id]['children'] as $childId) {
        if (dashboardFolderHasNotes($childId, $folders)) return true;
    }
    return false;
}

function dashboardBuildNoteData(array $note, string $pageWorkspace): array {
    $noteId  = (int)$note['id'];
    $preview = dashboardBuildNotePreview($noteId, (string)($note['type'] ?? 'note'));
    $heading = trim((string)($note['heading'] ?? ''));
    if ($heading === '') $heading = t('common.untitled', [], 'Untitled');
    $tags = array_values(array_filter(array_map('trim', explode(',', (string)($note['tags'] ?? '')))));
    return [
        'id'      => $noteId,
        'heading' => $heading,
        'url'     => 'index.php?note=' . $noteId . ($pageWorkspace !== '' ? '&workspace=' . urlencode($pageWorkspace) : ''),
        'text'    => $preview['text'],
        'tasks'   => $preview['tasks'],
        'tags'    => $tags,
        'search'  => trim($heading . ' ' . implode(' ', $tags) . ' ' . ($preview['search'] ?? '')),
        'updated' => convertUtcToUserTimezone((string)($note['updated'] ?? ''), 'Y-m-d'),
    ];
}

function dashboardBuildTree(int $folderId, array &$folders, array $insertOrder, string $pageWorkspace): array {
    $f       = $folders[$folderId];
    $childIds = $f['children'];
    usort($childIds, fn($a, $b) => ($insertOrder[$a] ?? 0) - ($insertOrder[$b] ?? 0));

    $notes = array_map(fn($n) => dashboardBuildNoteData($n, $pageWorkspace), $f['notes']);

    $childFolders = [];
    foreach ($childIds as $childId) {
        if (!isset($folders[$childId])) continue;
        if (!dashboardFolderHasNotes($childId, $folders)) continue;
        $childFolders[] = dashboardBuildTree($childId, $folders, $insertOrder, $pageWorkspace);
    }

    return [
        'id'      => $folderId,
        'name'    => $f['name'],
        'icon'    => $f['icon'],
        'color'   => $f['color'],
        'folders' => $childFolders,
        'notes'   => $notes,
    ];
}

function dashboardBuildPageUrl(string $page, string $pageWorkspace): string {
    return $page . ($pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : '');
}

function dashboardGetCurrentUsername(): string {
    $sessionUser = $_SESSION['user'] ?? null;
    if (is_array($sessionUser) && trim((string)($sessionUser['username'] ?? '')) !== '') {
        return trim((string)$sessionUser['username']);
    }

    $userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    if ($userId > 0) {
        try {
            require_once __DIR__ . '/users/db_master.php';
            $profile = getUserProfileById($userId);
            if (is_array($profile) && trim((string)($profile['username'] ?? '')) !== '') {
                return trim((string)$profile['username']);
            }
        } catch (Exception $e) {}
    }

    return '';
}

function dashboardBuildContextItems(string $pageWorkspace): array {
    $items = [];
    if ($pageWorkspace !== '') {
        $items[] = [
            'icon'  => 'lucide-layers',
            'label' => 'Workspace',
            'value' => $pageWorkspace,
        ];
    }

    $username = dashboardGetCurrentUsername();
    if ($username !== '') {
        $items[] = [
            'icon'  => 'lucide-user',
            'label' => 'User',
            'value' => $username,
        ];
    }

    return $items;
}

function dashboardGetTopbarCounts($con, string $pageWorkspace): array {
    $counts = [
        'notes' => 0,
        'favorites' => 0,
        'notifications' => 0,
        'notifications_unread' => 0,
        'tags' => 0,
        'folders' => 0,
        'shares' => 0,
        'attachments' => 0,
        'trash' => 0,
    ];

    if (!$con) {
        return $counts;
    }

    try {
        $query = "SELECT COUNT(*) FROM entries WHERE trash = 0";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['notes'] = (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        $query = "SELECT COUNT(*) FROM entries WHERE trash = 0 AND favorite = 1";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['favorites'] = (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        $stmt = $con->prepare("
            SELECT
                COUNT(*) as total_count,
                COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread_count
            FROM notifications
            WHERE dismissed = 0 AND trigger_at <= datetime('now')
        ");
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $counts['notifications'] = (int)($row['total_count'] ?? 0);
        $counts['notifications_unread'] = (int)($row['unread_count'] ?? 0);
    } catch (Exception $e) {}

    try {
        $query = "SELECT tags FROM entries WHERE trash = 0 AND tags IS NOT NULL AND tags != ''";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $uniqueTags = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach (explode(',', $row['tags'] ?? '') as $tag) {
                $tag = trim($tag);
                if ($tag !== '') {
                    $uniqueTags[$tag] = true;
                }
            }
        }
        $counts['tags'] = count($uniqueTags);
    } catch (Exception $e) {}

    try {
        $query = "SELECT COUNT(*) FROM folders";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " WHERE workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['folders'] = (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        $query = "SELECT entry, attachments FROM entries WHERE trash = 0 AND attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $counts['attachments'] += poznoteCountDisplayableAttachments($row['attachments'] ?? '', $row['entry'] ?? '');
        }
    } catch (Exception $e) {}

    try {
        $query = "SELECT COUNT(*) FROM entries WHERE trash = 1";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['trash'] = (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        $workspaceClauseF = $pageWorkspace !== '' ? "WHERE f.workspace = ?" : "";
        $workspaceClauseE = $pageWorkspace !== '' ? "AND e.workspace = ?" : "";
        $query = "
            WITH RECURSIVE shared_hierarchy(id) AS (
                SELECT sf.folder_id FROM shared_folders sf
                INNER JOIN folders f ON sf.folder_id = f.id
                $workspaceClauseF
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN shared_hierarchy sh ON f.parent_id = sh.id
            )
            SELECT COUNT(DISTINCT e.id) as cnt
            FROM entries e
            LEFT JOIN shared_notes sn ON e.id = sn.note_id AND sn.access_mode IS NOT NULL
            WHERE e.trash = 0
            $workspaceClauseE
            AND (sn.note_id IS NOT NULL OR e.folder_id IN (SELECT id FROM shared_hierarchy))
        ";
        $params = [];
        if ($pageWorkspace !== '') {
            $params[] = $pageWorkspace;
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['shares'] += (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        $workspaceClauseF = $pageWorkspace !== '' ? "WHERE f.workspace = ?" : "";
        $workspaceClauseF2 = $pageWorkspace !== '' ? "AND f.workspace = ?" : "";
        $query = "
            WITH RECURSIVE shared_hierarchy(id) AS (
                SELECT sf.folder_id FROM shared_folders sf
                INNER JOIN folders f ON sf.folder_id = f.id
                $workspaceClauseF
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN shared_hierarchy sh ON f.parent_id = sh.id
            )
            SELECT COUNT(DISTINCT f.id) as cnt FROM folders f
            WHERE f.id IN (SELECT id FROM shared_hierarchy)
            $workspaceClauseF2
        ";
        $params = [];
        if ($pageWorkspace !== '') {
            $params[] = $pageWorkspace;
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['shares'] += (int)$stmt->fetchColumn();
    } catch (Exception $e) {}

    try {
        require_once __DIR__ . '/users/db_master.php';
        require_once __DIR__ . '/users/UserDataManager.php';
        $currentUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
        if ($currentUserId) {
            foreach (getAllUserProfiles() as $otherUser) {
                if ((int)$otherUser['id'] === $currentUserId) continue;
                $udm = new UserDataManager((int)$otherUser['id']);
                $dbPath = $udm->getUserDatabasePath();
                if (!file_exists($dbPath)) continue;

                try {
                    $ownerCon = new PDO('sqlite:' . $dbPath);
                    $ownerCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    $stmt = $ownerCon->query("SELECT allowed_users FROM shared_notes WHERE allowed_users IS NOT NULL AND allowed_users != ''");
                    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
                        $ids = json_decode($json, true);
                        if (is_array($ids) && in_array($currentUserId, array_map('intval', $ids), true)) {
                            $counts['shares']++;
                        }
                    }
                    $stmt = $ownerCon->query("SELECT allowed_users FROM shared_folders WHERE allowed_users IS NOT NULL AND allowed_users != ''");
                    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
                        $ids = json_decode($json, true);
                        if (is_array($ids) && in_array($currentUserId, array_map('intval', $ids), true)) {
                            $counts['shares']++;
                        }
                    }
                } catch (Exception $e) {}
            }
        }
    } catch (Exception $e) {}

    return $counts;
}

$favoritesOnly = isset($_GET['favorites']) && $_GET['favorites'] === '1';
$dashboardData = ['folders' => [], 'notes' => []];
$isEmpty = true;
$dashboardTopbarCounts = [];
$notificationsUnreadCount = 0;

try {
    if (isset($con)) {
        $folderWhere = !empty($pageWorkspace) ? " WHERE workspace = ?" : "";
        $stmtF = $con->prepare(
            "SELECT id, name, parent_id, icon, icon_color, display_order FROM folders" . $folderWhere .
            " ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE"
        );
        $stmtF->execute(!empty($pageWorkspace) ? [$pageWorkspace] : []);

        $folders = [];
        $folderInsertOrder = [];
        $pos = 0;
        while ($f = $stmtF->fetch(PDO::FETCH_ASSOC)) {
            $id = (int)$f['id'];
            $folders[$id] = [
                'id'       => $id,
                'name'     => trim($f['name']),
                'parent'   => $f['parent_id'] !== null ? (int)$f['parent_id'] : null,
                'icon'     => !empty($f['icon']) ? convertFontAwesomeToLucide($f['icon']) : 'lucide lucide-folder',
                'color'    => !empty($f['icon_color']) ? $f['icon_color'] : null,
                'notes'    => [],
                'children' => [],
            ];
            $folderInsertOrder[$id] = $pos++;
        }

        foreach ($folders as $id => &$fd) {
            if ($fd['parent'] !== null && isset($folders[$fd['parent']])) {
                $folders[$fd['parent']]['children'][] = $id;
            }
        }
        unset($fd);

        $query = "SELECT id, heading, type, tags, folder_id, folder, updated FROM entries WHERE trash = 0";
        $params = [];
        if ($favoritesOnly) {
            $query .= " AND favorite = 1";
        }
        if (!empty($pageWorkspace)) {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $query .= " ORDER BY updated DESC";
        $stmt = $con->prepare($query);
        $stmt->execute($params);

        $noFolderNotes = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $fid = $row['folder_id'] !== null ? (int)$row['folder_id'] : null;
            if ($fid !== null && isset($folders[$fid])) {
                $folders[$fid]['notes'][] = $row;
            } else {
                $noFolderNotes[] = $row;
            }
        }

        $rootIds = array_filter(array_keys($folders), fn($id) => $folders[$id]['parent'] === null);
        usort($rootIds, fn($a, $b) => ($folderInsertOrder[$a] ?? 0) - ($folderInsertOrder[$b] ?? 0));

        foreach ($rootIds as $rootId) {
            if (!dashboardFolderHasNotes($rootId, $folders)) continue;
            $dashboardData['folders'][] = dashboardBuildTree($rootId, $folders, $folderInsertOrder, $pageWorkspace);
        }

        foreach ($noFolderNotes as $note) {
            $dashboardData['notes'][] = dashboardBuildNoteData($note, $pageWorkspace);
        }

        $isEmpty = empty($dashboardData['folders']) && empty($dashboardData['notes']);
    }
} catch (Exception $e) {
    $dashboardData = ['folders' => [], 'notes' => []];
    $isEmpty = true;
}

$dashboardTopbarCounts = dashboardGetTopbarCounts($con ?? null, $pageWorkspace);
$notificationsUnreadCount = (int)($dashboardTopbarCounts['notifications_unread'] ?? 0);
$notificationsActiveCount = (int)($dashboardTopbarCounts['notifications'] ?? 0);

$dashboardGitSync = new GitSync($con ?? null, $_SESSION['user_id'] ?? null);
$dashboardGitProviderRaw = $dashboardGitSync->getProvider();
$dashboardGitProviderName = getGitProviderName($dashboardGitProviderRaw);
$dashboardGitProviderParams = ['provider' => $dashboardGitProviderName];
$dashboardGitEnabled = GitSync::isEnabled() && $dashboardGitSync->isConfigured();
$dashboardGitIcon = ($dashboardGitProviderRaw === 'forgejo') ? 'lucide lucide-git-branch' : 'lucide lucide-github';
$dashboardGitConfigUrl = dashboardBuildPageUrl('git_sync.php', $pageWorkspace);
$dashboardLastSyncInfo = $dashboardGitSync->getLastSyncInfo();

// Result of the last Git sync (stored in session by GitSyncController after a push/pull).
// The page is reloaded by the sync JS once it completes, so we surface the outcome banner
// and the detailed action log (with copy button) here.
$dashboardSyncMessage = '';
$dashboardSyncWarning = '';
$dashboardSyncError = '';
$dashboardSyncResult = null;
if (isset($_SESSION['last_sync_result'])) {
    $lastSync = $_SESSION['last_sync_result'];
    $syncAction = $lastSync['action'] ?? '';
    $dashboardSyncResult = $lastSync['result'] ?? null;
    unset($_SESSION['last_sync_result']);

    if (is_array($dashboardSyncResult)) {
        $syncErrorCount = count($dashboardSyncResult['errors'] ?? []);
        if (!empty($dashboardSyncResult['success'])) {
            if ($syncAction === 'push') {
                $dashboardSyncMessage = t('git_sync.messages.push_success', array_merge($dashboardGitProviderParams, [
                    'count' => $dashboardSyncResult['pushed'] ?? 0,
                    'attachments' => $dashboardSyncResult['attachments_pushed'] ?? 0,
                    'deleted' => $dashboardSyncResult['deleted'] ?? 0,
                    'errors' => $syncErrorCount,
                ]));
            } else {
                $dashboardSyncMessage = t('git_sync.messages.pull_success', array_merge($dashboardGitProviderParams, [
                    'pulled' => $dashboardSyncResult['pulled'] ?? 0,
                    'updated' => $dashboardSyncResult['updated'] ?? 0,
                    'deleted' => $dashboardSyncResult['deleted'] ?? 0,
                    'errors' => $syncErrorCount,
                ]));
            }
            if ($syncErrorCount > 0) {
                $dashboardSyncWarning = $dashboardSyncMessage;
                $dashboardSyncMessage = '';
            }
        } else {
            $dashboardSyncError = t('git_sync.messages.' . $syncAction . '_error', array_merge($dashboardGitProviderParams, [
                'error' => $dashboardSyncResult['errors'][0]['error'] ?? 'Unknown error',
            ]));
        }
    }
}

$cache_v = @file_get_contents('version.txt');
if ($cache_v === false) $cache_v = time();
$cache_v = urlencode(poznoteBuildAssetCacheVersion(trim($cache_v)));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
	<link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/reminders.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/favorites.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dashboard.css?v=<?php echo file_exists(__DIR__ . '/css/dashboard.css') ? filemtime(__DIR__ . '/css/dashboard.css') : $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>"/>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="favorites-page dashboard-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
		<nav class="dashboard-sidebar">
			<?php $dashboardContextItems = dashboardBuildContextItems($pageWorkspace); ?>
			<?php if (!empty($dashboardContextItems)): ?>
				<div class="dashboard-sidebar-context">
					<?php foreach ($dashboardContextItems as $item): ?>
						<?php
							$contextTitle = $item['label'] . ': ' . $item['value'];
						?>
						<div class="dashboard-sidebar-context-item" title="<?php echo htmlspecialchars($contextTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
							<i class="lucide <?php echo htmlspecialchars($item['icon'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" aria-hidden="true"></i>
							<span><?php echo htmlspecialchars($item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></span>
						</div>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
			<a href="index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="dashboard-topbar-btn" title="<?php echo t_h('common.back_to_notes'); ?>">
				<i class="lucide lucide-home"></i>
			</a>
			<button type="button" id="dashboardToggleFilter" class="dashboard-topbar-btn" title="<?php echo t_h('search.placeholder', [], 'Search'); ?>" aria-label="<?php echo t_h('search.placeholder', [], 'Search'); ?>" aria-controls="dashboardTopbarFilter" aria-expanded="false">
				<i class="lucide lucide-search"></i>
			</button>
		<button type="button" id="dashboardGitPushBtn" class="dashboard-topbar-btn<?php echo !$dashboardGitEnabled ? ' initially-hidden' : ''; ?>" data-dashboard-git-action="push" title="Push" aria-label="Push">
			<i class="lucide lucide-upload"></i>
		</button>
		<button type="button" id="dashboardGitPullBtn" class="dashboard-topbar-btn<?php echo !$dashboardGitEnabled ? ' initially-hidden' : ''; ?>" data-dashboard-git-action="pull" title="Pull" aria-label="Pull">
			<i class="lucide lucide-download"></i>
			</button>
			<a href="settings.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="dashboard-topbar-btn" title="<?php echo t_h('common.back_to_settings', [], 'Settings'); ?>">
				<i class="lucide lucide-settings"></i>
			</a>
			<hr class="dashboard-sidebar-sep">
			<a href="https://github.com/timothepoznanski/poznote/releases" target="_blank" rel="noopener noreferrer" class="dashboard-topbar-btn" title="<?php echo t_h('settings.cards.release_notes', [], 'Release notes'); ?>">
				<i class="lucide lucide-info"></i>
			</a>
			<a href="https://github.com/timothepoznanski/poznote" target="_blank" rel="noopener noreferrer" class="dashboard-topbar-btn" title="<?php echo t_h('settings.cards.documentation', [], 'Documentation GitHub'); ?>">
				<i class="lucide lucide-github"></i>
			</a>
			<?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
			<button type="button" id="dashboardApiRestBtn" class="dashboard-topbar-btn" title="<?php echo t_h('settings.cards.api_rest', [], 'API REST'); ?>">
				<i class="lucide lucide-code"></i>
			</button>
			<?php endif; ?>
			<a href="https://poznote.com" target="_blank" rel="noopener noreferrer" class="dashboard-topbar-btn" title="<?php echo t_h('settings.cards.website', [], 'Poznote Website'); ?>">
				<i class="lucide lucide-globe"></i>
			</a>
			<hr class="dashboard-sidebar-sep">
			<a href="https://ko-fi.com/timothepoznanski" target="_blank" rel="noopener noreferrer" class="dashboard-topbar-btn dashboard-sidebar-kofi" title="<?php echo t_h('settings.cards.buy_me_a_coffee', [], 'Buy me a coffee'); ?>">
				<i class="lucide lucide-heart"></i>
			</a>
		</nav>
		<div class="favorites-container dashboard-container">
			<header class="dashboard-topbar">
				<nav class="dashboard-topbar-actions">
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('notes_manager.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('common.notes', [], 'Notes'); ?>" aria-label="<?php echo t_h('common.notes', [], 'Notes'); ?>">
						<i class="lucide lucide-sticky-note"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['notes'] ?? 0); ?></span>
					</a>
					<button type="button" id="dashboardToggleFavorites" class="dashboard-topbar-btn<?php echo $favoritesOnly ? ' active' : ''; ?>" title="<?php echo $favoritesOnly ? t_h('dashboard.toggle_all', [], 'Show all notes') : t_h('dashboard.toggle_favorites', [], 'Show favorites only'); ?>">
						<i class="lucide lucide-star"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['favorites'] ?? 0); ?></span>
					</button>
					<button type="button" id="dashboardNotificationsBtn" class="dashboard-topbar-btn dashboard-notifications-btn<?php echo $notificationsActiveCount > 0 ? ' has-notifications' : ''; ?>" data-action="open-notifications-modal" title="<?php echo t_h('reminder.notifications', [], 'Notifications'); ?>" aria-label="<?php echo t_h('reminder.notifications', [], 'Notifications'); ?>">
						<i class="lucide lucide-bell"></i>
						<span class="dashboard-topbar-count" id="dashboardNotificationsCount"><?php echo (int)($dashboardTopbarCounts['notifications'] ?? 0); ?></span>
					</button>
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('list_tags.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?>" aria-label="<?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?>">
						<i class="lucide lucide-tags"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['tags'] ?? 0); ?></span>
					</a>
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('list_folders.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('home.folders', [], 'Folders'); ?>" aria-label="<?php echo t_h('home.folders', [], 'Folders'); ?>">
						<i class="lucide lucide-folder-open"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['folders'] ?? 0); ?></span>
					</a>
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('shared.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('home.shares', [], 'Shares'); ?>" aria-label="<?php echo t_h('home.shares', [], 'Shares'); ?>">
						<i class="lucide lucide-share-2"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['shares'] ?? 0); ?></span>
					</a>
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('attachments_list.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?>" aria-label="<?php echo t_h('notes_list.system_folders.attachments', [], 'Attachments'); ?>">
						<i class="lucide lucide-paperclip"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['attachments'] ?? 0); ?></span>
					</a>
					<a href="<?php echo htmlspecialchars(dashboardBuildPageUrl('trash.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-topbar-btn" title="<?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?>" aria-label="<?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?>">
						<i class="lucide lucide-trash-2"></i>
						<span class="dashboard-topbar-count"><?php echo (int)($dashboardTopbarCounts['trash'] ?? 0); ?></span>
					</a>
				</nav>
				<div id="dashboardTopbarFilter" class="dashboard-topbar-filter is-collapsed">
					<i class="lucide lucide-search dashboard-filter-icon"></i>
					<input
						type="text"
						id="filterInput"
						class="dashboard-filter-input"
						placeholder="<?php echo t_h('dashboard.filter_placeholder', [], 'Filter by title, content or tag...'); ?>"
						autocomplete="off"
					/>
					<button type="button" id="clearFilterBtn" class="dashboard-filter-clear initially-hidden" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
						<i class="lucide lucide-x"></i>
					</button>
				</div>
			</header>

		<?php if ($dashboardSyncMessage || $dashboardSyncWarning || $dashboardSyncError || ($dashboardSyncResult && !empty($dashboardSyncResult['debug']))): ?>
		<div class="dashboard-sync-feedback" style="display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px;">
			<?php if ($dashboardSyncMessage): ?>
			<div class="alert alert-success">
				<i class="lucide lucide-check-circle"></i> <?php echo htmlspecialchars($dashboardSyncMessage); ?>
			</div>
			<?php endif; ?>
			<?php if ($dashboardSyncWarning): ?>
			<div class="alert alert-warning">
				<i class="lucide lucide-alert-triangle"></i> <?php echo htmlspecialchars($dashboardSyncWarning); ?>
			</div>
			<?php endif; ?>
			<?php if ($dashboardSyncError): ?>
			<div class="alert alert-error">
				<i class="lucide lucide-alert-circle"></i> <?php echo htmlspecialchars($dashboardSyncError); ?>
			</div>
			<?php endif; ?>

			<?php if ($dashboardSyncResult && !empty($dashboardSyncResult['debug'])): ?>
			<div class="dashboard-sync-debug">
				<div class="dashboard-debug-controls">
					<button type="button" id="dashboardDebugToggleBtn" class="btn btn-secondary dashboard-debug-btn">
						<i class="lucide lucide-bug"></i> <span id="dashboardDebugToggleText"><?php echo t_h('git_sync.debug.show'); ?></span>
					</button>
					<button type="button" id="dashboardDebugChangesBtn" class="btn btn-secondary dashboard-debug-btn" aria-pressed="false" hidden>
						<i class="lucide lucide-filter"></i> <span id="dashboardDebugChangesText"><?php echo t_h('git_sync.debug.show_changes', [], 'Only changes'); ?></span>
					</button>
					<button type="button" id="dashboardDebugCopyBtn" class="btn btn-secondary dashboard-debug-btn" hidden>
						<i class="lucide lucide-copy"></i> <?php echo t_h('git_sync.debug.copy'); ?>
					</button>
				</div>
				<div id="dashboardDebugInfo" class="debug-info dashboard-debug-info" hidden>
					<h4><?php echo t_h('git_sync.debug.title', [], 'Debug Info'); ?></h4>
					<pre id="dashboardDebugOutput"><?php echo htmlspecialchars(implode("\n", $dashboardSyncResult['debug'])); ?></pre>
				</div>
				<script>
				(function() {
					const debugLines = <?php echo json_encode($dashboardSyncResult['debug'], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
					const debugContent = debugLines.join("\n");
					const debugChangesContent = debugLines.filter(function(line) {
						const normalized = line.trim();
						if (!normalized) return false;
						if (/→\s*unchanged\b|->\s*unchanged\b/i.test(normalized)) return false;
						if (/^Attachment unchanged:/i.test(normalized)) return false;
						if (/^Loaded metadata\.json/i.test(normalized)) return false;
						if (/^Skipped /i.test(normalized)) return false;
						return /→|->|Attachment saved:|Trashed local note|ERROR|WARNING|failed/i.test(normalized);
					}).join("\n");
					const debugNoChangesText = <?php echo json_encode(t('git_sync.debug.no_changes', [], 'No changes found in debug.'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
					const toggleBtn = document.getElementById('dashboardDebugToggleBtn');
					const debugDiv = document.getElementById('dashboardDebugInfo');
					const debugOutput = document.getElementById('dashboardDebugOutput');
					const toggleText = document.getElementById('dashboardDebugToggleText');
					const copyBtn = document.getElementById('dashboardDebugCopyBtn');
					const changesBtn = document.getElementById('dashboardDebugChangesBtn');
					const changesText = document.getElementById('dashboardDebugChangesText');
					let debugChangesOnly = false;

					function updateDebugOutput() {
						if (!debugOutput) return;
						debugOutput.textContent = debugChangesOnly
							? (debugChangesContent || debugNoChangesText)
							: debugContent;
						if (changesBtn) changesBtn.setAttribute('aria-pressed', debugChangesOnly ? 'true' : 'false');
						if (changesText) {
							changesText.textContent = debugChangesOnly
								? <?php echo json_encode(t('git_sync.debug.show_all', [], 'Show all'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>
								: <?php echo json_encode(t('git_sync.debug.show_changes', [], 'Only changes'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
						}
					}

					toggleBtn?.addEventListener('click', function() {
						if (debugDiv.hidden) {
							debugDiv.hidden = false;
							if (changesBtn) changesBtn.hidden = false;
							if (copyBtn) copyBtn.hidden = false;
							updateDebugOutput();
							toggleText.textContent = <?php echo json_encode(t('git_sync.debug.hide'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
						} else {
							debugDiv.hidden = true;
							if (changesBtn) changesBtn.hidden = true;
							if (copyBtn) copyBtn.hidden = true;
							toggleText.textContent = <?php echo json_encode(t('git_sync.debug.show'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
						}
					});

					changesBtn?.addEventListener('click', function() {
						debugChangesOnly = !debugChangesOnly;
						updateDebugOutput();
					});

					copyBtn?.addEventListener('click', function() {
						navigator.clipboard.writeText(debugOutput ? debugOutput.textContent : debugContent).then(function() {
							const originalHTML = copyBtn.innerHTML;
							copyBtn.innerHTML = '<i class="lucide lucide-check"></i> ' + <?php echo json_encode(t('git_sync.debug.copied'), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>;
							setTimeout(function() {
								copyBtn.innerHTML = originalHTML;
							}, 2000);
						});
					});
				})();
				</script>
			</div>
			<?php endif; ?>
		</div>
		<?php endif; ?>

		<?php if ($isEmpty): ?>
			<div class="dashboard-empty">
				<i class="lucide lucide-star"></i>
				<p><?php echo t_h('dashboard.empty', [], 'No favorite notes yet. Mark notes as favorites to pin them to this board.'); ?></p>
			</div>
		<?php else: ?>
			<div id="dashboardNoResults" class="empty-message initially-hidden">
				<p><?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?></p>
			</div>
			<nav id="dashboardBreadcrumb" class="dashboard-breadcrumb" hidden aria-label="breadcrumb"></nav>
			<div id="dashboardGrid" class="dashboard-grid-container"></div>
		<?php endif; ?>
	</div>

		<?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
		<div id="dashboardApiRestModal" class="modal">
			<div class="modal-content">
				<h3><?php echo t_h('modals.api_rest.title', [], 'API REST'); ?></h3>
				<div class="modal-buttons" style="flex-wrap: nowrap; justify-content: space-between;">
					<button type="button" class="btn-primary" id="dashboardOpenGithubApiDocsBtn" style="flex: 1 1 0;"><?php echo t_h('modals.api_rest.github_option', [], 'GitHub'); ?></button>
					<button type="button" class="btn-primary" id="dashboardOpenSwaggerApiBtn" style="flex: 1 1 0;"><?php echo t_h('modals.api_rest.swagger_option', [], 'Swagger'); ?></button>
					<button type="button" class="btn-danger" id="dashboardCloseApiRestModalBtn" style="flex: 1 1 0;"><?php echo t_h('common.cancel'); ?></button>
				</div>
			</div>
		</div>
		<?php endif; ?>

		<div id="notificationsModal" class="modal">
			<div class="modal-content">
				<h3><?php echo t_h('reminder.notifications', [], 'Notifications'); ?></h3>
				<div class="notifications-modal-body" style="max-height: 60vh; overflow-y: auto; margin: 15px 0;">
					<div class="notifications-empty" id="notificationsEmpty">
						<i class="lucide lucide-inbox"></i>
						<p><?php echo t_h('reminder.no_notifications', [], 'No notifications'); ?></p>
					</div>
					<div class="notifications-list" id="notificationsList"></div>
				</div>
				<div class="modal-buttons">
					<button type="button" class="btn-danger initially-hidden" id="dismissAllBtn" data-action="dismiss-all-notifications"><?php echo t_h('reminder.dismiss_all', [], 'Delete all'); ?></button>
					<button type="button" class="btn-cancel" data-action="close-notifications-modal"><?php echo t_h('common.close'); ?></button>
				</div>
			</div>
		</div>

		<div id="dashboardGitModal" class="modal dashboard-git-modal">
			<div class="modal-content">
				<h3><?php echo t_h('settings.cards.git_sync', [], 'Git Sync'); ?></h3>
				<div class="dashboard-git-actions">
					<?php if ($dashboardGitEnabled): ?>
						<button type="button" class="dashboard-git-action" data-dashboard-git-action="push">
							<span class="dashboard-git-action-icon"><i class="lucide lucide-upload"></i></span>
							<span class="dashboard-git-action-body">
								<span class="dashboard-git-action-title">Push</span>
								<span class="dashboard-git-action-status"><?php echo htmlspecialchars($dashboardGitProviderName, ENT_QUOTES, 'UTF-8'); ?></span>
							</span>
						</button>
						<button type="button" class="dashboard-git-action" data-dashboard-git-action="pull">
							<span class="dashboard-git-action-icon"><i class="lucide lucide-download"></i></span>
							<span class="dashboard-git-action-body">
								<span class="dashboard-git-action-title">Pull</span>
								<span class="dashboard-git-action-status"><?php echo htmlspecialchars($dashboardGitProviderName, ENT_QUOTES, 'UTF-8'); ?></span>
							</span>
						</button>
					<?php else: ?>
						<a href="<?php echo htmlspecialchars($dashboardGitConfigUrl, ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-git-action">
							<span class="dashboard-git-action-icon"><i class="lucide lucide-upload"></i></span>
							<span class="dashboard-git-action-body">
								<span class="dashboard-git-action-title">Push</span>
								<span class="dashboard-git-action-status"><?php echo t_h('git_sync.config.not_configured_yet', $dashboardGitProviderParams, 'To configure'); ?></span>
							</span>
						</a>
						<a href="<?php echo htmlspecialchars($dashboardGitConfigUrl, ENT_QUOTES, 'UTF-8'); ?>" class="dashboard-git-action">
							<span class="dashboard-git-action-icon"><i class="lucide lucide-download"></i></span>
							<span class="dashboard-git-action-body">
								<span class="dashboard-git-action-title">Pull</span>
								<span class="dashboard-git-action-status"><?php echo t_h('git_sync.config.not_configured_yet', $dashboardGitProviderParams, 'To configure'); ?></span>
							</span>
						</a>
					<?php endif; ?>
				</div>
				<div class="modal-buttons">
					<button type="button" class="btn-cancel" data-action="close-dashboard-git-modal"><?php echo t_h('common.close'); ?></button>
				</div>
			</div>
		</div>

		<script>
		window.DASHBOARD_DATA      = <?php echo json_encode($dashboardData, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>;
		window.NOTIFICATIONS_TXT = {
			dismiss: <?php echo json_encode(t('reminder.dismiss', [], 'Dismiss')); ?>,
			justNow: <?php echo json_encode(t('reminder.just_now', [], 'Just now')); ?>
		};
		window.DASHBOARD_GIT = {
			provider: <?php echo json_encode($dashboardGitProviderName); ?>,
			workspace: <?php echo json_encode($pageWorkspace); ?>,
			configUrl: <?php echo json_encode($dashboardGitConfigUrl); ?>,
			confirmPush: <?php echo json_encode(t('git_sync.confirm_push', $dashboardGitProviderParams, 'Push all notes to Git?')); ?>,
			confirmPull: <?php echo json_encode(t('git_sync.confirm_pull', $dashboardGitProviderParams, 'Pull all notes from Git? This may overwrite local changes.')); ?>,
			starting: <?php echo json_encode(t('git_sync.starting', [], 'Syncing...')); ?>,
			completed: <?php echo json_encode(t('git_sync.completed', [], 'Completed!')); ?>,
			connectionError: <?php echo json_encode(t('git_sync.messages.connection_error', ['error' => ''], 'Connection error: ')); ?>,
			lastSyncTimestamp: <?php echo json_encode(is_array($dashboardLastSyncInfo) ? ($dashboardLastSyncInfo['timestamp'] ?? '') : ''); ?>
		};
		</script>
		<script src="js/navigation.js"></script>
		<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
		<script src="js/notifications-modal.js?v=<?php echo file_exists(__DIR__ . '/js/notifications-modal.js') ? filemtime(__DIR__ . '/js/notifications-modal.js') : $cache_v; ?>"></script>
		<script src="js/dashboard-page.js?v=<?php echo file_exists(__DIR__ . '/js/dashboard-page.js') ? filemtime(__DIR__ . '/js/dashboard-page.js') : $cache_v; ?>"></script>
</body>
</html>
