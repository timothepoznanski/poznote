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
 * Drop a trailing unit like "(MB)" from a table header label: the cards
 * carry the unit inside the figure itself. Expects an HTML-safe string.
 */
function poznoteStripUnit(string $label): string {
    return trim(preg_replace('/\s*\([^()]*\)\s*$/u', '', $label));
}

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

// Cards shown under the table: one per quota, so the headroom left can be
// read without decoding a dense row. Each card shows its limit, a fill bar
// and a percentage, plus the table columns feeding its total.
$quotaUnitMb = t_h('admin_tools.storage_stats.quota_unit_mb', [], 'MB');

/**
 * Link to the page managing what a card counts, keeping the workspace the
 * page was opened with.
 */
$cardHref = function (string $page) use ($pageWorkspace): string {
    if ($pageWorkspace !== '') {
        $page .= '?workspace=' . rawurlencode($pageWorkspace);
    }
    return htmlspecialchars($page, ENT_QUOTES, 'UTF-8');
};

/**
 * A quota card for a storage figure, with the values already formatted in MB.
 * A limit of 0 means unlimited (global setting unset, or exempt admin).
 */
$makeSizeCard = function (string $icon, string $label, int $bytes, int $limitMb, string $href = '') use ($quotaUnitMb): array {
    return [
        'icon'      => $icon,
        'href'      => $href,
        'label'     => $label,
        'help'      => '',
        'used'      => $bytes / 1048576,
        'limit'     => $limitMb,
        'usedText'  => poznoteFormatMb($bytes) . '&nbsp;' . $quotaUnitMb,
        'limitText' => number_format($limitMb) . '&nbsp;' . $quotaUnitMb,
    ];
};

