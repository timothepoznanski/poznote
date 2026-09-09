/**
 * Contextual UI Customization panel (ui_customization_panel.php)
 *
 * Lists the hideable elements of the page it sits on and applies every change
 * at once through the runtime in js/ui-customization.js, then saves the user's
 * hidden_ui_elements setting. Only the user's own set is edited here: the keys
 * the administrator hides for everyone arrive in
 * window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__ and show locked, and the
 * instance-wide column stays in the settings page modal.
 */
(function () {
    'use strict';

    var SETTING_URL = '/api/v1/settings/hidden_ui_elements';
    var SAVE_DELAY_MS = 400;
    var STATUS_CLEAR_MS = 2000;

    var panel = null;
    var toggleButton = null;
    // The user's saved set, as last read from or written to the API. Locked
    // checkboxes keep their stored state on save instead of adopting the lock.
    var storedHidden = [];
    var saveTimer = null;
    var statusTimer = null;
    var saveSeq = 0;

    function runtime() {
        return window.PoznoteUiCustomization || null;
    }

    function normalizeKeys(keys) {
        var rt = runtime();
        if (!Array.isArray(keys)) return [];
        return rt && typeof rt.normalizeKeys === 'function' ? rt.normalizeKeys(keys) : keys.slice();
    }

    function getLockedKeyMap() {
        var map = Object.create(null);
        normalizeKeys(window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__).forEach(function (key) {
            map[key] = true;
        });
        return map;
    }

    // Keeps only the sections and items whose data-ui-pages names this page
    // (see modals/ui_customization_sections.php).
    function pruneForPage(page) {
        function pagesOf(element, fallback) {
            var attr = element.getAttribute('data-ui-pages');
            return attr === null ? fallback : attr.split(/\s+/).filter(Boolean);
        }

        panel.querySelectorAll('.ui-custom-section').forEach(function (section) {
            var sectionPages = pagesOf(section, []);
            section.querySelectorAll('.ui-custom-item').forEach(function (item) {
                if (pagesOf(item, sectionPages).indexOf(page) === -1) {
                    item.parentNode.removeChild(item);
                }
            });
            if (!section.querySelector('.ui-custom-item')) {
                section.parentNode.removeChild(section);
            }
        });
    }

    function normalizeFilterText(value) {
        var text = String(value || '').toLowerCase().trim();
        if (typeof text.normalize === 'function') {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return text.replace(/\s+/g, ' ');
    }

    function applyFilter(value) {
        var query = normalizeFilterText(value);
        var anyVisible = false;

        panel.classList.toggle('ui-custom-filtering', query.length > 0);

        panel.querySelectorAll('.ui-custom-section').forEach(function (section) {
            var visibleItems = 0;
            section.querySelectorAll('.ui-custom-item').forEach(function (item) {
                var matches = !query || normalizeFilterText(item.textContent).indexOf(query) !== -1;
                item.hidden = !matches;
                if (matches) visibleItems += 1;
            });
            section.hidden = visibleItems === 0;
            if (visibleItems > 0) anyVisible = true;
        });

        var empty = document.getElementById('uiCustomizationPanelEmpty');
        if (empty) empty.hidden = anyVisible;
    }

    // Sections fold like the settings modal: one open at a time, the chevron
    // in the title toggles it. A filter query shows everything (CSS).
    function isSectionCollapsed(section) {
        return section.classList.contains('ui-custom-section-collapsed');
    }

    function setSectionCollapsed(section, collapsed) {
        var title = section.querySelector('.ui-custom-section-title');
        section.classList.toggle('ui-custom-section-collapsed', collapsed);
        if (title) title.classList.toggle('ui-custom-section-collapsed', collapsed);
        var toggle = section.querySelector('.ui-custom-section-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function initSections() {
        panel.querySelectorAll('.ui-custom-section').forEach(function (section) {
            var title = section.querySelector('.ui-custom-section-title');
            if (title && !title.querySelector('.ui-custom-section-toggle')) {
                var toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'ui-custom-section-toggle';
                toggle.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
                title.appendChild(toggle);
            }
            setSectionCollapsed(section, true);
        });
    }

    function updateSectionToggleButton(section) {
        var btn = section.querySelector('.ui-custom-toggle-all');
        if (!btn) return;
        var checkboxes = section.querySelectorAll('[data-ui-key]:not(:disabled)');
        var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
        btn.textContent = allChecked
            ? (btn.getAttribute('data-label-uncheck') || 'Uncheck all')
            : (btn.getAttribute('data-label-check') || 'Check all');
    }

    function setStatus(state) {
        var status = document.getElementById('uiCustomizationPanelStatus');
        if (!status) return;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        status.textContent = state ? (panel.getAttribute('data-status-' + state) || '') : '';
        status.className = 'ui-custom-panel-status' + (state ? ' ui-custom-panel-status-' + state : '');
        if (state === 'saved') {
            statusTimer = setTimeout(function () { setStatus(''); }, STATUS_CLEAR_MS);
        }
    }

    // Checked means visible. Disabled boxes (locked by the administrator) are
    // not the user's choice: their stored state is kept as is.
    function collectHidden() {
        var hidden = [];
        panel.querySelectorAll('[data-ui-key]').forEach(function (cb) {
            var key = cb.getAttribute('data-ui-key');
            if (cb.disabled) {
                if (storedHidden.indexOf(key) !== -1) hidden.push(key);
                return;
            }
            if (!cb.checked) hidden.push(key);
        });
        return hidden;
    }

    function applyLive(hidden) {
        var rt = runtime();
        if (rt && typeof rt.apply === 'function') {
            rt.apply(hidden);
        }
    }

    function save(hidden) {
        var seq = ++saveSeq;
        setStatus('saving');
        fetch(SETTING_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: JSON.stringify(hidden) })
        })
            .then(function (r) { return r.json(); })
            .then(function (result) {
                if (seq !== saveSeq) return;
                if (result && result.success) {
                    storedHidden = hidden;
                    setStatus('saved');
                } else {
                    setStatus('error');
                }
            })
            .catch(function () {
                if (seq === saveSeq) setStatus('error');
            });
    }

    function commit() {
        var hidden = collectHidden();
        applyLive(hidden);
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            saveTimer = null;
            save(hidden);
        }, SAVE_DELAY_MS);
    }

    function renderState(hidden) {
        var locked = getLockedKeyMap();
        var lockedTitle = panel.getAttribute('data-locked-title') || '';

        storedHidden = hidden;
        panel.querySelectorAll('[data-ui-key]').forEach(function (cb) {
            var key = cb.getAttribute('data-ui-key');
            var isLocked = !!locked[key];
            var item = cb.closest('.ui-custom-item');

            cb.disabled = isLocked;
            cb.checked = isLocked ? false : hidden.indexOf(key) === -1;
            if (item) {
                item.classList.toggle('ui-custom-item-locked', isLocked);
                if (isLocked) {
                    item.setAttribute('title', lockedTitle);
                } else {
                    item.removeAttribute('title');
                }
            }
        });
        panel.querySelectorAll('.ui-custom-section').forEach(updateSectionToggleButton);
    }

    // Re-read the saved set on every open: the settings page modal may have
    // changed it since.
    function load() {
        fetch(SETTING_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var hidden = [];
                if (j && j.success && j.value) {
                    try { hidden = JSON.parse(j.value); } catch (e) { hidden = []; }
                }
                renderState(normalizeKeys(hidden));
            })
            .catch(function () {
                renderState([]);
            });
    }

    function isOpen() {
        return panel.classList.contains('ui-custom-panel-open');
    }

    function setOpen(open) {
        panel.classList.toggle('ui-custom-panel-open', open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if ('inert' in panel) panel.inert = !open;
        document.body.classList.toggle('ui-custom-panel-open', open);
        toggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            setStatus('');
            load();
        }
        // On phones the panel covers the page: let the Back button close it
        // (js/panel-back.js).
        if (window.PoznotePanelBack) {
            if (open) window.PoznotePanelBack.opened();
            else window.PoznotePanelBack.closed();
        }
    }

    function init() {
        panel = document.getElementById('uiCustomizationPanel');
        toggleButton = document.getElementById('uiCustomizationPanelToggle');
        if (!panel || !toggleButton) return;

        pruneForPage(panel.getAttribute('data-ui-page') || 'notes');
        initSections();
        if ('inert' in panel) panel.inert = true;

        if (window.PoznotePanelBack) {
            window.PoznotePanelBack.register({
                isOpen: isOpen,
                close: function () { setOpen(false); }
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-action="toggle-ui-customization-panel"]')) {
                e.preventDefault();
                setOpen(!isOpen());
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) {
                setOpen(false);
            }
        });

        panel.addEventListener('click', function (e) {
            var toggleAll = e.target.closest('.ui-custom-toggle-all');
            if (toggleAll) {
                var section = toggleAll.closest('.ui-custom-section');
                if (!section) return;
                var checkboxes = section.querySelectorAll('[data-ui-key]:not(:disabled)');
                var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
                checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
                updateSectionToggleButton(section);
                commit();
                return;
            }

            var title = e.target.closest('.ui-custom-section-title');
            if (!title) return;
            var clicked = title.closest('.ui-custom-section');
            if (!clicked) return;
            var expand = isSectionCollapsed(clicked);
            panel.querySelectorAll('.ui-custom-section').forEach(function (section) {
                setSectionCollapsed(section, section !== clicked || !expand);
            });
        });

        panel.addEventListener('change', function (e) {
            if (!e.target || !e.target.matches || !e.target.matches('[data-ui-key]')) return;
            var section = e.target.closest('.ui-custom-section');
            if (section) updateSectionToggleButton(section);
            commit();
        });

        var filter = document.getElementById('uiCustomizationPanelFilter');
        if (filter) {
            filter.addEventListener('input', function () {
                applyFilter(filter.value);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
