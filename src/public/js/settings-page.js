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
            'type_based_note_icons',
            'note_color_palette',
            'hide_folder_counts',
            'hide_folder_actions',
            'highlight_current_folder_tree',
            'folder_tree_dim_level',
            'notes_without_folders_after_folders',
            'markdown_split_card_view',
            'markdown_default_view_mode',
            'markdown_colored',
            'markdown_colored_custom',
            'code_block_word_wrap',
            'code_block_line_numbers',
            'attachment_previews_in_note',
            'attachments_at_bottom',
            'backlinks_at_bottom',
            'default_image_border_no_padding',
            'center_note_content',
            'note_list_sort',
            'note_age_filter_days',
            'snapshots_keep_count',
            'tasklist_insert_order',
            'diary_default_note_type',
            'diary_date_format',
            'toolbar_mode',
            'timezone',
            'date_time_format',
            'hidden_ui_elements',
            'icon_sidebar_order',
            'settings_pinned_cards',
            'spellcheck_html_notes',
            'slash_menu_require_alt',
            'note_nav_shortcuts_enabled',
            'ctrl_s_save_enabled'
        ];

        if (document.getElementById('login-display-badge')) {
            keys.push('login_display_name');
        }
        if (isUiCustomizationAdmin()) {
            keys.push('hidden_ui_elements_global');
        }
        if (document.getElementById('custom-css-badge')) {
            keys.push('custom_css_path');
        }
        if (document.getElementById('import-limits-card')) {
            keys.push('import_max_individual_files', 'import_max_zip_files');
        }
        if (document.getElementById('user-quotas-card')) {
            keys.push('user_max_notes', 'user_max_storage_mb', 'user_max_storage_s3_mb', 'user_max_backups_s3_mb');
        }
        if (document.getElementById('git-sync-enabled-card')) {
            keys.push('git_sync_enabled');
        }
        if (document.getElementById('executable-attachments-card')) {
            keys.push('allow_executable_attachments');
        }
        if (document.getElementById('tenant-isolation-card')) {
            keys.push('tenant_isolation', 'tenant_isolation_features', 'tenant_isolation_applied_ui_keys');
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
            .catch(function (e) {
                // Badge refreshes will fall back to defaults if the batch request fails.
                console.debug('settings-page: preloadSettings() failed:', e);
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

    // Reload opener window if it's index.php
    function reloadOpener() {
        try {
            if (window.opener && window.opener.location && window.opener.location.pathname.includes('index.php')) {
                window.opener.location.reload();
            }
        } catch (e) {
            // Safely ignore cross-origin errors
            console.debug('settings-page: reloadOpener() failed:', e);
        }
    }

    function reloadCurrentSettingsPage() {
        try {
            if (window.location && window.location.pathname && window.location.pathname.includes('settings.php')) {
                window.location.reload();
            }
        } catch (e) {
            // Safely ignore reload issues
            console.debug('settings-page: reloadCurrentSettingsPage() failed:', e);
        }
    }

    // ========== Desktop layout (section list + rows) ==========

    // settings.php on a wide screen shows one section at a time, picked from
    // the list on the left (css/settings.css, .settings-with-nav). Narrow
    // screens keep the stacked, collapsible sections; the breakpoint matches
    // the stylesheet.
    var settingsNavMedia = window.matchMedia ? window.matchMedia('(min-width: 801px)') : null;

    function isSettingsNavLayout() {
        return !!(settingsNavMedia && settingsNavMedia.matches
            && document.querySelector('.home-container.settings-with-nav'));
    }

    // ========== Toggle Cards ==========

    // A card that flips a boolean setting on click: the desktop rows draw its
    // badge as a switch (.settings-toggle-card in css/settings.css), and the
    // card gets the matching switch semantics and keyboard handling.
    function markToggleCard(card) {
        if (!card) return;
        card.classList.add('settings-toggle-card');
        card.setAttribute('role', 'switch');
        if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', function (e) {
            if (e.target !== card) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    }

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
                if (card) card.setAttribute('aria-checked', enabled ? 'true' : 'false');

                // Special handling for folder actions visibility
                if (cardId === 'folder-actions-card') {
                    document.body.classList.toggle('folder-actions-always-visible', enabled);
                }
            });
        }

        if (card) {
            markToggleCard(card);
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
                                console.debug('settings-page: shouldAddNoWrap() failed:', e);
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

    // Slash menu trigger: click toggles between typing "/" and pressing "Alt + /".
    // The status badge shows the active shortcut rather than Enabled/Disabled, since
    // both states are "on" — only the key combination changes.
    function setupSlashMenuTriggerCard() {
        var card = document.getElementById('slash-menu-require-alt-card');
        var status = document.getElementById('slash-menu-require-alt-status');
        if (!card && !status) return;

        function refresh() {
            getSetting('slash_menu_require_alt', function (value) {
                var requireAlt = isSettingEnabled(value, false, false);
                if (!status) return;
                status.textContent = requireAlt
                    ? tr('display.badges.slash_menu_alt_slash', {}, 'Alt + /')
                    : tr('display.badges.slash_menu_slash', {}, '/');
                status.className = 'setting-status enabled';
            });
        }

        if (card) {
            card.addEventListener('click', function () {
                getSetting('slash_menu_require_alt', function (currentValue) {
                    var requireAlt = isSettingEnabled(currentValue, false, false);
                    setSetting('slash_menu_require_alt', requireAlt ? '0' : '1', function () {
                        refresh();
                        reloadOpener();
                    });
                });
            });
        }

        refresh();
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

    // The settings page default is viewport dependent (13px on phones); the
    // literal mirrors js/font-size-settings.js for the rare load order where
    // that file has not defined its helper yet.
    function settingsFontSizeFallback() {
        if (typeof window.settingsFontSizeDefault === 'function') {
            return window.settingsFontSizeDefault();
        }
        return (typeof isMobileDevice === 'function' && isMobileDevice()) ? '13' : '15';
    }

    function refreshFontSizeBadge() {
        var fontBadges = [
            { id: 'font-size-badge', key: 'note_font_size', default: '15', i18nKey: 'display.badges.note_font_size', fallback: '' },
            { id: 'sidebar-font-size-badge', key: 'sidebar_font_size', default: '13', i18nKey: 'display.badges.sidebar_font_size', fallback: '' },
            { id: 'code-block-font-size-badge', key: 'code_block_font_size', default: '15', i18nKey: 'display.badges.code_block_font_size', fallback: '' },
            { id: 'settings-font-size-badge', key: 'settings_font_size', default: settingsFontSizeFallback(), i18nKey: 'display.badges.settings_font_size', fallback: '' }
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

    function getMarkdownFontLabel(fontKey) {
        var labels = {
            inherit: tr('modals.markdown_font.options.inherit', {}, 'App font (default)'),
            monospace: tr('modals.markdown_font.options.monospace', {}, 'System monospace'),
            courier: 'Courier New',
            consolas: 'Consolas',
            menlo: 'Menlo',
            monaco: 'Monaco',
            jetbrains: 'JetBrains Mono',
            cascadia: 'Cascadia Code',
            fira: 'Fira Code',
            sourcecodepro: 'Source Code Pro',
            ubuntumono: 'Ubuntu Mono'
        };
        return labels[fontKey] || labels.inherit;
    }

    // Probe which markdown-editor fonts exist on this device. Only the first
    // name of each stack is tested: the rest are fallbacks that would make an
    // absent font look available. 'inherit' is the default and 'monospace' is
    // a generic family, so both always resolve.
    var markdownFontAvailability = null;
    var MARKDOWN_FONT_ALWAYS_AVAILABLE = { monospace: true, inherit: true };
    function probeMarkdownFonts(callback) {
        if (markdownFontAvailability) { callback(markdownFontAvailability); return; }

        var fonts = window.__poznoteEditorFonts || {};
        var keys = Object.keys(fonts).filter(function (key) {
            return !MARKDOWN_FONT_ALWAYS_AVAILABLE[key];
        });
        var result = {};
        Object.keys(MARKDOWN_FONT_ALWAYS_AVAILABLE).forEach(function (key) { result[key] = true; });

        if (typeof window.FontFace !== 'function' || keys.length === 0) {
            keys.forEach(function (key) { result[key] = true; });
            markdownFontAvailability = result;
            callback(result);
            return;
        }

        var pending = keys.length;
        function done() {
            pending--;
            if (pending === 0) {
                markdownFontAvailability = result;
                callback(result);
            }
        }
        keys.forEach(function (key) {
            // First entry of the stack, minus any surrounding quotes.
            var primary = fonts[key].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
            try {
                new FontFace('__poznote-md-font-probe-' + key, "local('" + primary + "')").load().then(
                    function () { result[key] = true; done(); },
                    function () { result[key] = false; done(); }
                );
            } catch (e) {
                result[key] = true;
                done();
            }
        });
    }

    function refreshMarkdownFontBadge() {
        var badge = document.getElementById('markdown-font-badge');
        if (badge) {
            var font = (window.__poznoteUserStorage || localStorage).getItem('markdown_font') || 'inherit';
            badge.textContent = getMarkdownFontLabel(font);
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

    // center_note_content: a percentage of the note column ('60%'), '0' for
    // full width, or legacy values ('1'/'true' = 800px, bare pixel number).
    function refreshNoteWidthBadge() {
        getSetting('center_note_content', function (value) {
            var badge = document.getElementById('note-width-badge');
            if (badge) {
                value = (value === null || value === undefined) ? '' : String(value).trim();
                if (value === '0' || value === 'false' || value === '' || value === '100%') {
                    badge.textContent = tr('modals.note_width.full_width', {}, 'Full Width');
                } else if (/^\d+%$/.test(value)) {
                    badge.textContent = value;
                } else {
                    var width = value;
                    if (width === '1' || width === 'true') width = '800';
                    badge.textContent = width + 'px';
                }
                badge.className = 'setting-status enabled';
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
                case 'manual':
                    sortLabel = tr('modals.note_sort.options.manual', {}, 'Manual (drag and drop)');
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

    // --- Note color palette editor ---
    //
    // The palette is stored as JSON under 'note_color_palette'. An empty stored
    // value means "use the factory palette", which is what Reset writes back.

    var paletteDraft = [];

    function defaultPalette() {
        return Array.isArray(window.NOTE_COLOR_DEFAULT_PALETTE)
            ? JSON.parse(JSON.stringify(window.NOTE_COLOR_DEFAULT_PALETTE))
            : [];
    }

    // Show built-in colors in the current language unless the user renamed
    // them: a stored name that matches any shipped translation of that color
    // was never edited, it was just saved under another language.
    function localizePalette(palette) {
        var localized = window.NOTE_COLOR_LOCALIZED_NAMES || {};
        var known = window.NOTE_COLOR_KNOWN_NAMES || {};
        palette.forEach(function (entry) {
            var names = known[entry.id];
            if (!names) return;
            if (names.indexOf(String(entry.name || '').toLowerCase()) !== -1) {
                entry.name = localized[entry.id] || entry.name;
            }
        });
        return palette;
    }

    function parsePalette(value) {
        if (!value) return defaultPalette();
        try {
            var parsed = typeof value === 'string' ? JSON.parse(value) : value;
            return Array.isArray(parsed) && parsed.length ? localizePalette(parsed) : defaultPalette();
        } catch (e) {
            return defaultPalette();
        }
    }

    function refreshNoteColorPaletteBadge() {
        getSetting('note_color_palette', function (value) {
            var badge = document.getElementById('note-color-palette-badge');
            if (!badge) return;
            var count = parsePalette(value).length;
            badge.textContent = tr('modals.note_color_palette.count', { count: count }, count + ' colors');
            badge.className = 'setting-status enabled';
        });
    }

    // Derive a stable id from the color name so notes keep their color when the
    // palette is edited. Existing entries keep the id they were saved with.
    function paletteIdFromName(name, index) {
        var id = String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        return id || ('color' + (index + 1));
    }

    function renderPaletteEditor() {
        var list = document.getElementById('noteColorPaletteList');
        if (!list) return;
        list.innerHTML = '';

        paletteDraft.forEach(function (entry, index) {
            var row = document.createElement('div');
            row.className = 'note-palette-row';

            var colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = entry.hex || '#3b82f6';
            colorInput.className = 'note-palette-color';
            colorInput.addEventListener('input', function () {
                paletteDraft[index].hex = colorInput.value;
            });

            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = entry.name || '';
            nameInput.maxLength = 40;
            nameInput.className = 'note-palette-name';
            nameInput.placeholder = tr('modals.note_color_palette.name_placeholder', {}, 'Color name');
            nameInput.addEventListener('input', function () {
                paletteDraft[index].name = nameInput.value;
            });

            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'note-palette-remove';
            removeBtn.title = tr('modals.note_color_palette.remove', {}, 'Remove');
            removeBtn.innerHTML = '<i class="lucide lucide-trash-2"></i>';
            removeBtn.addEventListener('click', function () {
                paletteDraft.splice(index, 1);
                renderPaletteEditor();
            });

            row.appendChild(colorInput);
            row.appendChild(nameInput);
            row.appendChild(removeBtn);
            list.appendChild(row);
        });
    }

    function openNoteColorPaletteModal() {
        var modal = document.getElementById('noteColorPaletteModal');
        if (!modal) return;
        getSetting('note_color_palette', function (value) {
            paletteDraft = parsePalette(value);
            renderPaletteEditor();
            modal.style.display = 'flex';
        });
    }

    function saveNoteColorPalette() {
        var cleaned = [];
        var usedIds = {};

        paletteDraft.forEach(function (entry, index) {
            var hex = String(entry.hex || '').trim();
            if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return;

            var name = String(entry.name || '').trim();
            // Keep the original id when the entry already had one, so notes
            // already using it stay colored.
            var id = entry.id ? String(entry.id) : paletteIdFromName(name, index);
            id = id.toLowerCase().replace(/[^a-z0-9_-]/g, '') || ('color' + (index + 1));
            while (usedIds[id]) { id = id + '-' + (index + 1); }
            usedIds[id] = true;

            cleaned.push({ id: id, name: name || id, hex: hex.toLowerCase() });
        });

        if (!cleaned.length) {
            var emptyMsg = tr('modals.note_color_palette.empty_error', {}, 'Add at least one color, or reset to defaults.');
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(emptyMsg, 'error');
            } else {
                alert(emptyMsg);
            }
            return;
        }

        setSetting('note_color_palette', JSON.stringify(cleaned), function (success) {
            if (success) {
                try { closeModal('noteColorPaletteModal'); } catch (e) {
                    console.debug('settings-page: saveNoteColorPalette() failed:', e);
                }
                refreshNoteColorPaletteBadge();
            }
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

    var SNAPSHOTS_DEFAULT_COUNT = 3;
    var SNAPSHOTS_MAX_COUNT = 30;

    function getSnapshotsKeepCount(value) {
        var count = parseInt(value, 10);
        return (count >= 1 && count <= SNAPSHOTS_MAX_COUNT) ? count : SNAPSHOTS_DEFAULT_COUNT;
    }

    function refreshSnapshotsBadge() {
        getSetting('snapshots_keep_count', function (value) {
            var badge = document.getElementById('snapshots-badge');
            if (!badge) return;

            var count = getSnapshotsKeepCount(value);
            badge.textContent = tr('modals.snapshots.badge', { count: count }, count + ' automatic per note');
            badge.className = 'setting-status enabled';
        });
    }

    function openSnapshotsSettingsModal() {
        var modal = document.getElementById('snapshotsSettingsModal');
        if (!modal) return;
        getSetting('snapshots_keep_count', function (value) {
            var input = document.getElementById('snapshotsKeepCountInput');
            if (input) input.value = String(getSnapshotsKeepCount(value));
            modal.style.display = 'flex';
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

    function refreshDiaryNoteTypeBadge() {
        getSetting('diary_default_note_type', function (value) {
            var badge = document.getElementById('diary-note-type-badge');
            if (!badge) return;

            var isMarkdown = value === 'markdown';

            badge.textContent = isMarkdown
                ? tr('modals.create.markdown.title', {}, 'Markdown Note')
                : tr('modals.create.note.title', {}, 'Note');
            badge.className = 'setting-status enabled';

            var card = document.getElementById('diary-note-type-card');
            if (card) {
                var icon = card.querySelector('.home-card-icon i');
                if (icon) {
                    icon.classList.toggle('lucide-file-code', isMarkdown);
                    icon.classList.toggle('lucide-book-open', !isMarkdown);
                }
            }
        });
    }

    // Diary entry title formats; must mirror getDiaryDateFormats() in functions.php.
    var DIARY_DATE_FORMATS = ['ymd', 'dmy_slash', 'mdy_slash', 'dmy_dot', 'ymd_slash'];

    function isCustomDiaryDateFormat(value) {
        return typeof value === 'string' && value.indexOf('custom:') === 0;
    }

    function getCustomDiaryDatePattern(value) {
        return String(value || '').slice(7).trim();
    }

    /**
     * Mirrors compileDiaryDateCustomFormat() in functions.php: a diary title has
     * to be parseable back into a day, so a pattern needs a year, a month and a
     * day, each at most once.
     */
    function isValidCustomDiaryDateFormat(pattern) {
        var value = String(pattern || '').trim();
        if (value === '' || value.length > 80) return false;
        if (!/^[A-Za-z0-9\s\/.,_\-()]+$/.test(value)) return false;

        // Longest token first, matching the PHP compiler's greedy scan.
        var tokens = [['YYYY','y'], ['YY','y'], ['MMMM','m'], ['MMM','m'], ['MM','m'], ['DD','d']];
        var seen = {};
        for (var i = 0; i < value.length; i++) {
            for (var t = 0; t < tokens.length; t++) {
                var token = tokens[t][0], part = tokens[t][1];
                if (value.substr(i, token.length) === token) {
                    if (seen[part]) return false;
                    seen[part] = true;
                    i += token.length - 1;
                    break;
                }
            }
        }
        return !!(seen.y && seen.m && seen.d);
    }

    function normalizeDiaryDateFormat(value) {
        var format = String(value || '').trim();
        if (isCustomDiaryDateFormat(format)
            && isValidCustomDiaryDateFormat(getCustomDiaryDatePattern(format))) {
            return format;
        }
        return DIARY_DATE_FORMATS.indexOf(format) !== -1 ? format : 'ymd';
    }

    function getDiaryDateFormatLabel(format) {
        var normalized = normalizeDiaryDateFormat(format);
        if (isCustomDiaryDateFormat(normalized)) {
            return getCustomDiaryDatePattern(normalized);
        }

        switch (normalized) {
            case 'dmy_slash':
                return tr('modals.diary_date_format.options.dmy_slash', {}, 'DD/MM/YYYY');
            case 'mdy_slash':
                return tr('modals.diary_date_format.options.mdy_slash', {}, 'MM/DD/YYYY');
            case 'dmy_dot':
                return tr('modals.diary_date_format.options.dmy_dot', {}, 'DD.MM.YYYY');
            case 'ymd_slash':
                return tr('modals.diary_date_format.options.ymd_slash', {}, 'YYYY/MM/DD');
            case 'ymd':
            default:
                return tr('modals.diary_date_format.options.ymd', {}, 'YYYY-MM-DD');
        }
    }

    function refreshDiaryDateFormatBadge() {
        getSetting('diary_date_format', function (value) {
            var badge = document.getElementById('diary-date-format-badge');
            if (!badge) return;

            badge.textContent = getDiaryDateFormatLabel(value);
            badge.className = 'setting-status enabled';
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

    function getMarkdownDefaultViewModeLabel(mode) {
        switch (mode) {
            case 'edit':
                return tr('modals.markdown_default_view_mode.options.edit', {}, 'Edit');
            case 'split':
                return tr('modals.markdown_default_view_mode.options.split_short', {}, 'Split');
            case 'last':
                return tr('modals.markdown_default_view_mode.options.last', {}, 'Last used mode');
            default:
                return tr('modals.markdown_default_view_mode.options.preview', {}, 'Preview');
        }
    }

    function normalizeMarkdownDefaultViewMode(value) {
        return ['preview', 'edit', 'split', 'last'].indexOf(value) !== -1 ? value : 'preview';
    }

    function refreshMarkdownDefaultViewModeBadge() {
        getSetting('markdown_default_view_mode', function (value) {
            var badge = document.getElementById('markdown-default-view-mode-badge');
            if (!badge) return;

            var mode = normalizeMarkdownDefaultViewMode(value);
            badge.textContent = getMarkdownDefaultViewModeLabel(mode);
            badge.className = 'setting-status enabled';

            var card = document.getElementById('markdown-default-view-mode-card');
            if (card) {
                var icon = card.querySelector('.home-card-icon i');
                if (icon) {
                    icon.classList.toggle('lucide-book-open', mode === 'preview');
                    icon.classList.toggle('lucide-pencil', mode === 'edit');
                    icon.classList.toggle('lucide-columns-2', mode === 'split');
                    icon.classList.toggle('lucide-history', mode === 'last');
                }
            }
        });
    }

    function openMarkdownDefaultViewModeModal() {
        var modal = document.getElementById('markdownDefaultViewModeModal');
        if (!modal) return;

        getSetting('markdown_default_view_mode', function (value) {
            var currentValue = normalizeMarkdownDefaultViewMode(value);
            var radios = document.getElementsByName('markdownDefaultViewMode');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === currentValue);
            }
            modal.style.display = 'flex';
        });
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

    /**
     * The card shows the raw quota values only, comma-separated and in the
     * same order as the fields of the modal behind it (notes, local storage,
     * S3 attachments, S3 backups). 0 means no limit and renders as "∞".
     * Badges whose S3 feature is disabled are not in the DOM, so they are
     * skipped and the list closes up.
     */
    function refreshUserQuotasBadges() {
        var badge = document.getElementById('user-quotas-badge');
        if (!badge) return;

        var pools = [
            { key: 'user_max_notes', shown: true },
            { key: 'user_max_storage_mb', shown: true },
            { key: 'user_max_storage_s3_mb', shown: !!badge.dataset.s3Attachments },
            { key: 'user_max_backups_s3_mb', shown: !!badge.dataset.s3Backups }
        ].filter(function (pool) { return pool.shown; });

        var values = new Array(pools.length);
        var pending = pools.length;

        pools.forEach(function (pool, index) {
            getSetting(pool.key, function (value) {
                var count = parseInt(value, 10) || 0;
                values[index] = count > 0 ? String(count) : '∞';
                if (--pending > 0) return;

                badge.textContent = values.join(', ');
                // "Enabled" here means at least one pool is actually capped
                var anyLimited = values.some(function (v) { return v !== '∞'; });
                badge.className = 'setting-status ' + (anyLimited ? 'enabled' : 'disabled');
            });
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
            var card = document.getElementById('git-sync-enabled-card');
            if (card) card.setAttribute('aria-checked', enabled ? 'true' : 'false');
        });
    }

    function refreshExecutableAttachmentsBadge() {
        var badge = document.getElementById('executable-attachments-status');
        if (!badge) return;

        var txt = getTranslations();
        getSetting('allow_executable_attachments', function (value) {
            var enabled = value === '1' || value === 'true';
            badge.textContent = enabled ? txt.enabled : txt.disabled;
            badge.className = 'setting-status ' + (enabled ? 'enabled' : 'disabled');
            var card = document.getElementById('executable-attachments-card');
            if (card) card.setAttribute('aria-checked', enabled ? 'true' : 'false');
        });
    }

    // Blocked tenant isolation features, with the legacy fallback: instances
    // configured before the feature list existed only had the on/off
    // tenant_isolation flag, which meant user_sharing.
    function getTenantIsolationFeatures(callback) {
        getSetting('tenant_isolation_features', function (rawFeatures) {
            if (rawFeatures && rawFeatures.trim() !== '') {
                var features = [];
                try { features = JSON.parse(rawFeatures); } catch (e) { features = []; }
                callback(Array.isArray(features) ? features : []);
                return;
            }

            getSetting('tenant_isolation', function (rawLegacy) {
                var legacyOn = rawLegacy === '1' || rawLegacy === 'true';
                callback(legacyOn ? ['user_sharing'] : []);
            });
        });
    }

    function refreshTenantIsolationBadge() {
        var badge = document.getElementById('tenant-isolation-status');
        if (!badge) return;

        var txt = getTranslations();
        getTenantIsolationFeatures(function (features) {
            var enabled = features.length > 0;
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
            .catch(function (e) {
                // Keep the server-rendered status if the refresh request fails.
                console.debug('settings-page: refreshGitSyncCardBadge() failed:', e);
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

    function showTenantIsolationModal() {
        var modal = document.getElementById('tenantIsolationModal');
        if (!modal) return;

        getTenantIsolationFeatures(function (features) {
            modal.querySelectorAll('[data-tenant-feature]').forEach(function (checkbox) {
                checkbox.checked = features.indexOf(checkbox.getAttribute('data-tenant-feature')) !== -1;
            });
            modal.style.display = 'flex';
        });
    }

    function showUserQuotasModal() {
        var modal = document.getElementById('userQuotasModal');
        var notesInput = document.getElementById('userMaxNotesInput');
        var storageInput = document.getElementById('userMaxStorageInput');
        var storageS3Input = document.getElementById('userMaxStorageS3Input');
        var backupsS3Input = document.getElementById('userMaxBackupsS3Input');
        if (!modal || !notesInput || !storageInput) return;

        // Each optional field is only present when its S3 feature is enabled,
        // so fill what exists and open once the last one has loaded.
        function openWithBackups() {
            if (!backupsS3Input) {
                modal.style.display = 'flex';
                return;
            }
            getSetting('user_max_backups_s3_mb', function (backupsS3Value) {
                backupsS3Input.value = String(parseInt(backupsS3Value, 10) || 0);
                modal.style.display = 'flex';
            });
        }

        getSetting('user_max_notes', function (notesValue) {
            notesInput.value = String(parseInt(notesValue, 10) || 0);
            getSetting('user_max_storage_mb', function (storageValue) {
                storageInput.value = String(parseInt(storageValue, 10) || 0);
                if (!storageS3Input) {
                    openWithBackups();
                    return;
                }
                getSetting('user_max_storage_s3_mb', function (storageS3Value) {
                    storageS3Input.value = String(parseInt(storageS3Value, 10) || 0);
                    openWithBackups();
                });
            });
        });
    }

    // ========== Modal Functions ==========

    // The custom CSS modal lists every theme stored in data/css/ and applies the
    // selected one on save. An upload is staged the same way, so the file only
    // reaches the server when the admin confirms.
    var pendingCssFile = null;
    var pendingCssFileName = '';
    var customCssThemes = [];
    var customCssSelected = '';
    var customCssActive = '';
    // The theme list modal works on rows rather than on the saved entries: the
    // order of the rows IS the order the rail's button walks, so a row keeps its
    // place whether it is ticked or not.
    var customCssBuiltinThemes = [];
    var customCssThemeIcon = 'lucide-palette';
    var themeListRows = [];
    var themeListSaved = '';
    var customCssThemeSaved = [];

    // Mirrors the sanitisation api_upload_css.php applies, so the staged row
    // shows the name the file will actually be stored under.
    function customCssStoredName(name) {
        var base = String(name || '').replace(/\.[^.]*$/, '');
        base = base.replace(/[^A-Za-z0-9._-]/g, '_').substring(0, 60);
        return (base !== '' ? base : 'custom') + '.css';
    }

    function customCssFormatSize(bytes) {
        var size = parseInt(bytes, 10);
        if (isNaN(size) || size < 0) return '';
        if (size < 1024) return size + ' B';
        return Math.round(size / 1024) + ' KB';
    }

    function buildCustomCssRow(options) {
        // The row is a div and not a label: a delete button nested in a label
        // would also toggle the radio it wraps.
        var row = document.createElement('div');
        row.className = 'custom-css-theme';
        if (options.selected) row.classList.add('selected');

        var main = document.createElement('label');
        main.className = 'custom-css-theme-main';

        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'customCssTheme';
        radio.value = options.value;
        radio.checked = !!options.selected;
        radio.addEventListener('change', function () {
            customCssSelected = options.value;
            renderCustomCssThemes();
        });
        main.appendChild(radio);

        var body = document.createElement('span');
        body.className = 'custom-css-theme-body';

        var name = document.createElement('span');
        name.className = 'custom-css-theme-name';
        name.textContent = options.label;
        body.appendChild(name);

        if (options.meta) {
            var meta = document.createElement('span');
            meta.className = 'custom-css-theme-meta';
            meta.textContent = options.meta;
            body.appendChild(meta);
        }
        main.appendChild(body);
        row.appendChild(main);

        if (options.deletable) {
            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'custom-css-theme-delete';
            del.title = tr('common.delete', {}, 'Delete');
            del.setAttribute('aria-label', tr('common.delete', {}, 'Delete'));
            del.innerHTML = '<i class="lucide lucide-trash-2"></i>';
            del.addEventListener('click', function () {
                deleteCustomCssTheme(options.value);
            });
            row.appendChild(del);
        }

        return row;
    }

    function renderCustomCssThemes() {
        var list = document.getElementById('customCssThemeList');
        var noFile = document.getElementById('customCssNoFile');
        if (!list) return;

        list.innerHTML = '';

        if (noFile) {
            noFile.style.display = (customCssThemes.length === 0 && !pendingCssFile) ? 'block' : 'none';
        }

        list.appendChild(buildCustomCssRow({
            value: '',
            label: tr('modals.custom_css.none', {}, 'No custom CSS'),
            selected: customCssSelected === '',
            deletable: false
        }));

        customCssThemes.forEach(function (theme) {
            var meta = customCssFormatSize(theme.size);
            if (theme.filename === customCssActive) {
                meta = meta ? meta + ' - ' + tr('modals.custom_css.active', {}, 'Applied') : tr('modals.custom_css.active', {}, 'Applied');
            }
            list.appendChild(buildCustomCssRow({
                value: theme.filename,
                label: theme.filename,
                meta: meta,
                selected: customCssSelected === theme.filename,
                deletable: true
            }));
        });

        if (pendingCssFile) {
            var known = customCssThemes.some(function (theme) { return theme.filename === pendingCssFileName; });
            list.appendChild(buildCustomCssRow({
                value: pendingCssFileName,
                label: pendingCssFileName,
                meta: known
                    ? tr('modals.custom_css.pending_replace', {}, 'Replaced on save')
                    : tr('modals.custom_css.pending_upload', {}, 'Uploaded on save'),
                selected: customCssSelected === pendingCssFileName,
                deletable: false
            }));
        }
    }

    // Everything the modal shows comes from one payload, so a save that answers
    // with the new state refreshes both lists without a second request.
    function readCustomCssState(data) {
        customCssThemes = Array.isArray(data.themes) ? data.themes : [];
        customCssActive = data.active || '';
        customCssBuiltinThemes = Array.isArray(data.builtin_themes) ? data.builtin_themes : [];
        customCssThemeIcon = data.custom_theme_icon || 'lucide-palette';
        var list = data.theme_list && Array.isArray(data.theme_list.entries) ? data.theme_list.entries : [];
        customCssThemeSaved = list.map(function (entry) {
            return { id: entry.id, mode: entry.mode === 'dark' ? 'dark' : 'light' };
        });
        themeListSaved = JSON.stringify(themeListEntriesOf(buildThemeListRows()));
    }

    function customCssThemeIdFor(filename) {
        return 'custom:' + filename;
    }

    function findSavedThemeEntry(id) {
        for (var i = 0; i < customCssThemeSaved.length; i++) {
            if (customCssThemeSaved[i].id === id) return customCssThemeSaved[i];
        }
        return null;
    }

    function themeChoiceLabel(id) {
        return tr('theme.names.' + id, {}, id.charAt(0).toUpperCase() + id.slice(1));
    }

    /**
     * One row per theme this instance has: what the admin kept first, in the
     * order it was saved, then everything left over. Rebuilding it this way is
     * what makes a reordering survive a reopen, and what puts a freshly
     * uploaded stylesheet at the end rather than in the middle.
     */
    function buildThemeListRows() {
        var known = {};
        var rows = [];

        var rowFor = function (id) {
            if (known[id]) return null;
            var saved = findSavedThemeEntry(id);
            var file = id.indexOf('custom:') === 0 ? id.slice('custom:'.length) : '';
            var builtin = null;
            for (var i = 0; i < customCssBuiltinThemes.length; i++) {
                if (customCssBuiltinThemes[i].id === id) { builtin = customCssBuiltinThemes[i]; break; }
            }
            if (!file && !builtin) return null;
            known[id] = true;
            return {
                id: id,
                custom: !!file,
                icon: builtin ? builtin.icon : customCssThemeIcon,
                label: builtin ? themeChoiceLabel(id) : file.replace(/\.css$/i, ''),
                checked: !!saved,
                mode: saved && saved.mode === 'dark' ? 'dark' : 'light'
            };
        };

        var push = function (id) {
            var row = rowFor(id);
            if (row) rows.push(row);
        };

        customCssThemeSaved.forEach(function (entry) { push(entry.id); });
        customCssBuiltinThemes.forEach(function (def) { push(def.id); });
        storedCssFileNames().forEach(function (filename) { push(customCssThemeIdFor(filename)); });

        return rows;
    }

    /** The stored stylesheets, plus the one staged for upload. */
    function storedCssFileNames() {
        var files = customCssThemes.map(function (theme) { return theme.filename; });
        if (pendingCssFile && files.indexOf(pendingCssFileName) === -1) {
            files.push(pendingCssFileName);
        }
        return files;
    }

    /** What gets saved: the ticked rows, in the order they are shown. */
    function themeListEntriesOf(rows) {
        var entries = [];
        rows.forEach(function (row) {
            if (!row.checked) return;
            var entry = { id: row.id };
            if (row.custom) entry.mode = row.mode;
            entries.push(entry);
        });
        return entries;
    }

    function moveThemeListRow(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= themeListRows.length) return;
        var row = themeListRows[index];
        themeListRows[index] = themeListRows[target];
        themeListRows[target] = row;
        renderThemeListChoices();
    }

    function buildThemeChoiceRow(row, index) {
        var el = document.createElement('div');
        el.className = 'custom-css-theme-choice';
        el.setAttribute('data-theme-id', row.id);
        if (row.checked) el.classList.add('selected');

        var main = document.createElement('label');
        main.className = 'custom-css-theme-choice-main';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = row.checked;
        checkbox.addEventListener('change', function () {
            row.checked = checkbox.checked;
            el.classList.toggle('selected', row.checked);
        });
        main.appendChild(checkbox);

        var icon = document.createElement('i');
        icon.className = 'lucide ' + row.icon;
        main.appendChild(icon);

        var name = document.createElement('span');
        name.className = 'custom-css-theme-choice-name';
        name.textContent = row.label;
        main.appendChild(name);
        el.appendChild(main);

        if (row.custom) {
            // A stylesheet paints over one of the two modes, and which one it
            // was written for cannot be read from the file: the admin says it.
            var select = document.createElement('select');
            select.className = 'custom-css-theme-choice-mode';
            select.title = tr('modals.theme_list.mode_help', {}, 'Is this stylesheet written for the light mode or the dark mode?');
            [['light', themeChoiceLabel('light')], ['dark', themeChoiceLabel('dark')]].forEach(function (pair) {
                var option = document.createElement('option');
                option.value = pair[0];
                option.textContent = pair[1];
                select.appendChild(option);
            });
            select.value = row.mode;
            select.addEventListener('change', function () {
                row.mode = select.value === 'dark' ? 'dark' : 'light';
            });
            el.appendChild(select);
        }

        var order = document.createElement('span');
        order.className = 'custom-css-theme-order';
        [['up', -1, 'lucide-chevron-up'], ['down', 1, 'lucide-chevron-down']].forEach(function (spec) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'custom-css-theme-order-btn';
            button.title = spec[0] === 'up'
                ? tr('modals.theme_list.move_up', {}, 'Move up')
                : tr('modals.theme_list.move_down', {}, 'Move down');
            button.setAttribute('aria-label', button.title);
            button.innerHTML = '<i class="lucide ' + spec[2] + '"></i>';
            button.disabled = spec[1] < 0 ? index === 0 : index === themeListRows.length - 1;
            button.addEventListener('click', function () { moveThemeListRow(index, spec[1]); });
            order.appendChild(button);
        });
        el.appendChild(order);

        return el;
    }

    function renderThemeListChoices() {
        var box = document.getElementById('themeListChoices');
        if (!box) return;

        box.innerHTML = '';
        themeListRows.forEach(function (row, index) {
            box.appendChild(buildThemeChoiceRow(row, index));
        });
    }

    function showThemeListModal() {
        var modal = document.getElementById('themeListModal');
        if (!modal) return;

        loadCustomCssThemes(function () {
            themeListRows = buildThemeListRows();
            renderThemeListChoices();
            modal.style.display = 'flex';
        });
    }

    // js/theme-manager.js calls this when the rail's button has a single theme
    // to offer, so the click opens the list instead of doing nothing.
    window.poznoteOpenThemeListModal = function () {
        if (!window.__poznoteThemeListEditable) return;
        showThemeListModal();
    };

    function refreshThemeListBadge() {
        var badge = document.getElementById('theme-list-badge');
        if (!badge) return;

        fetch('api_upload_css.php', { method: 'GET', credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var count = data.theme_list && Array.isArray(data.theme_list.entries)
                    ? data.theme_list.entries.length
                    : 0;
                badge.textContent = count === 1
                    ? tr('modals.theme_list.badge_one', {}, '1 theme')
                    : tr('modals.theme_list.badge_other', { count: count }, count + ' themes');
                badge.className = 'setting-status enabled';
            })
            .catch(function () {
                badge.textContent = tr('common.error', {}, 'Error');
                badge.className = 'setting-status disabled';
            });
    }

    function loadCustomCssThemes(callback) {
        fetch('api_upload_css.php', { method: 'GET', credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                readCustomCssState(data);
                if (typeof callback === 'function') callback(true);
            })
            .catch(function () {
                customCssThemes = [];
                customCssActive = '';
                customCssThemeSaved = [];
                themeListSaved = '';
                if (typeof callback === 'function') callback(false);
            });
    }

    function deleteCustomCssTheme(filename) {
        var message = tr('modals.custom_css.delete_confirm', { name: filename },
            'Delete ' + filename + '? The file is removed from your data volume.');
        var run = function () {
            fetch('api_upload_css.php?filename=' + encodeURIComponent(filename), {
                method: 'DELETE',
                credentials: 'same-origin'
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data.success) {
                        alert(data.error || tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        return;
                    }
                    var wasApplied = filename === customCssActive;
                    readCustomCssState(data);
                    if (customCssSelected === filename) customCssSelected = customCssActive;
                    if (pendingCssFile && pendingCssFileName === filename) {
                        // The staged upload no longer replaces anything, it is still staged.
                        customCssSelected = pendingCssFileName;
                    }
                    renderCustomCssThemes();
                    refreshCustomCssBadge();
                    refreshThemeListBadge();
                    if (wasApplied) reloadOpener();
                })
                .catch(function () {
                    alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                });
        };

        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(message, tr('modals.custom_css.title', {}, 'Custom CSS'))
                .then(function (confirmed) { if (confirmed) run(); });
        } else if (window.confirm(message)) {
            run();
        }
    }

    function showCustomCssModal() {
        var modal = document.getElementById('customCssModal');
        if (!modal) return;

        pendingCssFile = null;
        pendingCssFileName = '';
        var fileInput = document.getElementById('customCssFileInput');
        if (fileInput) fileInput.value = '';

        loadCustomCssThemes(function () {
            customCssSelected = customCssActive;
            renderCustomCssThemes();
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

    var MARKDOWN_COLORED_DEFAULTS = {
        h1: '#007db8',
        h2: '#1a7f37',
        h3: '#8250df',
        h4: '#bf3989',
        h5: '#1b7c83',
        h6: '#656d76',
        code: '#b34e00',
        codeblock: '#b34e00',
        quote: '#007db8',
        table: '#007db8',
        hr: '#007db8'
    };

    // Values saved before per-level heading colors existed used a single
    // 'heading' color and had no code block background.
    function markdownColoredStoredColor(parsed, el) {
        var isColor = function (v) { return /^#[0-9a-fA-F]{6}$/.test(v || ''); };
        if (!parsed) return null;
        if (isColor(parsed[el])) return parsed[el];
        if (/^h[1-6]$/.test(el) && isColor(parsed.heading)) return parsed.heading;
        if (el === 'codeblock' && isColor(parsed.code)) return parsed.code;
        return null;
    }

    function normalizeMarkdownColoredTheme(value) {
        var v = (value || '').trim();
        if (v === '' || v === '0' || v === 'false') return '0';
        return 'custom';
    }

    function markdownColoredThemeLabel(theme) {
        return theme === 'custom'
            ? tr('modals.markdown_colored.options.custom', {}, 'Custom')
            : tr('common.disabled', {}, 'Disabled');
    }

    function refreshMarkdownColoredBadge() {
        getSetting('markdown_colored', function (value) {
            var badge = document.getElementById('markdown-colored-status');
            if (!badge) return;
            var theme = normalizeMarkdownColoredTheme(value);
            badge.textContent = markdownColoredThemeLabel(theme);
            badge.className = 'setting-status ' + (theme === '0' ? 'disabled' : 'enabled');
        });
    }

    function updateMarkdownColoredCustomRow() {
        var row = document.getElementById('markdownColoredCustomRow');
        if (!row) return;
        var radios = document.getElementsByName('markdownColoredTheme');
        var isCustom = false;
        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked && radios[i].value === 'custom') { isCustom = true; break; }
        }
        row.classList.toggle('visible', isCustom);
    }

    function openMarkdownColoredModal() {
        var modal = document.getElementById('markdownColoredModal');
        if (!modal) return;
        getSetting('markdown_colored', function (value) {
            var theme = normalizeMarkdownColoredTheme(value);
            var radios = document.getElementsByName('markdownColoredTheme');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === theme);
            }
            getSetting('markdown_colored_custom', function (customValue) {
                var parsed = null;
                try { parsed = JSON.parse(customValue || ''); } catch (e) {
                    console.debug('settings-page: openMarkdownColoredModal() failed:', e);
                }
                var inputs = document.querySelectorAll('#markdownColoredCustomRow input[data-mdc-element]');
                inputs.forEach(function (input) {
                    var el = input.getAttribute('data-mdc-element');
                    input.value = markdownColoredStoredColor(parsed, el) || MARKDOWN_COLORED_DEFAULTS[el];
                });
                updateMarkdownColoredCustomRow();
                modal.style.display = 'flex';
            });
        });
    }

    // Highlight current folder tree: the card opens a modal where the dim
    // strength is a slider, and 'Turn off' is how the feature is disabled.
    // Kept in sync with POZNOTE_FOLDER_TREE_DIM_* in functions.php.
    var FOLDER_TREE_DIM_DEFAULT = 35;
    var FOLDER_TREE_DIM_MIN = 10;
    var FOLDER_TREE_DIM_MAX = 90;

    function folderTreeDimLevel(value) {
        var level = parseInt(value, 10);
        if (isNaN(level) || level < FOLDER_TREE_DIM_MIN || level > FOLDER_TREE_DIM_MAX) {
            return FOLDER_TREE_DIM_DEFAULT;
        }
        return level;
    }

    function updateFolderTreeDimPreview(level) {
        var valueLabel = document.getElementById('folderTreeDimValue');
        if (valueLabel) valueLabel.textContent = String(level);

        var preview = document.getElementById('folderTreeDimPreview');
        if (preview) {
            preview.style.setProperty('--folder-tree-dim-opacity', String((100 - level) / 100));
        }
    }

    function refreshFolderTreeHighlightBadge() {
        var txt = getTranslations();
        getSetting('highlight_current_folder_tree', function (value) {
            var badge = document.getElementById('folder-tree-highlight-status');
            if (!badge) return;

            var enabled = isSettingEnabled(value, false, false);
            if (!enabled) {
                badge.textContent = txt.disabled;
                badge.className = 'setting-status disabled';
                return;
            }

            getSetting('folder_tree_dim_level', function (level) {
                badge.textContent = folderTreeDimLevel(level) + '%';
                badge.className = 'setting-status enabled';
            });
        });
    }

    function openFolderTreeHighlightModal() {
        var modal = document.getElementById('folderTreeHighlightModal');
        if (!modal) return;

        getSetting('folder_tree_dim_level', function (value) {
            var level = folderTreeDimLevel(value);
            var slider = document.getElementById('folderTreeDimInput');
            if (slider) slider.value = String(level);
            updateFolderTreeDimPreview(level);
            modal.style.display = 'flex';
        });
    }

    // Saving turns the feature on: the slider is the only way to reach it, and
    // a user who dragged it meant to see the result.
    function saveFolderTreeHighlight() {
        var slider = document.getElementById('folderTreeDimInput');
        var level = folderTreeDimLevel(slider ? slider.value : null);

        setSetting('folder_tree_dim_level', String(level), function (levelSaved) {
            if (!levelSaved) {
                alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                return;
            }

            setSetting('highlight_current_folder_tree', '1', function (enabledSaved) {
                if (!enabledSaved) {
                    alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    return;
                }

                try { closeModal('folderTreeHighlightModal'); } catch (e) {
                    console.debug('settings-page: saveFolderTreeHighlight() failed:', e);
                }
                refreshFolderTreeHighlightBadge();
                reloadOpener();
            });
        });
    }

    function disableFolderTreeHighlight() {
        setSetting('highlight_current_folder_tree', '0', function (success) {
            if (!success) {
                alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                return;
            }

            try { closeModal('folderTreeHighlightModal'); } catch (e) {
                console.debug('settings-page: disableFolderTreeHighlight() failed:', e);
            }
            refreshFolderTreeHighlightBadge();
            reloadOpener();
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

    function openDiaryDateFormatModal() {
        var modal = document.getElementById('diaryDateFormatModal');
        if (!modal) return;

        getSetting('diary_date_format', function (value) {
            var currentValue = normalizeDiaryDateFormat(value);
            var customPattern = '';
            if (isCustomDiaryDateFormat(currentValue)) {
                customPattern = getCustomDiaryDatePattern(currentValue);
                currentValue = 'custom';
            }
            var radios = document.getElementsByName('diaryDateFormat');
            for (var i = 0; i < radios.length; i++) {
                radios[i].checked = (radios[i].value === currentValue);
            }
            var customInput = document.getElementById('diaryDateFormatCustomInput');
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
                    console.debug('settings-page: openDiaryDateFormatModal() failed:', err);
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

        // Admin contact card (SaaS mode): no mailto, just a modal routing the
        // user: general questions go to the GitHub discussions (link), account
        // questions go to the admin's email. Strings come from the card's data
        // attributes, resolved server-side; the node is built from text nodes,
        // so none of them is ever parsed as HTML.
        var adminContactCard = document.getElementById('admin-contact-card');
        if (adminContactCard) {
            // One bordered block per channel, icon + title + hint, built from
            // text nodes so no translated string is ever parsed as HTML
            var buildContactOption = function (iconClass, titleText, descText) {
                var opt = document.createElement('div');
                opt.className = 'admin-contact-option';
                var icon = document.createElement('i');
                icon.className = 'lucide ' + iconClass;
                opt.appendChild(icon);
                var body = document.createElement('div');
                var titleEl = document.createElement('span');
                titleEl.className = 'admin-contact-option-title';
                titleEl.textContent = titleText;
                body.appendChild(titleEl);
                var descEl = document.createElement('span');
                descEl.className = 'admin-contact-option-desc';
                descEl.textContent = descText;
                body.appendChild(descEl);
                opt.appendChild(body);
                return { option: opt, body: body };
            };

            var openAdminContactModal = function () {
                var data = adminContactCard.dataset;
                var email = data.email || '';
                var linkUrl = data.linkUrl || '';

                // Both channels are optional; the card itself only renders
                // when at least one of them is configured
                if (!window.modalAlert) {
                    alert((data.modalTitle || '')
                        + (linkUrl ? '\n\n' + (data.genericText || '') + '\n' + linkUrl : '')
                        + (email ? '\n\n' + (data.accountText || '') + '\n' + email : ''));
                    return;
                }

                var wrap = document.createElement('div');
                wrap.className = 'admin-contact-options';

                if (linkUrl !== '') {
                    var community = buildContactOption('lucide-message-circle', data.genericTitle || '', data.genericText || '');
                    var link = document.createElement('a');
                    link.href = linkUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = data.linkLabel || linkUrl;
                    var extIcon = document.createElement('i');
                    extIcon.className = 'lucide lucide-external-link';
                    link.appendChild(extIcon);
                    community.body.appendChild(link);
                    wrap.appendChild(community.option);
                }

                if (email === '') {
                    window.modalAlert.alert('', 'info', data.modalTitle || '', { messageNode: wrap });
                    return;
                }

                var mail = buildContactOption('lucide-mail', data.accountTitle || '', data.accountText || '');
                var row = document.createElement('div');
                row.className = 'admin-contact-email-row';
                var emailEl = document.createElement('span');
                emailEl.className = 'admin-contact-email';
                emailEl.textContent = email;
                row.appendChild(emailEl);
                var copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'admin-contact-copy';
                var renderCopyBtn = function (iconName, label) {
                    copyBtn.textContent = '';
                    var ic = document.createElement('i');
                    ic.className = 'lucide ' + iconName;
                    copyBtn.appendChild(ic);
                    copyBtn.appendChild(document.createTextNode(' ' + label));
                };
                renderCopyBtn('lucide-copy', data.copyLabel || 'Copy');
                copyBtn.addEventListener('click', function () {
                    var done = function () {
                        renderCopyBtn('lucide-check', data.copiedLabel || 'Copied!');
                        setTimeout(function () { renderCopyBtn('lucide-copy', data.copyLabel || 'Copy'); }, 1500);
                    };
                    // Old-school path doubles as the fallback when the async
                    // clipboard is missing (non-secure context) or refused
                    var legacyCopy = function () {
                        var tmp = document.createElement('textarea');
                        tmp.value = email;
                        document.body.appendChild(tmp);
                        tmp.select();
                        try { document.execCommand('copy'); done(); } catch (err) {
                            console.debug('settings-page: legacyCopy() failed:', err);
                        }
                        tmp.remove();
                    };
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(email).then(done).catch(legacyCopy);
                    } else {
                        legacyCopy();
                    }
                });
                row.appendChild(copyBtn);
                mail.body.appendChild(row);
                wrap.appendChild(mail.option);

                window.modalAlert.alert('', 'info', data.modalTitle || '', { messageNode: wrap });
            };
            adminContactCard.addEventListener('click', openAdminContactModal);
            adminContactCard.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openAdminContactModal();
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

        // A click on a card's help icon must not trigger the card action
        document.addEventListener('click', function (e) {
            var helpIcon = e.target.closest ? e.target.closest('.setting-help') : null;
            if (helpIcon) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        // Setup toggle cards
        // show-created-card, note-icons-card and folder-counts-card were
        // replaced by checkboxes in the "Element visibility" modal
        // (panel:note-created-date, panel:note-icons, panel:folder-note-count).
        setupToggleCard('type-note-icons-card', 'type-note-icons-status', 'type_based_note_icons', false, true);
        setupToggleCard('folder-actions-card', 'folder-actions-status', 'hide_folder_actions', true);
        setupToggleCard('notes-without-folders-card', 'notes-without-folders-status', 'notes_without_folders_after_folders', false);
        setupToggleCard('markdown-split-card-view-card', 'markdown-split-card-view-status', 'markdown_split_card_view', false, true);
        refreshMarkdownColoredBadge();
        setupToggleCard('code-wrap-card', 'code-wrap-status', 'code_block_word_wrap', false, true);
        setupToggleCard('code-line-numbers-card', 'code-line-numbers-status', 'code_block_line_numbers', false, false);
        setupToggleCard('attachment-previews-card', 'attachment-previews-status', 'attachment_previews_in_note', false, false);
        setupToggleCard('attachments-at-bottom-card', 'attachments-at-bottom-status', 'attachments_at_bottom', false, false);
        setupToggleCard('backlinks-at-bottom-card', 'backlinks-at-bottom-status', 'backlinks_at_bottom', false, false);
        setupToggleCard('default-image-border-card', 'default-image-border-status', 'default_image_border_no_padding', false, false);
        setupToggleCard('spellcheck-html-notes-card', 'spellcheck-html-notes-status', 'spellcheck_html_notes', false, false);
        setupToggleCard('note-nav-shortcuts-card', 'note-nav-shortcuts-status', 'note_nav_shortcuts_enabled', false, false);
        setupToggleCard('ctrl-s-save-card', 'ctrl-s-save-status', 'ctrl_s_save_enabled', false, false);
        setupSlashMenuTriggerCard();

        // Card click handlers for modal settings
        var languageCard = document.getElementById('language-card');
        if (languageCard) {
            languageCard.addEventListener('click', showLanguageModal);
        }

        var noteSortCard = document.getElementById('note-sort-card');
        if (noteSortCard) {
            noteSortCard.addEventListener('click', openNoteSortModal);
        }

        var markdownColoredCard = document.getElementById('markdown-colored-card');
        if (markdownColoredCard) {
            markdownColoredCard.addEventListener('click', openMarkdownColoredModal);
        }

        var noteAgeFilterCard = document.getElementById('note-age-filter-card');
        if (noteAgeFilterCard) {
            noteAgeFilterCard.addEventListener('click', openNoteAgeFilterModal);
        }

        var snapshotsCard = document.getElementById('snapshots-card');
        if (snapshotsCard) {
            snapshotsCard.addEventListener('click', openSnapshotsSettingsModal);
        }

        // Deep link from the contextual panel's "All options" button
        // (ui_customization_panel.php): settings.php?open=ui-customization
        if (new URLSearchParams(window.location.search || '').get('open') === 'ui-customization') {
            showUiCustomizationModal();
            if (window.history && typeof window.history.replaceState === 'function') {
                var cleanUiCustomizationUrl = new URL(window.location.href);
                cleanUiCustomizationUrl.searchParams.delete('open');
                window.history.replaceState({}, '', cleanUiCustomizationUrl.toString());
            }
        }

        // Deep link from the note's Snapshots modal: settings.php?open=snapshots
        if (new URLSearchParams(window.location.search || '').get('open') === 'snapshots') {
            openSnapshotsSettingsModal();
            if (window.history && typeof window.history.replaceState === 'function') {
                var cleanSnapshotsUrl = new URL(window.location.href);
                cleanSnapshotsUrl.searchParams.delete('open');
                window.history.replaceState({}, '', cleanSnapshotsUrl.toString());
            }
        }

        var noteColorPaletteCard = document.getElementById('note-color-palette-card');
        if (noteColorPaletteCard) {
            noteColorPaletteCard.addEventListener('click', openNoteColorPaletteModal);
        }

        // Deep link from the note/folder color modal: settings.php?open=note-colors
        if (new URLSearchParams(window.location.search || '').get('open') === 'note-colors') {
            openNoteColorPaletteModal();
            if (window.history && typeof window.history.replaceState === 'function') {
                var cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('open');
                window.history.replaceState({}, '', cleanUrl.toString());
            }
        }

        var paletteAddBtn = document.getElementById('noteColorPaletteAddBtn');
        if (paletteAddBtn) {
            paletteAddBtn.addEventListener('click', function () {
                paletteDraft.push({ id: '', name: '', hex: '#3b82f6' });
                renderPaletteEditor();
            });
        }

        var paletteResetBtn = document.getElementById('noteColorPaletteResetBtn');
        if (paletteResetBtn) {
            paletteResetBtn.addEventListener('click', function () {
                paletteDraft = defaultPalette();
                renderPaletteEditor();
            });
        }

        var paletteSaveBtn = document.getElementById('saveNoteColorPaletteBtn');
        if (paletteSaveBtn) {
            paletteSaveBtn.addEventListener('click', saveNoteColorPalette);
        }

        var timezoneCard = document.getElementById('timezone-card');
        if (timezoneCard) {
            timezoneCard.addEventListener('click', showTimezonePrompt);
        }

        var dateTimeFormatCard = document.getElementById('date-time-format-card');
        if (dateTimeFormatCard) {
            dateTimeFormatCard.addEventListener('click', openDateTimeFormatModal);
        }

        var markdownDefaultViewModeCard = document.getElementById('markdown-default-view-mode-card');
        if (markdownDefaultViewModeCard) {
            markdownDefaultViewModeCard.addEventListener('click', openMarkdownDefaultViewModeModal);
        }

        var diaryDateFormatCard = document.getElementById('diary-date-format-card');
        if (diaryDateFormatCard) {
            diaryDateFormatCard.addEventListener('click', openDiaryDateFormatModal);
        }

        var customDiaryDateFormatInput = document.getElementById('diaryDateFormatCustomInput');
        if (customDiaryDateFormatInput) {
            customDiaryDateFormatInput.addEventListener('focus', function () {
                var customRadio = document.querySelector('input[name="diaryDateFormat"][value="custom"]');
                if (customRadio) customRadio.checked = true;
            });
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

        // User quotas card - opens modal
        var userQuotasCard = document.getElementById('user-quotas-card');
        if (userQuotasCard) {
            userQuotasCard.addEventListener('click', showUserQuotasModal);
        }

        // Git sync global toggle
        var gitSyncEnabledCard = document.getElementById('git-sync-enabled-card');
        if (gitSyncEnabledCard) {
            markToggleCard(gitSyncEnabledCard);
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

        // Script and executable attachments: instance-wide, so it is written
        // to the master database like the other admin toggles.
        var executableAttachmentsCard = document.getElementById('executable-attachments-card');
        if (executableAttachmentsCard) {
            markToggleCard(executableAttachmentsCard);
            refreshExecutableAttachmentsBadge();
            executableAttachmentsCard.addEventListener('click', function () {
                getSetting('allow_executable_attachments', function (currentValue) {
                    var currently = currentValue === '1' || currentValue === 'true';
                    setSetting('allow_executable_attachments', currently ? '0' : '1', function () {
                        refreshExecutableAttachmentsBadge();
                    });
                });
            });
        }

        // Tenant isolation (SaaS mode) - opens the modal listing the
        // capabilities that can be blocked for non-admin users.
        var tenantIsolationCard = document.getElementById('tenant-isolation-card');
        if (tenantIsolationCard) {
            tenantIsolationCard.addEventListener('click', showTenantIsolationModal);
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

        // Diary entry format card - toggles between HTML and markdown notes
        var diaryNoteTypeCard = document.getElementById('diary-note-type-card');
        if (diaryNoteTypeCard) {
            diaryNoteTypeCard.addEventListener('click', function () {
                getSetting('diary_default_note_type', function (currentValue) {
                    var next = currentValue === 'markdown' ? 'html' : 'markdown';
                    setSetting('diary_default_note_type', next, function (success) {
                        if (success) {
                            refreshDiaryNoteTypeBadge();
                            reloadOpener();
                        } else {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        }
                    });
                });
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

        // Markdown editor font card - opens font selection modal
        var markdownFontCard = document.getElementById('markdown-font-card');
        if (markdownFontCard) {
            markdownFontCard.addEventListener('click', function () {
                var modal = document.getElementById('markdownFontModal');
                if (!modal) return;
                var current = (window.__poznoteUserStorage || localStorage).getItem('markdown_font') || 'inherit';
                probeMarkdownFonts(function (available) {
                    var select = document.getElementById('markdownFontSelect');
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

        // UI Customization card - opens modal (administrators get the extra
        // "Users" column editing the instance-wide setting)
        var uiCustomizationCard = document.getElementById('ui-customization-card');
        if (uiCustomizationCard) {
            uiCustomizationCard.addEventListener('click', showUiCustomizationModal);
        }

        // Icon Sidebar Order card - opens its own modal (card click, move
        // buttons, save and reset are all bound in there)
        initIconSidebarOrderModal();

        // Init section toggle-all buttons (event delegation, one-time setup)
        var uiCustomModal = document.getElementById('uiCustomizationModal');
        if (uiCustomModal) {
            if (isUiCustomizationAdmin()) {
                initUiCustomizationAdminColumns(uiCustomModal);
            }
            initSectionToggleButtons(uiCustomModal);
            initSectionCollapseButtons(uiCustomModal);
        }

        // Save UI Customization modal button
        var saveUiCustomBtn = document.getElementById('saveUiCustomizationBtn');
        if (saveUiCustomBtn) {
            saveUiCustomBtn.addEventListener('click', function () {
                var modal = document.getElementById('uiCustomizationModal');
                if (!modal) return;

                var onSaved = function () {
                    try { closeModal('uiCustomizationModal'); } catch (e) {
                        console.debug('settings-page: onSaved() failed:', e);
                    }
                    refreshUiCustomizationBadge();
                    reloadOpener();
                    reloadCurrentSettingsPage();
                };
                var onError = function () {
                    alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                };

                var hidden = collectHiddenUiKeys(modal, 'data-ui-key', uiCustomizationUserHiddenSnapshot);
                setSetting('hidden_ui_elements', JSON.stringify(hidden), function (success) {
                    if (!success) {
                        onError();
                        return;
                    }

                    if (uiCustomizationModalMode !== 'admin') {
                        onSaved();
                        return;
                    }

                    // Administrators also save the Users column
                    var globalHidden = collectHiddenUiKeys(modal, 'data-ui-global-key', uiCustomizationGlobalHiddenSnapshot);
                    setSetting('hidden_ui_elements_global', JSON.stringify(globalHidden), function (ok) {
                        if (ok) {
                            onSaved();
                        } else {
                            onError();
                        }
                    });
                });
            });
        }

        var uiCustomizationFilterInput = document.getElementById('uiCustomizationFilterInput');
        if (uiCustomizationFilterInput) {
            uiCustomizationFilterInput.addEventListener('input', function () {
                applyUiCustomizationFilter(document.getElementById('uiCustomizationModal'), uiCustomizationFilterInput.value);
            });
        }

        var uiCustomizationHiddenOnly = document.getElementById('uiCustomizationHiddenOnly');
        if (uiCustomizationHiddenOnly) {
            uiCustomizationHiddenOnly.addEventListener('change', refreshUiCustomizationFilter);
        }

        // Font size card - delegates to font-size-settings.js
        var fontSizeCard = document.getElementById('font-size-card');
        if (fontSizeCard && typeof window.showNoteFontSizePrompt === 'function') {
            fontSizeCard.addEventListener('click', window.showNoteFontSizePrompt);
        }

        // Highlight current folder tree card - dim strength lives in a modal
        var folderTreeHighlightCard = document.getElementById('folder-tree-highlight-card');
        if (folderTreeHighlightCard) {
            folderTreeHighlightCard.addEventListener('click', openFolderTreeHighlightModal);
        }

        var folderTreeDimInput = document.getElementById('folderTreeDimInput');
        if (folderTreeDimInput) {
            folderTreeDimInput.addEventListener('input', function () {
                updateFolderTreeDimPreview(folderTreeDimLevel(folderTreeDimInput.value));
            });
        }

        var saveFolderTreeHighlightBtn = document.getElementById('saveFolderTreeHighlightBtn');
        if (saveFolderTreeHighlightBtn) {
            saveFolderTreeHighlightBtn.addEventListener('click', saveFolderTreeHighlight);
        }

        var disableFolderTreeHighlightBtn = document.getElementById('disableFolderTreeHighlightBtn');
        if (disableFolderTreeHighlightBtn) {
            disableFolderTreeHighlightBtn.addEventListener('click', disableFolderTreeHighlight);
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
                        try { closeModal('noteSortModal'); } catch (e) {
                            console.debug('settings-page: onError() failed:', e);
                        }
                        reloadOpener();
                        refreshNoteSortBadge();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

        // Colored markdown modal: show color pickers only for the custom template
        var mdcRadios = document.getElementsByName('markdownColoredTheme');
        for (var mdcIdx = 0; mdcIdx < mdcRadios.length; mdcIdx++) {
            mdcRadios[mdcIdx].addEventListener('change', updateMarkdownColoredCustomRow);
        }

        var saveMarkdownColoredBtn = document.getElementById('saveMarkdownColoredBtn');
        if (saveMarkdownColoredBtn) {
            saveMarkdownColoredBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('markdownColoredTheme');
                var selected = '0';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }

                function finishMarkdownColored(success) {
                    if (success) {
                        try { closeModal('markdownColoredModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        reloadOpener();
                        refreshMarkdownColoredBadge();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                }

                if (selected === 'custom') {
                    var colors = {};
                    document.querySelectorAll('#markdownColoredCustomRow input[data-mdc-element]').forEach(function (input) {
                        var el = input.getAttribute('data-mdc-element');
                        colors[el] = input.value || MARKDOWN_COLORED_DEFAULTS[el];
                    });
                    setSetting('markdown_colored_custom', JSON.stringify(colors), function (ok) {
                        if (!ok) { finishMarkdownColored(false); return; }
                        setSetting('markdown_colored', 'custom', finishMarkdownColored);
                    });
                } else {
                    setSetting('markdown_colored', selected, finishMarkdownColored);
                }
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
                        try { closeModal('noteAgeFilterModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        reloadOpener();
                        refreshNoteAgeFilterBadge();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

        var saveSnapshotsBtn = document.getElementById('saveSnapshotsSettingsModalBtn');
        if (saveSnapshotsBtn) {
            saveSnapshotsBtn.addEventListener('click', function () {
                var input = document.getElementById('snapshotsKeepCountInput');
                var selected = String(getSnapshotsKeepCount(input ? input.value : ''));
                setSetting('snapshots_keep_count', selected, function (success) {
                    if (success) {
                        try { closeModal('snapshotsSettingsModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        refreshSnapshotsBadge();
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
                        try { closeModal('languageModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
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
                        try { closeModal('timezoneModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        refreshTimezoneBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.timezone.alerts.update_error', {}, 'Error updating timezone'));
                    }
                });
            });
        }

        // Save date and time format modal button
        var saveMarkdownDefaultViewModeBtn = document.getElementById('saveMarkdownDefaultViewModeModalBtn');
        if (saveMarkdownDefaultViewModeBtn) {
            saveMarkdownDefaultViewModeBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('markdownDefaultViewMode');
                var selected = 'preview';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }
                selected = normalizeMarkdownDefaultViewMode(selected);

                setSetting('markdown_default_view_mode', selected, function (success) {
                    if (success) {
                        try { closeModal('markdownDefaultViewModeModal'); } catch (e) {
                            console.debug('settings-page: closeModal(markdownDefaultViewModeModal) failed:', e);
                        }
                        refreshMarkdownDefaultViewModeBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

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
                        try { closeModal('dateTimeFormatModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        refreshDateTimeFormatBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
            });
        }

        // Save diary entry date format modal button
        var saveDiaryDateFormatBtn = document.getElementById('saveDiaryDateFormatModalBtn');
        if (saveDiaryDateFormatBtn) {
            saveDiaryDateFormatBtn.addEventListener('click', function () {
                var radios = document.getElementsByName('diaryDateFormat');
                var selected = 'ymd';
                for (var i = 0; i < radios.length; i++) {
                    if (radios[i].checked) { selected = radios[i].value; break; }
                }

                if (selected === 'custom') {
                    var customInput = document.getElementById('diaryDateFormatCustomInput');
                    var customPattern = customInput ? customInput.value.trim() : '';
                    if (!isValidCustomDiaryDateFormat(customPattern)) {
                        alert(tr('modals.diary_date_format.custom_invalid', {},
                            'Enter a valid custom format, with a year, a month and a day.'));
                        if (customInput) customInput.focus();
                        return;
                    }
                    selected = 'custom:' + customPattern;
                } else {
                    selected = normalizeDiaryDateFormat(selected);
                }

                setSetting('diary_date_format', selected, function (success) {
                    if (success) {
                        try { closeModal('diaryDateFormatModal'); } catch (e) {
                            console.debug('settings-page: finishMarkdownColored() failed:', e);
                        }
                        refreshDiaryDateFormatBadge();
                        reloadOpener();
                    } else {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                    }
                });
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
                try { closeModal('mainFontModal'); } catch (e) {
                    console.debug('settings-page: selected() failed:', e);
                }
                refreshMainFontBadge();
                reloadOpener();
            });
        }

        // Save markdown editor font modal button
        var saveMarkdownFontBtn = document.getElementById('saveMarkdownFontModalBtn');
        if (saveMarkdownFontBtn) {
            saveMarkdownFontBtn.addEventListener('click', function () {
                var select = document.getElementById('markdownFontSelect');
                var selected = (select && select.value) || 'inherit';
                (window.__poznoteUserStorage || localStorage).setItem('markdown_font', selected);
                if (typeof window.__poznoteApplyEditorFont === 'function') {
                    window.__poznoteApplyEditorFont(selected);
                }
                try { closeModal('markdownFontModal'); } catch (e) {
                    console.debug('settings-page: selected() failed:', e);
                }
                refreshMarkdownFontBadge();
                reloadOpener();
            });
        }

        // ---- Custom CSS upload modal ----
        var uploadCustomCssBtn = document.getElementById('uploadCustomCssBtn');
        var customCssFileInput = document.getElementById('customCssFileInput');
        var cancelCustomCssBtn = document.getElementById('cancelCustomCssBtn');
        var saveCustomCssBtn = document.getElementById('saveCustomCssBtn');

        function closeCustomCssModal() {
            pendingCssFile = null;
            pendingCssFileName = '';
            if (customCssFileInput) customCssFileInput.value = '';
            try { closeModal('customCssModal'); } catch (e) {
                console.debug('settings-page: closeModal() failed:', e);
            }
        }

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
                pendingCssFileName = customCssStoredName(file.name);
                customCssSelected = pendingCssFileName;
                renderCustomCssThemes();
            });
        }

        if (cancelCustomCssBtn) {
            cancelCustomCssBtn.addEventListener('click', closeCustomCssModal);
        }

        var postCustomCss = function (body) {
            return fetch('api_upload_css.php', { method: 'POST', credentials: 'same-origin', body: body })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data || !data.success) {
                        throw new Error((data && data.error) || '');
                    }
                    return data;
                });
        };

        var customCssSaveFailed = function (error) {
            alert((error && error.message) || tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
        };

        if (saveCustomCssBtn) {
            saveCustomCssBtn.addEventListener('click', function () {
                var uploadNeeded = !!pendingCssFile;
                var selectionChanged = customCssSelected !== customCssActive;

                if (!uploadNeeded && !selectionChanged) {
                    // Nothing changed - just close
                    closeCustomCssModal();
                    return;
                }

                // The file has to be on the server before it can be applied, so
                // the upload comes first and the selection reports the result.
                var chain = Promise.resolve();

                if (uploadNeeded) {
                    chain = chain.then(function () {
                        var formData = new FormData();
                        formData.append('css_file', pendingCssFile);
                        // The radio selection decides what is applied, not the upload.
                        formData.append('activate', '0');
                        return postCustomCss(formData).then(function (data) {
                            pendingCssFile = null;
                            return data;
                        });
                    });
                }

                chain.then(function () {
                    var body = new FormData();
                    body.append('action', 'select');
                    body.append('filename', customCssSelected);
                    return postCustomCss(body);
                }).then(function () {
                    closeCustomCssModal();
                    refreshCustomCssBadge();
                    refreshThemeListBadge();
                    reloadOpener();
                    window.location.reload();
                }).catch(customCssSaveFailed);
            });
        }

        // The Custom CSS modal names the theme list in a sentence, and that name
        // opens it: leaving this modal for the other one, like Cancel does.
        var openThemeListFromCss = document.getElementById('openThemeListFromCss');
        if (openThemeListFromCss) {
            openThemeListFromCss.addEventListener('click', function () {
                closeCustomCssModal();
                showThemeListModal();
            });
        }

        // ---- Theme list modal ----
        var themeListCard = document.getElementById('theme-list-card');
        if (themeListCard) {
            themeListCard.addEventListener('click', showThemeListModal);
        }

        // Deep link from the rail's theme button when the list holds a single
        // theme, so clicking it leads somewhere: settings.php?open=theme-list
        if (new URLSearchParams(window.location.search || '').get('open') === 'theme-list') {
            showThemeListModal();
            if (window.history && typeof window.history.replaceState === 'function') {
                var cleanThemeListUrl = new URL(window.location.href);
                cleanThemeListUrl.searchParams.delete('open');
                window.history.replaceState({}, '', cleanThemeListUrl.toString());
            }
        }

        var cancelThemeListBtn = document.getElementById('cancelThemeListBtn');
        if (cancelThemeListBtn) {
            cancelThemeListBtn.addEventListener('click', function () {
                try { closeModal('themeListModal'); } catch (e) {
                    console.debug('settings-page: closeModal() failed:', e);
                }
            });
        }

        var saveThemeListBtn = document.getElementById('saveThemeListBtn');
        if (saveThemeListBtn) {
            saveThemeListBtn.addEventListener('click', function () {
                var entries = themeListEntriesOf(themeListRows);

                if (entries.length === 0) {
                    alert(tr('modals.theme_list.empty', {}, 'Keep at least one theme in the list.'));
                    return;
                }

                if (JSON.stringify(entries) === themeListSaved) {
                    // Nothing changed - just close
                    try { closeModal('themeListModal'); } catch (e) {
                        console.debug('settings-page: closeModal() failed:', e);
                    }
                    return;
                }

                var body = new FormData();
                body.append('action', 'theme_list');
                body.append('entries', JSON.stringify(entries));
                postCustomCss(body).then(function () {
                    try { closeModal('themeListModal'); } catch (e) {
                        console.debug('settings-page: closeModal() failed:', e);
                    }
                    refreshThemeListBadge();
                    reloadOpener();
                    window.location.reload();
                }).catch(customCssSaveFailed);
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
                            try { closeModal('importLimitsModal'); } catch (e) {
                                console.debug('settings-page: selected() failed:', e);
                            }
                            refreshImportLimitsBadges();
                        } else {
                            alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        }
                    });
                });
            });
        }

        // Save user quotas modal button
        var saveUserQuotasBtn = document.getElementById('saveUserQuotasBtn');
        if (saveUserQuotasBtn) {
            saveUserQuotasBtn.addEventListener('click', function () {
                var notesInput = document.getElementById('userMaxNotesInput');
                var storageInput = document.getElementById('userMaxStorageInput');
                var storageS3Input = document.getElementById('userMaxStorageS3Input');
                var backupsS3Input = document.getElementById('userMaxBackupsS3Input');
                var notesVal = notesInput ? parseInt(notesInput.value, 10) : 0;
                var storageVal = storageInput ? parseInt(storageInput.value, 10) : 0;
                var storageS3Val = storageS3Input ? parseInt(storageS3Input.value, 10) : 0;
                var backupsS3Val = backupsS3Input ? parseInt(backupsS3Input.value, 10) : 0;

                if (isNaN(notesVal) || notesVal < 0 || notesVal > 100000000 ||
                    isNaN(storageVal) || storageVal < 0 || storageVal > 100000000 ||
                    isNaN(storageS3Val) || storageS3Val < 0 || storageS3Val > 100000000 ||
                    isNaN(backupsS3Val) || backupsS3Val < 0 || backupsS3Val > 100000000) {
                    alert(tr('common.error', {}, 'Error'));
                    return;
                }

                // The backups field is absent when S3 backups are off: leave the
                // stored value alone rather than overwriting it with a 0 the
                // admin never typed.
                function saveBackupsQuota(callback) {
                    if (!backupsS3Input) {
                        callback(true);
                        return;
                    }
                    setSetting('user_max_backups_s3_mb', String(backupsS3Val), callback);
                }

                setSetting('user_max_notes', String(notesVal), function (s1) {
                    setSetting('user_max_storage_mb', String(storageVal), function (s2) {
                        setSetting('user_max_storage_s3_mb', String(storageS3Val), function (s3ok) {
                            saveBackupsQuota(function (s4) {
                                if (s1 && s2 && s3ok && s4) {
                                    try { closeModal('userQuotasModal'); } catch (e) {
                                        console.debug('settings-page: saveBackupsQuota() failed:', e);
                                    }
                                    refreshUserQuotasBadges();
                                } else {
                                    alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                                }
                            });
                        });
                    });
                });
            });
        }

        // Save tenant isolation modal button
        var saveTenantIsolationBtn = document.getElementById('saveTenantIsolationBtn');
        if (saveTenantIsolationBtn) {
            saveTenantIsolationBtn.addEventListener('click', function () {
                var modal = document.getElementById('tenantIsolationModal');
                if (!modal) return;

                var features = [];
                modal.querySelectorAll('[data-tenant-feature]').forEach(function (checkbox) {
                    if (checkbox.checked) {
                        features.push(checkbox.getAttribute('data-tenant-feature'));
                    }
                });

                setSetting('tenant_isolation_features', JSON.stringify(features), function (ok) {
                    if (!ok) {
                        alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                        return;
                    }

                    // Legacy on/off flag, kept meaning "user_sharing blocked"
                    // for the pre-existing server checks and older releases.
                    var legacyValue = features.indexOf('user_sharing') !== -1 ? '1' : '0';
                    setSetting('tenant_isolation', legacyValue, function () {
                        syncTenantIsolationHiddenKeys(features, function () {
                            try { closeModal('tenantIsolationModal'); } catch (e) {
                                console.debug('settings-page: saveBackupsQuota() failed:', e);
                            }
                            refreshTenantIsolationBadge();
                            refreshUiCustomizationBadge();
                            reloadOpener();
                        });
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
            refreshMarkdownFontBadge();
            refreshNoteSortBadge();
            refreshNoteAgeFilterBadge();
            refreshSnapshotsBadge();
            refreshNoteColorPaletteBadge();
            refreshTasklistInsertOrderBadge();
            refreshDiaryNoteTypeBadge();
            refreshDiaryDateFormatBadge();
            refreshToolbarModeBadge();
            refreshTimezoneBadge();
            refreshDateTimeFormatBadge();
            refreshMarkdownDefaultViewModeBadge();
            refreshNoteWidthBadge();
            refreshIndexIconScaleBadge();
            refreshCustomCssBadge();
            refreshThemeListBadge();
            refreshImportLimitsBadges();
            refreshUserQuotasBadges();
            refreshGitSyncEnabledBadge();
            refreshTenantIsolationBadge();
            refreshFolderTreeHighlightBadge();
            refreshUiCustomizationBadge();
        });

        // Search functionality - filters settings cards
        var searchInput = document.getElementById('home-search-input');
        var cards = document.querySelectorAll('.home-grid .home-card');
        // Skip the pinned grid: it may be empty/hidden, and the "no results"
        // element must live in an always-rendered grid.
        var grid = document.querySelector('.home-grid:not(#settings-pinned-section-grid)');

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
            // Outside the grids: a grid with no match is hidden along with
            // its title, which would take the message down with it.
            (document.querySelector('.settings-content') || grid).appendChild(noResults);

            var searchWrapper = searchInput.closest('.home-search-wrapper');
            var searchClearBtn = document.getElementById('home-search-clear');

            // Filter cards based on search term
            searchInput.addEventListener('input', function () {
                var term = this.value.toLowerCase().trim();
                var visibleCount = 0;

                if (searchWrapper) {
                    searchWrapper.classList.toggle('has-value', this.value !== '');
                }

                // While a filter term is active, collapsed sections are
                // overridden (CSS gates on this class) so matches stay visible
                var filterContainer = document.querySelector('.home-container');
                if (filterContainer) {
                    filterContainer.classList.toggle('settings-filtering', term !== '');
                }

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

            if (searchClearBtn) {
                searchClearBtn.addEventListener('click', function () {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                    searchInput.focus();
                });
            }

            // Keyboard shortcut: press "/" to focus search
            document.addEventListener('keydown', function (e) {
                if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    searchInput.focus();
                }
            });
        }

        // Pinnable cards: every card gets a pin button. Pinning does NOT move
        // the card — it stays in its section and a live clone of it is shown
        // in the "Pinned" section at the top. Persisted per user in the
        // settings table; pins saved by older versions in localStorage are
        // migrated on first load.
        var pinnedGrid = document.getElementById('settings-pinned-section-grid');
        var pinnedTitle = document.getElementById('settings-pinned-section-title');
        if (pinnedGrid && pinnedTitle) {
            var pinnedCardIds = [];

            var pinnedClones = {};    // card id -> clone element in the pinned grid
            var cloneObservers = {};  // card id -> MutationObserver keeping the clone in sync

            var parsePinnedCardIds = function (raw) {
                try {
                    var ids = JSON.parse(raw || '[]');
                    if (!Array.isArray(ids)) return [];
                    return ids.filter(function (id) { return typeof id === 'string' && id !== ''; });
                } catch (e) {
                    return [];
                }
            };

            var savePinnedCards = function () {
                setSetting('settings_pinned_cards', JSON.stringify(pinnedCardIds));
            };

            var refreshPinnedSection = function () {
                var empty = pinnedGrid.children.length === 0;
                pinnedTitle.hidden = empty;
                pinnedGrid.hidden = empty;
            };

            var applyPinState = function (card) {
                var pinned = pinnedCardIds.indexOf(card.id) !== -1;
                card.classList.toggle('is-pinned', pinned);
                var btn = card.querySelector('.settings-card-pin');
                if (!btn) return;
                var label = pinned
                    ? tr('dashboard.unpin_note', {}, 'Unpin')
                    : tr('dashboard.pin_note', {}, 'Pin to top');
                btn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
                btn.setAttribute('aria-label', label);
                btn.title = label;
            };

            // The clone must not duplicate ids: badge refreshers look elements
            // up by id and have to keep finding the original card.
            var stripIds = function (root) {
                root.removeAttribute('id');
                root.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
            };

            var syncCloneContent = function (orig, clone) {
                clone.className = orig.className;
                clone.innerHTML = orig.innerHTML;
                stripIds(clone);
            };

            // The "Pinned" section shows live clones of cards that stay in
            // place in their own section.
            var buildClone = function (orig) {
                var clone = orig.cloneNode(true);
                stripIds(clone);
                clone.dataset.pinCloneOf = orig.id;
                // The original's card behavior comes from listeners bound to
                // the original element, so the clone forwards its clicks —
                // except <a> cards, whose copied href already navigates.
                clone.addEventListener('click', function (e) {
                    if (e.target.closest('.settings-card-pin')) {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePin(orig);
                        return;
                    }
                    if (clone.tagName !== 'A') orig.click();
                });
                // Badges refresh asynchronously on the original (and after
                // settings changes); mirror every change into the clone.
                var observer = new MutationObserver(function () {
                    syncCloneContent(orig, clone);
                });
                observer.observe(orig, { subtree: true, childList: true, attributes: true, characterData: true });
                return { clone: clone, observer: observer };
            };

            var createPinnedClone = function (orig) {
                var built = buildClone(orig);
                pinnedClones[orig.id] = built.clone;
                cloneObservers[orig.id] = built.observer;
                pinnedGrid.appendChild(built.clone);
            };

            var removePinnedClone = function (id) {
                if (cloneObservers[id]) { cloneObservers[id].disconnect(); delete cloneObservers[id]; }
                if (pinnedClones[id]) { pinnedClones[id].remove(); delete pinnedClones[id]; }
            };

            var togglePin = function (card) {
                var idx = pinnedCardIds.indexOf(card.id);
                if (idx === -1) {
                    pinnedCardIds.push(card.id);
                    createPinnedClone(card);
                } else {
                    pinnedCardIds.splice(idx, 1);
                    removePinnedClone(card.id);
                }
                applyPinState(card);
                savePinnedCards();
                refreshPinnedSection();
            };

            var pinnableCards = [];
            document.querySelectorAll('.home-grid:not(#settings-pinned-section-grid) .home-card').forEach(function (card) {
                if (!card.id) return;
                pinnableCards.push(card);
                // A real <button> is not allowed inside the <a> cards, so the
                // pin is a span with a button role (same as the dashboard
                // folder cards).
                var btn = document.createElement('span');
                btn.className = 'settings-card-pin';
                btn.setAttribute('role', 'button');
                btn.setAttribute('tabindex', '0');
                btn.innerHTML = '<i class="lucide lucide-pin"></i>';
                // The card itself navigates or opens a modal, so the pin
                // click must never reach it.
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePin(card);
                });
                btn.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePin(card);
                    }
                });
                card.appendChild(btn);
                applyPinState(card);
            });

            // Load saved pins, then build the pinned section in saved order.
            // Ids without a card on this page (e.g. admin cards seen by a
            // non-admin) stay in storage but are simply not rendered.
            getSetting('settings_pinned_cards', function (value) {
                var raw = typeof value === 'string' ? value : '';
                if (raw === '') {
                    // One-time migration of pins saved before they moved to the DB.
                    var legacyStore = window.__poznoteUserStorage || window.localStorage;
                    try {
                        var legacy = legacyStore.getItem('settingsPinnedCards') || '';
                        if (legacy !== '') {
                            pinnedCardIds = parsePinnedCardIds(legacy);
                            legacyStore.removeItem('settingsPinnedCards');
                            if (pinnedCardIds.length > 0) savePinnedCards();
                        }
                    } catch (e) { /* storage unavailable */ }
                } else {
                    pinnedCardIds = parsePinnedCardIds(raw);
                }
                pinnableCards.forEach(applyPinState);
                pinnedCardIds.forEach(function (id) {
                    var card = document.getElementById(id);
                    if (card && card.classList.contains('home-card')) createPinnedClone(card);
                });
                refreshPinnedSection();
            });

            document.addEventListener('poznote:i18n:loaded', function () {
                pinnableCards.forEach(applyPinState);
            });
        }

        // Collapsible sections: each category title gets a chevron button that
        // collapses the grid below it. The expanded/collapsed state is kept per
        // user across loads. Sections default to collapsed (except "Pinned"),
        // so the saved list holds the EXPANDED keys: a section added by a
        // later version, absent from that list, still starts collapsed.
        var sectionStore = window.__poznoteUserStorage || window.localStorage;
        var SECTION_STATE_KEY = 'settingsExpandedSections';
        var expandedSections = [];
        try {
            var savedSections = sectionStore.getItem(SECTION_STATE_KEY);
            if (savedSections) {
                var parsedSections = JSON.parse(savedSections);
                if (Array.isArray(parsedSections)) {
                    expandedSections = parsedSections.filter(function (key) {
                        return typeof key === 'string' && key !== '';
                    });
                }
            }
        } catch (e) { /* storage unavailable or corrupted value */ }
        try {
            // Drop the state saved by earlier versions: it listed the collapsed
            // sections instead, so it would be read the wrong way round.
            sectionStore.removeItem('settingsCollapsedSections');
        } catch (e) { /* storage unavailable */ }

        var alwaysExpandedSections = ['settings-pinned-section-grid'];

        var sectionLabelRefreshers = [];

        // Collapse/expand-all button in the filter row: it mirrors the state
        // of the sections, collapsing everything while at least one is open
        // and reopening them once they are all closed. The always-expanded
        // sections (Pinned) are left out of both the count and the action.
        var collapseAllBtn = document.getElementById('settingsCollapseAll');
        var collapsibleSections = [];

        var updateCollapseAllBtn = function () {
            if (!collapseAllBtn) return;
            var allCollapsed = collapsibleSections.length > 0
                && collapsibleSections.every(function (section) {
                    return section.title.classList.contains('section-collapsed');
                });
            collapseAllBtn.classList.toggle('is-collapsed', allCollapsed);
            var label = allCollapsed
                ? (collapseAllBtn.getAttribute('data-label-expand') || 'Expand all')
                : (collapseAllBtn.getAttribute('data-label-collapse') || 'Collapse all');
            collapseAllBtn.setAttribute('aria-expanded', allCollapsed ? 'false' : 'true');
            collapseAllBtn.setAttribute('aria-label', label);
            collapseAllBtn.title = label;
        };

        // Rebuilt from the DOM on every toggle so the stored list stays in sync
        // even when several sections change at once.
        var persistSectionStates = function () {
            var expanded = [];
            document.querySelectorAll('.settings-category-title').forEach(function (title) {
                var grid = title.nextElementSibling;
                if (!grid || !grid.classList.contains('home-grid')) return;
                var key = grid.id || title.id;
                if (!key || alwaysExpandedSections.indexOf(key) !== -1) return;
                if (!title.classList.contains('section-collapsed')) expanded.push(key);
            });
            try {
                sectionStore.setItem(SECTION_STATE_KEY, JSON.stringify(expanded));
            } catch (e) { /* storage unavailable */ }
        };

        document.querySelectorAll('.settings-category-title').forEach(function (title) {
            var sectionGrid = title.nextElementSibling;
            if (!sectionGrid || !sectionGrid.classList.contains('home-grid')) return;
            var sectionKey = sectionGrid.id || title.id;
            if (!sectionKey) return;

            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'settings-section-toggle';
            toggleBtn.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
            if (sectionGrid.id) toggleBtn.setAttribute('aria-controls', sectionGrid.id);
            title.appendChild(toggleBtn);
            title.classList.add('settings-section-header');

            var applySectionState = function (collapsed) {
                title.classList.toggle('section-collapsed', collapsed);
                sectionGrid.classList.toggle('section-collapsed', collapsed);
                toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                var label = collapsed
                    ? tr('settings.expand_section', {}, 'Expand section')
                    : tr('settings.collapse_section', {}, 'Collapse section');
                toggleBtn.setAttribute('aria-label', label);
                toggleBtn.title = label;
            };
            applySectionState(alwaysExpandedSections.indexOf(sectionKey) === -1
                && expandedSections.indexOf(sectionKey) === -1);
            sectionLabelRefreshers.push(function () {
                applySectionState(title.classList.contains('section-collapsed'));
            });
            if (alwaysExpandedSections.indexOf(sectionKey) === -1) {
                collapsibleSections.push({ title: title, apply: applySectionState });
            }

            // The button's click bubbles up here, so one listener covers both.
            // The desktop layout shows one section at a time: nothing to
            // collapse, and the saved state must not change under it.
            title.addEventListener('click', function () {
                if (isSettingsNavLayout()) return;
                applySectionState(!title.classList.contains('section-collapsed'));
                persistSectionStates();
                updateCollapseAllBtn();
            });
        });

        document.addEventListener('poznote:i18n:loaded', function () {
            sectionLabelRefreshers.forEach(function (refresh) { refresh(); });
        });

        // Deep link from the rail's About button: settings.php?open=about shows
        // the About section on its own, instead of the default view where only
        // "Pinned" is expanded.
        if (new URLSearchParams(window.location.search || '').get('open') === 'about') {
            var aboutGrid = document.getElementById('settings-documentation-section-grid');
            document.querySelectorAll('.settings-category-title').forEach(function (title) {
                var grid = title.nextElementSibling;
                if (!grid || !grid.classList.contains('home-grid')) return;
                // The pinned section is hidden when empty; leave it as it is.
                if (title.hidden) return;
                var isAbout = grid === aboutGrid;
                title.classList.toggle('section-collapsed', !isAbout);
                grid.classList.toggle('section-collapsed', !isAbout);
                var btn = title.querySelector('.settings-section-toggle');
                if (btn) btn.setAttribute('aria-expanded', isAbout ? 'true' : 'false');
            });
            var aboutTitle = document.getElementById('settings-documentation-section-title');
            if (aboutTitle && typeof aboutTitle.scrollIntoView === 'function') {
                aboutTitle.scrollIntoView({ block: 'start' });
            }
            // ?open=about deliberately stays in the URL: icon_sidebar.php reads
            // it to highlight About instead of Settings, so stripping it would
            // move the highlight back to Settings on the next reload.
        }

        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', function () {
                var collapse = !collapsibleSections.every(function (section) {
                    return section.title.classList.contains('section-collapsed');
                });
                collapsibleSections.forEach(function (section) {
                    section.apply(collapse);
                });
                persistSectionStates();
                updateCollapseAllBtn();
            });
            updateCollapseAllBtn();
        }

        // Card/list layout toggle next to the filter bar (same pattern as the
        // dashboard's board-view-menu.js), persisted per user.
        var viewToggle = document.getElementById('settingsViewToggle');
        var homeContainer = document.querySelector('.home-container');
        if (viewToggle && homeContainer) {
            var viewStore = window.__poznoteUserStorage || window.localStorage;
            var viewLayout = 'grid';
            try {
                if (viewStore.getItem('settingsViewLayout') === 'list') viewLayout = 'list';
            } catch (e) { /* storage unavailable */ }

            var applyViewLayout = function () {
                homeContainer.classList.toggle('view-list', viewLayout === 'list');
                viewToggle.classList.toggle('is-list', viewLayout === 'list');
                // The toggle advertises the layout a click switches TO
                viewToggle.title = viewToggle.getAttribute(viewLayout === 'grid' ? 'data-label-list' : 'data-label-grid') || '';
            };
            applyViewLayout();

            viewToggle.addEventListener('click', function () {
                viewLayout = viewLayout === 'grid' ? 'list' : 'grid';
                try {
                    viewStore.setItem('settingsViewLayout', viewLayout);
                } catch (e) { /* storage unavailable */ }
                applyViewLayout();
            });
        }

        // Desktop layout: the section list on the left, one section shown at
        // a time with its cards as rows (css/settings.css, .settings-with-nav).
        // The items come from the category titles, so they follow the
        // server-side translation and the admin-only sections. Narrow screens
        // hide the list and keep the stacked sections above.
        var settingsNav = document.getElementById('settings-nav');
        if (settingsNav && homeContainer && homeContainer.classList.contains('settings-with-nav')) {
            var NAV_STATE_KEY = 'settingsActiveSection';
            var navStore = window.__poznoteUserStorage || window.localStorage;
            var NAV_ICONS = {
                'settings-pinned-section-grid': 'lucide-pin',
                'settings-actions-section-grid': 'lucide-zap',
                'settings-display-section-grid': 'lucide-monitor',
                'settings-markdown-section-grid': 'lucide-file-code',
                'settings-behavior-section-grid': 'lucide-settings-2',
                'admin-tools-grid': 'lucide-wrench',
                'settings-documentation-section-grid': 'lucide-info'
            };
            var navSections = []; // { key, title, grid, item }
            var activeSectionKey = null;

            var findSection = function (key) {
                for (var i = 0; i < navSections.length; i++) {
                    if (navSections[i].key === key) return navSections[i];
                }
                return null;
            };

            // A section is listed while it has something to show: "Pinned"
            // carries the hidden attribute while empty, and
            // ui-customization.js sets an inline display:none on a section
            // whose cards are all hidden.
            var isSectionAvailable = function (section) {
                return !section.title.hidden && section.title.style.display !== 'none';
            };

            var applyActiveSection = function () {
                navSections.forEach(function (section) {
                    var active = section.key === activeSectionKey;
                    section.title.classList.toggle('settings-section-active', active);
                    section.grid.classList.toggle('settings-section-active', active);
                    section.item.classList.toggle('is-active', active);
                    section.item.setAttribute('aria-current', active ? 'true' : 'false');
                    section.item.hidden = !isSectionAvailable(section);
                });
            };

            var activateSection = function (key, persist) {
                var section = findSection(key);
                if (!section || !isSectionAvailable(section)) return false;
                activeSectionKey = key;
                applyActiveSection();
                if (persist) {
                    try { navStore.setItem(NAV_STATE_KEY, key); } catch (e) { /* storage unavailable */ }
                }
                return true;
            };

            // Sections come and go (pins added or removed, cards hidden through
            // UI Customization): their items follow, and the selection falls
            // back to the first listed section when its own is gone. Left
            // alone while a filter term is active: the filter hides the titles
            // without matches, which is not the sections vanishing.
            var refreshNav = function () {
                if (homeContainer.classList.contains('settings-filtering')) return;
                var current = findSection(activeSectionKey);
                if (!current || !isSectionAvailable(current)) {
                    var fallback = null;
                    for (var i = 0; i < navSections.length && !fallback; i++) {
                        if (isSectionAvailable(navSections[i])) fallback = navSections[i];
                    }
                    activeSectionKey = fallback ? fallback.key : null;
                }
                applyActiveSection();
            };

            // The Version card lives in the About section, so its update badge
            // is out of sight while another section is shown: the About entry
            // carries one too, to say which section to open. It mirrors the
            // card badge because the nav is built after utils-updates.js may
            // already have revealed the badges, and js/utils-updates.js
            // reveals or hides every .update-badge on later checks.
            var buildNavBadge = function () {
                var cardBadge = document.querySelector('#check-updates-card .update-badge');
                if (!cardBadge) return null;
                var badge = document.createElement('span');
                badge.className = 'update-badge update-badge-inline';
                if (cardBadge.classList.contains('update-badge-hidden')) {
                    badge.classList.add('update-badge-hidden');
                } else {
                    badge.style.display = 'inline-block';
                }
                return badge;
            };

            var buildNavItem = function (key, labelText) {
                var item = document.createElement('button');
                item.type = 'button';
                item.className = 'settings-nav-item';
                item.setAttribute('data-section', key);
                var icon = document.createElement('i');
                icon.className = 'lucide ' + (NAV_ICONS[key] || 'lucide-settings');
                var label = document.createElement('span');
                label.className = 'settings-nav-label';
                label.textContent = labelText;
                item.appendChild(icon);
                item.appendChild(label);
                if (key === 'settings-documentation-section-grid') {
                    var navBadge = buildNavBadge();
                    if (navBadge) item.appendChild(navBadge);
                }
                item.addEventListener('click', function () {
                    // Picking a section replaces the filter: its rows are
                    // what was asked for.
                    if (searchInput && searchInput.value !== '') {
                        searchInput.value = '';
                        searchInput.dispatchEvent(new Event('input'));
                    }
                    activateSection(key, true);
                });
                return item;
            };

            document.querySelectorAll('.settings-category-title').forEach(function (title) {
                var grid = title.nextElementSibling;
                if (!grid || !grid.classList.contains('home-grid')) return;
                var key = grid.id || title.id;
                if (!key) return;
                // The chevron button appended above holds no text
                var item = buildNavItem(key, (title.textContent || '').trim());
                settingsNav.appendChild(item);
                navSections.push({ key: key, title: title, grid: grid, item: item });
            });

            // Initial section: the rail's About deep link, then a #hash naming
            // a section (title or grid id), then the saved choice, then the
            // first listed section.
            var initialKey = null;
            if (new URLSearchParams(window.location.search || '').get('open') === 'about') {
                initialKey = 'settings-documentation-section-grid';
            }
            if (!initialKey && window.location.hash) {
                var hashId = decodeURIComponent(window.location.hash.slice(1));
                navSections.forEach(function (section) {
                    if (section.key === hashId) initialKey = section.key;
                    else if (section.grid.id === hashId) initialKey = section.key;
                    else if (section.title.id === hashId) initialKey = section.key;
                });
            }
            if (!initialKey) {
                try { initialKey = navStore.getItem(NAV_STATE_KEY); } catch (e) { /* storage unavailable */ }
            }
            if (!initialKey || !activateSection(initialKey, false)) refreshNav();

            if (typeof MutationObserver !== 'undefined') {
                var navObserver = new MutationObserver(refreshNav);
                navSections.forEach(function (section) {
                    navObserver.observe(section.title, { attributes: true, attributeFilter: ['hidden', 'style'] });
                });
            }
            // Runs after the filter's own input listener: once the term is
            // cleared the titles are back, and the list can settle again.
            if (searchInput) {
                searchInput.addEventListener('input', function () {
                    if (searchInput.value.trim() === '') refreshNav();
                });
            }
        }

        // Re-translate badges when i18n is loaded
        document.addEventListener('poznote:i18n:loaded', function () {
            refreshLanguageBadge();
            refreshFontSizeBadge();
            refreshMainFontBadge();
            refreshMarkdownFontBadge();
            refreshNoteSortBadge();
            refreshNoteAgeFilterBadge();
            refreshSnapshotsBadge();
            refreshNoteColorPaletteBadge();
            refreshTasklistInsertOrderBadge();
            refreshDiaryNoteTypeBadge();
            refreshDiaryDateFormatBadge();
            refreshToolbarModeBadge();
            refreshDateTimeFormatBadge();
            refreshMarkdownDefaultViewModeBadge();
            refreshInstallAppBadge();
            refreshCustomCssBadge();
        });
    });

    // ========== UI Customization ==========

    // Every user edits hidden_ui_elements (their own interface). In 'admin'
    // mode the modal shows a second checkbox column, "Users", editing
    // hidden_ui_elements_global (applies to every user except administrators)
    // next to the administrator's own "Me" column.
    var uiCustomizationModalMode = 'user';
    var uiCustomizationUserHiddenSnapshot = [];
    var uiCustomizationGlobalHiddenSnapshot = [];

    // Both checkbox columns: data-ui-key (own set) and data-ui-global-key
    // (instance-wide set). The Users inputs are disabled in user mode, so the
    // enabled selector is the one to use for anything that counts or toggles.
    var UI_CUSTOM_CHECKBOX_SELECTOR = '[data-ui-key], [data-ui-global-key]';
    var UI_CUSTOM_ENABLED_CHECKBOX_SELECTOR = '[data-ui-key]:not(:disabled), [data-ui-global-key]:not(:disabled)';

    function isUiCustomizationAdmin() {
        var card = document.getElementById('ui-customization-card');
        return !!(card && card.getAttribute('data-ui-admin') === '1');
    }

    // Adds the Users column to the modal: a header row naming both columns at
    // the top of each section and, per item, a second checkbox mirroring the
    // item's key. The markup in modals.php stays single-column so regular
    // users are unaffected.
    function initUiCustomizationAdminColumns(modal) {
        var description = document.getElementById('uiCustomizationModalDescription');
        var meLabel = (description && description.getAttribute('data-column-me')) || 'Me';
        var usersLabel = (description && description.getAttribute('data-column-users')) || 'Users';

        modal.querySelectorAll('.ui-custom-items').forEach(function (items) {
            if (items.querySelector('.ui-custom-columns')) return;

            var header = document.createElement('div');
            header.className = 'ui-custom-columns';
            var me = document.createElement('span');
            me.textContent = meLabel;
            var users = document.createElement('span');
            users.textContent = usersLabel;
            header.appendChild(me);
            header.appendChild(users);
            items.insertBefore(header, items.firstChild);
        });

        modal.querySelectorAll('.ui-custom-item').forEach(function (item) {
            if (item.querySelector('[data-ui-global-key]')) return;

            var own = item.querySelector('[data-ui-key]');
            if (!own) return;

            // Clicking the label text still toggles the first checkbox (Me);
            // a click on this one only toggles itself.
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'ui-custom-users-input';
            input.setAttribute('data-ui-global-key', own.getAttribute('data-ui-key'));
            input.checked = true;
            input.disabled = true;
            item.appendChild(input);
        });
    }

    // Reads one checkbox column back into a hidden-key list. Disabled
    // checkboxes (admin-locked in the own column, tenant isolation-locked in
    // the Users column) keep their stored state instead of adopting the lock
    // state.
    function collectHiddenUiKeys(modal, attribute, snapshot) {
        var hidden = [];
        modal.querySelectorAll('[' + attribute + ']').forEach(function (cb) {
            var key = cb.getAttribute(attribute);
            if (cb.disabled) {
                if (snapshot.indexOf(key) !== -1) {
                    hidden.push(key);
                }
                return;
            }
            if (!cb.checked) {
                hidden.push(key);
            }
        });
        return hidden;
    }

    function getGloballyHiddenUiKeys() {
        var keys = window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__;
        return Array.isArray(keys) ? keys.map(normalizeHiddenUiKey) : [];
    }

    // Keys renamed after release, so preferences saved under the old name keep
    // working. See poznoteNormalizeHiddenUiKey() in functions.php.
    var RENAMED_UI_KEYS = {
        'toolbar:btn-share': 'toolbar:btn-publish',
        'wsmenu:goto-workspaces': 'wsmenu:edit-workspaces',
        'card:iconSidebarNotificationsBtn': 'card:sidebarNotificationsBtn',
        'card:iconSidebarAiChatBtn': 'card:edgeAiChatBtn',
        'card:sidebarAiChatBtn': 'card:edgeAiChatBtn'
    };

    function normalizeHiddenUiKey(key) {
        return RENAMED_UI_KEYS[key] || key;
    }

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
        return hidden
            .map(normalizeHiddenUiKey)
            .filter(function (key) {
                return typeof key === 'string' && allowed[key];
            });
    }

    // UI keys hidden for every user per blocked tenant isolation feature.
    // They are only the cosmetic half: the server refuses these actions
    // regardless, so unchecking one by hand re-displays a control that still
    // fails with a 403.
    var TENANT_ISOLATION_FEATURE_HIDDEN_KEYS = {
        'user_sharing': ['share:restrict-users'],
        'user_webhooks': ['card:user-webhooks-card'],
        'user_s3_backups': ['card:s3-user-backup-section'],
        'user_s3_restore': ['card:s3RestoreSection']
    };

    // Records which keys the tenant isolation modal added, so unblocking a
    // feature removes those and not the ones the administrator had already
    // hidden on purpose.
    var TENANT_ISOLATION_APPLIED_SETTING = 'tenant_isolation_applied_ui_keys';

    function syncTenantIsolationHiddenKeys(blockedFeatures, done) {
        var desiredKeys = [];
        Object.keys(TENANT_ISOLATION_FEATURE_HIDDEN_KEYS).forEach(function (feature) {
            if (blockedFeatures.indexOf(feature) !== -1) {
                desiredKeys = desiredKeys.concat(TENANT_ISOLATION_FEATURE_HIDDEN_KEYS[feature]);
            }
        });

        getSetting('hidden_ui_elements_global', function (rawGlobal) {
            getSetting(TENANT_ISOLATION_APPLIED_SETTING, function (rawApplied) {
                var hidden = parseHiddenUiCustomization(rawGlobal);
                var applied = [];
                try { applied = JSON.parse(rawApplied || '[]'); } catch (e) { applied = []; }
                if (!Array.isArray(applied)) applied = [];

                // Drop what a previous sync added, then re-add what the current
                // selection needs: keys the admin hid on purpose are never
                // claimed, so unblocking a feature leaves them hidden.
                var previouslyApplied = Object.create(null);
                applied.forEach(function (key) { previouslyApplied[key] = true; });
                hidden = hidden.filter(function (key) { return !previouslyApplied[key]; });

                var present = Object.create(null);
                hidden.forEach(function (key) { present[key] = true; });

                var nextApplied = desiredKeys.filter(function (key) {
                    return !present[key];
                });
                nextApplied.forEach(function (key) {
                    hidden.push(key);
                    present[key] = true;
                });

                setSetting('hidden_ui_elements_global', JSON.stringify(hidden), function () {
                    setSetting(TENANT_ISOLATION_APPLIED_SETTING, JSON.stringify(nextApplied), function () {
                        if (typeof done === 'function') done();
                    });
                });
            });
        });
    }

    function normalizeUiCustomizationFilterText(value) {
        var text = String(value || '').toLowerCase().trim();

        if (typeof text.normalize === 'function') {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        return text.replace(/\s+/g, ' ');
    }

    function isUiCustomizationHiddenOnlyActive() {
        var toggle = document.getElementById('uiCustomizationHiddenOnly');
        return !!(toggle && toggle.checked);
    }

    function applyUiCustomizationFilter(modal, value) {
        if (!modal) return;

        var query = normalizeUiCustomizationFilterText(value);
        var uncheckedOnly = isUiCustomizationHiddenOnlyActive();
        var sections = modal.querySelectorAll('.ui-custom-section');
        var emptyState = document.getElementById('uiCustomizationFilterEmpty');
        var anyVisible = false;

        modal.classList.toggle('ui-custom-filtering', query.length > 0 || uncheckedOnly);

        sections.forEach(function (section) {
            var items = section.querySelectorAll('.ui-custom-item');
            var visibleItems = 0;

            items.forEach(function (item) {
                // Either column unchecked counts (the Users checkbox is kept
                // checked in user mode, so it never matches there)
                var anyUnchecked = Array.prototype.some.call(
                    item.querySelectorAll(UI_CUSTOM_CHECKBOX_SELECTOR),
                    function (cb) { return !cb.checked; }
                );
                var matches = (!query || normalizeUiCustomizationFilterText(item.textContent).indexOf(query) !== -1)
                    && (!uncheckedOnly || anyUnchecked);

                item.hidden = !matches;
                if (matches) {
                    visibleItems += 1;
                }
            });

            // Sections keep their title while filtering: only sections without
            // any matching item are hidden entirely.
            section.hidden = visibleItems === 0;
            if (visibleItems > 0) {
                anyVisible = true;
            }
        });

        if (emptyState) {
            emptyState.hidden = anyVisible;

            // With no text query, an empty list means nothing is unchecked.
            var emptyLabel = (uncheckedOnly && !query)
                ? emptyState.getAttribute('data-empty-unchecked')
                : emptyState.getAttribute('data-empty-default');
            if (emptyLabel) {
                emptyState.textContent = emptyLabel;
            }
        }
    }

    function refreshUiCustomizationFilter() {
        var modal = document.getElementById('uiCustomizationModal');
        var filterInput = document.getElementById('uiCustomizationFilterInput');
        applyUiCustomizationFilter(modal, filterInput ? filterInput.value : '');
    }

    function refreshUiCustomizationBadge() {
        var badge = document.getElementById('ui-customization-badge');
        if (!badge) return;

        getSetting('hidden_ui_elements', function (value) {
            var own = parseHiddenUiCustomization(value);

            if (isUiCustomizationAdmin()) {
                // Administrators are exempt from the instance-wide set, so the
                // badge shows the two columns separately.
                getSetting('hidden_ui_elements_global', function (rawGlobal) {
                    var forUsers = parseHiddenUiCustomization(rawGlobal);

                    if (own.length === 0 && forUsers.length === 0) {
                        badge.textContent = tr('modals.ui_customization.badge_all_visible', {}, 'All visible');
                        badge.className = 'setting-status enabled';
                        return;
                    }

                    badge.textContent = tr(
                        'modals.ui_customization.badge_hidden_count_admin_columns',
                        { me: own.length, users: forUsers.length },
                        own.length + ' hidden for you, ' + forUsers.length + ' for users'
                    );
                    badge.className = 'setting-status disabled';
                });
                return;
            }

            // Elements the administrator hides for everyone are applied on top
            // of the user's own set and cannot be re-enabled from the modal, so
            // the badge counts them too. The list is empty for administrators,
            // who are exempt from the instance-wide set.
            var supported = getSupportedUiCustomizationKeys();
            var byAdmin = getGloballyHiddenUiKeys().filter(function (key) {
                return !!supported[key];
            });

            var union = Object.create(null);
            own.concat(byAdmin).forEach(function (key) {
                union[key] = true;
            });
            var total = Object.keys(union).length;

            if (total === 0) {
                badge.textContent = tr('modals.ui_customization.badge_all_visible', {}, 'All visible');
                badge.className = 'setting-status enabled';
                return;
            }

            badge.textContent = byAdmin.length > 0
                ? tr(
                    'modals.ui_customization.badge_hidden_count_admin',
                    { count: total, admin: byAdmin.length },
                    total + ' hidden (' + byAdmin.length + ' by the administrator)'
                )
                : tr('modals.ui_customization.badge_hidden_count', { count: total }, total + ' hidden');
            badge.className = 'setting-status disabled';
        });
    }

    // Renders the modal description, emphasising one phrase of it ("except
    // administrators" in the administrator mode). Built from text nodes rather than
    // innerHTML so a translation can never inject markup.
    function setUiCustomizationDescription(element, text, highlight) {
        element.textContent = '';

        var index = highlight ? text.indexOf(highlight) : -1;
        if (index === -1) {
            element.textContent = text;
            return;
        }

        var strong = document.createElement('span');
        strong.className = 'ui-custom-description-highlight';
        strong.textContent = highlight;

        element.appendChild(document.createTextNode(text.slice(0, index)));
        element.appendChild(strong);
        element.appendChild(document.createTextNode(text.slice(index + highlight.length)));
    }

    function updateSectionToggleBtn(section) {
        var btn = section.querySelector('.ui-custom-toggle-all');
        if (!btn) return;

        var checkboxes = section.querySelectorAll(UI_CUSTOM_ENABLED_CHECKBOX_SELECTOR);
        var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

        btn.textContent = allChecked
            ? (btn.getAttribute('data-label-uncheck') || 'Uncheck all')
            : (btn.getAttribute('data-label-check') || 'Check all');
    }

    function updateGlobalToggleBtn(modal) {
        var btn = modal.querySelector('#uiCustomizationToggleAll');
        if (!btn) return;

        var checkboxes = modal.querySelectorAll(UI_CUSTOM_ENABLED_CHECKBOX_SELECTOR);
        var allChecked = checkboxes.length > 0
            && Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });

        btn.textContent = allChecked
            ? (btn.getAttribute('data-label-uncheck') || 'Uncheck all')
            : (btn.getAttribute('data-label-check') || 'Check all');
    }

    function isUiCustomizationSectionCollapsed(section) {
        var title = section.querySelector('.ui-custom-section-title');
        return !!(title && title.classList.contains('ui-custom-section-collapsed'));
    }

    function setUiCustomizationSectionCollapsed(section, collapsed) {
        var title = section.querySelector('.ui-custom-section-title');
        if (!title) return;

        section.classList.toggle('ui-custom-section-collapsed', collapsed);
        title.classList.toggle('ui-custom-section-collapsed', collapsed);

        var toggleBtn = title.querySelector('.ui-custom-section-toggle');
        if (toggleBtn) {
            var label = collapsed
                ? tr('settings.expand_section', {}, 'Expand section')
                : tr('settings.collapse_section', {}, 'Collapse section');
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggleBtn.setAttribute('aria-label', label);
            toggleBtn.title = label;
        }
    }

    // The collapse-all button mirrors the state of the sections: while at least
    // one is open it collapses everything, once all are closed it reopens them.
    function updateCollapseAllBtn(modal) {
        var btn = modal.querySelector('#uiCustomizationCollapseAll');
        if (!btn) return;

        var sections = modal.querySelectorAll('.ui-custom-section');
        var allCollapsed = sections.length > 0
            && Array.prototype.every.call(sections, isUiCustomizationSectionCollapsed);

        btn.classList.toggle('ui-custom-collapsed', allCollapsed);

        var label = allCollapsed
            ? (btn.getAttribute('data-label-expand') || 'Expand all')
            : (btn.getAttribute('data-label-collapse') || 'Collapse all');
        btn.setAttribute('aria-expanded', allCollapsed ? 'false' : 'true');
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function initSectionCollapseButtons(modal) {
        modal.querySelectorAll('.ui-custom-section').forEach(function (section) {
            var title = section.querySelector('.ui-custom-section-title');
            if (!title || title.querySelector('.ui-custom-section-toggle')) return;

            var toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'ui-custom-section-toggle';
            toggleBtn.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
            title.appendChild(toggleBtn);

            // Folded by default: ten sections of checkboxes are a wall of
            // text when they all start open (discussion 1298).
            setUiCustomizationSectionCollapsed(section, true);
        });

        updateCollapseAllBtn(modal);

        modal.addEventListener('click', function (e) {
            var collapseAllBtn = e.target.closest('#uiCustomizationCollapseAll');
            if (collapseAllBtn) {
                var sections = modal.querySelectorAll('.ui-custom-section');
                var collapse = !Array.prototype.every.call(sections, isUiCustomizationSectionCollapsed);
                sections.forEach(function (section) {
                    setUiCustomizationSectionCollapsed(section, collapse);
                });
                updateCollapseAllBtn(modal);
                return;
            }

            // The check/uncheck-all button lives inside the title and has its
            // own handler, so a click on it must not collapse the section.
            if (e.target.closest('.ui-custom-toggle-all')) return;

            var title = e.target.closest('.ui-custom-section-title');
            if (!title) return;

            var clicked = title.closest('.ui-custom-section');
            if (!clicked) return;

            // Accordion: opening a section folds the others, so one section
            // of checkboxes is on screen at a time. Collapse all / Expand all
            // above still opens everything at once.
            var expand = isUiCustomizationSectionCollapsed(clicked);
            modal.querySelectorAll('.ui-custom-section').forEach(function (section) {
                setUiCustomizationSectionCollapsed(section, section !== clicked || !expand);
            });
            updateCollapseAllBtn(modal);
        });
    }

    function initSectionToggleButtons(modal) {
        // Update button labels based on current state
        modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
        updateGlobalToggleBtn(modal);

        // Check all / Uncheck all replaces the current selection wholesale, so
        // ask for confirmation before dropping the existing customizations
        function confirmToggleAll(done) {
            var message = tr('modals.ui_customization.toggle_all_warning', {},
                'This will lose all your existing customizations. Do you want to continue?');
            if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
                window.modalAlert.confirm(message, tr('modals.ui_customization.title', {}, 'UI Customization'))
                    .then(function (confirmed) { if (confirmed) done(); });
            } else if (window.confirm(message)) {
                done();
            }
        }

        // Click: toggle all checkboxes (globally, or within one section)
        modal.addEventListener('click', function (e) {
            var globalBtn = e.target.closest('#uiCustomizationToggleAll');
            if (globalBtn) {
                confirmToggleAll(function () {
                    var allCheckboxes = modal.querySelectorAll(UI_CUSTOM_ENABLED_CHECKBOX_SELECTOR);
                    var everyChecked = allCheckboxes.length > 0
                        && Array.prototype.every.call(allCheckboxes, function (cb) { return cb.checked; });
                    allCheckboxes.forEach(function (cb) { cb.checked = !everyChecked; });
                    modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
                    updateGlobalToggleBtn(modal);
                    refreshUiCustomizationFilter();
                });
                return;
            }

            var btn = e.target.closest('.ui-custom-toggle-all');
            if (!btn) return;

            var section = btn.closest('.ui-custom-section');
            if (!section) return;

            confirmToggleAll(function () {
                var checkboxes = section.querySelectorAll(UI_CUSTOM_ENABLED_CHECKBOX_SELECTOR);
                var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
                checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
                updateSectionToggleBtn(section);
                updateGlobalToggleBtn(modal);
                refreshUiCustomizationFilter();
            });
        });

        // Change: keep button labels in sync when individual checkboxes change
        modal.addEventListener('change', function (e) {
            if (!e.target || !e.target.matches || !e.target.matches(UI_CUSTOM_CHECKBOX_SELECTOR)) return;

            var section = e.target.closest('.ui-custom-section');
            if (section) {
                updateSectionToggleBtn(section);
            }
            updateGlobalToggleBtn(modal);

            // "Show only unchecked" is live: a newly checked item leaves the list.
            if (isUiCustomizationHiddenOnlyActive()) {
                refreshUiCustomizationFilter();
            }
        });
    }

    function openUiCustomizationModal(mode) {
        var modal = document.getElementById('uiCustomizationModal');
        if (!modal) return;

        uiCustomizationModalMode = mode === 'admin' ? 'admin' : 'user';
        var isAdminMode = uiCustomizationModalMode === 'admin';

        // Sections marked data-ui-global-only (e.g. the login page) can only be
        // configured instance-wide: hidden from the per-user modal, and only
        // their Users checkbox is live in the administrator modal.
        modal.classList.toggle('ui-custom-mode-user', !isAdminMode);
        modal.classList.toggle('ui-custom-mode-admin', isAdminMode);

        var description = document.getElementById('uiCustomizationModalDescription');
        if (description) {
            var descriptionText = description.getAttribute(isAdminMode ? 'data-description-admin' : 'data-description-user');
            if (descriptionText) {
                setUiCustomizationDescription(description, descriptionText, isAdminMode
                    ? description.getAttribute('data-description-admin-highlight')
                    : '');
            }
        }

        var lockedTitle = tr('modals.ui_customization.locked_by_admin', {}, 'Hidden for all users by the administrator');
        var tenantLockedTitle = tr('modals.ui_customization.locked_by_tenant_isolation', {}, 'Hidden automatically while this capability is blocked by Tenant isolation');

        var applyState = function (hidden, globalHidden, tenantLockedKeys) {
            // Administrators are exempt from the instance-wide set, so their
            // own column is never locked by it (the list is empty for them).
            var globallyHidden = getGloballyHiddenUiKeys();

            // The stored hidden lists back the disabled checkboxes on save, so
            // locked keys keep their stored state.
            uiCustomizationUserHiddenSnapshot = hidden;
            uiCustomizationGlobalHiddenSnapshot = globalHidden;

            // Own column: checked = visible (not in hidden list). Keys the
            // admin hides for everyone are locked for regular users.
            modal.querySelectorAll('[data-ui-key]').forEach(function (cb) {
                var key = cb.getAttribute('data-ui-key');
                var locked = globallyHidden.indexOf(key) !== -1;
                var globalOnly = !!cb.closest('[data-ui-global-only]');
                var item = cb.closest('.ui-custom-item');

                cb.disabled = locked || globalOnly;
                cb.checked = locked ? false : hidden.indexOf(key) === -1;
                if (item) {
                    item.classList.toggle('ui-custom-item-locked', locked);
                    if (locked) {
                        item.setAttribute('title', lockedTitle);
                    } else {
                        item.removeAttribute('title');
                    }
                }
            });

            // Users column (administrators): keys managed by a blocked tenant
            // isolation feature are locked. Disabled in user mode so the
            // toggle buttons and the "unchecked only" filter ignore the
            // hidden column.
            modal.querySelectorAll('[data-ui-global-key]').forEach(function (cb) {
                var key = cb.getAttribute('data-ui-global-key');
                var tenantLocked = isAdminMode && tenantLockedKeys.indexOf(key) !== -1;

                cb.disabled = !isAdminMode || tenantLocked;
                cb.checked = tenantLocked ? false : globalHidden.indexOf(key) === -1;
                cb.classList.toggle('ui-custom-input-locked', tenantLocked);
                if (tenantLocked) {
                    cb.setAttribute('title', tenantLockedTitle);
                } else {
                    cb.removeAttribute('title');
                }
            });

            // Update toggle-all buttons to reflect current state
            modal.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleBtn);
            updateGlobalToggleBtn(modal);

            var filterInput = document.getElementById('uiCustomizationFilterInput');
            if (filterInput) {
                filterInput.value = '';
            }

            var hiddenOnlyToggle = document.getElementById('uiCustomizationHiddenOnly');
            if (hiddenOnlyToggle) {
                hiddenOnlyToggle.checked = false;
            }

            // Every section starts folded on each visit, like the filter
            // is reset: the accordion in initSectionCollapseButtons() opens
            // them one at a time.
            modal.querySelectorAll('.ui-custom-section').forEach(function (section) {
                setUiCustomizationSectionCollapsed(section, true);
            });
            updateCollapseAllBtn(modal);

            applyUiCustomizationFilter(modal, '');

            modal.style.display = 'flex';
        };

        getSetting('hidden_ui_elements', function (value) {
            var hidden = parseHiddenUiCustomization(value);

            if (!isAdminMode) {
                applyState(hidden, [], []);
                return;
            }

            getSetting('hidden_ui_elements_global', function (rawGlobal) {
                var globalHidden = parseHiddenUiCustomization(rawGlobal);

                getTenantIsolationFeatures(function (features) {
                    var keys = [];
                    features.forEach(function (feature) {
                        keys = keys.concat(TENANT_ISOLATION_FEATURE_HIDDEN_KEYS[feature] || []);
                    });
                    applyState(hidden, globalHidden, keys);
                });
            });
        });
    }

    // ========== Icon Sidebar Order ==========
    // The rows are rendered server-side by modals.php from the very list
    // icon_sidebar.php used for the rail, separators included, so this only
    // has to reorder them. The rail itself is rendered in PHP, hence the
    // reload after saving.

    // Same token as POZNOTE_ICON_SIDEBAR_DIVIDER in functions.php: the
    // data-entry-id of a separator row, repeated in the saved order for each
    // line the user placed.
    var ICON_SIDEBAR_DIVIDER = 'divider';

    function getIconSidebarOrderList() {
        return document.getElementById('iconSidebarOrderList');
    }

    function isIconSidebarDividerRow(row) {
        return row.getAttribute('data-entry-id') === ICON_SIDEBAR_DIVIDER;
    }

    // A separator before the first entry, after the last, or right after
    // another one draws nothing, and the rail drops them
    // (poznoteTidyIconSidebarDividers()); do the same so the list shows what
    // the rail will.
    function tidyIconSidebarOrder(order) {
        var tidy = [];
        order.forEach(function (id) {
            if (id !== ICON_SIDEBAR_DIVIDER) {
                tidy.push(id);
            } else if (tidy.length && tidy[tidy.length - 1] !== ICON_SIDEBAR_DIVIDER) {
                tidy.push(id);
            }
        });
        if (tidy.length && tidy[tidy.length - 1] === ICON_SIDEBAR_DIVIDER) {
            tidy.pop();
        }
        return tidy;
    }

    function getIconSidebarOrderIds() {
        var list = getIconSidebarOrderList();
        if (!list) return [];

        return tidyIconSidebarOrder(Array.prototype.map.call(list.querySelectorAll('.icon-sidebar-order-item'), function (row) {
            return row.getAttribute('data-entry-id');
        }).filter(function (id) {
            return !!id;
        }));
    }

    function createIconSidebarDividerRow() {
        var template = document.getElementById('iconSidebarOrderDividerTemplate');
        if (!template || !template.content) return null;
        var row = template.content.firstElementChild;
        return row ? row.cloneNode(true) : null;
    }

    // The saved order can name entries this page does not render (the git
    // buttons only exist on index.php) and can miss ones it does. Walk the
    // saved order, placing each entry it names and a separator row for each
    // divider token, then leave the rest in declared order after it, matching
    // poznoteApplyIconSidebarOrder() in functions.php. With no saved order the
    // server-rendered list already shows the declared layout, so it is kept.
    function applyIconSidebarOrderToList(order) {
        var list = getIconSidebarOrderList();
        if (!list) return;

        order = tidyIconSidebarOrder(order);
        if (!order.length) {
            syncIconSidebarOrderMoveButtons();
            return;
        }

        var rows = Array.prototype.slice.call(list.querySelectorAll('.icon-sidebar-order-item'));
        var byId = {};
        var spareDividers = [];
        rows.forEach(function (row) {
            if (isIconSidebarDividerRow(row)) {
                spareDividers.push(row);
            } else if (!(row.getAttribute('data-entry-id') in byId)) {
                byId[row.getAttribute('data-entry-id')] = row;
            }
        });

        var placed = {};
        var ordered = [];
        order.forEach(function (id) {
            if (id === ICON_SIDEBAR_DIVIDER) {
                var divider = spareDividers.shift() || createIconSidebarDividerRow();
                if (divider) ordered.push(divider);
            } else if (byId[id] && !placed[id]) {
                placed[id] = true;
                ordered.push(byId[id]);
            }
        });
        rows.forEach(function (row) {
            if (!isIconSidebarDividerRow(row) && !placed[row.getAttribute('data-entry-id')]) {
                ordered.push(row);
            }
        });

        // Separator rows the saved order has no place for go away; the rest
        // are re-appended in order.
        spareDividers.forEach(function (row) {
            row.remove();
        });
        ordered.forEach(function (row) {
            list.appendChild(row);
        });

        syncIconSidebarOrderMoveButtons();
    }

    // A new separator lands at the bottom, ready to be dragged (or moved up)
    // to where the line should go.
    function addIconSidebarDividerRow() {
        var list = getIconSidebarOrderList();
        var row = createIconSidebarDividerRow();
        if (!list || !row) return;

        list.appendChild(row);
        syncIconSidebarOrderMoveButtons();
        try { row.scrollIntoView({ block: 'nearest' }); } catch (e) {
            console.debug('settings-page: addIconSidebarDividerRow() failed:', e);
        }
    }

    // The first row cannot move up and the last cannot move down; disabling
    // rather than hiding keeps the rows the same width.
    function syncIconSidebarOrderMoveButtons() {
        var list = getIconSidebarOrderList();
        if (!list) return;

        var rows = list.querySelectorAll('.icon-sidebar-order-item');
        rows.forEach(function (row, index) {
            var up = row.querySelector('[data-move="up"]');
            var down = row.querySelector('[data-move="down"]');
            if (up) up.disabled = index === 0;
            if (down) down.disabled = index === rows.length - 1;
        });
    }

    function moveIconSidebarOrderRow(row, direction) {
        var list = getIconSidebarOrderList();
        if (!list || !row) return;

        if (direction === 'up') {
            var previous = row.previousElementSibling;
            if (previous) list.insertBefore(row, previous);
        } else {
            var next = row.nextElementSibling;
            if (next) list.insertBefore(next, row);
        }

        syncIconSidebarOrderMoveButtons();
    }

    // SortableJS is vendored but not loaded on the settings page; pull it in on
    // first open, exactly as js/tasklist-order-drag.js does. The up/down buttons are the
    // fallback, so a failed load costs nothing but the dragging.
    function initIconSidebarOrderSortable() {
        var list = getIconSidebarOrderList();
        if (!list || list.dataset.sortable === '1') return;

        if (typeof Sortable === 'undefined') {
            if (!document.querySelector('script[data-sortable-local]')) {
                var script = document.createElement('script');
                script.src = (window.poznoteAssetUrl ? window.poznoteAssetUrl('js/Sortable.min.js') : 'js/Sortable.min.js');
                script.async = true;
                script.setAttribute('data-sortable-local', '1');
                script.onload = initIconSidebarOrderSortable;
                document.head.appendChild(script);
            }
            return;
        }

        new Sortable(list, {
            animation: 150,
            handle: '.icon-sidebar-order-handle',
            draggable: '.icon-sidebar-order-item',
            onStart: function (evt) { evt.item.classList.add('dragging'); },
            onEnd: function (evt) {
                evt.item.classList.remove('dragging');
                syncIconSidebarOrderMoveButtons();
            }
        });

        list.dataset.sortable = '1';
    }

    function openIconSidebarOrderModal() {
        var modal = document.getElementById('iconSidebarOrderModal');
        if (!modal) return;

        getSetting('icon_sidebar_order', function (value) {
            var order = [];
            try {
                var decoded = JSON.parse(value || '[]');
                if (Array.isArray(decoded)) {
                    order = decoded.filter(function (id) { return typeof id === 'string' && id; });
                }
            } catch (e) {
                order = [];
            }

            applyIconSidebarOrderToList(order);
            initIconSidebarOrderSortable();
            modal.style.display = 'flex';
        });
    }

    function saveIconSidebarOrder(order) {
        setSetting('icon_sidebar_order', JSON.stringify(order), function (success) {
            if (!success) {
                alert(tr('display.alerts.error_saving_preference', {}, 'Error saving preference'));
                return;
            }

            try { closeModal('iconSidebarOrderModal'); } catch (e) {
                console.debug('settings-page: saveIconSidebarOrder() failed:', e);
            }
            reloadOpener();
            reloadCurrentSettingsPage();
        });
    }

    function initIconSidebarOrderModal() {
        var card = document.getElementById('icon-sidebar-order-card');
        if (card) {
            card.addEventListener('click', openIconSidebarOrderModal);
        }

        var list = getIconSidebarOrderList();
        if (list) {
            list.addEventListener('click', function (event) {
                var button = event.target.closest('.icon-sidebar-order-move');
                if (!button || button.disabled) return;
                var row = button.closest('.icon-sidebar-order-item');
                if (button.hasAttribute('data-remove-divider')) {
                    if (row) row.remove();
                    syncIconSidebarOrderMoveButtons();
                    return;
                }
                moveIconSidebarOrderRow(row, button.getAttribute('data-move'));
            });
        }

        var addDividerBtn = document.getElementById('addIconSidebarDividerBtn');
        if (addDividerBtn) {
            addDividerBtn.addEventListener('click', addIconSidebarDividerRow);
        }

        var saveBtn = document.getElementById('saveIconSidebarOrderBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                saveIconSidebarOrder(getIconSidebarOrderIds());
            });
        }

        // Reset clears the preference, so the rail falls back to the order
        // icon_sidebar.php declares.
        var resetBtn = document.getElementById('resetIconSidebarOrderBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                saveIconSidebarOrder([]);
            });
        }
    }

    function showUiCustomizationModal() {
        openUiCustomizationModal(isUiCustomizationAdmin() ? 'admin' : 'user');
    }

    // ========== Global API ==========
    // Expose functions for external access and inline HTML handlers
    window.showLanguageModal = showLanguageModal;
    window.openNoteSortModal = openNoteSortModal;
    window.openNoteAgeFilterModal = openNoteAgeFilterModal;
    window.showTimezonePrompt = showTimezonePrompt;
    window.openDateTimeFormatModal = openDateTimeFormatModal;
    window.openMarkdownDefaultViewModeModal = openMarkdownDefaultViewModeModal;
    window.openDiaryDateFormatModal = openDiaryDateFormatModal;
    window.refreshLanguageBadge = refreshLanguageBadge;
    window.refreshLoginDisplayBadge = refreshLoginDisplayBadge;
    window.refreshFontSizeBadge = refreshFontSizeBadge;
    window.refreshNoteSortBadge = refreshNoteSortBadge;
    window.refreshNoteAgeFilterBadge = refreshNoteAgeFilterBadge;
    window.refreshTasklistInsertOrderBadge = refreshTasklistInsertOrderBadge;
    window.refreshDiaryNoteTypeBadge = refreshDiaryNoteTypeBadge;
    window.refreshDiaryDateFormatBadge = refreshDiaryDateFormatBadge;
    window.refreshToolbarModeBadge = refreshToolbarModeBadge;
    window.refreshTimezoneBadge = refreshTimezoneBadge;
    window.refreshDateTimeFormatBadge = refreshDateTimeFormatBadge;
    window.refreshMarkdownDefaultViewModeBadge = refreshMarkdownDefaultViewModeBadge;
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

    // ========== Default-credential alert ==========

    // Called by the modules that fix one half of the problem, so the alert at
    // the top of the page settles without a reload. The username modal reloads
    // the whole page anyway (the name is in server-rendered strings), so in
    // practice this is the password path.
    window.poznoteResolveDefaultCredential = function (half) {
        if (half !== 'password' && half !== 'username') return;

        var alertEl = document.getElementById('default-credentials-alert');
        if (!alertEl) return;

        alertEl.setAttribute('data-' + half + '-default', '0');
        var passwordLeft = alertEl.getAttribute('data-password-default') === '1';
        var usernameLeft = alertEl.getAttribute('data-username-default') === '1';

        // Nothing left to warn about: the rail dot goes with it, otherwise it
        // would point at a page with no alert on it.
        if (!passwordLeft && !usernameLeft) {
            alertEl.remove();
            var railDot = document.querySelector('#iconSidebarSettingsBtn .attention-badge');
            if (railDot) railDot.remove();
            return;
        }

        // One half left, so the "both" wording is never the answer here. The
        // password is the security half and sets the tone; with only the
        // username left the alert steps down to a warning.
        alertEl.classList.toggle('alert-error', passwordLeft);
        alertEl.classList.toggle('alert-warning', !passwordLeft);

        var text = alertEl.querySelector('.settings-default-credentials-text');
        if (text) {
            text.textContent = passwordLeft
                ? tr('settings.default_credentials.password', {}, 'This account still uses the password it shipped with. Anyone who can reach this instance can sign in to it.')
                : tr('settings.default_credentials.username', {}, 'This account still uses the username it shipped with.');
        }

        if (!passwordLeft) {
            var passwordBtn = document.getElementById('default-credentials-password-btn');
            if (passwordBtn) passwordBtn.remove();
        }
        if (!usernameLeft) {
            var usernameBtn = document.getElementById('default-credentials-username-btn');
            if (usernameBtn) usernameBtn.remove();
        }
    };

})();
