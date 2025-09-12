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
    <title>Display - Poznote</title>
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
        .back-link { display: inline-flex; margin-bottom: 10px; color: #007DB8; text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; }
        .back-link:hover { color: #005a8a; }

        /* settings list: vertical simple rows */
        .settings-grid {
            display: block;
            margin: 0;
            padding: 0;
        }

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
        .settings-card h3 { margin: 0; color: #1f2937; font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .ai-status { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
        .ai-status.enabled { background: #dcfce7; color: #166534; }
        .ai-status.disabled { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <div class="settings-container">
        <br>
        <a href="index.php?workspace=<?php echo urlencode($workspace_filter); ?>" class="back-link">
            <i class="fas fa-arrow-left"></i>
            Back to Notes
        </a>
        <br>

        <div class="settings-grid">
            <!-- Moved from settings.php: user preferences -->
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

            <div class="settings-card" id="emoji-icons-card">
                <div class="settings-card-icon"><i class="fas fa-smile"></i></div>
                <div class="settings-card-content">
                    <h3>Show Emoji Icons <span id="emoji-icons-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-created-card">
                <div class="settings-card-icon"><i class="fas fa-calendar-alt"></i></div>
                <div class="settings-card-content">
                    <h3>Show Note Creation Date <span id="show-created-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-subheading-card">
                <div class="settings-card-icon"><i class="fas fa-map-marker-alt"></i></div>
                <div class="settings-card-content">
                    <h3>Show Note Subheading <span id="show-subheading-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-counts-card">
                <div class="settings-card-icon"><i class="fas fa-hashtag"></i></div>
                <div class="settings-card-content">
                    <h3>Show Folders Notes Counts <span id="folder-counts-status" class="ai-status disabled">disabled</span></h3>
                </div>
            </div>
        </div>
    </div>

    <?php include 'templates/modals.php'; ?>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script>
    // Toggle logic copied/adapted from settings.php
    (function(){
        // Emoji
        var cardEmoji = document.getElementById('emoji-icons-card');
        var statusEmoji = document.getElementById('emoji-icons-status');
        function refreshEmoji(){
            var form = new FormData(); form.append('action','get'); form.append('key','emoji_icons_enabled');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true');
                if(statusEmoji){ statusEmoji.textContent = enabled ? 'enabled' : 'disabled'; statusEmoji.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled'); }
                if(enabled) document.body.classList.remove('emoji-hidden'); else document.body.classList.add('emoji-hidden');
            }).catch(()=>{});
        }
        if(cardEmoji){ cardEmoji.addEventListener('click', function(){
            var form = new FormData(); form.append('action','get'); form.append('key','emoji_icons_enabled');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var currently = j && j.success && (j.value === '1' || j.value === 'true');
                var toSet = currently ? '0' : '1';
                var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','emoji_icons_enabled'); setForm.append('value', toSet);
                return fetch('api_settings.php',{method:'POST',body:setForm});
            }).then(function(){ refreshEmoji(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e));
        }); }
        refreshEmoji();

        // Show created
        var cardCreated = document.getElementById('show-created-card');
        var statusCreated = document.getElementById('show-created-status');
        function refreshCreated(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_created'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{var enabled = j && j.success && (j.value==='1' || j.value==='true'); if(statusCreated){ statusCreated.textContent = enabled ? 'enabled' : 'disabled'; statusCreated.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled'); }}).catch(()=>{}); }
        if(cardCreated){ cardCreated.addEventListener('click', function(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_created'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ var currently = j && j.success && (j.value === '1' || j.value === 'true'); var toSet = currently ? '0' : '1'; var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','show_note_created'); setForm.append('value', toSet); return fetch('api_settings.php',{method:'POST',body:setForm}); }).then(function(){ refreshCreated(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e)); }); }
        refreshCreated();

        // Subheading
        var cardSub = document.getElementById('show-subheading-card');
        var statusSub = document.getElementById('show-subheading-status');
        function refreshSub(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_subheading'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{var enabled = j && j.success && (j.value==='1' || j.value==='true'); if(statusSub){ statusSub.textContent = enabled ? 'enabled' : 'disabled'; statusSub.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled'); }}).catch(()=>{}); }
        if(cardSub){ cardSub.addEventListener('click', function(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_subheading'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ var currently = j && j.success && (j.value === '1' || j.value === 'true'); var toSet = currently ? '0' : '1'; var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','show_note_subheading'); setForm.append('value', toSet); return fetch('api_settings.php',{method:'POST',body:setForm}); }).then(function(){ refreshSub(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e)); }); }
        refreshSub();

        // Folder counts (localStorage)
        var cardFolder = document.getElementById('folder-counts-card');
        var statusFolder = document.getElementById('folder-counts-status');
        function refreshFolder(){ try{ var raw = localStorage.getItem('showFolderNoteCounts'); var enabled = raw === null ? true : (raw === 'true'); if(statusFolder){ statusFolder.textContent = enabled ? 'enabled' : 'disabled'; statusFolder.className = 'ai-status ' + (enabled ? 'enabled' : 'disabled'); } }catch(e){} }
        if(cardFolder){ cardFolder.addEventListener('click', function(){ try{ var raw = localStorage.getItem('showFolderNoteCounts'); var currently = raw === null ? true : (raw === 'true'); var toSet = !currently; localStorage.setItem('showFolderNoteCounts', toSet); refreshFolder(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }catch(e){console.error(e);} }); }
        refreshFolder();
    })();
    </script>
</body>
</html>
