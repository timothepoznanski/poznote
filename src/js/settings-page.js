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
            case 'fr': return tr('settings.language.french', {}, 'French');
            case 'es': return tr('settings.language.spanish', {}, 'Spanish');
            case 'pt': return tr('settings.language.portuguese', {}, 'Portuguese');
            case 'de': return tr('settings.language.german', {}, 'German');
            case 'en':
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
                if (callback) callback(result && result.success);
            })
            .catch(function () {
                if (callback) callback(false);
            });
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

    // ========== Toggle Cards ==========

    // Helper function to determine if a setting is enabled
    function isSettingEnabled(value, invertLogic, defaultValue) {
        if (value === null && defaultValue !== undefined) {
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
            { id: 'font-size-badge', key: 'note_font_size', default: '15', i18nKey: 'display.badges.note_font_size', fallback: 'Note: ' },
            { id: 'sidebar-font-size-badge', key: 'sidebar_font_size', default: '13', i18nKey: 'display.badges.sidebar_font_size', fallback: 'Sidebar: ' }
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
                    icon.classList.toggle('fa-arrow-up', isTop);
                    icon.classList.toggle('fa-arrow-down', !isTop);
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

    // ========== Modal Functions ==========

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
            'website-card': 'https://poznote.com',
            'support-card': 'https://ko-fi.com/timothepoznanski'
        };
        Object.keys(externalCards).forEach(function (cardId) {
            var card = document.getElementById(cardId);
            if (card) {
                card.addEventListener('click', function () {
                    window.open(externalCards[cardId], '_blank');
                });
            }
        });

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
        setupToggleCard('show-inline-attachment-images-card', 'show-inline-attachment-images-status', 'hide_inline_attachment_images', true);
        setupToggleCard('enable-internal-tabs-card', 'enable-internal-tabs-status', 'enable_internal_tabs', true);

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
            noResults.innerHTML = '<i class="fas fa-search" style="font-size: 24px; display: block; margin-bottom: 10px; opacity: 0.5;"></i>'
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
        });
    });

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
    window.getSetting = getSetting;
    window.setSetting = setSetting;

})();
