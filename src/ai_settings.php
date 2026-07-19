<?php
/**
 * AI Assistant settings page
 *
 * Configure the connection to an OpenAI-compatible chat server
 * (Ollama, LM Studio, OpenAI, ...) used by the in-app AI chat.
 */

require 'auth.php';
requireAuth();
requireActiveAccountOwner();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

$message = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_config') {
    $enabled = isset($_POST['ai_enabled']) ? '1' : '0';
    $url = trim((string)($_POST['ai_url'] ?? ''));
    $model = trim((string)($_POST['ai_model'] ?? ''));
    $apiKey = trim((string)($_POST['ai_api_key'] ?? ''));

    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $stmt->execute(['ai_chat_enabled', $enabled]);
        $stmt->execute(['ai_chat_url', $url]);
        $stmt->execute(['ai_chat_model', $model]);
        // Masked placeholder means "keep the existing key"
        if ($apiKey !== '••••••••') {
            $stmt->execute(['ai_chat_api_key', $apiKey]);
        }
        $message = t('ai_settings.messages.saved', [], 'Configuration saved successfully.');
    } catch (Exception $e) {
        $error = t('ai_settings.messages.save_error', [], 'Failed to save configuration.');
    }
}

// Read current values directly (getSetting caches before our save)
$aiConfig = ['ai_chat_enabled' => '0', 'ai_chat_url' => '', 'ai_chat_model' => '', 'ai_chat_api_key' => ''];
try {
    $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('ai_chat_enabled','ai_chat_url','ai_chat_model','ai_chat_api_key')");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $aiConfig[$row['key']] = (string)$row['value'];
    }
} catch (Exception $e) {
    // Defaults already set
}

$aiEnabled = $aiConfig['ai_chat_enabled'] === '1';
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
                        <label class="git-field-label" for="ai_url"><?php echo t_h('ai_settings.url_label', [], 'Server URL'); ?></label>
                        <input type="text" name="ai_url" id="ai_url" class="git-field-input"
                               value="<?php echo htmlspecialchars($aiConfig['ai_chat_url']); ?>"
                               placeholder="http://host.docker.internal:11434">
                        <span class="label-desc"><?php echo t_h('ai_settings.url_description', [], 'Base URL of an OpenAI-compatible API. For Ollama running on the Docker host, use http://host.docker.internal:11434'); ?></span>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="ai_model"><?php echo t_h('ai_settings.model_label', [], 'Model'); ?></label>
                        <input type="text" name="ai_model" id="ai_model" class="git-field-input" list="ai-model-list"
                               value="<?php echo htmlspecialchars($aiConfig['ai_chat_model']); ?>"
                               placeholder="llama3.1" autocomplete="off">
                        <datalist id="ai-model-list"></datalist>
                    </div>

                    <div class="git-field-group">
                        <label class="git-field-label" for="ai_api_key"><?php echo t_h('ai_settings.api_key_label', [], 'API key (optional)'); ?></label>
                        <input type="password" name="ai_api_key" id="ai_api_key" class="git-field-input"
                               value="<?php echo $aiConfig['ai_chat_api_key'] !== '' ? '••••••••' : ''; ?>"
                               placeholder="sk-..." autocomplete="off">
                        <span class="label-desc"><?php echo t_h('ai_settings.api_key_description', [], 'Leave empty for a local Ollama server. Required for cloud providers.'); ?></span>
                    </div>

                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('ai_settings.save', [], 'Save Configuration'); ?>
                        </button>
                        <button type="button" id="ai-test-btn" class="btn btn-secondary">
                            <i class="lucide lucide-plug"></i>
                            <?php echo t_h('ai_settings.test', [], 'Test connection'); ?>
                        </button>
                    </div>
                    <div id="ai-test-result" class="config-hint" hidden></div>
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
        var i18n = {
            testing: <?php echo json_encode(t('ai_settings.testing', [], 'Testing connection...')); ?>,
            success: <?php echo json_encode(t('ai_settings.test_success', [], 'Connection successful. {{count}} model(s) available.')); ?>,
            failure: <?php echo json_encode(t('ai_settings.test_failure', [], 'Connection failed: {{error}}')); ?>
        };

        testBtn.addEventListener('click', function() {
            var url = document.getElementById('ai_url').value.trim();
            var apiKey = document.getElementById('ai_api_key').value;
            if (apiKey === '••••••••') apiKey = '';

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
                    (data.models || []).forEach(function(m) {
                        var opt = document.createElement('option');
                        opt.value = m;
                        datalist.appendChild(opt);
                    });
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
