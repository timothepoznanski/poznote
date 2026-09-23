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

require_once __DIR__ . '/../auth.php';
requireAuth();
requireAdmin();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../version_helper.php';
requireSettingsPassword();
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';

$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $showNotices = isset($_POST['saas_show_storage_notices']) ? '1' : '0';
    if (setGlobalSetting('saas_show_storage_notices', $showNotices)) {
        $message = t('saas.messages.saved', [], 'Configuration saved successfully.');
    } else {
        $error = t('saas.messages.save_error', [], 'Failed to save configuration.');
    }
}

$showStorageNotices = poznoteSaasNoticesEnabled();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('settings.cards.saas', [], 'SaaS mode'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php
    // getAppVersion() reads version.txt through an absolute path. Reading it
    // relatively broke when the entry points moved into src/public/: the file
    // stayed one level up, so this fell back to time() and changed the asset
    // URL on every single page load.
    $cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/session-guard.js?v=<?php echo $cache_v; ?>"></script>
    <?php poznoteRenderStylesheets('saas_settings'); ?>
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
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
    <?php $iconSidebarWorkspace = $pageWorkspace; include __DIR__ . '/../icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include __DIR__ . '/../back_to_settings.php'; ?>
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
