// JavaScript for settings.php page
// Requires: theme-manager.js, ui.js, font-size-settings.js, modal-alerts.js

(function () {
    'use strict';

    // ========== Utilities ==========

    // Get translations from data attributes on body
    function getTranslations() {
        var body = document.body;
        return {
            enabled: body.getAttribute('data-txt-enabled') || 'Enabled',
            disabled: body.getAttribute('data-txt-disabled') || 'Disabled',
            saved: body.getAttribute('data-txt-saved') || 'Saved',
            error: body.getAttribute('data-txt-error') || 'Error',
            notDefined: body.getAttribute('data-txt-not-defined') || 'Not defined'
        };
    }

    // Use global translation function from globals.js
    const tr = window.t || function (key, vars, fallback) {
        return fallback || key;
    };

    // Get language label from code
    function getLanguageLabel(code) {
        switch (code) {
            case 'zh-cn': return tr('settings.language.chinese_simplified', {}, 'Chinese (Simplified)');
            case 'en': return tr('settings.language.english', {}, 'English');
            case 'fr': return tr('settings.language.french', {}, 'French');
            case 'de': return tr('settings.language.german', {}, 'German');
            case 'pt': return tr('settings.language.portuguese', {}, 'Portuguese');
            case 'ru': return tr('settings.language.russian', {}, 'Russian');
            case 'es': return tr('settings.language.spanish', {}, 'Spanish');
            default: return tr('settings.language.english', {}, 'English');
        }
    }

    // ========== API Helpers ==========

    // Generic function to get setting value from API
    function getSetting(key, callback) {
        fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (j && j.success) {
                    callback(j.value);
                } else {
                    callback(null);
                }
            })
            .catch(function () { callback(null); });
    }

    // Generic function to set setting value via API
    function setSetting(key, value, callback) {
        fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: value })
        })
            .then(function (r) { return r.json(); })
            .then(function (result) {
                if (callback) callback(result && result.success, result);
            })
            .catch(function () {
                if (callback) callback(false, null);
            });
    }

    function isValidCustomCssPath(path) {
        var normalizedPath = (path || '').trim();
        if (normalizedPath === '') {
            return true;
        }

        if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedPath) || normalizedPath.indexOf('\\') !== -1) {
            return false;
        }

        if (normalizedPath.indexOf('..') !== -1 || normalizedPath.indexOf('/') !== -1) {
            return false;
        }

        return /^[A-Za-z0-9._-]+\.css$/.test(normalizedPath);
    }

    // Reload opener window if it's index.php
    function reloadOpener() {
        try {
            if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) {
                window.opener.location.reload();
            }
        } catch (e) {
            // Safely ignore cross-origin errors
        }
    }

    function reloadCurrentSettingsPage() {
        try {
            if (window.location && window.location.pathname && window.location.pathname.includes('settings.php')) {
                window.location.reload();
            }
        } catch (e) {
            // Safely ignore reload issues
        }
    }

    // ========== Toggle Cards ==========

    // Helper function to determine if a setting is enabled
    function isSettingEnabled(value, invertLogic, defaultValue) {
        if ((value === null || value === '') && defaultValue !== undefined) {
            return defaultValue;
        }
        var enabled = value === '1' || value === 'true';
        if (invertLogic && value === null) {
            // Default for hide_* settings: null means show (enabled)
            enabled = true;
        }
        return enabled;
    }

    // Setup a toggle card that toggles a boolean setting
    function setupToggleCard(cardId, statusId, settingKey, invertLogic, defaultValue) {
        var txt = getTranslations();
        var card = document.getElementById(cardId);
        var status = document.getElementById(statusId);

        function refresh() {
            getSetting(settingKey, function (value) {
                var enabled = isSettingEnabled(value, invertLogic, defaultValue);

                if (status) {
                    status.textContent = enabled ? txt.enabled : txt.disabled;
                    status.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled');
                }

                // Special handling for folder actions visibility
                if (cardId === 'folder-actions-card') {
                    document.body.classList.toggle('folder-actions-always-visible', enabled);
                }
            });
        }

        if (card) {
            card.addEventListener('click', function () {
                getSetting(settingKey, function (currentValue) {
                    var currently = isSettingEnabled(currentValue, invertLogic, defaultValue);
                    var toSet = currently ? '0' : '1';
                    setSetting(settingKey, toSet, function () {
                        refresh();

                        // Special handling for code wrap setting - apply immediately to opener window
                        if (settingKey === 'code_block_word_wrap') {
                            try {
                                if (window.opener && window.opener.document && window.opener.document.body) {
                                    // toSet === '1' means wrap enabled, so no-wrap should be disabled
                                    // toSet === '0' means wrap disabled, so no-wrap should be enabled
                                    var shouldAddNoWrap = (toSet === '0');
                                    window.opener.document.body.classList.toggle('code-block-no-wrap', shouldAddNoWrap);
                                }
                            } catch (e) {
                                // Safely ignore cross-origin errors
                            }
                        }

                        reloadOpener();
                    });
                });
            });
        }

        refresh();
        return refresh;
    }

    // ========== Badge Refresh Functions ==========

    function refreshLoginDisplayBadge() {
        var txt = getTranslations();
        getSetting('login_display_name', function (value) {
            var badge = document.getElementById('login-display-badge');
            if (badge) {
                if (value && value.trim()) {
                    badge.textContent = value.trim();
                    badge.className = 'setting-status enabled';
                } else {
                    badge.textContent = txt.notDefined;
                    badge.className = 'setting-status disabled';
                }
            }
        });
    }

    function refreshFontSizeBadge() {
        var fontBadges = [
            { id: 'font-size-badge', key: 'note_font_size', default: '15', i18nKey: 'display.badges.note_font_size', fallback: '' },
            { id: 'sidebar-font-size-badge', key: 'sidebar_font_size', default: '13', i18nKey: 'display.badges.sidebar_font_size', fallback: '' },
            { id: 'code-block-font-size-badge', key: 'code_block_font_size', default: '15', i18nKey: 'display.badges.code_block_font_size', fallback: '' }
        ];

        fontBadges.forEach(function (config) {
            var badge = document.getElementById(config.id);
            if (badge) {
                var size = localStorage.getItem(config.key) || config.default;
                badge.textContent = tr(config.i18nKey, { size: size }, config.fallback + size + 'px');
                badge.className = 'setting-status enabled';
            }
        });
    }

    function refreshIndexIconScaleBadge() {
        var badge = document.getElementById('index-icon-scale-badge');
        if (badge) {
            var scale = localStorage.getItem('index_icon_scale') || '1.0';
            badge.textContent = parseFloat(scale).toFixed(1) + 'x';
            badge.className = 'setting-status enabled';
        }
    }

    function refreshNoteWidthBadge() {
        getSetting('center_note_content', function (value) {
            var badge = document.getElementById('note-width-badge');
            if (badge) {
                if (value === '0' || value === 'false' || value === '' || value === null) {
                    badge.textContent = tr('modals.note_width.full_width', {}, 'Full Width');
                    badge.className = 'setting-status enabled';
                } else {
                    var width = value;
                    if (width === '1' || width === 'true') width = '800';
                    badge.textContent = width + 'px';
                    badge.className = 'setting-status enabled';
                }
            }
        });
    }

    function refreshLanguageBadge() {
        getSetting('language', function (value) {
            var badge = document.getElementById('language-badge');
            if (badge) {
                var langValue = value || 'en';
                badge.textContent = getLanguageLabel(langValue);
                badge.className = 'setting-status enabled';
            }
        });
    }

    function refreshNoteSortBadge() {
        getSetting('note_list_sort', function (value) {
            var badge = document.getElementById('note-sort-badge');
            if (!badge) return;

            var sortValue = value || 'updated_desc';
            var sortLabel;

            switch (sortValue) {
                case 'created_desc':
                    sortLabel = tr('modals.note_sort.options.last_created', {}, 'Last created');
                    break;
                case 'heading_asc':
                    sortLabel = tr('modals.note_sort.options.alphabetical', {}, 'Alphabetical');
                    break;
                case 'updated_desc':
                default:
                    sortLabel = tr('modals.note_sort.options.last_modified', {}, 'Last modified');
                    break;
            }

            badge.textContent = sortLabel;
            badge.className = 'setting-status enabled';
        });
    }

    function refreshTasklistInsertOrderBadge() {
        getSetting('tasklist_insert_order', function (value) {
            var badge = document.getElementById('tasklist-insert-order-badge');
            if (!badge) return;

            var order = (value === 'top' || value === 'bottom') ? value : 'bottom';
            var isTop = order === 'top';

            badge.textContent = isTop
                ? tr('tasklist.insert_order_top', {}, 'Top')
                : tr('tasklist.insert_order_bottom', {}, 'Bottom');
            badge.className = 'setting-status enabled';

            var card = document.getElementById('tasklist-insert-order-card');
            if (card) {
                var icon = card.querySelector('.home-card-icon i');
                if (icon) {
                    icon.classList.toggle('lucide-arrow-up', isTop);
                    icon.classList.toggle('lucide-arrow-down', !isTop);
                }
            }
        });
    }

    function refreshToolbarModeBadge() {
        getSetting('toolbar_mode', function (value) {
            var badge = document.getElementById('toolbar-mode-badge');
            if (!badge) return;

            var modeValue = value || 'both';
            var modeLabel;

            switch (modeValue) {
                case 'full':
                    modeLabel = tr('display.badges.toolbar_mode.full', {}, 'Toolbar only');
                    break;
                case 'slash':
                    modeLabel = tr('display.badges.toolbar_mode.slash', {}, 'Slash command only');
                    break;
                case 'both':
                default:
                    modeLabel = tr('display.badges.toolbar_mode.both', {}, 'Toolbar icons + slash command menu');
                    break;
            }

            badge.textContent = modeLabel;
            badge.className = 'setting-status enabled';
        });
    }

    function refreshTimezoneBadge() {
        getSetting('timezone', function (value) {
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

    function refreshCustomCssBadge() {
        var badge = document.getElementById('custom-css-badge');
        if (!badge) return;

        var txt = getTranslations();
        getSetting('custom_css_path', function (value) {

            if (value && value.trim()) {
                badge.textContent = value.trim();
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = txt.notDefined;
                badge.className = 'setting-status disabled';
            }
        });
    }

    function refreshImportLimitsBadges() {
        var indBadge = document.getElementById('import-limits-individual-badge');
        var zipBadge = document.getElementById('import-limits-zip-badge');
        if (!indBadge && !zipBadge) return;

        getSetting('import_max_individual_files', function (indValue) {
            var indCount = (indValue && indValue.trim()) ? indValue.trim() : '50';
            if (indBadge) {
                indBadge.textContent = tr('modals.import_limits.individual_badge', { count: indCount }, 'Individual: ' + indCount);
                indBadge.className = 'setting-status enabled';
            }
        });

        getSetting('import_max_zip_files', function (zipValue) {
            var zipCount = (zipValue && zipValue.trim()) ? zipValue.trim() : '300';
            if (zipBadge) {
                zipBadge.textContent = tr('modals.import_limits.zip_badge', { count: zipCount }, 'ZIP: ' + zipCount);
                zipBadge.className = 'setting-status enabled';
            }
        });
    }

    function refreshGitSyncEnabledBadge() {
        var badge = document.getElementById('git-sync-enabled-status');
        if (!badge) return;

        var txt = getTranslations();
        getSetting('git_sync_enabled', function (value) {
            var enabled = value === '1' || value === 'true';
            badge.textContent = enabled ? txt.enabled : txt.disabled;
            badge.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled');
        });
    }

    function isStandaloneMode() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function refreshInstallAppBadge() {
        var badge = document.getElementById('install-app-status');
        if (!badge) return;

        if (isStandaloneMode()) {
            badge.textContent = tr('settings.install_app.status.installed', {}, 'Already installed');
            badge.className = 'setting-status enabled';
            return;
        }

        if (typeof window.poznoteCanInstallApp === 'function' && window.poznoteCanInstallApp()) {
            badge.textContent = tr('settings.install_app.status.available', {}, 'Available');
            badge.className = 'setting-status enabled';
            return;
        }

        badge.textContent = tr('settings.install_app.status.unavailable', {}, 'Unavailable');
        badge.className = 'setting-status disabled';
    }

    function showInstallAppLaunchNotice() {
        var installStartingMsg = tr('settings.install_app.launching', {}, 'The installation will start. Please wait...');
        var installStartingTitle = tr('common.please_wait', {}, 'Please wait');
        var installStartingAcknowledge = tr('settings.install_app.launching_acknowledge', {}, 'Understood');

        if (window.modalAlert && typeof window.modalAlert.showModal === 'function') {
            window.modalAlert.showModal({
                type: 'alert',
                message: installStartingMsg,
                alertType: 'info',
                title: installStartingTitle,
                buttons: [
                    { text: installStartingAcknowledge, type: 'primary', action: function () { } }
                ]
            });
            return;
        }

        alert(installStartingMsg);
    }

    async function handleInstallAppCardClick(event) {
        if (event) {
            event.preventDefault();
        }

        var title = tr('settings.cards.install_app', {}, 'Install application');

        if (isStandaloneMode()) {
            var alreadyInstalledMsg = tr('settings.install_app.already_installed', {}, 'The application is already installed on this device.');
            if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
                window.modalAlert.alert(alreadyInstalledMsg, 'info', title);
            } else {
                alert(alreadyInstalledMsg);
            }
            return;
        }

        if (typeof window.poznotePromptInstall === 'function') {
            var result = await window.poznotePromptInstall();
            if (result && result.supported) {
                if (result.outcome === 'accepted') {
                    showInstallAppLaunchNotice();
                }

                refreshInstallAppBadge();
                return;
            }
        }

        var fallbackInstallMsg = tr('settings.install_app.unavailable', {}, 'Installation is not available right now. On Chrome mobile, open the browser menu then tap "Install app" (or "Add to Home screen") when available.');
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(fallbackInstallMsg, 'info', title);
        } else {
            alert(fallbackInstallMsg);
        }
    }

    function showImportLimitsModal() {
        var modal = document.getElementById('importLimitsModal');
        var indInput = document.getElementById('importMaxIndividualFilesInput');
        var zipInput = document.getElementById('importMaxZipFilesInput');
        if (!modal || !indInput || !zipInput) return;

        getSetting('import_max_individual_files', function (indValue) {
            indInput.value = (indValue && indValue.trim()) ? indValue.trim() : '50';
            getSetting('import_max_zip_files', function (zipValue) {
                zipInput.value = (zipValue && zipValue.trim()) ? zipValue.trim() : '300';
                modal.style.display = 'flex';
            });
        });
    }

    // ========== Modal Functions ==========

    var pendingCssFile = null;
    var pendingCssRemove = false;

    function updateCustomCssModalState(filename) {
        var noFile = document.getElementById('customCssNoFile');
        var currentFile = document.getElementById('customCssCurrentFile');
        var fileNameEl = document.getElementById('customCssFileName');
        var removeBtn = document.getElementById('removeCustomCssBtn');
        if (filename) {
            if (noFile) noFile.style.display = 'none';
            if (currentFile) currentFile.style.display = 'flex';
            if (fileNameEl) fileNameEl.textContent = filename;
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            if (noFile) noFile.style.display = 'block';
            if (currentFile) currentFile.style.display = 'none';
            if (fileNameEl) fileNameEl.textContent = '';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    function showCustomCssModal() {
        var modal = document.getElementById('customCssModal');
        if (!modal) return;

        pendingCssFile = null;
        pendingCssRemove = false;

        fetch('api_upload_css.php', { method: 'GET', credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                updateCustomCssModalState(data.exists ? data.filename : null);
                modal.style.display = 'flex';
            })
            .catch(function () {
                updateCustomCssModalState(null);
                modal.style.display = 'flex';
            });
    }

    function showLanguageModal() {
        var modal = document.getElementById('languageModal');
        if (!modal) return;
        getSetting('language', function (value) {
            var v = value || 'en';
            var radios = document.getElementsByName('languageChoice');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === v);
            }
            modal.style.display = 'flex';
        });
    }

    function openNoteSortModal() {
        var modal = document.getElementById('noteSortModal');
        if (!modal) return;
        getSetting('note_list_sort', function (value) {
            var v = value || 'updated_desc';
            var radios = document.getElementsByName('noteSort');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === v);
            }
            modal.style.display = 'flex';
        });
    }

    function showTimezonePrompt() {
        var modal = document.getElementById('timezoneModal');
        if (!modal) return;
        getSetting('timezone', function (value) {
            var currentValue = value || 'Europe/Paris';
            var select = document.getElementById('timezoneSelect');
            if (select) {
                select.value = currentValue;
            }
            modal.style.display = 'flex';
        });
    }



    // ========== Initialization ==========

    document.addEventListener('DOMContentLoaded', function () {
        // Back to Notes link - preserves workspace parameter if available
        var backLink = document.getElementById('backToNotesLink');
        if (backLink) {
            backLink.addEventListener('click', function (e) {
                e.preventDefault();
                var href = backLink.getAttribute('href') || 'index.php';
                try {
                    var workspace = document.body.getAttribute('data-workspace') ||
                        (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ||
                        (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ||
                        null;

                    if (workspace && workspace !== '') {
                        var url = new URL(href, window.location.href);
                        url.searchParams.set('workspace', workspace);
                        href = url.toString();
                    }
                } catch (err) {
                    // Use default href if URL parsing fails
                }
                window.location = href;
            });
        }

        // Navigation cards (left column)
        var navCards = {
            'backup-export-card': 'backup_export.php',
            'restore-import-card': 'restore_import.php',
            'users-admin-card': 'admin/users.php'
        };
        Object.keys(navCards).forEach(function (cardId) {
            var card = document.getElementById(cardId);
            if (card) {
                card.addEventListener('click', function () {
                    window.location = navCards[cardId];
                });
            }
        });

        // Generic clickable cards with data-href attribute (excluding already handled cards)
        var clickableCards = document.querySelectorAll('.settings-card-clickable[data-href]');
        clickableCards.forEach(function (card) {
            // Skip if already handled in navCards
            if (card.id && navCards[card.id]) return;

            card.addEventListener('click', function () {
                var href = card.getAttribute('data-href');
                if (href) {
                    window.location = href;
                }
            });
        });

        // External link cards
        var externalCards = {
            'api-docs-card': 'api-docs/',
            'github-card': 'https://github.com/timothepoznanski/poznote',
            'news-card': 'https://poznote.com/news.html',
            'website-card': 'https://poznote.com'
        };
        Object.keys(externalCards).forEach(function (cardId) {
            var card = document.getElementById(cardId);
            if (card) {
                card.addEventListener('click', function () {
                    window.open(externalCards[cardId], '_blank');
                });
            }
        });

        var installAppCard = document.getElementById('install-app-card');
        if (installAppCard) {
            refreshInstallAppBadge();
            installAppCard.addEventListener('click', handleInstallAppCardClick);
            window.addEventListener('poznote:pwa-install-available', refreshInstallAppBadge);
            window.addEventListener('poznote:pwa-installed', refreshInstallAppBadge);
        }

        // Check for updates card
        var checkUpdatesCard = document.getElementById('check-updates-card');
        if (checkUpdatesCard && typeof window.checkForUpdates === 'function') {
            checkUpdatesCard.addEventListener('click', window.checkForUpdates);
        }

        // Restore update badge if available
        if (typeof window.restoreUpdateBadge === 'function') {
            window.restoreUpdateBadge();
        }

        // Setup toggle cards
        setupToggleCard('show-created-card', 'show-created-status', 'show_note_created', false);
        setupToggleCard('folder-counts-card', 'folder-counts-status', 'hide_folder_counts', true);
        setupToggleCard('folder-actions-card', 'folder-actions-status', 'hide_folder_actions', true);
        setupToggleCard('notes-without-folders-card', 'notes-without-folders-status', 'notes_without_folders_after_folders', false);
        setupToggleCard('markdown-split-card-view-card', 'markdown-split-card-view-status', 'markdown_split_card_view', false, false);
        setupToggleCard('code-wrap-card', 'code-wrap-status', 'code_block_word_wrap', false, true);

        // Card click handlers for modal settings
        var languageCard = document.getElementById('language-card');
        if (languageCard) {
            languageCard.addEventListener('click', showLanguageModal);
        }

        var noteSortCard = document.getElementById('note-sort-card');
        if (noteSortCard) {
            noteSortCard.addEventListener('click', openNoteSortModal);
        }

        var timezoneCard = document.getElementById('timezone-card');
        if (timezoneCard) {
            timezoneCard.addEventListener('click', showTimezonePrompt);
        }

        // Import limits card - opens modal
        var importLimitsCard = document.getElementById('import-limits-card');
        if (importLimitsCard) {
            importLimitsCard.addEventListener('click', showImportLimitsModal);
        }

        // Git sync global toggle
        var gitSyncEnabledCard = document.getElementById('git-sync-enabled-card');
        if (gitSyncEnabledCard) {
            gitSyncEnabledCard.addEventListener('click', function () {
                getSetting('git_sync_enabled', function (currentValue) {
                    var currently = currentValue === '1' || currentValue === 'true';
                    var toSet = currently ? '0' : '1';
                    setSetting('git_sync_enabled', toSet, function () {
                        refreshGitSyncEnabledBadge();
                        reloadOpener();
                    });
                });
            });
        }

        // Tasklist insert order card - toggles between top and bottom
        var tasklistInsertOrderCard = document.getElementById('tasklist-insert-order-card');
        if (tasklistInsertOrderCard) {
            tasklistInsertOrderCard.addEventListener('click', function () {
                getSetting('tasklist_insert_order', function (currentValue) {
                    var current = (currentValue === 'top' || currentValue === 'bottom') ? currentValue : 'bottom';
                    var next = current === 'top' ? 'bottom' : 'top';
                    setSetting('tasklist_insert_order', next, function (success) {
                        if (success) {
                            refreshTasklistInsertOrderBadge();
                            reloadOpener();
                        } else {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        }
                    });
                });
            });
        }

        // Theme mode card - opens theme selection modal
        var themeModeCard = document.getElementById('theme-mode-card');
        if (themeModeCard) {
            themeModeCard.addEventListener('click', function () {
                var modal = document.getElementById('themeModal');
                if (!modal) return;
                var currentMode = (typeof window.getCurrentThemeMode === 'function')
                    ? window.getCurrentThemeMode()
                    : 'system';
                var radios = document.getElementsByName('themeChoice');
                for (var i = 0; i < radios.length; i++) {
                    radios[i].checked = (radios[i].value === currentMode);
                }
                modal.style.display = 'flex';
            });
        }

        // Login display card - delegates to ui.js
        var loginDisplayCard = document.getElementById('login-display-card');
        if (loginDisplayCard && typeof window.showLoginDisplayNamePrompt === 'function') {
            loginDisplayCard.addEventListener('click', window.showLoginDisplayNamePrompt);
        }

        var customCssCard = document.getElementById('custom-css-card');
        if (customCssCard) {
            customCssCard.addEventListener('click', showCustomCssModal);
        }

        // UI Customization card - opens modal
        var uiCustomizationCard = document.getElementById('ui-customization-card');
        if (uiCustomizationCard) {
            uiCustomizationCard.addEventListener('click', showUiCustomizationModal);
        }

        // Save UI Customization modal button
        var saveUiCustomBtn = document.getElementById('saveUiCustomizationBtn');
        if (saveUiCustomBtn) {
            saveUiCustomBtn.addEventListener('click', function () {
                var modal = document.getElementById('uiCustomizationModal');
                if (!modal) return;

                var hidden = [];
                var checkboxes = modal.querySelectorAll('[data-ui-key]');
                checkboxes.forEach(function (cb) {
                    if (!cb.checked) {
                        hidden.push(cb.getAttribute('data-ui-key'));
                    }
                });

                setSetting('hidden_ui_elements', JSON.stringify(hidden), function (success) {
                    if (success) {
                        try { closeModal('uiCustomizationModal'); } catch (e) { }
                        refreshUiCustomizationBadge();
                        reloadOpener();
                        reloadCurrentSettingsPage();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

        var uiCustomizationFilterInput = document.getElementById('uiCustomizationFilterInput');
        if (uiCustomizationFilterInput) {
            uiCustomizationFilterInput.addEventListener('input', function () {
                applyUiCustomizationFilter(document.getElementById('uiCustomizationModal'), uiCustomizationFilterInput.value);
            });
        }

        // Font size card - delegates to font-size-settings.js
        var fontSizeCard = document.getElementById('font-size-card');
        if (fontSizeCard && typeof window.showNoteFontSizePrompt === 'function') {
            fontSizeCard.addEventListener('click', window.showNoteFontSizePrompt);
        }

        // Index icon scale card - delegates to index-icon-scale-settings.js
        var indexIconScaleCard = document.getElementById('index-icon-scale-card');
        if (indexIconScaleCard && typeof window.showIndexIconScalePrompt === 'function') {
            indexIconScaleCard.addEventListener('click', window.showIndexIconScalePrompt);
        }

        // Save note sort modal button
        var saveNoteSortBtn = document.getElementById('saveNoteSortModalBtn');
        if (saveNoteSortBtn) {
            saveNoteSortBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('noteSort');
                var selected = null;
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }
                if (!selected) selected = 'updated_desc';
                setSetting('note_list_sort', selected, function (success) {
                    if (success) {
                        try { closeModal('noteSortModal'); } catch (e) { }
                        reloadOpener();
                        refreshNoteSortBadge();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

        // Save language modal button
        var saveLangBtn = document.getElementById('saveLanguageModalBtn');
        if (saveLangBtn) {
            saveLangBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('languageChoice');
                var selected = null;
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }
                if (!selected) selected = 'en';
                setSetting('language', selected, function (success) {
                    if (success) {
                        try { closeModal('languageModal'); } catch (e) { }
                        refreshLanguageBadge();
                        setTimeout(function () { window.location.reload(); }, 300);
                    } else {
                        alert(tr('settings.language.save_error', {}, 'Error saving language'));
                    }
                });
            });
        }

        // Save timezone modal button
        var saveTimezoneBtn = document.getElementById('saveTimezoneModalBtn');
        if (saveTimezoneBtn) {
            saveTimezoneBtn.addEventListener('click', function () {
                var select = document.getElementById('timezoneSelect');
                var selectedTimezone = select ? select.value : 'Europe/Paris';
                setSetting('timezone', selectedTimezone, function (success) {
                    if (success) {
                        try { closeModal('timezoneModal'); } catch (e) { }
                        refreshTimezoneBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.timezone.alerts.update_error', {}, 'Error updating timezone'));
                    }
                });
            });
        }

        // Save theme modal button
        var saveThemeBtn = document.getElementById('saveThemeModalBtn');
        if (saveThemeBtn) {
            saveThemeBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('themeChoice');
                var selected = 'system';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }
                if (typeof window.applyTheme === 'function') {
                    window.applyTheme(selected, true);
                    try { closeModal('themeModal'); } catch (e) { }
                    reloadOpener();
                }
            });
        }

        // ---- Custom CSS upload modal ----
        var uploadCustomCssBtn = document.getElementById('uploadCustomCssBtn');
        var customCssFileInput = document.getElementById('customCssFileInput');
        var removeCustomCssBtn = document.getElementById('removeCustomCssBtn');
        var cancelCustomCssBtn = document.getElementById('cancelCustomCssBtn');
        var saveCustomCssBtn = document.getElementById('saveCustomCssBtn');

        if (uploadCustomCssBtn && customCssFileInput) {
            uploadCustomCssBtn.addEventListener('click', function () {
                customCssFileInput.click();
            });
            customCssFileInput.addEventListener('change', function (e) {
                var file = e.target.files[0];
                if (!file) return;
                if (!file.name.match(/\.css$/i)) {
                    alert(tr('modals.custom_css.validation', {}, 'Please select a CSS file.'));
                    customCssFileInput.value = '';
                    return;
                }
                pendingCssFile = file;
                pendingCssRemove = false;
                updateCustomCssModalState(file.name);
            });
        }

        if (removeCustomCssBtn) {
            removeCustomCssBtn.addEventListener('click', function () {
                pendingCssFile = null;
                pendingCssRemove = true;
                updateCustomCssModalState(null);
                if (customCssFileInput) customCssFileInput.value = '';
            });
        }

        if (cancelCustomCssBtn) {
            cancelCustomCssBtn.addEventListener('click', function () {
                pendingCssFile = null;
                pendingCssRemove = false;
                try { closeModal('customCssModal'); } catch (e) { }
            });
        }

        if (saveCustomCssBtn) {
            saveCustomCssBtn.addEventListener('click', function () {
                if (pendingCssRemove) {
                    fetch('api_upload_css.php', { method: 'DELETE', credentials: 'same-origin' })
                        .then(function (r) { return r.json(); })
                        .then(function (data) {
                            if (data.success) {
                                try { closeModal('customCssModal'); } catch (e) { }
                                refreshCustomCssBadge();
                                reloadOpener();
                                window.location.reload();
                            } else {
                                alert(data.error || tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                            }
                        })
                        .catch(function () {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        });
                    return;
                }

                if (pendingCssFile) {
                    var formData = new FormData();
                    formData.append('css_file', pendingCssFile);
                    fetch('api_upload_css.php', { method: 'POST', credentials: 'same-origin', body: formData })
                        .then(function (r) { return r.json(); })
                        .then(function (data) {
                            if (data.success) {
                                pendingCssFile = null;
                                try { closeModal('customCssModal'); } catch (e) { }
                                refreshCustomCssBadge();
                                reloadOpener();
                                window.location.reload();
                            } else {
                                alert(data.error || tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                            }
                        })
                        .catch(function () {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        });
                    return;
                }

                // Nothing changed - just close
                try { closeModal('customCssModal'); } catch (e) { }
            });
        }

        // Save import limits modal button
        var saveImportLimitsBtn = document.getElementById('saveImportLimitsBtn');
        if (saveImportLimitsBtn) {
            saveImportLimitsBtn.addEventListener('click', function () {
                var indInput = document.getElementById('importMaxIndividualFilesInput');
                var zipInput = document.getElementById('importMaxZipFilesInput');
                var indVal = indInput ? parseInt(indInput.value, 10) : 50;
                var zipVal = zipInput ? parseInt(zipInput.value, 10) : 300;

                if (isNaN(indVal) || indVal < 1 || indVal > 100000 || isNaN(zipVal) || zipVal < 1 || zipVal > 100000) {
                    alert(tr('common.error', {}, 'Error'));
                    return;
                }

                setSetting('import_max_individual_files', String(indVal), function (s1) {
                    setSetting('import_max_zip_files', String(zipVal), function (s2) {
                        if (s1 && s2) {
                            try { closeModal('importLimitsModal'); } catch (e) { }
                            refreshImportLimitsBadges();
                        } else {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        }
                    });
                });
            });
        }

        // Load all badges on page load
        refreshLanguageBadge();
        refreshLoginDisplayBadge();
        refreshFontSizeBadge();
        refreshNoteSortBadge();
        refreshTasklistInsertOrderBadge();
        refreshToolbarModeBadge();
        refreshTimezoneBadge();
        refreshNoteWidthBadge();
        refreshIndexIconScaleBadge();
        refreshCustomCssBadge();
        refreshImportLimitsBadges();
        refreshGitSyncEnabledBadge();
        refreshUiCustomizationBadge();

        // Search functionality - filters settings cards
        var searchInput = document.getElementById('home-search-input');
        var cards = document.querySelectorAll('.home-grid .home-card');
        var grid = document.querySelector('.home-grid');

        if (searchInput && grid) {
            // Create "no results" message element
            var noResults = document.createElement('div');
            noResults.className = 'home-no-results';
            noResults.style.display = 'none';
            noResults.style.gridColumn = '1 / -1';
            noResults.style.textAlign = 'center';
            noResults.style.padding = '40px 20px';
            noResults.style.color = '#6b7280';
            noResults.innerHTML = '<i class="lucide lucide-search" style="font-size: 24px; display: block; margin-bottom: 10px; opacity: 0.5;"></i>'
                + tr('public.no_filter_results', {}, 'No results found.');
            grid.appendChild(noResults);

            // Filter cards based on search term
            searchInput.addEventListener('input', function () {
                var term = this.value.toLowerCase().trim();
                var visibleCount = 0;

                cards.forEach(function (card) {
                    var titleEl = card.querySelector('.home-card-title');
                    var title = titleEl ? titleEl.textContent.toLowerCase() : '';
                    var statusEl = card.querySelector('.setting-status');
                    var status = statusEl ? statusEl.textContent.toLowerCase() : '';

                    var isMatch = title.includes(term) || status.includes(term);
                    card.style.display = isMatch ? 'flex' : 'none';
                    if (isMatch) visibleCount++;
                });

                // Show/hide category titles based on whether their grids have visible cards
                document.querySelectorAll('.settings-category-title').forEach(function (title) {
                    var nextGrid = title.nextElementSibling;
                    if (nextGrid && nextGrid.classList.contains('home-grid')) {
                        var hasVisible = nextGrid.querySelector('.home-card[style*="flex"]') !== null;
                        title.style.display = (term === '' || hasVisible) ? '' : 'none';
                        nextGrid.style.display = (term === '' || hasVisible) ? '' : 'none';
                    }
                });

                noResults.style.display = (visibleCount === 0) ? 'block' : 'none';
            });

            // Keyboard shortcut: press "/" to focus search
            document.addEventListener('keydown', function (e) {
                if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    searchInput.focus();
                }
            });
        }

        // Re-translate badges when i18n is loaded
        document.addEventListener('poznote:i18n:loaded', function () {
            refreshLanguageBadge();
            refreshFontSizeBadge();
            refreshNoteSortBadge();
            refreshTasklistInsertOrderBadge();
            refreshToolbarModeBadge();
            refreshInstallAppBadge();
            refreshCustomCssBadge();
        });
    });

    // ========== UI Customization ==========

    function getSupportedUiCustomizationKeys() {
        var modal = document.getElementById('uiCustomizationModal');
        var allowed = Object.create(null);

        if (!modal) {
            return allowed;
        }

        var checkboxes = modal.querySelectorAll('[data-ui-key]');
        checkboxes.forEach(function (cb) {
            allowed[cb.getAttribute('data-ui-key')] = true;
        });

        return allowed;
    }

    function parseHiddenUiCustomization(value) {
        var hidden = [];
        if (value) {
            try { hidden = JSON.parse(value); } catch (e) { hidden = []; }
        }
        if (!Array.isArray(hidden)) hidden = [];

        var allowed = getSupportedUiCustomizationKeys();
        return hidden.filter(function (key) {
            return typeof key === 'string' && allowed[key];
        });
    }

    function normalizeUiCustomizationFilterText(value) {
        var text = String(value || '').toLowerCase().trim();

        if (typeof text.normalize === 'function') {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        return text.replace(/\s+/g, ' ');
    }

    function applyUiCustomizationFilter(modal, value) {
        if (!modal) return;

        var query = normalizeUiCustomizationFilterText(value);
        var sections = modal.querySelectorAll('.ui-custom-section');
        var emptyState = document.getElementById('uiCustomizationFilterEmpty');
        var anyVisible = false;

        modal.classList.toggle('ui-custom-filtering', query.length > 0);

        sections.forEach(function (section) {
            var items = section.querySelectorAll('.ui-custom-item');
            var visibleItems = 0;

            items.forEach(function (item) {
                var matches = !query || normalizeUiCustomizationFilterText(item.textContent).indexOf(query) !== -1;

                item.hidden = !matches;
                if (matches) {
                    visibleItems += 1;
                }
            });

            section.hidden = visibleItems === 0;
            if (visibleItems > 0) {
                anyVisible = true;
            }
        });

        if (emptyState) {
            emptyState.hidden = anyVisible;
        }
    }

    function refreshUiCustomizationBadge() {
        var badge = document.getElementById('ui-customization-badge');
        if (!badge) return;

        getSetting('hidden_ui_elements', function (value) {
            var hidden = parseHiddenUiCustomization(value);

            if (hidden.length === 0) {
                badge.textContent = tr('modals.ui_customization.badge_all_visible', {}, 'All visible');
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = tr('modals.ui_customization.badge_hidden_count', { count: hidden.length }, hidden.length + ' hidden');
                badge.className = 'setting-status disabled';
            }
        });
    }

    function showUiCustomizationModal() {
        var modal = document.getElementById('uiCustomizationModal');
        if (!modal) return;

        getSetting('hidden_ui_elements', function (value) {
            var hidden = parseHiddenUiCustomization(value);

            // Set checkboxes: checked = visible (not in hidden list)
            var checkboxes = modal.querySelectorAll('[data-ui-key]');
            checkboxes.forEach(function (cb) {
                cb.checked = hidden.indexOf(cb.getAttribute('data-ui-key')) === -1;
            });

            var filterInput = document.getElementById('uiCustomizationFilterInput');
            if (filterInput) {
                filterInput.value = '';
            }

            applyUiCustomizationFilter(modal, '');

            modal.style.display = 'flex';
        });
    }

    // ========== Global API ==========
    // Expose functions for external access and inline HTML handlers
    window.showLanguageModal = showLanguageModal;
    window.openNoteSortModal = openNoteSortModal;
    window.showTimezonePrompt = showTimezonePrompt;
    window.refreshLanguageBadge = refreshLanguageBadge;
    window.refreshLoginDisplayBadge = refreshLoginDisplayBadge;
    window.refreshFontSizeBadge = refreshFontSizeBadge;
    window.refreshNoteSortBadge = refreshNoteSortBadge;
    window.refreshTasklistInsertOrderBadge = refreshTasklistInsertOrderBadge;
    window.refreshToolbarModeBadge = refreshToolbarModeBadge;
    window.refreshTimezoneBadge = refreshTimezoneBadge;
    window.refreshNoteWidthBadge = refreshNoteWidthBadge;
    window.refreshCustomCssBadge = refreshCustomCssBadge;
    window.getSetting = getSetting;
    window.setSetting = setSetting;
    window.showCustomCssModal = showCustomCssModal;

})();
