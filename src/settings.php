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
    <script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';if(t==='dark'){document.documentElement.classList.add('theme-dark');}else{document.documentElement.classList.add('theme-light');}}catch(e){}})();</script>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/all.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/settings.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
</head>
<body>
    <div class="settings-container">
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>

        <div class="settings-two-columns">
            <!-- Left Column: Actions (without badges) -->
            <div class="settings-column settings-column-left">
                <!-- Back to Notes -->
                <div class="settings-card" id="backToNotesLink" onclick="window.location = '<?php echo $back_href; ?>';" style="cursor: pointer;">
                    <div class="settings-card-icon">
                        <i class="fa-arrow-left"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('common.back_to_notes'); ?></h3>
                    </div>
                </div>

                <!-- Workspaces -->
                <div class="settings-card" onclick="window.location = 'workspaces.php';">
                    <div class="settings-card-icon">
                        <i class="fa-layer-group"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.workspaces'); ?></h3>
                    </div>
                </div>

                <!-- Backup / Export -->
                <div class="settings-card" onclick="window.location = 'backup_export.php';">
                    <div class="settings-card-icon">
                        <i class="fa-upload"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.backup_export'); ?></h3>
                    </div>
                </div>

                <!-- Restore / Import -->
                <div class="settings-card" onclick="window.location = 'restore_import.php';">
                    <div class="settings-card-icon">
                        <i class="fa-download"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.restore_import'); ?></h3>
                    </div>
                </div>

                <!-- Check for Updates -->
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
                        <i class="fa-heart heart-blink"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.support'); ?></h3>
                    </div>
                </div>
            </div>

            <!-- Right Column: Settings with badges -->
            <div class="settings-column settings-column-right">
                <!-- Login Display -->
                <div class="settings-card" onclick="showLoginDisplayNamePrompt();">
                    <div class="settings-card-icon">
                        <i class="fa-user"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.login_display'); ?> <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Language -->
                <div class="settings-card" id="language-card" onclick="showLanguageModal();">
                    <div class="settings-card-icon">
                        <i class="fal fa-flag"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.language.label'); ?> <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Theme Mode -->
                <div class="settings-card" id="theme-mode-card" onclick="toggleTheme();">
                    <div class="settings-card-icon">
                        <i class="fa fa-sun"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.theme_mode'); ?> <span id="theme-mode-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Font Size -->
                <div class="settings-card" onclick="showNoteFontSizePrompt();">
                    <div class="settings-card-icon">
                        <i class="fa-text-height"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_font_size'); ?> <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Timezone -->
                <div class="settings-card" onclick="showTimezonePrompt();">
                    <div class="settings-card-icon"><i class="fal fa-clock"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.timezone'); ?> <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Note Sort Order -->
                <div class="settings-card" id="note-sort-card" onclick="openNoteSortModal();">
                    <div class="settings-card-icon"><i class="fa-sort-amount-down"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_sort_order'); ?> <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Note Created -->
                <div class="settings-card" id="show-created-card">
                    <div class="settings-card-icon"><i class="fa-calendar-alt"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_note_created'); ?> <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Note Subheading -->
                <div class="settings-card" id="show-subheading-card">
                    <div class="settings-card-icon"><i class="fa-map-marker-alt"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_note_subheading'); ?> <span id="show-subheading-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Folder Counts -->
                <div class="settings-card" id="folder-counts-card">
                    <div class="settings-card-icon"><i class="fa-hashtag"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_folder_counts'); ?> <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Notes Without Folders Position -->
                <div class="settings-card" id="notes-without-folders-card">
                    <div class="settings-card-icon"><i class="fa-folder-tree"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.notes_without_folders_after'); ?> <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>
            </div>
        </div>

        <!-- Version Display -->
        <div style="text-align: center; padding: 20px; margin-top: 30px; border-top: 1px solid var(--border-color); color: var(--text-secondary);">
            <small>Poznote <?php echo htmlspecialchars(trim(file_get_contents('version.txt')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></small><br>
            <small><a href="https://poznote.com/releases.html" target="_blank" style="color: var(--link-color); text-decoration: underline; opacity: 1;"><?php echo t_h('settings.cards.release_notes'); ?></a></small>
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
    // Toggle logic for settings
    (function(){
        var TXT_ENABLED = <?php echo json_encode(t('common.enabled')); ?>;
        var TXT_DISABLED = <?php echo json_encode(t('common.disabled')); ?>;
        
        // Show created
        var cardCreated = document.getElementById('show-created-card');
        var statusCreated = document.getElementById('show-created-status');
        function refreshCreated(){ 
            var form = new FormData(); 
            form.append('action','get'); 
            form.append('key','show_note_created'); 
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true'); 
                if(statusCreated){ 
                    statusCreated.textContent = enabled ? TXT_ENABLED : TXT_DISABLED; 
                    statusCreated.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); 
                }
            }).catch(()=>{}); 
        }
        if(cardCreated){ 
            cardCreated.addEventListener('click', function(){ 
                var form = new FormData(); 
                form.append('action','get'); 
                form.append('key','show_note_created'); 
                fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ 
                    var currently = j && j.success && (j.value === '1' || j.value === 'true'); 
                    var toSet = currently ? '0' : '1'; 
                    var setForm = new FormData(); 
                    setForm.append('action','set'); 
                    setForm.append('key','show_note_created'); 
                    setForm.append('value', toSet); 
                    return fetch('api_settings.php',{method:'POST',body:setForm}); 
                }).then(function(){ 
                    refreshCreated(); 
                    if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); 
                }).catch(e=>console.error(e)); 
            }); 
        }
        refreshCreated();

        // Subheading
        var cardSub = document.getElementById('show-subheading-card');
        var statusSub = document.getElementById('show-subheading-status');
        function refreshSub(){ 
            var form = new FormData(); 
            form.append('action','get'); 
            form.append('key','show_note_subheading'); 
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true'); 
                if(statusSub){ 
                    statusSub.textContent = enabled ? TXT_ENABLED : TXT_DISABLED; 
                    statusSub.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); 
                }
            }).catch(()=>{}); 
        }
        if(cardSub){ 
            cardSub.addEventListener('click', function(){ 
                var form = new FormData(); 
                form.append('action','get'); 
                form.append('key','show_note_subheading'); 
                fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{ 
                    var currently = j && j.success && (j.value === '1' || j.value === 'true'); 
                    var toSet = currently ? '0' : '1'; 
                    var setForm = new FormData(); 
                    setForm.append('action','set'); 
                    setForm.append('key','show_note_subheading'); 
                    setForm.append('value', toSet); 
                    return fetch('api_settings.php',{method:'POST',body:setForm}); 
                }).then(function(){ 
                    refreshSub(); 
                    if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); 
                }).catch(e=>console.error(e)); 
            }); 
        }
        refreshSub();

        // Folder counts
        var cardFolder = document.getElementById('folder-counts-card');
        var statusFolder = document.getElementById('folder-counts-status');
        function refreshFolder(){
            var form = new FormData(); 
            form.append('action','get'); 
            form.append('key','hide_folder_counts');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true' || j.value===null);
                if(statusFolder){ 
                    statusFolder.textContent = enabled ? TXT_ENABLED : TXT_DISABLED; 
                    statusFolder.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); 
                }
            }).catch(()=>{});
        }
        if(cardFolder){ 
            cardFolder.addEventListener('click', function(){
                var form = new FormData(); 
                form.append('action','get'); 
                form.append('key','hide_folder_counts');
                fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                    var currently = j && j.success && (j.value === '1' || j.value === 'true' || j.value === null);
                    var toSet = currently ? '0' : '1';
                    var setForm = new FormData(); 
                    setForm.append('action','set'); 
                    setForm.append('key','hide_folder_counts'); 
                    setForm.append('value', toSet);
                    return fetch('api_settings.php',{method:'POST',body:setForm});
                }).then(function(){ 
                    refreshFolder(); 
                    if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); 
                }).catch(e=>console.error(e));
            }); 
        }
        refreshFolder();

        // Notes without folders position
        var cardNotesPos = document.getElementById('notes-without-folders-card');
        var statusNotesPos = document.getElementById('notes-without-folders-status');
        function refreshNotesPos(){
            var form = new FormData(); 
            form.append('action','get'); 
            form.append('key','notes_without_folders_after_folders');
            fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                var enabled = j && j.success && (j.value==='1' || j.value==='true');
                if(statusNotesPos){ 
                    statusNotesPos.textContent = enabled ? TXT_ENABLED : TXT_DISABLED; 
                    statusNotesPos.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled'); 
                }
            }).catch(()=>{});
        }
        if(cardNotesPos){ 
            cardNotesPos.addEventListener('click', function(){
                var form = new FormData(); 
                form.append('action','get'); 
                form.append('key','notes_without_folders_after_folders');
                fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
                    var currently = j && j.success && (j.value === '1' || j.value === 'true');
                    var toSet = currently ? '0' : '1';
                    var setForm = new FormData(); 
                    setForm.append('action','set'); 
                    setForm.append('key','notes_without_folders_after_folders'); 
                    setForm.append('value', toSet);
                    return fetch('api_settings.php',{method:'POST',body:setForm});
                }).then(function(){ 
                    refreshNotesPos(); 
                    if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) window.opener.location.reload(); 
                }).catch(e=>console.error(e));
            }); 
        }
        refreshNotesPos();
    })();
    </script>

    <script>
    // Language modal handler
    function showLanguageModal() {
        var modal = document.getElementById('languageModal');
        if (!modal) return;
        var form = new FormData(); 
        form.append('action','get'); 
        form.append('key','language');
        fetch('api_settings.php',{method:'POST',body:form}).then(r=>r.json()).then(j=>{
            var v = j && j.success ? j.value : 'en';
            var radios = document.getElementsByName('languageChoice');
            for (var i = 0; i < radios.length; i++) {
                try { radios[i].checked = (radios[i].value === v); } catch(e) {}
            }
            modal.style.display = 'flex';
        }).catch(function(){ modal.style.display = 'flex'; });
    }

    // Modal-based note sort handlers
    function openNoteSortModal() {
        var modal = document.getElementById('noteSortModal');
        if (!modal) return;
        var form = new FormData(); 
        form.append('action','get'); 
        form.append('key','note_list_sort');
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
                for (var i = 0; i < radios.length; i++) { 
                    if (radios[i].checked) { 
                        selected = radios[i].value; 
                        break; 
                    } 
                }
                if (!selected) selected = 'updated_desc';
                var setForm = new FormData(); 
                setForm.append('action','set'); 
                setForm.append('key','note_list_sort'); 
                setForm.append('value', selected);
                fetch('api_settings.php',{method:'POST',body:setForm}).then(r=>r.json()).then(function(){ 
                    try{ closeModal('noteSortModal'); }catch(e){}; 
                    try{ 
                        if(window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) 
                            window.opener.location.reload(); 
                    }catch(e){}; 
                    
                    if (typeof window.refreshNoteSortBadge === 'function') {
                        window.refreshNoteSortBadge();
                    }
                }).catch(function(){ 
                    alert(window.t ? window.t('display.alerts.error_saving_preference', {}, 'Error saving preference') : 'Error saving preference'); 
                });
            });
        }

        // Language modal handler
        var saveLangBtn = document.getElementById('saveLanguageModalBtn');
        if (saveLangBtn) {
            saveLangBtn.addEventListener('click', function(){
                var radios = document.getElementsByName('languageChoice');
                var selected = null;
                for (var i = 0; i < radios.length; i++) { 
                    if (radios[i].checked) { 
                        selected = radios[i].value; 
                        break; 
                    } 
                }
                if (!selected) selected = 'en';
                var setForm = new FormData(); 
                setForm.append('action','set'); 
                setForm.append('key','language'); 
                setForm.append('value', selected);
                fetch('api_settings.php',{method:'POST',body:setForm}).then(r=>r.json()).then(function(result){ 
                    if (result && result.success) {
                        try{ closeModal('languageModal'); }catch(e){};
                        if (typeof window.refreshLanguageBadge === 'function') {
                            window.refreshLanguageBadge();
                        }
                        setTimeout(function() { window.location.reload(); }, 300);
                    } else {
                        alert(window.t ? window.t('settings.language.save_error', {}, 'Error saving language') : 'Error saving language');
                    }
                }).catch(function(){ 
                    alert(window.t ? window.t('settings.language.save_error', {}, 'Error saving language') : 'Error saving language'); 
                });
            });
        }
    });
    </script>

    <script>
    // Timezone setting modal
    function showTimezonePrompt() {
        var modal = document.getElementById('timezoneModal');
        if (!modal) return;
        
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
                            try {
                                if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) {
                                    window.opener.location.reload();
                                }
                            } catch(e) {}
                        } else {
                            alert(window.t ? window.t('display.timezone.alerts.update_error', {}, 'Error updating timezone') : 'Error updating timezone');
                        }
                    })
                    .catch(function() {
                        alert(window.t ? window.t('display.timezone.alerts.update_error', {}, 'Error updating timezone') : 'Error updating timezone');
                    });
            });
        }
    });
    </script>

    <script>
    // Load and display current values in badges
    (function(){
        var TXT_NOT_DEFINED = <?php echo json_encode(t('common.not_defined')); ?>;

        function tr(key, vars, fallback) {
            try {
                if (typeof window.t === 'function') return window.t(key, vars || {}, fallback);
            } catch (e) {}
            return (fallback != null ? String(fallback) : String(key));
        }

        function getLanguageLabel(code) {
            switch (code) {
                case 'fr': return tr('settings.language.french', {}, 'French');
                case 'es': return tr('settings.language.spanish', {}, 'Spanish');
                case 'pt': return tr('settings.language.portuguese', {}, 'Portuguese');
                case 'de': return tr('settings.language.german', {}, 'German');
                case 'en':
                default: return tr('settings.language.english', {}, 'English');
            }
        }

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

        function refreshLoginDisplayBadge() {
            getSetting('login_display_name', function(value) {
                var badge = document.getElementById('login-display-badge');
                if (badge) {
                    if (value && value.trim()) {
                        badge.textContent = value.trim();
                        badge.className = 'setting-status enabled';
                    } else {
                        badge.textContent = TXT_NOT_DEFINED;
                        badge.className = 'setting-status disabled';
                    }
                }
            });
        }

        function refreshFontSizeBadge() {
            getSetting('note_font_size', function(value) {
                var badge = document.getElementById('font-size-badge');
                if (badge) {
                    if (value && value.trim()) {
                        badge.textContent = value + 'px';
                        badge.className = 'setting-status enabled';
                    } else {
                        badge.textContent = tr('display.badges.font_size_default', { size: 15 }, 'default (15px)');
                        badge.className = 'setting-status disabled';
                    }
                }
            });
        }

        function refreshLanguageBadge() {
            getSetting('language', function(value) {
                var badge = document.getElementById('language-badge');
                if (badge) {
                    var langValue = value || 'en';
                    badge.textContent = getLanguageLabel(langValue);
                    badge.className = 'setting-status enabled';
                }
            });
        }

        function refreshNoteSortBadge() {
            getSetting('note_list_sort', function(value) {
                var badge = document.getElementById('note-sort-badge');
                if (badge) {
                    var sortValue = value || 'updated_desc';
                    var sortLabel = tr('modals.note_sort.options.last_modified', {}, 'Last modified');
                    
                    switch(sortValue) {
                        case 'updated_desc':
                            sortLabel = tr('modals.note_sort.options.last_modified', {}, 'Last modified');
                            break;
                        case 'created_desc':
                            sortLabel = tr('modals.note_sort.options.last_created', {}, 'Last created');
                            break;
                        case 'heading_asc':
                            sortLabel = tr('modals.note_sort.options.alphabetical', {}, 'Alphabetical');
                            break;
                        default:
                            sortLabel = tr('modals.note_sort.options.last_modified', {}, 'Last modified');
                            break;
                    }
                    
                    badge.textContent = sortLabel;
                    badge.className = 'setting-status enabled';
                }
            });
        }

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
        refreshLanguageBadge();
        refreshLoginDisplayBadge();
        refreshFontSizeBadge();
        refreshNoteSortBadge();
        refreshTimezoneBadge();

        // Re-translate dynamic badges once client-side i18n is loaded
        document.addEventListener('poznote:i18n:loaded', function(){
            try { refreshLanguageBadge(); } catch(e) {}
            try { refreshFontSizeBadge(); } catch(e) {}
            try { refreshNoteSortBadge(); } catch(e) {}
        });
        
        // Make refresh functions available globally
        window.refreshLanguageBadge = refreshLanguageBadge;
        window.refreshLoginDisplayBadge = refreshLoginDisplayBadge;
        window.refreshFontSizeBadge = refreshFontSizeBadge;
        window.refreshNoteSortBadge = refreshNoteSortBadge;
        window.refreshTimezoneBadge = refreshTimezoneBadge;
    })();
    </script>
    
    <script>
    // Set workspace context for JavaScript functions
    window.selectedWorkspace = <?php echo json_encode(getWorkspaceFilter()); ?>;
    </script>
</body>
</html>
