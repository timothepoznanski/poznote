<?php
/**
 * GitHub Sync Status and Actions Page
 * 
 * Accessible from settings, this page shows GitHub sync status and allows manual sync operations.
 */

require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';
require_once 'GitHubSync.php';

$currentLang = getUserLanguage();
$currentUser = getCurrentUser();
$username = htmlspecialchars($currentUser['display_name'] ?: $currentUser['username']);

// Get global login_display_name for page title
require_once 'users/db_master.php';
$login_display_name = getGlobalSetting('login_display_name', '');
$pageTitle = ($login_display_name && trim($login_display_name) !== '') 
    ? htmlspecialchars($login_display_name) 
    : t_h('app.name');

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
                    'errors' => count($result['errors'])
                ]);
            } else {
                $error = t('github_sync.messages.push_error', ['error' => $result['errors'][0]['error'] ?? 'Unknown error']);
            }
            // Refresh last sync info
            $lastSync = $githubSync->getLastSyncInfo();
            break;
            
        case 'pull':
            $workspace = $_POST['workspace'] ?? 'Poznote';
            $result = $githubSync->pullNotes($workspace);
            if ($result['success']) {
                $message = t('github_sync.messages.pull_success', [
                    'pulled' => $result['pulled'],
                    'updated' => $result['updated']
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
    // Ignore
}

?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('github_sync.title'); ?> - <?php echo $pageTitle; ?></title>
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
    <link rel="stylesheet" href="css/settings.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/github-sync.css?v=<?php echo $cache_v; ?>">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo $cache_v; ?>">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
</head>
<body>
    <div class="settings-container github-sync-container">
        <!-- Back to Settings -->
        <a id="backToSettingsLink" href="settings.php" class="btn btn-secondary">
            <?php echo t_h('common.back_to_settings', [], 'Back to Settings', $currentLang); ?>
        </a>
        <br><br>

        <div class="github-sync-header">
            <p class="github-sync-description"><?php echo t_h('github_sync.description'); ?></p>
        </div>

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

        <!-- Configuration Status -->
        <div class="github-sync-section">
            <h2><i class="fas fa-cog"></i> <?php echo t_h('github_sync.config.title'); ?></h2>
            
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
                    <span class="config-label"><?php echo t_h('github_sync.config.mode'); ?></span>
                    <span class="config-value">
                        <span class="badge badge-info"><?php echo htmlspecialchars(ucfirst($configStatus['mode'])); ?></span>
                    </span>
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
        
        <!-- Test Connection -->
        <div class="github-sync-section">
            <h2><i class="fas fa-plug"></i> <?php echo t_h('github_sync.test.title'); ?></h2>
            <form method="post" class="sync-form">
                <input type="hidden" name="action" value="test">
                <button type="submit" class="btn btn-secondary">
                    <i class="fas fa-link"></i> <?php echo t_h('github_sync.test.button'); ?>
                </button>
            </form>
        </div>

        <!-- Last Sync Info -->
        <?php if ($lastSync): ?>
        <div class="github-sync-section">
            <h2><i class="fas fa-history"></i> <?php echo t_h('github_sync.last_sync.title'); ?></h2>
            <div class="last-sync-info">
                <p>
                    <strong><?php echo t_h('github_sync.last_sync.action'); ?>:</strong> 
                    <?php echo htmlspecialchars(ucfirst($lastSync['action'] ?? 'unknown')); ?>
                </p>
                <p>
                    <strong><?php echo t_h('github_sync.last_sync.time'); ?>:</strong> 
                    <?php echo htmlspecialchars($lastSync['timestamp'] ?? '-'); ?>
                </p>
                <?php if (isset($lastSync['pushed'])): ?>
                <p>
                    <strong><?php echo t_h('github_sync.last_sync.pushed'); ?>:</strong> 
                    <?php echo intval($lastSync['pushed']); ?> <?php echo t_h('github_sync.last_sync.notes'); ?>
                </p>
                <?php endif; ?>
                <?php if (isset($lastSync['pulled'])): ?>
                <p>
                    <strong><?php echo t_h('github_sync.last_sync.pulled'); ?>:</strong> 
                    <?php echo intval($lastSync['pulled']); ?> <?php echo t_h('github_sync.last_sync.notes'); ?>
                </p>
                <?php endif; ?>
            </div>
        </div>
        <?php endif; ?>

        <!-- Sync Actions -->
        <div class="github-sync-section">
            <h2><i class="fas fa-sync-alt"></i> <?php echo t_h('github_sync.actions.title'); ?></h2>
            
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
                            <i class="fas fa-upload"></i> <?php echo t_h('github_sync.actions.push.button'); ?>
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
                                <?php foreach ($workspaces as $ws): ?>
                                <option value="<?php echo htmlspecialchars($ws); ?>"><?php echo htmlspecialchars($ws); ?></option>
                                <?php endforeach; ?>
                                <?php if (empty($workspaces)): ?>
                                <option value="Poznote">Poznote</option>
                                <?php endif; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-download"></i> <?php echo t_h('github_sync.actions.pull.button'); ?>
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <?php endif; ?>

    </div>
    
    <script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>
