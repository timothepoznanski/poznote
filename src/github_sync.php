<?php
/**
 * GitHub Sync Status and Actions Page
 * 
 * Accessible from settings, this page shows GitHub sync status and allows manual sync operations.
 */

require 'auth.php';
requireAuth();

// Check if user is admin - only admins can access GitHub sync
if (!isCurrentUserAdmin()) {
    header('Location: settings.php');
    exit;
}

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'GitHubSync.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);

// Initialize GitHubSync
$githubSync = new GitHubSync($con, $_SESSION['user_id'] ?? null);
$configStatus = $githubSync->getConfigStatus();
$lastSync = $githubSync->getLastSyncInfo();

// Handle form submissions
$message = '';
$error = '';
$result = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = $_POST['action'];
    
    switch ($action) {
        case 'test':
            $result = $githubSync->testConnection();
            if ($result['success']) {
                $message = t('github_sync.messages.connection_success', ['repo' => $result['repo']]);
            } else {
                $error = t('github_sync.messages.connection_error', ['error' => $result['error']]);
            }
            break;
            
        case 'push':
            $workspace = $_POST['workspace'] ?? null;
            $result = $githubSync->pushNotes($workspace);
            if ($result['success']) {
                $message = t('github_sync.messages.push_success', [
                    'count' => $result['pushed'],
                    'deleted' => $result['deleted'] ?? 0,
                    'errors' => count($result['errors'])
                ]);
            } else {
                $error = t('github_sync.messages.push_error', ['error' => $result['errors'][0]['error'] ?? 'Unknown error']);
            }
            // Refresh last sync info
            $lastSync = $githubSync->getLastSyncInfo();
            break;
            
        case 'pull':
            $workspace = $_POST['workspace'] ?? null;
            // If empty string, convert to null for all workspaces
            if ($workspace === '') {
                $workspace = null;
            }
            $result = $githubSync->pullNotes($workspace);
            if ($result['success']) {
                $message = t('github_sync.messages.pull_success', [
                    'pulled' => $result['pulled'],
                    'updated' => $result['updated'],
                    'deleted' => $result['deleted'] ?? 0,
                    'errors' => count($result['errors'])
                ]);
            } else {
                $error = t('github_sync.messages.pull_error', ['error' => $result['errors'][0]['error'] ?? 'Unknown error']);
            }
            // Refresh last sync info
            $lastSync = $githubSync->getLastSyncInfo();
            break;
    }
}

