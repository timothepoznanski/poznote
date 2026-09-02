<?php
/**
 * AI Assistant settings page (admin only)
 *
 * Configure the connection to an OpenAI-compatible chat server
 * (Ollama, LM Studio, OpenAI, ...) used by the in-app AI chat.
 * The configuration is stored in master.db (global_settings) and
 * applies to the whole instance.
 */

require 'auth.php';
requireAuth();
requireAdmin();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'users/db_master.php';
require_once 'ai_config.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars(($currentUser['display_name'] ?? '') ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

$AI_PROVIDERS = poznoteAiProviders();
// Providers whose URL is fixed (the URL field is hidden in the UI)
$AI_FIXED_URLS = poznoteAiFixedUrls();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $enabled = isset($_POST['ai_enabled']) ? '1' : '0';
    $provider = (string)($_POST['ai_provider'] ?? 'custom');
    if (!in_array($provider, $AI_PROVIDERS, true)) {
        $provider = 'custom';
    }
    $url = trim((string)($_POST['ai_url'] ?? ''));
    if (isset($AI_FIXED_URLS[$provider])) {
        $url = $AI_FIXED_URLS[$provider];
    }
    $model = trim((string)($_POST['ai_model'] ?? ''));
    $apiKey = trim((string)($_POST['ai_api_key'] ?? ''));
    $reasoningEffort = poznoteAiNormalizeReasoningEffort($_POST['ai_reasoning_effort'] ?? 'auto');

    $userKeysEnabled = isset($_POST['ai_user_keys_enabled']) ? '1' : '0';

    $saved = setGlobalSetting('ai_chat_enabled', $enabled)
        && setGlobalSetting('ai_chat_user_keys_enabled', $userKeysEnabled)
        && setGlobalSetting('ai_chat_provider', $provider)
        && setGlobalSetting('ai_chat_url', $url)
        && setGlobalSetting('ai_chat_model', $model)
        && setGlobalSetting('ai_chat_reasoning_effort', $reasoningEffort);
    // Masked placeholder means "keep the existing key"
    if ($saved && $apiKey !== '••••••••') {
        $saved = setGlobalSetting('ai_chat_api_key', $apiKey);
    }

    // Per-user access. The checkbox list only shows eligible profiles, so
    // anything else posted is ignored.
    $postedAiUsers = $_POST['ai_user_ids'] ?? [];
    if (!is_array($postedAiUsers)) {
        $postedAiUsers = [];
    }
    if ($saved) {
        $saved = setAiChatUsers(array_map('intval', $postedAiUsers));
    }
    if ($saved) {
        $message = t('ai_settings.messages.saved', [], 'Configuration saved successfully.');
    } else {
        $error = t('ai_settings.messages.save_error', [], 'Failed to save configuration.');
    }
}

$aiConfig = [
    'ai_chat_enabled' => (string)getGlobalSetting('ai_chat_enabled', '0'),
    'ai_chat_provider' => (string)getGlobalSetting('ai_chat_provider', ''),
    'ai_chat_url' => (string)getGlobalSetting('ai_chat_url', ''),
    'ai_chat_model' => (string)getGlobalSetting('ai_chat_model', ''),
    'ai_chat_api_key' => (string)getGlobalSetting('ai_chat_api_key', ''),
];
$aiReasoningEffort = poznoteAiNormalizeReasoningEffort(getGlobalSetting('ai_chat_reasoning_effort', 'auto'));

// Configs saved before the provider selector existed: infer it from the URL
$aiProvider = poznoteAiGuessProvider($aiConfig['ai_chat_provider'], $aiConfig['ai_chat_url']);

