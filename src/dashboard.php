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
require_once 'version_helper.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// Whether a local password is of any use to this user. Hidden in two cases:
// the instance is SSO-only, so no password would ever be accepted at login; or
// this profile was provisioned without a credential, so there is no current
// password to authenticate the change with. Must stay in sync with the
// matching check that hides the Change Password card in settings.php.
$dashboardPasswordDisabledReason = '';
try {
    $dashboardOidcPath = __DIR__ . '/oidc.php';
    if (is_file($dashboardOidcPath)) {
        require_once $dashboardOidcPath;
    }
    if (!function_exists('hasCustomPassword')) {
        require_once __DIR__ . '/users/db_master.php';
    }
    $dashboardSsoOnly = function_exists('oidc_is_enabled')
        && oidc_is_enabled()
        && defined('OIDC_DISABLE_NORMAL_LOGIN')
        && OIDC_DISABLE_NORMAL_LOGIN;

    $dashboardNoLocalCredential = false;
    $dashboardPwUserId = function_exists('getCurrentUserId') ? getCurrentUserId() : null;
    if ($dashboardPwUserId && function_exists('hasCustomPassword')) {
        $dashboardPwProfile = function_exists('getUserProfileById') ? getUserProfileById((int)$dashboardPwUserId) : null;
        $dashboardNoLocalCredential = !(hasCustomPassword((int)$dashboardPwUserId)
            || !(is_array($dashboardPwProfile) && isPasswordLoginDisabled($dashboardPwProfile)));
    }

    if ($dashboardSsoOnly) {
        $dashboardPasswordDisabledReason = 'sso_only';
    } elseif ($dashboardNoLocalCredential) {
        $dashboardPasswordDisabledReason = 'no_local_password';
    }
} catch (Throwable $e) {
    // Never let this check disable a button that should be usable.
    $dashboardPasswordDisabledReason = '';
}
$dashboardPasswordDisabled = $dashboardPasswordDisabledReason !== '';
// Short one-liner for the info box; the full explanation goes in the button
// tooltip so the modal stays scannable.
$dashboardPasswordDisabledNote = $dashboardPasswordDisabledReason === 'sso_only'
    ? t_h('settings.card_help.password_note_sso_only', [], 'Password sign-in is disabled on this instance.')
    : t_h('settings.card_help.password_note_no_local', [], 'Your password is managed by your identity provider.');
$dashboardPasswordDisabledHelp = $dashboardPasswordDisabledReason === 'sso_only'
    ? t_h('settings.card_help.change_password_sso_only', [], 'This instance uses SSO only, so a local password would never be accepted at sign-in. Password changes are disabled.')
    : t_h('settings.card_help.change_password_no_local', [], 'Your account signs in through your identity provider and has no local password, so there is no current password to confirm a change with. An administrator can set one for you from Admin Tools > Users.');

/**
 * Build a short plain-text excerpt (or task preview) for a board card.
 * @return array{text: string, tasks: ?array, search: string}
 */
function dashboardBuildNotePreview($noteId, $type) {
    return buildNoteCardPreview($noteId, $type);
}

