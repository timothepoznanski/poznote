<?php
/**
 * Activity Log — Admin Tool
 *
 * Instance-wide history of destructive and data-movement operations:
 * account deletions, backup creation and restore, trash emptying, permanent
 * note deletion and workspace deletion.
 *
 * Entries are read from the master database (see ActivityLog.php for why they
 * live there rather than in the per-user ones).
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
require_once __DIR__ . '/../ActivityLog.php';

$v             = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

// Rows per page. The log grows slowly (only rare events are recorded), so a
// simple offset pager is enough and avoids loading the whole table.
// The size is admin-selectable and persisted, like the users and storage
// tables; 0 means "all rows on one page" rather than an empty page.
const ACTIVITY_LOG_PAGE_SIZES = [50, 100, 250, 500, 0];
const ACTIVITY_LOG_PAGE_SIZE_DEFAULT = 100;

$notice      = null;
$noticeError = false;

// Per-page CSRF token, following the restore_import.php convention.
if (empty($_SESSION['activity_log_csrf_token'])) {
    $_SESSION['activity_log_csrf_token'] = bin2hex(random_bytes(32));
}
$csrfToken = $_SESSION['activity_log_csrf_token'];

// POST actions: retention change and manual purge, both admin-only mutations.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postedToken = (string)($_POST['csrf_token'] ?? '');
    if (!hash_equals($csrfToken, $postedToken)) {
        $notice      = t('activity_log.errors.invalid_form', [], 'Invalid form submission. Please try again.');
        $noticeError = true;
    } else {
        switch ($_POST['action'] ?? '') {
            case 'set_retention':
                $days = (int)($_POST['retention_days'] ?? 90);
                if (setActivityLogRetentionDays($days)) {
                    $removed = pruneActivityLog($days);
                    $notice = $days > 0
                        ? t('activity_log.messages.retention_saved', ['days' => $days, 'removed' => $removed], 'Retention set to {{days}} days. {{removed}} old entries removed.')
                        : t('activity_log.messages.retention_unlimited', [], 'Retention set to unlimited. No entry will be removed automatically.');
                } else {
                    $notice      = t('activity_log.errors.retention_failed', [], 'Could not save the retention setting.');
                    $noticeError = true;
                }
                break;

            case 'clear_log':
                $cleared = clearActivityLog();
                if ($cleared >= 0) {
                    $notice = t('activity_log.messages.cleared', ['count' => $cleared], '{{count}} entries deleted.');
                } else {
                    $notice      = t('activity_log.errors.clear_failed', [], 'Could not clear the log.');
                    $noticeError = true;
                }
                break;
        }
    }
}

// Filters
$filterAction = $_GET['action_filter'] ?? '';
if ($filterAction !== '' && !in_array($filterAction, activityLogActions(), true)) {
    $filterAction = '';
}
$filterSearch = trim((string)($_GET['q'] ?? ''));
$page         = max(1, (int)($_GET['page'] ?? 1));

$filters = [];
if ($filterAction !== '') {
    $filters['action'] = $filterAction;
}
if ($filterSearch !== '') {
    $filters['search'] = $filterSearch;
}

// === Page size (persisted in the settings table, like the other admin tables) ===
$requestedPageSize = $_GET['per_page'] ?? null;
if ($requestedPageSize !== null && ctype_digit((string)$requestedPageSize)
    && in_array((int)$requestedPageSize, ACTIVITY_LOG_PAGE_SIZES, true)) {
    $pageSize = (int)$requestedPageSize;
    global $con;
    try {
        $sizeStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $sizeStmt->execute(['admin_activity_log_per_page', (string)$pageSize]);
    } catch (Exception $e) {
        // Non-fatal: the requested size still applies for this request.
    }
} else {
    $storedPageSize = getSetting('admin_activity_log_per_page');
    $pageSize = ($storedPageSize !== null && ctype_digit((string)$storedPageSize)
        && in_array((int)$storedPageSize, ACTIVITY_LOG_PAGE_SIZES, true))
        ? (int)$storedPageSize
        : ACTIVITY_LOG_PAGE_SIZE_DEFAULT;
}

$totalEntries = countActivityLogEntries($filters);
// Clearing wipes the whole table, not the current filter, so the confirmation
// modal has to count every row rather than reuse the filtered total.
$totalStored  = $filters ? countActivityLogEntries() : $totalEntries;
if ($pageSize === 0) {
    // "All": one page holding every matching entry. getActivityLogEntries()
    // always applies a LIMIT (floored at 1), so pass the total rather than 0.
    $totalPages = 1;
    $page       = 1;
    $entries    = getActivityLogEntries($filters, max(1, $totalEntries), 0);
} else {
    $totalPages = max(1, (int)ceil($totalEntries / $pageSize));
    $page       = min($page, $totalPages);
    $entries    = getActivityLogEntries($filters, $pageSize, ($page - 1) * $pageSize);
}

/**
 * Label for a page-size option; 0 is "All".
 */
