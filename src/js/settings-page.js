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

    var settingsCache = Object.create(null);
    var settingsPreloadPromise = null;

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

    function hasCachedSetting(key) {
        return Object.prototype.hasOwnProperty.call(settingsCache, key);
    }

    function seedSettingFromPageConfig(key) {
        if (hasCachedSetting(key) || typeof window.getPoznoteInitialSetting !== 'function') {
            return hasCachedSetting(key);
        }

        var initialValue = window.getPoznoteInitialSetting(key);
        if (initialValue !== null) {
            settingsCache[key] = initialValue;
            return true;
        }

        return false;
    }

    function cacheSettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        Object.keys(settings).forEach(function (key) {
            settingsCache[key] = settings[key];
        });
    }

    function fetchSingleSetting(key, callback) {
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

    function getSettingsPreloadKeys() {
        var keys = [
            'language',
            'show_note_created',
            'show_note_icons',
            'hide_folder_counts',
            'hide_folder_actions',
            'notes_without_folders_after_folders',
            'markdown_split_card_view',
            'code_block_word_wrap',
            'attachment_previews_in_note',
            'attachments_at_bottom',
            'backlinks_at_bottom',
            'default_image_border_no_padding',
            'center_note_content',
            'note_list_sort',
            'note_age_filter_days',
            'tasklist_insert_order',
            'toolbar_mode',
            'timezone',
            'date_time_format',
            'hidden_ui_elements',
            'spellcheck_html_notes'
        ];

        if (document.getElementById('login-display-badge')) {
            keys.push('login_display_name');
        }
        if (document.getElementById('custom-css-badge')) {
            keys.push('custom_css_path');
        }
        if (document.getElementById('import-limits-card')) {
            keys.push('import_max_individual_files', 'import_max_zip_files');
        }
        if (document.getElementById('git-sync-enabled-card')) {
            keys.push('git_sync_enabled');
        }

        var unique = Object.create(null);
        return keys.filter(function (key) {
            if (unique[key]) return false;
            unique[key] = true;
            return true;
        });
    }

    function preloadSettings(keys) {
        var missingKeys = [];

        keys.forEach(function (key) {
            if (!seedSettingFromPageConfig(key)) {
                missingKeys.push(key);
            }
        });

        if (missingKeys.length === 0) {
            settingsPreloadPromise = Promise.resolve();
            return settingsPreloadPromise;
        }

        if (typeof window.canUsePoznoteSettingsApi === 'function' && !window.canUsePoznoteSettingsApi()) {
            settingsPreloadPromise = Promise.resolve();
            return settingsPreloadPromise;
        }

        var params = new URLSearchParams();
        missingKeys.forEach(function (key) {
            params.append('keys[]', key);
        });

        settingsPreloadPromise = fetch('/api/v1/settings?' + params.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (j && j.success) {
                    cacheSettings(j.settings);
                }
            })
            .catch(function () {
                // Badge refreshes will fall back to defaults if the batch request fails.
            });

        return settingsPreloadPromise;
    }

    // Generic function to get setting value from page config, cache, or API.
    function getSetting(key, callback) {
        if (seedSettingFromPageConfig(key)) {
            callback(settingsCache[key]);
            return;
        }

        if (settingsPreloadPromise) {
            settingsPreloadPromise.then(function () {
                if (hasCachedSetting(key)) {
                    callback(settingsCache[key]);
                    return;
                }

                fetchSingleSetting(key, callback);
            });
            return;
        }

        fetchSingleSetting(key, callback);
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
                if (result && result.success) {
                    settingsCache[key] = Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : value;
                }
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
        var badge = document.getElementById('login-display-badge');
        if (!badge) return;

        getSetting('login_display_name', function (value) {
            if (value && value.trim()) {
                badge.textContent = value.trim();
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = txt.notDefined;
                badge.className = 'setting-status disabled';
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
                var size = (window.__poznoteUserStorage || localStorage).getItem(config.key) || config.default;
                badge.textContent = tr(config.i18nKey, { size: size }, config.fallback + size + 'px');
                badge.className = 'setting-status enabled';
            }
        });
    }

    function getMainFontLabel(fontKey) {
        var labels = {
            inter: tr('modals.main_font.options.inter', {}, 'Inter (default)'),
            system: tr('modals.main_font.options.system', {}, 'System'),
            arial: 'Arial',
            verdana: 'Verdana',
            trebuchet: 'Trebuchet MS',
            georgia: 'Georgia',
            times: 'Times New Roman'
        };
        return labels[fontKey] || labels.inter;
    }

    // Probe which main-font options actually resolve on this device.
    // FontFace.load() rejects when every local() source is missing, which
    // tests exactly what the @font-face override in theme-init.js will do
    // (a plain font-family lookup would go through OS font substitution
    // and report fonts as available when local() would not find them).
    var mainFontAvailability = null;
    function probeMainFonts(callback) {
        if (mainFontAvailability) { callback(mainFontAvailability); return; }

        var fonts = window.__poznoteMainFonts || {};
        var keys = Object.keys(fonts);
        var result = { inter: true };

        if (typeof window.FontFace !== 'function') {
            keys.forEach(function (key) { result[key] = true; });
            mainFontAvailability = result;
            callback(result);
            return;
        }

        var pending = keys.length;
        function done() {
            pending--;
            if (pending === 0) {
                mainFontAvailability = result;
                callback(result);
            }
        }
        keys.forEach(function (key) {
            var src = fonts[key].regular.map(function (n) { return "local('" + n + "')"; }).join(', ');
            try {
                new FontFace('__poznote-font-probe-' + key, src).load().then(
                    function () { result[key] = true; done(); },
                    function () { result[key] = false; done(); }
                );
            } catch (e) {
                result[key] = true;
                done();
            }
        });
    }

    function refreshMainFontBadge() {
        var badge = document.getElementById('main-font-badge');
        if (badge) {
            var font = (window.__poznoteUserStorage || localStorage).getItem('main_font') || 'inter';
            badge.textContent = getMainFontLabel(font);
            badge.className = 'setting-status enabled';
        }
    }

    function refreshIndexIconScaleBadge() {
        var badge = document.getElementById('index-icon-scale-badge');
        if (badge) {
            var scale = (window.__poznoteUserStorage || localStorage).getItem('index_icon_scale') || '1.0';
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

    function getNoteAgeFilterLabel(value) {
        var days = parseInt(value, 10);
        if (isNaN(days) || days <= 0) {
            return tr('modals.note_age_filter.options.all', {}, 'All notes');
        }

        switch (days) {
            case 30:
                return tr('modals.note_age_filter.options.last_30_days', {}, 'Last 30 days');
            case 90:
                return tr('modals.note_age_filter.options.last_3_months', {}, 'Last 3 months');
            case 180:
                return tr('modals.note_age_filter.options.last_6_months', {}, 'Last 6 months');
            case 365:
                return tr('modals.note_age_filter.options.last_12_months', {}, 'Last 12 months');
            case 730:
                return tr('modals.note_age_filter.options.last_2_years', {}, 'Last 2 years');
            default:
                return tr('modals.note_age_filter.options.custom_days', { days: days }, 'Last ' + days + ' days');
        }
    }

    function refreshNoteAgeFilterBadge() {
        getSetting('note_age_filter_days', function (value) {
            var badge = document.getElementById('note-age-filter-badge');
            if (!badge) return;

            badge.textContent = getNoteAgeFilterLabel(value || '0');
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

    function normalizeDateTimeFormat(value) {
        if (typeof value === 'string' && value.indexOf('custom:') === 0 && value.slice(7).trim() !== '') {
            return 'custom:' + value.slice(7).trim();
        }

        var allowed = {
            default: true,
            ymd_hi: true,
            ymd_his: true,
            dmy_hi: true,
            mdy_hia: true
        };
        return allowed[value] ? value : 'default';
    }

    function getCustomDateTimeFormatPattern(value) {
        return (typeof value === 'string' && value.indexOf('custom:') === 0) ? value.slice(7).trim() : '';
    }

    function isValidCustomDateTimeFormat(pattern) {
        return typeof pattern === 'string'
            && pattern.trim() !== ''
            && pattern.trim().length <= 80
            && /^[A-Za-z0-9\s:\/.,_\-()]+$/.test(pattern.trim());
    }

    function getDateTimeFormatLabel(value) {
        var normalized = normalizeDateTimeFormat(value);
        var customPattern = getCustomDateTimeFormatPattern(normalized);
        if (customPattern) {
            return customPattern;
        }

        switch (normalized) {
            case 'ymd_hi':
                return tr('modals.date_time_format.options.ymd_hi', {}, 'YYYY-MM-DD HH:mm');
            case 'ymd_his':
                return tr('modals.date_time_format.options.ymd_his', {}, 'YYYY-MM-DD HH:mm:ss');
            case 'dmy_hi':
                return tr('modals.date_time_format.options.dmy_hi', {}, 'DD/MM/YYYY HH:mm');
            case 'mdy_hia':
                return tr('modals.date_time_format.options.mdy_hia', {}, 'MM/DD/YYYY hh:mm AM/PM');
            case 'default':
            default:
                return tr('modals.date_time_format.options.default', {}, 'YYYY-MM-DD HH:mm');
        }
    }

    function refreshDateTimeFormatBadge() {
        getSetting('date_time_format', function (value) {
            var badge = document.getElementById('date-time-format-badge');
            if (!badge) return;

            var format = normalizeDateTimeFormat(value || 'default');
            badge.textContent = getDateTimeFormatLabel(format);
            badge.className = 'setting-status enabled';
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

    function refreshGitSyncCardBadge() {
        var badge = document.getElementById('git-sync-status-badge');
        if (!badge) return;

        fetch('/api/v1/git-sync/status', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (!j || !j.success) return;

                var enabled = j.enabled === true;
                var configured = !!(j.config && j.config.configured);

                if (!enabled) {
                    badge.textContent = tr('common.disabled', {}, 'Disabled');
                    badge.className = 'setting-status disabled';
                    return;
                }

                badge.textContent = configured
                    ? tr('git_sync.config.token_set', {}, 'Configured')
                    : tr('git_sync.config.not_configured', {}, 'Not configured');
                badge.className = 'setting-status ' + (configured ? 'enabled' : 'disabled');
            })
            .catch(function () {
                // Keep the server-rendered status if the refresh request fails.
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

    function openNoteAgeFilterModal() {
        var modal = document.getElementById('noteAgeFilterModal');
        if (!modal) return;
        getSetting('note_age_filter_days', function (value) {
            var v = value || '0';
            var radios = document.getElementsByName('noteAgeFilter');
            var matched = false;
            for (var i = 0; i < radios.length; i++) {
                if (radios[i].value === 'custom') continue;
                radios[i].checked = (radios[i].value === v);
                matched = matched || radios[i].checked;
            }
            if (!matched) {
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].value === 'custom') {
                        radios[i].checked = true;
                        var customInput = document.getElementById('noteAgeFilterCustomDays');
                        if (customInput) customInput.value = (v && v !== '0') ? v : '';
                        break;
                    }
                }
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

    function openDateTimeFormatModal() {
        var modal = document.getElementById('dateTimeFormatModal');
        if (!modal) return;

        getSetting('date_time_format', function (value) {
            var currentValue = normalizeDateTimeFormat(value || 'default');
            var customPattern = getCustomDateTimeFormatPattern(currentValue);
            var customInput = document.getElementById('dateTimeFormatCustomInput');
            if (currentValue === 'ymd_hi') {
                currentValue = 'default';
            }
            if (customPattern) {
                currentValue = 'custom';
            }
            var radios = document.getElementsByName('dateTimeFormat');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === currentValue);
            }
            if (customInput) {
                customInput.value = customPattern;
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
                card.addEventListener('click', function (e) {
                    e.preventDefault();
                    window.open(externalCards[cardId], '_blank');
                });
            }
        });

        var apiRestCard = document.getElementById('api-rest-card');
        var apiRestModal = document.getElementById('apiRestModal');
        var openGithubApiDocsBtn = document.getElementById('openGithubApiDocsBtn');
        var openSwaggerApiBtn = document.getElementById('openSwaggerApiBtn');
        var closeApiRestModalBtn = document.getElementById('closeApiRestModalBtn');
        var githubApiDocsUrl = 'https://github.com/timothepoznanski/poznote/blob/main/docs/API-REST.md';
        var swaggerApiUrl = 'api-docs/';

        function openApiRestModal() {
            if (!apiRestModal) return;
            apiRestModal.style.display = 'flex';
        }

        function closeApiRestModal() {
            if (!apiRestModal) return;
            apiRestModal.style.display = 'none';
        }

        if (apiRestCard) {
            apiRestCard.addEventListener('click', openApiRestModal);
            apiRestCard.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openApiRestModal();
                }
            });
        }

        if (openGithubApiDocsBtn) {
            openGithubApiDocsBtn.addEventListener('click', function () {
                window.open(githubApiDocsUrl, '_blank');
                closeApiRestModal();
            });
        }

        if (openSwaggerApiBtn) {
            openSwaggerApiBtn.addEventListener('click', function () {
                closeApiRestModal();
                window.location.href = swaggerApiUrl;
            });
        }

        if (closeApiRestModalBtn) {
            closeApiRestModalBtn.addEventListener('click', closeApiRestModal);
        }

        if (apiRestModal) {
            apiRestModal.addEventListener('click', function (e) {
                if (e.target === apiRestModal) {
                    closeApiRestModal();
                }
            });
        }

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
        setupToggleCard('note-icons-card', 'note-icons-status', 'show_note_icons', false, false);
        setupToggleCard('folder-counts-card', 'folder-counts-status', 'hide_folder_counts', true);
        setupToggleCard('folder-actions-card', 'folder-actions-status', 'hide_folder_actions', true);
        setupToggleCard('notes-without-folders-card', 'notes-without-folders-status', 'notes_without_folders_after_folders', false);
        setupToggleCard('markdown-split-card-view-card', 'markdown-split-card-view-status', 'markdown_split_card_view', false, true);
        setupToggleCard('code-wrap-card', 'code-wrap-status', 'code_block_word_wrap', false, true);
        setupToggleCard('attachment-previews-card', 'attachment-previews-status', 'attachment_previews_in_note', false, false);
        setupToggleCard('attachments-at-bottom-card', 'attachments-at-bottom-status', 'attachments_at_bottom', false, false);
        setupToggleCard('backlinks-at-bottom-card', 'backlinks-at-bottom-status', 'backlinks_at_bottom', false, false);
        setupToggleCard('default-image-border-card', 'default-image-border-status', 'default_image_border_no_padding', false, false);
        setupToggleCard('spellcheck-html-notes-card', 'spellcheck-html-notes-status', 'spellcheck_html_notes', false, false);

        // Card click handlers for modal settings
        var languageCard = document.getElementById('language-card');
        if (languageCard) {
            languageCard.addEventListener('click', showLanguageModal);
        }

        var noteSortCard = document.getElementById('note-sort-card');
        if (noteSortCard) {
            noteSortCard.addEventListener('click', openNoteSortModal);
        }

        var noteAgeFilterCard = document.getElementById('note-age-filter-card');
        if (noteAgeFilterCard) {
            noteAgeFilterCard.addEventListener('click', openNoteAgeFilterModal);
        }

        var timezoneCard = document.getElementById('timezone-card');
        if (timezoneCard) {
            timezoneCard.addEventListener('click', showTimezonePrompt);
        }

        var dateTimeFormatCard = document.getElementById('date-time-format-card');
        if (dateTimeFormatCard) {
            dateTimeFormatCard.addEventListener('click', openDateTimeFormatModal);
        }

        var customDateTimeFormatInput = document.getElementById('dateTimeFormatCustomInput');
        if (customDateTimeFormatInput) {
            customDateTimeFormatInput.addEventListener('focus', function () {
                var customRadio = document.querySelector('input[name="dateTimeFormat"][value="custom"]');
                if (customRadio) customRadio.checked = true;
            });
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
                        refreshGitSyncCardBadge();
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

        // Main font card - opens font selection modal
        var mainFontCard = document.getElementById('main-font-card');
        if (mainFontCard) {
            mainFontCard.addEventListener('click', function () {
                var modal = document.getElementById('mainFontModal');
                if (!modal) return;
                var current = (window.__poznoteUserStorage || localStorage).getItem('main_font') || 'inter';
                probeMainFonts(function (available) {
                    var select = document.getElementById('mainFontSelect');
                    if (select) {
                        for (var i = 0; i < select.options.length; i++) {
                            var option = select.options[i];
                            // Hide fonts this device does not have; keep the
                            // stored choice visible even if it is unavailable
                            // here so it can be changed.
                            var show = option.value === current || available[option.value] !== false;
                            option.hidden = !show;
                            option.disabled = !show;
                        }
                        select.value = current;
                    }
                    modal.style.display = 'flex';
                });
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

        // Init section toggle-all buttons (event delegation, one-time setup)
        var uiCustomModal = document.getElementById('uiCustomizationModal');
        if (uiCustomModal) {
            initSectionToggleButtons(uiCustomModal);
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

        var customDaysInput = document.getElementById('noteAgeFilterCustomDays');
        if (customDaysInput) {
            customDaysInput.addEventListener('focus', function () {
                var radios = document.getElementsByName('noteAgeFilter');
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].value === 'custom') { radios[i].checked = true; break; }
                }
            });
        }

        var saveNoteAgeFilterBtn = document.getElementById('saveNoteAgeFilterModalBtn');
        if (saveNoteAgeFilterBtn) {
            saveNoteAgeFilterBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('noteAgeFilter');
                var selected = '0';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }
                if (selected === 'custom') {
                    var customInput = document.getElementById('noteAgeFilterCustomDays');
                    var customVal = customInput ? parseInt(customInput.value, 10) : 0;
                    selected = (customVal > 0 && customVal <= 36500) ? String(customVal) : '0';
                }
                setSetting('note_age_filter_days', selected, function (success) {
                    if (success) {
                        try { closeModal('noteAgeFilterModal'); } catch (e) { }
                        reloadOpener();
                        refreshNoteAgeFilterBadge();
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

        // Save date and time format modal button
        var saveDateTimeFormatBtn = document.getElementById('saveDateTimeFormatModalBtn');
        if (saveDateTimeFormatBtn) {
            saveDateTimeFormatBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('dateTimeFormat');
                var selected = 'default';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }

                if (selected === 'custom') {
                    var customInput = document.getElementById('dateTimeFormatCustomInput');
                    var customPattern = customInput ? customInput.value.trim() : '';
                    if (!isValidCustomDateTimeFormat(customPattern)) {
                        alert(tr('modals.date_time_format.custom_invalid', {}, 'Enter a valid custom format.'));
                        if (customInput) customInput.focus();
                        return;
                    }
                    selected = 'custom:' + customPattern;
                } else {
                    selected = normalizeDateTimeFormat(selected);
                }

                setSetting('date_time_format', selected, function (success) {
                    if (success) {
                        try { closeModal('dateTimeFormatModal'); } catch (e) { }
                        refreshDateTimeFormatBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
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

        // Save main font modal button
        var saveMainFontBtn = document.getElementById('saveMainFontModalBtn');
        if (saveMainFontBtn) {
            saveMainFontBtn.addEventListener('click', function () {
                var select = document.getElementById('mainFontSelect');
                var selected = (select && select.value) || 'inter';
                (window.__poznoteUserStorage || localStorage).setItem('main_font', selected);
                if (typeof window.__poznoteApplyMainFont === 'function') {
                    window.__poznoteApplyMainFont(selected);
                }
                try { closeModal('mainFontModal'); } catch (e) { }
                refreshMainFontBadge();
                reloadOpener();
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

        // Load all badges on page load. Most values are already embedded in page-config-data.
        preloadSettings(getSettingsPreloadKeys()).then(function () {
            refreshLanguageBadge();
            refreshLoginDisplayBadge();
            refreshFontSizeBadge();
            refreshMainFontBadge();
            refreshNoteSortBadge();
            refreshNoteAgeFilterBadge();
            refreshTasklistInsertOrderBadge();
            refreshToolbarModeBadge();
            refreshTimezoneBadge();
            refreshDateTimeFormatBadge();
            refreshNoteWidthBadge();
            refreshIndexIconScaleBadge();
            refreshCustomCssBadge();
            refreshImportLimitsBadges();
            refreshGitSyncEnabledBadge();
            refreshUiCustomizationBadge();
        });

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
            refreshMainFontBadge();
            refreshNoteSortBadge();
            refreshNoteAgeFilterBadge();
            refreshTasklistInsertOrderBadge();
            refreshToolbarModeBadge();
            refreshDateTimeFormatBadge();
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

    function updateSectionToggleBtn(section) {
        var btn = section.querySelector('.ui-custom-toggle-all');
        if (!btn) return;

        var checkboxes = section.querySelectorAll('[data-ui-key]');
        var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

        btn.textContent = allChecked
            ? (btn.getAttribute('data-label-uncheck') || 'Uncheck all')
            : (btn.getAttribute('data-label-check') || 'Check all');
    }

    function updateGlobalToggleBtn(modal) {
        var btn = modal.querySelector('#uiCustomizationToggleAll');
        if (!btn) return;

        var checkboxes = modal.querySelectorAll('[data-ui-key]');
        var allChecked = checkboxes.length > 0
            && Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

        btn.textContent = allChecked
            ? (btn.getAttribute('data-label-uncheck') || 'Uncheck all')
            : (btn.getAttribute('data-label-check') || 'Check all');
    }

    function initSectionToggleButtons(modal) {
        // Update button labels based on current state
        modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
        updateGlobalToggleBtn(modal);

        // Click: toggle all checkboxes (globally, or within one section)
        modal.addEventListener('click', function (e) {
            var globalBtn = e.target.closest('#uiCustomizationToggleAll');
            if (globalBtn) {
                var allCheckboxes = modal.querySelectorAll('[data-ui-key]');
                var everyChecked = allCheckboxes.length > 0
                    && Array.prototype.every.call(allCheckboxes, function (cb) { return cb.checked; });
                allCheckboxes.forEach(function (cb) { cb.checked = !everyChecked; });
                modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
                updateGlobalToggleBtn(modal);
                return;
            }

            var btn = e.target.closest('.ui-custom-toggle-all');
            if (!btn) return;

            var section = btn.closest('.ui-custom-section');
            if (!section) return;

            var checkboxes = section.querySelectorAll('[data-ui-key]');
            var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
            checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
            updateSectionToggleBtn(section);
            updateGlobalToggleBtn(modal);
        });

        // Change: keep button labels in sync when individual checkboxes change
        modal.addEventListener('change', function (e) {
            if (!e.target || !e.target.getAttribute('data-ui-key')) return;

            var section = e.target.closest('.ui-custom-section');
            if (section) updateSectionToggleBtn(section);
            updateGlobalToggleBtn(modal);
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

            // Update toggle-all buttons to reflect current state
            modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
            updateGlobalToggleBtn(modal);

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
    window.openNoteAgeFilterModal = openNoteAgeFilterModal;
    window.showTimezonePrompt = showTimezonePrompt;
    window.openDateTimeFormatModal = openDateTimeFormatModal;
    window.refreshLanguageBadge = refreshLanguageBadge;
    window.refreshLoginDisplayBadge = refreshLoginDisplayBadge;
    window.refreshFontSizeBadge = refreshFontSizeBadge;
    window.refreshNoteSortBadge = refreshNoteSortBadge;
    window.refreshNoteAgeFilterBadge = refreshNoteAgeFilterBadge;
    window.refreshTasklistInsertOrderBadge = refreshTasklistInsertOrderBadge;
    window.refreshToolbarModeBadge = refreshToolbarModeBadge;
    window.refreshTimezoneBadge = refreshTimezoneBadge;
    window.refreshDateTimeFormatBadge = refreshDateTimeFormatBadge;
    window.refreshNoteWidthBadge = refreshNoteWidthBadge;
    window.refreshCustomCssBadge = refreshCustomCssBadge;
    window.getSetting = getSetting;
    window.setSetting = setSetting;
    // Allow other modules (e.g. modals that write settings directly via fetch)
    // to keep the local settingsCache in sync so badges refresh without a page reload.
    window.updateSettingCache = function (key, value) {
        settingsCache[key] = value;
    };
    window.showCustomCssModal = showCustomCssModal;

})();
