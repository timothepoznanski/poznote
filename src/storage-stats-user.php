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
$s3ColumnVisible      = AttachmentStorage::isConfigured();
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

// Backups live in their own bucket, independent from the attachments one:
// show the column only when that feature is configured. Real usage is read
// from the bucket, scoped to this account's own prefix.
require_once __DIR__ . '/S3BackupService.php';
$backupsColumnVisible = S3BackupService::isEnabled();
$backupsS3Bytes       = $backupsColumnVisible ? S3BackupService::usageBytesForUser($activeUserId) : 0;

// Effective quotas for this account (global settings + per-user overrides),
// shown as a "/ limit" suffix next to the figure each one caps.
// Admins are exempt, so their quotas all read as unlimited.
$quotaIsAdmin    = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
$quotaLimits     = poznoteGetUserQuotaLimits();
$quotaNotes      = $quotaIsAdmin ? 0 : $quotaLimits['max_notes'];
$quotaStorage    = $quotaIsAdmin ? 0 : (int)round($quotaLimits['max_storage_bytes'] / (1024 * 1024));
$quotaStorageS3  = $quotaIsAdmin ? 0 : (int)round($quotaLimits['max_storage_s3_bytes'] / (1024 * 1024));
$quotaBackupsS3  = $quotaIsAdmin ? 0 : (int)round($quotaLimits['max_backups_s3_bytes'] / (1024 * 1024));

/**
 * The "/ 500" quota suffix appended to a usage figure. Read-only here: unlike
 * the admin page, a user cannot edit their own limits.
 */
function poznoteUserQuotaSuffix(int $value): string {
    return ' <span class="quota-inline">/&nbsp;' . ($value > 0 ? (string)$value : '∞') . '</span>';
}

/**
 * CSS class colouring a usage figure against its quota: orange from 50% of
 * the limit, red from 80%. Empty when the quota is 0 (unlimited, including
 * exempt admins) or below the first threshold. $used must be in the same
 * unit as the limit (count for notes, MB for storage figures).
 */
function poznoteUserQuotaLevelClass(float $used, int $limit): string {
    if ($limit <= 0) {
        return '';
    }
    $ratio = $used / $limit;
    if ($ratio >= 0.8) {
        return 'quota-level-danger';
    }
    if ($ratio >= 0.5) {
        return 'quota-level-warn';
    }
    return '';
}