function activityPageSizeLabel(int $size): string {
    return $size === 0
        ? t('activity_log.pager.all', [], 'All')
        : (string)$size;
}

// Timestamps are stored as UTC by SQLite's CURRENT_TIMESTAMP; render them in
// the viewing admin's timezone so they line up with what users report.
// Resolved here rather than further down because the CSV export below formats
// the same timestamps.
$displayTz = new DateTimeZone(getUserTimezone());

// === CSV export ===
// Re-queries without the page slice: an export that silently stopped at the
// visible page would be mistaken for the whole log. The active filters still
// apply, so the file matches what the admin is looking at.
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    $exportEntries = getActivityLogEntries($filters, max(1, $totalEntries), 0);

    $filename = 'poznote-activity-log-' . date('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store');

    $out = fopen('php://output', 'w');
    // UTF-8 BOM: without it Excel reads accented names and details as mojibake.
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, [
        t('activity_log.columns.date', [], 'Date and time'),
        t('activity_log.columns.user', [], 'User (ID)'),
        t('activity_log.columns.action', [], 'Action'),
        t('activity_log.columns.details', [], 'Details'),
        t('activity_log.columns.source', [], 'Source'),
    ]);

    foreach ($exportEntries as $exportRow) {
        try {
            $exportDt = new DateTime($exportRow['created_at'] . ' UTC');
            $exportDt->setTimezone($displayTz);
            $exportWhen = $exportDt->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            $exportWhen = (string)$exportRow['created_at'];
        }

        $exportAction = (string)$exportRow['action'];
        $exportUsername = (string)($exportRow['username'] ?? '');
        if ($exportUsername === '') {
            $exportUsername = t('activity_log.unknown_user', [], 'unknown');
        }
        // ID in its own column would be cleaner, but the table shows
        // "name (id)" as one column and the export mirrors the table.
        if ($exportRow['user_id'] !== null) {
            $exportUsername .= ' (' . (int)$exportRow['user_id'] . ')';
        }

        fputcsv($out, [
            $exportWhen,
            $exportUsername,
            t(activityActionKey($exportAction), [], $exportAction),
            activityDetailsText($exportAction, $exportRow['details']),
            (string)($exportRow['source'] ?? ''),
        ]);
    }

    fclose($out);
    exit;
}

$retentionDays = getActivityLogRetentionDays();

// The help tooltip lists the operations the log records. Built from
// activityLogActions() rather than a hand-written sentence so it can never
// drift from what is actually instrumented.
$loggedOperationsTooltip = t('activity_log.help_intro', [], 'Operations recorded:') . "\n"
    . implode("\n", array_map(function (string $action): string {
        return '• ' . t(activityActionKey($action), [], $action);
    }, activityLogActions()));

/**
 * i18n key suffix for an action.
 *
 * i18nGet() resolves keys by splitting on '.', so the stored action names
 * ("account.deleted") cannot be used as key segments directly: they would be
 * looked up as a nested account -> deleted pair. Underscores sidestep that
 * without renaming the values already written to the table.
 */
function activityActionKey(string $action): string {
    return 'activity_log.actions.' . str_replace('.', '_', $action);
}

/**
 * Icon and colour class per action, so the table scans by shape as well as text.
 */
function activityActionIcon(string $action): string {
    switch ($action) {
        case ACTIVITY_ACCOUNT_DELETED:    return 'lucide-users';
        case ACTIVITY_BACKUP_CREATED:     return 'lucide-archive';
        case ACTIVITY_BACKUP_RESTORED:    return 'lucide-history';
        case ACTIVITY_TRASH_EMPTIED:      return 'lucide-trash-2';
        case ACTIVITY_NOTE_DELETED:       return 'lucide-file-minus';
        case ACTIVITY_WORKSPACE_CREATED:  return 'lucide-layers';
        case ACTIVITY_WORKSPACE_DELETED:  return 'lucide-layers';
        case ACTIVITY_WORKSPACE_SHARED:   return 'lucide-share-2';
        case ACTIVITY_WORKSPACE_UNSHARED: return 'lucide-share-2';
        case ACTIVITY_ACCESS_GRANTED:     return 'lucide-key';
        case ACTIVITY_ACCESS_REVOKED:     return 'lucide-key';
        case ACTIVITY_PROFILE_UPDATED:    return 'lucide-pencil';
        case ACTIVITY_QUOTA_UPDATED:      return 'lucide-gauge';
        case ACTIVITY_ACCOUNT_ACTIVATED:  return 'lucide-unlock';
        case ACTIVITY_ACCOUNT_DEACTIVATED: return 'lucide-lock';
        case ACTIVITY_ADMIN_GRANTED:      return 'lucide-shield';
        case ACTIVITY_ADMIN_REVOKED:      return 'lucide-shield';
        case ACTIVITY_LOGIN:              return 'lucide-log-in';
        case ACTIVITY_LOGOUT:             return 'lucide-log-out';
        default:                          return 'lucide-activity';
    }
}

