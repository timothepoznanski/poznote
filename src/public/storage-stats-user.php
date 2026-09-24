<?php
/**
 * Storage Statistics (own account)
 *
 * The number of notes and the disk space used by the currently active account
 * only. Unlike admin/storage-stats.php, this is available to every user and
 * never exposes other accounts.
 *
 * The figures close the My Account section of the settings page (discussion
 * #1378), which loads them from here with ?fragment=1 once the page is up:
 * measuring walks the account's folders and asks the backup bucket. The
 * markup at the bottom is that fragment, styled by css/settings.css. Opened
 * on its own, the former page sends to that section.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';

$pageWorkspace = trim(getWorkspaceFilter());
if (($_GET['fragment'] ?? '') !== '1') {
    header('Location: settings.php?open=account'
        . ($pageWorkspace !== '' && $pageWorkspace !== '__last_opened__' ? '&workspace=' . rawurlencode($pageWorkspace) : ''), true, 302);
    exit;
}

require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/UserDataManager.php';
require_once __DIR__ . '/../users/db_master.php';

$activeUserId = (int)(getCurrentUserId() ?? 0);
$manager      = new UserDataManager($activeUserId);
$sizes        = $manager->getStorageStats();

$notesActive = 0;
$notesTrash  = 0;
try {
    $notesActive = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 0")->fetchColumn();
    $notesTrash  = (int)$con->query("SELECT COUNT(*) FROM entries WHERE trash = 1")->fetchColumn();
} catch (Exception $e) {
    // Leave counts at 0 on error.
    error_log('storage-stats-user: failed: ' . $e->getMessage());
}

// S3 mode: split the attachments column like the admin page. Local is the
// on-disk directory; S3 is the recorded size of files absent from it (files
// not yet migrated stay in the local column).
require_once __DIR__ . '/../storage/AttachmentStorage.php';
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
        error_log('storage-stats-user: failed: ' . $e->getMessage());
    }
    // getStorageStats() adds every recorded size on top of the directory
    // size in S3 mode: strip that to get the on-disk figure.
    $attachmentLocalBytes = max(0, $attachmentLocalBytes - $allRecordedBytes);
}

// Backups live in their own bucket, independent from the attachments one:
// show the column only when that feature is configured. Real usage is read
// from the bucket, scoped to this account's own prefix.
require_once __DIR__ . '/../S3BackupService.php';
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

$quotaUnitMb = t_h('admin_tools.storage_stats.quota_unit_mb', [], 'MB');
$formatSize = static function (int $bytes) use ($quotaUnitMb): string {
    return poznoteFormatMb($bytes) . '&nbsp;' . $quotaUnitMb;
};

/**
 * Link to the page managing what a row counts, keeping the workspace the
 * page was opened with.
 */
$rowHref = function (string $page) use ($pageWorkspace): string {
    if ($pageWorkspace !== '') {
        $page .= '?workspace=' . rawurlencode($pageWorkspace);
    }
    return htmlspecialchars($page, ENT_QUOTES, 'UTF-8');
};

