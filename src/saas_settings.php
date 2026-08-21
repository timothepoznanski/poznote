<?php
/**
 * SaaS mode settings page (admin only)
 *
 * Groups display options that only make sense when the instance is offered
 * as a hosted service (SaaS): elements reminding users of the intended use
 * of the product, storage notices, and similar. Everything here is hidden
 * by default so a personal or self-hosted instance is not affected.
 * Settings live in master.db (global_settings) and apply to the whole
 * instance.
 */

require 'auth.php';
requireAuth();
requireAdmin();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'users/db_master.php';

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $showNotices = isset($_POST['saas_show_storage_notices']) ? '1' : '0';
    $showAdminContact = isset($_POST['saas_show_admin_contact']) ? '1' : '0';
    $contactEmail = trim((string)($_POST['saas_admin_contact_email'] ?? ''));
    $communityUrl = trim((string)($_POST['saas_community_url'] ?? ''));
    if ($contactEmail !== '' && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
        $error = t('saas.messages.invalid_email', [], 'The contact email address is not valid.');
    } elseif ($communityUrl !== '' && (!filter_var($communityUrl, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $communityUrl))) {
        $error = t('saas.messages.invalid_url', [], 'The community URL is not valid.');
    } elseif (setGlobalSetting('saas_show_storage_notices', $showNotices)
        && setGlobalSetting('saas_show_admin_contact', $showAdminContact)
        && setGlobalSetting('saas_admin_contact_email', $contactEmail)
        && setGlobalSetting('saas_community_url', $communityUrl)) {
        $message = t('saas.messages.saved', [], 'Configuration saved successfully.');
    } else {
        $error = t('saas.messages.save_error', [], 'Failed to save configuration.');
    }
}

$showStorageNotices     = poznoteSaasNoticesEnabled();
$showAdminContact       = poznoteSaasAdminContactEnabled();
$configuredContactEmail = trim((string)getGlobalSetting('saas_admin_contact_email', ''));
$configuredCommunityUrl = trim((string)getGlobalSetting('saas_community_url', ''));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('settings.cards.saas', [], 'SaaS mode'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(poznoteBuildAssetCacheVersion(trim($cache_v)));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/git-sync.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <style>
    /* No grey strip behind the toggle rows on this page, in either theme. */
    .form-check,
    body.dark-mode .form-check {
        background: none;
        padding-left: 0;
        padding-right: 0;
    }
    /* Breathing room around the input groups: below each one, and between
       the toggle row and the first field that follows it. */
    .git-field-group {
        margin-bottom: 24px;
    }
    .form-check + .git-field-group {
        margin-top: 20px;
    }
    </style>
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include 'icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include 'back_to_settings.php'; ?>
    <h1 class="poznote-page-title"><i class="lucide lucide-briefcase"></i> <?php echo t_h('settings.cards.saas', [], 'SaaS mode'); ?></h1>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('saas.description', [], 'Display elements that make sense when this instance is offered as a hosted service (SaaS). Everything here is hidden by default.'); ?></p>
        </div>

        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="lucide lucide-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($error): ?>
        <div class="alert alert-error">
            <i class="lucide lucide-alert-triangle"></i>
            <?php echo htmlspecialchars($error); ?>
        </div>
        <?php endif; ?>

        <form method="post">
            <input type="hidden" name="action" value="save_config">
            <div class="git-sync-section">
                <h2><i class="lucide lucide-hard-drive"></i> <?php echo t_h('saas.section_storage_notices', [], 'Storage notices'); ?></h2>
                <div class="form-check">
                    <label class="switch">
                        <input type="checkbox" name="saas_show_storage_notices" id="saas_show_storage_notices" <?php echo $showStorageNotices ? 'checked' : ''; ?>>
                        <span class="slider round"></span>
                    </label>
                    <div class="check-label">
                        <span class="label-title"><?php echo t_h('saas.storage_notices_label', [], 'Show storage usage notices'); ?></span>
                        <span class="label-desc"><?php echo t_h('saas.storage_notices_description', [], 'Reminds users that Poznote is a note-taking app, not a photo or video storage service, on the attachment pages, the user storage statistics page and the S3 attachments settings.'); ?></span>
                    </div>
                </div>
            </div>

            <div class="git-sync-section">
                <h2><i class="lucide lucide-help-circle"></i> <?php echo t_h('settings.cards.admin_contact', [], 'Help'); ?></h2>
                <div class="form-check">
                    <label class="switch">
                        <input type="checkbox" name="saas_show_admin_contact" id="saas_show_admin_contact" <?php echo $showAdminContact ? 'checked' : ''; ?>>
                        <span class="slider round"></span>
                    </label>
                    <div class="check-label">
                        <span class="label-title"><?php echo t_h('saas.admin_contact_label', [], 'Show a Help card'); ?></span>
                        <span class="label-desc"><?php echo t_h('saas.admin_contact_description', [], 'Adds a Help card in the About section of the settings, for every user, pointing to the community space and, when an address is set below, to the administrator by email.'); ?></span>
                    </div>
                </div>

                <div class="git-field-group">
                    <label class="git-field-label" for="saas_admin_contact_email"><?php echo t_h('saas.admin_contact_email_label', [], 'Email address to display'); ?></label>
                    <input type="text" name="saas_admin_contact_email" id="saas_admin_contact_email" class="git-field-input"
                           value="<?php echo htmlspecialchars($configuredContactEmail, ENT_QUOTES); ?>">
                </div>

                <div class="git-field-group">
                    <label class="git-field-label" for="saas_community_url"><?php echo t_h('saas.community_url_label', [], 'URL to display'); ?></label>
                    <input type="text" name="saas_community_url" id="saas_community_url" class="git-field-input"
                           value="<?php echo htmlspecialchars($configuredCommunityUrl, ENT_QUOTES); ?>">
                </div>
            </div>

            <div class="git-field-actions">
                <button type="submit" class="btn btn-primary">
                    <i class="lucide lucide-save"></i>
                    <?php echo t_h('s3_settings.save', [], 'Save Configuration'); ?>
                </button>
            </div>
        </form>
    </div>
    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
