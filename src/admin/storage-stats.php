<?php
/**
 * Storage Statistics — Admin Tool
 *
 * Reports, for each account, the number of notes and the amount of disk
 * space used (database + attachments).
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
requireActiveAccountOwner();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
requireSettingsPassword();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">Access denied. Admin privileges required.</div>';
    exit;
}

require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/../users/db_master.php';

$v             = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

/**
 * Recursively sum the byte size of every file under a directory.
 */
function poznoteDirSize(string $dir): int {
    if (!is_dir($dir)) {
        return 0;
    }
    $total = 0;
    try {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $file) {
            if ($file->isFile()) {
                $total += $file->getSize();
            }
        }
    } catch (Exception $e) {
        // Unreadable directory — treat as 0
    }
    return $total;
}

/**
 * Format a byte count as MB with two decimals.
 */
function poznoteFormatMb(int $bytes): string {
    return number_format($bytes / (1024 * 1024), 2);
}

/**
 * Glue a trailing unit like "(MB)" to the preceding word so it never wraps
 * onto its own line. Expects an already HTML-safe string from t_h().
 */
function poznoteGlueUnit(string $label): string {
    return preg_replace('/ (\([^()]*\))\s*$/u', '&nbsp;$1', $label);
}

/**
 * Render a sortable column header for the stats table, as a link that
 * toggles the sort direction server-side (the table is paginated, so a
 * client-side sort would only reorder the visible page).
 * Expects an already HTML-safe label. $extraClass is a space-separated list
 * of the table's own classes ("hide-mobile", "col-group-start").
 */
function poznoteSortHeader(string $escapedLabel, string $column, string $currentSort, string $extraClass = ''): string {
    $allowed = array_intersect(preg_split('/\s+/', trim($extraClass), -1, PREG_SPLIT_NO_EMPTY) ?: [], ['hide-mobile', 'col-group-start']);
    $class = $allowed ? ' class="' . implode(' ', $allowed) . '"' : '';

    $currentColumn = substr($currentSort, 0, (int)strrpos($currentSort, '_'));
    $currentDir = substr($currentSort, (int)strrpos($currentSort, '_') + 1);
    $isActive = $column === $currentColumn;
    $nextSort = $column . '_' . (($isActive && $currentDir === 'asc') ? 'desc' : 'asc');
    $icon = ($isActive && $currentDir === 'asc') ? 'lucide-chevron-up' : 'lucide-chevron-down';

    // Keep the active search when re-sorting; the 'page' param is dropped on
    // purpose (the old offset is meaningless in a new order).
    $searchParam = trim((string)($_GET['q'] ?? ''));
    $href = '?sort=' . $nextSort . ($searchParam !== '' ? '&q=' . urlencode($searchParam) : '');

    return '<th' . $class . '>'
        . '<a class="users-sort-link' . ($isActive ? ' users-sort-active' : '') . '" href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '">'
        . $escapedLabel
        . '<i class="lucide ' . $icon . ' users-sort-icon"></i></a></th>';
}

function collectStorageStats(): array {
    $dataRoot = dirname(SQLITE_DATABASE, 2);
    $usersDir = $dataRoot . '/users';

    if (!is_dir($usersDir)) {
        $dataRoot = __DIR__ . '/../data';
        $usersDir = $dataRoot . '/users';
    }

    // Map user id => profile (username, admin flag, per-user quota overrides).
    $profiles = [];
    try {
        $stmt = getMasterConnection()->query("SELECT id, username, is_admin, quota_max_notes, quota_max_storage_mb, quota_max_storage_s3_mb, quota_max_backups_s3_mb FROM users");
        foreach ($stmt as $profile) {
            $profiles[(int)$profile['id']] = $profile;
        }
    } catch (Exception $e) {
        // Profiles stay empty; rows render with an em dash for the name.
    }

    // Real backup usage read from the backup bucket, in one ListObjects call
    // for the whole instance. Empty when S3 backups are off or unreachable.
    require_once __DIR__ . '/../S3BackupService.php';
    $backupUsage = S3BackupService::usageBytesByUser();

    $rows = [];
    if (!is_dir($usersDir)) {
        return $rows;
    }

    $userIds = array_values(array_filter(scandir($usersDir), fn($d) => ctype_digit($d) && is_dir("$usersDir/$d")));
    sort($userIds, SORT_NUMERIC);

    foreach ($userIds as $userId) {
        $userPath        = "$usersDir/$userId";
        $attachmentsDir  = $userPath . '/attachments';
        $entriesDir      = $userPath . '/entries';
        $databaseDir     = $userPath . '/database';
        $dbPath          = $databaseDir . '/poznote.db';

        $profile = $profiles[(int)$userId] ?? null;
        $row = [
            'user_id'          => (int)$userId,
            'username'         => $profile['username'] ?? null,
            'is_admin'         => $profile ? (bool)$profile['is_admin'] : false,
            'quota_max_notes'  => ($profile && $profile['quota_max_notes'] !== null) ? (int)$profile['quota_max_notes'] : null,
            'quota_max_storage_mb' => ($profile && $profile['quota_max_storage_mb'] !== null) ? (int)$profile['quota_max_storage_mb'] : null,
            'quota_max_storage_s3_mb' => ($profile && $profile['quota_max_storage_s3_mb'] !== null) ? (int)$profile['quota_max_storage_s3_mb'] : null,
            'quota_max_backups_s3_mb' => ($profile && $profile['quota_max_backups_s3_mb'] !== null) ? (int)$profile['quota_max_backups_s3_mb'] : null,
            'notes_active'     => 0,
            'notes_trash'      => 0,
            'db_bytes'         => 0,
            'entries_bytes'    => 0,
            'attachments_bytes'=> 0,
            'attachments_s3_bytes' => 0,
            'backups_s3_bytes' => $backupUsage[(int)$userId] ?? 0,
            'total_bytes'      => 0,
            'error'            => null,
        ];

        // Database size (includes -wal/-shal companion files under the dir).
        $row['db_bytes']          = poznoteDirSize($databaseDir);
        $row['entries_bytes']     = poznoteDirSize($entriesDir);
        $row['attachments_bytes'] = poznoteDirSize($attachmentsDir);
        // Total is the sum of the three displayed columns so the row adds up.
        // It deliberately excludes backups/snapshots/backgrounds, which are not
        // part of the backup export either.
        $row['total_bytes']       = $row['db_bytes'] + $row['entries_bytes'] + $row['attachments_bytes'];

        if (file_exists($dbPath)) {
            try {
                $db = new PDO("sqlite:$dbPath");
                $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $row['notes_active'] = (int)$db->query("SELECT COUNT(*) FROM entries WHERE trash = 0")->fetchColumn();
                $row['notes_trash']  = (int)$db->query("SELECT COUNT(*) FROM entries WHERE trash = 1")->fetchColumn();
                // S3 mode: attachments absent from the local directory live in
                // the bucket; sum their sizes recorded in the database. Files
                // still on disk (not yet migrated) stay in the local column.
                require_once __DIR__ . '/../storage/AttachmentStorage.php';
                // Credentials, not the S3 switch: objects left in the bucket
                // after it is turned off still occupy (paid) space.
                if (AttachmentStorage::isConfigured()) {
                    $s3Bytes = 0;
                    $attStmt = $db->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
                    foreach ($attStmt as $attRow) {
                        $list = json_decode($attRow['attachments'] ?? '', true);
                        if (is_array($list)) {
                            foreach ($list as $attachment) {
                                $filename = (string)($attachment['filename'] ?? '');
                                if ($filename === '' || file_exists($attachmentsDir . '/' . basename($filename))) {
                                    continue;
                                }
                                $s3Bytes += max(0, (int)($attachment['file_size'] ?? 0));
                            }
                        }
                    }
                    $row['attachments_s3_bytes'] = $s3Bytes;
                    $row['total_bytes']         += $s3Bytes;
                }
                $db = null;
            } catch (Exception $e) {
                $row['error'] = $e->getMessage();
            }
        }

        $rows[] = $row;
    }

    return $rows;
}