/**
 * Colour by consequence, so the table can be scanned for risk at a glance:
 * red for anything destructive, amber for actions that widen access or
 * overwrite data, grey for routine session events, blue for the rest.
 */
function activityActionTone(string $action): string {
    switch ($action) {
        case ACTIVITY_ACCOUNT_DELETED:
        case ACTIVITY_WORKSPACE_DELETED:
        case ACTIVITY_TRASH_EMPTIED:
        case ACTIVITY_NOTE_DELETED:
            return 'act-danger';
        case ACTIVITY_BACKUP_RESTORED:
        case ACTIVITY_WORKSPACE_SHARED:
        case ACTIVITY_ACCESS_GRANTED:
        case ACTIVITY_QUOTA_UPDATED:
        // Granting admin and locking an account out are the directions worth
        // spotting in a scan; their opposites are routine.
        case ACTIVITY_ADMIN_GRANTED:
        case ACTIVITY_ACCOUNT_DEACTIVATED:
            return 'act-warn';
        case ACTIVITY_LOGIN:
        case ACTIVITY_LOGOUT:
            return 'act-muted';
        default:
            return 'act-ok';
    }
}

/**
 * Turn the stored JSON details into a short human sentence.
 *
 * Falls back to a compact key=value dump for rows written by a newer version
 * whose keys this page does not know yet.
 */