function dashboardFolderHasNotes(int $id, array &$folders): bool {
    // A folder marked as favorite is a favorite in its own right, so it stays
    // on the board even when the favorites filter emptied it of notes.
    if (!empty($folders[$id]['favorite'])) return true;
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
    $iconRaw = !empty($note['icon']) ? convertFontAwesomeToLucide($note['icon']) : '';
    $iconColor = !empty($note['icon_color']) ? (string)$note['icon_color'] : '';
    $noteColor = !empty($note['color']) ? (string)$note['color'] : '';
    $noteColorHex = $noteColor !== '' ? resolveNoteColorHex($noteColor) : '';
    return [
        'id'        => $noteId,
        'heading'   => $heading,
        // newtab=1 tells tabs.js to open the note as a new internal tab
        // instead of replacing the active one (see _init in js/tabs.js).
        'url'       => 'index.php?note=' . $noteId . '&newtab=1' . ($pageWorkspace !== '' ? '&workspace=' . urlencode($pageWorkspace) : ''),
        'text'      => $preview['text'],
        'tasks'     => $preview['tasks'],
        'image'     => $preview['image'] ?? null,
        'tags'      => $tags,
        'search'    => trim($heading . ' ' . implode(' ', $tags) . ' ' . ($preview['search'] ?? '')),
        'updated'   => convertUtcToUserTimezone((string)($note['updated'] ?? ''), 'Y-m-d'),
        // Unix time of the last change, for the "modified since" filter
        'updatedAt' => (int)(strtotime((string)($note['updated'] ?? '') . ' UTC') ?: 0),
        'workspace' => $pageWorkspace,
        'icon'      => $iconRaw,
        'iconColor' => $iconColor,
        // 'color' is the stored value (palette id or custom hex); 'colorHex' is
        // what the card is actually tinted with. An id whose palette entry was
        // deleted resolves to '' and renders as an uncolored card.
        'color'       => $noteColor,
        'colorHex'    => $noteColorHex,
        'pinned'      => !empty($note['pinned']),
        'globalOrder' => (int)($note['globalOrder'] ?? 0),
    ];
}

/**
 * Pinned notes first, each group keeping the order it already had
 * (updated DESC, as returned by the query).
 *
 * Each note also carries 'baseOrder', its rank in that unpinned order. The
 * board JS sorts on it after a pin toggle, so unpinning drops a note back
 * exactly where it started instead of leaving it stranded at the top.
 */
function dashboardSortPinnedFirst(array $notes): array {
    $pinned = [];
    $rest   = [];
    foreach ($notes as $i => $note) {
        $note['baseOrder'] = $i;
        if (!empty($note['pinned'])) $pinned[] = $note;
        else $rest[] = $note;
    }
    return array_merge($pinned, $rest);
}

function dashboardBuildTree(int $folderId, array &$folders, array $insertOrder, string $pageWorkspace): array {
    $f       = $folders[$folderId];
    $childIds = $f['children'];
    usort($childIds, fn($a, $b) => ($insertOrder[$a] ?? 0) - ($insertOrder[$b] ?? 0));

    $notes = dashboardSortPinnedFirst(
        array_map(fn($n) => dashboardBuildNoteData($n, $pageWorkspace), $f['notes'])
    );

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
        'cardColor'    => $f['cardColor'] ?? '',
        'cardColorHex' => $f['cardColorHex'] ?? '',
        'pinned'  => !empty($f['pinned']),
        'folders' => $childFolders,
        'notes'   => $notes,
    ];
}

function dashboardBuildPageUrl(string $page, string $pageWorkspace): string {
    return $page . ($pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : '');
}

function dashboardGetCurrentUsername(): string {
    $sessionUser = $_SESSION['user'] ?? null;
    if (is_array($sessionUser)) {
        $name = trim((string)($sessionUser['display_name'] ?? ''));
        if ($name === '') {
            $name = trim((string)($sessionUser['username'] ?? ''));
        }
        if ($name !== '') {
            return $name;
        }
    }

    $userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;
    if ($userId > 0) {
        try {
            require_once __DIR__ . '/users/db_master.php';
            $profile = getUserProfileById($userId);
            $name = trim((string)($profile['display_name'] ?? ''));
            if ($name === '' && is_array($profile)) {
                $name = trim((string)($profile['username'] ?? ''));
            }
            if ($name !== '') {
                return $name;
            }
        } catch (Exception $e) {}
    }

    return '';
}

function dashboardScopeLabel(array $scope, string $pageWorkspace): string {
    switch ($scope['mode'] ?? 'single') {
        case 'all':
            return t('dashboard.scope.all', [], 'All workspaces');
        case 'tag':
            return t('dashboard.scope.tag_label', ['tag' => $scope['tag']], 'Tag: {{tag}}');
        case 'list':
            return t('dashboard.scope.count_label', ['count' => count($scope['workspaces'])], '{{count}} workspaces');
        default:
            return $pageWorkspace !== '' ? $pageWorkspace : t('dashboard.scope.title', [], 'Scope');
    }
}