$stats = collectStorageStats();

// === Sort (server-side, persisted per admin like the users table) ===
// Sorting has to cover the whole account set before the page is sliced, and
// every column but id/username is computed from disk, so it happens here in
// PHP rather than in SQL. Each column maps to the row field it orders by;
// rows whose stats errored sort as -1, like the previous client-side sort.
$storageSortFields = [
    'id' => 'user_id',
    'account' => 'username',
    'notes' => 'notes_active',
    'trash' => 'notes_trash',
    'notes_total' => null, // active + trash, computed in the comparator
    'db' => 'db_bytes',
    'files' => 'entries_bytes',
    'attachments' => 'attachments_bytes',
    'total' => 'total_bytes',
    'attachments_s3' => 'attachments_s3_bytes',
    'backups_s3' => 'backups_s3_bytes',
];
$allowedStorageSorts = [];
foreach (array_keys($storageSortFields) as $sortableColumn) {
    $allowedStorageSorts[] = $sortableColumn . '_asc';
    $allowedStorageSorts[] = $sortableColumn . '_desc';
}
$requestedSort = $_GET['sort'] ?? '';
if (in_array($requestedSort, $allowedStorageSorts, true)) {
    $storageSort = $requestedSort;
    // $con is the per-user database connection opened by db_connect.php, the
    // same one getSetting() reads from.
    global $con;
    try {
        $sortStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $sortStmt->execute(['admin_storage_stats_sort', $storageSort]);
    } catch (Exception $e) {
        // Non-fatal: the requested sort still applies for this request.
    }
} else {
    $storedSort = getSetting('admin_storage_stats_sort');
    $storageSort = in_array($storedSort, $allowedStorageSorts, true) ? $storedSort : 'id_asc';
}
$storageSortColumn = substr($storageSort, 0, (int)strrpos($storageSort, '_'));
$storageSortDir = substr($storageSort, (int)strrpos($storageSort, '_') + 1);

usort($stats, function ($a, $b) use ($storageSortFields, $storageSortColumn, $storageSortDir) {
    if ($storageSortColumn === 'account') {
        $cmp = strcasecmp((string)($a['username'] ?? ''), (string)($b['username'] ?? ''));
    } elseif ($storageSortColumn === 'notes_total') {
        $va = $a['error'] ? -1 : $a['notes_active'] + $a['notes_trash'];
        $vb = $b['error'] ? -1 : $b['notes_active'] + $b['notes_trash'];
        $cmp = $va <=> $vb;
    } else {
        $field = $storageSortFields[$storageSortColumn];
        $va = ($a['error'] && $field === 'notes_active') ? -1 : $a[$field];
        $vb = ($b['error'] && $field === 'notes_active') ? -1 : $b[$field];
        $cmp = $va <=> $vb;
    }
    if ($cmp === 0) {
        $cmp = $a['user_id'] <=> $b['user_id'];
    }
    return $storageSortDir === 'desc' ? -$cmp : $cmp;
});

// === Page size (persisted in the settings table, like the sort) ===
// 0 means "all rows on one page": it disables paging entirely rather than
// standing for an empty page.
$storagePageSizeOptions = [25, 50, 100, 250, 0];
$requestedPageSize = $_GET['per_page'] ?? null;
if ($requestedPageSize !== null && ctype_digit((string)$requestedPageSize)
    && in_array((int)$requestedPageSize, $storagePageSizeOptions, true)) {
    $storagePageSize = (int)$requestedPageSize;
    global $con;
    try {
        $sizeStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $sizeStmt->execute(['admin_storage_stats_per_page', (string)$storagePageSize]);
    } catch (Exception $e) {
        // Non-fatal: the requested size still applies for this request.
    }
} else {
    $storedPageSize = getSetting('admin_storage_stats_per_page');
    $storagePageSize = ($storedPageSize !== null && ctype_digit((string)$storedPageSize)
        && in_array((int)$storedPageSize, $storagePageSizeOptions, true))
        ? (int)$storedPageSize
        : 50;
}

