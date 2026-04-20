<?php
/**
 * Disaster Recovery — Admin Tool
 *
 * Scans user folders and rebuilds the shared links registry (master.db).
 */
// phpcs:disable

require_once __DIR__ . '/../auth.php';
requireAuth();
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
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
<div class="admin-container">

    <!-- Nav -->
    <div class="admin-header">
        <div class="admin-nav" style="justify-content:center;">
            <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary btn-margin-right">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes', [], 'Back to notes'); ?>
            </a>
            <a href="../settings.php" class="btn btn-secondary">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('settings.title', [], 'Settings'); ?>
            </a>
        </div>
    </div>

    <div class="dr-page">

        <!-- Hero -->
        <div class="dr-hero">
            <h1><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></h1>
            <p><?php echo t_h('multiuser.admin.maintenance.description', [], 'The main database (master.db) stores user information, their public links, and Poznote\'s global settings. If this file is lost or corrupted, or if some public links stop working after a restore, this tool scans your \"data/users\" folders to automatically re-register accounts, recover their real names from their personal databases, and restore all public sharing links.'); ?></p>
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
            <button type="button" class="btn btn-secondary" id="statusModalCancelBtn" style="display: none;"></button>
            <button type="button" class="btn btn-primary" id="statusModalConfirmBtn" style="display: none;"></button>
        </div>
    </div>
</div>

<script src="../js/disaster-recovery.js?v=<?php echo $v; ?>"></script>
</body>
</html>