// Local columns only, matching the admin page and the local storage quota:
// S3 attachments have their own column and their own quota; backups,
// snapshots and backgrounds are excluded as well.
$displayedTotalBytes = (int)$sizes['database'] + (int)$sizes['entries'] + $attachmentLocalBytes;
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
    <link rel="stylesheet" href="css/fonts.css?v=<?php echo $v; ?>">
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
    <link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/attachments/usage-notice.css?v=<?php echo $v; ?>">
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
    /* With S3 attachments and backups enabled the table reaches 8 columns,
       far past the 700px .dr-page wrapper. Let the page take the window and
       the table shrink-fit and centre inside it, so no column is clipped by
       a fixed guess; narrow screens scroll the container instead. */
    .dr-page {
        max-width: none;
    }
    .results-container {
        overflow-x: auto;
    }
    .results-table {
        width: auto;
        margin-left: auto;
        margin-right: auto;
    }
    /* Rule separating the column groups: note counts, trash, local storage,
       S3 attachments, S3 backups. It sits on the column that opens each
       group, so it lands correctly whichever S3 features are enabled. */
    .results-table th.col-group-start,
    .results-table td.col-group-start {
        border-left: 2px solid var(--border-color, #e5e7eb);
    }
    /* "/ 500" suffix appended to the usage figure it limits, in the same
       colour and weight as that figure so the pair reads as one value. */
    .quota-inline {
        font-weight: normal;
        color: inherit;
    }
    /* Account name inside the description: emphasised, and kept on one line. */
    .storage-user-name {
        font-weight: 600;
        white-space: nowrap;
    }
    /* Help icon on the local attachments figure when S3 storage is on.
       No vertical-align override: lucide.css's -0.125em keeps the icon on
       the text baseline. */
    .storage-local-help {
        font-size: 0.85em;
        opacity: 0.6;
        cursor: help;
        margin-left: 2px;
    }
    /* Instant tooltip for the help icon, fixed-position so the scrollable
       table container cannot clip it. */
    .storage-help-tooltip {
        position: fixed;
        z-index: 1000;
        max-width: 320px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #1f2937;
        color: #f9fafb;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 0.95rem;
        line-height: 1.45;
        text-align: left;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        pointer-events: none;
    }
    /* Centred like the rest of the hero text on this page. */
    .attachment-usage-notice {
        justify-content: center;
    }
    </style>
</head>
<body class="has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php include 'icon_sidebar.php'; ?>
<div class="admin-container">
<h1 class="poznote-page-title"><i class="lucide lucide-pie-chart"></i> <?php echo t_h('settings.cards.storage_stats_user', [], 'User Storage statistics'); ?></h1>

    <div class="admin-header">
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <p><?php
                $userDesc = t_h('admin_tools.storage_stats.user_description', [], 'Number of notes and disk space used by your account.');
                if ($activeUsername !== '') {
                    // Drop the translation's trailing sentence stop (ASCII or
                    // ideographic): the account name ends the line, unpunctuated.
                    $trimmed = preg_replace('/[.。]\s*$/u', '', $userDesc);
                    echo $trimmed . ' <span class="storage-user-name">' . htmlspecialchars($activeUsername, ENT_QUOTES) . '</span>';
                } else {
                    echo $userDesc;
                }
            ?></p>
            <?php if (poznoteSaasNoticesEnabled()): ?>
            <div class="attachment-usage-notice">
                <i class="lucide lucide-alert-triangle"></i>
                <span><?php echo t_h('attachments.page.note_taking_notice', [], 'Keep in mind that Poznote is a note-taking app, not a photo or video storage service: large media files fill up your storage space very quickly.'); ?></span>
            </div>
            <?php endif; ?>
        </div>

        <div class="results-container">
            <table class="results-table">
                <thead>
                    <tr>
                        <th><?php echo t_h('admin_tools.storage_stats.table_notes', [], 'Notes'); ?></th>
                        <th><?php echo t_h('admin_tools.storage_stats.table_trash', [], 'Trash'); ?></th>
                        <?php // The note quota counts active + trashed notes, so its
                              // total sits after both, carrying the "/ 500" suffix. ?>
                        <th><?php echo t_h('admin_tools.storage_stats.table_notes_total', [], 'Total notes'); ?></th>
                        <th class="col-group-start"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database local (MB)')); ?></th>
                        <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files local (MB)')); ?></th>
                        <?php if ($s3ColumnVisible): ?>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_local', [], 'Attachments local (MB)')); ?></th>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total local (MB)')); ?></th>
                            <th class="col-group-start"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)')); ?></th>
                        <?php else: ?>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')); ?></th>
                            <th><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total local (MB)')); ?></th>
                        <?php endif; ?>
                        <?php if ($backupsColumnVisible): ?>
                            <th class="col-group-start"><?php echo poznoteGlueUnit(t_h('admin_tools.storage_stats.table_backups_s3', [], 'Backups S3 (MB)')); ?></th>
                        <?php endif; ?>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><?php echo $notesActive; ?></td>
                        <td><?php echo $notesTrash; ?></td>
                        <?php // Trashed notes count against the quota too: they still
                              // exist and can be restored. ?>
                        <td style="white-space: nowrap;" class="<?php echo poznoteUserQuotaLevelClass($notesActive + $notesTrash, $quotaNotes); ?>"><?php echo ($notesActive + $notesTrash) . poznoteUserQuotaSuffix($quotaNotes); ?></td>
                        <td class="col-group-start" style="white-space: nowrap;"><?php echo poznoteFormatMb((int)$sizes['database']); ?> <i class="lucide lucide-help-circle storage-local-help" data-tooltip="<?php echo t_h('admin_tools.storage_stats.db_help', [], 'The database stores your settings and the raw text of your notes, used for fast search.'); ?>"></i></td>
                        <td style="white-space: nowrap;"><?php echo poznoteFormatMb((int)$sizes['entries']); ?> <i class="lucide lucide-help-circle storage-local-help" data-tooltip="<?php echo t_h('admin_tools.storage_stats.files_help', [], 'The files are the contents of your notes, in HTML or Markdown format.'); ?>"></i></td>
                        <td style="white-space: nowrap;"><?php echo poznoteFormatMb($attachmentLocalBytes); ?><?php if (AttachmentStorage::isEnabled()): ?> <i class="lucide lucide-help-circle storage-local-help" data-tooltip="<?php echo t_h('admin_tools.storage_stats.user_s3_notice', [], 'Attachments are stored in S3 storage rather than locally, as configured by the administrator.'); ?>"></i><?php endif; ?></td>
                        <td style="white-space: nowrap;" class="<?php echo poznoteUserQuotaLevelClass($displayedTotalBytes / 1048576, $quotaStorage); ?>"><?php echo poznoteFormatMb($displayedTotalBytes) . poznoteUserQuotaSuffix($quotaStorage); ?></td>
                        <?php if ($s3ColumnVisible): ?>
                            <td class="col-group-start <?php echo poznoteUserQuotaLevelClass($attachmentS3Bytes / 1048576, $quotaStorageS3); ?>" style="white-space: nowrap;"><?php echo poznoteFormatMb($attachmentS3Bytes) . poznoteUserQuotaSuffix($quotaStorageS3); ?></td>
                        <?php endif; ?>
                        <?php if ($backupsColumnVisible): ?>
                            <td class="col-group-start <?php echo poznoteUserQuotaLevelClass($backupsS3Bytes / 1048576, $quotaBackupsS3); ?>" style="white-space: nowrap;"><?php echo poznoteFormatMb($backupsS3Bytes) . poznoteUserQuotaSuffix($quotaBackupsS3); ?></td>
                        <?php endif; ?>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $v; ?>"></script>
    <script>
    // Instant hover tooltip for the help icons: the native title attribute
    // only shows after the OS delay, and a CSS ::after tooltip would be
    // clipped by the scrollable table container, hence fixed positioning.
    (function() {
        var tip = null;
        function hide() {
            if (tip) { tip.remove(); tip = null; }
        }
        document.querySelectorAll('.storage-local-help[data-tooltip]').forEach(function(el) {
            el.addEventListener('mouseenter', function() {
                hide();
                tip = document.createElement('div');
                tip.className = 'storage-help-tooltip';
                tip.textContent = el.getAttribute('data-tooltip') || '';
                document.body.appendChild(tip);
                var r = el.getBoundingClientRect();
                var t = tip.getBoundingClientRect();
                var left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
                var top = r.bottom + 8;
                if (top + t.height > window.innerHeight - 8) {
                    top = r.top - t.height - 8;
                }
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
            });
            el.addEventListener('mouseleave', hide);
        });
    })();
    </script>
</body>
</html>
