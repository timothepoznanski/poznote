<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';

require_once 'db_connect.php';

// Include page initialization
require_once 'page_init.php';

// Initialize search parameters (needed for workspace filter)
$search_params = initializeSearchParams();

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

// Get current user and language settings
$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

// Check if current user is admin (used multiple times in template)
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();

// Get cache version for assets
$cache_v = @file_get_contents('version.txt');
if ($cache_v === false) {
    $cache_v = time();
}
$cache_v = urlencode(trim($cache_v));

$app_version_display = trim(@file_get_contents('version.txt') ?: 'Unknown');
$app_version_display = htmlspecialchars($app_version_display, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

// Count workspaces
$workspaces_count = 0;
try {
    if (isset($con)) {
        $stmtWs = $con->prepare("SELECT COUNT(*) as cnt FROM workspaces");
        $stmtWs->execute();
        $workspaces_count = (int)$stmtWs->fetchColumn();
    }
} catch (Exception $e) {
    $workspaces_count = 0;
}

// Count users (for admin)
$users_count = 0;
if ($isAdmin) {
    try {
        require_once 'users/db_master.php';
        $users = listAllUserProfiles();
        $users_count = count($users);
    } catch (Exception $e) {
        $users_count = 0;
    }
}

?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('css/settings.css') ?: time(); ?>">
    <link rel="stylesheet" href="css/modals/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/specific-modals.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/attachments.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/link-modal.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/share-modal.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/background-image.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $cache_v; ?>">
</head>
<body class="home-page"
      data-txt-enabled="<?php echo t_h('common.enabled'); ?>"
      data-txt-disabled="<?php echo t_h('common.disabled'); ?>"
      data-txt-not-defined="<?php echo t_h('common.not_defined'); ?>"
      data-txt-saved="<?php echo t_h('common.saved'); ?>"
      data-txt-error="<?php echo t_h('common.error'); ?>"
    data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container">

        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>

        <div style="display: flex; justify-content: center; gap: 10px;">
            <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary go-to-nav-btn">
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
            <a id="backToHomeLink" href="home.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="btn btn-secondary go-to-nav-btn">
                <?php echo t_h('common.back_to_home', [], 'Back to Home', $currentLang); ?>
            </a>
        </div>

        <div class="home-search-container">
            <div class="home-search-wrapper">
                <i class="lucide lucide-search home-search-icon"></i>
                <input type="text" id="home-search-input" class="home-search-input" placeholder="<?php echo t_h('search.placeholder'); ?>" autocomplete="off">
            </div>
        </div>

        <!-- ACTIONS CATEGORY -->
        <h2 class="settings-category-title"><?php echo t_h('settings.categories.actions') . ' (' . $username . ')'; ?></h2>
        <div class="home-grid">

            <!-- Workspaces -->
            <div class="home-card settings-card-clickable" id="workspaces-card" data-href="workspaces.php">
                <div class="home-card-icon">
                    <i class="lucide lucide-layers"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.workspaces', [], 'Workspaces'); ?></span>
                    <span class="setting-status enabled"><?php echo $workspaces_count; ?></span>
                </div>
            </div>

            <!-- Change Password -->
            <div class="home-card" id="change-password-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-key"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.change_password', [], 'Change Password'); ?></span>
                    <span id="password-status-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Git Sync (available to all users) -->
            <div class="home-card settings-card-clickable" id="git-sync-card" data-href="git_sync.php">
                <div class="home-card-icon">
                    <?php
                    require_once 'GitSync.php';
                    $gitSyncSettings = new GitSync($con ?? null, $_SESSION['user_id'] ?? null);
                    $settingsGitProvider = $gitSyncSettings->getProvider();
                    $gitSyncIsConfigured = $gitSyncSettings->isConfigured();
                    $gitSyncIsEnabled = GitSync::isEnabled();
                    ?>
                    <i class="<?php echo ($settingsGitProvider === 'forgejo') ? 'lucide lucide-git-branch' : 'lucide lucide-github'; ?>"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.git_sync', [], 'Git Sync'); ?></span>
                    <span class="setting-status <?php echo (!$gitSyncIsEnabled) ? 'disabled' : ($gitSyncIsConfigured ? 'enabled' : 'disabled'); ?>">
                        <?php
                        if (!$gitSyncIsEnabled) {
                            echo t_h('common.disabled', [], 'Disabled');
                        } elseif ($gitSyncIsConfigured) {
                            echo t_h('git_sync.config.token_set', [], 'Configured');
                        } else {
                            echo t_h('git_sync.config.not_configured', [], 'Not configured');
                        }
                        ?>
                    </span>
                </div>
            </div>

            <?php if ($isAdmin): ?>
            <!-- Check for Updates -->
            <div class="home-card" id="check-updates-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-refresh-cw-alt"></i>
                    <span class="update-badge update-badge-hidden"></span>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.check_updates', [], 'Check for Updates'); ?></span>
                    <span class="setting-status enabled"><?php echo $app_version_display; ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- Backup / Export -->
            <a href="backup_export.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" id="backup-export-card" title="<?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?>">
                <div class="home-card-icon">
                    <i class="lucide lucide-upload"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></span>
                </div>
            </a>

            <!-- Restore / Import -->
            <a href="restore_import.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" id="restore-import-card" title="<?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?>">
                <div class="home-card-icon">
                    <i class="lucide lucide-download"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></span>
                </div>
            </a>

        </div>

        <!-- DISPLAY CATEGORY -->
        <h2 class="settings-category-title" id="display"><?php echo t_h('settings.categories.display') . ' (' . $username . ')'; ?></h2>
        <div class="home-grid">

            <?php if ($isAdmin): ?>
            <!-- Login Display -->
            <div class="home-card" id="login-display-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-user"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.login_display', [], 'Login page title'); ?></span>
                    <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- Language -->
            <div class="home-card" id="language-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-flag"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.language.label'); ?></span>
                    <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Theme Mode -->
            <div class="home-card" id="theme-mode-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-sun"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.theme_mode', [], 'Theme'); ?></span>
                    <span id="theme-mode-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Font Size -->
            <div class="home-card" id="font-size-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-type-height"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_font_size', [], 'Font size'); ?></span>
                    <div>
                        <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                        <span id="sidebar-font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                        <span id="code-block-font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                    </div>
                </div>
            </div>

            <!-- Index Icon Scale -->
            <div class="home-card" id="index-icon-scale-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-maximize-2"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.index_icon_scale', [], 'Index icon scaling'); ?></span>
                    <span id="index-icon-scale-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Timezone -->
            <div class="home-card" id="timezone-card">
                <div class="home-card-icon"><i class="lucide lucide-clock"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?></span>
                    <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Note Sort Order -->
            <div class="home-card" id="note-sort-card">
                <div class="home-card-icon"><i class="lucide lucide-arrow-up-down-amount-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?></span>
                    <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Tasklist Insert Order -->
            <div class="home-card" id="tasklist-insert-order-card">
                <div class="home-card-icon"><i class="lucide lucide-arrow-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?></span>
                    <span id="tasklist-insert-order-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Show Note Created -->
            <div class="home-card" id="show-created-card">
                <div class="home-card-icon"><i class="lucide lucide-calendar-alt"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.show_note_created', [], 'Show creation date'); ?></span>
                    <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Show Folder Counts -->
            <div class="home-card" id="folder-counts-card">
                <div class="home-card-icon"><i class="lucide lucide-hash"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.show_folder_counts', [], 'Show folder note counts'); ?></span>
                    <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span>
                </div>
            </div>

            <!-- Notes Without Folders Position -->
            <div class="home-card" id="notes-without-folders-card">
                <div class="home-card-icon"><i class="lucide lucide-folder-tree"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.notes_without_folders_after', [], 'Show notes after folders'); ?></span>
                    <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Note Width -->
            <div class="home-card desktop-only" id="note-width-card">
                <div class="home-card-icon"><i class="lucide lucide-move-horizontal"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_content_width', [], 'Note Content Width'); ?></span>
                    <span id="note-width-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Code Block Word Wrap -->
            <div class="home-card" id="code-wrap-card">
                <div class="home-card-icon"><i class="lucide lucide-code"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.code_block_word_wrap', [], 'Code block word wrap'); ?></span>
                    <span id="code-wrap-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span>
                </div>
            </div>

        </div>

        <?php if ($isAdmin): ?>
        <!-- ADMIN TOOLS CATEGORY -->
        <h2 class="settings-category-title" id="admin-tools"><?php echo t_h('settings.categories.admin_tools', [], 'Admin Tools'); ?></h2>
        <div class="home-grid" id="admin-tools-grid">

            <!-- User Management (Admin only) -->
            <div class="home-card settings-card-clickable" id="users-admin-card" data-href="admin/users.php">
                <div class="home-card-icon">
                    <i class="lucide lucide-users-cog"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?></span>
                    <span class="setting-status enabled"><?php echo $users_count; ?></span>
                </div>
            </div>

            <!-- Git Sync Global Toggle -->
            <div class="home-card" id="git-sync-enabled-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-git-branch"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.git_sync_toggle', [], 'Git Sync'); ?></span>
                    <span id="git-sync-enabled-status" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Import Limits -->
            <div class="home-card" id="import-limits-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-upload"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.import_limits', [], 'Import Limits'); ?></span>
                    <div>
                        <span id="import-limits-individual-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                        <span id="import-limits-zip-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                    </div>
                </div>
            </div>

            <!-- Custom CSS Path -->
            <div class="home-card" id="custom-css-card">
                <div class="home-card-icon">
                    <i class="lucide lucide-palette"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.custom_css', [], 'Custom CSS path'); ?></span>
                    <span id="custom-css-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Disaster Recovery -->
            <div class="home-card settings-card-clickable" id="disaster-recovery-card" data-href="admin/disaster-recovery.php">
                <div class="home-card-icon">
                    <i class="lucide lucide-database"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></span>
                </div>
            </div>

            <!-- Base64 Image Converter -->
            <div class="home-card settings-card-clickable" id="convert-images-card" data-href="admin/convert-images.php">
                <div class="home-card-icon">
                    <i class="lucide lucide-image"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.convert_images', [], 'Base64 Image Converter'); ?></span>
                </div>
            </div>

            <!-- Orphan Scanner -->
            <div class="home-card settings-card-clickable" id="orphan-scanner-card" data-href="admin/orphan-scanner.php">
                <div class="home-card-icon">
                    <i class="lucide lucide-scan"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.orphan_scanner', [], 'Orphan attachments scanner'); ?></span>
                </div>
            </div>

        </div>
        <?php endif; ?>

    </div>

    <?php include 'modals.php'; ?>
    <script src="js/modal-alerts.js"></script>
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script src="js/index-icon-scale-settings.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/index-icon-scale-settings.js') ?: time(); ?>"></script>
    <script src="js/note-width-settings.js"></script>
    <script src="js/background-settings.js"></script>
    <script src="js/copy-code-on-focus.js"></script>
    <script src="js/modals-events.js"></script>
    <script src="js/settings-page.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/settings-page.js') ?: time(); ?>"></script>
    <script src="js/change-password.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
