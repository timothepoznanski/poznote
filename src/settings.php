<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';

// Check if settings access is completely disabled
if (defined('DISABLE_SETTINGS_ACCESS') && DISABLE_SETTINGS_ACCESS === true) {
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8"/>
        <title>Access Denied</title>
        <link rel="stylesheet" href="css/fontawesome.min.css">
        <link rel="stylesheet" href="css/all.css">
        <link rel="stylesheet" href="css/access-denied.css">
    </head>
    <body class="access-denied-page">
        <div class="access-denied-modal">
            <i class="fas fa-lock"></i>
            <h1>Access Denied</h1>
            <p>Access to settings is disabled by administrator.</p>
            <button id="access-denied-return-btn">Return to Home</button>
        </div>
        <script src="js/access-denied.js"></script>
    </body>
    </html>
    <?php
    exit;
}

// Check if settings require password protection
if (defined('SETTINGS_PASSWORD') && SETTINGS_PASSWORD !== '') {
    // Session is already started by auth.php
    
    // Check if user has already authenticated for settings
    if (!isset($_SESSION['settings_authenticated']) || $_SESSION['settings_authenticated'] !== true) {
        $currentLang = getUserLanguage();
        ?>
        <!DOCTYPE html>
        <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
        <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
            <title><?php echo t_h('settings.password.title', [], 'Settings Access', $currentLang); ?> - Poznote</title>
            <meta name="color-scheme" content="dark light">
            <script src="js/theme-init.js"></script>
            <link rel="stylesheet" href="css/fontawesome.min.css">
            <link rel="stylesheet" href="css/light.min.css">
            <link rel="stylesheet" href="css/settings-password.css">
            <link rel="stylesheet" href="css/dark-mode/variables.css">
            <link rel="stylesheet" href="css/dark-mode/layout.css">
            <link rel="stylesheet" href="css/dark-mode/menus.css">
            <link rel="stylesheet" href="css/dark-mode/editor.css">
            <link rel="stylesheet" href="css/dark-mode/modals.css">
            <link rel="stylesheet" href="css/dark-mode/components.css">
            <link rel="stylesheet" href="css/dark-mode/pages.css">
            <link rel="stylesheet" href="css/dark-mode/markdown.css">
            <link rel="stylesheet" href="css/dark-mode/kanban.css">
            <link rel="stylesheet" href="css/dark-mode/icons.css">
            <link rel="icon" href="favicon.ico" type="image/x-icon">
        </head>
        <body>
            <div class="login-container">
                <div class="login-header">
                    <h1 class="login-title">Poznote</h1>
                    <p class="settings-subtitle"><?php echo t_h('settings.password.heading', [], 'Settings Protected', $currentLang); ?></p>
                </div>
                
                <form id="settings-password-form">
                    <div class="form-group">
                        <input type="password" id="settings-password-input" placeholder="<?php echo t_h('settings.password.placeholder', [], 'Enter password', $currentLang); ?>" required autofocus autocomplete="off">
                        <div id="settings-password-error" class="error"></div>
                    </div>
                    
                    <button type="submit" id="settings-password-submit" class="login-button">
                        <?php echo t_h('settings.password.submit', [], 'Access Settings', $currentLang); ?>
                    </button>
                    <button type="button" id="settings-password-cancel" class="login-button cancel-button">
                        <?php echo t_h('settings.password.cancel', [], 'Back to Home', $currentLang); ?>
                    </button>
                </form>
            </div>
            <script src="js/settings-password.js"></script>
        </body>
        </html>
        <?php
        exit;
    }
}

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
    <link rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/all.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/light.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/fontawesome.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
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

        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
            <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
                <?php echo t_h('common.back_to_notes'); ?>
            </a>
        </div>

        <div class="home-search-container">
            <div class="home-search-wrapper">
                <i class="fas fa-search home-search-icon"></i>
                <input type="text" id="home-search-input" class="home-search-input" placeholder="<?php echo t_h('search.placeholder'); ?>" autocomplete="off">
            </div>
        </div>

        <!-- ACTIONS CATEGORY -->
        <h2 class="settings-category-title"><?php echo t_h('settings.categories.actions', [], 'Actions'); ?></h2>
        <div class="home-grid">

            <!-- Workspaces -->
            <div class="home-card settings-card-clickable" id="workspaces-card" data-href="workspaces.php">
                <div class="home-card-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.workspaces', [], 'Workspaces'); ?></span>
                    <span class="setting-status enabled"><?php echo $workspaces_count; ?></span>
                </div>
            </div>

            <?php if ($isAdmin): ?>
            <!-- User Management (Admin only) -->
            <div class="home-card settings-card-clickable" id="users-admin-card" data-href="admin/users.php">
                <div class="home-card-icon">
                    <i class="fas fa-users-cog"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?></span>
                    <span class="setting-status enabled"><?php echo $users_count; ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- Backup / Export -->
            <div class="home-card" id="backup-export-card">
                <div class="home-card-icon">
                    <i class="fas fa-upload"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></span>
                </div>
            </div>

            <!-- Restore / Import -->
            <div class="home-card" id="restore-import-card">
                <div class="home-card-icon">
                    <i class="fas fa-download"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></span>
                </div>
            </div>

            <?php if ($isAdmin): ?>
            <!-- GitHub Sync -->
            <div class="home-card settings-card-clickable" id="github-sync-card" data-href="github_sync.php">
                <div class="home-card-icon">
                    <i class="fab fa-github"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.github_sync', [], 'GitHub Sync'); ?></span>
                </div>
            </div>

            <?php endif; ?>

            <?php if ($isAdmin): ?>
            <!-- Check for Updates -->
            <div class="home-card" id="check-updates-card">
                <div class="home-card-icon">
                    <i class="fas fa-sync-alt"></i>
                    <span class="update-badge update-badge-hidden"></span>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.check_updates', [], 'Check for Updates'); ?></span>
                </div>
            </div>
            <?php endif; ?>

        </div>

        <!-- DISPLAY CATEGORY -->
        <h2 class="settings-category-title"><?php echo t_h('settings.categories.display', [], 'Display'); ?></h2>
        <div class="home-grid">

            <?php if ($isAdmin): ?>
            <!-- Login Display -->
            <div class="home-card" id="login-display-card">
                <div class="home-card-icon">
                    <i class="fas fa-user"></i>
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
                    <i class="fal fa-flag"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.language.label'); ?></span>
                    <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Theme Mode -->
            <div class="home-card" id="theme-mode-card">
                <div class="home-card-icon">
                    <i class="fas fa-sun"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.theme_mode', [], 'Theme'); ?></span>
                    <span id="theme-mode-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Font Size -->
            <div class="home-card" id="font-size-card">
                <div class="home-card-icon">
                    <i class="fas fa-text-height"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_font_size', [], 'Font size'); ?></span>
                    <div>
                        <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                        <span id="sidebar-font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                    </div>
                </div>
            </div>

            <!-- Timezone -->
            <div class="home-card" id="timezone-card">
                <div class="home-card-icon"><i class="fal fa-clock"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?></span>
                    <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Note Sort Order -->
            <div class="home-card" id="note-sort-card">
                <div class="home-card-icon"><i class="fas fa-sort-amount-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?></span>
                    <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Tasklist Insert Order -->
            <div class="home-card" id="tasklist-insert-order-card">
                <div class="home-card-icon"><i class="fas fa-arrow-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?></span>
                    <span id="tasklist-insert-order-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Show Note Created -->
            <div class="home-card" id="show-created-card">
                <div class="home-card-icon"><i class="fas fa-calendar-alt"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.show_note_created', [], 'Show creation date'); ?></span>
                    <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Show Folder Counts -->
            <div class="home-card" id="folder-counts-card">
                <div class="home-card-icon"><i class="fas fa-hashtag"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.show_folder_counts', [], 'Show folder note counts'); ?></span>
                    <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span>
                </div>
            </div>

            <!-- Kanban on Folder Click -->
            <div class="home-card" id="kanban-folder-click-card">
                <div class="home-card-icon"><i class="fal fa-columns"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.kanban_on_folder_click', [], 'Open Kanban view on folder click'); ?></span>
                    <span id="kanban-folder-click-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Notes Without Folders Position -->
            <div class="home-card" id="notes-without-folders-card">
                <div class="home-card-icon"><i class="fas fa-folder-tree"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.notes_without_folders_after', [], 'Show notes after folders'); ?></span>
                    <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Note Width -->
            <div class="home-card desktop-only" id="note-width-card">
                <div class="home-card-icon"><i class="fas fa-arrows-h"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_content_width', [], 'Note Content Width'); ?></span>
                    <span id="note-width-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

        </div>

        <!-- ABOUT CATEGORY -->
        <h2 class="settings-category-title"><?php echo t_h('settings.categories.about', [], 'About'); ?></h2>
        <div class="home-grid">

            <!-- Version -->
            <a href="https://github.com/timothepoznanski/poznote/releases" target="_blank" class="home-card" id="version-card" title="<?php echo t_h('home.version', [], 'Version'); ?>">
                <div class="home-card-icon">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('home.version', [], 'Version'); ?></span>
                    <span class="home-card-count"><?php echo htmlspecialchars(trim(@file_get_contents('version.txt') ?: 'Unknown'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></span>
                </div>
            </a>

            <!-- Github repository -->
            <div class="home-card" id="github-card">
                <div class="home-card-icon">
                    <i class="fas fa-code-branch"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.documentation', [], 'Github Repository'); ?></span>
                </div>
            </div>

            <?php if ($isAdmin): ?>
            <!-- API Documentation -->
            <div class="home-card" id="api-docs-card">
                <div class="home-card-icon">
                    <i class="fas fa-code"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.api_docs', [], 'API Documentation'); ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- News -->
            <div class="home-card" id="news-card">
                <div class="home-card-icon">
                    <i class="fas fa-newspaper"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.news', [], 'Poznote Blog'); ?></span>
                </div>
            </div>

            <!-- Poznote Website -->
            <div class="home-card" id="website-card">
                <div class="home-card-icon">
                    <i class="fas fa-globe"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.website', [], 'Poznote Website'); ?></span>
                </div>
            </div>

            <!-- Support Developer -->
            <div class="home-card home-card-red" id="support-card">
                <div class="home-card-icon">
                    <i class="fas fa-heart heart-blink"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.support', [], 'Support Developer'); ?></span>
                </div>
            </div>

        </div>

    </div>

    <?php include 'modals.php'; ?>
    <script src="js/modal-alerts.js"></script>
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script src="js/note-width-settings.js"></script>
    <script src="js/background-settings.js"></script>
    <script src="js/copy-code-on-focus.js"></script>
    <script src="js/modals-events.js"></script>
    <script src="js/settings-page.js"></script>
</body>
</html>
