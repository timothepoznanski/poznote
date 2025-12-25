<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Include page initialization
require_once 'page_init.php';

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

$currentLang = getUserLanguage();

?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('settings.title'); ?> - <?php echo t_h('app.name'); ?></title>
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/settings.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
</head>

<body>
    <div class="settings-container">
        <br>
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>
        <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>
        <br><br>
        
        <div class="settings-grid">
            <!-- Workspace Management -->
            <div class="settings-card" onclick="window.location = 'workspaces.php';">
                <div class="settings-card-icon">
                    <i class="fa-layer-group"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.workspaces'); ?></h3>
                </div>
            </div>
                        
            <!-- Backup -->
            <div class="settings-card" onclick="window.location = 'backup_export.php';">
                <div class="settings-card-icon">
                    <i class="fa-upload"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.backup_export'); ?></h3>
                </div>
            </div>
            
            <!-- Restore -->
            <div class="settings-card" onclick="window.location = 'restore_import.php';">
                <div class="settings-card-icon">
                    <i class="fa-download"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.restore_import'); ?></h3>
                </div>
            </div>

            <!-- Updates -->
            <div class="settings-card" onclick="checkForUpdates();">
                <div class="settings-card-icon">
                    <i class="fa-sync-alt"></i>
                    <span class="update-badge" style="display: none;"></span>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.check_updates'); ?></h3>
                </div>
            </div>

            <!-- API Documentation -->
            <div class="settings-card" onclick="window.open('api-docs/', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-code"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.api_docs'); ?></h3>
                </div>
            </div>

            <!-- Github repository -->
            <div class="settings-card" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-code-branch"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.documentation'); ?></h3>
                </div>
            </div>

            <!-- News -->
            <div class="settings-card" onclick="window.open('https://poznote.com/news.html', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-newspaper"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.news'); ?></h3>
                </div>
            </div>

            <!-- Poznote Website -->
            <div class="settings-card" onclick="window.open('https://poznote.com', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-globe"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.website'); ?></h3>
                </div>
            </div>

            <!-- Support Developer -->
            <div class="settings-card" onclick="window.open('https://ko-fi.com/timothepoznanski', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-coffee"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('settings.cards.support'); ?></h3>
                </div>
            </div>
        </div>
    </div>
    
    <!-- For Update modal -->
    <?php include 'modals.php'; ?>
    
    <!-- Include JavaScript files -->
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    
    <script>
        // Language setting
        (function() {
            var select = document.getElementById('languageSelect');
            var status = document.getElementById('languageStatus');
            if (!select) return;
            select.addEventListener('change', function() {
                var lang = select.value;
                if (status) status.textContent = <?php echo json_encode(t('settings.language.reload_hint')); ?>;
                var form = new FormData();
                form.append('action', 'set');
                form.append('key', 'language');
                form.append('value', lang);
                fetch('api_settings.php', { method: 'POST', body: form, credentials: 'same-origin' })
                    .then(function(r) { return r.json(); })
                    .then(function(j) {
                        if (j && j.success) {
                            if (window.opener && window.opener.location) {
                                try { window.opener.location.reload(); } catch(e) {}
                            }
                            window.location.reload();
                        } else {
                            if (status) status.textContent = <?php echo json_encode(t('settings.language.save_error')); ?>;
                        }
                    })
                    .catch(function() {
                        if (status) status.textContent = <?php echo json_encode(t('settings.language.save_error')); ?>;
                    });
            });
        })();

        // Update Back to Notes link with workspace from localStorage
        (function() {
            try {
                var workspace = localStorage.getItem('poznote_selected_workspace');
                var backLink = document.getElementById('backToNotesLink');
                if (backLink && workspace && workspace !== '') {
                    var url = new URL(backLink.href, window.location.origin);
                    url.searchParams.set('workspace', workspace);
                    backLink.href = url.toString();
                }
            } catch(e) {
                // Ignore errors
            }
        })();
        
        function showNotification(message) {
            // Simple notification for fold/unfold actions
            var notification = document.createElement('div');
            notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000; font-family: Inter, sans-serif;';
            notification.textContent = message;
            document.body.appendChild(notification);
            setTimeout(function() {
                notification.remove();
            }, 2000);
        }
        
        function toggleFolderNoteCounts() {
            // Get current setting from localStorage (default: true - enabled)
            const currentSettingRaw = localStorage.getItem('showFolderNoteCounts');
            const currentSetting = currentSettingRaw === null ? true : (currentSettingRaw === 'true');
            const newSetting = !currentSetting;
            
            // Save new setting
            localStorage.setItem('showFolderNoteCounts', newSetting);
            
            // Update the card badge
            updateFolderCountsBadge(newSetting);
            
            // Apply the setting immediately if on main page
            if (window.opener && window.opener.location.pathname.includes('index.php')) {
                window.opener.location.reload();
            }
        }
        
        function updateFolderCountsBadge(isEnabled) {
            const badge = document.getElementById('folder-counts-status');
            if (badge) {
                badge.textContent = isEnabled ? 'enabled' : 'disabled';
                badge.className = 'setting-status ' + (isEnabled ? 'enabled' : 'disabled');
            }
        }
        
        // Update badge on page load
        document.addEventListener('DOMContentLoaded', function() {
            const raw = localStorage.getItem('showFolderNoteCounts');
            const showCounts = raw === null ? true : (raw === 'true');
            updateFolderCountsBadge(showCounts);
            // apply immediately on main if opened
            if (window.opener && window.opener.location.pathname.includes('index.php')) {
                window.opener.location.reload();
            }
            
            // Check for updates automatically and restore badge if needed
            checkForUpdatesAutomatic();
            restoreUpdateBadge();
        });
        
        // Set workspace context for JavaScript functions
        window.selectedWorkspace = <?php echo json_encode(getWorkspaceFilter()); ?>;
        
    </script>
</body>
</html>