$statCards = [
    // Every note in a single card: the total is what the note quota counts,
    // with the active/trashed split underneath.
    [
        'icon'      => 'lucide-sticky-note',
        'href'      => $cardHref('notes_manager.php'),
        'label'     => t_h('admin_tools.storage_stats.table_notes_total', [], 'Total notes'),
        'help'      => '',
        'used'      => (float)($notesActive + $notesTrash),
        'limit'     => $quotaNotes,
        'usedText'  => number_format($notesActive + $notesTrash),
        'limitText' => number_format($quotaNotes),
        'breakdown' => [
            [
                'label' => t_h('admin_tools.storage_stats.table_notes', [], 'Notes'),
                'value' => number_format($notesActive),
                'help'  => '',
            ],
            [
                'label' => t_h('admin_tools.storage_stats.table_trash', [], 'Trash'),
                'value' => number_format($notesTrash),
                'help'  => '',
            ],
        ],
    ],
    // Everything stored locally in a single card: the total carries the
    // local storage quota, and the columns feeding it (database, note
    // files, attachments) are listed underneath.
    [
        'icon'      => 'lucide-hard-drive',
        'label'     => poznoteStripUnit(t_h('admin_tools.storage_stats.table_total', [], 'Total local (MB)')),
        'help'      => '',
        'used'      => $displayedTotalBytes / 1048576,
        'limit'     => $quotaStorage,
        'usedText'  => poznoteFormatMb($displayedTotalBytes) . '&nbsp;' . $quotaUnitMb,
        'limitText' => number_format($quotaStorage) . '&nbsp;' . $quotaUnitMb,
        'breakdown' => [
            [
                'label' => poznoteStripUnit(t_h('admin_tools.storage_stats.table_db', [], 'Database local (MB)')),
                'value' => poznoteFormatMb((int)$sizes['database']) . '&nbsp;' . $quotaUnitMb,
                'help'  => t_h('admin_tools.storage_stats.db_help', [], 'The database stores your settings and the raw text of your notes, used for fast search.'),
            ],
            [
                'label' => poznoteStripUnit(t_h('admin_tools.storage_stats.table_entries', [], 'Files local (MB)')),
                'value' => poznoteFormatMb((int)$sizes['entries']) . '&nbsp;' . $quotaUnitMb,
                'help'  => t_h('admin_tools.storage_stats.files_help', [], 'The files are the contents of your notes, in HTML or Markdown format.'),
            ],
            [
                'label' => $s3ColumnVisible
                    ? poznoteStripUnit(t_h('admin_tools.storage_stats.table_attachments_local', [], 'Attachments local (MB)'))
                    : poznoteStripUnit(t_h('admin_tools.storage_stats.table_attachments', [], 'Attachments (MB)')),
                'value' => poznoteFormatMb($attachmentLocalBytes) . '&nbsp;' . $quotaUnitMb,
                'help'  => AttachmentStorage::isEnabled()
                    ? t_h('admin_tools.storage_stats.user_s3_notice', [], 'Attachments are stored in S3 storage rather than locally, as configured by the administrator.')
                    : '',
            ],
        ],
    ],
];
if ($s3ColumnVisible) {
    $statCards[] = $makeSizeCard(
        'lucide-cloud',
        poznoteStripUnit(t_h('admin_tools.storage_stats.table_attachments_s3', [], 'Attachments S3 (MB)')),
        $attachmentS3Bytes,
        $quotaStorageS3,
        $cardHref('attachments_list.php')
    );
}
if ($backupsColumnVisible) {
    $statCards[] = $makeSizeCard(
        'lucide-archive',
        poznoteStripUnit(t_h('admin_tools.storage_stats.table_backups_s3', [], 'Backups S3 (MB)')),
        $backupsS3Bytes,
        $quotaBackupsS3,
        $cardHref('backup_export.php')
    );
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
    /* ── Quota cards ──────────────────────────────────────────────
       The table packs everything into one dense row; these cards group
       it per quota (notes, local storage, and each S3 bucket), showing
       the limit, a fill bar, a percentage and the detail behind the
       total. */
    .quota-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        max-width: 700px;
        margin: 28px auto 0;
    }
    .quota-card {
        /* Accent driving the figure and the bar. Overridden by the level
           classes below, which win on two-class specificity over
           admin-tools.css's plain .quota-level-* colour rules. The icon
           keeps its own muted tone so it stays a marker, not the focus,
           and only takes the accent once a quota crosses a threshold. */
        --quota-accent: #007cba;
        --quota-icon: #c2c8d0;
        display: flex;
        /* Top-aligned: grid rows stretch every card to the tallest one, and
           centring left the shorter card (fewer breakdown rows) floating in
           the middle, with a gap above its title. */
        align-items: flex-start;
        gap: 16px;
        padding: 18px 20px;
        border: 1.5px solid var(--border-color, #e5e7eb);
        border-radius: 12px;
        background: var(--bg-color, #fff);
        text-align: left;
        color: var(--text-color, #1a1a1a);
    }
    a.quota-card {
        text-decoration: none;
        transition: border-color 0.15s;
    }
    a.quota-card:hover,
    a.quota-card:focus-visible {
        border-color: var(--quota-accent);
    }
    .quota-card.quota-level-warn {
        --quota-accent: #e8830c;
        --quota-icon: #e8830c;
    }
    .quota-card.quota-level-danger {
        --quota-accent: #dc3545;
        --quota-icon: #dc3545;
    }
    /* Lucide icons are CSS masks: they need background-color, not just
       color, to take the accent. */
    .quota-card-icon {
        flex: none;
        /* Optically level with the label now that the card is top-aligned. */
        margin-top: 2px;
        font-size: 1.6rem;
        stroke-width: 1.75;
        color: var(--quota-icon);
        background-color: var(--quota-icon);
    }
    .quota-card-body {
        flex: 1;
        min-width: 0;
    }
    .quota-card-label {
        margin-bottom: 14px;
        font-size: 0.88rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-muted, #6b7280);
    }
    .quota-card-value {
        font-size: 1.35rem;
        font-weight: 700;
        white-space: nowrap;
        color: var(--quota-accent);
    }
    .quota-card-limit {
        margin-left: 3px;
        font-size: 0.95rem;
        font-weight: 500;
        opacity: 0.75;
    }
    .quota-card-limit .lucide-infinity {
        font-size: 1.1rem;
    }
    .quota-card-bar {
        margin-top: 9px;
        height: 6px;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.22);
        overflow: hidden;
    }
    .quota-card-bar > span {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--quota-accent);
    }
    .quota-card-meta {
        margin-top: 6px;
        font-size: 0.78rem;
        color: var(--text-muted, #6b7280);
    }
    /* Columns feeding the card's total, listed as "label … value" rows. */
    .quota-card-breakdown {
        display: grid;
        gap: 3px;
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid var(--border-color, #e5e7eb);
        font-size: 0.78rem;
        color: var(--text-muted, #6b7280);
    }
    .quota-card-breakdown-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
    }
    .quota-card-breakdown-value {
        flex: none;
        font-weight: 600;
        white-space: nowrap;
    }
    html[data-theme='dark'] .quota-card,
    body.dark-mode .quota-card {
        --quota-accent: var(--dm-accent, #4a9eff);
        --quota-icon: #6f7885;
        background: var(--dm-surface, #333);
        border-color: var(--dm-border, #404040);
        color: var(--dm-text, #bebebe);
    }
    html[data-theme='dark'] .quota-card.quota-level-warn,
    body.dark-mode .quota-card.quota-level-warn {
        --quota-accent: #fbbf24;
        --quota-icon: #fbbf24;
    }
    html[data-theme='dark'] .quota-card.quota-level-danger,
    body.dark-mode .quota-card.quota-level-danger {
        --quota-accent: #f87171;
        --quota-icon: #f87171;
    }
    html[data-theme='dark'] .quota-card-label,
    body.dark-mode .quota-card-label,
    html[data-theme='dark'] .quota-card-meta,
    body.dark-mode .quota-card-meta,
    html[data-theme='dark'] .quota-card-breakdown,
    body.dark-mode .quota-card-breakdown {
        color: var(--dm-text-muted, #c5c5c5);
    }
    html[data-theme='dark'] .quota-card-breakdown,
    body.dark-mode .quota-card-breakdown {
        border-top-color: var(--dm-border, #404040);
    }
    @media (max-width: 540px) {
        .quota-card {
            padding: 16px;
            gap: 14px;
        }
        .quota-card-icon {
            font-size: 1.5rem;
        }
    }
    </style>
</head>
<body class="has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php include 'icon_sidebar.php'; ?>
<div class="admin-container">
<?php include 'back_to_settings.php'; ?>
<h1 class="poznote-page-title"><i class="lucide lucide-pie-chart"></i> <?php echo t_h('settings.cards.storage_stats_user', [], 'User Storage statistics'); ?></h1>

    <div class="admin-header">
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <?php if (poznoteSaasNoticesEnabled()): ?>
            <div class="attachment-usage-notice">
                <i class="lucide lucide-alert-triangle"></i>
                <span><?php echo t_h('attachments.page.note_taking_notice', [], 'Poznote is a note-taking app: you can store media, but large files fill up your space quickly.'); ?></span>
            </div>
            <?php endif; ?>
        </div>

        <div class="quota-cards">
            <?php foreach ($statCards as $card):
                $isUnlimited = ((int)$card['limit'] <= 0);
                $levelClass  = poznoteUserQuotaLevelClass((float)$card['used'], (int)$card['limit']);
                $percent     = 0.0;
                if (!$isUnlimited) {
                    $percent = min(100, max(0, ((float)$card['used'] / (int)$card['limit']) * 100));
                }
                // Show "<1%" rather than "0%" as soon as anything is used, so a
                // non-empty quota never reads as untouched.
                $percentText = ($percent > 0 && $percent < 1) ? '<1' : (string)round($percent);
                $cardTag     = empty($card['href']) ? 'div' : 'a';
                $cardAttr    = empty($card['href']) ? '' : ' href="' . $card['href'] . '"';
            ?>
            <?php // Cards pointing at the page that manages what they count
                  // render as links; the others stay plain blocks. ?>
            <<?php echo $cardTag; ?> class="quota-card <?php echo $levelClass; ?>"<?php echo $cardAttr; ?>>
                <i class="lucide <?php echo $card['icon']; ?> quota-card-icon"></i>
                <div class="quota-card-body">
                    <div class="quota-card-label"><?php echo $card['label']; ?></div>
                    <?php // The help icon rides with the figure, like in the
                          // table: labels wrap, the short figure never does. ?>
                    <div class="quota-card-value">
                        <span class="quota-card-used"><?php echo $card['usedText']; ?></span>
                        <?php if (!empty($card['help'])): ?>
                            <i class="lucide lucide-help-circle storage-local-help" data-tooltip="<?php echo $card['help']; ?>"></i>
                        <?php endif; ?>
                        <?php if ($isUnlimited): ?>
                            <span class="quota-card-limit">/&nbsp;<i class="lucide lucide-infinity"></i></span>
                        <?php else: ?>
                            <span class="quota-card-limit">/&nbsp;<?php echo $card['limitText']; ?></span>
                        <?php endif; ?>
                    </div>
                    <?php if ($isUnlimited): ?>
                        <div class="quota-card-meta"><?php echo $quotaIsAdmin
                            ? t_h('admin_tools.storage_stats.quota_admin_exempt', [], 'Unlimited because admin')
                            : t_h('admin_tools.storage_stats.quota_unlimited', [], 'Unlimited'); ?></div>
                    <?php else: ?>
                        <div class="quota-card-bar"><span style="width: <?php echo ($percent > 0 ? max(2, round($percent)) : 0); ?>%;"></span></div>
                        <div class="quota-card-meta"><?php echo t_h('admin_tools.storage_stats.quota_percent_used', ['percent' => $percentText], '{{percent}}% used'); ?></div>
                    <?php endif; ?>
                    <?php if (!empty($card['breakdown'])): ?>
                        <div class="quota-card-breakdown">
                            <?php foreach ($card['breakdown'] as $row): ?>
                            <div class="quota-card-breakdown-row">
                                <span><?php echo $row['label']; ?><?php if (!empty($row['help'])): ?> <i class="lucide lucide-help-circle storage-local-help" data-tooltip="<?php echo $row['help']; ?>"></i><?php endif; ?></span>
                                <span class="quota-card-breakdown-value"><?php echo $row['value']; ?></span>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </<?php echo $cardTag; ?>>
            <?php endforeach; ?>
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