// === Search + pagination (server-side) ===
// The totals row further down is computed over $stats before this filter, so
// it always reports the whole instance whatever the page or search shows.
$storageSearch = trim((string)($_GET['q'] ?? ''));
$storageRows = $stats;
if ($storageSearch !== '') {
    $needle = mb_strtolower($storageSearch);
    $storageRows = array_values(array_filter($stats, function ($row) use ($needle) {
        return mb_strpos(mb_strtolower((string)($row['username'] ?? '')), $needle) !== false
            || strpos((string)$row['user_id'], $needle) !== false;
    }));
}
$storageTotal = count($storageRows);

// Which optional columns exist. Resolved here rather than next to the table
// markup because the CSV export below has to emit the same set of columns.
// Show a dedicated S3 column whenever a bucket may hold attachments,
// including after S3 storage was turned off with files still in it
require_once __DIR__ . '/../storage/AttachmentStorage.php';
$s3ColumnVisible = AttachmentStorage::isConfigured();

// Same for backups, which target their own (independent) bucket
require_once __DIR__ . '/../S3BackupService.php';
$backupsColumnVisible = S3BackupService::isEnabled();

// === CSV export ===
// Exports every matching row in the current sort order, deliberately ignoring
// the page slice: an export that silently stopped at the visible page would be
// mistaken for the full picture. The active search still applies, so the file
// matches what the admin is looking at, just without the paging.
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    $filename = 'poznote-storage-stats-' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store');

    $out = fopen('php://output', 'w');
    // UTF-8 BOM: without it Excel reads accented usernames as mojibake.
    fwrite($out, "\xEF\xBB\xBF");

    $csvHeader = [
        t('admin_tools.storage_stats.table_id', [], 'ID'),
        t('admin_tools.storage_stats.table_account', [], 'Account'),
        t('admin_tools.storage_stats.table_notes', [], 'Notes'),
        t('admin_tools.storage_stats.table_trash', [], 'Trash'),
        t('admin_tools.storage_stats.table_notes_total', [], 'Total notes'),
        t('admin_tools.storage_stats.table_db', [], 'Database (MB)'),
        t('admin_tools.storage_stats.table_entries', [], 'Files (MB)'),
        t('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)'),
        t('admin_tools.storage_stats.table_total', [], 'Total (MB)'),
    ];
    if ($s3ColumnVisible) {
        $csvHeader[] = t('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)');
    }
    if ($backupsColumnVisible) {
        $csvHeader[] = t('admin_tools.storage_stats.table_backups_s3', [], 'Backups S3 (MB)');
    }
    fputcsv($out, $csvHeader);

    foreach ($storageRows as $row) {
        // Raw numbers, not the display strings: the "/ 500" quota suffix and
        // the thousands separators would make the columns unusable in a
        // spreadsheet. Sizes stay in MB to match the column headers.
        $line = [
            $row['user_id'],
            $row['username'] ?? '',
            $row['error'] ? '' : $row['notes_active'],
            $row['notes_trash'],
            $row['error'] ? '' : ($row['notes_active'] + $row['notes_trash']),
            round($row['db_bytes'] / (1024 * 1024), 2),
            round($row['entries_bytes'] / (1024 * 1024), 2),
            round($row['attachments_bytes'] / (1024 * 1024), 2),
            round($row['total_bytes'] / (1024 * 1024), 2),
        ];
        if ($s3ColumnVisible) {
            $line[] = round($row['attachments_s3_bytes'] / (1024 * 1024), 2);
        }
        if ($backupsColumnVisible) {
            $line[] = round($row['backups_s3_bytes'] / (1024 * 1024), 2);
        }
        fputcsv($out, $line);
    }

    fclose($out);
    exit;
}

if ($storagePageSize === 0) {
    $storageTotalPages = 1;
    $storagePage = 1;
} else {
    $storageTotalPages = max(1, (int)ceil($storageTotal / $storagePageSize));
    $storagePage = min(max(1, (int)($_GET['page'] ?? 1)), $storageTotalPages);
    $storageRows = array_slice($storageRows, ($storagePage - 1) * $storagePageSize, $storagePageSize);
}

/**
 * Pager link keeping the current search; sort and page size are stored
 * server-side, so they never need to travel in the URL.
 */
function storagePageUrl(int $page, string $search): string {
    $params = ['page' => $page];
    if ($search !== '') {
        $params['q'] = $search;
    }
    return '?' . http_build_query($params);
}

/**
 * Label for a page-size option; 0 is "All".
 */
function storagePageSizeLabel(int $size): string {
    return $size === 0
        ? t('admin_tools.storage_stats.pager.all', [], 'All')
        : (string)$size;
}

// Global quota defaults (0 = unlimited), overridable per user below.
$globalMaxNotes     = max(0, (int)getGlobalSetting('user_max_notes', '0'));
$globalMaxStorageMb = max(0, (int)getGlobalSetting('user_max_storage_mb', '0'));
$globalMaxStorageS3Mb = max(0, (int)getGlobalSetting('user_max_storage_s3_mb', '0'));
$globalMaxBackupsS3Mb = max(0, (int)getGlobalSetting('user_max_backups_s3_mb', '0'));

/**
 * Format a quota value for display: 0 (unlimited) renders as the infinity sign.
 */
function poznoteFormatQuotaValue(int $value): string {
    return $value > 0 ? (string)$value : '∞';
}

/**
 * The "/ 500" quota suffix shown next to a usage figure: the limit that
 * applies to this pool for this user, as a button opening the quota modal.
 *
 * Admins are exempt from quotas, so their suffix is a plain "/ ∞" that
 * explains the exemption when clicked instead of opening the editor: their
 * limits are not editable, but the marker keeps every row visually aligned.
 * $override is that user's per-user value, or null when they inherit the
 * global one; both render the same way.
 */
