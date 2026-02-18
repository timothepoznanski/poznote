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
        } catch (e) {}
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
        var rightCol = document.getElementById('right_col');
        if (!rightCol) return;

        // Remove existing tab bar
        var existing = document.getElementById('app-tab-bar');
        if (existing) existing.parentNode.removeChild(existing);

        var bar = document.createElement('div');
        bar.id = 'app-tab-bar';

        tabs.forEach(function (tab) {
            var el = document.createElement('div');
            el.className = 'app-tab' + (tab.id === activeTabId ? ' active' : '');
            el.setAttribute('data-tab-id', tab.id);

            var titleSpan = document.createElement('span');
            titleSpan.className = 'app-tab-title';
            titleSpan.textContent = tab.title || 'Untitled';
            titleSpan.title = tab.title || 'Untitled';

            var closeBtn = document.createElement('button');
            closeBtn.className = 'app-tab-close';
            closeBtn.setAttribute('aria-label', 'Close tab');
            closeBtn.textContent = '×';

            el.appendChild(titleSpan);
            el.appendChild(closeBtn);
            bar.appendChild(el);
        });

        // Event delegation on the bar
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

        // Prepend to right_col so it sits above the notecard
        rightCol.insertBefore(bar, rightCol.firstChild);
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Called when "open in new tab" is clicked (from note toolbar or sidebar menu).
     * Creates a new tab for the given note and makes it active.
     * If the note is not currently displayed, loads it via AJAX.
     */
    function openInNewTab(noteId, title) {
        noteId = String(noteId);
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
     * The last remaining tab cannot be closed.
     */
    function closeTab(tabId) {
        if (tabs.length <= 1) return; // cannot close the last tab
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
     * Hook called from loadNoteCommon immediately after innerHTML replacement.
     * Decides whether to update the active tab's note (regular navigation)
     * or just confirm the tab switch (tab click).
     * @param {string|number} noteId
     */
    function _onNoteLoaded(noteId) {
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

        if (activeTabId !== null) {
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
        } catch (e) {}

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

    window.tabManager = {
        openInNewTab: openInNewTab,
        switchToTab: switchToTab,
        closeTab: closeTab,
        render: render,
        _onNoteLoaded: _onNoteLoaded
    };

})();
