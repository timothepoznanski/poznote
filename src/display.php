<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

?>

<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title>Display - Poznote</title>
    <link rel="stylesheet" href="css/display.css">
    <link rel="stylesheet" href="css/modals.css">
</head>
<body>
    <div class="settings-container">
        <br>
        <a id="backToNotesLink" href="index.php?workspace=<?php echo urlencode(getWorkspaceFilter()); ?>" class="btn btn-secondary">
            Back to Notes
        </a>
        <br><br>

        <div class="settings-grid">
            <!-- Moved from settings.php: user preferences -->
            <div class="settings-card" onclick="showLoginDisplayNamePrompt();">
                <div class="settings-card-icon">
                    <i class="fa-user"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Login Display Name</h3>
                </div>
            </div>

            <div class="settings-card" onclick="showNoteFontSizePrompt();">
                <div class="settings-card-icon">
                    <i class="fa-text-height"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Note Content Font Size</h3>
                </div>
            </div>

            <div class="settings-card" id="emoji-icons-card">
                <div class="settings-card-icon"><i class="fa-grin"></i></div>
                <div class="settings-card-content">
                    <h3>Show Emoji Icons <span id="emoji-icons-status" class="setting-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-created-card">
                <div class="settings-card-icon"><i class="fa-calendar-alt"></i></div>
                <div class="settings-card-content">
                    <h3>Show Note Creation Date <span id="show-created-status" class="setting-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-subheading-card">
                <div class="settings-card-icon"><i class="fa-map-marker-alt"></i></div>
                <div class="settings-card-content">
                    <h3>Show Note Subheading <span id="show-subheading-status" class="setting-status disabled">disabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-counts-card">
                <div class="settings-card-icon"><i class="fa-hashtag"></i></div>
                <div class="settings-card-content">
                    <h3>Hide Folders Notes Counts <span id="folder-counts-status" class="setting-status enabled">enabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-actions-card">
                <div class="settings-card-icon"><i class="fa-folder-open"></i></div>
                <div class="settings-card-content">
                    <h3>Hide Folder Actions <span id="folder-actions-status" class="setting-status enabled">enabled</span></h3>
                </div>
            </div>
        </div>
    </div>

    <?php include 'modals.php'; ?>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script src="js/copy-code-on-focus.js"></script>
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
                if(statusEmoji){ statusEmoji.textContent = enabled ? 'enabled' : 'disabled'; statusEmoji.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); }
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
        function refreshCreated(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_created'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{var enabled = j && j.success && (j.value==='1' || j.value==='true'); if(statusCreated){ statusCreated.textContent = enabled ? 'enabled' : 'disabled'; statusCreated.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); }}).catch(()=>{}); }
        if(cardCreated){ cardCreated.addEventListener('click', function(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_created'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ var currently = j && j.success && (j.value === '1' || j.value === 'true'); var toSet = currently ? '0' : '1'; var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','show_note_created'); setForm.append('value', toSet); return fetch('api_settings.php',{method:'POST',body:setForm}); }).then(function(){ refreshCreated(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e)); }); }
        refreshCreated();

        // Subheading
        var cardSub = document.getElementById('show-subheading-card');
        var statusSub = document.getElementById('show-subheading-status');
        function refreshSub(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_subheading'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{var enabled = j && j.success && (j.value==='1' || j.value==='true'); if(statusSub){ statusSub.textContent = enabled ? 'enabled' : 'disabled'; statusSub.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); }}).catch(()=>{}); }
        if(cardSub){ cardSub.addEventListener('click', function(){ var form = new FormData(); form.append('action','get'); form.append('key','show_note_subheading'); fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ var currently = j && j.success && (j.value === '1' || j.value === 'true'); var toSet = currently ? '0' : '1'; var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','show_note_subheading'); setForm.append('value', toSet); return fetch('api_settings.php',{method:'POST',body:setForm}); }).then(function(){ refreshSub(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e)); }); }
        refreshSub();

        // Folder counts (database)
        var cardFolder = document.getElementById('folder-counts-card');
        var statusFolder = document.getElementById('folder-counts-status');
        function refreshFolder(){
            var form = new FormData(); form.append('action','get'); form.append('key','hide_folder_counts');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true' || j.value===null);
                if(statusFolder){ statusFolder.textContent = enabled ? 'enabled' : 'disabled'; statusFolder.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); }
            }).catch(()=>{});
        }
        if(cardFolder){ cardFolder.addEventListener('click', function(){
            var form = new FormData(); form.append('action','get'); form.append('key','hide_folder_counts');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var currently = j && j.success && (j.value === '1' || j.value === 'true' || j.value === null);
                var toSet = currently ? '0' : '1';
                var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','hide_folder_counts'); setForm.append('value', toSet);
                return fetch('api_settings.php',{method:'POST',body:setForm});
            }).then(function(){ refreshFolder(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e));
        }); }
        refreshFolder();

        // Folder actions (database)
        var cardFolderActions = document.getElementById('folder-actions-card');
        var statusFolderActions = document.getElementById('folder-actions-status');
        function refreshFolderActions(){
            var form = new FormData(); form.append('action','get'); form.append('key','hide_folder_actions');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true' || j.value===null);
                if(statusFolderActions){ statusFolderActions.textContent = enabled ? 'enabled' : 'disabled'; statusFolderActions.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); }
                if(enabled) document.body.classList.remove('folder-actions-always-visible'); else document.body.classList.add('folder-actions-always-visible');
            }).catch(()=>{});
        }
        if(cardFolderActions){ cardFolderActions.addEventListener('click', function(){
            var form = new FormData(); form.append('action','get'); form.append('key','hide_folder_actions');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var currently = j && j.success && (j.value === '1' || j.value === 'true' || j.value === null);
                var toSet = currently ? '0' : '1';
                var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','hide_folder_actions'); setForm.append('value', toSet);
                return fetch('api_settings.php',{method:'POST',body:setForm});
            }).then(function(){ refreshFolderActions(); if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }).catch(e=>console.error(e));
        }); }
        refreshFolderActions();
    })();
    </script>
</body>
</html>
