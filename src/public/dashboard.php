<?php
/**
 * Notes board - visual dashboard of notes grouped by folder.
 */
require_once __DIR__ . '/../auth.php';
requireAuth();

ob_start();
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../version_helper.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// AI assistant availability, resolved the same way index.php does (the user's
// own configuration, or the instance one granted to this user). Drives the
// rail button, the docked chat panel and its assets below.
$aiChatEnabled = false;
$aiChatConfig = [];
try {
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../ai_config.php';
    if (isset($con)) {
        $aiChatConfig = poznoteResolveAiChatConfig($con, (int)(getAuthenticatedUserId() ?? 0));
        $aiChatEnabled = !empty($aiChatConfig['available']);
    }
} catch (Throwable $e) {
    // A broken AI configuration must never take the board down with it.
    $aiChatEnabled = false;
}

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
 * Board order of the raw note rows of one folder (or of the root): cards the
 * user placed by dragging (dashboard_order > 0) in saved order, the others
 * first by newest update so a fresh note stays visible until it is placed.
 * Same rule as the sidebar's manual sort, on the dashboard's own column, and
 * the one FoldersController::compareNotesDashboardOrder renumbers with.
 */
function dashboardSortRows(array $rows): array {
    usort($rows, function (array $a, array $b): int {
        $orderA = (int)($a['dashboard_order'] ?? 0);
        $orderB = (int)($b['dashboard_order'] ?? 0);
        if ($orderA > 0 && $orderB > 0) {
            if ($orderA !== $orderB) return $orderA <=> $orderB;
            return ((int)$a['id']) <=> ((int)$b['id']);
        }
        if ($orderA > 0) return 1;
        if ($orderB > 0) return -1;
        $cmp = strcmp((string)($b['updated'] ?? ''), (string)($a['updated'] ?? ''));
        if ($cmp !== 0) return $cmp;
        return ((int)$b['id']) <=> ((int)$a['id']);
    });
    return $rows;
}

/**
 * Pinned notes first, each group keeping the order it already had (the
 * board order of dashboardSortRows).
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
        array_map(fn($n) => dashboardBuildNoteData($n, $pageWorkspace), dashboardSortRows($f['notes']))
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

/**
 * Last scope chosen on the dashboard, as the query parameters reproducing it
 * (see poznoteResolveWorkspaceScope), from the 'dashboard_scope' setting.
 */
function dashboardLoadSavedScopeQuery(PDO $con): ?array {
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['dashboard_scope']);
        $raw = $stmt->fetchColumn();
        if ($raw === false || $raw === '') return null;
        $decoded = json_decode((string)$raw, true);
        return is_array($decoded) && !empty($decoded['scope']) ? $decoded : null;
    } catch (Exception $e) {
        return null;
    }
}

function dashboardSaveScopeQuery(PDO $con, array $query): void {
    try {
        $encoded = json_encode($query, JSON_UNESCAPED_UNICODE);
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['dashboard_scope']);
        if ($stmt->fetchColumn() === $encoded) return;
        $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')->execute(['dashboard_scope', $encoded]);
    } catch (Exception $e) {
        // Remembering the scope is a convenience: never fail the page over it
        error_log('dashboard: dashboardSaveScopeQuery() failed: ' . $e->getMessage());
    }
}

/**
 * Scope of this page load, remembering the user's last explicit choice so the
 * board comes back as it was left.
 *
 * A URL carrying scope= (all, tag, list, or single with a workspace) is an
 * explicit choice made in the scope selector: it is resolved as is and saved
 * in the 'dashboard_scope' setting. A URL without it is implicit (the rail
 * button, a "back" link, a bookmark of dashboard.php): a saved multi-workspace
 * scope takes over; a saved single workspace is only used when the URL names
 * none, since a link from inside a workspace keeps showing that workspace.
 * The per-scope filters and navigation path live in the browser under the
 * scope key (see dashboardStorageKey in js/dashboard-page.js), so restoring
 * the scope restores them too.
 */
