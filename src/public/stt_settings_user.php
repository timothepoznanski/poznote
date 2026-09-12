<?php
/**
 * Personal transcription settings page
 *
 * Lets a user send their recordings to their own speech-to-text server
 * (Speaches, whisper.cpp, LocalAI, OpenAI, ...) with their own API key. The
 * configuration lives in the user's own database and replaces the instance-wide
 * one configured by an administrator in stt_settings.php. An administrator must
 * first allow personal transcription servers.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
requireActiveAccountOwner();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../version_helper.php';
requireSettingsPassword();
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../stt_config.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars(($currentUser['display_name'] ?? '') ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

$STT_PROVIDERS = poznoteSttProviders();
$STT_FIXED_URLS = poznoteSttFixedUrls();
$userKeysAllowed = poznoteSttUserKeysAllowed();

if ($userKeysAllowed && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $enabled = isset($_POST['stt_enabled']) ? '1' : '0';
    $provider = (string)($_POST['stt_provider'] ?? 'custom');
    if (!in_array($provider, $STT_PROVIDERS, true)) {
        $provider = 'custom';
    }
    $url = trim((string)($_POST['stt_url'] ?? ''));
    if (isset($STT_FIXED_URLS[$provider])) {
        $url = $STT_FIXED_URLS[$provider];
    }
    $model = trim((string)($_POST['stt_model'] ?? ''));
    $apiKey = trim((string)($_POST['stt_api_key'] ?? ''));
    $language = poznoteSttNormalizeLanguage($_POST['stt_language'] ?? '');

    if ($enabled === '1' && ($url === '' || $model === '')) {
        $error = t('stt_settings_user.messages.incomplete', [], 'Enter a server URL and a model before enabling your own transcription server.');
    } else {
        $toSave = [
            'enabled' => $enabled,
            'provider' => $provider,
            'url' => $url,
            'model' => $model,
            'language' => $language,
        ];
        // Masked placeholder means "keep the existing key"
        if ($apiKey !== '••••••••') {
            $toSave['api_key'] = $apiKey;
        }
        if (poznoteSaveSttUserConfig($con, $toSave)) {
            $message = t('stt_settings.messages.saved', [], 'Configuration saved successfully.');
        } else {
            $error = t('stt_settings.messages.save_error', [], 'Failed to save configuration.');
        }
    }
}

$sttConfig = poznoteSttUserConfig($con);
$sttProvider = poznoteSttGuessProvider($sttConfig['provider'], $sttConfig['url']);
$sttEnabled = $sttConfig['enabled'];
$sttLocalHost = aiChatLocalDefaultHost();
$sttSettingsScope = 'user';

// What transcription actually uses right now, so the page can say whether this
// personal configuration is the one answering
$effective = poznoteResolveSttConfig($con, (int)(getAuthenticatedUserId() ?? 0));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('stt_settings_user.title', [], 'My transcription server'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php $cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion())); ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <?php poznoteRenderStylesheets('stt_settings_user'); ?>
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include __DIR__ . '/../icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include __DIR__ . '/../back_to_settings.php'; ?>
    <h1 class="poznote-page-title"><i class="lucide lucide-mic"></i> <?php echo t_h('stt_settings_user.title', [], 'My transcription server'); ?></h1>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('stt_settings_user.description', [], 'Send your recordings to your own speech-to-text server, with your own API key. Your configuration replaces the one set by the administrator.'); ?></p>
        </div>

        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="lucide lucide-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($error): ?>
        <div class="alert alert-error">
            <i class="lucide lucide-alert-triangle-circle"></i>
            <?php echo htmlspecialchars($error); ?>
        </div>
        <?php endif; ?>

        <?php if (!$userKeysAllowed): ?>
        <div class="config-hint">
            <i class="lucide lucide-info"></i>
            <?php echo t_h('stt_settings_user.disabled_notice', [], 'Your administrator has not allowed personal transcription servers on this instance.'); ?>
        </div>
        <?php else: ?>

        <?php if ($effective['source'] === 'instance'): ?>
        <div class="config-hint">
            <i class="lucide lucide-info"></i>
            <?php echo t_h('stt_settings_user.using_instance', [], 'Transcription currently goes through the server set by the administrator. Enable your own configuration below to use yours instead.'); ?>
        </div>
        <?php endif; ?>

        <div class="git-sync-section">
            <h2><i class="lucide lucide-mic"></i> <?php echo t_h('stt_settings.config_title', [], 'Configuration'); ?></h2>

            <form method="post">
                <input type="hidden" name="action" value="save_config">

                <div class="git-config-fields">
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="stt_enabled" id="stt_enabled" <?php echo $sttEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('stt_settings_user.enable_label', [], 'Use my own server'); ?></span>
                            <span class="label-desc"><?php echo t_h('stt_settings_user.enable_description', [], 'Dictation and attachment transcription use the server and API key below instead of the instance ones.'); ?></span>
                        </div>
                    </div>

                    <?php include __DIR__ . '/../stt_settings_fields.php'; ?>

                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('ai_settings.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                </div>
            </form>
        </div>
        <?php endif; ?>

        <div class="git-sync-footer-note">
            <?php echo t_h('stt_settings.footer_note', [], 'Recordings are uploaded to Poznote and forwarded to the transcription server from there, not from the browser. Poznote keeps no copy: the audio is discarded once the text comes back, unless the user chooses to attach the recording to the note.'); ?>
        </div>

    </div>

    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <?php if ($userKeysAllowed): ?>
    <?php include __DIR__ . '/../stt_settings_script.php'; ?>
    <?php endif; ?>
</body>
</html>
