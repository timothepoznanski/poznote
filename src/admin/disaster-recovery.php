<?php
/**
 * Disaster Recovery — Admin Tool
 *
 * Scans user folders and rebuilds the shared links registry (master.db).
 */
// phpcs:disable

require_once __DIR__ . '/../auth.php';
requireAuth();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">Access denied. Admin privileges required.</div>';
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../version_helper.php';

$v             = getAppVersion();
$currentLang   = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/restore_import/base.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/restore_import/cards.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/restore_import/forms-buttons.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/restore_import/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/restore_import/utilities.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/modals/base.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/modals/alerts-utilities.css?v=<?php echo $v; ?>">
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
    <script src="../js/globals.js?v=<?php echo $v; ?>"></script>
    <script>
    // Override loadPoznoteI18n with an absolute URL — globals.js uses a relative
    // path which breaks when the page is served from the admin/ subdirectory.
    window.loadPoznoteI18n = function() {
        return fetch('/api/v1/system/i18n', { credentials: 'same-origin' })
            .then(function(r) { return r.json(); })
            .then(function(j) {
                if (j && j.success && j.strings) {
                    window.POZNOTE_I18N = { lang: j.lang || 'en', strings: j.strings };
                    if (typeof window.applyI18nToDom === 'function') window.applyI18nToDom(document);
                }
            })
            .catch(function() {});
    };
    window.loadPoznoteI18n();
    </script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">

    <!-- Nav -->
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary btn-margin-right">
                <?php echo t_h('common.back_to_notes', [], 'Back to notes'); ?>
            </a>
            <a href="../settings.php" class="btn btn-secondary"><?php echo t_h('settings.title', [], 'Settings'); ?></a>
        </div>
    </div>

    <div class="dr-page">

        <!-- Hero -->
        <div class="dr-hero">
            <h1><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></h1>
            <p><?php echo t_h('multiuser.admin.maintenance.description', [], 'Poznote stores your notes in individual user folders. The main system index (master.db) tracks which user owns which folder. If you lose this index, this tool will scan your folders to automatically recreate the user accounts and restore all public sharing links.'); ?></p>
        </div>

        <!-- Action -->
        <div style="text-align:center; padding: 8px 0 40px;">
            <button type="button" class="btn btn-secondary btn-maintenance" data-action="run-repair">
                <?php echo t_h('multiuser.admin.maintenance.repair_registry', [], 'Reconstruction'); ?>
            </button>
        </div>

    </div>
</div>

<!-- Status Modal -->
<div class="modal" id="statusModal">
    <div class="modal-content">
        <h2 class="modal-title" id="statusModalTitle"></h2>
        <p id="statusModalMessage" style="white-space: pre-wrap; margin-bottom: 25px;"></p>
        <div class="form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="statusModalCancelBtn"></button>
            <button type="button" class="btn btn-primary" id="statusModalConfirmBtn"></button>
        </div>
    </div>
</div>

<script src="../js/restore-import.js?v=<?php echo $v; ?>"></script>
<script>
// Override runRepair to skip the confirmation dialog
async function runRepair(btn) {
    const title = tr('multiuser.admin.maintenance.repair_registry', 'Reconstruction');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="lucide lucide-loader-2 lucide-spin"></i> ' + tr('multiuser.admin.processing', 'Processing...');

    try {
        const response = await fetch('/api/v1/admin/repair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
        const result = await response.json();

        if (result.success) {
            let successMsg = tr('multiuser.admin.maintenance.repair_registry_success', "System registry repaired successfully:\n\n- {{scanned}} folders scanned\n- {{added}} users restored\n- {{links}} shared links rebuilt");
            successMsg = successMsg
                .replace('{{scanned}}', result.stats.users_scanned)
                .replace('{{added}}', result.stats.users_added)
                .replace('{{links}}', result.stats.links_rebuilt);

            if (result.stats.errors && result.stats.errors.length > 0) {
                successMsg += '\n\n' + tr('multiuser.admin.errors_label', 'Errors:') + '\n' + result.stats.errors.join('\n');
            }

            showStatusAlert(title, successMsg, () => window.location.reload());
        } else {
            const errorMsg = tr('multiuser.admin.maintenance.repair_registry_error', 'Repair error: {{error}}');
            showStatusAlert(title, errorMsg.replace('{{error}}', result.error));
        }
    } catch (e) {
        const networkErrorPrefix = tr('multiuser.admin.network_error', 'Network error: ');
        showStatusAlert(title, networkErrorPrefix + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
}
</script>
</body>
</html>
