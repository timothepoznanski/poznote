<?php
/**
 * Git Sync Status and Actions Page
 * 
 * Accessible from settings, this page shows Git sync status and allows manual sync operations.
 * Each user can configure their own Git repository settings.
 */

require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
requireSettingsPassword();
require_once 'db_connect.php';
require_once 'GitSync.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);
$pageWorkspace = trim(getWorkspaceFilter());

// Initialize GitSync
$gitSync = new GitSync($con, $_SESSION['user_id'] ?? null);
$configStatus = $gitSync->getConfigStatus();
$lastSync = $gitSync->getLastSyncInfo();

// Determine provider name for display
$provider = $configStatus['provider'] ?? 'github';
$providerName = ($provider === 'github') ? 'GitHub' : (($provider === 'forgejo') ? 'Forgejo' : 'Git');

// Helper for translations with provider
function tp($key, $vars = []) {
    global $providerName;
    if (!isset($vars['provider'])) $vars['provider'] = $providerName;
    return t($key, $vars);
}

function tp_h($key, $vars = []) {
    return htmlspecialchars(tp($key, $vars), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// Handle form submissions
$message = '';
$warning = '';
$error = '';
$result = null;

// Handle result from AJAX sync session
if (isset($_SESSION['last_sync_result'])) {
    $lastSync = $_SESSION['last_sync_result'];
    $action = $lastSync['action'];
    $result = $lastSync['result'];
    unset($_SESSION['last_sync_result']);

    $errorCount = count($result['errors'] ?? []);
    if ($result['success']) {
        if ($action === 'push') {
            $message = tp('git_sync.messages.push_success', [
                'count' => $result['pushed'],
                'attachments' => $result['attachments_pushed'] ?? 0,
                'deleted' => $result['deleted'] ?? 0,
                'errors' => $errorCount
            ]);
        } else if ($action === 'pull') {
            $message = tp('git_sync.messages.pull_success', [
                'pulled' => $result['pulled'],
                'updated' => $result['updated'],
                'deleted' => $result['deleted'] ?? 0,
                'errors' => $errorCount
            ]);
        }
        // Downgrade to warning if there were partial errors
        if ($errorCount > 0) {
            $warning = $message;
            $message = '';
        }
    } else {
        $error = tp('git_sync.messages.' . $action . '_error', [
            'error' => $result['errors'][0]['error'] ?? 'Unknown error'
        ]);
    }
    // Refresh last sync info since we have new results
    $lastSyncInfo = $gitSync->getLastSyncInfo();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = $_POST['action'];
    
    switch ($action) {
        case 'test':
            $result = $gitSync->testConnection();
            if ($result['success']) {
                $message = tp('git_sync.messages.connection_success', ['repo' => $result['repo']]);
            } else {
                $error = tp('git_sync.messages.connection_error', ['error' => $result['error']]);
            }
            break;
            
        case 'push':
            $result = $gitSync->pushNotes();
            if ($result['success']) {
                $message = tp('git_sync.messages.push_success', [
                    'count' => $result['pushed'],
                    'deleted' => $result['deleted'] ?? 0,
                    'errors' => count($result['errors'])
                ]);
                if (count($result['errors']) > 0) {
                    $warning = $message;
                    $message = '';
                }
            } else {
                $error = tp('git_sync.messages.push_error', ['error' => $result['errors'][0]['error'] ?? 'Unknown error']);
            }
            // Refresh last sync info
            $lastSync = $gitSync->getLastSyncInfo();
            break;
            
        case 'pull':
            $result = $gitSync->pullNotes();
            if ($result['success']) {
                $message = tp('git_sync.messages.pull_success', [
                    'pulled' => $result['pulled'],
                    'updated' => $result['updated'],
                    'deleted' => $result['deleted'] ?? 0,
                    'errors' => count($result['errors'])
                ]);
                if (count($result['errors']) > 0) {
                    $warning = $message;
                    $message = '';
                }
            } else {
                $error = tp('git_sync.messages.pull_error', ['error' => $result['errors'][0]['error'] ?? 'Unknown error']);
            }
            // Refresh last sync info
            $lastSync = $gitSync->getLastSyncInfo();
            break;
            
        case 'update_auto_settings':
            $autoPush = isset($_POST['auto_push']) ? true : false;
            $autoPull = isset($_POST['auto_pull']) ? true : false;
            $gitSync->setAutoPushEnabled($autoPush);
            $gitSync->setAutoPullEnabled($autoPull);
            // Re-fetch config status to update badges
            $configStatus = $gitSync->getConfigStatus();
            $message = tp('git_sync.auto_sync.saving');
            break;
            
        case 'save_config':
            $newConfig = [
                'provider' => $_POST['git_provider'] ?? 'github',
                'api_base' => $_POST['git_api_base'] ?? '',
                'token' => $_POST['git_token'] ?? '',
                'repo' => $_POST['git_repo'] ?? '',
                'branch' => $_POST['git_branch'] ?? 'main',
                'author_name' => $_POST['git_author_name'] ?? 'Poznote',
                'author_email' => $_POST['git_author_email'] ?? 'poznote@localhost',
            ];
            // If token field is the masked placeholder, keep existing token
            if ($newConfig['token'] === '••••••••') {
                unset($newConfig['token']);
            }
            // Do not persist the GitHub default API URL — it is handled automatically
            if ($newConfig['api_base'] === 'https://api.github.com') {
                $newConfig['api_base'] = '';
            }
            if ($gitSync->saveUserGitConfig($newConfig)) {
                $message = t('git_sync.messages.config_saved', [], 'Configuration saved successfully.');
                // Reload config status after save
                $configStatus = $gitSync->getConfigStatus();
                $lastSync = $gitSync->getLastSyncInfo();
            } else {
                $error = t('git_sync.messages.config_save_error', [], 'Failed to save configuration.');
            }
            // Re-determine provider name after config change
            $provider = $configStatus['provider'] ?? 'github';
            $providerName = ($provider === 'github') ? 'GitHub' : (($provider === 'forgejo') ? 'Forgejo' : 'Git');
            break;
    }
}


?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo tp_h('git_sync.title'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php 
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(trim($cache_v));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/git-sync.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
</head>
<body class="home-page git-sync-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
    <div class="home-container git-sync-container">

        <div class="git-sync-nav">
            <a id="backToHomeLink" href="home.php" class="btn btn-secondary go-to-nav-btn">
    				<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_home', [], 'Back to Dashboard', $currentLang); ?>
            </a>
            <a id="backToNotesLink" href="index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_notes', [], 'Back to Notes', $currentLang); ?>
            </a>
            <a id="backToSettingsLink" href="settings.php" class="btn btn-secondary go-to-nav-btn">
                <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                <?php echo t_h('common.back_to_settings', [], 'Back to Settings', $currentLang); ?>
            </a>
            <?php if ($configStatus['enabled'] && $configStatus['configured']): ?>
            <form method="post" class="sync-form">
                <input type="hidden" name="action" value="test">
                <button type="submit" class="btn btn-primary btn-toolbar-size">
                    <?php echo tp_h('git_sync.test.button'); ?>
                </button>
            </form>
            <?php endif; ?>
        </div>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo tp_h('git_sync.description'); ?></p>
        </div>



        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="lucide lucide-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($warning): ?>
        <div class="alert alert-warning">
            <i class="lucide lucide-alert-triangle-triangle"></i>
            <?php echo htmlspecialchars($warning); ?>
        </div>
        <?php endif; ?>

        <?php if ($error): ?>
        <div class="alert alert-error">
            <i class="lucide lucide-alert-triangle-circle"></i>
            <?php echo htmlspecialchars($error); ?>
        </div>
        <?php endif; ?>
        
        <?php if ($result && isset($result['debug']) && !empty($result['debug'])): ?>
        <div style="margin: 20px 0; display: flex; gap: 10px; justify-content: center;">
            <button id="debug-toggle-btn" class="btn btn-secondary" style="font-size: 12px;">
                <i class="lucide lucide-bug"></i> <span id="debug-toggle-text"><?php echo tp_h('git_sync.debug.show'); ?></span>
            </button>
            <button id="debug-copy-btn" class="btn btn-secondary" style="font-size: 12px; display: none;">
                <i class="lucide lucide-copy"></i> <?php echo tp_h('git_sync.debug.copy'); ?>
            </button>
        </div>
        <div id="debug-info" class="debug-info" style="display: none; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; margin: 20px 0; max-height: 300px; overflow-y: auto;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;"><?php echo tp_h('git_sync.debug.title'); ?>:</h4>
            <pre style="margin: 0; font-size: 12px; white-space: pre-wrap; word-wrap: break-word; font-family: monospace; text-align: left;"><?php echo htmlspecialchars(implode("\n", $result['debug'])); ?></pre>
        </div>
        <script>
        const debugContent = <?php echo json_encode(implode("\n", $result['debug'])); ?>;
        
        document.getElementById('debug-toggle-btn')?.addEventListener('click', function() {
            const debugDiv = document.getElementById('debug-info');
            const toggleText = document.getElementById('debug-toggle-text');
            const copyBtn = document.getElementById('debug-copy-btn');
            if (debugDiv.style.display === 'none') {
                debugDiv.style.display = 'block';
                copyBtn.style.display = 'inline-block';
                toggleText.textContent = <?php echo json_encode(tp_h('git_sync.debug.hide')); ?>;
            } else {
                debugDiv.style.display = 'none';
                copyBtn.style.display = 'none';
                toggleText.textContent = <?php echo json_encode(tp_h('git_sync.debug.show')); ?>;
            }
        });
        
        document.getElementById('debug-copy-btn')?.addEventListener('click', function() {
            navigator.clipboard.writeText(debugContent).then(function() {
                const btn = document.getElementById('debug-copy-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="lucide lucide-check"></i> ' + <?php echo json_encode(tp_h('git_sync.debug.copied')); ?>;
                setTimeout(function() {
                    btn.innerHTML = originalHTML;
                }, 2000);
            }).catch(function(err) {
                console.error('Failed to copy:', err);
            });
        });
        </script>
        <?php endif; ?>

        <!-- Configuration Form -->
        <div class="git-sync-section">
            <form method="post" class="git-config-form">
                <input type="hidden" name="action" value="save_config">
                
                <div class="config-grid">
                    <div class="config-item">
                        <span class="config-label"><?php echo tp_h('git_sync.config.status'); ?></span>
                        <span class="config-value">
                            <?php if ($configStatus['enabled']): ?>
                                <span class="badge badge-success"><?php echo t_h('common.enabled'); ?></span>
                            <?php else: ?>
                                <span class="badge badge-disabled"><?php echo t_h('common.disabled'); ?></span>
                            <?php endif; ?>
                        </span>
                    </div>
                </div>
                    
                <?php if (!$configStatus['enabled']): ?>
                <div class="config-hint">
                    <i class="lucide lucide-info"></i>
                    <?php echo t_h('git_sync.config.hint_enable', [], 'Git sync is disabled. An administrator can enable it in Settings > Advanced Settings.'); ?>
                </div>
                <?php else: ?>
                
                <div class="git-config-fields">
                    <div class="git-field-group">
                        <label class="git-field-label" for="git_provider"><?php echo t_h('git_sync.config.provider', [], 'Provider'); ?></label>
                        <select name="git_provider" id="git_provider" class="git-field-input">
                            <option value="github" <?php echo ($configStatus['provider'] === 'github') ? 'selected' : ''; ?>>GitHub</option>
                            <option value="forgejo" <?php echo ($configStatus['provider'] === 'forgejo') ? 'selected' : ''; ?>>Forgejo</option>
                        </select>
                    </div>
                    
                    <div class="git-field-group" id="api-base-row">
                        <label class="git-field-label" for="git_api_base"><?php echo t_h('git_sync.config.api_base', [], 'API Base URL'); ?></label>
                        <input type="text" name="git_api_base" id="git_api_base" class="git-field-input" 
                               value="<?php echo htmlspecialchars($configStatus['apiBase'] ?? ''); ?>" 
                               placeholder="http://localhost:3000/api/v1">
                    </div>
                    
                    <div class="git-field-group">
                        <label class="git-field-label" for="git_token"><?php echo tp_h('git_sync.config.token'); ?></label>
                        <input type="password" name="git_token" id="git_token" class="git-field-input" 
                               value="<?php echo $configStatus['hasToken'] ? '••••••••' : ''; ?>" 
                               placeholder="ghp_xxxx..." autocomplete="off">
                    </div>
                    
                    <div class="git-field-group">
                        <label class="git-field-label" for="git_repo"><?php echo tp_h('git_sync.config.repository'); ?></label>
                        <input type="text" name="git_repo" id="git_repo" class="git-field-input" 
                               value="<?php echo htmlspecialchars($configStatus['repo'] ?? ''); ?>" 
                               placeholder="owner/repo">
                    </div>
                    
                    <div class="git-field-row">
                        <div class="git-field-group">
                            <label class="git-field-label" for="git_branch"><?php echo tp_h('git_sync.config.branch'); ?></label>
                            <input type="text" name="git_branch" id="git_branch" class="git-field-input" 
                                   value="<?php echo htmlspecialchars($configStatus['branch'] ?? 'main'); ?>" 
                                   placeholder="main">
                        </div>
                        
                        <div class="git-field-group">
                            <label class="git-field-label" for="git_author_name"><?php echo t_h('git_sync.config.author_name', [], 'Author Name'); ?></label>
                            <input type="text" name="git_author_name" id="git_author_name" class="git-field-input" 
                                   value="<?php echo htmlspecialchars($configStatus['authorName'] ?? 'Poznote'); ?>" 
                                   placeholder="Poznote">
                        </div>
                    </div>
                    
                    <div class="git-field-group">
                        <label class="git-field-label" for="git_author_email"><?php echo t_h('git_sync.config.author_email', [], 'Author Email'); ?></label>
                        <input type="text" name="git_author_email" id="git_author_email" class="git-field-input" 
                               value="<?php echo htmlspecialchars($configStatus['authorEmail'] ?? 'poznote@localhost'); ?>" 
                               placeholder="poznote@localhost">
                    </div>
                    
                    <div class="git-field-actions">
                        <button type="submit" class="btn btn-primary">
                            <i class="lucide lucide-save"></i>
                            <?php echo t_h('git_sync.config.save', [], 'Save Configuration'); ?>
                        </button>
                    </div>
                </div>
                
                <?php endif; ?>
            </form>
            
            <?php if ($configStatus['enabled'] && $configStatus['configured']): ?>
            <div class="auto-sync-settings">
                <h4><?php echo tp_h('git_sync.auto_sync.title'); ?></h4>
                <form method="post" class="auto-sync-form">
                    <input type="hidden" name="action" value="update_auto_settings">
                    
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="auto_push" onchange="this.form.submit()" <?php echo ($configStatus['autoPush'] ?? false) ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo tp_h('git_sync.auto_sync.push_label'); ?></span>
                            <span class="label-desc"><?php echo tp_h('git_sync.auto_sync.push_description'); ?></span>
                        </div>
                    </div>
                    
                    <div class="form-check">
                        <label class="switch">
                            <input type="checkbox" name="auto_pull" onchange="this.form.submit()" <?php echo ($configStatus['autoPull'] ?? false) ? 'checked' : ''; ?>>
                            <span class="slider round"></span>
                        </label>
                        <div class="check-label">
                            <span class="label-title"><?php echo tp_h('git_sync.auto_sync.pull_label'); ?></span>
                            <span class="label-desc"><?php echo tp_h('git_sync.auto_sync.pull_description'); ?></span>
                        </div>
                    </div>
                </form>
            </div>
            <?php endif; ?>
        </div>

        <?php if ($configStatus['enabled'] && $configStatus['configured']): ?>
        <div class="alert alert-warning" style="justify-content: center; text-align: center; margin-top: 20px;">
            <i class="lucide lucide-info-circle"></i>
            <span>
                <strong><?php echo t_h('git_sync.actions.home_hint', [], 'Push and Pull can be done from Dashboard.', $currentLang); ?></strong>
                <a href="home.php" style="margin-left: 8px; font-weight: 600; text-decoration: underline; color: inherit;">
                    <?php echo t_h('common.back_to_home', [], 'Back to Dashboard', $currentLang); ?>
                </a>
            </span>
        </div>
        <?php endif; ?>

        <div class="git-sync-footer-note">
            <strong><?php echo t_h('slash_menu.callout_important'); ?> :</strong><br>
            <?php echo nl2br(tp_h('git_sync.warning')); ?>
        </div>

    </div>
    
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const syncForms = document.querySelectorAll('form.sync-form');
        
        // Localization strings from PHP
        const i18n = {
            confirmPush: <?php echo json_encode(tp('git_sync.confirm_push')); ?>,
            confirmPull: <?php echo json_encode(tp('git_sync.confirm_pull')); ?>,
            starting: <?php echo json_encode(t('git_sync.starting', [], 'Syncing...')); ?>,
            completed: <?php echo json_encode(t('git_sync.completed', [], 'Completed!')); ?>
        };

        syncForms.forEach(form => {
            const actionInput = form.querySelector('input[name="action"]');
            if (!actionInput) return;
            
            const action = actionInput.value;
            // Only handle push/pull actions (not test)
            if (action !== 'push' && action !== 'pull') return;
            
            form.addEventListener('submit', function(e) {
                // Prevent default submission
                e.preventDefault();
                
                // Build confirmation message
                const confirmMsg = action === 'push' ? i18n.confirmPush : i18n.confirmPull;
                
                // Show modal and wait for user response
                window.modalAlert.confirm(confirmMsg).then(function(confirmed) {
                    if (confirmed) {
                        const title = (action === 'push' ? "Push" : "Pull");
                        
                        // Show progress bar modal
                        const progressBar = window.modalAlert.showProgressBar(
                            title, 
                            i18n.starting
                        );

                        // Polling setup
                        let progressInterval = setInterval(async () => {
                            try {
                                const response = await fetch('api/v1/git-sync/progress');
                                const data = await response.json();
                                if (data.success && data.progress) {
                                    progressBar.update(data.progress.percentage, data.progress.message);
                                }
                            } catch (e) {
                                console.error("Error polling progress:", e);
                            }
                        }, 500);

                        // Execute the sync
                        fetch('api/v1/git-sync/' + action, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({})
                        })
                        .then(response => response.json())
                        .then(data => {
                            clearInterval(progressInterval);
                            
                            if (data.success) {
                                progressBar.update(100, i18n.completed);
                                setTimeout(() => {
                                    progressBar.close();
                                    window.location.reload();
                                }, 500);
                            } else {
                                progressBar.close();
                                window.location.reload();
                            }
                        })
                        .catch(err => {
                            clearInterval(progressInterval);
                            progressBar.close();
                            window.location.reload();
                        });
                    }
                });
            });
        });
        
        // Toggle API base URL field based on provider selection
        const providerSelect = document.getElementById('git_provider');
        const apiBaseInput = document.getElementById('git_api_base');
        
        function updateApiBaseField(provider) {
            if (!apiBaseInput) return;
            if (provider === 'forgejo') {
                apiBaseInput.readOnly = false;
                apiBaseInput.style.opacity = '';
                apiBaseInput.placeholder = 'http://localhost:3000/api/v1';
                if (apiBaseInput.value === 'https://api.github.com') apiBaseInput.value = '';
            } else {
                apiBaseInput.readOnly = true;
                apiBaseInput.style.opacity = '';
                apiBaseInput.value = 'https://api.github.com';
            }
        }

        function updateTokenPlaceholder(provider) {
            const tokenInput = document.getElementById('git_token');
            if (!tokenInput) return;
            tokenInput.placeholder = provider === 'forgejo'
                ? 'a1b2c3d4e5f6... (Settings > Applications)'
                : 'ghp_xxxx... (github.com/settings/tokens)';
        }

        // Clear masked placeholder on focus so user can type new token
        const tokenField = document.getElementById('git_token');
        if (tokenField) {
            tokenField.addEventListener('focus', function() {
                if (this.value === '••••••••') {
                    this.value = '';
                }
            });
            tokenField.addEventListener('blur', function() {
                if (this.value === '') {
                    <?php if ($configStatus['hasToken']): ?>
                    this.value = '••••••••';
                    <?php endif; ?>
                }
            });
        }

        if (providerSelect) {
            // Init on page load
            updateApiBaseField(providerSelect.value);
            updateTokenPlaceholder(providerSelect.value);

            providerSelect.addEventListener('change', function() {
                const tokenInput = document.getElementById('git_token');
                const repoInput = document.getElementById('git_repo');
                if (tokenInput) tokenInput.value = '';
                if (repoInput) repoInput.value = '';
                updateApiBaseField(this.value);
                updateTokenPlaceholder(this.value);
            });
        }
        

    });
    </script>
</body>
</html>