function activityDetailsText(string $action, ?string $json): string {
    $d = $json ? json_decode($json, true) : [];
    if (!is_array($d)) {
        $d = [];
    }

    switch ($action) {
        case ACTIVITY_ACCOUNT_DELETED:
            $parts = [];
            if (!empty($d['performed_by'])) {
                $parts[] = t('activity_log.details.performed_by', ['user' => $d['performed_by']], 'by {{user}}');
            }
            if (array_key_exists('deleted_data', $d)) {
                $parts[] = $d['deleted_data']
                    ? t('activity_log.details.data_deleted', [], 'data deleted')
                    : t('activity_log.details.data_kept', [], 'data kept');
            }
            if (!empty($d['s3_objects_deleted'])) {
                $parts[] = t('activity_log.details.s3_objects_deleted', ['count' => (int)$d['s3_objects_deleted']], '{{count}} S3 objects deleted');
            }
            // Written only when the bucket cleanup failed: the flagged entry
            // is what tells a later audit that objects were left behind.
            if (!empty($d['s3_error'])) {
                $parts[] = t('activity_log.details.s3_cleanup_failed', [], 'S3 cleanup failed');
            }
            return implode(' · ', $parts);

        case ACTIVITY_BACKUP_CREATED:
            $parts = [];
            if (!empty($d['filename'])) {
                $parts[] = $d['filename'];
            }
            if (!empty($d['size'])) {
                $parts[] = activityFormatBytes((int)$d['size']);
            }
            if (!empty($d['destination'])) {
                $parts[] = t('activity_log.destinations.' . $d['destination'], [], (string)$d['destination']);
            }
            return implode(' · ', $parts);

        case ACTIVITY_BACKUP_RESTORED:
            $parts = [];
            if (!empty($d['filename'])) {
                $parts[] = $d['filename'];
            }
            if (!empty($d['source'])) {
                $parts[] = t('activity_log.sources.' . $d['source'], [], (string)$d['source']);
            }
            return implode(' · ', $parts);

        case ACTIVITY_TRASH_EMPTIED:
            $parts = [t('activity_log.details.notes_deleted', ['count' => (int)($d['deleted_count'] ?? 0)], '{{count}} notes deleted')];
            if (!empty($d['workspace'])) {
                $parts[] = t('activity_log.details.in_workspace', ['workspace' => $d['workspace']], 'in {{workspace}}');
            }
            return implode(' · ', $parts);

        case ACTIVITY_NOTE_DELETED:
            $parts = [];
            $parts[] = ($d['title'] ?? '') !== ''
                ? '"' . $d['title'] . '"'
                : t('activity_log.details.untitled_note', ['id' => (int)($d['note_id'] ?? 0)], 'note #{{id}}');
            if (!empty($d['workspace'])) {
                $parts[] = t('activity_log.details.in_workspace', ['workspace' => $d['workspace']], 'in {{workspace}}');
            }
            if (!empty($d['linked_notes_deleted'])) {
                $parts[] = t('activity_log.details.linked_deleted', ['count' => (int)$d['linked_notes_deleted']], '+{{count}} linked notes');
            }
            return implode(' · ', $parts);

        case ACTIVITY_WORKSPACE_CREATED:
        case ACTIVITY_WORKSPACE_UNSHARED:
            return '"' . ($d['workspace'] ?? '?') . '"';

        case ACTIVITY_WORKSPACE_SHARED:
            $parts = ['"' . ($d['workspace'] ?? '?') . '"'];
            if (!empty($d['updated'])) {
                $parts[] = t('activity_log.details.share_updated', [], 'settings updated');
            }
            if (!empty($d['password_protected'])) {
                $parts[] = t('activity_log.details.password_protected', [], 'password protected');
            }
            if (!empty($d['login_required'])) {
                $parts[] = t('activity_log.details.login_required', [], 'login required');
            }
            if (!empty($d['allowed_users'])) {
                $parts[] = t('activity_log.details.allowed_users', ['count' => (int)$d['allowed_users']], 'restricted to {{count}} users');
            }
            return implode(' · ', $parts);

        case ACTIVITY_ACCESS_GRANTED:
        case ACTIVITY_ACCESS_REVOKED:
            $accounts = is_array($d['accounts'] ?? null) ? $d['accounts'] : [];
            return t('activity_log.details.accounts', ['accounts' => implode(', ', $accounts)], 'accounts: {{accounts}}');

        case ACTIVITY_PROFILE_UPDATED:
        case ACTIVITY_QUOTA_UPDATED:
            $parts = [];
            foreach (($d['changes'] ?? []) as $field => $change) {
                $label = t('activity_log.fields.' . $field, [], $field);
                $from  = ($change['from'] ?? '') === ''
                    ? t('activity_log.details.empty_value', [], 'empty')
                    : $change['from'];
                $to    = ($change['to'] ?? '') === ''
                    ? t('activity_log.details.empty_value', [], 'empty')
                    : $change['to'];
                $parts[] = $label . ': ' . $from . ' → ' . $to;
            }
            if (!empty($d['performed_by'])) {
                $parts[] = t('activity_log.details.performed_by', ['user' => $d['performed_by']], 'by {{user}}');
            }
            return implode(' · ', $parts);

        case ACTIVITY_ACCOUNT_ACTIVATED:
        case ACTIVITY_ACCOUNT_DEACTIVATED:
        case ACTIVITY_ADMIN_GRANTED:
        case ACTIVITY_ADMIN_REVOKED:
            // The action label already says what happened; only who did it adds
            // information here.
            return empty($d['performed_by'])
                ? ''
                : t('activity_log.details.performed_by', ['user' => $d['performed_by']], 'by {{user}}');

        case ACTIVITY_LOGIN:
        case ACTIVITY_LOGOUT:
            $method = (string)($d['method'] ?? 'password');
            return t('activity_log.methods.' . $method, [], $method);

        case ACTIVITY_WORKSPACE_DELETED:
            $parts = ['"' . ($d['workspace'] ?? '?') . '"'];
            // The two deletion paths differ: the web UI destroys the notes,
            // the REST endpoint moves them elsewhere.
            if (isset($d['notes_deleted'])) {
                $parts[] = t('activity_log.details.notes_deleted', ['count' => (int)$d['notes_deleted']], '{{count}} notes deleted');
            } elseif (isset($d['notes_moved'])) {
                $parts[] = t('activity_log.details.notes_moved', [
                    'count' => (int)$d['notes_moved'],
                    'workspace' => (string)($d['moved_to'] ?? '?'),
                ], '{{count}} notes moved to {{workspace}}');
            }
            return implode(' · ', $parts);
    }

    $flat = [];
    foreach ($d as $k => $val) {
        $flat[] = $k . '=' . (is_scalar($val) ? (string)$val : json_encode($val));
    }
    return implode(' · ', $flat);
}

function activityFormatBytes(int $bytes): string {
    if ($bytes >= 1073741824) {
        return round($bytes / 1073741824, 2) . ' GB';
    }
    if ($bytes >= 1048576) {
        return round($bytes / 1048576, 1) . ' MB';
    }
    if ($bytes >= 1024) {
        return round($bytes / 1024) . ' KB';
    }
    return $bytes . ' B';
}

/**
 * Preserve the current filters when building pager links.
 */
function activityPageUrl(int $page, string $action, string $search): string {
    $params = ['page' => $page];
    if ($action !== '') {
        $params['action_filter'] = $action;
    }
    if ($search !== '') {
        $params['q'] = $search;
    }
    return '?' . http_build_query($params);
}

/**
 * CSV export link: same filters as the view, no page (the export ignores the
 * page slice on purpose).
 */
