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
 * Render a sortable column header button for the stats table.
 * Expects an already HTML-safe label. $extraClass is a space-separated list
 * of the table's own classes ("hide-mobile", "col-group-start").
 */
function poznoteSortHeader(string $escapedLabel, string $type, string $extraClass = ''): string {
    $allowed = array_intersect(preg_split('/\s+/', trim($extraClass), -1, PREG_SPLIT_NO_EMPTY) ?: [], ['hide-mobile', 'col-group-start']);
    $class = $allowed ? ' class="' . implode(' ', $allowed) . '"' : '';
    return '<th data-sort-type="' . $type . '"' . $class . '>'
        . '<button type="button" class="users-sort-link storage-sort-btn">'
        . $escapedLabel
        . '<i class="lucide lucide-chevron-down users-sort-icon"></i></button></th>';
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
                if (AttachmentStorage::isEnabled()) {
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

// Show a dedicated S3 column when attachments are stored in a bucket
require_once __DIR__ . '/../storage/AttachmentStorage.php';
$s3ColumnVisible = AttachmentStorage::isEnabled();

// Same for backups, which target their own (independent) bucket
require_once __DIR__ . '/../S3BackupService.php';
$backupsColumnVisible = S3BackupService::isEnabled();

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
    /* Scroll inside the container on windows narrower than the table
       (admin-tools.css only enables this under 640px). The container is
       height-capped by JS to the viewport so the horizontal scrollbar is
       always on screen; rows scroll vertically inside it instead. */
    .table-scroll {
        overflow: auto;
        margin-top: 20px;
        /* Keep the rounding, drop the frame: the container cuts mid-row once
           the row cap kicks in, so the corners still need clipping. */
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
    }
    /* Keep headers readable while rows scroll under them. The bottom border
       is a box-shadow because collapsed-table borders don't stick. */
    .results-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        box-shadow: 0 1px 0 var(--border-color, #e5e7eb);
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
    .results-table th .storage-sort-btn {
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
    }
    /* Bold the header of the column the table is currently sorted on. Needs to
       live here because the `font: inherit` shorthand above resets weight. */
    .results-table th .storage-sort-btn.users-sort-active {
        font-weight: 700;
    }
    /* ...and every value in that column too. */
    .results-table td.sorted-column-cell {
        font-weight: 700;
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
     * Filter the stats table rows against the search input value
     */
    function initStorageStatsFilter() {
        const input = document.getElementById('storage-filter-input');
        if (!input) return;

        const wrapper = input.closest('.home-search-wrapper');
        const clearBtn = document.getElementById('storage-filter-clear');

        input.addEventListener('input', function () {
            const query = this.value.trim().toLowerCase();
            if (wrapper) {
                wrapper.classList.toggle('has-value', this.value !== '');
            }
            document.querySelectorAll('.results-table tbody tr').forEach(function (row) {
                row.classList.toggle('filter-hidden', query !== '' && !row.textContent.toLowerCase().includes(query));
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && this.value !== '') {
                this.value = '';
                this.dispatchEvent(new Event('input'));
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                input.dispatchEvent(new Event('input'));
                input.focus();
            });
        }
    }

    /**
     * Make every column header sort the tbody rows (click toggles asc/desc).
     * Cells carry their raw value in data-sort; the tfoot totals stay in place.
     */
    function initStorageStatsSort() {
        const table = document.querySelector('.results-table');
        const tbody = table ? table.querySelector('tbody') : null;
        if (!tbody || tbody.querySelector('td[colspan]')) return;

        let activeButton = null;
        let activeDir = 'asc';

        table.querySelectorAll('th .storage-sort-btn').forEach(function (button) {
            button.addEventListener('click', function () {
                const th = button.closest('th');
                const columnIndex = th.cellIndex;
                const isNumeric = th.dataset.sortType === 'num';
                activeDir = (button === activeButton && activeDir === 'asc') ? 'desc' : 'asc';
                activeButton = button;

                const rows = Array.from(tbody.rows);
                rows.sort(function (a, b) {
                    const va = a.cells[columnIndex].dataset.sort;
                    const vb = b.cells[columnIndex].dataset.sort;
                    const cmp = isNumeric ? (Number(va) - Number(vb)) : va.localeCompare(vb);
                    return activeDir === 'asc' ? cmp : -cmp;
                });
                rows.forEach(function (row) { tbody.appendChild(row); });

                table.querySelectorAll('th .storage-sort-btn').forEach(function (other) {
                    other.classList.toggle('users-sort-active', other === button);
                    const icon = other.querySelector('.users-sort-icon');
                    icon.classList.toggle('lucide-chevron-up', other === button && activeDir === 'asc');
                    icon.classList.toggle('lucide-chevron-down', other !== button || activeDir === 'desc');
                });

                // Bold every value in the sorted column, not just its header.
                Array.from(tbody.rows).forEach(function (row) {
                    Array.from(row.cells).forEach(function (cell, index) {
                        cell.classList.toggle('sorted-column-cell', index === columnIndex);
                    });
                });
            });
        });
    }

    /* Show about ten rows at a time; the rest scroll inside the container.
       The height is measured from a real row rather than hardcoded so it
       follows the font size and theme. Still capped to the viewport, so the
       horizontal scrollbar never ends up below the fold on short windows. */
    const STORAGE_TABLE_VISIBLE_ROWS = 10;

    function sizeStorageTableScroll() {
        const scroller = document.querySelector('.table-scroll');
        if (!scroller) return;

        const top = scroller.getBoundingClientRect().top + window.scrollY;
        const viewportCap = Math.max(240, window.innerHeight - top - 24);

        const head = scroller.querySelector('thead');
        const row = scroller.querySelector('tbody tr');
        let rowsCap = viewportCap;
        if (head && row) {
            // +8px so the 11th row is clipped mid-height, which reads as
            // "there is more below" instead of looking like a clean end.
            rowsCap = head.offsetHeight + row.offsetHeight * STORAGE_TABLE_VISIBLE_ROWS + 8;
        }

        scroller.style.maxHeight = Math.min(viewportCap, rowsCap) + 'px';
    }

    document.addEventListener('DOMContentLoaded', function () {
        initStorageStatsFilter();
        initStorageStatsSort();
        sizeStorageTableScroll();
    });
    window.addEventListener('resize', sizeStorageTableScroll);
    </script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary">
                <i class="lucide lucide-sticky-note" style="margin-right:5px;"></i><?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
            </a>
            <a href="../settings.php" class="btn btn-secondary">
                <i class="lucide lucide-settings" style="margin-right:5px;"></i><?php echo t_h('settings.title', [], 'Settings'); ?>
            </a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <p><?php echo t_h('admin_tools.storage_stats.description', [], 'Number of notes and disk space used by each account.'); ?></p>
        </div>

        <div class="home-search-container">
            <div class="home-search-wrapper">
                <i class="lucide lucide-search home-search-icon"></i>
                <input type="text" id="storage-filter-input" class="home-search-input" placeholder="<?php echo t_h('admin_tools.storage_stats.filter_placeholder', [], 'Filter accounts...'); ?>" autocomplete="off">
                <button type="button" id="storage-filter-clear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
        </div>

        <div class="results-container table-scroll">
            <table class="results-table">
                <thead>
                    <tr>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_id', [], 'ID'), 'num'); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_account', [], 'Account'), 'text', 'col-group-start'); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_notes', [], 'Notes'), 'num', 'col-group-start'); ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_trash', [], 'Trash'), 'num', 'hide-mobile'); ?>
                        <?php // The note quota counts active + trashed notes, so its
                              // total sits after both, carrying the "/ 500" suffix. ?>
                        <?php echo poznoteSortHeader(t_h('admin_tools.storage_stats.table_notes_total', [], 'Total notes'), 'num'); ?>
                        <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database (MB)')), 'num', 'hide-mobile col-group-start'); ?>
                        <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files (MB)')), 'num', 'hide-mobile'); ?>
                        <?php if ($s3ColumnVisible): ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_local', [], 'Attachments local (MB)')), 'num', 'hide-mobile'); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')), 'num'); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)')), 'num', 'hide-mobile col-group-start'); ?>
                        <?php else: ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')), 'num', 'hide-mobile'); ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')), 'num'); ?>
                        <?php endif; ?>
                        <?php if ($backupsColumnVisible): ?>
                            <?php echo poznoteSortHeader(poznoteGlueUnit(t_h('admin_tools.storage_stats.table_backups_s3', [], 'Backups S3 (MB)')), 'num', 'hide-mobile col-group-start'); ?>
                        <?php endif; ?>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($stats as $row): ?>
                        <tr>
                            <td data-sort="<?php echo $row['user_id']; ?>"><?php echo $row['user_id']; ?></td>
                            <td class="col-group-start" style="white-space: nowrap;" data-sort="<?php echo htmlspecialchars(mb_strtolower($row['username'] ?? ''), ENT_QUOTES); ?>">
                                <?php if ($row['username'] !== null): ?>
                                    <?php echo htmlspecialchars($row['username'], ENT_QUOTES); ?>
                                <?php else: ?>
                                    <span style="color: var(--text-muted, #999);">—</span>
                                <?php endif; ?>
                            </td>
                            <td class="col-group-start" data-sort="<?php echo $row['error'] ? -1 : $row['notes_active']; ?>">
                                <?php if ($row['error']): ?>
                                    <span style="color:red" title="<?php echo htmlspecialchars($row['error'], ENT_QUOTES); ?>">—</span>
                                <?php else: ?>
                                    <?php echo $row['notes_active']; ?>
                                <?php endif; ?>
                            </td>
                            <td class="hide-mobile" data-sort="<?php echo $row['notes_trash']; ?>"><?php echo $row['notes_trash']; ?></td>
                            <?php // Trashed notes count against the quota too: they still
                                  // exist and can be restored. ?>
                            <td style="white-space: nowrap;" data-sort="<?php echo $row['error'] ? -1 : ($row['notes_active'] + $row['notes_trash']); ?>">
                                <?php if ($row['error']): ?>
                                    <span style="color:red">—</span>
                                <?php else: ?>
                                    <?php echo $row['notes_active'] + $row['notes_trash']; ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_notes'], $globalMaxNotes, $row['is_admin']); ?>
                                <?php endif; ?>
                            </td>
                            <td class="hide-mobile col-group-start" data-sort="<?php echo $row['db_bytes']; ?>"><?php echo poznoteFormatMb($row['db_bytes']); ?></td>
                            <td class="hide-mobile" data-sort="<?php echo $row['entries_bytes']; ?>"><?php echo poznoteFormatMb($row['entries_bytes']); ?></td>
                            <td class="hide-mobile" data-sort="<?php echo $row['attachments_bytes']; ?>"><?php echo poznoteFormatMb($row['attachments_bytes']); ?></td>
                            <?php // The local storage quota covers the whole account perimeter
                                  // (database + files + attachments), which is what Total sums. ?>
                            <td style="white-space: nowrap;" data-sort="<?php echo $row['total_bytes']; ?>">
                                <?php echo poznoteFormatMb($row['total_bytes']); ?>
                                <?php echo poznoteQuotaSuffix($row, $row['quota_max_storage_mb'], $globalMaxStorageMb, $row['is_admin']); ?>
                            </td>
                            <?php if ($s3ColumnVisible): ?>
                                <td class="hide-mobile col-group-start" style="white-space: nowrap;" data-sort="<?php echo $row['attachments_s3_bytes']; ?>">
                                    <?php echo poznoteFormatMb($row['attachments_s3_bytes']); ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_storage_s3_mb'], $globalMaxStorageS3Mb, $row['is_admin']); ?>
                                </td>
                            <?php endif; ?>
                            <?php if ($backupsColumnVisible): ?>
                                <td class="hide-mobile col-group-start" style="white-space: nowrap;" data-sort="<?php echo $row['backups_s3_bytes']; ?>">
                                    <?php echo poznoteFormatMb($row['backups_s3_bytes']); ?>
                                    <?php echo poznoteQuotaSuffix($row, $row['quota_max_backups_s3_mb'], $globalMaxBackupsS3Mb, $row['is_admin']); ?>
                                </td>
                            <?php endif; ?>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($stats)): ?>
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
                              // ID+Account, so it lines up with the names above it. ?>
                        <td></td>
                        <td class="col-group-start"><strong><?php echo t_h('admin_tools.storage_stats.table_total_row', [], 'Total'); ?></strong></td>
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
</body>
</html>
