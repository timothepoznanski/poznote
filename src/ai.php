<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

$message = '';
$error = '';

// Handle form submission
if ($_POST) {
    if (isset($_POST['openai_api_key'])) {
        $api_key = trim($_POST['openai_api_key']);
        $ai_enabled = isset($_POST['ai_enabled']) ? '1' : '0';
        
        try {
            // Update or insert the API key
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['openai_api_key', $api_key]);
            
            // Update or insert the AI enabled setting
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['ai_enabled', $ai_enabled]);
            
            $message = 'AI settings saved successfully!';
        } catch (Exception $e) {
            $error = 'Error saving configuration: ' . $e->getMessage();
        }
    }
}

// Get current settings
$stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
$stmt->execute(['openai_api_key']);
$current_api_key = $stmt->fetchColumn() ?: '';

$stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
$stmt->execute(['ai_enabled']);
$ai_enabled = $stmt->fetchColumn();
$ai_enabled = ($ai_enabled === '1'); // Convert to boolean

?>
<!DOCTYPE html>
<html>
<head>
    <title>Artificial Intelligence - Poznote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="css/ai.css">
</head>
<body>
    <div class="settings-container">
        <h1><i class="fas fa-robot"></i> Artificial Intelligence</h1>
        <p>Configure AI settings to enable automatic summarization and other intelligent features.</p>
    
        <a href="index.php" class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i> Back to Notes
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
        
        <!-- OpenAI Configuration Section -->
        <div class="settings-section">
            <h3><i class="fas fa-key"></i> OpenAI Configuration</h3>
            <p>Configure your OpenAI API key to use artificial intelligence features like automatic note summarization.</p>
            
            <form method="POST">
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
                
                <div class="form-group">
                    <label for="openai_api_key">OpenAI API Key</label>
                    <div class="api-key-input">
                        <input type="password" 
                               id="openai_api_key" 
                               name="openai_api_key" 
                               value="<?php echo htmlspecialchars($current_api_key); ?>" 
                               placeholder="sk-...">
                        <button type="button" class="toggle-visibility" onclick="toggleApiKeyVisibility()">
                            <i class="fas fa-eye" id="eye-icon"></i>
                        </button>
                    </div>
                    <div class="help-text">
                        <br><a href="https://platform.openai.com/api-keys" target="_blank"><i class="fas fa-external-link-alt"></i> Get an API key from OpenAI</a>
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary">
                    <i class="fas fa-save"></i> Save Configuration
                </button>
            </form>
        </div>
        
        <!-- AI Features Information -->
        <div class="warning">
            <p><i class="fas fa-info-circle"></i> An internet connection and OpenAI credits are required to use these features.</p>
        </div>
        
        <!-- Bottom padding for better spacing -->
        <div style="padding-bottom: 50px;"></div>
    </div>

    <script>
        function toggleApiKeyVisibility() {
            const input = document.getElementById('openai_api_key');
            const icon = document.getElementById('eye-icon');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                icon.className = 'fas fa-eye';
            }
        }
    </script>
</body>
</html>