function dashboardResolveRememberedScope(PDO $con, array $params, string $pageWorkspace): array {
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return poznoteResolveWorkspaceScope($con, $params, $pageWorkspace);
    }

    $requested = strtolower(trim((string)($params['scope'] ?? '')));
    if (!in_array($requested, ['all', 'tag', 'list', 'single'], true)) {
        $saved = dashboardLoadSavedScopeQuery($con);
        if ($saved !== null) {
            if (($saved['scope'] ?? '') === 'single') {
                if (empty($params['workspace']) && !empty($saved['workspace'])) {
                    $pageWorkspace = (string)$saved['workspace'];
                    $params['workspace'] = $pageWorkspace;
                }
            } else {
                $restored = poznoteResolveWorkspaceScope($con, $saved, $pageWorkspace);
                // A tag or list that no longer matches anything falls through
                // to the plain URL rather than reopening on an empty board
                if ($restored['mode'] !== 'single' && !empty($restored['workspaces'])) {
                    return $restored;
                }
            }
        }
        return poznoteResolveWorkspaceScope($con, $params, $pageWorkspace);
    }

    $scope = poznoteResolveWorkspaceScope($con, $params, $pageWorkspace);
    $query = $scope['query'];
    if ($scope['mode'] === 'single') {
        // The resolver's single query carries no scope= marker; keep one so
        // the saved value is recognisable when read back
        $query = !empty($scope['workspaces']) ? ['scope' => 'single', 'workspace' => $scope['workspaces'][0]] : [];
    }
    if (!empty($query)) {
        dashboardSaveScopeQuery($con, $query);
    }
    return $scope;
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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

    try {
        require_once __DIR__ . '/../users/db_master.php';
        require_once __DIR__ . '/../users/UserDataManager.php';
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
                } catch (Exception $e) {
                    error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
                }
            }
        }
    } catch (Exception $e) {
        error_log('dashboard: dashboardGetTopbarCounts() failed: ' . $e->getMessage());
    }

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

    $query = "SELECT id, heading, type, tags, folder_id, folder, updated, icon, icon_color, color, pinned, dashboard_order FROM entries WHERE trash = 0";
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

    foreach (dashboardSortRows($noFolderNotes) as $note) {
        $board['notes'][] = dashboardBuildNoteData($note, $pageWorkspace);
    }
    $board['notes'] = dashboardSortPinnedFirst($board['notes']);

    return $board;
}

// Scope: one workspace (default), every workspace, the workspaces carrying a
// tag, or an explicit list (see poznoteResolveWorkspaceScope). A multi
// workspace scope renders one group per workspace. The last explicit choice
// is remembered across visits (dashboardResolveRememberedScope).
$dashboardScope = ['mode' => 'single', 'workspaces' => $pageWorkspace !== '' ? [$pageWorkspace] : [], 'tag' => '', 'query' => [], 'key' => '', 'tags_map' => [], 'colors_map' => []];
try {
    if (isset($con)) {
        $dashboardScope = dashboardResolveRememberedScope($con, $_GET, $pageWorkspace);
    }
} catch (Exception $e) {
    error_log('dashboard: dashboardBuildWorkspaceBoard() failed: ' . $e->getMessage());
}
$dashboardScopeIsMulti = $dashboardScope['mode'] !== 'single';
if (!$dashboardScopeIsMulti) {
    $pageWorkspace = $dashboardScope['workspaces'][0] ?? $pageWorkspace;
}
$aiPanelWorkspace = $pageWorkspace !== ''
    ? $pageWorkspace
    : ($dashboardScope['workspaces'][0] ?? '');
