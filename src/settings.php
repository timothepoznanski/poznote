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
            <link rel="stylesheet" href="css/dark-mode.css">
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

include 'db_connect.php';

// Include page initialization
require_once 'page_init.php';

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);

// Get global login_display_name for page title
require_once 'users/db_master.php';
$login_display_name = getGlobalSetting('login_display_name', '');
$pageTitle = ($login_display_name && trim($login_display_name) !== '') 
    ? htmlspecialchars($login_display_name) 
    : t_h('app.name');

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
if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
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
    <title><?php echo $pageTitle; ?></title>
    <meta name="color-scheme" content="dark light">
    <?php 
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(trim($cache_v));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/all.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/light.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>">
</head>
<body data-txt-enabled="<?php echo t_h('common.enabled'); ?>"
      data-txt-disabled="<?php echo t_h('common.disabled'); ?>"
      data-txt-not-defined="<?php echo t_h('common.not_defined'); ?>"
      data-txt-saved="<?php echo t_h('common.saved'); ?>"
      data-txt-error="<?php echo t_h('common.error'); ?>"
      data-workspace="<?php echo htmlspecialchars(getWorkspaceFilter(), ENT_QUOTES, 'UTF-8'); ?>">
    <div class="settings-container">
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>

        <div class="settings-two-columns">
            <!-- Left Column: Actions (without badges) -->
            <div class="settings-column settings-column-left">
                <!-- Back to Notes -->
                <div class="settings-card settings-card-clickable" id="backToNotesLink" data-href="<?php echo $back_href; ?>">
                    <div class="settings-card-icon">
                        <i class="fas fa-arrow-left"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('common.back_to_notes'); ?></h3>
                    </div>
                </div>

                <!-- Workspaces -->
                <div class="settings-card settings-card-clickable" id="workspaces-card" data-href="workspaces.php">
                    <div class="settings-card-icon">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.workspaces', [], 'Workspaces'); ?> <span class="setting-status enabled"><?php echo $workspaces_count; ?></span></h3>
                    </div>
                </div>

                <?php // Profile and admin links - always available ?>
                
                <?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
                <!-- User Management (Admin only) -->
                <div class="settings-card settings-card-clickable" id="users-admin-card" data-href="admin/users.php">
                    <div class="settings-card-icon">
                        <i class="fas fa-users-cog"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?> <span class="setting-status enabled"><?php echo $users_count; ?></span></h3>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Backup / Export -->
                <div class="settings-card" id="backup-export-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-upload"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></h3>
                    </div>
                </div>

                <!-- Restore / Import -->
                <div class="settings-card" id="restore-import-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-download"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></h3>
                    </div>
                </div>

                <?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
                <!-- GitHub Sync -->
                <div class="settings-card settings-card-clickable" id="github-sync-card" data-href="github_sync.php">
                    <div class="settings-card-icon">
                        <i class="fab fa-github"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.github_sync', [], 'GitHub Sync'); ?></h3>
                    </div>
                </div>

                <?php endif; ?>

                <?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
                <!-- Check for Updates -->
                <div class="settings-card" id="check-updates-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-sync-alt"></i>
                        <span class="update-badge update-badge-hidden"></span>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.check_updates', [], 'Check for Updates'); ?></h3>
                    </div>
                </div>
                <?php endif; ?>

                <!-- API Documentation -->
                <div class="settings-card" id="api-docs-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-code"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.api_docs', [], 'API Documentation'); ?></h3>
                    </div>
                </div>

                <!-- Github repository -->
                <div class="settings-card" id="github-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-code-branch"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.documentation', [], 'Github Repository'); ?></h3>
                    </div>
                </div>

                <!-- News -->
                <div class="settings-card" id="news-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-newspaper"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.news', [], 'Poznote Blog'); ?></h3>
                    </div>
                </div>

                <!-- Poznote Website -->
                <div class="settings-card" id="website-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-globe"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.website', [], 'Poznote Website'); ?></h3>
                    </div>
                </div>

                <!-- Support Developer -->
                <div class="settings-card" id="support-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-heart heart-blink"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.support', [], 'Support Developer'); ?></h3>
                    </div>
                </div>
            </div>

            <!-- Right Column: Settings with badges -->
            <div class="settings-column settings-column-right">
                <!-- Mobile Separator -->
                <div class="settings-sep settings-sep-mobile"></div>
                
                <?php if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()): ?>
                <!-- Login Display -->
                <div class="settings-card" id="login-display-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.login_display', [], 'Login page title'); ?> <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Language -->
                <div class="settings-card" id="language-card">
                    <div class="settings-card-icon">
                        <i class="fal fa-flag"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.language.label'); ?> <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Theme Mode -->
                <div class="settings-card" id="theme-mode-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-sun"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.theme_mode', [], 'Theme'); ?> <span id="theme-mode-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Font Size -->
                <div class="settings-card" id="font-size-card">
                    <div class="settings-card-icon">
                        <i class="fas fa-text-height"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_font_size', [], 'Font size'); ?> 
                            <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                            <span id="sidebar-font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                        </h3>
                    </div>
                </div>

                <!-- Timezone -->
                <div class="settings-card" id="timezone-card">
                    <div class="settings-card-icon"><i class="fal fa-clock"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?> <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Note Sort Order -->
                <div class="settings-card" id="note-sort-card">
                    <div class="settings-card-icon"><i class="fas fa-sort-amount-down"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?> <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Tasklist Insert Order -->
                <div class="settings-card" id="tasklist-insert-order-card">
                    <div class="settings-card-icon"><i class="fas fa-arrow-down"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?> <span id="tasklist-insert-order-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Note Created -->
                <div class="settings-card" id="show-created-card">
                    <div class="settings-card-icon"><i class="fas fa-calendar-alt"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_note_created', [], 'Show creation date'); ?> <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Folder Counts -->
                <div class="settings-card" id="folder-counts-card">
                    <div class="settings-card-icon"><i class="fas fa-hashtag"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_folder_counts', [], 'Show folder note counts'); ?> <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Notes Without Folders Position -->
                <div class="settings-card" id="notes-without-folders-card">
                    <div class="settings-card-icon"><i class="fas fa-folder-tree"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.notes_without_folders_after', [], 'Show notes after folders'); ?> <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Note Width -->
                <div class="settings-card desktop-only" id="note-width-card">
                    <div class="settings-card-icon"><i class="fas fa-arrows-h"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_content_width', [], 'Note Content Width'); ?> <span id="note-width-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
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
    <script src="js/copy-code-on-focus.js"></script>
    <script src="js/modals-events.js"></script>
    <script src="js/settings-page.js"></script>
</body>
</html>
