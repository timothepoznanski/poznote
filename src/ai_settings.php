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

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

$AI_PROVIDERS = ['ollama', 'lmstudio', 'anthropic', 'openai', 'custom'];
// Providers whose URL is fixed (the URL field is hidden in the UI)
$AI_FIXED_URLS = ['anthropic' => 'https://api.anthropic.com', 'openai' => 'https://api.openai.com'];

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

    $saved = setGlobalSetting('ai_chat_enabled', $enabled)
        && setGlobalSetting('ai_chat_provider', $provider)
        && setGlobalSetting('ai_chat_url', $url)
        && setGlobalSetting('ai_chat_model', $model);
    // Masked placeholder means "keep the existing key"
    if ($saved && $apiKey !== '••••••••') {
        $saved = setGlobalSetting('ai_chat_api_key', $apiKey);
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

// Configs saved before the provider selector existed: infer it from the URL
$aiProvider = $aiConfig['ai_chat_provider'];
if (!in_array($aiProvider, $AI_PROVIDERS, true)) {
    $u = $aiConfig['ai_chat_url'];
    $h = strtolower((string)(parse_url($u, PHP_URL_HOST) ?? ''));
    $p = (int)(parse_url($u, PHP_URL_PORT) ?? 0);
    if ($h === 'anthropic.com' || substr($h, -14) === '.anthropic.com') {
        $aiProvider = 'anthropic';
    } elseif ($h === 'api.openai.com') {
        $aiProvider = 'openai';
    } elseif ($p === 11434) {
        $aiProvider = 'ollama';
    } elseif ($p === 1234) {
        $aiProvider = 'lmstudio';
    } else {
        $aiProvider = ($u === '') ? 'ollama' : 'custom';
    }
}

$aiEnabled = $aiConfig['ai_chat_enabled'] === '1';

/**
 * Best local-server host as seen from inside this container.
 * host.docker.internal exists on Docker Desktop (and on Linux when compose
 * maps it); otherwise the container's default gateway is the Docker host.
 */
function aiChatLocalDefaultHost() {
    if (gethostbyname('host.docker.internal') !== 'host.docker.internal') {
        return 'host.docker.internal';
    }
    $route = @file_get_contents('/proc/net/route');
    if ($route !== false) {
        foreach (explode("\n", $route) as $line) {
            $cols = preg_split('/\s+/', trim($line));
            // Destination 00000000 = default route; gateway is little-endian hex
            if (isset($cols[1], $cols[2]) && $cols[1] === '00000000' && $cols[2] !== '00000000') {
                $ip = implode('.', array_reverse(array_map('hexdec', str_split($cols[2], 2))));
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
    }
    return 'host.docker.internal';
}
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
<body class="home-page git-sync-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container git-sync-container">

        <div class="git-sync-nav">
            <a id="backToNotesLink" href="index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes', [], 'Notes', $currentLang); ?>
            </a>
            <a id="backToSettingsLink" href="settings.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings', [], 'Settings', $currentLang); ?>
            </a>
        </div>

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

                    <div class="git-field-group">
                        <span class="label-desc"><?php echo t_h('ai_settings.model_description', [], 'Use "Test connection" to list the models available on the server.'); ?></span>
                    </div>
                    <div class="git-field-actions">
                        <button type="button" id="ai-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('ai_settings.test', [], 'Test connection'); ?>
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

    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var testBtn = document.getElementById('ai-test-btn');
        var resultEl = document.getElementById('ai-test-result');

        // Provider-driven field visibility: local servers need a URL but no
        // key; Anthropic/OpenAI have a fixed URL and need a key; custom shows
        // everything.
        var localHost = <?php echo json_encode($aiLocalHost); ?>;
        var PROVIDERS = {
            ollama:    { url: 'http://' + localHost + ':11434', fixedUrl: false, key: 'none' },
            lmstudio:  { url: 'http://' + localHost + ':1234',  fixedUrl: false, key: 'none' },
            anthropic: { url: 'https://api.anthropic.com', fixedUrl: true, key: 'required' },
            openai:    { url: 'https://api.openai.com', fixedUrl: true, key: 'required' },
            custom:    { url: '', fixedUrl: false, key: 'optional' }
        };
        var DEFAULT_URLS = Object.keys(PROVIDERS).map(function(k) { return PROVIDERS[k].url; }).filter(Boolean);
        var providerSel = document.getElementById('ai_provider');
        var urlGroup = document.getElementById('ai-url-group');
        var urlInput = document.getElementById('ai_url');
        var keyGroup = document.getElementById('ai-key-group');
        var keyLabel = document.getElementById('ai-key-label');
        var keyDesc = document.getElementById('ai-key-desc');

        function applyProvider(initial) {
            var p = PROVIDERS[providerSel.value] || PROVIDERS.custom;
            urlGroup.style.display = p.fixedUrl ? 'none' : '';
            if (p.fixedUrl || !initial) {
                // Switching provider always resets the URL to that provider's
                // default — predictable, and never keeps a stale URL around
                urlInput.value = p.url;
            }
            keyGroup.style.display = (p.key === 'none') ? 'none' : '';
            keyLabel.textContent = (p.key === 'required') ? i18n.apiKeyRequired : i18n.apiKeyOptional;
            keyDesc.style.display = (p.key === 'optional') ? '' : 'none';
            if (!initial) {
                // The model and any listed models belong to the previous server
                document.getElementById('ai_model').value = '';
                document.getElementById('ai-model-list').innerHTML = '';
                resultEl.hidden = true;
                resultEl.textContent = '';
            }
        }

        providerSel.addEventListener('change', function() { applyProvider(false); });

        var i18n = {
            testing: <?php echo json_encode(t('ai_settings.testing', [], 'Testing connection...')); ?>,
            success: <?php echo json_encode(t('ai_settings.test_success', [], 'Connection successful. {{count}} model(s) available. Click a model below and save.')); ?>,
            failure: <?php echo json_encode(t('ai_settings.test_failure', [], 'Connection failed: {{error}}')); ?>,
            apiKeyOptional: <?php echo json_encode(t('ai_settings.api_key_label', [], 'API key (optional)')); ?>,
            apiKeyRequired: <?php echo json_encode(t('ai_settings.api_key_label_required', [], 'API key')); ?>
        };

        applyProvider(true);

        testBtn.addEventListener('click', function() {
            var url = document.getElementById('ai_url').value.trim();
            var apiKey = document.getElementById('ai_api_key').value;
            if (apiKey === '••••••••') apiKey = '';

            // The model is picked from the results of this test
            document.getElementById('ai_model').value = '';

            resultEl.hidden = false;
            resultEl.textContent = i18n.testing;

            var body = new URLSearchParams();
            body.append('url', url);
            if (apiKey) body.append('api_key', apiKey);

            fetch('api_ai_chat.php?action=test', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    resultEl.textContent = i18n.success.replace('{{count}}', (data.models || []).length);
                    var datalist = document.getElementById('ai-model-list');
                    datalist.innerHTML = '';
                    var suggestions = document.createElement('div');
                    suggestions.className = 'ai-model-suggestions';
                    (data.models || []).forEach(function(m) {
                        var opt = document.createElement('option');
                        opt.value = m;
                        datalist.appendChild(opt);
                        var chip = document.createElement('button');
                        chip.type = 'button';
                        chip.className = 'ai-model-suggestion';
                        chip.textContent = m;
                        chip.addEventListener('click', function() {
                            document.getElementById('ai_model').value = m;
                        });
                        suggestions.appendChild(chip);
                    });
                    resultEl.appendChild(suggestions);
                } else {
                    resultEl.textContent = i18n.failure.replace('{{error}}', data.error || 'unknown');
                }
            })
            .catch(function(e) {
                resultEl.textContent = i18n.failure.replace('{{error}}', e.message);
            });
        });
    });
    </script>
</body>
</html>