function poznoteQuotaSuffix(array $row, ?int $override, int $globalValue, bool $isAdmin): string {
    if ($isAdmin) {
        return '<button type="button" class="quota-inline quota-admin-exempt"'
            . ' title="' . t_h('admin_tools.storage_stats.quota_admin_exempt', [], 'Unlimited because admin') . '"'
            . ' data-username="' . htmlspecialchars($row['username'] ?? ('#' . $row['user_id']), ENT_QUOTES) . '"'
            . '>/&nbsp;∞</button>';
    }

    $effective = $override ?? $globalValue;

    return '<button type="button" class="quota-inline"'
        . ' title="' . t_h('modals.user_quotas.title', [], 'User quotas') . '"'
        . ' data-user-id="' . (int)$row['user_id'] . '"'
        . ' data-username="' . htmlspecialchars($row['username'] ?? ('#' . $row['user_id']), ENT_QUOTES) . '"'
        . ' data-quota-notes="' . ($row['quota_max_notes'] !== null ? (int)$row['quota_max_notes'] : '') . '"'
        . ' data-quota-storage="' . ($row['quota_max_storage_mb'] !== null ? (int)$row['quota_max_storage_mb'] : '') . '"'
        . ' data-quota-storage-s3="' . ($row['quota_max_storage_s3_mb'] !== null ? (int)$row['quota_max_storage_s3_mb'] : '') . '"'
        . ' data-quota-backups-s3="' . ($row['quota_max_backups_s3_mb'] !== null ? (int)$row['quota_max_backups_s3_mb'] : '') . '"'
        . '>/&nbsp;' . poznoteFormatQuotaValue($effective) . '</button>';
}

