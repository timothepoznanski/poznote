<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
require_once 'ai_provider_factory.php';

$message = '';
$error = '';

// Handle form submission
if ($_POST) {
    try {
        $ai_enabled = isset($_POST['ai_enabled']) ? '1' : '0';
        $ai_provider = isset($_POST['ai_provider']) ? trim($_POST['ai_provider']) : 'openai';
        
        // Update or insert the AI enabled setting
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        $stmt->execute(['ai_enabled', $ai_enabled]);
        
        // Update or insert the AI provider setting
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        $stmt->execute(['ai_provider', $ai_provider]);
        
        // Handle API keys
        if (isset($_POST['openai_api_key'])) {
            $openai_key = trim($_POST['openai_api_key']);
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['openai_api_key', $openai_key]);
        }
        
        if (isset($_POST['mistral_api_key'])) {
            $mistral_key = trim($_POST['mistral_api_key']);
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['mistral_api_key', $mistral_key]);
        }
        
        // Handle model settings
        if (isset($_POST['openai_model'])) {
            $openai_model = trim($_POST['openai_model']);
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['openai_model', $openai_model]);
        }
        
        if (isset($_POST['mistral_model'])) {
            $mistral_model = trim($_POST['mistral_model']);
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['mistral_model', $mistral_model]);
        }
        
        // Handle language setting
        if (isset($_POST['ai_language'])) {
            $ai_language = trim($_POST['ai_language']);
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['ai_language', $ai_language]);
        }
        
        $message = 'AI settings saved successfully!';
    } catch (Exception $e) {
        $error = 'Error saving configuration: ' . $e->getMessage();
    }
}

// Get current settings
$stmt = $con->prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?, ?)");
$stmt->execute(['ai_enabled', 'ai_provider', 'openai_api_key', 'mistral_api_key', 'openai_model', 'mistral_model', 'ai_language']);

$settings = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $settings[$row['key']] = $row['value'];
}

$ai_enabled = isset($settings['ai_enabled']) && $settings['ai_enabled'] === '1';
$ai_provider = isset($settings['ai_provider']) ? $settings['ai_provider'] : 'openai';
$openai_api_key = isset($settings['openai_api_key']) ? $settings['openai_api_key'] : '';
$mistral_api_key = isset($settings['mistral_api_key']) ? $settings['mistral_api_key'] : '';
$openai_model = isset($settings['openai_model']) ? $settings['openai_model'] : 'gpt-4o-mini';
$mistral_model = isset($settings['mistral_model']) ? $settings['mistral_model'] : 'mistral-large-latest';
$ai_language = isset($settings['ai_language']) ? $settings['ai_language'] : 'en';

?>
<!DOCTYPE html>
<html>
<head>
    <title>Artificial Intelligence - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/modal.css">
    <link rel="stylesheet" href="vendor/fontawesome/local-icons.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="css/ai.css">
