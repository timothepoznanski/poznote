<?php
/**
 * Git Sync Status and Actions Page
 * 
 * Accessible from settings, this page shows Git sync status and allows manual sync operations.
 */

require 'auth.php';
requireAuth();

// Check if user is admin - only admins can access Git sync
if (!isCurrentUserAdmin()) {
    header('Location: settings.php');
    exit;
}

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'GitSync.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);

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
            $workspace = $_POST['workspace'] ?? null;
            $result = $gitSync->pushNotes($workspace);
            if ($result['success']) {
                $message = tp('git_sync.messages.push_success', [
                    'count' => $result['pushed'],
                    'attachments' => $result['attachments_pushed'] ?? 0,
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
            $workspace = $_POST['workspace'] ?? null;
            // If empty string, convert to null for all workspaces
            if ($workspace === '') {
                $workspace = null;
            }
            $result = $gitSync->pullNotes($workspace);
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
    <title><?php echo tp_h('git_sync.title'); ?> - <?php echo getPageTitle(); ?></title>
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
<body class="home-page">
    <div class="home-container git-sync-container">

        <div class="git-sync-nav">
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
                    <?php echo tp_h('git_sync.test.button'); ?>
                </button>
            </form>
            <?php endif; ?>
        </div>

        <div class="git-sync-header">
            <p class="git-sync-description"><?php echo tp_h('git_sync.description'); ?></p>
        </div>

        <div class="limitations-table-wrapper">
            <table class="limitations-table">
                <thead>
                    <tr>
                        <th><?php echo tp_h('git_sync.limitations.element'); ?></th>
                        <th><?php echo tp_h('git_sync.limitations.html_notes'); ?></th>
                        <th><?php echo tp_h('git_sync.limitations.markdown_notes'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><?php echo tp_h('git_sync.limitations.text_content'); ?></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                    </tr>
                    <tr>
                        <td><?php echo tp_h('git_sync.limitations.attachments'); ?> (images, files, etc.)</td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                    </tr>
                    <tr>
                        <td><?php echo tp_h('git_sync.limitations.metadata'); ?></td>
                        <td class="text-center status-error"><i class="fas fa-times"></i></td>
                        <td class="text-center status-success"><i class="fas fa-check"></i></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <?php if ($message): ?>
        <div class="alert alert-success">
            <i class="fas fa-check-circle"></i>
            <?php echo htmlspecialchars($message); ?>
        </div>
        <?php endif; ?>

        <?php if ($warning): ?>
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <?php echo htmlspecialchars($warning); ?>
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
                <i class="fas fa-bug"></i> <span id="debug-toggle-text"><?php echo tp_h('git_sync.debug.show'); ?></span>
            </button>
            <button id="debug-copy-btn" class="btn btn-secondary" style="font-size: 12px; display: none;">
                <i class="fas fa-copy"></i> <?php echo tp_h('git_sync.debug.copy'); ?>
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
                btn.innerHTML = '<i class="fas fa-check"></i> ' + <?php echo json_encode(tp_h('git_sync.debug.copied')); ?>;
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
        <div class="git-sync-section">
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
                
                <div class="config-item">
                    <span class="config-label"><?php echo tp_h('git_sync.config.repository'); ?></span>
                    <span class="config-value">
                        <?php if ($configStatus['repo']): ?>
                            <?php 
                            $repoUrl = ($provider === 'github') 
                                ? "https://github.com/" . htmlspecialchars($configStatus['repo'])
                                : rtrim($configStatus['apiBase'], '/api/v1') . "/" . htmlspecialchars($configStatus['repo']);
                            ?>
                            <a href="<?php echo $repoUrl; ?>" target="_blank" class="repo-link">
                                <i class="<?php echo ($provider === 'github' ? 'fab fa-github' : 'fas fa-code-branch'); ?>"></i> <?php echo htmlspecialchars($configStatus['repo']); ?>
                            </a>
                        <?php else: ?>
                            <span class="not-configured"><?php echo tp_h('git_sync.config.not_configured'); ?></span>
                        <?php endif; ?>
                    </span>
                </div>
                
                <div class="config-item">
                    <span class="config-label"><?php echo tp_h('git_sync.config.branch'); ?></span>
                    <span class="config-value"><?php echo htmlspecialchars($configStatus['branch']); ?></span>
                </div>
                
                <div class="config-item">
                    <span class="config-label"><?php echo tp_h('git_sync.config.token'); ?></span>
                    <span class="config-value">
                        <?php if ($configStatus['hasToken']): ?>
                            <span class="badge badge-success"><?php echo tp_h('git_sync.config.token_set'); ?></span>
                        <?php else: ?>
                            <span class="badge badge-warning"><?php echo tp_h('git_sync.config.token_missing'); ?></span>
                        <?php endif; ?>
                    </span>
                </div>
            </div>
            
            <?php if (!$configStatus['enabled']): ?>
            <div class="config-hint">
                <i class="fas fa-info-circle"></i>
                <?php echo tp_h('git_sync.config.hint'); ?>
            </div>
            <?php else: ?>
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
        <div class="sync-actions-grid">
                <!-- Push to Git -->
                <div class="sync-action-card">
                    <h3><?php echo tp_h('git_sync.actions.push.title'); ?></h3>
                    <p><?php echo tp_h('git_sync.actions.push.description'); ?></p>
                    <form method="post" class="sync-form">
                        <input type="hidden" name="action" value="push">
                        <div class="form-group">
                            <label for="push-workspace"><?php echo tp_h('git_sync.actions.workspace'); ?></label>
                            <select name="workspace" id="push-workspace">
                                <option value=""><?php echo tp_h('git_sync.actions.all_workspaces'); ?></option>
                                <?php foreach ($workspaces as $ws): ?>
                                <option value="<?php echo htmlspecialchars($ws); ?>"><?php echo htmlspecialchars($ws); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-upload"></i> <span><?php echo tp_h('git_sync.actions.push.button'); ?></span>
                        </button>
                    </form>
                </div>
                
                <!-- Pull from Git -->
                <div class="sync-action-card">
                    <h3><?php echo tp_h('git_sync.actions.pull.title'); ?></h3>
                    <p><?php echo tp_h('git_sync.actions.pull.description'); ?></p>
                    <form method="post" class="sync-form">
                        <input type="hidden" name="action" value="pull">
                        <div class="form-group">
                            <label for="pull-workspace"><?php echo tp_h('git_sync.actions.target_workspace'); ?></label>
                            <select name="workspace" id="pull-workspace">
                                <option value=""><?php echo tp_h('git_sync.actions.all_workspaces'); ?></option>
                                <?php foreach ($workspaces as $ws): ?>
                                <option value="<?php echo htmlspecialchars($ws); ?>"><?php echo htmlspecialchars($ws); ?></option>
                                <?php endforeach; ?>
                                <?php if (empty($workspaces)): ?>
                                <option value="Poznote">Poznote</option>
                                <?php endif; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-download"></i> <span><?php echo tp_h('git_sync.actions.pull.button'); ?></span>
                        </button>
                    </form>
                </div>
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
            allWorkspaces: <?php echo json_encode(tp('git_sync.actions.all_workspaces')); ?>,
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
                
                // Get selected workspace name for confirmation message
                const workspaceSelect = form.querySelector('select[name="workspace"]');
                const workspaceValue = workspaceSelect ? workspaceSelect.value : "";
                const workspaceText = (workspaceSelect && workspaceSelect.value) ? 
                    (workspaceSelect.options[workspaceSelect.selectedIndex].text) : 
                    i18n.allWorkspaces;
                
                // Build confirmation message
                let confirmMsg = (action === 'push' ? i18n.confirmPush : i18n.confirmPull)
                    .replace('{{workspace}}', workspaceText);
                
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
                            body: JSON.stringify({ workspace: workspaceValue })
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
    });
    </script>
</body>
</html>
