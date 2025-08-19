<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Create settings table if it doesn't exist
$con->exec("CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
)");

$message = '';
$error = '';

// Handle form submission
if ($_POST) {
    if (isset($_POST['openai_api_key'])) {
        $api_key = trim($_POST['openai_api_key']);
        
        try {
            // Update or insert the API key
            $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
            $stmt->execute(['openai_api_key', $api_key]);
            
            $message = 'API key saved successfully!';
        } catch (Exception $e) {
            $error = 'Error saving configuration: ' . $e->getMessage();
        }
    }
}

// Get current API key
$stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
$stmt->execute(['openai_api_key']);
$current_api_key = $stmt->fetchColumn() ?: '';

?>
<!DOCTYPE html>
<html>
<head>
    <title>Artificial Intelligence - PozNote</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="css/index.css">
    <link rel="stylesheet" href="css/font-awesome.css">
    <link rel="stylesheet" href="css/database-backup.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        .api-key-input {
            position: relative;
        }
        
        .toggle-visibility {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            padding: 5px;
        }
        
        .toggle-visibility:hover {
            color: #333;
        }
        
        .form-group input[type="text"], 
        .form-group input[type="password"] {
            width: 100%;
            padding: 10px 40px 10px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        }
        
        .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
            line-height: 1.4;
        }
        
        .help-text a {
            color: #007cba;
            text-decoration: none;
        }
        
        .help-text a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="backup-container">
        <h1><i class="fas fa-robot"></i> Artificial Intelligence</h1>
        <p>Configure AI settings to enable automatic summarization and other intelligent features.</p>
        
        <div class="navigation">
            <a href="index.php" class="btn btn-secondary">
                <i class="fas fa-arrow-left"></i> Back to Notes
            </a>
        </div>
        
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
        <div class="backup-section">
            <h3><i class="fas fa-key"></i> OpenAI Configuration</h3>
            <p>Configure your OpenAI API key to use artificial intelligence features like automatic note summarization.</p>
            
            <form method="POST">
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
                        Your OpenAI API key to use GPT-3.5-turbo in AI features.
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
            <h4>Available AI features:</h4>
            <ul>
                <li><strong>Automatic summarization</strong> - Click the robot icon in the toolbar to generate an intelligent summary of your notes</li>
                <li><strong>More features coming soon</strong> - Additional AI tools will be added in future updates</li>
            </ul>
            <p><small><i class="fas fa-info-circle"></i> An internet connection and OpenAI credits are required to use these features.</small></p>
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
