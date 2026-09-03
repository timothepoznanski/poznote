<?php
require 'auth.php';
requireAuth();
requireActiveAccountOwner();

require_once 'config.php';
require_once 'functions.php';

require_once 'db_connect.php';

// Include page initialization
require_once 'page_init.php';
require_once 'version_helper.php';

// Initialize search parameters (needed for workspace filter)
$search_params = initializeSearchParams();

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

// Get current user and language settings
$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$pageWorkspace = trim(getWorkspaceFilter());

// Check if current user is admin (used multiple times in template)
$isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();

// ============================================================
// SETTINGS PASSWORD PROTECTION
// ============================================================
if (defined('SETTINGS_PASSWORD') && SETTINGS_PASSWORD !== '') {
    $settingsPasswordError = false;

    if (isset($_POST['settings_password'])) {
        if (hash_equals(SETTINGS_PASSWORD, $_POST['settings_password'])) {
            $_SESSION['settings_password_authenticated'] = true;
        } else {
            $settingsPasswordError = true;
        }
    }

    if (empty($_SESSION['settings_password_authenticated'])) {
        $spCacheV = @file_get_contents('version.txt');
        if ($spCacheV === false) { $spCacheV = time(); }
        $spCacheV = urlencode(poznoteBuildAssetCacheVersion(trim($spCacheV)));
        $spBackHref = $note_id
            ? 'index.php?note=' . intval($note_id)
            : 'dashboard.php?workspace=' . urlencode($pageWorkspace);
        ?>
        <!doctype html>
        <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo t_h('settings_password.title', [], 'Settings Protected', $currentLang); ?></title>
            <meta name="color-scheme" content="dark light">
            <script src="js/theme-init.js?v=<?php echo $spCacheV; ?>"></script>
            <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $spCacheV; ?>">
            <link rel="stylesheet" href="css/public_folder.css?v=<?php echo $spCacheV; ?>">
        </head>
        <body class="password-page-body">
            <div class="password-container">
                <h2><?php echo t_h('settings_password.heading', [], 'Settings Access', $currentLang); ?></h2>
                <p><?php echo t_h('settings_password.description', [], 'A password is required to access the settings page.', $currentLang); ?></p>
                <?php if ($settingsPasswordError): ?>
                    <div class="error"><?php echo t_h('settings_password.error_incorrect', [], 'Incorrect password. Please try again.', $currentLang); ?></div>
                <?php endif; ?>
                <form method="POST" class="password-form">
                    <input type="password" name="settings_password" placeholder="<?php echo t_h('settings_password.placeholder', [], 'Enter settings password', $currentLang); ?>" required autofocus>
                    <button type="submit"><?php echo t_h('settings_password.unlock', [], 'Unlock', $currentLang); ?></button>
                </form>
                <a class="password-back-link" href="<?php echo htmlspecialchars($spBackHref, ENT_QUOTES, 'UTF-8'); ?>">&larr; <?php echo t_h('common.back', [], 'Back', $currentLang); ?></a>
            </div>
        </body>
        </html>
        <?php
        exit;
    }
}

// Get cache version for assets
$cache_v = @file_get_contents('version.txt');
if ($cache_v === false) {
    $cache_v = time();
}
$cache_v = urlencode(poznoteBuildAssetCacheVersion(trim($cache_v)));

