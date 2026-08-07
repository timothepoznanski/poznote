<?php
/**
 * Storage Statistics (own account) — User Tool
 *
 * Shows the number of notes and disk space used by the currently active
 * account only. Unlike admin/storage-stats.php, this is available to every
 * user and never exposes other accounts.
 */

require_once __DIR__ . '/auth.php';
requireAuth();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/version_helper.php';
require_once __DIR__ . '/users/UserDataManager.php';
require_once __DIR__ . '/users/db_master.php';

$v             = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

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

$activeUserId = (int)(getCurrentUserId() ?? 0);
$manager      = new UserDataManager($activeUserId);
$sizes        = $manager->getStorageStats();

$activeProfile  = getUserProfileById($activeUserId);
$activeUsername = $activeProfile['username'] ?? '';

$notesActive = 0;
$notesTrash  = 0;
try {
    $notesActive = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 0")->fetchColumn();
    $notesTrash  = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 1")->fetchColumn();
} catch (Exception $e) {
    // Leave counts at 0 on error.
}

// S3 mode: split the attachments column like the admin page. Local is the
// on-disk directory; S3 is the recorded size of files absent from it (files
// not yet migrated stay in the local column).
require_once __DIR__ . '/storage/AttachmentStorage.php';
$s3ColumnVisible      = AttachmentStorage::isEnabled();
$attachmentLocalBytes = (int)$sizes['attachments'];
$attachmentS3Bytes    = 0;
if ($s3ColumnVisible) {
    $allRecordedBytes = 0;
    $attachmentsDir   = $manager->getUserAttachmentsPath();
    try {
        $attStmt = $con->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
        foreach ($attStmt as $attRow) {
            $list = json_decode($attRow['attachments'] ?? '', true);
            if (!is_array($list)) {
                continue;
            }
            foreach ($list as $attachment) {
                $bytes = max(0, (int)($attachment['file_size'] ?? 0));
                $allRecordedBytes += $bytes;
                $filename = (string)($attachment['filename'] ?? '');
                if ($filename !== '' && !file_exists($attachmentsDir . '/' . basename($filename))) {
                    $attachmentS3Bytes += $bytes;
                }
            }
        }
    } catch (Exception $e) {
        // Stats only: keep the zero/combined figures on error.
    }
    // getStorageStats() adds every recorded size on top of the directory
    // size in S3 mode: strip that to get the on-disk figure.
    $attachmentLocalBytes = max(0, $attachmentLocalBytes - $allRecordedBytes);
}

// Effective quotas for this account (global settings + per-user overrides).
// Admins are exempt from quotas.
$quotaIsAdmin  = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$quotaLimits   = poznoteGetUserQuotaLimits();
$quotaNotes    = $quotaLimits['max_notes'];
$quotaStorage  = (int)round($quotaLimits['max_storage_bytes'] / (1024 * 1024));

if ($quotaIsAdmin) {
    $quotaSentence = t_h('admin_tools.storage_stats.user_quota_admin_sentence', [], 'Quotas do not apply to administrator accounts.');
} elseif ($quotaNotes > 0 && $quotaStorage > 0) {
    $quotaSentence = t_h('admin_tools.storage_stats.user_quota_sentence_both', ['notes' => $quotaNotes, 'storage' => $quotaStorage], 'The administrator has limited this account to ' . $quotaNotes . ' notes and ' . $quotaStorage . ' MB of storage.');
} elseif ($quotaNotes > 0) {
    $quotaSentence = t_h('admin_tools.storage_stats.user_quota_sentence_notes', ['notes' => $quotaNotes], 'The administrator has limited this account to ' . $quotaNotes . ' notes. Storage is unlimited.');
} elseif ($quotaStorage > 0) {
    $quotaSentence = t_h('admin_tools.storage_stats.user_quota_sentence_storage', ['storage' => $quotaStorage], 'The administrator has limited this account to ' . $quotaStorage . ' MB of storage. The number of notes is unlimited.');
} else {
    $quotaSentence = t_h('admin_tools.storage_stats.user_quota_sentence_none', [], 'No quota is set for this account: notes and storage are unlimited.');
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('admin_tools.storage_stats.title', [], 'Storage statistics'); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <script src="js/theme-manager.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="css/admin-tools.css?v=<?php echo $v; ?>">
    <style>
    /* Same sizes as the admin storage-stats page: slightly larger column
       headers, smaller cell values than the admin-tools defaults. */
    .results-table th {
        font-size: 0.78rem;
    }
    .results-table td {
        font-size: 0.85rem;
    }
    /* Centered over their (mostly numeric) columns, like the admin page. */
    .results-table th,
    .results-table td {
        text-align: center;
    }
    /* The S3 build has 7 columns, which need more than the 700px .dr-page
       wrapper. Widen the page for this table and let it scroll on narrow
       screens rather than overflowing the viewport. */
    .dr-page {
        max-width: 900px;
    }
    .results-container {
        overflow-x: auto;
    }
    .user-quota-line {
        margin-top: 12px;
        font-size: 0.85rem;
        text-align: center;
    }
    </style>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="index.php" class="btn btn-secondary">
                <i class="lucide lucide-sticky-note" style="margin-right:5px;"></i><?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
            </a>
            <a href="settings.php" class="btn btn-secondary">
                <i class="lucide lucide-settings" style="margin-right:5px;"></i><?php echo t_h('settings.title', [], 'Settings'); ?>
            </a>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <p><?php
                $userDesc = t_h('admin_tools.storage_stats.user_description', [], 'Number of notes and disk space used by your account.');
                if ($activeUsername !== '') {
                    // Drop a trailing sentence stop (ASCII or ideographic) so the
                    // account name lands before the final punctuation.
                    $trimmed = preg_replace('/[.。]\s*$/u', '', $userDesc);
                    echo $trimmed . ' (' . htmlspecialchars($activeUsername, ENT_QUOTES) . ').';
                } else {
                    echo $userDesc;
                }
            ?></p>
        </div>

        <div class="results-container">
            <table class="results-table">
                <thead>
                    <tr>
                        <th><?php echo t_h('admin_tools.storage_stats.table_notes', [], 'Notes'); ?></th>
                        <th><?php echo t_h('admin_tools.storage_stats.table_trash', [], 'Trash'); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files (MB)')); ?></th>
                        <?php if ($s3ColumnVisible): ?>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_local', [], 'Attachments local (MB)')); ?></th>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)')); ?></th>
                        <?php else: ?>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')); ?></th>
                        <?php endif; ?>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total (MB)')); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><span class="status-badge status-clean"><?php echo $notesActive; ?></span></td>
                        <td><?php echo $notesTrash; ?></td>
                        <td><?php echo poznoteFormatMb((int)$sizes['database']); ?></td>
                        <td><?php echo poznoteFormatMb((int)$sizes['entries']); ?></td>
                        <td><?php echo poznoteFormatMb($attachmentLocalBytes); ?></td>
                        <?php if ($s3ColumnVisible): ?>
                            <td><?php echo poznoteFormatMb($attachmentS3Bytes); ?></td>
                        <?php endif; ?>
                        <td><strong><?php
                            // Sum of the displayed columns so the row adds up.
                            // Excludes backups/snapshots/backgrounds, which are not
                            // part of the backup export either.
                            $displayedTotal = (int)$sizes['database'] + (int)$sizes['entries'] + $attachmentLocalBytes + $attachmentS3Bytes;
                            echo poznoteFormatMb($displayedTotal);
                        ?></strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <p class="user-quota-line"><?php echo $quotaSentence; ?></p>
    </div>
</div>
</body>
</html>
