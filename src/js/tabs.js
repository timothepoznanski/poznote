/**
 * In-App Tab Bar
 *
 * Manages a browser-like tab bar inside #right_col.
 * - First note opened auto-creates a tab.
 * - Sidebar navigation updates the active tab's note.
 * - "Open in new tab" creates an additional tab.
 * - Tabs are persisted per-workspace in localStorage.
 *
 * Exposes window.tabManager for use by other modules.
 */

(function () {
    'use strict';

    /** Helper to check if tabs are enabled via global config */
    function _areTabsEnabled() {
        // Disabled on mobile (viewport ≤ 800px)
        return window.innerWidth > 800;
    }

    // ── State ──────────────────────────────────────────────────────────────

    /** @type {Array<{id: string, noteId: string, title: string}>} */
    var tabs = [];

    /** ID of the currently active tab, or null when no tabs exist. */
    var activeTabId = null;

    /**
     * Set before calling loadNoteDirectly from switchToTab().
     * Tells _onNoteLoaded that this is a tab-switch (not a sidebar navigation).
     * @type {string|null}
     */
    var _pendingTabSwitch = null;

    // ── Helpers ────────────────────────────────────────────────────────────

    function _getWorkspace() {
        if (window.selectedWorkspace) return window.selectedWorkspace;
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('workspace') || 'default';
        } catch (e) {
            return 'default';
        }
    }

    function _storageKey() {
        return 'poznote_tabs_' + _getWorkspace();
    }

    function _saveToStorage() {
        try {
            localStorage.setItem(_storageKey(), JSON.stringify({
                tabs: tabs,
                activeTabId: activeTabId
            }));
        } catch (e) {
            // Storage quota or private mode — silently ignore
        }
    }

    function _loadFromStorage() {
        try {
            var raw = localStorage.getItem(_storageKey());
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (Array.isArray(data.tabs)) return data;
        } catch (e) { }
        return null;
    }

    function _findTabById(id) {
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id === id) return tabs[i];
        }
        return null;
    }

    function _indexById(id) {
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id === id) return i;
        }
        return -1;
    }

    function _generateId() {
        return 'tab_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }

    /** Read a note's current title from the DOM, fallback to stored value. */
    function _readTitle(noteId, fallback) {
        var el = document.getElementById('inp' + noteId);
        if (el && el.value.trim()) return el.value.trim();
        return fallback || 'Untitled';
    }

    function _buildUrl(noteId) {
        var workspace = _getWorkspace();
        return 'index.php?workspace=' + encodeURIComponent(workspace) +
            '&note=' + encodeURIComponent(noteId);
    }

    // ── Render ─────────────────────────────────────────────────────────────

    /**
     * (Re-)create #app-tab-bar as the first child of #right_col.
     * Called after every state change and after AJAX note loads.
     */
    function render() {
        var rightPane = document.getElementById('right_pane') || document.getElementById('right_col');
        if (!rightPane) return;

        var bar = document.getElementById('app-tab-bar');

        if (!_areTabsEnabled()) {
            if (bar) bar.style.display = 'none';
            document.body.classList.remove('has-internal-tabs');
            return;
        }
        document.body.classList.add('has-internal-tabs');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'app-tab-bar';

            // Event delegation on the bar (only once)
            bar.addEventListener('click', function (e) {
                var closeBtn = e.target.closest('.app-tab-close');
                if (closeBtn) {
                    var tabEl = closeBtn.closest('.app-tab');
                    if (tabEl) closeTab(tabEl.getAttribute('data-tab-id'));
                    return;
                }
                var tabEl = e.target.closest('.app-tab');
                if (tabEl) switchToTab(tabEl.getAttribute('data-tab-id'));
            });

            // Prepend to right_pane so it sits above #right_col
            rightPane.insertBefore(bar, rightPane.firstChild);
        }

        // Clear existing tabs
        bar.innerHTML = '';

        tabs.forEach(function (tab) {
            var el = document.createElement('div');
            el.className = 'app-tab' + (tab.id === activeTabId ? ' active' : '');
            el.setAttribute('data-tab-id', tab.id);

            var titleSpan = document.createElement('span');
            titleSpan.className = 'app-tab-title';
            titleSpan.textContent = tab.title || 'Untitled';
            titleSpan.title = tab.title || 'Untitled';

            el.appendChild(titleSpan);

            if (tabs.length > 1) {
                var closeBtn = document.createElement('button');
                closeBtn.className = 'app-tab-close';
                closeBtn.setAttribute('aria-label', 'Close tab');
                closeBtn.textContent = '×';
                el.appendChild(closeBtn);
            }
            bar.appendChild(el);
        });

        // Ensure active tab is visible if bar overflowed
        if (activeTabId) {
            var activeEl = bar.querySelector('.app-tab.active');
            if (activeEl && typeof activeEl.scrollIntoView === 'function') {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }

        updateOpenInNewTabButtons();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Called when "open in new tab" is clicked (from note toolbar or sidebar menu).
     * Creates a new tab for the given note and makes it active.
     * If the note is not currently displayed, loads it via AJAX.
     */
    function openInNewTab(noteId, title) {
        // Internal tabs are always enabled (except on mobile where this won't be called)
        noteId = String(noteId);

        // Check if tab already exists for this note
        var existingTab = null;
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].noteId === noteId) {
                existingTab = tabs[i];
                break;
            }
        }

        if (existingTab) {
            switchToTab(existingTab.id);
            return;
        }

        var newTab = { id: _generateId(), noteId: noteId, title: title || 'Untitled' };
        tabs.push(newTab);
        activeTabId = newTab.id;
        _saveToStorage();
        render();

        // If the note isn't currently loaded in the right column, load it now.
        // Use _pendingTabSwitch so _onNoteLoaded refreshes the title instead of
        // creating yet another tab entry.
        var isLoaded = !!document.getElementById('inp' + noteId);
        if (!isLoaded) {
            _pendingTabSwitch = newTab.id;
            var url = _buildUrl(noteId);
            if (typeof window.loadNoteDirectly === 'function') {
                window.loadNoteDirectly(url, noteId, null, null);
            }
        }
    }

    /**
     * Called when a tab is clicked.
     * Sets _pendingTabSwitch so _onNoteLoaded knows not to update tab state,
     * then loads the tab's note.
     */
    function switchToTab(tabId) {
        var tab = _findTabById(tabId);
        if (!tab) return;
        if (tab.id === activeTabId) return; // already active

        _pendingTabSwitch = tabId;

        var url = _buildUrl(tab.noteId);
        if (typeof window.loadNoteDirectly === 'function') {
            window.loadNoteDirectly(url, tab.noteId, null, null);
        } else {
            // Fallback — full page navigation
            window.location.href = url;
        }
    }

    /**
     * Called when a tab's × button is clicked.
     * Removes the tab and switches to the closest neighbour.
     * The last remaining tab cannot be closed unless force is true.
     */
    function closeTab(tabId, force) {
        if (!force && tabs.length <= 1) return; // cannot close the last tab via UI
        var idx = _indexById(tabId);
        if (idx === -1) return;

        var wasActive = (tabId === activeTabId);
        tabs.splice(idx, 1);

        if (tabs.length === 0) {
            // Last tab closed
            activeTabId = null;
            _saveToStorage();
            render();
            return;
        }

        if (wasActive) {
            // Prefer left neighbour, else right
            var newIdx = idx > 0 ? idx - 1 : 0;
            var nextTab = tabs[newIdx];
            activeTabId = nextTab.id;
            _saveToStorage();
            render();
            // Load the tab's note
            _pendingTabSwitch = nextTab.id;
            var url = _buildUrl(nextTab.noteId);
            if (typeof window.loadNoteDirectly === 'function') {
                window.loadNoteDirectly(url, nextTab.noteId, null, null);
            }
        } else {
            _saveToStorage();
            render();
        }
    }

    /**
     * Close all tabs associated with a specific note ID.
     * Used when a note is deleted.
     */
    function closeTabByNoteId(noteId) {
        noteId = String(noteId);
        // Iterate backwards to avoid index shifting issues
        for (var i = tabs.length - 1; i >= 0; i--) {
            if (tabs[i].noteId === noteId) {
                closeTab(tabs[i].id, true); // true = force close even if it's the last one
            }
        }
    }

    /**
     * Hook called from loadNoteCommon immediately after innerHTML replacement.
     * Decides whether to update the active tab's note (regular navigation)
     * or just confirm the tab switch (tab click).
     * @param {string|number} noteId
     */
    function _onNoteLoaded(noteId) {
        if (!_areTabsEnabled()) return;
        noteId = String(noteId);

        if (_pendingTabSwitch !== null) {
            // Tab click or new-tab load — activate and refresh title from DOM
            activeTabId = _pendingTabSwitch;
            _pendingTabSwitch = null;
            var switchedTab = _findTabById(activeTabId);
            if (switchedTab && switchedTab.noteId === noteId) {
                var freshTitle = _readTitle(noteId, switchedTab.title);
                switchedTab.title = freshTitle;
            }
            _saveToStorage();
            return;
        }

        // Regular sidebar navigation (or initial load via AJAX)
        var title = _readTitle(noteId, 'Untitled');

        // Check if an existing tab already has this noteId (from a previous session or manual nav)
        // If so, just activate it
        var existingTabWithNote = null;
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].noteId === noteId) {
                existingTabWithNote = tabs[i];
                break;
            }
        }

        if (existingTabWithNote) {
            // Found existing tab for this note - make it active
            activeTabId = existingTabWithNote.id;
            existingTabWithNote.title = title; // Update title just in case
        } else if (activeTabId !== null) {
            // Update the active tab to the new note
            var tab = _findTabById(activeTabId);
            if (tab) {
                tab.noteId = noteId;
                tab.title = title;
            }
        } else {
            // No active tab — create the first tab
            var newTab = { id: _generateId(), noteId: noteId, title: title };
            tabs.push(newTab);
            activeTabId = newTab.id;
        }

        _saveToStorage();
    }

    // ── Title live-update ──────────────────────────────────────────────────

    document.addEventListener('input', function (e) {
        if (!e.target.classList.contains('css-title')) return;
        var noteId = e.target.id.replace('inp', '');
        if (!noteId) return;

        var changed = false;
        tabs.forEach(function (tab) {
            if (tab.noteId === noteId) {
                tab.title = e.target.value.trim() || 'Untitled';
                changed = true;
            }
        });

        if (changed) {
            _saveToStorage();
            render();
        }
    });

    // ── Initialisation ─────────────────────────────────────────────────────

    function _init() {
        // Read current note from page config
        var currentNoteId = null;
        try {
            var configEl = document.getElementById('current-note-data');
            if (configEl) {
                var config = JSON.parse(configEl.textContent);
                currentNoteId = config.noteId ? String(config.noteId) : null;
            }
        } catch (e) { }

        // Try to restore from localStorage
        var stored = _loadFromStorage();
        if (stored && stored.tabs.length > 0) {
            tabs = stored.tabs;
            activeTabId = stored.activeTabId || null;

            // Validate activeTabId is still in the list
            if (activeTabId && !_findTabById(activeTabId)) {
                activeTabId = tabs[0].id;
            }

            if (currentNoteId) {
                // Find a tab whose noteId matches the current URL note
                var matchingTab = null;
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].noteId === currentNoteId) {
                        matchingTab = tabs[i];
                        break;
                    }
                }

                if (matchingTab) {
                    // Make the matching tab active
                    activeTabId = matchingTab.id;
                } else if (activeTabId) {
                    // Active tab's note doesn't match URL — update it
                    var activeTab = _findTabById(activeTabId);
                    if (activeTab) {
                        activeTab.noteId = currentNoteId;
                        activeTab.title = _readTitle(currentNoteId, 'Untitled');
                    }
                }
            }

            _saveToStorage();
            render();
            return;
        }

        if (!_areTabsEnabled()) {
            return;
        }

        // No stored tabs — create first tab from the current note
        if (currentNoteId) {
            var title = _readTitle(currentNoteId, 'Untitled');
            tabs = [{ id: _generateId(), noteId: currentNoteId, title: title }];
            activeTabId = tabs[0].id;
            _saveToStorage();
            render();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    // ── Expose ─────────────────────────────────────────────────────────────

    /**
     * Check if a note is currently open in a tab
     * @param {string|number} noteId
     * @returns {boolean}
     */
    function isNoteOpen(noteId) {
        if (!_areTabsEnabled()) return false;
        noteId = String(noteId);
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].noteId === noteId) return true;
        }
        return false;
    }

    // ── Update UI for "Open in new tab" buttons ────────────────────────────

    function updateOpenInNewTabButtons() {
        if (!_areTabsEnabled()) return;

        // Selector to find all relevant buttons:
        // 1. Sidebar/Toolbar buttons with data-action="open-note-new-tab"
        // 2. Toolbar menu proxy items with data-selector=".btn-open-new-tab"
        var selector = '[data-action="open-note-new-tab"], [data-selector=".btn-open-new-tab"]';
        var elements = document.querySelectorAll(selector);

        elements.forEach(function (el) {
            var noteId = el.getAttribute('data-note-id');

            // If no direct note-id (e.g. toolbar menu items), try to find parent note card
            if (!noteId) {
                var card = el.closest('.notecard');
                if (card && card.id && card.id.startsWith('note')) {
                    noteId = card.id.replace('note', '');
                }
            }

            if (noteId) {
                var isOpen = false;
                // Manual check instead of calling isNoteOpen to avoid potential scope issues
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].noteId === String(noteId)) {
                        isOpen = true;
                        break;
                    }
                }

                // General hiding logic - if open, hide. Else reset to default.
                // This covers:
                // - Sidebar menu items (.note-actions-menu-item)
                // - Sidebar icon buttons (.note-actions-item)
                // - Toolbar icon buttons (.toolbar-btn)
                // - Toolbar menu items (.dropdown-item)
                el.style.display = isOpen ? 'none' : '';
            }
        });
    }

    window.tabManager = {
        openInNewTab: openInNewTab,
        switchToTab: switchToTab,
        closeTab: closeTab,
        closeTabByNoteId: closeTabByNoteId,
        isNoteOpen: isNoteOpen,
        render: render,
        updateUI: updateOpenInNewTabButtons, // Expose for external calls
        _onNoteLoaded: _onNoteLoaded
    };

})();