$aiEnabled = $aiConfig['ai_chat_enabled'] === '1';
$aiUserCandidates = listAiChatCandidates();
$aiUserKeysEnabled = poznoteAiUserKeysAllowed();
$aiLocalHost = aiChatLocalDefaultHost();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('ai_settings.title', [], 'AI Assistant'); ?> - <?php echo getPageTitle(); ?></title>
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
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <style>
    /* Clickable model suggestions under the connection-test result (the
       native datalist is filtered by the input's current value, so it can
       look empty when a model is already typed) */
    #ai-test-result { flex-wrap: wrap; }
    .ai-model-suggestions { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .ai-model-suggestion {
        border: 1px solid #b6d4ea; background: #ffffff; color: #1a56db;
        border-radius: 12px; padding: 3px 10px; font-size: 0.85rem; cursor: pointer;
    }
    .ai-model-suggestion:hover { background: #e7f1fb; }
    html[data-theme='dark'] .ai-model-suggestion,
    body.dark-mode .ai-model-suggestion {
        background: transparent; border-color: #3d5a75; color: #7fb3e3;
    }
    html[data-theme='dark'] .ai-model-suggestion:hover,
    body.dark-mode .ai-model-suggestion:hover { background: rgba(127, 179, 227, 0.12); }

    /* Per-user AI access list */
    /* Instances can have many profiles: keep the list from burying the
       provider/model fields below it */
    .ai-user-list {
        display: flex; flex-direction: column; gap: 2px; margin-top: 8px;
        max-height: 260px; overflow-y: auto;
        border: 1px solid #dfe3e8; border-radius: 6px; padding: 6px 10px;
    }
    html[data-theme='dark'] .ai-user-list,
    body.dark-mode .ai-user-list { border-color: var(--dm-border, #404040); }
    .ai-user-filter { margin-top: 8px; }
    .ai-user { display: flex; align-items: center; gap: 10px; padding: 6px 4px; cursor: pointer; }
    .ai-user[hidden] { display: none; }
    .ai-user-empty { padding: 8px 4px; font-size: 0.9rem; opacity: 0.7; }
    .ai-user input[type="checkbox"] { flex: 0 0 auto; margin: 0; }
    /* Name and username stay on a single line, the username giving way first
       when the row is too narrow */
    .ai-user-copy { display: flex; align-items: baseline; gap: 6px; line-height: 1.3; min-width: 0; }
    .ai-user-name { font-weight: 500; white-space: nowrap; }
    .ai-user-meta {
        font-size: 0.85rem; opacity: 0.7;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ai-user-meta::before { content: '\00b7'; margin-right: 6px; }
    </style>
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include 'icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include 'back_to_settings.php'; ?>
    <h1 class="poznote-page-title"><i class="lucide lucide-bot"></i> <?php echo t_h('settings.cards.ai_assistant', [], 'AI Assistant'); ?></h1>



        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('ai_settings.description', [], 'Connect Poznote to an OpenAI-compatible AI server (Ollama, LM Studio, OpenAI, ...) to chat with an assistant about your notes.'); ?></p>
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
            <h2><i class="lucide lucide-bot"></i> <?php echo t_h('ai_settings.config_title', [], 'Configuration'); ?></h2>

            <form method="post">
                <input type="hidden" name="action" value="save_config">

                <div class="git-config-fields">
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="ai_enabled" id="ai_enabled" <?php echo $aiEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('ai_settings.enable_label', [], 'Enable AI assistant'); ?></span>
                            <span class="label-desc"><?php echo t_h('ai_settings.enable_description', [], 'Shows an AI chat button in the note toolbar.'); ?></span>
                        </div>
                    </div>

                    <div class="git-field-group" id="ai-users-group">
                        <label class="git-field-label"><?php echo t_h('ai_settings.users_label', [], 'Users allowed to use the global AI assistant configured by the administrator'); ?></label>
                        <span class="label-desc"><?php echo t_h('ai_settings.users_description', [], 'Only the selected users see the AI chat button for the configuration on this page. New users have no access until you add them here.'); ?></span>
                        <input type="search" id="ai-user-filter" class="git-field-input ai-user-filter"
                               placeholder="<?php echo t_h('ai_settings.users_filter_placeholder', [], 'Filter users'); ?>"
                               autocomplete="off">
                        <div class="ai-user-list">
                            <?php foreach ($aiUserCandidates as $candidate): ?>
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
                                <label class="ai-user" for="ai_user_<?php echo $candidateId; ?>">
                                    <input
                                        type="checkbox"
                                        id="ai_user_<?php echo $candidateId; ?>"
                                        name="ai_user_ids[]"
                                        value="<?php echo $candidateId; ?>"
                                        <?php echo !empty($candidate['ai_chat_enabled']) ? 'checked' : ''; ?>>
                                    <span class="ai-user-copy">
                                        <span class="ai-user-name"><?php echo htmlspecialchars($candidateName, ENT_QUOTES, 'UTF-8'); ?></span>
                                        <?php if ($candidateMeta !== ''): ?>
                                        <span class="ai-user-meta"><?php echo htmlspecialchars($candidateMeta, ENT_QUOTES, 'UTF-8'); ?></span>
                                        <?php endif; ?>
                                    </span>
                                </label>
                            <?php endforeach; ?>
                            <div class="ai-user-empty" id="ai-user-filter-empty" hidden><?php echo t_h('ai_settings.users_filter_empty', [], 'No user matches this filter.'); ?></div>
                        </div>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="ai_provider"><?php echo t_h('ai_settings.provider_label', [], 'AI provider'); ?></label>
                        <select name="ai_provider" id="ai_provider" class="git-field-input">
                            <option value="ollama" <?php echo $aiProvider === 'ollama' ? 'selected' : ''; ?>>Ollama (local)</option>
                            <option value="lmstudio" <?php echo $aiProvider === 'lmstudio' ? 'selected' : ''; ?>>LM Studio (local)</option>
                            <option value="anthropic" <?php echo $aiProvider === 'anthropic' ? 'selected' : ''; ?>>Anthropic (Claude)</option>
                            <option value="openai" <?php echo $aiProvider === 'openai' ? 'selected' : ''; ?>>OpenAI</option>
                            <option value="custom" <?php echo $aiProvider === 'custom' ? 'selected' : ''; ?>><?php echo t_h('ai_settings.provider_custom', [], 'Other (custom URL)'); ?></option>
                        </select>
                    </div>

                    <div class="git-field-group" id="ai-url-group">
                        <label class="git-field-label" for="ai_url"><?php echo t_h('ai_settings.url_label', [], 'Server URL'); ?></label>
                        <input type="text" name="ai_url" id="ai_url" class="git-field-input"
                               value="<?php echo htmlspecialchars($aiConfig['ai_chat_url']); ?>"
                               placeholder="http://<?php echo htmlspecialchars($aiLocalHost); ?>:11434">
                        <span class="label-desc"><?php echo t_h('ai_settings.url_description', [], 'Base URL of an OpenAI-compatible API. For Ollama running on the Docker host, use http://host.docker.internal:11434'); ?></span>
                    </div>

                    <div class="git-field-group" id="ai-key-group">
                        <label class="git-field-label" for="ai_api_key" id="ai-key-label"><?php echo t_h('ai_settings.api_key_label', [], 'API key (optional)'); ?></label>
                        <input type="password" name="ai_api_key" id="ai_api_key" class="git-field-input"
                               value="<?php echo $aiConfig['ai_chat_api_key'] !== '' ? '••••••••' : ''; ?>"
                               placeholder="sk-..." autocomplete="off">
                        <span class="label-desc" id="ai-key-desc"><?php echo t_h('ai_settings.api_key_description', [], 'Leave empty for a local Ollama server. Required for cloud providers.'); ?></span>
                    </div>

                    <div class="git-field-actions">
                        <button type="button" id="ai-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('ai_settings.test', [], 'Check access and list models'); ?>
                        </button>
                    </div>
                    <div id="ai-test-result" class="config-hint" hidden></div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="ai_model"><?php echo t_h('ai_settings.model_label', [], 'Model'); ?></label>
                        <input type="text" name="ai_model" id="ai_model" class="git-field-input" list="ai-model-list"
                               value="<?php echo htmlspecialchars($aiConfig['ai_chat_model']); ?>"
                               placeholder="llama3.1" autocomplete="off">
                        <datalist id="ai-model-list"></datalist>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="ai_reasoning_effort"><?php echo t_h('ai_settings.reasoning_effort_label', [], 'Reasoning effort'); ?></label>
                        <select name="ai_reasoning_effort" id="ai_reasoning_effort" class="git-field-input">
                            <?php foreach (poznoteAiReasoningEffortLabels() as $effortValue => $effortLabel): ?>
                            <option value="<?php echo $effortValue; ?>" <?php echo $aiReasoningEffort === $effortValue ? 'selected' : ''; ?>><?php echo t_h('ai_settings.reasoning_effort_options.' . $effortValue, [], $effortLabel); ?></option>
                            <?php endforeach; ?>
                        </select>
                        <span class="label-desc"><?php echo t_h('ai_settings.reasoning_effort_description', [], 'How long the model thinks before answering, for models that support it. Auto sends nothing and leaves the choice to the provider. Some OpenAI models refuse tools, and so cannot browse your notes, unless this is set to None.'); ?></span>
                    </div>

                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="ai_user_keys_enabled" id="ai_user_keys_enabled" <?php echo $aiUserKeysEnabled ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo t_h('ai_settings.user_keys_label', [], 'Allow personal API keys'); ?></span>
                            <span class="label-desc"><?php echo t_h('ai_settings.user_keys_description', [], 'Every user gets an AI assistant card in their own settings, where they can enter their own provider and API key. When a user does so, the assistant answers through that user\'s own server and key rather than through the configuration on this page, whether or not that user appears in the list above.'); ?></span>
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
            <?php echo t_h('ai_settings.footer_note', [], 'The AI server is called from the Poznote server, not from your browser. Chat conversations are sent to the configured server; with a local Ollama instance nothing leaves your machine.'); ?>
        </div>

    </div>

    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    window.poznoteAiSettingsScope = 'instance';
    window.poznoteAiSettingsI18n = {
        testing: <?php echo json_encode(t('ai_settings.testing', [], 'Testing connection...')); ?>,
        success: <?php echo json_encode(t('ai_settings.test_success', [], 'Connection successful. {{count}} model(s) available. Click a model below and save.')); ?>,
        failure: <?php echo json_encode(t('ai_settings.test_failure', [], 'Connection failed: {{error}}')); ?>,
        apiKeyOptional: <?php echo json_encode(t('ai_settings.api_key_label', [], 'API key (optional)')); ?>,
        apiKeyRequired: <?php echo json_encode(t('ai_settings.api_key_label_required', [], 'API key')); ?>
    };
    window.poznoteAiLocalHost = <?php echo json_encode($aiLocalHost); ?>;
    </script>
    <script src="js/ai-settings-form.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