$totNotesActive        = 0;
$totNotesTrash         = 0;
$totDbBytes            = 0;
$totEntriesBytes       = 0;
$totAttachmentBytes    = 0;
$totAttachmentS3Bytes  = 0;
$totBackupsS3Bytes     = 0;
$totBytes              = 0;
foreach ($stats as $r) {
    $totNotesActive        += $r['notes_active'];
    $totNotesTrash         += $r['notes_trash'];
    $totDbBytes            += $r['db_bytes'];
    $totEntriesBytes       += $r['entries_bytes'];
    $totAttachmentBytes    += $r['attachments_bytes'];
    $totAttachmentS3Bytes  += $r['attachments_s3_bytes'];
    $totBackupsS3Bytes     += $r['backups_s3_bytes'];
    $totBytes              += $r['total_bytes'];
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('admin_tools.storage_stats.title', [], 'Storage statistics'); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/home/search.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/admin-tools.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar-page.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/icon-sidebar-mobile.css?v=<?php echo $v; ?>">
    <style>
    /* The table (10 columns in S3 mode, nowrap cells) is far wider than the
       default 700px admin column: let it use the whole window, keeping the
       admin-container's 20px padding as the side margins. The table itself
       shrink-fits and centers, so narrower tables don't stretch. */
    .admin-container {
        max-width: none;
    }
    .dr-page {
        max-width: none;
        padding-left: 0;
        padding-right: 0;
    }
    /* Balance the whitespace around the hero text: users.css puts 45px of
       header margins above it but only 10px sits below. */
    .admin-header {
        margin-bottom: 0;
    }
    .dr-hero {
        padding: 0 0 15px;
    }
    /* The table below already carries a 20px margin-top of its own */
    .home-search-container {
        margin-bottom: 12px;
    }
    /* Shrink-to-fit and self-center: at width:100% the table's intrinsic
       width can exceed the column and overflow to the right instead. */
    .results-table {
        width: auto;
        margin-left: auto;
        margin-right: auto;
    }
    /* Same model as the users table: the wrapper is height-capped by JS to
       the viewport so its horizontal scrollbar is always on screen, and rows
       scroll vertically inside it while the sticky headers stay put. */
    .table-scroll {
        overflow: auto;
        margin-top: 20px;
        /* Keep the rounding, drop the frame: the container cuts mid-row once
           the cap kicks in, so the corners still need clipping. */
        border-radius: 12px;
    }
    /* No outer frame on this table; admin-tools.css draws one by default. */
    .table-scroll .results-table {
        border: none;
        border-radius: 0;
    }
    .results-table {
        margin-top: 0;
        /* admin-tools.css uses overflow:hidden for the border-radius, but a
           hidden ancestor breaks position:sticky; clip crops the same way
           without becoming the sticky headers' scroll container. */
        overflow: clip;
        /* admin-tools.css collapses the borders, which makes Chromium paint
           row content over the sticky header. Separate borders render
           identically here (the separators are td borders). */
        border-collapse: separate;
        border-spacing: 0;
    }
    /* Keep headers readable while rows scroll under them. The bottom border
       is a box-shadow because collapsed-table borders don't stick, and the
       background stops rows showing through the transparent th. */
    .results-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        /* Opaque on purpose: admin-tools.css already gives th this shade, and
           a transparent header would let rows scroll through it. */
        background: var(--bg-secondary, #f9f9f9);
        box-shadow: 0 1px 0 var(--border-color, #e5e7eb);
    }
    /* The dark palette is --dm-*; without this the sticky header keeps the
       light background above and rows would scroll under a white band. */
    :root[data-theme='dark'] .results-table thead th,
    body.dark-mode .results-table thead th {
        background: var(--dm-content-bg);
        box-shadow: 0 1px 0 var(--dm-border);
    }
    /* The totals row is pinned to the bottom of the scroller for the same
       reason the headers are pinned to the top: it is the figure the admin
       compares every row against, and it would otherwise sit below the fold. */
    .results-table tfoot td {
        position: sticky;
        bottom: 0;
        z-index: 2;
        background: var(--bg-color, #fff);
        box-shadow: 0 -1px 0 var(--border-color, #e5e7eb);
    }
    :root[data-theme='dark'] .results-table tfoot td,
    body.dark-mode .results-table tfoot td {
        background: var(--dm-content-bg);
        box-shadow: 0 -1px 0 var(--dm-border);
    }
    /* Tighter rows than the 12px 20px admin-tools default, and headers
       centered over their (mostly numeric) columns */
    .results-table th,
    .results-table td {
        padding: 7px 16px;
        text-align: center;
    }
    /* Rule separating the column groups: note counts, trash, local storage,
       S3 attachments, S3 backups. It sits on the column that opens each
       group, so it lands correctly whichever S3 features are enabled. */
    .results-table th.col-group-start,
    .results-table td.col-group-start {
        border-left: 2px solid var(--border-color, #e5e7eb);
    }
    /* Every value of the sorted column in bold, matching its (already bold,
       via users.css .users-sort-active) header. */
    .results-table td.sorted-column-cell {
        font-weight: 700;
    }
    /* Same look as the users and activity log pagers. */
    .users-pager {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: center;
        margin-top: 16px;
        font-size: 0.85rem;
        color: var(--text-muted, #777);
        flex-wrap: wrap;
    }
    /* Page-size selector, sitting at the end of the pager row. */
    .users-pager-size {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0;
    }
    .users-pager-size select {
        font: inherit;
        color: #222;
        background: #fff;
        border: 1px solid var(--border-color, #d5d5d5);
        border-radius: 6px;
        padding: 3px 6px;
        cursor: pointer;
    }
    /* Dark mode uses its own --dm-* palette; without this the select stays
       white-on-white. The option list is painted by the OS, hence styling
       both the control and its options. */
    :root[data-theme='dark'] .users-pager-size select,
    body.dark-mode .users-pager-size select {
        color: var(--dm-text);
        background: var(--dm-surface);
        border-color: var(--dm-border);
    }
    :root[data-theme='dark'] .users-pager-size select option,
    body.dark-mode .users-pager-size select option {
        color: var(--dm-text);
        background: var(--dm-surface);
    }
    /* Slightly larger column headers, smaller cell values than the
       admin-tools defaults (0.7rem / 1rem). Weight is dialled back from the
       admin-tools 700 so the sorted column's bold header actually stands out. */
    .results-table th {
        font-size: 0.78rem;
        font-weight: 600;
        /* Long labels scroll with .table-scroll instead of wrapping onto two lines */
        white-space: nowrap;
    }
    .results-table td {
        font-size: 0.85rem;
    }
    /* "/ 500" suffix appended to the usage figure it limits: reads as part of
       the value, but is a real button opening the quota modal. Per-user
       overrides and inherited global values render identically. */
    .quota-inline {
        background: none;
        border: none;
        padding: 0 0 0 2px;
        font: inherit;
        color: inherit;
        cursor: pointer;
        vertical-align: baseline;
    }
    #quotaModal .modal-title,
    #quotaAdminModal .modal-title {
        margin-bottom: 18px;
    }
    .quota-modal-description {
        margin: 0 0 16px;
        color: var(--text-muted, #666);
        font-size: 13px;
        white-space: pre-line;
    }
    #quotaModal .form-group label {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
    }
    </style>
    <script>
    /**
     * Filter the stats table against the search input value.
     *
     * Two modes, because the table is paginated server-side:
     * - Every account is already on screen (one page, or "All" picked): filter
     *   the rows live in the DOM, exactly the pre-pagination behavior.
     * - Several pages (or a server search already active): live-filtering
     *   would only search the visible page and silently miss accounts on the
     *   others, so rows are left alone and Enter submits the surrounding GET
     *   form, which searches all accounts server-side.
     */
    const STORAGE_LIVE_FILTER = <?php echo json_encode($storageTotalPages <= 1 && $storageSearch === ''); ?>;
    const STORAGE_BASE_URL = <?php echo json_encode($_SERVER['PHP_SELF']); ?>;

    function initStorageStatsFilter() {
        const input = document.getElementById('storage-filter-input');
        if (!input) return;

        const wrapper = input.closest('.home-search-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('has-value', input.value !== '');
        }
        const clearBtn = document.getElementById('storage-filter-clear');

        input.addEventListener('input', function () {
            if (wrapper) {
                wrapper.classList.toggle('has-value', this.value !== '');
            }
            if (!STORAGE_LIVE_FILTER) return;
            const query = this.value.trim().toLowerCase();
            document.querySelectorAll('.results-table tbody tr').forEach(function (row) {
                row.classList.toggle('filter-hidden', query !== '' && !row.textContent.toLowerCase().includes(query));
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (this.value !== '') {
                this.value = '';
                this.dispatchEvent(new Event('input'));
            } else if (!STORAGE_LIVE_FILTER) {
                // Empty input but a server-side search is active: leave it.
                window.location.href = STORAGE_BASE_URL;
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (!STORAGE_LIVE_FILTER && input.value === '') {
                    window.location.href = STORAGE_BASE_URL;
                    return;
                }
                input.value = '';
                input.dispatchEvent(new Event('input'));
                input.focus();
            });
        }
    }

    /**
     * Bold every value in the sorted column, not just its header. The sort is
     * server-side, so the active header (rendered with .users-sort-active) is
     * what tells us which column index to mark.
     */
    function markSortedStorageColumn() {
        const table = document.querySelector('.results-table');
        const activeHeader = table ? table.querySelector('thead .users-sort-active') : null;
        if (!activeHeader) return;

        const columnIndex = activeHeader.closest('th').cellIndex;
        table.querySelectorAll('tbody tr').forEach(function (row) {
            // Skip the "no accounts" placeholder, which is a single wide cell.
            if (row.cells.length === 1 && row.cells[0].colSpan > 1) return;
            const cell = row.cells[columnIndex];
            if (cell) cell.classList.add('sorted-column-cell');
        });
    }

    /* Cap the scroll wrapper to the viewport so its horizontal scrollbar never
       ends up below the fold; rows scroll vertically inside instead, under the
       sticky headers. Mirrors sizeUsersTableScroll() in admin/users.php.
       Below 769px admin-tools.css switches to its own narrow layout: leave the
       wrapper uncapped there so the page scrolls normally on a phone. */
    function sizeStorageTableScroll() {
        const scroller = document.querySelector('.table-scroll');
        if (!scroller) return;
        if (window.matchMedia('(max-width: 768px)').matches) {
            scroller.style.maxHeight = '';
            return;
        }

        // Measure what actually sits below the table (pager, container padding,
        // body margin) instead of guessing a fixed gap: a guess that falls
        // short leaves the page itself scrollable by a few pixels, which shows
        // up as a stray scrollbar on a large screen.
        scroller.style.maxHeight = '';
        const top = scroller.getBoundingClientRect().top + window.scrollY;
        const scrollerBottom = scroller.getBoundingClientRect().bottom + window.scrollY;
        const pageBottom = document.documentElement.scrollHeight;
        const below = Math.max(0, pageBottom - scrollerBottom);

        scroller.style.maxHeight = Math.max(240, window.innerHeight - top - below) + 'px';
    }

    document.addEventListener('DOMContentLoaded', function () {
        initStorageStatsFilter();
        markSortedStorageColumn();
        sizeStorageTableScroll();
    });
    window.addEventListener('resize', sizeStorageTableScroll);
</script>
</head>
<body class="has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarBasePath = '../'; include '../icon_sidebar.php'; ?>
<div class="admin-container">
<h1 class="poznote-page-title"><i class="lucide lucide-pie-chart"></i> <?php echo t_h('settings.cards.storage_stats', [], 'Admin storage statistics'); ?></h1>

    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <?php // Exports every matching account, not just the visible page.
                  // The current search is carried over so the file matches
                  // what is on screen. ?>
            <a href="?export=csv<?php echo $storageSearch !== '' ? ('&q=' . urlencode($storageSearch)) : ''; ?>" class="btn btn-primary">
                <i class="lucide lucide-download" style="margin-right:5px;"></i><?php echo t_h('admin_tools.storage_stats.export_csv', [], 'Export CSV'); ?>
            </a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <p><?php echo t_h('admin_tools.storage_stats.description', [], 'Number of notes and disk space used by each account.'); ?></p>
        </div>

        <!-- A GET form so Enter searches every account server-side; on a
             single unfiltered page the JS below also filters rows live. -->
        <form class="home-search-container" method="get" action="">
            <div class="home-search-wrapper">
                <i class="lucide lucide-search home-search-icon"></i>
                <input type="text" id="storage-filter-input" name="q" value="<?php echo htmlspecialchars($storageSearch, ENT_QUOTES, 'UTF-8'); ?>" class="home-search-input" placeholder="<?php echo t_h('admin_tools.storage_stats.filter_placeholder', [], 'Filter accounts...'); ?>" autocomplete="off">
                <button type="button" id="storage-filter-clear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
        </form>

        <div class="results-container table-scroll">
            <table class="results-table">
                <thead>
                    <tr>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_id', [], 'ID'), 'id', $storageSort); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_account', [], 'Account'), 'account', $storageSort, 'col-group-start'); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_notes', [], 'Notes'), 'notes', $storageSort, 'col-group-start'); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_trash', [], 'Trash'), 'trash', $storageSort, 'hide-mobile'); ?>
                        <?php // The note quota counts active + trashed notes, so its
                              // total sits after both, carrying the "/ 500" suffix. ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_notes_total', [], 'Total notes'), 'notes_total', $storageSort); ?>
                        <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database (MB)')), 'db', $storageSort, 'hide-mobile col-group-start'); ?>
                        <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files (MB)')), 'files', $storageSort, 'hide-mobile'); ?>
                        <?php if ($s3ColumnVisible): ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_local', [], 'Attachments local (MB)')), 'attachments', $storageSort, 'hide-mobile'); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')), 'total', $storageSort); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)')), 'attachments_s3', $storageSort, 'hide-mobile col-group-start'); ?>
                        <?php else: ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')), 'attachments', $storageSort, 'hide-mobile'); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')), 'total', $storageSort); ?>
                        <?php endif; ?>
                        <?php if ($backupsColumnVisible): ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_backups_s3', [], 'Backups S3 (MB)')), 'backups_s3', $storageSort, 'hide-mobile col-group-start'); ?>
                        <?php endif; ?>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($storageRows as $row): ?>
                        <tr>
                            <td><?php echo $row['user_id']; ?></td>
                            <td class="col-group-start" style="white-space: nowrap;">
                                <?php if ($row['username'] !== null): ?>
                                    <?php echo htmlspecialchars($row['username'], ENT_QUOTES); ?>
                                <?php else: ?>
                                    <span style="color: var(--text-muted, #999);">—</span>
                                <?php endif; ?>
                            </td>
                            <td class="col-group-start">
                                <?php if ($row['error']): ?>
                                    <span style="color:red" title="<?php echo htmlspecialchars($row['error'], ENT_QUOTES); ?>">—</span>
                                <?php else: ?>
                                    <?php echo $row['notes_active']; ?>
                                <?php endif; ?>
                            </td>
                            <td class="hide-mobile"><?php echo $row['notes_trash']; ?></td>
                            <?php // Trashed notes count against the quota too: they still
                                  // exist and can be restored. ?>
                            <td style="white-space: nowrap;">
                                <?php if ($row['error']): ?>
                                    <span style="color:red">—</span>
                                <?php else: ?>
                                    <?php echo $row['notes_active'] + $row['notes_trash']; ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_notes'], $globalMaxNotes, $row['is_admin']); ?>
                                <?php endif; ?>
                            </td>
                            <td class="hide-mobile col-group-start"><?php echo poznoteFormatMb($row['db_bytes']); ?></td>
                            <td class="hide-mobile"><?php echo poznoteFormatMb($row['entries_bytes']); ?></td>
                            <td class="hide-mobile"><?php echo poznoteFormatMb($row['attachments_bytes']); ?></td>
                            <?php // The local storage quota covers the whole account perimeter
                                  // (database + files + attachments), which is what Total sums. ?>
                            <td style="white-space: nowrap;">
                                <?php echo poznoteFormatMb($row['total_bytes']); ?>
                                <?php echo poznoteQuotaSuffix($row, $row['quota_max_storage_mb'], $globalMaxStorageMb, $row['is_admin']); ?>
                            </td>
                            <?php if ($s3ColumnVisible): ?>
                                <td class="hide-mobile col-group-start" style="white-space: nowrap;">
                                    <?php echo poznoteFormatMb($row['attachments_s3_bytes']); ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_storage_s3_mb'], $globalMaxStorageS3Mb, $row['is_admin']); ?>
                                </td>
                            <?php endif; ?>
                            <?php if ($backupsColumnVisible): ?>
                                <td class="hide-mobile col-group-start" style="white-space: nowrap;">
                                    <?php echo poznoteFormatMb($row['backups_s3_bytes']); ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_backups_s3_mb'], $globalMaxBackupsS3Mb, $row['is_admin']); ?>
                                </td>
                            <?php endif; ?>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($storageRows)): ?>
                        <tr>
                            <td colspan="<?php echo 9 + ($s3ColumnVisible ? 1 : 0) + ($backupsColumnVisible ? 1 : 0); ?>" style="text-align:center;color:var(--text-muted,#999);">
                                <?php echo t_h('admin_tools.storage_stats.no_accounts', [], 'No accounts found.'); ?>
                            </td>
                        </tr>
                    <?php endif; ?>
                </tbody>
                <?php if (!empty($stats)): ?>
                <tfoot>
                    <tr>
                        <?php // Centred in the Account column rather than spanning
                              // ID+Account, so it lines up with the names above it.
                              // These totals cover every account, not just the
                              // rows on screen: they are summed before the
                              // search filter and the page slice. ?>
                        <td></td>
                        <td class="col-group-start" title="<?php echo t_h('admin_tools.storage_stats.table_total_row_hint', [], 'Across all accounts, not just this page'); ?>"><strong><?php echo t_h('admin_tools.storage_stats.table_total_row', [], 'Total'); ?></strong></td>
                        <td class="col-group-start"><strong><?php echo $totNotesActive; ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo $totNotesTrash; ?></strong></td>
                        <td><strong><?php echo $totNotesActive + $totNotesTrash; ?></strong></td>
                        <td class="hide-mobile col-group-start"><strong><?php echo poznoteFormatMb($totDbBytes); ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo poznoteFormatMb($totEntriesBytes); ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo poznoteFormatMb($totAttachmentBytes); ?></strong></td>
                        <td><strong><?php echo poznoteFormatMb($totBytes); ?></strong></td>
                        <?php if ($s3ColumnVisible): ?>
                            <td class="hide-mobile col-group-start"><strong><?php echo poznoteFormatMb($totAttachmentS3Bytes); ?></strong></td>
                        <?php endif; ?>
                        <?php if ($backupsColumnVisible): ?>
                            <td class="hide-mobile col-group-start"><strong><?php echo poznoteFormatMb($totBackupsS3Bytes); ?></strong></td>
                        <?php endif; ?>
                    </tr>
                </tfoot>
                <?php endif; ?>
            </table>
        </div>

        <?php // The pager always renders: even on a single page it carries the
              // page-size selector, which is the only way back to a smaller
              // size once "All" has been picked. ?>
        <div class="users-pager">
            <?php if ($storagePage > 1): ?>
                <a href="<?php echo htmlspecialchars(storagePageUrl($storagePage - 1, $storageSearch), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
                    <?php echo t_h('admin_tools.storage_stats.pager.previous', [], 'Previous'); ?>
                </a>
            <?php endif; ?>
            <span><?php echo t_h('admin_tools.storage_stats.pager.status', ['page' => $storagePage, 'pages' => $storageTotalPages, 'total' => $storageTotal], 'Page {{page}} of {{pages}}, {{total}} accounts'); ?></span>
            <?php if ($storagePage < $storageTotalPages): ?>
                <a href="<?php echo htmlspecialchars(storagePageUrl($storagePage + 1, $storageSearch), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
                    <?php echo t_h('admin_tools.storage_stats.pager.next', [], 'Next'); ?>
                </a>
            <?php endif; ?>

            <?php // A GET form so the choice works without JavaScript; the
                  // onchange below just saves the extra click on Go. Changing
                  // the size drops 'page' on purpose: the old page number
                  // points nowhere in a re-sliced list. ?>
            <form method="get" action="" class="users-pager-size">
                <?php if ($storageSearch !== ''): ?>
                    <input type="hidden" name="q" value="<?php echo htmlspecialchars($storageSearch, ENT_QUOTES, 'UTF-8'); ?>">
                <?php endif; ?>
                <label for="storage-per-page"><?php echo t_h('admin_tools.storage_stats.pager.per_page', [], 'Per page'); ?></label>
                <select id="storage-per-page" name="per_page" onchange="this.form.submit()">
                    <?php foreach ($storagePageSizeOptions as $sizeOption): ?>
                        <option value="<?php echo $sizeOption; ?>"<?php echo $sizeOption === $storagePageSize ? ' selected' : ''; ?>>
                            <?php echo htmlspecialchars(storagePageSizeLabel($sizeOption), ENT_QUOTES, 'UTF-8'); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <noscript><button type="submit" class="btn btn-secondary"><?php echo t_h('common.ok', [], 'OK'); ?></button></noscript>
            </form>
        </div>
    </div>
