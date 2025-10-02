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

?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Settings - Poznote</title>
    <link rel="stylesheet" href="css/settings.css">
    <link rel="stylesheet" href="css/modals.css">
</head>

<body>
    <div class="settings-container">
        <br>
        <?php 
            $back_params = [];
            $back_params[] = 'workspace=' . urlencode(getWorkspaceFilter());
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php?' . implode('&', $back_params);
        ?>
        <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            Back to Notes
        </a>
        <br><br>
        
        <div class="settings-grid">
            <!-- Workspace Management -->
            <div class="settings-card" onclick="window.location = 'workspaces.php';">
                <div class="settings-card-icon">
                    <i class="fa-layer-group"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Workspaces</h3>
                </div>
            </div>
            
            <!-- AI Settings -->
            <div class="settings-card" onclick="window.location = 'ai.php';">
                <div class="settings-card-icon">
                    <i class="fa-robot-svg"></i>
                </div>
                <div class="settings-card-content">
                    <h3>AI Settings
                        <?php echo isAIEnabled() ? '<span class="setting-status enabled">enabled</span>' : '<span class="setting-status disabled">disabled</span>'; ?>
                    </h3>
                </div>
            </div>
                        
            <!-- Backup -->
            <div class="settings-card" onclick="window.location = 'backup_export.php';">
                <div class="settings-card-icon">
                    <i class="fa-upload"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Backup (Export)</h3>
                </div>
            </div>
            
            <!-- Restore -->
            <div class="settings-card" onclick="window.location = 'restore_import.php';">
                <div class="settings-card-icon">
                    <i class="fa-download"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Restore (Import)</h3>
                </div>
            </div>

            <!-- Release Notes -->
            <div class="settings-card" onclick="window.open('https://raw.githubusercontent.com/timothepoznanski/poznote/main/RELEASE_NOTES.md', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-file-alt"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Release Notes</h3>
                </div>
            </div>

            <!-- Updates -->
            <div class="settings-card" onclick="checkForUpdates();">
                <div class="settings-card-icon">
                    <i class="fa-sync-alt"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Check for Updates</h3>
                </div>
            </div>

            <!-- Github repository -->
            <div class="settings-card" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-code-branch"></i>
                </div>
                <div class="settings-card-content">
                    <h3>GitHub Repository</h3>
                </div>
            </div>

            <!-- Poznote Website -->
            <div class="settings-card" onclick="window.open('https://poznote.com', '_blank');">
                <div class="settings-card-icon">
                    <i class="fa-globe"></i>
                </div>
                <div class="settings-card-content">
                    <h3>About Poznote</h3>
                </div>
            </div>
        </div>
    </div>
    
    <!-- For Update modal -->
    <?php include 'modals.php'; ?>
    
    <!-- Include JavaScript files -->
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    
    <script>
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
        });
        
        // Set workspace context for JavaScript functions
        window.selectedWorkspace = <?php echo json_encode(getWorkspaceFilter()); ?>;
        
        // Release Notes now open on GitHub (no local modal)
    </script>
</body>
</html>