// One row per quota, read like the other settings rows: what is counted on
// the left, in plain words with what it is made of underneath; the figure on
// the right, with its limit and a fill bar when there is one. Values are
// HTML-safe already.
$storageRows = [
    [
        'icon'   => 'lucide-sticky-note',
        'href'   => $rowHref('notes_manager.php'),
        'label'  => t_h('admin_tools.storage_stats.table_notes', [], 'Notes'),
        'detail' => t_h('settings.storage_summary.notes_detail', [
            'active' => number_format($notesActive),
            'trash'  => number_format($notesTrash),
        ], '{{active}} in your notes, {{trash}} in the trash'),
        'used'      => (float)($notesActive + $notesTrash),
        'limit'     => $quotaNotes,
        'usedText'  => number_format($notesActive + $notesTrash),
        'limitText' => number_format($quotaNotes),
    ],
    [
        'icon'   => 'lucide-hard-drive',
        'href'   => '',
        'label'  => t_h('settings.storage_summary.local', [], 'Space used on the server'),
        'detail' => implode(' · ', [
            t_h('settings.storage_summary.database', [], 'Database') . ' ' . $formatSize((int)$sizes['database']),
            t_h('settings.storage_summary.note_files', [], 'Note files') . ' ' . $formatSize((int)$sizes['entries']),
            t_h('settings.storage_summary.attachments', [], 'Attachments') . ' ' . $formatSize($attachmentLocalBytes),
        ]),
        'used'      => $displayedTotalBytes / 1048576,
        'limit'     => $quotaStorage,
        'usedText'  => $formatSize($displayedTotalBytes),
        'limitText' => number_format($quotaStorage) . '&nbsp;' . $quotaUnitMb,
    ],
];
if ($s3ColumnVisible) {
    $storageRows[] = [
        'icon'      => 'lucide-cloud',
        'href'      => $rowHref('attachments_list.php'),
        'label'     => t_h('settings.storage_summary.s3_attachments', [], 'Attachments in S3 storage'),
        'detail'    => '',
        'used'      => $attachmentS3Bytes / 1048576,
        'limit'     => $quotaStorageS3,
        'usedText'  => $formatSize($attachmentS3Bytes),
        'limitText' => number_format($quotaStorageS3) . '&nbsp;' . $quotaUnitMb,
    ];
}
if ($backupsColumnVisible) {
    $storageRows[] = [
        'icon'      => 'lucide-archive',
        'href'      => $rowHref('backup_export.php'),
        'label'     => t_h('settings.storage_summary.s3_backups', [], 'Backups in S3 storage'),
        'detail'    => '',
        'used'      => $backupsS3Bytes / 1048576,
        'limit'     => $quotaBackupsS3,
        'usedText'  => $formatSize($backupsS3Bytes),
        'limitText' => number_format($quotaBackupsS3) . '&nbsp;' . $quotaUnitMb,
    ];
}
$unlimitedText = $quotaIsAdmin
    ? t_h('admin_tools.storage_stats.quota_admin_exempt', [], 'Unlimited because admin')
    : t_h('admin_tools.storage_stats.quota_unlimited', [], 'Unlimited');
?>
<?php foreach ($storageRows as $row):
    $isUnlimited = ((int)$row['limit'] <= 0);
    $levelClass  = poznoteUserQuotaLevelClass((float)$row['used'], (int)$row['limit']);
    $percent     = $isUnlimited ? 0.0 : min(100, max(0, ((float)$row['used'] / (int)$row['limit']) * 100));
    // "<1%" rather than "0%" as soon as anything is used, so a non-empty
    // quota never reads as untouched.
    $percentText = ($percent > 0 && $percent < 1) ? '<1' : (string)round($percent);
    $rowTag      = $row['href'] === '' ? 'div' : 'a';
?>
<<?php echo $rowTag; ?> class="settings-storage-row <?php echo $levelClass; ?>"<?php echo $row['href'] === '' ? '' : ' href="' . $row['href'] . '"'; ?>>
    <i class="lucide <?php echo $row['icon']; ?> settings-storage-icon"></i>
    <span class="settings-storage-text">
        <span class="settings-storage-label"><?php echo $row['label']; ?></span>
        <?php if ($row['detail'] !== ''): ?>
        <span class="settings-storage-detail"><?php echo $row['detail']; ?></span>
        <?php endif; ?>
    </span>
    <span class="settings-storage-figure">
        <span class="settings-storage-value"><?php echo $row['usedText']; ?><?php if (!$isUnlimited): ?><span class="settings-storage-limit"> / <?php echo $row['limitText']; ?></span><?php endif; ?></span>
        <?php if ($isUnlimited): ?>
        <span class="settings-storage-meta"><?php echo $unlimitedText; ?></span>
        <?php else: ?>
        <span class="settings-storage-bar"><span style="width: <?php echo ($percent > 0 ? max(2, round($percent)) : 0); ?>%;"></span></span>
        <span class="settings-storage-meta"><?php echo t_h('admin_tools.storage_stats.quota_percent_used', ['percent' => $percentText], '{{percent}}% used'); ?></span>
        <?php endif; ?>
    </span>
</<?php echo $rowTag; ?>>
<?php endforeach; ?>