if ($aiPanelWorkspace === '') {
    $aiPanelWorkspace = (string)getFirstWorkspaceName();
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
                    'color'     => $dashboardScope['colors_map'][$scopeWorkspace]['hex'] ?? '',
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
    // name => hex of every colored workspace (workspaces.php > Color), for
    // the dot next to workspace names on multi-workspace views. Cast so an
    // empty map still encodes as an object.
    'colors'     => (object)array_map(fn($c) => $c['hex'], $dashboardScope['colors_map'] ?? []),
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

// getAppVersion() reads version.txt through an absolute path. Reading it
// relatively broke when the entry points moved into src/public/: the file
// stayed one level up, so this fell back to time() and changed the asset
// URL on every single page load.
$cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
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
	<?php if ($aiChatEnabled): ?>
	<link type="text/css" rel="stylesheet" href="<?php echo poznoteAsset('css/ai-chat.css'); ?>"/>
	<script>
		// Docked AI chat panel: restore its open state and width before the
		// first paint so the board does not render full width and then jump
		// (same keys as index.php, the panel is one and the same across pages).
		// js/ai-chat.js takes the state over on DOMContentLoaded. Never
		// restored on phones, where the panel overlays the page.
		(function () {
			try {
				if (window.innerWidth > 800 && localStorage.getItem('aiChatOpen') === 'true') {
					document.documentElement.classList.add('ai-chat-open');
				}
				var aiChatWidth = parseInt(localStorage.getItem('aiChatWidth'), 10);
				if (aiChatWidth >= 300 && aiChatWidth <= 700) {
					document.documentElement.style.setProperty('--ai-chat-width', aiChatWidth + 'px');
				}
			} catch (_error) {
				// Ignore localStorage access errors during early paint.
				console.debug('dashboard: dashboardBuildWorkspaceBoard() failed:', _error);
			}
		})();
	</script>
	<?php endif; ?>
</head>
<body class="favorites-page dashboard-page has-icon-sidebar"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
    data-ai-workspace="<?php echo htmlspecialchars($aiPanelWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-scope="<?php echo htmlspecialchars($dashboardScope['key'], ENT_QUOTES, 'UTF-8'); ?>">
    <?php
    // Same entry, same id and same place as on index.php, so the UI
    // Customization preference saved against it applies here too.
    $iconSidebarExtraItems = [];
    if ($aiChatEnabled) {
        $iconSidebarExtraItems[] = ['id' => 'sidebarAiChatBtn', 'after' => 'iconSidebarDashboardBtn', 'action' => 'toggle-ai-chat', 'icon' => 'lucide-bot', 'label' => t('ai_chat.toolbar_button', [], 'AI assistant')];
    }
    include __DIR__ . '/../icon_sidebar.php';
    ?>

		<div class="favorites-container dashboard-container">
			<?php
			// Same "(workspace)" chip as the other pages, but the dashboard skips the
			// workspace menu: the scope modal already covers a single workspace,
			// several, all of them or a tag, so one click opens it directly. The
			// label is the scope's ("All workspaces", "3 workspaces", a tag), and
			// with no workspace at all it reads "Scope" and still opens.
			$dashboardTitleWorkspace = poznoteRenderPageTitleWorkspace(dashboardScopeLabel($dashboardScope, $pageWorkspace), [
				'button_action' => 'open-workspace-switcher-modal',
				'button_title' => t('dashboard.scope.title', [], 'Scope'),
			]);
			?>
			<h1 class="poznote-page-title"><i class="lucide lucide-layout-dashboard"></i> <?php echo t_h('common.back_to_home', [], 'Dashboard'); ?> <?php echo $dashboardTitleWorkspace; ?></h1>

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
				<div class="dashboard-color-filter-wrap">
					<button type="button" id="dashboardTagFilterBtn" class="dashboard-color-filter-btn" title="<?php echo t_h('dashboard.tag_filter.button', [], 'Filter by tag'); ?>" aria-label="<?php echo t_h('dashboard.tag_filter.button', [], 'Filter by tag'); ?>" aria-haspopup="true" aria-expanded="false">
						<i class="lucide lucide-tag"></i>
					</button>
					<div id="dashboardTagFilterMenu" class="dashboard-color-filter-menu dashboard-tag-filter-menu" hidden></div>
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

	<?php if ($aiChatEnabled): ?>
	<?php // Last flex child of <body>: docks as the rightmost column next to the board ?>
	<?php include __DIR__ . '/../ai_chat_panel.php'; ?>
	<?php if ($dashboardScopeIsMulti): ?>
	<!-- The board shows several workspaces but the assistant only ever acts
	     on one: js/ai-chat.js opens this notice instead of the panel on the
	     first click of the rail button, and the panel from its Continue
	     button only. $aiPanelWorkspace is the workspace the panel resolved. -->
	<div id="aiChatScopeModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('ai_chat.scope_modal_title', [], 'One workspace at a time'); ?></h3>
			<p style="margin: 16px 0; color: #4b5563; font-size: 14px; line-height: 1.5;"><?php echo t_h('ai_chat.scope_modal_text', ['workspace' => $aiPanelWorkspace], 'The assistant cannot act on several workspaces at once. Here it will only search, read and change the notes of the workspace "{{workspace}}".'); ?></p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="ai-chat-scope-cancel"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-primary" data-action="ai-chat-scope-continue"><?php echo t_h('ai_chat.scope_modal_continue', [], 'Continue'); ?></button>
			</div>
		</div>
	</div>
	<?php endif; ?>
	<?php endif; ?>


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
					<button type="button" class="dashboard-scope-manage-btn" onclick="window.location.href='workspaces.php'"><i class="lucide lucide-layers"></i> <?php echo t_h('dashboard.scope.manage_workspaces', [], 'Manage workspaces'); ?></button>
					<button type="button" class="btn-cancel" data-action="close-workspace-switcher-modal"><?php echo t_h('common.close'); ?></button>
					<button type="button" class="btn-primary" id="dashboardScopeApplyBtn" disabled><?php echo t_h('common.apply', [], 'Apply'); ?></button>
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
		window.DASHBOARD_REORDER_TXT = {
			error: <?php echo json_encode(t('dashboard.reorder_error', [], 'Could not save the card order.')); ?>
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
		window.DASHBOARD_TAG_FILTER_TXT = {
			all: <?php echo json_encode(t('dashboard.tag_filter.all', [], 'All tags')); ?>,
			empty: <?php echo json_encode(t('dashboard.tag_filter.empty', [], 'No tags on this board.')); ?>,
			search: <?php echo json_encode(t('dashboard.tag_filter.search', [], 'Filter tags...')); ?>,
			noMatch: <?php echo json_encode(t('dashboard.tag_filter.no_match', [], 'No matching tag.')); ?>
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
		<?php if ($aiChatEnabled): ?>
		<!-- AI chat panel: js/globals.js brings the i18n runtime (window.t) and
		     getSelectedWorkspace(). The assistant's answers are rendered with
		     window.parseMarkdown, so only the parser and the source helpers it
		     builds on are needed here, not the whole markdown editor. -->
		<script src="<?php echo poznoteAsset('js/globals.js'); ?>"></script>
		<script src="<?php echo poznoteAsset('js/markdown-source.js'); ?>"></script>
		<script src="<?php echo poznoteAsset('js/markdown-parser.js'); ?>"></script>
		<script src="<?php echo poznoteAsset('js/ai-chat.js'); ?>"></script>
		<?php endif; ?>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
