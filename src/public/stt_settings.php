<?php
/**
 * Transcription settings page (admin only)
 *
 * Configure the connection to a speech-to-text server exposing the OpenAI
 * audio API (Speaches, whisper.cpp, LocalAI, OpenAI, ...) used to turn voice
 * into note text. The configuration is stored in master.db (global_settings)
 * and applies to the whole instance.
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
require_once __DIR__ . '/../stt_config.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars(($currentUser['display_name'] ?? '') ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

$STT_PROVIDERS = poznoteSttProviders();
// Providers whose URL is fixed (the URL field is hidden in the UI)
$STT_FIXED_URLS = poznoteSttFixedUrls();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
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

    $userKeysEnabled = isset($_POST['stt_user_keys_enabled']) ? '1' : '0';

    $saved = setGlobalSetting('stt_enabled', $enabled)
        && setGlobalSetting('stt_user_keys_enabled', $userKeysEnabled)
        && setGlobalSetting('stt_provider', $provider)
        && setGlobalSetting('stt_url', $url)
        && setGlobalSetting('stt_model', $model)
        && setGlobalSetting('stt_language', $language);
    // Masked placeholder means "keep the existing key"
    if ($saved && $apiKey !== '••••••••') {
        $saved = setGlobalSetting('stt_api_key', $apiKey);
    }

    // Per-user access. The checkbox list only shows eligible profiles, so
    // anything else posted is ignored.
    $postedSttUsers = $_POST['stt_user_ids'] ?? [];
    if (!is_array($postedSttUsers)) {
        $postedSttUsers = [];
    }
    if ($saved) {
        $saved = setSttUsers(array_map('intval', $postedSttUsers));
    }
    if ($saved) {
        $message = t('stt_settings.messages.saved', [], 'Configuration saved successfully.');
    } else {
        $error = t('stt_settings.messages.save_error', [], 'Failed to save configuration.');
    }
}

$sttConfig = poznoteSttInstanceConfig();
$sttProvider = poznoteSttGuessProvider($sttConfig['provider'], $sttConfig['url']);
$sttEnabled = $sttConfig['enabled'];
$sttUserCandidates = listSttCandidates();
$sttUserKeysEnabled = poznoteSttUserKeysAllowed();
$sttLocalHost = aiChatLocalDefaultHost();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('stt_settings.title', [], 'Transcription'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php $cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion())); ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <?php poznoteRenderStylesheets('stt_settings'); ?>
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include __DIR__ . '/../icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include __DIR__ . '/../back_to_settings.php'; ?>
    <h1 class="poznote-page-title"><i class="lucide lucide-mic"></i> <?php echo t_h('settings.cards.stt', [], 'Transcription'); ?></h1>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('stt_settings.description', [], 'Connect Poznote to a speech-to-text server so voice can be turned into note text. Any server speaking the OpenAI audio API works, including self-hosted Whisper servers, and the audio never leaves the machine that runs it.'); ?></p>
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
                            <span class="label-title"><?php echo t_h('stt_settings.enable_label', [], 'Enable transcription'); ?></span>
                            <span class="label-desc"><?php echo t_h('stt_settings.enable_description', [], 'Adds a Dictate entry to the slash menu of every note, and a Transcribe action on audio attachments.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group" id="stt-users-group">
                        <label class="git-field-label"><?php echo t_h('stt_settings.users_label', [], 'Users allowed to use the transcription server configured by the administrator'); ?></label>
                        <span class="label-desc"><?php echo t_h('stt_settings.users_description', [], 'Only the selected users can dictate and transcribe with the configuration on this page. New users have no access until you add them here.'); ?></span>
                        <input type="search" id="stt-user-filter" class="git-field-input ai-user-filter"
                               placeholder="<?php echo t_h('stt_settings.users_filter_placeholder', [], 'Filter users'); ?>"
                               autocomplete="off">
                        <div class="ai-user-list">
                            <?php foreach ($sttUserCandidates as $candidate): ?>
                                <?php
                                    $candidateId = (int)$candidate['id'];
                                    $candidateUsername = (string)$candidate['username'];
                                    $candidateName = trim(trim((string)($candidate['first_name'] ?? '')) . ' ' . trim((string)($candidate['last_name'] ?? '')));
                                    if ($candidateName === '') {
                                        $candidateName = $candidateUsername;
                                    }
                                    // The second line only adds information when it is not
                                    // just the name again
                                    $candidateMeta = ($candidateName === $candidateUsername) ? '' : $candidateUsername;
                                    if (!empty($candidate['is_admin'])) {
                                        $adminTag = t('ai_settings.users_admin', [], 'Administrator');
                                        $candidateMeta = ($candidateMeta === '') ? $adminTag : $candidateMeta . ' · ' . $adminTag;
                                    }
                                ?>
                                <label class="ai-user" for="stt_user_<?php echo $candidateId; ?>">
                                    <input
                                        type="checkbox"
                                        id="stt_user_<?php echo $candidateId; ?>"
                                        name="stt_user_ids[]"
                                        value="<?php echo $candidateId; ?>"
                                        <?php echo !empty($candidate['stt_enabled']) ? 'checked' : ''; ?>>
                                    <span class="ai-user-copy">
                                        <span class="ai-user-name"><?php echo htmlspecialchars($candidateName, ENT_QUOTES, 'UTF-8'); ?></span>
                                        <?php if ($candidateMeta !== ''): ?>
                                        <span class="ai-user-meta"><?php echo htmlspecialchars($candidateMeta, ENT_QUOTES, 'UTF-8'); ?></span>
                                        <?php endif; ?>
                                    </span>
                                </label>
                            <?php endforeach; ?>
                            <div class="ai-user-empty" id="stt-user-filter-empty" hidden><?php echo t_h('ai_settings.users_filter_empty', [], 'No user matches this filter.'); ?></div>
                        </div>
                    </div>

                    <?php include __DIR__ . '/../stt_settings_fields.php'; ?>

                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="stt_user_keys_enabled" id="stt_user_keys_enabled" <?php echo $sttUserKeysEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('stt_settings.user_keys_label', [], 'Allow personal transcription servers'); ?></span>
                            <span class="label-desc"><?php echo t_h('stt_settings.user_keys_description', [], 'Every user gets a Transcription card in their own settings, where they can enter their own server and API key. When a user does so, their audio goes to that server rather than the one on this page, whether or not that user appears in the list above.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('ai_settings.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                </div>
            </form>
        </div>

        <div class="git-sync-footer-note">
            <?php echo t_h('stt_settings.footer_note', [], 'Recordings are uploaded to Poznote and forwarded to the transcription server from there, not from the browser. Poznote keeps no copy: the audio is discarded once the text comes back, unless the user chooses to attach the recording to the note.'); ?>
        </div>

    </div>

    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <?php include __DIR__ . '/../stt_settings_script.php'; ?>
</body>
</html>