</div>

<!-- Per-user quota edit modal -->
<div class="modal" id="quotaModal">
    <div class="modal-content">
        <h2 class="modal-title"><?php echo t_h('modals.user_quotas.title', [], 'User quotas'); ?>&nbsp;: <span id="quota_title_user"></span></h2>
        <p class="quota-modal-description"><?php echo t_h('admin_tools.storage_stats.quota_modal_description', [], 'Leave a field empty to use the global setting. 0 means unlimited. These values override the global user quotas.'); ?></p>
        <input type="hidden" id="quota_user_id" value="">
        <div class="form-group">
            <label for="quota_max_notes" id="quota_max_notes_label" data-template="<?php echo t_h('admin_tools.storage_stats.quota_max_notes_for', [], 'Max notes for {{user}}'); ?>"></label>
            <input type="number" id="quota_max_notes" min="0" max="100000000" step="1" placeholder="0">
        </div>
        <div class="form-group">
            <label for="quota_max_storage" id="quota_max_storage_label" data-template="<?php echo t_h('admin_tools.storage_stats.quota_max_storage_for', [], 'Max local storage for {{user}} (MB)'); ?>"></label>
            <input type="number" id="quota_max_storage" min="0" max="100000000" step="1" placeholder="0">
        </div>
        <?php if ($s3ColumnVisible): ?>
        <div class="form-group">
            <label for="quota_max_storage_s3" id="quota_max_storage_s3_label" data-template="<?php echo t_h('admin_tools.storage_stats.quota_max_storage_s3_for', [], 'Max S3 attachments storage for {{user}} (MB)'); ?>"></label>
            <input type="number" id="quota_max_storage_s3" min="0" max="100000000" step="1" placeholder="0">
        </div>
        <?php endif; ?>
        <?php if ($backupsColumnVisible): ?>
        <div class="form-group">
            <label for="quota_max_backups_s3" id="quota_max_backups_s3_label" data-template="<?php echo t_h('admin_tools.storage_stats.quota_max_backups_s3_for', [], 'Max S3 backups storage for {{user}} (MB)'); ?>"></label>
            <input type="number" id="quota_max_backups_s3" min="0" max="100000000" step="1" placeholder="0">
        </div>
        <?php endif; ?>
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeQuotaModal()"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
            <button type="button" class="btn btn-primary" onclick="saveQuota()"><?php echo t_h('common.save', [], 'Save'); ?></button>
        </div>
    </div>
