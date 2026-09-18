<?php
/**
 * Outline of another account's notes, for the "Other accounts" block of the
 * notes list (notes_list.php, js/other-accounts.js).
 *
 *   GET account_tree.php?account=<user id>
 *   GET account_tree.php?account=<user id>&workspaces_only=1
 *
 * The signed-in person must have been granted access to that account (Admin >
 * User Management), the same check switch_account.php relies on. The
 * account's database is opened read-only and only listed: workspaces, folders
 * and live notes, no content. With workspaces_only the answer stops at the
 * workspaces (name and colour), which is what the sidebar's workspace menu
 * (js/workspaces-core.js) shows before opening one of them in that account.
 * Nothing here changes the active account.
 */
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../users/UserDataManager.php';
require_once __DIR__ . '/../lib/note-colors.php';
require_once __DIR__ . '/../lib/workspaces.php';
require_once __DIR__ . '/../lib/account-tree.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$respond = static function (int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
};

// A public-workspace visitor has no login identity to hold access grants.
if (!isRealUserAuthenticated()) {
    $respond(403, ['success' => false, 'error' => 'forbidden']);
}

$authUserId = (int)(getAuthenticatedUserId() ?? 0);
$targetUserId = isset($_GET['account']) && is_string($_GET['account']) && ctype_digit($_GET['account'])
    ? (int)$_GET['account']
    : 0;

if ($authUserId <= 0 || $targetUserId <= 0 || !canUserAccessAccount($authUserId, $targetUserId)) {
    $respond(404, ['success' => false, 'error' => 'not_found']);
}

$profile = getUserProfileById($targetUserId);
if ($profile === null || empty($profile['active'])) {
    $respond(404, ['success' => false, 'error' => 'not_found']);
}

$workspacesOnly = (string)($_GET['workspaces_only'] ?? '') === '1';

$dbPath = (new UserDataManager($targetUserId))->getUserDatabasePath();
$workspaces = [];
$folders = [];
$notes = [];
$colors = [];
$noteListSort = 'updated_desc';

// An account that has never been opened has no database yet: an empty tree,
// not an error.
if (is_file($dbPath)) {
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA query_only = 1');

        $workspaces = $pdo->query('SELECT name FROM workspaces ORDER BY ' . poznoteWorkspaceOrderBy($pdo))->fetchAll(PDO::FETCH_ASSOC);
        if ($workspacesOnly) {
            $colors = poznoteGetWorkspaceColorsMap($pdo);
        } else {
            $folders = $pdo->query('SELECT id, name, parent_id, workspace, created, display_order FROM folders')->fetchAll(PDO::FETCH_ASSOC);
            $notes = $pdo->query('SELECT id, heading, folder_id, workspace, type, created, updated, display_order FROM entries WHERE trash = 0')->fetchAll(PDO::FETCH_ASSOC);
            // The account's own sort mode, so its outline lists folders and
            // notes in the order its full tree does.
            $sortStmt = $pdo->prepare('SELECT value FROM settings WHERE key = ?');
            $sortStmt->execute(['note_list_sort']);
            $noteListSort = (string)($sortStmt->fetchColumn() ?: 'updated_desc');
        }
    } catch (Exception $e) {
        error_log('account_tree: cannot read account ' . $targetUserId . ': ' . $e->getMessage());
        $respond(500, ['success' => false, 'error' => 'unreadable']);
    }
}

$account = [
    'id' => $targetUserId,
    'username' => (string)($profile['username'] ?? ''),
];

if ($workspacesOnly) {
    $list = [];
    foreach ($workspaces as $row) {
        $name = (string)($row['name'] ?? '');
        if ($name === '') {
            continue;
        }
        $hex = isset($colors[$name]) ? (string)$colors[$name]['hex'] : '';
        $list[] = [
            'name' => $name,
            'color_hex' => preg_match('/^#[0-9a-f]{3,8}$/i', $hex) ? $hex : null,
        ];
    }
    $respond(200, ['success' => true, 'account' => $account, 'workspaces' => $list]);
}

$respond(200, [
    'success' => true,
    'account' => $account,
    'workspaces' => poznoteBuildAccountTree($workspaces, $folders, $notes, $noteListSort),
]);
