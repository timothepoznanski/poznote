<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Mobile detection
$is_mobile = false;
if (isset($_SERVER['HTTP_USER_AGENT'])) {
    $is_mobile = preg_match('/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/', strtolower($_SERVER['HTTP_USER_AGENT'])) ? true : false;
}

// Get current workspace
$workspace_filter = $_GET['workspace'] ?? $_POST['workspace'] ?? 'Poznote';
?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Settings - Poznote</title>
    <?php include 'templates/head_includes.php'; ?>
    <style>
        body {
            background: #f8f9fa;
            font-family: 'Inter', sans-serif;
        }
        .settings-container {
            max-width: 800px;
            margin: 10px auto;
            padding: 8px 12px;
            display: block;
        }
        .settings-header {
            padding: 12px 8px;
            margin-bottom: 8px;
        }
        .settings-header h1 {
            margin: 0 0 6px 0;
            color: #1f2937;
            font-size: 1.15rem;
            font-weight: 600;
        }
        .settings-header p { display: none; }

        /* settings list: vertical simple rows */
        .settings-grid {
            display: block;
            margin: 0;
            padding: 0;
        }

        .back-link { display: inline-flex; margin-bottom: 10px; }

        .settings-card {
            background: transparent;
            border-radius: 0;
            padding: 12px 6px;
            cursor: pointer;
            transition: background 0.12s ease;
            border-bottom: 1px solid #eef2f5;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .settings-card:hover { background: rgba(15,23,42,0.02); }
        .settings-card-icon {
            width: 20px;
            height: 20px;
            border-radius: 3px;
            background: transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #6b7280;
            font-size: 0.95rem;
        }
        .settings-card-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
        }
        .settings-card h3 {
            margin: 0;
            color: #1f2937;
            font-size: 0.95rem;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .back-link {
            color: #007DB8;
            text-decoration: none;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 20px;
        }
        .back-link:hover {
            color: #005a8a;
        }
        .ai-status {
            font-size: 0.75rem;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: 8px;
        }
        .ai-status.enabled {
            background: #dcfce7;
            color: #166534;
        }
        .ai-status.disabled {
            background: #fee2e2;
            color: #991b1b;
        }
        
        @media (max-width: 640px) {
            .settings-container {
                margin: 10px;
                padding: 10px;
            }
            .settings-grid {
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            }
        }
    </style>
</head>

<body>
    <div class="settings-container">
        <a href="index.php?workspace=<?php echo urlencode($workspace_filter); ?>" class="back-link">
            <i class="fas fa-arrow-left"></i>
            Back to Notes
        </a>
        
        <div class="settings-grid">
            <!-- Workspace Management -->
            <div class="settings-card" onclick="window.location = 'manage_workspaces.php';">
                <div class="settings-card-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Workspaces</h3>
                </div>
            </div>
            
            <!-- AI Settings -->
            <div class="settings-card" onclick="window.location = 'ai.php';">
                <div class="settings-card-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="settings-card-content">
                    <h3>AI Settings
                        <?php echo isAIEnabled() ? '<span class="ai-status enabled">enabled</span>' : '<span class="ai-status disabled">disabled</span>'; ?>
                    </h3>
                </div>
            </div>
            
            <!-- User Preferences -->
            <div class="settings-card" onclick="showLoginDisplayNamePrompt();">
                <div class="settings-card-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Login Display Name</h3>
                </div>
            </div>
            
            <div class="settings-card" onclick="showNoteFontSizePrompt();">
                <div class="settings-card-icon">
                    <i class="fas fa-text-height"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Note Font Size</h3>
                </div>
            </div>
            
            <div class="settings-card" onclick="toggleFolderNoteCounts();">
                <div class="settings-card-icon">
                    <i class="fas fa-hashtag"></i>
                </div>
                <div class="settings-card-content">
                    <h3 id="folder-counts-title">Show Folders Notes Counts 
                        <span id="folder-counts-status" class="ai-status disabled">disabled</span>
                    </h3>
                </div>
            </div>

            <!-- Emoji Icons toggle -->
            <div class="settings-card" id="emoji-icons-card">
                <div class="settings-card-icon">
                    <i class="fas fa-smile"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Show Emoji Icons <span id="emoji-icons-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>

            <!-- Show Created Date toggle -->
            <div class="settings-card" id="show-created-card">
                <div class="settings-card-icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Show Note Creation Date <span id="show-created-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>

            <!-- Show Subheading toggle (renamed from Location) -->
            <div class="settings-card" id="show-subheading-card">
                <div class="settings-card-icon">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Show Note Heading <span id="show-subheading-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>
            
            <!-- Data Management -->
            <div class="settings-card" onclick="window.location = 'backup_export.php';">
                <div class="settings-card-icon">
                    <i class="fas fa-upload"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Backup (Export)</h3>
                </div>
            </div>
            
            <div class="settings-card" onclick="window.location = 'restore_import.php';">
                <div class="settings-card-icon">
                    <i class="fas fa-download"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Restore (Import)</h3>
                </div>
            </div>
            
            <!-- System -->
            <div class="settings-card" onclick="checkForUpdates();">
                <div class="settings-card-icon">
                    <i class="fas fa-sync-alt"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Check for Updates</h3>
                </div>
            </div>
            
            <!-- Links -->
            <div class="settings-card" onclick="window.open('https://github.com/timothepoznanski/poznote', '_blank');">
                <div class="settings-card-icon">
                    <i class="fas fa-code-branch"></i>
                </div>
                <div class="settings-card-content">
                    <h3>GitHub Repository</h3>
                </div>
            </div>
            
            <div class="settings-card" onclick="window.open('https://poznote.com', '_blank');">
                <div class="settings-card-icon">
                    <i class="fas fa-globe"></i>
                </div>
                <div class="settings-card-content">
                    <h3>About Poznote</h3>
                </div>
            </div>
            
            <!-- Logout removed per UI simplification -->
        </div>
    </div>
    
    <!-- Include necessary modals -->
    <?php include 'templates/modals.php'; ?>
    
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
                badge.className = 'ai-status ' + (isEnabled ? 'enabled' : 'disabled');
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

        // Emoji icons toggle logic
        (function() {
            var card = document.getElementById('emoji-icons-card');
            var status = document.getElementById('emoji-icons-status');

            function refreshStatus() {
                var form = new FormData();
                form.append('action', 'get');
                form.append('key', 'emoji_icons_enabled');
                fetch('api_settings.php', { method: 'POST', body: form })
                .then(function(r) { return r.json(); })
                .then(function(j) {
                    var enabled = j && j.success && (j.value === '1' || j.value === 'true');
                    if (status) {
                        status.textContent = enabled ? 'enabled' : 'disabled';
                        status.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled');
                    }
                    if (enabled) document.body.classList.remove('emoji-hidden'); else document.body.classList.add('emoji-hidden');
                })
                .catch(function(){});
            }

            if (card) {
                card.addEventListener('click', function() {
                    var form = new FormData();
                    form.append('action', 'get');
                    form.append('key', 'emoji_icons_enabled');
                    fetch('api_settings.php', { method: 'POST', body: form })
                    .then(function(r) { return r.json(); })
                    .then(function(j) {
                        var currently = j && j.success && (j.value === '1' || j.value === 'true');
                        var toSet = currently ? '0' : '1';
                        var setForm = new FormData();
                        setForm.append('action', 'set');
                        setForm.append('key', 'emoji_icons_enabled');
                        setForm.append('value', toSet);
                        return fetch('api_settings.php', { method: 'POST', body: setForm });
                    })
                    .then(function() { refreshStatus(); if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); })
                    .catch(function(e){ console.error(e); });
                });
            }

            // initial load
            refreshStatus();
        })();
        
        // Show created date toggle logic
        (function() {
            var card = document.getElementById('show-created-card');
            var status = document.getElementById('show-created-status');

            function refreshStatus() {
                var form = new FormData();
                form.append('action', 'get');
                form.append('key', 'show_note_created');
                fetch('api_settings.php', { method: 'POST', body: form })
                .then(function(r) { return r.json(); })
                .then(function(j) {
                    var enabled = j && j.success && (j.value === '1' || j.value === 'true');
                    if (status) {
                        status.textContent = enabled ? 'enabled' : 'disabled';
                        status.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled');
                    }
                    if (enabled) document.body.classList.add('show-note-created'); else document.body.classList.remove('show-note-created');
                })
                .catch(function(){});
            }

            if (card) {
                card.addEventListener('click', function() {
                    var form = new FormData();
                    form.append('action', 'get');
                    form.append('key', 'show_note_created');
                    fetch('api_settings.php', { method: 'POST', body: form })
                    .then(function(r) { return r.json(); })
                    .then(function(j) {
                        var currently = j && j.success && (j.value === '1' || j.value === 'true');
                        var toSet = currently ? '0' : '1';
                        var setForm = new FormData();
                        setForm.append('action', 'set');
                        setForm.append('key', 'show_note_created');
                        setForm.append('value', toSet);
                        return fetch('api_settings.php', { method: 'POST', body: setForm });
                    })
                    .then(function() { refreshStatus(); if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); })
                    .catch(function(e){ console.error(e); });
                });
            }

            // initial load
            refreshStatus();
        })();

        // Show subheading toggle logic (renamed from location)
        (function() {
            var card = document.getElementById('show-subheading-card');
            var status = document.getElementById('show-subheading-status');

            function refreshStatus() {
                var form = new FormData();
                form.append('action', 'get');
                form.append('key', 'show_note_subheading');
                fetch('api_settings.php', { method: 'POST', body: form })
                .then(function(r) { return r.json(); })
                .then(function(j) {
                    var enabled = j && j.success && (j.value === '1' || j.value === 'true');
                    if (status) {
                        status.textContent = enabled ? 'enabled' : 'disabled';
                        status.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled');
                    }
                    if (enabled) document.body.classList.add('show-note-subheading'); else document.body.classList.remove('show-note-subheading');
                })
                .catch(function(){});
            }

            if (card) {
                card.addEventListener('click', function() {
                    var form = new FormData();
                    form.append('action', 'get');
                    form.append('key', 'show_note_subheading');
                    fetch('api_settings.php', { method: 'POST', body: form })
                    .then(function(r) { return r.json(); })
                    .then(function(j) {
                        var currently = j && j.success && (j.value === '1' || j.value === 'true');
                        var toSet = currently ? '0' : '1';
                        var setForm = new FormData();
                        setForm.append('action', 'set');
                        setForm.append('key', 'show_note_subheading');
                        setForm.append('value', toSet);
                        return fetch('api_settings.php', { method: 'POST', body: setForm });
                    })
                    .then(function() { refreshStatus(); })
                    .catch(function(e){ console.error(e); });
                });
            }

            // initial load
            refreshStatus();
        })();
        
        // Set workspace context for JavaScript functions
        window.selectedWorkspace = <?php echo json_encode($workspace_filter); ?>;
    </script>
</body>
</html>