// Get workspaces for dropdown
$workspaces = [];
try {
    $stmt = $con->query("SELECT name FROM workspaces ORDER BY name");
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $workspaces[] = $row['name'];
    }
} catch (Exception $e) {
    // If workspaces table doesn't exist or query fails, continue with empty list
    // User can still sync with all workspaces using default option
}

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('github_sync.title'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <?php 
    $cache_v = @file_get_contents('version.txt');
    if ($cache_v === false) $cache_v = time();
    $cache_v = urlencode(trim($cache_v));
    ?>
    <script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/all.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/light.min.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/fontawesome.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/github-sync.css?v=<?php echo $cache_v; ?>">
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
<body class="home-page">
    <div class="home-container github-sync-container">

        <div class="github-sync-nav">
            <a id="backToHomeLink" href="home.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_home', [], 'Back to Home', $currentLang); ?>
            </a>
            <a id="backToNotesLink" href="index.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_notes', [], 'Back to Notes', $currentLang); ?>
            </a>
            <a id="backToSettingsLink" href="settings.php" class="btn btn-secondary">
                <?php echo t_h('common.back_to_settings', [], 'Back to Settings', $currentLang); ?>
            </a>
            <?php if ($configStatus['enabled'] && $configStatus['configured']): ?>
            <form method="post" class="sync-form">
                <input type="hidden" name="action" value="test">
                <button type="submit" class="btn btn-primary">
                    <?php echo t_h('github_sync.test.button'); ?>
                </button>
            </form>
            <?php endif; ?>
        </div>

        <div class="github-sync-header">
            <p class="github-sync-description"><?php echo t_h('github_sync.description'); ?></p>
        </div>

        <div class="limitations-table-wrapper">
            <table class="limitations-table">
                <thead>
                    <tr>
                        <th><?php echo t_h('github_sync.limitations.element'); ?></th>
                        <th><?php echo t_h('github_sync.limitations.html_notes'); ?></th>
                        <th><?php echo t_h('github_sync.limitations.markdown_notes'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><?php echo t_h('github_sync.limitations.text_content'); ?></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                    </tr>
                    <tr>
                        <td><?php echo t_h('github_sync.limitations.attachments'); ?></td>
                        <td class="text-center status-error"><i class="fas fa-times"></i></td>
                        <td class="text-center status-error"><i class="fas fa-times"></i></td>
                    </tr>
                    <tr>
                        <td><?php echo t_h('github_sync.limitations.embedded_images'); ?></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i> *</td>
                        <td class="text-center status-error"><i class="fas fa-times"></i></td>
                    </tr>
                    <tr>
                        <td><?php echo t_h('github_sync.limitations.metadata'); ?></td>
                        <td class="text-center status-error"><i class="fas fa-times"></i></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <p class="limitations-note">
            <strong>*</strong> <?php echo t_h('github_sync.limitations.embedded_note'); ?>
        </p>

        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="fas fa-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($error): ?>
        <div class="alert alert-error">
            <i class="fas fa-exclamation-circle"></i>
            <?php echo htmlspecialchars($error); ?>
        </div>
        <?php endif; ?>
        
        <?php if ($result && isset($result['debug']) && !empty($result['debug'])): ?>
        <div style="margin: 20px 0; display: flex; gap: 10px; justify-content: center;">
            <button id="debug-toggle-btn" class="btn btn-secondary" style="font-size: 12px;">
                <i class="fas fa-bug"></i> <span id="debug-toggle-text"><?php echo t_h('github_sync.debug.show'); ?></span>
            </button>
            <button id="debug-copy-btn" class="btn btn-secondary" style="font-size: 12px; display: none;">
                <i class="fas fa-copy"></i> <?php echo t_h('github_sync.debug.copy'); ?>
            </button>
        </div>
        <div id="debug-info" class="debug-info" style="display: none; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; margin: 20px 0; max-height: 300px; overflow-y: auto;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600;"><?php echo t_h('github_sync.debug.title'); ?>:</h4>
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
                toggleText.textContent = <?php echo json_encode(t_h('github_sync.debug.hide')); ?>;
            } else {
                debugDiv.style.display = 'none';
                copyBtn.style.display = 'none';
                toggleText.textContent = <?php echo json_encode(t_h('github_sync.debug.show')); ?>;
            }
        });
        
        document.getElementById('debug-copy-btn')?.addEventListener('click', function() {
            navigator.clipboard.writeText(debugContent).then(function() {
                const btn = document.getElementById('debug-copy-btn');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> ' + <?php echo json_encode(t_h('github_sync.debug.copied')); ?>;
                setTimeout(function() {
                    btn.innerHTML = originalHTML;
                }, 2000);
            }).catch(function(err) {
                console.error('Failed to copy:', err);
            });
        });
        </script>
        <?php endif; ?>

        <!-- Configuration Status -->
        <div class="github-sync-section">
            <div class="config-grid">
                <div class="config-item">
                    <span class="config-label"><?php echo t_h('github_sync.config.status'); ?></span>
                    <span class="config-value">
                        <?php if ($configStatus['enabled']): ?>
                            <span class="badge badge-success"><?php echo t_h('common.enabled'); ?></span>
                        <?php else: ?>
                            <span class="badge badge-disabled"><?php echo t_h('common.disabled'); ?></span>
                        <?php endif; ?>
                    </span>
                </div>
                
                <div class="config-item">
                    <span class="config-label"><?php echo t_h('github_sync.config.repository'); ?></span>
                    <span class="config-value">
                        <?php if ($configStatus['repo']): ?>
                            <a href="https://github.com/<?php echo htmlspecialchars($configStatus['repo']); ?>" target="_blank" class="repo-link">
                                <i class="fab fa-github"></i> <?php echo htmlspecialchars($configStatus['repo']); ?>
                            </a>
                        <?php else: ?>
                            <span class="not-configured"><?php echo t_h('github_sync.config.not_configured'); ?></span>
                        <?php endif; ?>
                    </span>
                </div>
                
                <div class="config-item">
                    <span class="config-label"><?php echo t_h('github_sync.config.branch'); ?></span>
                    <span class="config-value"><?php echo htmlspecialchars($configStatus['branch']); ?></span>
                </div>
                
                <div class="config-item">
                    <span class="config-label"><?php echo t_h('github_sync.config.token'); ?></span>
                    <span class="config-value">
                        <?php if ($configStatus['hasToken']): ?>
                            <span class="badge badge-success"><?php echo t_h('github_sync.config.token_set'); ?></span>
                        <?php else: ?>
                            <span class="badge badge-warning"><?php echo t_h('github_sync.config.token_missing'); ?></span>
                        <?php endif; ?>
                    </span>
                </div>
            </div>
            
            <?php if (!$configStatus['enabled']): ?>
            <div class="config-hint">
                <i class="fas fa-info-circle"></i>
                <?php echo t_h('github_sync.config.hint'); ?>
            </div>
            <?php endif; ?>
        </div>

        <?php if ($configStatus['enabled'] && $configStatus['configured']): ?>
        <div class="sync-actions-grid">
                <!-- Push to GitHub -->
                <div class="sync-action-card">
                    <h3><?php echo t_h('github_sync.actions.push.title'); ?></h3>
                    <p><?php echo t_h('github_sync.actions.push.description'); ?></p>
                    <form method="post" class="sync-form">
                        <input type="hidden" name="action" value="push">
                        <div class="form-group">
                            <label for="push-workspace"><?php echo t_h('github_sync.actions.workspace'); ?></label>
                            <select name="workspace" id="push-workspace">
                                <option value=""><?php echo t_h('github_sync.actions.all_workspaces'); ?></option>
                                <?php foreach ($workspaces as $ws): ?>
                                <option value="<?php echo htmlspecialchars($ws); ?>"><?php echo htmlspecialchars($ws); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-upload"></i> <span><?php echo t_h('github_sync.actions.push.button'); ?></span>
                        </button>
                    </form>
                </div>
                
                <!-- Pull from GitHub -->
                <div class="sync-action-card">
                    <h3><?php echo t_h('github_sync.actions.pull.title'); ?></h3>
                    <p><?php echo t_h('github_sync.actions.pull.description'); ?></p>
                    <form method="post" class="sync-form">
                        <input type="hidden" name="action" value="pull">
                        <div class="form-group">
                            <label for="pull-workspace"><?php echo t_h('github_sync.actions.target_workspace'); ?></label>
                            <select name="workspace" id="pull-workspace">
                                <option value=""><?php echo t_h('github_sync.actions.all_workspaces'); ?></option>
                                <?php foreach ($workspaces as $ws): ?>
                                <option value="<?php echo htmlspecialchars($ws); ?>"><?php echo htmlspecialchars($ws); ?></option>
                                <?php endforeach; ?>
                                <?php if (empty($workspaces)): ?>
                                <option value="Poznote">Poznote</option>
                                <?php endif; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-download"></i> <span><?php echo t_h('github_sync.actions.pull.button'); ?></span>
                        </button>
                    </form>
                </div>
            </div>
        <?php endif; ?>

        <div class="github-sync-footer-note">
            <strong><?php echo t_h('slash_menu.callout_important'); ?> :</strong><br>
            <?php echo nl2br(t_h('github_sync.warning')); ?>
        </div>

    </div>
    
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
    <script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
    <script>
    /**
     * GitHub Sync Form Handler
     * 
     * Purpose: Show confirmation dialog before push/pull operations and display loading state
     * 
     * Flow:
     * 1. User submits push/pull form
     * 2. Show confirmation modal
     * 3. If confirmed: mark form as confirmed, show spinner, submit
     * 4. If cancelled: do nothing
     */
    document.addEventListener('DOMContentLoaded', function() {
        const syncForms = document.querySelectorAll('form.sync-form');
        
        // Localization strings from PHP
        const i18n = {
            confirmPush: <?php echo json_encode(t('github_sync.confirm_push')); ?>,
            confirmPull: <?php echo json_encode(t('github_sync.confirm_pull')); ?>,
            allWorkspaces: <?php echo json_encode(t('github_sync.actions.all_workspaces')); ?>
        };

        syncForms.forEach(form => {
            const actionInput = form.querySelector('input[name="action"]');
            if (!actionInput) return;
            
            const action = actionInput.value;
            // Only handle push/pull actions (not test)
            if (action !== 'push' && action !== 'pull') return;
            
            form.addEventListener('submit', function(e) {
                // If already confirmed by user, allow form submission
                if (form.dataset.confirmed === 'true') {
                    return;
                }
                
                // Prevent default submission to show confirmation first
                e.preventDefault();
                
                // Get selected workspace name for confirmation message
                const workspaceSelect = form.querySelector('select[name="workspace"]');
                const workspaceName = (workspaceSelect && workspaceSelect.value) ? 
                    (workspaceSelect.options[workspaceSelect.selectedIndex].text) : 
                    i18n.allWorkspaces;
                
                // Build confirmation message
                let confirmMsg = (action === 'push' ? i18n.confirmPush : i18n.confirmPull)
                    .replace('{{workspace}}', workspaceName);
                
                // Show modal and wait for user response
                window.modalAlert.confirm(confirmMsg).then(function(confirmed) {
                    if (confirmed) {
                        // Mark as confirmed to bypass this handler on next submit
                        form.dataset.confirmed = 'true';
                        
                        // Show loading spinner on button
                        // Note: We can't rely on the submit event firing again,
                        // so we manually update the button here
                        const button = form.querySelector('button[type="submit"]');
                        if (button) {
                            const icon = button.querySelector('i');
                            if (icon) {
                                icon.className = 'fas fa-spinner fa-spin';
                            }
                            button.disabled = true;
                        }
                        
                        // Submit the form
                        form.submit();
                    }
                });
            });
        });
    });
    </script>
</body>
</html>
