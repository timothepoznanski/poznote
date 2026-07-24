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

function collectStorageStats(): array {
    $dataRoot = dirname(SQLITE_DATABASE, 2);
    $usersDir = $dataRoot . '/users';

    if (!is_dir($usersDir)) {
        $dataRoot = __DIR__ . '/../data';
        $usersDir = $dataRoot . '/users';
    }

    // Map user id => username for readable labels.
    $names = [];
    foreach (getAllUserProfiles() as $profile) {
        $names[(int)$profile['id']] = $profile['username'];
    }

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

        $row = [
            'user_id'          => (int)$userId,
            'username'         => $names[(int)$userId] ?? null,
            'notes_active'     => 0,
            'notes_trash'      => 0,
            'db_bytes'         => 0,
            'entries_bytes'    => 0,
            'attachments_bytes'=> 0,
            'total_bytes'      => 0,
            'error'            => null,
        ];

        // Database size (includes -wal/-shal companion files under the dir).
        $row['db_bytes']          = poznoteDirSize($databaseDir);
        $row['entries_bytes']     = poznoteDirSize($entriesDir);
        $row['attachments_bytes'] = poznoteDirSize($attachmentsDir);
        $row['total_bytes']       = poznoteDirSize($userPath);

        if (file_exists($dbPath)) {
            try {
                $db = new PDO("sqlite:$dbPath");
                $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $row['notes_active'] = (int)$db->query("SELECT COUNT(*) FROM entries WHERE trash = 0")->fetchColumn();
                $row['notes_trash']  = (int)$db->query("SELECT COUNT(*) FROM entries WHERE trash = 1")->fetchColumn();
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

$totNotesActive     = 0;
$totNotesTrash      = 0;
$totDbBytes         = 0;
$totEntriesBytes    = 0;
$totAttachmentBytes = 0;
$totBytes           = 0;
foreach ($stats as $r) {
    $totNotesActive     += $r['notes_active'];
    $totNotesTrash      += $r['notes_trash'];
    $totDbBytes         += $r['db_bytes'];
    $totEntriesBytes    += $r['entries_bytes'];
    $totAttachmentBytes += $r['attachments_bytes'];
    $totBytes           += $r['total_bytes'];
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
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../settings.php" class="btn btn-secondary"><?php echo t_h('settings.title', [], 'Settings'); ?></a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <h1><?php echo t_h('admin_tools.storage_stats.title', [], 'Storage statistics'); ?></h1>
            <p><?php echo t_h('admin_tools.storage_stats.description', [], 'Number of notes and disk space used by each account.'); ?></p>
        </div>

        <div class="results-container">
            <table class="results-table">
                <thead>
                    <tr>
                        <th><?php echo t_h('admin_tools.storage_stats.table_account', [], 'Account'); ?></th>
                        <th><?php echo t_h('admin_tools.storage_stats.table_notes', [], 'Notes'); ?></th>
                        <th class="hide-mobile"><?php echo t_h('admin_tools.storage_stats.table_trash', [], 'Trash'); ?></th>
                        <th class="hide-mobile"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database (MB)')); ?></th>
                        <th class="hide-mobile"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files (MB)')); ?></th>
                        <th class="hide-mobile"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($stats as $row): ?>
                        <tr>
                            <td style="white-space: nowrap;">
                                <?php if ($row['username'] !== null): ?>
                                    <strong><?php echo htmlspecialchars($row['username'], ENT_QUOTES); ?></strong> <span style="color: var(--text-muted, #999); font-size: 0.8em;">(id&nbsp;<?php echo $row['user_id']; ?>)</span>
                                <?php else: ?>
                                    <strong style="font-size: 0.8em;">(id&nbsp;<?php echo $row['user_id']; ?>)</strong>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if ($row['error']): ?>
                                    <span style="color:red" title="<?php echo htmlspecialchars($row['error'], ENT_QUOTES); ?>">—</span>
                                <?php else: ?>
                                    <span class="status-badge status-clean"><?php echo $row['notes_active']; ?></span>
                                <?php endif; ?>
                            </td>
                            <td class="hide-mobile"><?php echo $row['notes_trash']; ?></td>
                            <td class="hide-mobile"><?php echo poznoteFormatMb($row['db_bytes']); ?></td>
                            <td class="hide-mobile"><?php echo poznoteFormatMb($row['entries_bytes']); ?></td>
                            <td class="hide-mobile"><?php echo poznoteFormatMb($row['attachments_bytes']); ?></td>
                            <td><strong><?php echo poznoteFormatMb($row['total_bytes']); ?></strong></td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($stats)): ?>
                        <tr>
                            <td colspan="7" style="text-align:center;color:var(--text-muted,#999);">
                                <?php echo t_h('admin_tools.storage_stats.no_accounts', [], 'No accounts found.'); ?>
                            </td>
                        </tr>
                    <?php endif; ?>
                </tbody>
                <?php if (!empty($stats)): ?>
                <tfoot>
                    <tr>
                        <td><strong><?php echo t_h('admin_tools.storage_stats.table_total_row', [], 'Total'); ?></strong></td>
                        <td><strong><?php echo $totNotesActive; ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo $totNotesTrash; ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo poznoteFormatMb($totDbBytes); ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo poznoteFormatMb($totEntriesBytes); ?></strong></td>
                        <td class="hide-mobile"><strong><?php echo poznoteFormatMb($totAttachmentBytes); ?></strong></td>
                        <td><strong><?php echo poznoteFormatMb($totBytes); ?></strong></td>
                    </tr>
                </tfoot>
                <?php endif; ?>
            </table>
        </div>
    </div>
</div>
</body>
</html>