</div>

<!-- Admin rows have no editable quota: explain the exemption instead -->
<div class="modal" id="quotaAdminModal">
    <div class="modal-content">
        <h2 class="modal-title"><?php echo t_h('modals.user_quotas.title', [], 'User quotas'); ?>&nbsp;: <span id="quota_admin_user"></span></h2>
        <p class="quota-modal-description"><?php echo t_h('admin_tools.storage_stats.quota_admin_exempt_message', [], 'Quotas do not apply to administrator accounts: their notes and storage are unlimited.'); ?></p>
        <div class="form-actions">
            <button type="button" class="btn btn-primary" onclick="closeQuotaAdminModal()"><?php echo t_h('common.close', [], 'Close'); ?></button>
        </div>
    </div>
</div>

<script>
function openQuotaAdminModal(btn) {
    document.getElementById('quota_admin_user').textContent = btn.dataset.username || '';
    document.getElementById('quotaAdminModal').classList.add('active');
}

function closeQuotaAdminModal() {
    document.getElementById('quotaAdminModal').classList.remove('active');
}

function openQuotaModal(btn) {
    document.getElementById('quota_user_id').value = btn.dataset.userId;
    document.getElementById('quota_title_user').textContent = btn.dataset.username;
    ['quota_max_notes_label', 'quota_max_storage_label', 'quota_max_storage_s3_label', 'quota_max_backups_s3_label'].forEach(function (id) {
        var label = document.getElementById(id);
        if (label) label.textContent = label.dataset.template.replace('{{user}}', btn.dataset.username);
    });
    document.getElementById('quota_max_notes').value = btn.dataset.quotaNotes || '';
    document.getElementById('quota_max_storage').value = btn.dataset.quotaStorage || '';
    var s3Input = document.getElementById('quota_max_storage_s3');
    if (s3Input) s3Input.value = btn.dataset.quotaStorageS3 || '';
    var backupsInput = document.getElementById('quota_max_backups_s3');
    if (backupsInput) backupsInput.value = btn.dataset.quotaBackupsS3 || '';
    document.getElementById('quotaModal').classList.add('active');
}