$app_version_display = trim(@file_get_contents('version.txt') ?: 'Unknown');
$app_version_display = htmlspecialchars($app_version_display, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$settingsPageConfig = [
    'canUseSettingsApi' => !function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser(),
    'settings' => [],
    'passwordStatus' => null,
    'profile' => [
        'id' => (int)($currentUser['id'] ?? 0),
        'username' => (string)($currentUser['username'] ?? ''),
        'first_name' => (string)($currentUser['first_name'] ?? ''),
        'last_name' => (string)($currentUser['last_name'] ?? ''),
        'email' => (string)($currentUser['email'] ?? ''),
        'is_admin' => (bool)($currentUser['is_admin'] ?? false),
    ],
    'isOidcSession' => (($_SESSION['auth_method'] ?? '') === 'oidc'),
];

$settingsPageUserKeys = [
    'emoji_icons_enabled',
    'language',
    'show_note_created',
    'show_note_icons',
    'type_based_note_icons',
    'note_color_palette',
    'hide_folder_counts',
    'hide_folder_actions',
    'highlight_current_folder_tree',
    'notes_without_folders_after_folders',
    'markdown_split_card_view',
    'markdown_colored',
    'markdown_colored_custom',
    'code_block_word_wrap',
    'code_block_line_numbers',
    'attachment_previews_in_note',
    'attachments_at_bottom',
    'backlinks_at_bottom',
    'default_image_border_no_padding',
    'center_note_content',
    'note_list_sort',
    'note_age_filter_days',
    'tasklist_insert_order',
    'diary_default_note_type',
    'diary_date_format',
    'toolbar_mode',
    'timezone',
    'date_time_format',
    'hidden_ui_elements',
    'icon_sidebar_order',
    'settings_pinned_cards',
    'settings_recent_cards',
    'spellcheck_html_notes',
    'slash_menu_require_alt',
    'note_nav_shortcuts_enabled',
    'ctrl_s_save_enabled',
];

foreach ($settingsPageUserKeys as $settingsPageKey) {
    $settingsPageConfig['settings'][$settingsPageKey] = getSetting($settingsPageKey, '');
}

try {
    require_once 'users/db_master.php';
    $settingsPageUserId = getCurrentUserId();
    if ($settingsPageUserId && function_exists('hasCustomPassword')) {
        $settingsPageUserProfile = function_exists('getUserProfileById') ? getUserProfileById((int)$settingsPageUserId) : null;
        $settingsPagePasswordChangedAt = is_array($settingsPageUserProfile) ? ($settingsPageUserProfile['password_changed_at'] ?? null) : null;
        if (!empty($settingsPagePasswordChangedAt)) {
            // Stored by SQLite CURRENT_TIMESTAMP (UTC); show it in the user's timezone.
            $settingsPagePasswordChangedAt = convertUtcToUserTimezone($settingsPagePasswordChangedAt, getUserDateTimeFormatPattern() ?: 'Y-m-d H:i');
        }
        $settingsPageConfig['passwordStatus'] = [
            'has_custom_password' => hasCustomPassword((int)$settingsPageUserId),
            // Must mirror the API's password-status payload: this seed is what
            // the badge renders on page load, so omitting it would show
            // "Default" for a profile that has no password at all.
            'password_login_available' => hasCustomPassword((int)$settingsPageUserId)
                || !(is_array($settingsPageUserProfile) && isPasswordLoginDisabled($settingsPageUserProfile)),
            'password_changed_at' => $settingsPagePasswordChangedAt,
        ];
    }
} catch (Exception $e) {
    $settingsPageConfig['passwordStatus'] = null;
}

// Whether a local password is of any use to this user. Unusable in two cases:
// the instance is SSO-only, so no password would ever be accepted at login;
// or this profile was provisioned without a credential, so there is no current
// password to authenticate the change with. The card stays visible either way,
// greyed out and explaining itself, so the option does not just vanish.
$settingsChangePasswordDisabledReason = '';
try {
    $oidcPath = __DIR__ . '/oidc.php';
    if (is_file($oidcPath)) {
        require_once $oidcPath;
    }
    $settingsSsoOnly = function_exists('oidc_is_enabled')
        && oidc_is_enabled()
        && defined('OIDC_DISABLE_NORMAL_LOGIN')
        && OIDC_DISABLE_NORMAL_LOGIN;
    $settingsNoLocalCredential = isset($settingsPageConfig['passwordStatus']['password_login_available'])
        && $settingsPageConfig['passwordStatus']['password_login_available'] === false;
    if ($settingsSsoOnly) {
        $settingsChangePasswordDisabledReason = 'sso_only';
    } elseif ($settingsNoLocalCredential) {
        $settingsChangePasswordDisabledReason = 'no_local_password';
    }
} catch (Throwable $e) {
    // Never let this check disable a card that should be usable.
    $settingsChangePasswordDisabledReason = '';
}
$settingsChangePasswordDisabled = $settingsChangePasswordDisabledReason !== '';
// The card shows only the greyed title and its badge; the full explanation
// lives in the help tooltip so the card keeps its compact row layout.
$settingsChangePasswordDisabledHelp = $settingsChangePasswordDisabledReason === 'sso_only'
    ? t_h('settings.card_help.change_password_sso_only', [], 'This instance uses SSO only, so a local password would never be accepted at sign-in. Password changes are disabled.')
    : t_h('settings.card_help.change_password_no_local', [], 'Your account signs in through your identity provider and has no local password, so there is no current password to confirm a change with. An administrator can set one for you from Admin Tools > Users.');

if ($isAdmin) {
    try {
        require_once 'users/db_master.php';
        $settingsPageGlobalKeys = [
            'hidden_ui_elements_global',
            'login_display_name',
            'custom_css_path',
            'import_max_individual_files',
            'import_max_zip_files',
            'user_max_notes',
            'user_max_storage_mb',
            'user_max_storage_s3_mb',
            'user_max_backups_s3_mb',
            'git_sync_enabled',
            'tenant_isolation',
            'tenant_isolation_features',
            'tenant_isolation_applied_ui_keys',
        ];
        foreach ($settingsPageGlobalKeys as $settingsPageKey) {
            $settingsPageConfig['settings'][$settingsPageKey] = getGlobalSetting($settingsPageKey, '');
        }
    } catch (Exception $e) {
        // Keep the page usable if the master database is temporarily unavailable.
    }
}

// Count users (for admin)
$users_count = 0;
$smtp_enabled = false;
$smtp_configured = false;
$active_webhooks_count = 0;
if ($isAdmin) {
    try {
        require_once 'users/db_master.php';
        $users_count = countUserProfiles() ?? 0;
        $smtp_from_email = trim((string)getGlobalSetting('smtp_from_email', ''));
        $smtp_configured = trim((string)getGlobalSetting('smtp_host', '')) !== ''
            && filter_var($smtp_from_email, FILTER_VALIDATE_EMAIL);
        $smtp_enabled_setting = getGlobalSetting('smtp_enabled', null);
        $smtp_enabled = $smtp_configured
            && ($smtp_enabled_setting === null || $smtp_enabled_setting === '' || filter_var($smtp_enabled_setting, FILTER_VALIDATE_BOOLEAN));
        $active_webhooks_count = count(array_filter(listWebhooks(), static function ($webhook) {
            return !empty($webhook['active']) && isInstanceWebhook($webhook);
        }));
    } catch (Exception $e) {
        $users_count = 0;
        $smtp_enabled = false;
        $smtp_configured = false;
        $active_webhooks_count = 0;
    }
}

// User webhooks are personal to each account; tenant isolation can block
// them for non-admin users.
$active_user_webhooks_count = 0;
$canUseUserWebhooks = poznoteCanUseUserWebhooks();
if ($canUseUserWebhooks) {
    try {
        require_once 'users/db_master.php';
        $active_user_webhooks_count = count(array_filter(listWebhooksForUser((int)(getCurrentUserId() ?? 0)), static function ($webhook) {
            return !empty($webhook['active']);
        }));
    } catch (Exception $e) {
        $active_user_webhooks_count = 0;
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
    <link rel="manifest" href="pwa/manifest.webmanifest?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" sizes="512x512" type="image/png">
    <link rel="apple-touch-icon" href="pwa/poznote.png?v=<?php echo $cache_v; ?>">
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <script src="pwa/pwa.js?v=<?php echo $cache_v; ?>" defer></script>
    <link rel="stylesheet" href="css/fonts.css?v=<?php echo $cache_v; ?>">
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
    <link rel="stylesheet" href="css/modals/share-modal.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/alerts-utilities.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modals/ui-customization.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/background-image.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/custom-css.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="<?php echo poznoteAsset('css/dark-mode/modals.css'); ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>">
    <?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="home-page has-icon-sidebar"
      data-txt-enabled="<?php echo t_h('common.enabled'); ?>"
      data-txt-disabled="<?php echo t_h('common.disabled'); ?>"
      data-txt-not-defined="<?php echo t_h('common.not_defined'); ?>"
      data-txt-saved="<?php echo t_h('common.saved'); ?>"
      data-txt-error="<?php echo t_h('common.error'); ?>"
    data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include 'icon_sidebar.php'; ?>
    <div class="home-container">

        <h1 class="poznote-page-title">
            <i class="lucide lucide-settings"></i> <?php echo t_h('settings.title', [], 'Settings'); ?>
            <span id="settings-current-user-badge" class="settings-current-user-badge"><i class="lucide lucide-user"></i> <?php echo htmlspecialchars((string)($currentUser['username'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></span>
        </h1>

        <div class="home-search-container settings-filter-row">
            <button type="button" id="settingsViewToggle" class="settings-view-toggle"
                data-label-grid="<?php echo t_h('dashboard.view.layout_grid', [], 'Grid'); ?>"
                data-label-list="<?php echo t_h('dashboard.view.layout_list', [], 'List'); ?>">
                <i class="lucide lucide-layout-list"></i>
                <i class="lucide lucide-grid"></i>
            </button>
            <div class="home-search-wrapper">
                <i class="lucide lucide-search home-search-icon"></i>
                <input type="text" id="home-search-input" class="home-search-input" placeholder="<?php echo t_h('home.filter_placeholder', [], 'Filter...'); ?>" autocomplete="off">
                <button type="button" id="home-search-clear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
        </div>

        <!-- PINNED CARDS (filled by settings-page.js from the per-user pin list) -->
        <h2 class="settings-category-title" id="settings-pinned-section-title" hidden><?php echo t_h('settings.categories.pinned', [], 'Pinned'); ?></h2>
        <div class="home-grid" id="settings-pinned-section-grid" hidden></div>

        <!-- RECENT CARDS (filled by settings-page.js from the per-user click history) -->
        <h2 class="settings-category-title" id="settings-recent-section-title" hidden><?php echo t_h('settings.categories.recent', [], 'Recent'); ?></h2>
        <div class="home-grid" id="settings-recent-section-grid" hidden></div>

        <!-- ACTIONS CATEGORY -->
        <h2 class="settings-category-title" id="settings-actions-section-title"><?php echo t_h('settings.categories.actions'); ?></h2>
        <div class="home-grid" id="settings-actions-section-grid">

            <!-- My Profile (username, first/last name) -->
            <div class="home-card" id="my-profile-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.my_profile', [], 'View and edit your profile information.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-user"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('profile.card', [], 'My Profile'); ?></span>
                    <span id="profile-username-badge" class="setting-status enabled"><?php echo htmlspecialchars((string)($currentUser['username'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></span>
                </div>
            </div>

            <!-- Welcome setup wizard -->
            <div class="home-card settings-card-clickable" id="welcome-setup-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.welcome_setup', [], 'Review the startup guide and update your basic preferences.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-sparkles"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.welcome_setup', [], 'Startup guide'); ?></span>
                    <span class="setting-status enabled"><?php echo t_h('settings.welcome_setup.relaunch', [], 'Review'); ?></span>
                </div>
            </div>

            <!-- Change Password (greyed out when sign-in never uses a local password) -->
            <div class="home-card<?php echo $settingsChangePasswordDisabled ? ' home-card-disabled' : ''; ?>" id="change-password-card"<?php echo $settingsChangePasswordDisabled ? ' aria-disabled="true"' : ''; ?>>
                <span class="setting-help" data-tooltip="<?php echo $settingsChangePasswordDisabled
                    ? $settingsChangePasswordDisabledHelp
                    : t_h('settings.card_help.change_password', [], 'Change the password used to sign in.'); ?>"><i class="lucide lucide-help-circle"></i></span>
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
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.git_sync', [], 'Back up your notes to a Git repository and view the synchronization history.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <?php
                    require_once 'GitSync.php';
                    $gitSyncSettings = new GitSync($con ?? null, $_SESSION['user_id'] ?? null);
                    $settingsGitProvider = $gitSyncSettings->getProvider();
                    $gitSyncIsConfigured = $gitSyncSettings->isConfigured();
                    $gitSyncIsEnabled = GitSync::isEnabled();
                    ?>
                    <i class="<?php echo ($settingsGitProvider === 'forgejo') ? 'lucide lucide-git-branch' : (($settingsGitProvider === 'gitlab') ? 'lucide lucide-gitlab' : 'lucide lucide-github'); ?>"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.git_sync', [], 'Git Sync'); ?></span>
                    <span id="git-sync-status-badge" class="setting-status <?php echo (!$gitSyncIsEnabled) ? 'disabled' : ($gitSyncIsConfigured ? 'enabled' : 'disabled'); ?>">
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

            <!-- User Webhooks (per account; tenant isolation can block non-admins) -->
            <?php if ($canUseUserWebhooks): ?>
            <div class="home-card settings-card-clickable" id="user-webhooks-card" data-href="user-webhooks.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('webhooks_user.card_help', [], 'Send events about your own notes (reminder triggered, note created or shared) to external services such as ntfy or n8n via webhooks.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-webhook"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('webhooks_user.card', [], 'User Webhooks'); ?></span>
                    <span class="setting-status <?php echo $active_user_webhooks_count > 0 ? 'enabled' : 'disabled'; ?>">
                        <?php echo $active_user_webhooks_count > 0 ? $active_user_webhooks_count : t_h('webhooks_admin.status.none', [], 'None'); ?>
                    </span>
                </div>
            </div>
            <?php endif; ?>

            <!-- My AI Assistant (personal provider and API key) -->
            <div class="home-card settings-card-clickable" id="ai-assistant-user-card" data-href="ai_settings_user.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('ai_settings_user.card_help', [], 'Use the AI assistant with your own provider and API key.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-bot"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('ai_settings_user.card', [], 'My AI Assistant'); ?></span>
                    <?php
                    require_once 'ai_config.php';
                    $aiUserKeysAllowedCard = poznoteAiUserKeysAllowed();
                    $aiUserConfigCard = poznoteAiUserConfig($con);
                    $aiUserHasConfigCard = $aiUserConfigCard['url'] !== '' && $aiUserConfigCard['model'] !== '';
                    $aiUserActiveCard = $aiUserKeysAllowedCard && poznoteAiConfigUsable($aiUserConfigCard);
                    ?>
                    <span class="setting-status <?php echo $aiUserActiveCard ? 'enabled' : 'disabled'; ?>">
                        <?php
                        if ($aiUserActiveCard) {
                            echo t_h('common.enabled', [], 'Enabled');
                        } elseif ($aiUserKeysAllowedCard && !$aiUserHasConfigCard) {
                            echo t_h('git_sync.config.not_configured', [], 'Not configured');
                        } else {
                            echo t_h('common.disabled', [], 'Disabled');
                        }
                        ?>
                    </span>
                </div>
            </div>

            <!-- Browser Extension -->
            <a href="https://chromewebstore.google.com/detail/poznote-url-saver/bmjclfamahegmgillaghhmnbkjebipbh" target="_blank" rel="noopener noreferrer" class="home-card" id="extension-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.extension', [], 'Install the browser extension to save web pages into Poznote.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-chrome"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.install_extension', [], 'Install extension'); ?></span>
                </div>
            </a>

            <!-- Install App -->
            <div class="home-card" id="install-app-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.install_app', [], 'Install Poznote as an application on your device (PWA).'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-smartphone"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.install_app', [], 'Install application'); ?></span>
                    <span id="install-app-status" class="setting-status disabled"><?php echo t_h('settings.install_app.status.unavailable', [], 'Unavailable'); ?></span>
                </div>
            </div>

            <!-- Backup / Export -->
            <a href="backup_export.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" id="backup-export-card" title="<?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?>">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.backup_export', [], 'Download your notes, attachments and database as a backup.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-upload"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.backup_export', [], 'Backup / Export'); ?></span>
                </div>
            </a>

            <!-- Restore / Import -->
            <a href="restore_import.php?workspace=<?php echo urlencode($pageWorkspace); ?>" class="home-card" id="restore-import-card" title="<?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?>">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.restore_import', [], 'Restore a backup or import notes into this instance.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-download"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.restore_import', [], 'Restore / Import'); ?></span>
                </div>
            </a>

            <!-- Storage Statistics (own account) -->
            <div class="home-card settings-card-clickable" id="storage-stats-user-card" data-href="storage-stats-user.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.storage_stats_user', [], 'See how much storage your notes and attachments use.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-pie-chart"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.storage_stats_user', [], 'User Storage statistics'); ?></span>
                </div>
            </div>

            <?php if (getCurrentUserId() !== 1): // user ID 1 is the permanent super-admin and can never be deleted ?>
            <!-- Delete Account -->
            <div class="home-card home-card-red" id="delete-account-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.delete_account', [], 'Permanently delete your account and all its data.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-trash-2"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.delete_account', [], 'Delete Account'); ?></span>
                </div>
            </div>
            <?php endif; ?>

        </div>

        <!-- DISPLAY CATEGORY -->
        <h2 class="settings-category-title" id="display"><?php echo t_h('settings.categories.display'); ?></h2>
        <div class="home-grid" id="settings-display-section-grid">

            <?php if ($isAdmin): ?>
            <!-- Login Display -->
            <div class="home-card" id="login-display-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.login_display', [], 'Customize the title displayed on the login page.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-user"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.login_display', [], 'Login page title'); ?></span>
                    <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- App Font -->
            <div class="home-card" id="main-font-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.main_font', [], 'Choose the font used throughout the application.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-type"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.main_font', [], 'App font'); ?></span>
                    <span id="main-font-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Markdown Editor Font -->
            <div class="home-card" id="markdown-font-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.markdown_font', [], 'Choose the font used in the markdown editor.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-file-code"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.markdown_font', [], 'Markdown editor font'); ?></span>
                    <span id="markdown-font-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Font Size -->
            <div class="home-card" id="font-size-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.font_size', [], 'Adjust the font size of notes, sidebar and code blocks.'); ?>"><i class="lucide lucide-help-circle"></i></span>
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
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.index_icon_scale', [], 'Adjust the size of the icons in the note list.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-maximize-2"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.index_icon_scale', [], 'Index icon scaling'); ?></span>
                    <span id="index-icon-scale-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Show Note Created / Show Note Icons: moved to the "Element
                 visibility" modal (panel:note-created-date, panel:note-icons). -->

            <!-- Type-based Default Note Icons -->
            <div class="home-card" id="type-note-icons-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.type_based_note_icons', [], 'Use a specific default icon for task lists and markdown notes so they can be told apart in the notes list.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-list-todo"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.type_based_note_icons', [], 'Icons by note type'); ?></span>
                    <span id="type-note-icons-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span>
                </div>
            </div>

            <!-- Highlight Current Folder Tree -->
            <div class="home-card" id="folder-tree-highlight-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.highlight_current_folder_tree', [], 'Dim the notes and folders that sit outside the folder hierarchy you are working in.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-folder-tree"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.highlight_current_folder_tree', [], 'Highlight current folder tree'); ?></span>
                    <span id="folder-tree-highlight-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Note Color Palette -->
            <div class="home-card" id="note-color-palette-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.note_color_palette', [], 'Customize the color palette available for notes.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-palette"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_color_palette', [], 'Note colors'); ?></span>
                    <span id="note-color-palette-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Show Folder Counts: moved to the "Element visibility" modal
                 (panel:folder-note-count). -->

            <!-- Note Width -->
            <div class="home-card desktop-only" id="note-width-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.note_width', [], 'Adjust the maximum width of the note content.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-move-horizontal"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_content_width', [], 'Note Content Width'); ?></span>
                    <span id="note-width-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Markdown Split Card View -->
            <div class="home-card" id="markdown-split-card-view-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.markdown_split_card_view', [], 'Display markdown notes in a framed split view with editor and preview.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-columns-2"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.markdown_split_card_view', [], 'Framed markdown'); ?></span>
                    <span id="markdown-split-card-view-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Colored Markdown -->
            <div class="home-card" id="markdown-colored-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.markdown_colored', [], 'Color markdown notes: pick a color for each heading level, inline code, code block background, quotes, table headers and separators.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-palette"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.markdown_colored', [], 'Colored markdown'); ?></span>
                    <span id="markdown-colored-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Code Block Line Numbers -->
            <div class="home-card" id="code-line-numbers-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.code_line_numbers', [], 'Show line numbers in code blocks in the markdown preview.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-list-ordered"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.code_block_line_numbers', [], 'Code block line numbers'); ?></span>
                    <span id="code-line-numbers-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Attachment Previews in Notes -->
            <div class="home-card" id="attachment-previews-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.attachment_previews', [], 'Show previews of attachments inside notes.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-file-image"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.attachment_previews_in_note', [], 'Attachment previews'); ?></span>
                    <span id="attachment-previews-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Default Image Border (No Padding) -->
            <div class="home-card" id="default-image-border-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.default_image_border', [], 'Display images in notes with a border and no padding by default.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-image"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.default_image_border_no_padding', [], 'Default image border (no padding)'); ?></span>
                    <span id="default-image-border-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- UI Customization. Administrators edit their own set and the
                 instance-wide one from the same modal (data-ui-admin). -->
            <div class="home-card" id="ui-customization-card"<?php echo $isAdmin ? ' data-ui-admin="1"' : ''; ?>>
                <span class="setting-help" data-tooltip="<?php echo $isAdmin
                    ? t_h('settings.card_help.ui_customization_admin', [], 'Hide interface elements you do not use, for yourself or for every user of this instance.')
                    : t_h('settings.card_help.ui_customization', [], 'Hide interface elements you do not use.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-eye-off"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.ui_customization', [], 'UI Customization'); ?></span>
                    <span id="ui-customization-badge" class="setting-status enabled"><?php echo t_h('display.badges.ui_customization_configure', [], 'Configure'); ?></span>
                </div>
            </div>

            <!-- Icon Sidebar Order -->
            <div class="home-card" id="icon-sidebar-order-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.icon_sidebar_order', [], 'Change the order of the buttons in the icon sidebar.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-arrow-up-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.icon_sidebar_order', [], 'Icon sidebar order'); ?></span>
                    <span id="icon-sidebar-order-badge" class="setting-status enabled"><?php echo t_h('display.badges.icon_sidebar_order_configure', [], 'Configure'); ?></span>
                </div>
            </div>

        </div>

        <!-- BEHAVIOR CATEGORY -->
        <h2 class="settings-category-title" id="behavior"><?php echo t_h('settings.categories.behavior', [], 'Behavior'); ?></h2>
        <div class="home-grid" id="settings-behavior-section-grid">

            <!-- Language -->
            <div class="home-card" id="language-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.language', [], 'Change the language of the interface.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-flag"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.language.label'); ?></span>
                    <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Timezone -->
            <div class="home-card" id="timezone-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.timezone', [], 'Set the timezone used to display dates and times.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-clock"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.timezone', [], 'Timezone'); ?></span>
                    <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Date and Time Format -->
            <div class="home-card" id="date-time-format-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.date_time_format', [], 'Choose how dates and times are displayed.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-calendar"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.date_time_format', [], 'Date & time format'); ?></span>
                    <span id="date-time-format-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Note Sort Order -->
            <div class="home-card" id="note-sort-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.note_sort', [], 'Choose how notes are ordered in the list.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-arrow-up-down-amount-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_sort_order', [], 'Note sorting'); ?></span>
                    <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Note Age Filter -->
            <div class="home-card" id="note-age-filter-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.note_age_filter', [], 'Only show notes updated within the chosen number of days.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-filter"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_age_filter', [], 'Note age filter'); ?></span>
                    <span id="note-age-filter-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Notes Without Folders Position -->
            <div class="home-card" id="notes-without-folders-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.notes_without_folders', [], 'Show notes without a folder after the folder list instead of before.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-folder-tree"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.notes_without_folders_after', [], 'Show notes after folders'); ?></span>
                    <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Tasklist Insert Order -->
            <div class="home-card" id="tasklist-insert-order-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.tasklist_insert_order', [], 'Choose whether new tasks are added to the top or the bottom of task lists.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-arrow-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.tasklist_insert_order', [], 'Task list insert order'); ?></span>
                    <span id="tasklist-insert-order-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Diary Entry Note Type -->
            <div class="home-card" id="diary-note-type-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.diary_note_type', [], 'Choose the note format used for new diary entries.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-book-open"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.diary_default_note_type', [], 'Diary entry format'); ?></span>
                    <span id="diary-note-type-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Diary Entry Date Format -->
            <div class="home-card" id="diary-date-format-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.diary_date_format', [], 'Choose the date format used to title new diary entries.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-calendar-alt"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.diary_date_format', [], 'Diary entry date format'); ?></span>
                    <span id="diary-date-format-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Attachments at Bottom -->
            <div class="home-card" id="attachments-at-bottom-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.attachments_at_bottom', [], 'Show the attachments section at the bottom of notes instead of the top.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-paperclip"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.attachments_at_bottom', [], 'Attachments at bottom'); ?></span>
                    <span id="attachments-at-bottom-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Backlinks at Bottom -->
            <div class="home-card" id="backlinks-at-bottom-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.backlinks_at_bottom', [], 'Show the backlinks section at the bottom of notes instead of the top.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-link"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.backlinks_at_bottom', [], 'Backlinks at bottom'); ?></span>
                    <span id="backlinks-at-bottom-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Code Block Word Wrap -->
            <div class="home-card" id="code-wrap-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.code_wrap', [], 'Wrap long lines in code blocks instead of scrolling horizontally.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-code"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.code_block_word_wrap', [], 'Code block word wrap'); ?></span>
                    <span id="code-wrap-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span>
                </div>
            </div>

            <!-- Spellcheck in HTML notes -->
            <div class="home-card" id="spellcheck-html-notes-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.spellcheck_html_notes', [], 'Enable the browser spell checker in HTML notes.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-list-check"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.spellcheck_html_notes', [], 'Spell check'); ?></span>
                    <span id="spellcheck-html-notes-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Slash menu trigger -->
            <div class="home-card" id="slash-menu-require-alt-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.slash_menu_require_alt', [], 'Choose whether the command menu opens by typing / or Alt + /.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-keyboard"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.slash_menu_require_alt', [], 'Command menu shortcut'); ?></span>
                    <span id="slash-menu-require-alt-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Note navigation shortcuts (Alt + Arrow) -->
            <div class="home-card" id="note-nav-shortcuts-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.note_nav_shortcuts', [], 'Switch to the previous or next note in the current folder with Alt + ↑/↓.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-arrow-up-down"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.note_nav_shortcuts', [], 'Switch notes with Alt + ↑/↓'); ?></span>
                    <span id="note-nav-shortcuts-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

            <!-- Save shortcut (Ctrl + S) -->
            <div class="home-card" id="ctrl-s-save-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.ctrl_s_save', [], 'Save the current note immediately with Ctrl + S (Cmd + S on Mac).'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon"><i class="lucide lucide-save"></i></div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('display.cards.ctrl_s_save', [], 'Save note with Ctrl + S'); ?></span>
                    <span id="ctrl-s-save-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span>
                </div>
            </div>

        </div>

        <?php if ($isAdmin): ?>
        <!-- ADMIN TOOLS CATEGORY -->
        <h2 class="settings-category-title" id="admin-tools"><?php echo t_h('settings.categories.admin_tools', [], 'Admin Tools'); ?></h2>
        <div class="home-grid" id="admin-tools-grid">

            <!-- User Management (Admin only) -->
            <div class="home-card settings-card-clickable" id="users-admin-card" data-href="admin/users.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.users_admin', [], 'Create, edit and manage user accounts.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-users-cog"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.user_management', [], 'User Management'); ?></span>
                    <span class="setting-status enabled"><?php echo $users_count; ?></span>
                </div>
            </div>

            <!-- OIDC Configuration -->
            <div class="home-card settings-card-clickable" id="oidc-config-card" data-href="admin/oidc.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.oidc_config', [], 'Configure single sign-on with an OpenID Connect provider.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-shield"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.oidc_config', [], 'OIDC / SSO'); ?></span>
                    <span class="setting-status <?php echo (defined('OIDC_ENABLED') && OIDC_ENABLED) ? 'enabled' : 'disabled'; ?>">
                        <?php echo (defined('OIDC_ENABLED') && OIDC_ENABLED) ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                    </span>
                </div>
            </div>

            <!-- SMTP Configuration -->
            <div class="home-card settings-card-clickable" id="smtp-config-card" data-href="admin/smtp.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.smtp_config', [], 'Configure the SMTP server used to send emails such as reminders.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-mail"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.smtp_config', [], 'SMTP / Email'); ?></span>
                    <span class="setting-status <?php echo ($smtp_enabled && $smtp_configured) ? 'enabled' : 'disabled'; ?>">
                        <?php
                        if ($smtp_enabled && $smtp_configured) {
                            echo t_h('common.enabled', [], 'Enabled');
                        } elseif ($smtp_configured) {
                            echo t_h('common.disabled', [], 'Disabled');
                        } else {
                            echo t_h('smtp_admin.status.not_configured', [], 'Not configured');
                        }
                        ?>
                    </span>
                </div>
            </div>

            <!-- Outgoing Webhooks -->
            <div class="home-card settings-card-clickable" id="webhooks-card" data-href="admin/webhooks.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.webhooks', [], 'Send instance events to external services via webhooks.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-webhook"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.webhooks', [], 'Admin Webhooks'); ?></span>
                    <span class="setting-status <?php echo $active_webhooks_count > 0 ? 'enabled' : 'disabled'; ?>">
                        <?php echo $active_webhooks_count > 0 ? $active_webhooks_count : t_h('webhooks_admin.status.none', [], 'None'); ?>
                    </span>
                </div>
            </div>

            <!-- AI Assistant (instance-wide configuration) -->
            <div class="home-card settings-card-clickable" id="ai-assistant-card" data-href="ai_settings.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.ai_assistant', [], 'Configure the AI assistant used to chat with your notes.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-bot"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.ai_assistant', [], 'AI Assistant'); ?></span>
                    <?php
                    require_once 'ai_config.php';
                    // Three states, like the SMTP card: a switched-on assistant
                    // with no server or no model is not "disabled", it is
                    // waiting for the rest of its configuration.
                    $aiInstanceCard = poznoteAiInstanceConfig();
                    $aiInstanceCompleteCard = $aiInstanceCard['url'] !== '' && $aiInstanceCard['model'] !== '';
                    $aiChatEnabledCard = $aiInstanceCard['enabled'] && $aiInstanceCompleteCard;
                    ?>
                    <span class="setting-status <?php echo $aiChatEnabledCard ? 'enabled' : 'disabled'; ?>">
                        <?php
                        if ($aiChatEnabledCard) {
                            echo t_h('common.enabled', [], 'Enabled');
                        } elseif (!$aiInstanceCompleteCard) {
                            echo t_h('git_sync.config.not_configured', [], 'Not configured');
                        } else {
                            echo t_h('common.disabled', [], 'Disabled');
                        }
                        ?>
                    </span>
                </div>
            </div>

            <!-- SaaS mode display elements (instance-wide configuration) -->
            <div class="home-card settings-card-clickable" id="saas-card" data-href="saas_settings.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.saas', [], 'Display elements meant for instances offered as a hosted service (SaaS). All hidden by default.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-briefcase"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.saas', [], 'SaaS mode'); ?></span>
                    <?php $saasNoticesEnabledCard = poznoteSaasNoticesEnabled(); ?>
                    <span class="setting-status <?php echo $saasNoticesEnabledCard ? 'enabled' : 'disabled'; ?>">
                        <?php echo $saasNoticesEnabledCard ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                    </span>
                </div>
            </div>

            <!-- S3 Attachment Storage (instance-wide configuration) -->
            <div class="home-card settings-card-clickable" id="s3-storage-card" data-href="s3_settings.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.s3_storage', [], 'Store note attachments in an S3-compatible object storage instead of the local disk.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-cloud"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.s3_storage', [], 'S3 Attachments'); ?></span>
                    <?php
                    require_once 'storage/AttachmentStorage.php';
                    $s3StorageEnabledCard = AttachmentStorage::isEnabled();
                    ?>
                    <span class="setting-status <?php echo $s3StorageEnabledCard ? 'enabled' : 'disabled'; ?>">
                        <?php echo $s3StorageEnabledCard ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                    </span>
                </div>
            </div>

            <!-- S3 Backups (instance-wide configuration) -->
            <div class="home-card settings-card-clickable" id="s3-backup-card" data-href="s3_backup_settings.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.s3_backup', [], 'Upload complete backup archives to an S3-compatible bucket, manually or on a schedule.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-archive"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.s3_backup', [], 'S3 Backups'); ?></span>
                    <?php
                    require_once 'S3BackupService.php';
                    $s3BackupEnabledCard = S3BackupService::isEnabled();
                    ?>
                    <span class="setting-status <?php echo $s3BackupEnabledCard ? 'enabled' : 'disabled'; ?>">
                        <?php echo $s3BackupEnabledCard ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                    </span>
                </div>
            </div>

            <!-- Git Sync Global Toggle -->
            <div class="home-card" id="git-sync-enabled-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.git_sync_enabled', [], 'Enable or disable Git synchronization on this instance.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-git-branch"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.git_sync_toggle', [], 'Git Sync'); ?></span>
                    <span id="git-sync-enabled-status" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Tenant isolation (SaaS mode) -->
            <div class="home-card" id="tenant-isolation-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.tenant_isolation', [], 'SaaS mode: choose which capabilities are blocked for non-admin users, such as discovering the other accounts of the instance or registering personal webhooks. Leave everything unchecked for a family or team instance.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-shield"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.tenant_isolation', [], 'Tenant isolation'); ?></span>
                    <span id="tenant-isolation-status" class="setting-status"><?php echo t_h('common.loading'); ?></span>
                </div>
            </div>

            <!-- Import Limits -->
            <div class="home-card" id="import-limits-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.import_limits', [], 'Set the maximum number of files allowed per import.'); ?>"><i class="lucide lucide-help-circle"></i></span>
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

            <!-- Per-user quotas -->
            <div class="home-card" id="user-quotas-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.user_quotas', [], 'Limit the number of notes and the storage available per user.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-gauge"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.user_quotas', [], 'User quotas'); ?></span>
                    <div>
                        <?php
                        // The badge lists one value per quota the instance
                        // actually has; the data-* flags tell the script which
                        // optional pools are in play.
                        require_once 'storage/AttachmentStorage.php';
                        ?>
                        <span id="user-quotas-badge" class="setting-status"
                            <?php echo AttachmentStorage::isEnabled() ? 'data-s3-attachments="1"' : ''; ?>
                            <?php echo poznoteS3BackupConfigured() ? 'data-s3-backups="1"' : ''; ?>><?php echo t_h('common.loading'); ?></span>
                    </div>
                </div>
            </div>

            <!-- Custom CSS Path -->
            <div class="home-card" id="custom-css-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.custom_css', [], 'Apply your own CSS to customize the appearance of Poznote.'); ?>"><i class="lucide lucide-help-circle"></i></span>
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
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.disaster_recovery', [], 'Restore the instance from a backup in case of data loss.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-database"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('multiuser.admin.maintenance.title', [], 'Disaster Recovery'); ?></span>
                </div>
            </div>

            <!-- Orphan Scanner -->
            <div class="home-card settings-card-clickable" id="orphan-scanner-card" data-href="admin/orphan-scanner.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.orphan_scanner', [], 'Find and clean up attachment files that no longer belong to any note.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-scan"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.orphan_scanner', [], 'Orphan attachments scanner'); ?></span>
                </div>
            </div>

            <!-- Activity Log -->
            <div class="home-card settings-card-clickable" id="activity-log-card" data-href="admin/activity-log.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.activity_log', [], 'Review sensitive operations: account deletions, backups, restores, trash emptying and workspace deletions.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-clipboard-list"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.activity_log', [], 'Activity log'); ?></span>
                </div>
            </div>

            <!-- Storage Statistics -->
            <div class="home-card settings-card-clickable" id="storage-stats-card" data-href="admin/storage-stats.php">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.storage_stats', [], 'See storage usage across all users of this instance.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-pie-chart"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.storage_stats', [], 'Admin storage statistics'); ?></span>
                </div>
            </div>

        </div>
        <?php endif; ?>

        <!-- ABOUT CATEGORY (grid id kept as -documentation- so saved collapse
             state and pinned cards survive the rename) -->
        <h2 class="settings-category-title" id="settings-documentation-section-title"><?php echo t_h('settings.categories.documentation', [], 'About'); ?></h2>
        <div class="home-grid" id="settings-documentation-section-grid">

            <!-- Version: the former "Check for Updates" card of the Actions
                 section, kept under its own id so saved pins and the
                 "Element visibility" entry keep working. Visible to every
                 user: the /system/updates endpoint is not admin-only. -->
            <div class="home-card" id="check-updates-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.check_updates', [], 'Check whether a newer version of Poznote is available.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-refresh-cw-alt"></i>
                    <span class="update-badge update-badge-hidden"></span>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.version', [], 'Version'); ?></span>
                    <span class="setting-status enabled"><?php echo $app_version_display; ?></span>
                </div>
            </div>

            <!-- Help card (SaaS mode): shown to every user when enabled and
                 at least one channel (community URL, contact email) is
                 configured; each block only appears when its value is set. -->
            <?php
            $saasHelpEnabled        = poznoteSaasAdminContactEnabled();
            $saasAdminContactEmail  = $saasHelpEnabled ? poznoteSaasAdminContactEmail() : '';
            $saasCommunityUrl       = $saasHelpEnabled ? poznoteSaasCommunityUrl() : '';
            ?>
            <?php if ($saasHelpEnabled && ($saasAdminContactEmail !== '' || $saasCommunityUrl !== '')): ?>
            <div class="home-card" id="admin-contact-card" role="button" tabindex="0" style="cursor:pointer"
                 data-email="<?php echo htmlspecialchars($saasAdminContactEmail, ENT_QUOTES); ?>"
                 data-modal-title="<?php echo t_h('settings.cards.admin_contact', [], 'Help'); ?>"
                 data-generic-title="<?php echo t_h('saas.admin_contact_modal_generic_title', [], 'General question'); ?>"
                 data-generic-text="<?php echo t_h('saas.admin_contact_modal_generic', [], 'Post it in the community space so everyone can benefit from the answer:'); ?>"
                 data-link-url="<?php echo htmlspecialchars($saasCommunityUrl, ENT_QUOTES); ?>"
                 data-link-label="<?php echo t_h('saas.admin_contact_modal_link_label', [], 'Community forum'); ?>"
                 data-account-title="<?php echo t_h('saas.admin_contact_modal_account_title', [], 'About your account'); ?>"
                 data-account-text="<?php echo t_h('saas.admin_contact_modal_account', [], 'Write to the administrator at this address:'); ?>"
                 data-copy-label="<?php echo t_h('saas.admin_contact_copy', [], 'Copy'); ?>"
                 data-copied-label="<?php echo t_h('saas.admin_contact_copied', [], 'Copied!'); ?>">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.admin_contact', [], 'Where to ask your questions: the community space, or the administrator for anything about your account.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-help-circle"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.admin_contact', [], 'Help'); ?></span>
                    <?php if ($saasAdminContactEmail !== ''): ?>
                    <span class="setting-status enabled"><?php echo htmlspecialchars($saasAdminContactEmail); ?></span>
                    <?php endif; ?>
                </div>
            </div>
            <?php endif; ?>

            <!-- GitHub documentation -->
            <a href="https://github.com/timothepoznanski/poznote" target="_blank" rel="noopener noreferrer" class="home-card" id="github-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.github', [], 'Open the Poznote source code on GitHub.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-github"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.documentation', [], 'Documentation GitHub'); ?></span>
                </div>
            </a>

            <?php if ($isAdmin): ?>
            <!-- API REST -->
            <div class="home-card" id="api-rest-card" role="button" tabindex="0">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.api_rest', [], 'Show information about the Poznote REST API.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-code"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.api_rest', [], 'API REST'); ?></span>
                </div>
            </div>
            <?php endif; ?>

            <!-- Poznote Website -->
            <a href="https://poznote.com" target="_blank" rel="noopener noreferrer" class="home-card" id="website-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.website', [], 'Open the official Poznote website.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-globe"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.website', [], 'Poznote Website'); ?></span>
                </div>
            </a>

            <!-- Support -->
            <a href="https://ko-fi.com/timothepoznanski" target="_blank" rel="noopener noreferrer" class="home-card" id="support-card">
                <span class="setting-help" data-tooltip="<?php echo t_h('settings.card_help.support', [], 'Support the development of Poznote with a donation.'); ?>"><i class="lucide lucide-help-circle"></i></span>
                <div class="home-card-icon">
                    <i class="lucide lucide-heart"></i>
                </div>
                <div class="home-card-content">
                    <span class="home-card-title"><?php echo t_h('settings.cards.support', [], 'Support Poznote'); ?></span>
                </div>
            </a>

        </div>

    </div>

    <?php if ($isAdmin): ?>
    <div id="apiRestModal" class="modal">
        <div class="modal-content">
            <h3><?php echo t_h('modals.api_rest.title', [], 'API REST'); ?></h3>
            <div class="modal-buttons" style="flex-wrap: nowrap; justify-content: space-between;">
                <button type="button" class="btn-primary" id="openGithubApiDocsBtn" style="flex: 1 1 0;"><?php echo t_h('modals.api_rest.github_option', [], 'GitHub'); ?></button>
                <button type="button" class="btn-primary" id="openSwaggerApiBtn" style="flex: 1 1 0;"><?php echo t_h('modals.api_rest.swagger_option', [], 'Swagger'); ?></button>
                <button type="button" class="btn-danger" id="closeApiRestModalBtn" style="flex: 1 1 0;"><?php echo t_h('common.cancel'); ?></button>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <?php include 'modals.php'; ?>
    <script type="application/json" id="page-config-data"><?php
        echo json_encode($settingsPageConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
    ?></script>
    <script src="<?php echo poznoteAsset('js/modal-alerts.js'); ?>"></script>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
    <script src="<?php echo poznoteAsset('js/ui.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/utils.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/font-size-settings.js'); ?>"></script>
    <script src="js/index-icon-scale-settings.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/index-icon-scale-settings.js') ?: time(); ?>"></script>
    <script src="<?php echo poznoteAsset('js/note-width-settings.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/background-settings.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/copy-code-on-focus.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/modals-events.js'); ?>"></script>
    <script>
    // Factory palette, used by the "Reset to defaults" action in the editor.
    window.NOTE_COLOR_DEFAULT_PALETTE = <?php echo json_encode(getDefaultNoteColorPalette(), JSON_UNESCAPED_UNICODE); ?>;
    // id => localized name, and id => every shipped name for that color, so the
    // editor can translate built-in entries the user never renamed.
    window.NOTE_COLOR_LOCALIZED_NAMES = <?php echo json_encode(getLocalizedNoteColorNames(), JSON_UNESCAPED_UNICODE); ?>;
    window.NOTE_COLOR_KNOWN_NAMES = <?php echo json_encode(getKnownNoteColorNames(), JSON_UNESCAPED_UNICODE); ?>;
    </script>
    <script src="js/settings-page.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/settings-page.js') ?: time(); ?>"></script>
    <script src="js/ui-customization.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/change-password.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/change-password.js') ?: time(); ?>"></script>
    <!-- js/profile.js (My Profile card and modal) is loaded by icon_sidebar.php,
         which every page carrying the rail includes. -->
    <script src="js/delete-account.js?v=<?php echo $cache_v; ?>&m=<?php echo @filemtime('js/delete-account.js') ?: time(); ?>"></script>
</body>
</html>
