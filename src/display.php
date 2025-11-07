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
    <title>Display - Poznote</title>
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';if(t==='dark'){document.documentElement.classList.add('theme-dark');}else{document.documentElement.classList.add('theme-light');}}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/all.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/display.css">
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
            Back to Notes
        </a>
        <br><br>

        <div class="settings-grid">
            <!-- Theme Mode -->
            <div class="settings-card" id="theme-mode-card" onclick="toggleTheme();">
                <div class="settings-card-icon">
                    <i class="fa fa-sun"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Theme Mode <span id="theme-mode-badge" class="setting-status">light mode</span></h3>
                </div>
            </div>

            <!-- Moved from settings.php: user preferences -->
            <div class="settings-card" onclick="showLoginDisplayNamePrompt();">
                <div class="settings-card-icon">
                    <i class="fa-user"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Login Display <span id="login-display-badge" class="setting-status">loading...</span></h3>
                </div>
            </div>

            <div class="settings-card" onclick="showNoteFontSizePrompt();">
                <div class="settings-card-icon">
                    <i class="fa-text-height"></i>
                </div>
                <div class="settings-card-content">
                    <h3>Note Content Font Size <span id="font-size-badge" class="setting-status">loading...</span></h3>
                </div>
            </div>

            <div class="settings-card" id="note-sort-card" onclick="openNoteSortModal();">
                <div class="settings-card-icon"><i class="fa-list-ol"></i></div>
                <div class="settings-card-content">
                    <h3>Note sort order <span id="note-sort-badge" class="setting-status">loading...</span></h3>
                </div>
            </div>

            <div class="settings-card" onclick="showTimezonePrompt();">
                <div class="settings-card-icon"><i class="fal fa-clock"></i></div>
                <div class="settings-card-content">
                    <h3>Timezone <span id="timezone-badge" class="setting-status">loading...</span></h3>
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
                    <h3>Show Folders Notes Counts <span id="folder-counts-status" class="setting-status enabled">enabled</span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-actions-card">
                <div class="settings-card-icon"><i class="fa-folder-open"></i></div>
                <div class="settings-card-content">
                    <h3>Show Folder Actions <span id="folder-actions-status" class="setting-status enabled">enabled</span></h3>
                </div>
            </div>

        </div>
    </div>

    <?php include 'modals.php'; ?>
    <script src="js/modal-alerts.js"></script>
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script src="js/copy-code-on-focus.js"></script>
    <script>
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
    </script>
    
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
                if(enabled) document.body.classList.add('folder-actions-always-visible'); else document.body.classList.remove('folder-actions-always-visible');
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
    <script>
    // Modal-based note sort handlers
    function openNoteSortModal() {
        var modal = document.getElementById('noteSortModal');
        if (!modal) return;
        // Load current preference
        var form = new FormData(); form.append('action','get'); form.append('key','note_list_sort');
        fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
            var v = j && j.success ? j.value : 'updated_desc';
            var radios = document.getElementsByName('noteSort');
            for (var i = 0; i < radios.length; i++) {
                try { radios[i].checked = (radios[i].value === v); } catch(e) {}
            }
            modal.style.display = 'flex';
        }).catch(function(){ modal.style.display = 'flex'; });
    }

    document.addEventListener('DOMContentLoaded', function(){
        var saveBtn = document.getElementById('saveNoteSortModalBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function(){
                var radios = document.getElementsByName('noteSort');
                var selected = null;
                for (var i = 0; i < radios.length; i++) { if (radios[i].checked) { selected = radios[i].value; break; } }
                if (!selected) selected = 'updated_desc';
                var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','note_list_sort'); setForm.append('value', selected);
                fetch('api_settings.php',{method:'POST',body:setForm}).then(r=>r.json()).then(function(){ 
                    try{ closeModal('noteSortModal'); }catch(e){}; 
                    try{ if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }catch(e){}; // reload main if open
                    
                    // Refresh the note sort badge
                    if (typeof window.refreshNoteSortBadge === 'function') {
                        window.refreshNoteSortBadge();
                    }
                }).catch(function(){ alert('Error saving preference'); });
            });
        }
    });
    </script>
    <script>
    // Note sort preference
    (function(){
        var select = document.getElementById('noteSortSelect');
        var btn = document.getElementById('saveNoteSortBtn');
        var status = document.getElementById('note-sort-status');

        function refreshSort(){
            var form = new FormData(); form.append('action','get'); form.append('key','note_list_sort');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var v = j && j.success ? j.value : '';
                if(v && select){ try{ select.value = v; }catch(e){} }
                if(status) status.textContent = '';
            }).catch(()=>{});
        }

        if(btn){ btn.addEventListener('click', function(){
            var toSet = select ? select.value : 'updated_desc';
            var setForm = new FormData(); setForm.append('action','set'); setForm.append('key','note_list_sort'); setForm.append('value', toSet);
            fetch('api_settings.php',{method:'POST',body:setForm}).then(r=>r.json()).then(function(){ if(status) status.textContent = 'saved'; try{ if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); }catch(e){} }).catch(function(){ if(status) status.textContent = 'error'; });
        }); }

        refreshSort();
    })();
    </script>
    <script>
    // Load and display current values in badges
    (function(){
        // Function to get setting value from API
        function getSetting(key, callback) {
            var form = new FormData();
            form.append('action', 'get');
            form.append('key', key);
            fetch('api_settings.php', {method: 'POST', body: form})
                .then(r => r.json())
                .then(j => {
                    if (j && j.success) {
                        callback(j.value);
                    } else {
                        callback(null);
                    }
                })
                .catch(() => callback(null));
        }

        // Load Login Display Name
        function refreshLoginDisplayBadge() {
            getSetting('login_display_name', function(value) {
                var badge = document.getElementById('login-display-badge');
                if (badge) {
                    if (value && value.trim()) {
                        badge.textContent = value.trim();
                        badge.className = 'setting-status enabled';
                    } else {
                        badge.textContent = 'non défini';
                        badge.className = 'setting-status disabled';
                    }
                }
            });
        }

        // Load Font Size
        function refreshFontSizeBadge() {
            getSetting('note_font_size', function(value) {
                var badge = document.getElementById('font-size-badge');
                if (badge) {
                    if (value && value.trim()) {
                        badge.textContent = value + 'px';
                        badge.className = 'setting-status enabled';
                    } else {
                        badge.textContent = 'default (15px)';
                        badge.className = 'setting-status disabled';
                    }
                }
            });
        }

        // Load Note Sort Order
        function refreshNoteSortBadge() {
            getSetting('note_list_sort', function(value) {
                var badge = document.getElementById('note-sort-badge');
                if (badge) {
                    var sortValue = value || 'updated_desc';
                    var sortLabel = 'Last modified'; // default
                    
                    switch(sortValue) {
                        case 'updated_desc':
                            sortLabel = 'Last modified';
                            break;
                        case 'created_desc':
                            sortLabel = 'Last created';
                            break;
                        case 'heading_asc':
                            sortLabel = 'Alphabetical';
                            break;
                        default:
                            sortLabel = 'Last modified'; // fallback to Last modified instead of raw value
                            break;
                    }
                    
                    badge.textContent = sortLabel;
                    badge.className = 'setting-status enabled';
                }
            });
        }

        // Load Timezone
        function refreshTimezoneBadge() {
            getSetting('timezone', function(value) {
                var badge = document.getElementById('timezone-badge');
                if (badge) {
                    if (value && value.trim()) {
                        badge.textContent = value.trim();
                        badge.className = 'setting-status enabled';
                    } else {
                        badge.textContent = 'Europe/Paris';
                        badge.className = 'setting-status disabled';
                    }
                }
            });
        }

        // Load all badges on page load
        refreshLoginDisplayBadge();
        refreshFontSizeBadge();
        refreshNoteSortBadge();
        refreshTimezoneBadge();
        
        // Make refresh functions available globally
        window.refreshLoginDisplayBadge = refreshLoginDisplayBadge;
        window.refreshFontSizeBadge = refreshFontSizeBadge;
        window.refreshNoteSortBadge = refreshNoteSortBadge;
        window.refreshTimezoneBadge = refreshTimezoneBadge;
    })();
    </script>
    <script>
    // Timezone setting modal
    function showTimezonePrompt() {
        var modal = document.getElementById('timezoneModal');
        if (!modal) return;
        
        // Load current timezone preference
        var form = new FormData();
        form.append('action', 'get');
        form.append('key', 'timezone');
        
        fetch('api_settings.php', {method: 'POST', body: form})
            .then(r => r.json())
            .then(j => {
                var currentValue = (j && j.success && j.value) ? j.value : 'Europe/Paris';
                var select = document.getElementById('timezoneSelect');
                if (select) {
                    select.value = currentValue;
                }
                modal.style.display = 'flex';
            })
            .catch(function() {
                modal.style.display = 'flex';
            });
    }

    document.addEventListener('DOMContentLoaded', function(){
        var saveBtn = document.getElementById('saveTimezoneModalBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function(){
                var select = document.getElementById('timezoneSelect');
                var selectedTimezone = select ? select.value : 'Europe/Paris';
                
                var setForm = new FormData();
                setForm.append('action', 'set');
                setForm.append('key', 'timezone');
                setForm.append('value', selectedTimezone);
                
                fetch('api_settings.php', {method: 'POST', body: setForm})
                    .then(r => r.json())
                    .then(function(result) {
                        if (result && result.success) {
                            try { closeModal('timezoneModal'); } catch(e) {}
                            if (typeof window.refreshTimezoneBadge === 'function') {
                                window.refreshTimezoneBadge();
                            }
                            // Reload main window if open
                            try {
                                if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) {
                                    window.opener.location.reload();
                                }
                            } catch(e) {}
                            alert('Timezone updated successfully. Changes will take effect immediately.');
                        } else {
                            alert('Error updating timezone');
                        }
                    })
                    .catch(function() {
                        alert('Error updating timezone');
                    });
            });
        }
    });
    </script>
</body>
</html>
