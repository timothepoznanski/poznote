/**
 * Contextual UI Customization panel (ui_customization_panel.php)
 *
 * Also drives the "..." menu of the floating stack at the bottom-right of the
 * page, which opens this panel, the keyboard shortcuts modal and the Markdown
 * syntax modal.
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
    var moreButton = null;
    var moreMenu = null;
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

    // Pages whose hideable elements are all rendered server side under the id
    // the key names, so an absent element means the page does not offer it to
    // this user: the settings page leaves out the administrator cards and the
    // cards of the features that are switched off, and the icon rail its
    // conditional buttons. Elsewhere a key may name an element built later
    // (menu entries, toolbar buttons), which must stay listed.
    var PRUNE_MISSING_PAGES = { settings: true };

    // Keeps only the sections and items whose data-ui-pages names this page
    // (see modals/ui_customization_sections.php).
    function pruneForPage(page) {
        var pruneMissing = !!PRUNE_MISSING_PAGES[page];

        function pagesOf(element, fallback) {
            var attr = element.getAttribute('data-ui-pages');
            return attr === null ? fallback : attr.split(/\s+/).filter(Boolean);
        }

        // A hidden card is still in the DOM (the runtime only sets
        // display: none on it), so unchecking one never drops it from the
        // list.
        function isOnPage(item) {
            if (!pruneMissing) return true;
            var checkbox = item.querySelector('[data-ui-key]');
            var key = checkbox ? checkbox.getAttribute('data-ui-key') : '';
            if (key.indexOf('card:') !== 0) return true;
            return !!document.getElementById(key.slice('card:'.length));
        }

        panel.querySelectorAll('.ui-custom-section').forEach(function (section) {
            var sectionPages = pagesOf(section, []);
            section.querySelectorAll('.ui-custom-item').forEach(function (item) {
                if (pagesOf(item, sectionPages).indexOf(page) === -1 || !isOnPage(item)) {
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
    //
    // The saved preference covers the whole interface, but the panel only lists
    // this page (pruneForPage removes the rest of the items outright), so the
    // keys it does not list are carried over from what was loaded. Without this
    // pass, toggling one box on the dashboard saved a list built from the
    // dashboard items alone and dropped every note and settings key the user
    // had hidden.
    function collectHidden() {
        var hidden = [];
        var listed = Object.create(null);
        panel.querySelectorAll('[data-ui-key]').forEach(function (cb) {
            var key = cb.getAttribute('data-ui-key');
            listed[key] = true;
            if (cb.disabled) {
                if (storedHidden.indexOf(key) !== -1) hidden.push(key);
                return;
            }
            if (!cb.checked) hidden.push(key);
        });
        storedHidden.forEach(function (key) {
            if (!listed[key]) hidden.push(key);
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

    // Check all / Uncheck all replaces the section's selection wholesale (and
    // saves immediately), so ask first, like the Settings modal does
    function confirmToggleAll(done) {
        var tr = typeof window.t === 'function'
            ? window.t
            : function (key, params, fallback) { return fallback; };
        var message = tr('modals.ui_customization.toggle_all_warning', {},
            'This will lose all your existing customizations. Do you want to continue?');
        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(message, tr('modals.ui_customization.panel_title', {}, 'Customize this page'))
                .then(function (confirmed) { if (confirmed) done(); });
        } else if (window.confirm(message)) {
            done();
        }
    }

    // "..." menu of the floating stack
    function isMoreMenuOpen() {
        return !!moreMenu && !moreMenu.hidden;
    }

    // Entries the UI Customization runtime has not hidden
    function visibleMoreMenuItems() {
        return Array.prototype.filter.call(moreMenu.querySelectorAll('.page-more-menu-item'), function (item) {
            return item.offsetParent !== null;
        });
    }

    function setMoreMenuOpen(open) {
        if (!moreMenu || !moreButton) return;
        moreMenu.hidden = !open;
        moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            var items = visibleMoreMenuItems();
            if (items.length) items[0].focus();
        }
    }

    // Help modals of the menu (keyboard shortcuts, Markdown syntax), one open
    // at a time. The shortcuts markup names Ctrl and Alt; on macOS the
    // handlers listen to Command and Option instead.
    var isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
    var HELP_MODAL_IDS = {
        'open-keyboard-shortcuts': 'keyboardShortcutsModal',
        'open-markdown-syntax': 'markdownSyntaxModal'
    };

    function openHelpModal() {
        var modals = document.querySelectorAll('.pz-help-modal');
        for (var i = 0; i < modals.length; i++) {
            if (modals[i].style.display === 'flex') return modals[i];
        }
        return null;
    }

    function setHelpModalOpen(modal, open) {
        if (!modal) return;
        if (open && isMacPlatform) {
            modal.querySelectorAll('kbd[data-key="mod"]').forEach(function (kbd) { kbd.textContent = '⌘'; });
            modal.querySelectorAll('kbd[data-key="alt"]').forEach(function (kbd) { kbd.textContent = '⌥'; });
        }
        modal.style.display = open ? 'flex' : 'none';
        if (open) {
            var body = modal.querySelector('.pz-help-modal-body');
            if (body) body.scrollTop = 0;
            // The syntax reference starts on its filter, the shortcuts on
            // the close button
            var focusTarget = modal.querySelector('.filter-input') || modal.querySelector('[data-action="close-help-modal"]');
            if (focusTarget) focusTarget.focus();
        } else if (moreButton) {
            moreButton.focus();
        }
    }

    // Filter of the Markdown syntax reference (markdown_syntax_content.php)
    function initMarkdownSyntaxFilter() {
        var filterInput = document.getElementById('markdownSyntaxFilterInput');
        if (!filterInput) return;

        var clearButton = document.getElementById('markdownSyntaxClearFilter');
        var filterStats = document.getElementById('markdownSyntaxFilterStats');
        var noResults = document.getElementById('markdownSyntaxNoResults');
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-syntax-card]'));

        function applyFilter() {
            var query = normalizeFilterText(filterInput.value);
            var visibleCount = 0;

            cards.forEach(function (card) {
                var matches = !query || normalizeFilterText(card.textContent).indexOf(query) !== -1;
                card.hidden = !matches;
                if (matches) visibleCount += 1;
            });

            if (clearButton) clearButton.hidden = query === '';
            if (filterStats) {
                filterStats.textContent = query ? visibleCount + ' / ' + cards.length : '';
                filterStats.hidden = query === '';
            }
            if (noResults) noResults.hidden = visibleCount !== 0;
        }

        function clearFilter() {
            filterInput.value = '';
            applyFilter();
            filterInput.focus();
        }

        filterInput.addEventListener('input', applyFilter);
        // Escape empties a filled filter before it closes the modal
        filterInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && filterInput.value !== '') {
                e.preventDefault();
                clearFilter();
            }
        });
        if (clearButton) clearButton.addEventListener('click', clearFilter);
    }

    function initMoreMenu() {
        moreButton = document.getElementById('pageMoreMenuBtn');
        moreMenu = document.getElementById('pageMoreMenu');
        if (!moreButton || !moreMenu) return;

        initMarkdownSyntaxFilter();

        document.addEventListener('click', function (e) {
            var action = e.target.closest ? e.target.closest('[data-action]') : null;
            var name = action ? action.getAttribute('data-action') : '';

            if (name === 'toggle-page-more-menu') {
                e.preventDefault();
                setMoreMenuOpen(!isMoreMenuOpen());
                return;
            }

            if (isMoreMenuOpen() && !moreMenu.contains(e.target)) {
                setMoreMenuOpen(false);
            }

            if (!action || !moreMenu.contains(action)) {
                // The close button, or a click on the backdrop
                var modal = openHelpModal();
                if (modal && (name === 'close-help-modal' || e.target === modal)) {
                    setHelpModalOpen(modal, false);
                }
                return;
            }

            // An entry of the menu: close it, then run the entry
            setMoreMenuOpen(false);
            if (HELP_MODAL_IDS[name]) {
                e.preventDefault();
                setHelpModalOpen(document.getElementById(HELP_MODAL_IDS[name]), true);
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.defaultPrevented || e.key !== 'Escape') return;
            if (isMoreMenuOpen()) {
                e.preventDefault();
                setMoreMenuOpen(false);
                moreButton.focus();
                return;
            }
            var modal = openHelpModal();
            if (modal) {
                e.preventDefault();
                setHelpModalOpen(modal, false);
            }
        });

        // Arrow keys move between the entries, like the other dropdowns
        moreMenu.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            var items = visibleMoreMenuItems();
            if (!items.length) return;
            e.preventDefault();
            var index = items.indexOf(document.activeElement);
            var next = e.key === 'ArrowDown' ? index + 1 : index - 1;
            items[(next + items.length) % items.length].focus();
        });
    }

    function init() {
        initMoreMenu();

        panel = document.getElementById('uiCustomizationPanel');
        if (!panel) return;

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
            if (e.target.closest && e.target.closest('[data-action="toggle-ui-customization-panel"]')) {
                e.preventDefault();
                setOpen(!isOpen());
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !e.defaultPrevented && isOpen()) {
                setOpen(false);
            }
        });

        panel.addEventListener('click', function (e) {
            var toggleAll = e.target.closest('.ui-custom-toggle-all');
            if (toggleAll) {
                var section = toggleAll.closest('.ui-custom-section');
                if (!section) return;
                confirmToggleAll(function () {
                    var checkboxes = section.querySelectorAll('[data-ui-key]:not(:disabled)');
                    var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
                    checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
                    updateSectionToggleButton(section);
                    commit();
                });
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

        // A button hidden from its right-click menu (js/icon-sidebar-colors.js)
        // saved the set itself: adopt it, or the next change here would
        // write the stale set back and show the button again.
        document.addEventListener('poznote-hidden-ui-elements-saved', function (e) {
            if (e.detail && Array.isArray(e.detail.hidden)) {
                renderState(normalizeKeys(e.detail.hidden));
            }
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
