<?php
/**
 * Personal AI Assistant settings page
 *
 * Lets a user connect the in-app AI chat to their own OpenAI-compatible
 * server (Ollama, LM Studio, OpenAI, Anthropic, ...) with their own API key.
 * The configuration lives in the user's own database and replaces the
 * instance-wide one configured by an administrator in ai_settings.php.
 * An administrator must first allow personal API keys.
 */

require 'auth.php';
requireAuth();
requireActiveAccountOwner();

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
$AI_FIXED_URLS = poznoteAiFixedUrls();
$userKeysAllowed = poznoteAiUserKeysAllowed();

if ($userKeysAllowed && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
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

    if ($enabled === '1' && ($url === '' || $model === '')) {
        $error = t('ai_settings_user.messages.incomplete', [], 'Enter a server URL and a model before enabling your own assistant.');
    } else {
        $toSave = [
            'enabled' => $enabled,
            'provider' => $provider,
            'url' => $url,
            'model' => $model,
            'reasoning_effort' => $reasoningEffort,
        ];
        // Masked placeholder means "keep the existing key"
        if ($apiKey !== '••••••••') {
            $toSave['api_key'] = $apiKey;
        }
        if (poznoteSaveAiUserConfig($con, $toSave)) {
            $message = t('ai_settings.messages.saved', [], 'Configuration saved successfully.');
        } else {
            $error = t('ai_settings.messages.save_error', [], 'Failed to save configuration.');
        }
    }
}

$aiConfig = poznoteAiUserConfig($con);
$aiProvider = poznoteAiGuessProvider($aiConfig['provider'], $aiConfig['url']);
$aiEnabled = $aiConfig['enabled'];
$aiReasoningEffort = $aiConfig['reasoning_effort'];
$aiLocalHost = aiChatLocalDefaultHost();

// What the AI chat button actually uses right now, so the page can say whether
// this personal configuration is the one answering
$effective = poznoteResolveAiChatConfig($con, (int)(getAuthenticatedUserId() ?? 0));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('ai_settings_user.title', [], 'My AI Assistant'); ?> - <?php echo getPageTitle(); ?></title>
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
    </style>
</head>
<body class="home-page git-sync-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php $iconSidebarWorkspace = $pageWorkspace; include 'icon_sidebar.php'; ?>
    <div class="home-container git-sync-container">
    <?php include 'back_to_settings.php'; ?>
    <h1 class="poznote-page-title"><i class="lucide lucide-bot"></i> <?php echo t_h('ai_settings_user.title', [], 'My AI Assistant'); ?></h1>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo t_h('ai_settings_user.description', [], 'Connect the AI assistant to your own OpenAI-compatible server (Ollama, LM Studio, OpenAI, Anthropic, ...) with your own API key. Your configuration replaces the one set by the administrator.'); ?></p>
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
            <?php echo t_h('ai_settings_user.disabled_notice', [], 'Your administrator has not allowed personal API keys on this instance.'); ?>
        </div>
        <?php else: ?>

        <?php if ($effective['source'] === 'instance'): ?>
        <div class="config-hint">
            <i class="lucide lucide-info"></i>
            <?php echo t_h('ai_settings_user.using_instance', [], 'The assistant currently answers through the configuration set by the administrator. Enable your own configuration below to use your API key instead.'); ?>
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
                            <span class="label-title"><?php echo t_h('ai_settings_user.enable_label', [], 'Use my own configuration'); ?></span>
                            <span class="label-desc"><?php echo t_h('ai_settings_user.enable_description', [], 'The AI chat button uses the server and API key below instead of the instance ones.'); ?></span>
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
                               value="<?php echo htmlspecialchars($aiConfig['url']); ?>"
                               placeholder="http://<?php echo htmlspecialchars($aiLocalHost); ?>:11434">
                        <span class="label-desc"><?php echo t_h('ai_settings.url_description', [], 'Base URL of an OpenAI-compatible API. For Ollama running on the Docker host, use http://host.docker.internal:11434'); ?></span>
                    </div>

                    <div class="git-field-group" id="ai-key-group">
                        <label class="git-field-label" for="ai_api_key" id="ai-key-label"><?php echo t_h('ai_settings.api_key_label', [], 'API key (optional)'); ?></label>
                        <input type="password" name="ai_api_key" id="ai_api_key" class="git-field-input"
                               value="<?php echo $aiConfig['api_key'] !== '' ? '••••••••' : ''; ?>"
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
                               value="<?php echo htmlspecialchars($aiConfig['model']); ?>"
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
            <?php echo t_h('ai_settings.footer_note', [], 'The AI server is called from the Poznote server, not from your browser. Chat conversations are sent to the configured server; with a local Ollama instance nothing leaves your machine.'); ?>
        </div>

    </div>

    <script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <?php if ($userKeysAllowed): ?>
    <script>
    window.poznoteAiSettingsScope = 'user';
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
    <?php endif; ?>
</body>
</html>