function dashboardBuildContextItems(string $pageWorkspace, array $scope = []): array {
    $items = [];
    // The scope button is always there: it is the way to the multi-workspace
    // selector even when no workspace is set
    $items[] = [
        'icon'  => 'lucide-layers',
        'label' => t('dashboard.scope.title', [], 'Scope'),
        'value' => dashboardScopeLabel($scope, $pageWorkspace),
    ];

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

        // Favorite folders are board items too, so the badge counts them
        // alongside favorite notes.
        $query = "SELECT COUNT(*) FROM folders WHERE favorite = 1";
        $params = [];
        if ($pageWorkspace !== '') {
            $query .= " AND workspace = ?";
            $params[] = $pageWorkspace;
        }
        $stmt = $con->prepare($query);
        $stmt->execute($params);
        $counts['favorites'] += (int)$stmt->fetchColumn();
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

/**
 * Folder tree and loose notes of one workspace (or of every workspace when
 * $pageWorkspace is empty), ready for the board JS.
 * @return array{folders: array, notes: array}
 */
function dashboardBuildWorkspaceBoard(PDO $con, string $pageWorkspace, bool $favoritesOnly): array {
    $board = ['folders' => [], 'notes' => []];

    $folderWhere = !empty($pageWorkspace) ? " WHERE workspace = ?" : "";
    $stmtF = $con->prepare(
        "SELECT id, name, parent_id, icon, icon_color, color, display_order, pinned, favorite FROM folders" . $folderWhere .
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
            // 'color' is the icon color (legacy name); 'cardColor'/'cardColorHex'
            // carry the card background color, like notes.
            'color'    => !empty($f['icon_color']) ? $f['icon_color'] : null,
            'cardColor'    => !empty($f['color']) ? (string)$f['color'] : '',
            'cardColorHex' => !empty($f['color']) ? resolveNoteColorHex((string)$f['color']) : '',
            'pinned'   => !empty($f['pinned']),
            // Only meaningful in favorites mode: keeps the folder on the
            // board even when none of its notes are favorites.
            'favorite' => $favoritesOnly && !empty($f['favorite']),
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

    $query = "SELECT id, heading, type, tags, folder_id, folder, updated, icon, icon_color, color, pinned FROM entries WHERE trash = 0";
    $params = [];
    if ($favoritesOnly) {
        // A favorite note qualifies on its own; a note also qualifies when it
        // lives in a favorite folder, so that folder's card is not empty.
        $favoriteFolderIds = array_keys(array_filter($folders, fn($fd) => !empty($fd['favorite'])));
        if (!empty($favoriteFolderIds)) {
            $placeholders = implode(',', array_fill(0, count($favoriteFolderIds), '?'));
            $query .= " AND (favorite = 1 OR folder_id IN ($placeholders))";
            $params = array_merge($params, $favoriteFolderIds);
        } else {
            $query .= " AND favorite = 1";
        }
    }
    if (!empty($pageWorkspace)) {
        $query .= " AND workspace = ?";
        $params[] = $pageWorkspace;
    }
    $query .= " ORDER BY updated DESC";
    $stmt = $con->prepare($query);
    $stmt->execute($params);

    $noFolderNotes = [];
    // Rank in the query's updated-DESC order, before the rows are split by
    // folder. The filtered board mixes notes from the whole tree, so it
    // needs this tree-wide rank rather than the per-folder one.
    $globalOrder = 0;
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $row['globalOrder'] = $globalOrder++;
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
        $board['folders'][] = dashboardBuildTree($rootId, $folders, $folderInsertOrder, $pageWorkspace);
    }

    foreach ($noFolderNotes as $note) {
        $board['notes'][] = dashboardBuildNoteData($note, $pageWorkspace);
    }
    $board['notes'] = dashboardSortPinnedFirst($board['notes']);

    return $board;
}

// Scope: one workspace (default), every workspace, the workspaces carrying a
// tag, or an explicit list (see poznoteResolveWorkspaceScope). A multi
// workspace scope renders one group per workspace.
$dashboardScope = ['mode' => 'single', 'workspaces' => $pageWorkspace !== '' ? [$pageWorkspace] : [], 'tag' => '', 'query' => [], 'key' => '', 'tags_map' => []];
try {
    if (isset($con)) {
        $dashboardScope = poznoteResolveWorkspaceScope($con, $_GET, $pageWorkspace);
    }
} catch (Exception $e) {}
$dashboardScopeIsMulti = $dashboardScope['mode'] !== 'single';
if (!$dashboardScopeIsMulti) {
    $pageWorkspace = $dashboardScope['workspaces'][0] ?? $pageWorkspace;
}

$dashboardData = ['folders' => [], 'notes' => [], 'groups' => []];
$isEmpty = true;
$dashboardTopbarCounts = [];

try {
    if (isset($con)) {
        if ($dashboardScopeIsMulti) {
            foreach ($dashboardScope['workspaces'] as $scopeWorkspace) {
                $board = dashboardBuildWorkspaceBoard($con, $scopeWorkspace, $favoritesOnly);
                $dashboardData['groups'][] = [
                    'workspace' => $scopeWorkspace,
                    'tags'      => $dashboardScope['tags_map'][$scopeWorkspace] ?? [],
                    'folders'   => $board['folders'],
                    'notes'     => $board['notes'],
                ];
                if (!empty($board['folders']) || !empty($board['notes'])) {
                    $isEmpty = false;
                }
            }
        } else {
            $board = dashboardBuildWorkspaceBoard($con, $pageWorkspace, $favoritesOnly);
            $dashboardData['folders'] = $board['folders'];
            $dashboardData['notes'] = $board['notes'];
            $isEmpty = empty($board['folders']) && empty($board['notes']);
        }
    }
} catch (Exception $e) {
    $dashboardData = ['folders' => [], 'notes' => [], 'groups' => []];
    $isEmpty = true;
}

$dashboardData['scope'] = [
    'mode'       => $dashboardScope['mode'],
    'tag'        => $dashboardScope['tag'],
    'workspaces' => $dashboardScope['workspaces'],
    'key'        => $dashboardScope['key'],
];

// Tag scope with no workspace carrying the tag: say so instead of the
// generic "no favorites" hint
$dashboardEmptyMessage = $favoritesOnly || !$dashboardScopeIsMulti
    ? t_h('dashboard.empty', [], 'No favorite notes yet. Mark notes as favorites to pin them to this board.')
    : t_h('dashboard.scope.empty', [], 'No notes in this scope yet.');
if ($dashboardScope['mode'] === 'tag' && empty($dashboardScope['workspaces'])) {
    $dashboardEmptyMessage = t_h('dashboard.scope.no_workspace_for_tag', ['tag' => $dashboardScope['tag']], 'No workspace carries the tag "{{tag}}".');
}

$dashboardTopbarCounts = dashboardGetTopbarCounts($con ?? null, $dashboardScopeIsMulti ? '' : $pageWorkspace);

$rawVersion = @file_get_contents('version.txt');
if ($rawVersion === false) $rawVersion = '0.0.0';
$rawVersion = trim($rawVersion);
$cache_v = urlencode(poznoteBuildAssetCacheVersion($rawVersion));
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
	<link type="text/css" rel="stylesheet" href="<?php echo poznoteAsset('css/dashboard.css'); ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>"/>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
	<link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>">
	<link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>">
	<link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>">
</head>
<body class="favorites-page dashboard-page has-icon-sidebar"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-scope="<?php echo htmlspecialchars($dashboardScope['key'], ENT_QUOTES, 'UTF-8'); ?>">
    <?php include 'icon_sidebar.php'; ?>

		<div class="favorites-container dashboard-container">
			<?php $dashboardContextItems = dashboardBuildContextItems($pageWorkspace, $dashboardScope); ?>
			<div class="dashboard-top-info">
				<?php foreach ($dashboardContextItems as $item): ?>
					<?php if ($item['icon'] === 'lucide-layers'): ?>
					<button type="button" id="dashboardWorkspaceBtn" class="dashboard-top-info-item dashboard-workspace-trigger" title="<?php echo htmlspecialchars($item['label'] . ': ' . $item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" data-action="open-workspace-switcher-modal">
						<i class="lucide <?php echo htmlspecialchars($item['icon'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" aria-hidden="true"></i>
						<span><?php echo htmlspecialchars($item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></span>
					</button>
					<?php elseif ($item['icon'] === 'lucide-user'): ?>
					<button type="button" id="dashboardUserBtn" class="dashboard-top-info-item dashboard-user-trigger" title="<?php echo htmlspecialchars($item['label'] . ': ' . $item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" data-action="open-user-info-modal">
						<i class="lucide <?php echo htmlspecialchars($item['icon'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" aria-hidden="true"></i>
						<span><?php echo htmlspecialchars($item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></span>
					</button>
					<?php else: ?>
					<div class="dashboard-top-info-item" title="<?php echo htmlspecialchars($item['label'] . ': ' . $item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
						<i class="lucide <?php echo htmlspecialchars($item['icon'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" aria-hidden="true"></i>
						<span><?php echo htmlspecialchars($item['value'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></span>
					</div>
					<?php endif; ?>
				<?php endforeach; ?>
							</div>
			<h1 class="poznote-page-title"><i class="lucide lucide-layout-dashboard"></i> <?php echo t_h('common.back_to_home', [], 'Dashboard'); ?></h1>

			<header class="dashboard-topbar">
				<div class="board-filter-row">
				<?php renderBoardViewMenu('dashboard'); ?>
				<div class="dashboard-color-filter-wrap">
					<button type="button" id="dashboardColorFilterBtn" class="dashboard-color-filter-btn" title="<?php echo t_h('note_color.filter', [], 'Filter by color'); ?>" aria-label="<?php echo t_h('note_color.filter', [], 'Filter by color'); ?>" aria-haspopup="true" aria-expanded="false">
						<i class="lucide lucide-palette"></i>
					</button>
					<div id="dashboardColorFilterMenu" class="dashboard-color-filter-menu" hidden></div>
				</div>
				<div class="dashboard-color-filter-wrap">
					<button type="button" id="dashboardModifiedFilterBtn" class="dashboard-color-filter-btn" title="<?php echo t_h('dashboard.modified.button', [], 'Filter by last modification'); ?>" aria-label="<?php echo t_h('dashboard.modified.button', [], 'Filter by last modification'); ?>" aria-haspopup="true" aria-expanded="false">
						<i class="lucide lucide-clock"></i>
					</button>
					<div id="dashboardModifiedFilterMenu" class="dashboard-color-filter-menu" hidden></div>
				</div>
				<div id="dashboardTopbarFilter" class="dashboard-topbar-filter">
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
				</div>
			</header>


		<?php if ($isEmpty): ?>
			<div class="dashboard-empty">
				<i class="lucide <?php echo $dashboardScopeIsMulti && !$favoritesOnly ? 'lucide-layers' : 'lucide-star'; ?>"></i>
				<p><?php echo $dashboardEmptyMessage; ?></p>
			</div>
		<?php else: ?>
			<div id="dashboardNoResults" class="empty-message initially-hidden">
				<p><?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?></p>
			</div>
			<nav id="dashboardBreadcrumb" class="dashboard-breadcrumb" hidden aria-label="breadcrumb"></nav>
			<div id="dashboardGrid" class="dashboard-grid-container"></div>
		<?php endif; ?>
	</div>


		<div id="workspaceSwitcherModal" class="modal">
			<div class="modal-content dashboard-scope-modal">
				<h3><?php echo t_h('dashboard.scope.title', [], 'Scope'); ?></h3>
				<div class="modal-body">
					<p><?php echo t_h('dashboard.scope.hint', [], 'Show one workspace, several, all of them, or every workspace carrying a tag.'); ?></p>
					<div id="workspaceSwitcherList" class="dashboard-scope-body">
						<div class="move-task-empty"><?php echo t_h('common.loading', [], 'Loading...'); ?></div>
					</div>
				</div>
				<div class="modal-buttons">
					<button type="button" class="btn-cancel" data-action="close-workspace-switcher-modal"><?php echo t_h('common.close'); ?></button>
					<button type="button" class="btn-primary" id="dashboardScopeApplyBtn" disabled><?php echo t_h('common.apply', [], 'Apply'); ?></button>
				</div>
			</div>
		</div>

		<div id="dashboardUserInfoModal" class="modal">
			<div class="modal-content">
				<h3><?php echo t_h('modals.user_settings_info.title', [], 'Account Settings'); ?></h3>
				<p style="margin: 16px 0; color: #4b5563; font-size: 14px; line-height: 1.5;"><?php echo $dashboardPasswordDisabled
					? t_h('modals.user_settings_info.message_sso_only', [], 'You can change your username and name from Settings.')
					: t_h('modals.user_settings_info.message', [], 'You can change your username, name and password from Settings.'); ?></p>
				<?php if ($dashboardPasswordDisabled): ?>
				<div class="modal-info-note"><i class="lucide lucide-info"></i><span><?php echo $dashboardPasswordDisabledNote; ?></span></div>
				<?php endif; ?>
				<div class="modal-buttons">
					<button type="button" class="btn-primary" onclick="window.location.href='settings.php?open=profile#my-profile-card'"><?php echo t_h('modals.user_settings_info.edit_profile_button', [], 'Edit Profile'); ?></button>
					<button type="button" class="btn-primary"<?php echo $dashboardPasswordDisabled
						? ' disabled aria-disabled="true" title="' . $dashboardPasswordDisabledHelp . '"'
						: ' onclick="window.location.href=\'settings.php?open=change-password#change-password-card\'"'; ?>><?php echo t_h('modals.user_settings_info.change_password_button', [], 'Change Password'); ?></button>
					<button type="button" class="btn-danger" data-action="close-dashboard-user-info-modal"><?php echo t_h('common.close'); ?></button>
				</div>
			</div>
		</div>

		<div id="noteColorModal" class="modal">
			<div class="modal-content">
				<h3 id="noteColorModalTitle"><?php echo t_h('note_color.modal_title', [], 'Note color'); ?></h3>
				<p class="note-color-modal-subtitle" id="noteColorModalNoteTitle"></p>
				<div class="note-color-grid" id="noteColorGrid"></div>
				<div class="modal-buttons">
					<button type="button" class="note-color-manage-btn" onclick="window.location.href='settings.php?open=note-colors#note-color-palette-card'"><i class="lucide lucide-palette"></i> <?php echo t_h('note_color.manage_button', [], 'Manage colors'); ?></button>
					<button type="button" class="btn-danger" id="noteColorClearBtn"><?php echo t_h('note_color.remove', [], 'Remove color'); ?></button>
					<button type="button" class="btn-cancel" data-action="close-note-color-modal"><?php echo t_h('common.cancel'); ?></button>
					<button type="button" class="btn-primary" id="noteColorApplyBtn"><?php echo t_h('common.apply', [], 'Apply'); ?></button>
				</div>
			</div>
		</div>

		<script>
		window.NOTE_COLOR_PALETTE = <?php echo json_encode(getNoteColorPalette(), JSON_UNESCAPED_UNICODE); ?>;
		window.TAG_COLORS = <?php echo json_encode(getTagColorsMap(), JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT); ?>;
		window.NOTE_COLOR_TXT = {
			applyError: <?php echo json_encode(t('note_color.apply_error', [], 'Could not update the note color.')); ?>,
			modalTitle: <?php echo json_encode(t('note_color.modal_title', [], 'Note color')); ?>,
			folderModalTitle: <?php echo json_encode(t('note_color.folder_modal_title', [], 'Folder color')); ?>,
			filterAll: <?php echo json_encode(t('note_color.filter_all', [], 'All notes')); ?>,
			filterAnyColor: <?php echo json_encode(t('note_color.filter_any', [], 'Any color')); ?>,
			filterNoColor: <?php echo json_encode(t('note_color.filter_none', [], 'No color')); ?>
		};
		window.DASHBOARD_DATA      = <?php echo json_encode($dashboardData, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>;
		window.DASHBOARD_PIN_TXT = {
			pin: <?php echo json_encode(t('dashboard.pin_note', [], 'Pin to top')); ?>,
			unpin: <?php echo json_encode(t('dashboard.unpin_note', [], 'Unpin')); ?>,
			error: <?php echo json_encode(t('dashboard.pin_error', [], 'Could not update the pinned state.')); ?>,
			others: <?php echo json_encode(t('dashboard.others_section', [], 'Others')); ?>
		};
		window.DASHBOARD_SCOPE_TXT = {
			all: <?php echo json_encode(t('dashboard.scope.all', [], 'All workspaces')); ?>,
			byTag: <?php echo json_encode(t('dashboard.scope.by_tag', [], 'By tag')); ?>,
			workspaces: <?php echo json_encode(t('dashboard.scope.workspaces', [], 'Workspaces')); ?>,
			noTags: <?php echo json_encode(t('dashboard.scope.no_tags', [], 'No workspace has tags yet. Add tags to your workspaces from the Workspaces page.')); ?>,
			open: <?php echo json_encode(t('dashboard.scope.open', [], 'Open only this workspace')); ?>,
			manageWorkspaces: <?php echo json_encode(t('dashboard.scope.manage_workspaces', [], 'Manage workspaces')); ?>,
			loading: <?php echo json_encode(t('common.loading', [], 'Loading...')); ?>,
			loadError: <?php echo json_encode(t('dashboard.scope.load_error', [], 'Could not load the workspaces.')); ?>,
			empty: <?php echo json_encode(t('dashboard.scope.no_workspaces', [], 'No workspaces available')); ?>,
			groupEmpty: <?php echo json_encode(t('dashboard.scope.group_empty', [], 'Nothing here yet.')); ?>
		};
		window.DASHBOARD_MODIFIED_TXT = {
			any: <?php echo json_encode(t('dashboard.modified.any', [], 'Any time')); ?>,
			today: <?php echo json_encode(t('dashboard.modified.today', [], 'Today')); ?>,
			week: <?php echo json_encode(t('dashboard.modified.week', [], 'Last 7 days')); ?>,
			month: <?php echo json_encode(t('dashboard.modified.month', [], 'Last 30 days')); ?>,
			quarter: <?php echo json_encode(t('dashboard.modified.quarter', [], 'Last 90 days')); ?>,
			year: <?php echo json_encode(t('dashboard.modified.year', [], 'Last 12 months')); ?>
		};
		window.DASHBOARD_USER = {
			isAdmin: <?php echo (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) ? 'true' : 'false'; ?>
		};
		window.NOTIFICATIONS_TXT = {
			dismiss: <?php echo json_encode(t('reminder.dismiss', [], 'Dismiss')); ?>,
			justNow: <?php echo json_encode(t('reminder.just_now', [], 'Just now')); ?>,
			repeats: <?php echo json_encode(t('reminder.repeats', [], 'Repeats')); ?>
		};
		</script>
		<script src="js/pwa-helpers.js?v=<?php echo $cache_v; ?>"></script>
		<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
		<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
		<script src="<?php echo poznoteAsset('js/dashboard-page.js'); ?>"></script>
		<script src="<?php echo poznoteAsset('js/board-view-menu.js'); ?>"></script>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