function activityExportUrl(string $action, string $search): string {
    $params = ['export' => 'csv'];
    if ($action !== '') {
        $params['action_filter'] = $action;
    }
    if ($search !== '') {
        $params['q'] = $search;
    }
    return '?' . http_build_query($params);
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('activity_log.title', [], 'Activity log'); ?></title>
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
    /* Same full-width treatment as storage-stats: the log table is wider than
       the default 700px admin column. */
    .admin-container { max-width: none; }
    .dr-page { max-width: none; padding-left: 0; padding-right: 0; }
    .admin-header { margin-bottom: 0; }
    .dr-hero { padding: 0 0 15px; }

    .activity-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
    }
    .activity-toolbar .home-search-container { margin-bottom: 0; flex: 1 1 260px; max-width: 380px; }
    .activity-select {
        padding: 8px 12px;
        border: 1px solid var(--border-color, #e5e7eb);
        border-radius: 8px;
        background: var(--bg-color, #fff);
        color: var(--text-color, #222);
        font-size: 0.9rem;
        cursor: pointer;
    }

    .activity-notice {
        max-width: 700px;
        margin: 0 auto 16px;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 0.88rem;
        background: rgba(34, 197, 94, 0.12);
        color: #15803d;
        border: 1px solid rgba(34, 197, 94, 0.35);
    }
    .activity-notice.is-error {
        background: rgba(239, 68, 68, 0.12);
        color: #b91c1c;
        border-color: rgba(239, 68, 68, 0.35);
    }

    /* Same sticky-header recipe as storage-stats: overflow:clip (not hidden)
       on the table, because a hidden ancestor breaks position:sticky. */
    .table-scroll { overflow: auto; margin-top: 10px; border-radius: 12px; }
    .table-scroll .results-table { border: none; border-radius: 0; }
    .results-table {
        width: auto;
        margin: 0 auto;
        overflow: clip;
    }
    .results-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        /* Opaque on purpose: a transparent header would let rows scroll
           through it once the wrapper is height-capped. */
        background: var(--bg-secondary, #f9f9f9);
        box-shadow: 0 1px 0 var(--border-color, #e5e7eb);
        font-size: 0.78rem;
        font-weight: 600;
        white-space: nowrap;
    }
    /* The dark palette is --dm-*; without this the sticky header keeps the
       light background and rows would scroll under a white band. */
    :root[data-theme='dark'] .results-table thead th,
    body.dark-mode .results-table thead th {
        background: var(--dm-content-bg);
        box-shadow: 0 1px 0 var(--dm-border);
    }
    /* admin-tools.css collapses the borders, which makes Chromium paint row
       content over the sticky header. Separate borders render identically
       here (the separators are td borders). */
    .results-table {
        border-collapse: separate;
        border-spacing: 0;
    }
    .results-table th, .results-table td { padding: 7px 16px; }
    .results-table td { font-size: 0.85rem; vertical-align: middle; }

    .act-when { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .act-user { white-space: nowrap; }
    .act-user-id { color: var(--text-muted, #777); font-size: 0.78rem; }
    /* Deleted accounts leave rows behind whose user no longer exists. */
    .act-user-gone { color: var(--text-muted, #777); font-style: italic; }

    .act-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 600;
        white-space: nowrap;
    }
    /* Lucide icons are CSS masks: they need background-color, not color. */
    .act-badge .lucide {
        width: 13px;
        height: 13px;
        background-color: currentColor;
    }
    .act-danger { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
    .act-warn   { background: rgba(245, 158, 11, 0.15); color: #b45309; }
    .act-ok     { background: rgba(59, 130, 246, 0.12); color: #1d4ed8; }
    .act-muted  { background: rgba(107, 114, 128, 0.14); color: #4b5563; }

    .act-details { color: var(--text-color, #333); }
    .act-source {
        font-size: 0.72rem;
        color: var(--text-muted, #777);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .activity-empty {
        text-align: center;
        padding: 40px 20px;
        color: var(--text-muted, #777);
    }
    .activity-empty .lucide {
        width: 32px;
        height: 32px;
        background-color: currentColor;
        opacity: 0.5;
        margin-bottom: 10px;
    }

    .activity-pager {
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
    .activity-pager-size {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0;
    }
    .activity-pager-size select {
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
    :root[data-theme='dark'] .activity-pager-size select,
    body.dark-mode .activity-pager-size select {
        color: var(--dm-text);
        background: var(--dm-surface);
        border-color: var(--dm-border);
    }
    :root[data-theme='dark'] .activity-pager-size select option,
    body.dark-mode .activity-pager-size select option {
        color: var(--dm-text);
        background: var(--dm-surface);
    }

    /* Hover help listing every logged operation, replacing the long intro
       sentence. Follows the .webhooks-event-help pattern: pure CSS, tooltip
       drawn with content: attr(data-tooltip). */
    .activity-help {
        position: relative;
        display: inline-flex;
        align-items: center;
        cursor: help;
    }
    .activity-help .lucide {
        width: 18px;
        height: 18px;
        background-color: var(--text-muted, #9ca3af);
        opacity: 0.6;
        transition: opacity 0.15s ease;
    }
    .activity-help:hover .lucide,
    .activity-help:focus-visible .lucide {
        opacity: 1;
    }
    .activity-help::after {
        content: attr(data-tooltip);
        position: absolute;
        top: calc(100% + 8px);
        /* Right-anchored: the icon sits near the middle-right of the hero, and
           a centred tooltip this tall would run off the viewport edge. */
        right: -10px;
        width: max-content;
        max-width: 340px;
        background: #1f2937;
        color: #f9fafb;
        border: 1px solid rgba(255, 255, 255, 0.15);
        font-size: 12px;
        line-height: 1.5;
        text-align: left;
        /* The tooltip content is a newline-separated list */
        white-space: pre-line;
        padding: 10px 12px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.15s ease;
        z-index: 50;
    }
    .activity-help:hover::after,
    .activity-help:focus-visible::after {
        opacity: 1;
        visibility: visible;
    }
    /* Touch screens have no hover: tapping toggles :focus instead. */
    @media (hover: none) {
        .activity-help:focus::after { opacity: 1; visibility: visible; }
    }

    .activity-admin-row {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: flex-end;
        justify-content: center;
        margin-top: 26px;
        padding-top: 18px;
        border-top: 1px solid var(--border-color, #e5e7eb);
    }
    .activity-admin-row form { display: flex; gap: 8px; align-items: flex-end; }
    .activity-admin-row label {
        display: block;
        font-size: 0.78rem;
        color: var(--text-muted, #777);
        margin-bottom: 4px;
    }

    @media (prefers-color-scheme: dark) {
        .act-danger { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
        .act-warn   { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
        .act-ok     { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
        .act-muted  { background: rgba(156, 163, 175, 0.18); color: #d1d5db; }
        .activity-notice { background: rgba(34, 197, 94, 0.18); color: #86efac; }
        .activity-notice.is-error { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
    }
    :root[data-theme="dark"] .act-danger { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
    :root[data-theme="dark"] .act-warn   { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
    :root[data-theme="dark"] .act-ok     { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
    :root[data-theme="dark"] .act-muted  { background: rgba(156, 163, 175, 0.18); color: #d1d5db; }
    :root[data-theme="dark"] .activity-notice { background: rgba(34, 197, 94, 0.18); color: #86efac; }
    :root[data-theme="dark"] .activity-notice.is-error { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
    :root[data-theme="light"] .act-danger { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
    :root[data-theme="light"] .act-warn   { background: rgba(245, 158, 11, 0.15); color: #b45309; }
    :root[data-theme="light"] .act-ok     { background: rgba(59, 130, 246, 0.12); color: #1d4ed8; }
    :root[data-theme="light"] .act-muted  { background: rgba(107, 114, 128, 0.14); color: #4b5563; }
    </style>
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
            <?php // Exports every matching entry, not just the visible page.
                  // The current filters are carried over so the file matches
                  // what is on screen. Nothing to export on an empty log. ?>
            <?php if ($totalEntries > 0): ?>
                <a href="<?php echo htmlspecialchars(activityExportUrl($filterAction, $filterSearch), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-primary">
                    <i class="lucide lucide-download" style="margin-right:5px;"></i><?php echo t_h('activity_log.export_csv', [], 'Export CSV'); ?>
                </a>
            <?php endif; ?>
        </div>
    </div>

    <div class="dr-page">
        <div class="dr-hero">
            <p>
                <?php echo t_h('activity_log.description', [], 'History of sensitive operations performed on this instance.'); ?>
                <span class="activity-help" tabindex="0"
                      role="img"
                      aria-label="<?php echo htmlspecialchars($loggedOperationsTooltip, ENT_QUOTES, 'UTF-8'); ?>"
                      data-tooltip="<?php echo htmlspecialchars($loggedOperationsTooltip, ENT_QUOTES, 'UTF-8'); ?>"><i class="lucide lucide-help-circle"></i></span>
            </p>
        </div>

        <?php if ($notice !== null): ?>
            <div class="activity-notice<?php echo $noticeError ? ' is-error' : ''; ?>">
                <?php echo htmlspecialchars($notice, ENT_QUOTES, 'UTF-8'); ?>
            </div>
        <?php endif; ?>

        <form method="get" class="activity-toolbar">
            <div class="home-search-container">
                <div class="home-search-wrapper">
                    <i class="lucide lucide-search home-search-icon"></i>
                    <input type="text" name="q" class="home-search-input"
                           value="<?php echo htmlspecialchars($filterSearch, ENT_QUOTES, 'UTF-8'); ?>"
                           placeholder="<?php echo t_h('activity_log.filter_placeholder', [], 'Search a user or a detail...'); ?>"
                           autocomplete="off">
                </div>
            </div>

            <select name="action_filter" class="activity-select" onchange="this.form.submit()">
                <option value=""><?php echo t_h('activity_log.filters.all_actions', [], 'All actions'); ?></option>
                <?php foreach (activityLogActions() as $act): ?>
                    <option value="<?php echo htmlspecialchars($act, ENT_QUOTES); ?>" <?php echo $filterAction === $act ? 'selected' : ''; ?>>
                        <?php echo t_h(activityActionKey($act), [], $act); ?>
                    </option>
                <?php endforeach; ?>
            </select>

            <button type="submit" class="btn btn-secondary">
                <i class="lucide lucide-filter" style="margin-right:5px;"></i><?php echo t_h('activity_log.filters.apply', [], 'Filter'); ?>
            </button>
            <?php if ($filterAction !== '' || $filterSearch !== ''): ?>
                <a href="activity-log.php" class="btn btn-secondary"><?php echo t_h('activity_log.filters.reset', [], 'Reset'); ?></a>
            <?php endif; ?>
        </form>

        <?php if (empty($entries)): ?>
            <div class="activity-empty">
                <i class="lucide lucide-inbox"></i>
                <p><?php echo t_h('activity_log.empty', [], 'No entry recorded yet.'); ?></p>
            </div>
        <?php else: ?>
            <div class="results-container table-scroll">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th><?php echo t_h('activity_log.columns.date', [], 'Date and time'); ?></th>
                            <th><?php echo t_h('activity_log.columns.user', [], 'User (ID)'); ?></th>
                            <th><?php echo t_h('activity_log.columns.action', [], 'Action'); ?></th>
                            <th><?php echo t_h('activity_log.columns.details', [], 'Details'); ?></th>
                            <th><?php echo t_h('activity_log.columns.source', [], 'Source'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($entries as $row): ?>
                            <?php
                                try {
                                    $dt = new DateTime($row['created_at'] . ' UTC');
                                    $dt->setTimezone($displayTz);
                                    $when = $dt->format('Y-m-d H:i:s');
                                } catch (Exception $e) {
                                    $when = (string)$row['created_at'];
                                }
                                $action  = (string)$row['action'];
                                $details = activityDetailsText($action, $row['details']);
                            ?>
                            <tr>
                                <td class="act-when"><?php echo htmlspecialchars($when, ENT_QUOTES, 'UTF-8'); ?></td>
                                <td class="act-user">
                                    <?php if (($row['username'] ?? '') !== ''): ?>
                                        <?php echo htmlspecialchars((string)$row['username'], ENT_QUOTES, 'UTF-8'); ?>
                                        <?php if ($row['user_id'] !== null): ?>
                                            <span class="act-user-id">(<?php echo (int)$row['user_id']; ?>)</span>
                                        <?php endif; ?>
                                    <?php else: ?>
                                        <span class="act-user-gone"><?php echo t_h('activity_log.unknown_user', [], 'unknown'); ?><?php echo $row['user_id'] !== null ? ' (' . (int)$row['user_id'] . ')' : ''; ?></span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="act-badge <?php echo activityActionTone($action); ?>">
                                        <i class="lucide <?php echo activityActionIcon($action); ?>"></i>
                                        <?php echo t_h(activityActionKey($action), [], $action); ?>
                                    </span>
                                </td>
                                <td class="act-details"><?php echo htmlspecialchars($details, ENT_QUOTES, 'UTF-8'); ?></td>
                                <td class="act-source"><?php echo htmlspecialchars((string)($row['source'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

            <?php // The pager always renders: even on a single page it carries
                  // the page-size selector, which is the only way back to a
                  // smaller size once "All" has been picked. ?>
            <div class="activity-pager">
                <?php if ($page > 1): ?>
                    <a href="<?php echo htmlspecialchars(activityPageUrl($page - 1, $filterAction, $filterSearch), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
                        <?php echo t_h('activity_log.pager.previous', [], 'Previous'); ?>
                    </a>
                <?php endif; ?>
                <span><?php echo t_h('activity_log.pager.status', ['page' => $page, 'pages' => $totalPages, 'total' => $totalEntries], 'Page {{page}} of {{pages}} — {{total}} entries'); ?></span>
                <?php if ($page < $totalPages): ?>
                    <a href="<?php echo htmlspecialchars(activityPageUrl($page + 1, $filterAction, $filterSearch), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
                        <?php echo t_h('activity_log.pager.next', [], 'Next'); ?>
                    </a>
                <?php endif; ?>

                <?php // A GET form so the choice works without JavaScript; the
                      // onchange just saves the extra click. Changing the size
                      // drops 'page' on purpose: the old page number points
                      // nowhere in a re-sliced list. ?>
                <form method="get" action="" class="activity-pager-size">
                    <?php if ($filterAction !== ''): ?>
                        <input type="hidden" name="action_filter" value="<?php echo htmlspecialchars($filterAction, ENT_QUOTES, 'UTF-8'); ?>">
                    <?php endif; ?>
                    <?php if ($filterSearch !== ''): ?>
                        <input type="hidden" name="q" value="<?php echo htmlspecialchars($filterSearch, ENT_QUOTES, 'UTF-8'); ?>">
                    <?php endif; ?>
                    <label for="activity-per-page"><?php echo t_h('activity_log.pager.per_page', [], 'Per page'); ?></label>
                    <select id="activity-per-page" name="per_page" onchange="this.form.submit()">
                        <?php foreach (ACTIVITY_LOG_PAGE_SIZES as $sizeOption): ?>
                            <option value="<?php echo $sizeOption; ?>"<?php echo $sizeOption === $pageSize ? ' selected' : ''; ?>>
                                <?php echo htmlspecialchars(activityPageSizeLabel($sizeOption), ENT_QUOTES, 'UTF-8'); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <noscript><button type="submit" class="btn btn-secondary"><?php echo t_h('common.ok', [], 'OK'); ?></button></noscript>
                </form>
            </div>
        <?php endif; ?>

        <div class="activity-admin-row">
            <form method="post">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="action" value="set_retention">
                <div>
                    <label for="retention_days"><?php echo t_h('activity_log.retention.label', [], 'Keep entries for'); ?></label>
                    <select name="retention_days" id="retention_days" class="activity-select">
                        <?php foreach ([30, 90, 365, 0] as $opt): ?>
                            <option value="<?php echo $opt; ?>" <?php echo $retentionDays === $opt ? 'selected' : ''; ?>>
                                <?php echo $opt === 0
                                    ? t_h('activity_log.retention.unlimited', [], 'Unlimited')
                                    : t_h('activity_log.retention.days', ['days' => $opt], '{{days}} days'); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <button type="submit" class="btn btn-secondary">
                    <i class="lucide lucide-save" style="margin-right:5px;"></i><?php echo t_h('activity_log.retention.save', [], 'Save'); ?>
                </button>
            </form>

            <!-- Opens the confirmation modal; the real form lives inside it.
                 Nothing to clear when the log is empty. -->
            <button type="button" class="btn btn-danger" id="clearLogBtn" <?php echo $totalStored === 0 ? 'disabled' : ''; ?>>
                <i class="lucide lucide-trash-2" style="margin-right:5px;"></i><?php echo t_h('activity_log.clear.button', [], 'Clear the log'); ?>
            </button>
        </div>
    </div>
</div>

<div class="modal" id="clearLogModal">
    <div class="modal-content">
        <h2 class="modal-title"><?php echo t_h('activity_log.clear.title', [], 'Clear the activity log'); ?></h2>
        <p><?php echo t_h('activity_log.clear.confirm', [], 'Delete every entry in the log? This cannot be undone.'); ?></p>
        <p class="delete-warning">
            <i class="lucide lucide-alert-triangle"></i>
            <?php echo t_h('activity_log.clear.warning', ['count' => $totalStored], '{{count}} entries will be permanently deleted.'); ?>
        </p>
        <form method="post">
            <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
            <input type="hidden" name="action" value="clear_log">
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" id="clearLogCancel"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="submit" class="btn btn-danger"><?php echo t_h('activity_log.clear.button', [], 'Clear the log'); ?></button>
            </div>
        </form>
    </div>
</div>

<script>
/* Cap the scroll wrapper to the viewport so its horizontal scrollbar never
   ends up below the fold; rows scroll vertically inside instead, under the
   sticky headers. Mirrors sizeUsersTableScroll() in admin/users.php.
   Below 769px admin-tools.css switches to its own narrow layout: leave the
   wrapper uncapped there so the page scrolls normally on a phone. */
function sizeActivityTableScroll() {
    const scroller = document.querySelector('.table-scroll');
    if (!scroller) return;
    if (window.matchMedia('(max-width: 768px)').matches) {
        scroller.style.maxHeight = '';
        return;
    }

    // Measure what actually sits below the table (pager, retention controls,
    // container padding, body margin) instead of guessing a fixed gap: a guess
    // that falls short leaves the page itself scrollable by a few pixels,
    // which shows up as a stray scrollbar on a large screen.
    scroller.style.maxHeight = '';
    const top = scroller.getBoundingClientRect().top + window.scrollY;
    const scrollerBottom = scroller.getBoundingClientRect().bottom + window.scrollY;
    const pageBottom = document.documentElement.scrollHeight;
    const below = Math.max(0, pageBottom - scrollerBottom);

    scroller.style.maxHeight = Math.max(240, window.innerHeight - top - below) + 'px';
}

document.addEventListener('DOMContentLoaded', sizeActivityTableScroll);
window.addEventListener('resize', sizeActivityTableScroll);

(function () {
    var modal = document.getElementById('clearLogModal');
    var openBtn = document.getElementById('clearLogBtn');
    var cancelBtn = document.getElementById('clearLogCancel');

    function open() { modal.classList.add('active'); cancelBtn.focus(); }
    function close() { modal.classList.remove('active'); openBtn.focus(); }

    openBtn.addEventListener('click', open);
    cancelBtn.addEventListener('click', close);

    // Backdrop click, matching the admin/users.php modals.
    modal.addEventListener('click', function (e) {
        if (e.target === modal) { close(); }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) { close(); }
    });
})();
</script>
</body>
</html>