function closeQuotaModal() {
    document.getElementById('quotaModal').classList.remove('active');
}

/**
 * Read a quota input: null when empty (inherit the global setting),
 * false when invalid, the integer value otherwise.
 */
function readQuotaInput(id) {
    var raw = document.getElementById(id).value.trim();
    if (raw === '') return null;
    var value = parseInt(raw, 10);
    return (isNaN(value) || value < 0 || value > 100000000) ? false : value;
}

function saveQuota() {
    var userId = document.getElementById('quota_user_id').value;
    var notes = readQuotaInput('quota_max_notes');
    var storage = readQuotaInput('quota_max_storage');
    var hasS3Input = !!document.getElementById('quota_max_storage_s3');
    var storageS3 = hasS3Input ? readQuotaInput('quota_max_storage_s3') : null;
    var hasBackupsInput = !!document.getElementById('quota_max_backups_s3');
    var backupsS3 = hasBackupsInput ? readQuotaInput('quota_max_backups_s3') : null;

    if (notes === false || storage === false || storageS3 === false || backupsS3 === false) {
        alert(<?php echo json_encode(t('common.error', [], 'Error')); ?>);
        return;
    }

    var payload = { quota_max_notes: notes, quota_max_storage_mb: storage };
    if (hasS3Input) payload.quota_max_storage_s3_mb = storageS3;
    if (hasBackupsInput) payload.quota_max_backups_s3_mb = backupsS3;

    fetch('/api/v1/admin/users/' + encodeURIComponent(userId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data && data.error) {
            alert(data.error);
        } else {
            window.location.reload();
        }
    })
    .catch(function () {
        alert(<?php echo json_encode(t('common.error', [], 'Error')); ?>);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.quota-inline').forEach(function (btn) {
        btn.addEventListener('click', function () {
            // Admin rows have nothing to edit: say why rather than opening an
            // editor whose values would never apply.
            if (btn.classList.contains('quota-admin-exempt')) {
                openQuotaAdminModal(btn);
                return;
            }
            openQuotaModal(btn);
        });
    });
});
</script>
    <script src="../js/icon-sidebar-toggle.js?v=<?php echo $v; ?>"></script>
</body>
</html>