</head>
<body>
    <div class="settings-container">
        <h1><i class="fa-robot-svg"></i> Artificial Intelligence</h1>
        <p>Configure AI settings to enable automatic summarization and other intelligent features.</p>
    
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
                Back to Notes
            </a>

        <br><br>

        <?php if ($message): ?>
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i> <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>
        
        <?php if ($error): ?>
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> <?php echo htmlspecialchars($error); ?>
            </div>
        <?php endif; ?>
        
        <!-- AI Configuration Section -->
        <div class="settings-section">
            <h3><i class="fas fa-key"></i> AI Configuration</h3>
            <p>Configure your AI provider and API keys to use artificial intelligence features like automatic note summarization.</p>
            
            <form method="POST" id="ai-config-form">
                <!-- Enable/Disable AI Features -->
                <div class="form-group" style="text-align: left;">
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; justify-content: flex-start; width: fit-content;">
                        <input type="checkbox" 
                               name="ai_enabled" 
                               <?php echo $ai_enabled ? 'checked' : ''; ?>
                               style="margin: 0; transform: scale(1.2);">
                        <span style="font-weight: 500;">Enable AI features</span>
                    </label>
                </div>
                
                <!-- AI Provider Selection -->
                <div class="form-group">
                    <label for="ai_provider">AI Provider</label>
                    <select id="ai_provider" name="ai_provider" onchange="toggleProviderSettings()">
                        <option value="openai" <?php echo $ai_provider === 'openai' ? 'selected' : ''; ?>>OpenAI</option>
                        <option value="mistral" <?php echo $ai_provider === 'mistral' ? 'selected' : ''; ?>>Mistral AI</option>
                    </select>
                </div>
                
                <!-- AI Language Selection -->
                <div class="form-group">
                    <label for="ai_language">Response Language</label>
                    <select id="ai_language" name="ai_language">
                        <option value="en" <?php echo $ai_language === 'en' ? 'selected' : ''; ?>>English</option>
                        <option value="fr" <?php echo $ai_language === 'fr' ? 'selected' : ''; ?>>Français</option>
                    </select>
                    <div class="help-text">
                        <i class="fas fa-info-circle"></i> Choose the language for AI responses.
                    </div>
                </div>
                
                <!-- OpenAI Configuration -->
                <div id="openai-config" class="provider-config" style="<?php echo $ai_provider === 'openai' ? 'display: block;' : 'display: none;'; ?>">
                    <div class="form-group">
                        <label for="openai_api_key">OpenAI API Key</label>
                        <div class="api-key-input">
                            <input type="password" 
                                   id="openai_api_key" 
                                   name="openai_api_key" 
                                   value="<?php echo htmlspecialchars($openai_api_key); ?>" 
                                   placeholder="sk-...">
                            <button type="button" class="toggle-visibility" onclick="toggleApiKeyVisibility('openai_api_key')">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                        <div class="help-text">
                            <a href="https://platform.openai.com/api-keys" target="_blank"><i class="fas fa-external-link-alt"></i> Get an API key from OpenAI</a>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="openai_model">OpenAI Model</label>
                        <select id="openai_model" name="openai_model">
                            <?php 
                            $openai_models = AIProviderFactory::getModelsForProvider('openai');
                            foreach ($openai_models as $model_key => $model_name): ?>
                                <option value="<?php echo $model_key; ?>" <?php echo $openai_model === $model_key ? 'selected' : ''; ?>>
                                    <?php echo htmlspecialchars($model_name); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
                
                <!-- Mistral AI Configuration -->
                <div id="mistral-config" class="provider-config" style="<?php echo $ai_provider === 'mistral' ? 'display: block;' : 'display: none;'; ?>">
                    <div class="form-group">
                        <label for="mistral_api_key">Mistral AI API Key</label>
                        <div class="api-key-input">
                            <input type="password" 
                                   id="mistral_api_key" 
                                   name="mistral_api_key" 
                                   value="<?php echo htmlspecialchars($mistral_api_key); ?>" 
                                   placeholder="Enter your Mistral API key...">
                            <button type="button" class="toggle-visibility" onclick="toggleApiKeyVisibility('mistral_api_key')">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                        <div class="help-text">
                            <a href="https://console.mistral.ai/" target="_blank"><i class="fas fa-external-link-alt"></i> Get an API key from Mistral AI</a>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="mistral_model">Mistral Model</label>
                        <select id="mistral_model" name="mistral_model">
                            <?php 
                            $mistral_models = AIProviderFactory::getModelsForProvider('mistral');
                            foreach ($mistral_models as $model_key => $model_name): ?>
                                <option value="<?php echo $model_key; ?>" <?php echo $mistral_model === $model_key ? 'selected' : ''; ?>>
                                    <?php echo htmlspecialchars($model_name); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary">
                    Save Configuration
                </button>
            </form>
            
            <!-- Test Connection Section (after save) -->
            <div class="test-section">
                <p><i class="fas fa-info-circle"></i> Save your configuration first, then test the connection to verify it works.</p>
                <button type="button" class="btn btn-secondary" onclick="testAIConnection()" id="test-connection-btn"
                        data-saved-provider="<?php echo htmlspecialchars($ai_provider); ?>"
                        data-saved-openai-model="<?php echo htmlspecialchars($openai_model); ?>"
                        data-saved-mistral-model="<?php echo htmlspecialchars($mistral_model); ?>">
                    <span id="test-btn-text">Test Connection</span>
                </button>
                <div id="test-result" style="margin-top: 15px; display: none;"></div>
            </div>
        </div>
        
        <!-- AI Features Information -->
        <div class="warning">
            <p><i class="fas fa-info-circle"></i> An internet connection and sufficient API credits are required to use these features.</p>
            <p><i class="fas fa-shield-alt"></i> <strong>Privacy Notice:</strong> Note content will be sent to the selected AI provider's servers for processing. Please review their privacy policies: 
                <a href="https://openai.com/privacy/" target="_blank">OpenAI</a> | 
                <a href="https://mistral.ai/terms/" target="_blank">Mistral AI</a>
            </p>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <script src="js/ai-config.js"></script>
</body>
    <script>
    (function(){ try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored && stored !== 'Poznote') {
            var a = document.getElementById('backToNotesLink'); if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
        }
    } catch(e){} })();
    </script>
</html>
