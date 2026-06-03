/**
 * In-App Tab Bar
 *
 * Manages a browser-like tab bar inside #right_col.
 * - First note opened auto-creates a tab.
 * - Sidebar navigation updates the active tab's note.
 * - Kanban folder views can live in the same tab bar as notes.
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

    /** @type {Array<{id: string, type?: string, noteId?: string, folderId?: string, title: string}>} */
    var tabs = [];

    /** ID of the currently active tab, or null when no tabs exist. */
    var activeTabId = null;

    /** Whether persisted tabs have been restored for this page load. */
    var hasInitialized = false;

    /**
     * Set before calling loadNoteDirectly from switchToTab().
     * Tells _onNoteLoaded that this is a tab-switch (not a sidebar navigation).
     * @type {string|null}
     */
    var _pendingTabSwitch = null;

    // ── Helpers ────────────────────────────────────────────────────────────

    /** Get translated default title for new/untitled notes */
    function _getDefaultTitle() {
        return window.t ? window.t('index.note.new_note', null, 'New note') : 'New note';
    }

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

    function _getTabType(tab) {
        return tab && tab.type === 'kanban' ? 'kanban' : 'note';
    }

    function _isNoteTab(tab) {
        return _getTabType(tab) === 'note';
    }

    function _isKanbanTab(tab) {
        return _getTabType(tab) === 'kanban';
    }

    function _getDefaultKanbanTitle() {
        return window.t ? window.t('notes_list.folder_actions.kanban_view', null, 'Kanban view') : 'Kanban view';
    }

    function _matchDefaultNoteTitle(title) {
        var normalizedTitle = String(title || '').trim();
        if (!normalizedTitle) return null;

        if (typeof window.matchDefaultNoteTitleText === 'function') {
            var defaultMatch = window.matchDefaultNoteTitleText(normalizedTitle);
            if (defaultMatch) return defaultMatch;
        }

        var legacyUntitledMatch = /^Untitled(?: \((\d+)\))?$/.exec(normalizedTitle);
        if (legacyUntitledMatch) {
            return {
                title: 'Untitled',
                number: legacyUntitledMatch[1] || null
            };
        }

        return null;
    }

    function _readFolderTitle(folderId, fallback) {
        folderId = String(folderId);
        var selectors = [
            '.folder-list-click-action[data-folder-id="' + folderId + '"][data-folder-name]',
            '[data-action="open-kanban-view"][data-folder-id="' + folderId + '"][data-folder-name]',
            '[data-action="select-folder"][data-folder-id="' + folderId + '"][data-folder]'
        ];

        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (!el) continue;
            var name = el.getAttribute('data-folder-name') || el.getAttribute('data-folder');
            if (name && name.trim()) return name.trim();
        }

        return fallback || '';
    }

    function _formatKanbanTitle(folderId, folderName) {
        var folderTitle = folderName || _readFolderTitle(folderId, '');
        var kanbanTitle = _getDefaultKanbanTitle();
        return folderTitle ? kanbanTitle + ' - ' + folderTitle : kanbanTitle;
    }

    /** Read a note's current title from the DOM, fallback to stored value. */
    function _readTitle(noteId, fallback) {
        var el = document.getElementById('inp' + noteId);
        if (el) {
            // First try the value (user-entered title)
            if (el.value.trim()) return el.value.trim();
            // If value is empty, try the placeholder (default title like "Nouvelle note (10)")
            if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
        }
        return fallback || _getDefaultTitle();
    }

    /** Read a note title from the sidebar list (useful for linked notes). */
    function _readSidebarTitle(noteId) {
        noteId = String(noteId);

        var byNoteId = document.querySelector('.links_arbo_left[data-note-id="' + noteId + '"] .note-title');
        if (byNoteId && byNoteId.textContent && byNoteId.textContent.trim()) {
            return byNoteId.textContent.trim();
        }

        var byDbId = document.querySelector('.links_arbo_left[data-note-db-id="' + noteId + '"] .note-title');
        if (byDbId && byDbId.textContent && byDbId.textContent.trim()) {
            return byDbId.textContent.trim();
        }

        return '';
    }

    function _buildUrl(noteId) {
        var workspace = _getWorkspace();
        return 'index.php?workspace=' + encodeURIComponent(workspace) +
            '&note=' + encodeURIComponent(noteId);
    }

    function _buildKanbanUrl(folderId) {
        var workspace = _getWorkspace();
        var params = ['kanban=' + encodeURIComponent(folderId)];
        if (workspace) {
            params.push('workspace=' + encodeURIComponent(workspace));
        }
        return 'index.php?' + params.join('&');
    }

    function _isSearchFilteringActive() {
        try {
            var urlParams = new URLSearchParams(window.location.search || '');
            var urlSearch = (urlParams.get('search') || '').trim();
            var urlTags = (urlParams.get('tags_search') || '').trim();
            var createdFrom = (urlParams.get('created_from') || '').trim();
            var createdTo = (urlParams.get('created_to') || '').trim();
            if (urlSearch || urlTags || createdFrom || createdTo) return true;
        } catch (e) { /* ignore */ }

        var searchInputs = [
            document.getElementById('unified-search'),
            document.getElementById('unified-search-mobile'),
            document.getElementById('search-notes-hidden'),
            document.getElementById('search-notes-hidden-mobile'),
            document.getElementById('search-tags-hidden'),
            document.getElementById('search-tags-hidden-mobile'),
            document.getElementById('created-from'),
            document.getElementById('created-from-mobile'),
            document.getElementById('created-to'),
            document.getElementById('created-to-mobile')
        ];

        for (var i = 0; i < searchInputs.length; i++) {
            var input = searchInputs[i];
            if (input && input.value && input.value.trim()) {
                return true;
            }
        }

        return false;
    }

    function _isElementVisibleForSearch(el) {
        if (!el) return false;
        if (el.classList.contains('search-hidden') || el.closest('.search-hidden')) return false;

        try {
            var style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
        } catch (e) { /* ignore */ }

        return !(el.offsetWidth === 0 && el.offsetHeight === 0);
    }

    function _isNoteVisibleInSidebar(noteId) {
        noteId = String(noteId);
        var noteLinks = document.querySelectorAll('[data-action="load-note"][data-note-id]');
        for (var i = 0; i < noteLinks.length; i++) {
            var el = noteLinks[i];
            if (String(el.getAttribute('data-note-id')) === noteId && _isElementVisibleForSearch(el)) {
                return true;
            }
        }
        return false;
    }

    function _applySearchTabVisibility() {
        var bar = document.getElementById('app-tab-bar');
        if (!bar) return;

        var hideFilteredTabs = _isSearchFilteringActive();
        var tabElements = bar.querySelectorAll('.app-tab[data-tab-id]');

        for (var i = 0; i < tabElements.length; i++) {
            var tabEl = tabElements[i];
            var tab = _findTabById(tabEl.getAttribute('data-tab-id'));
            if (!tab) continue;

            var shouldHideTab = hideFilteredTabs && _isNoteTab(tab) && !_isNoteVisibleInSidebar(tab.noteId);
            tabEl.style.display = shouldHideTab ? 'none' : '';
        }
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

        if (tabs.length === 0) {
            if (bar) bar.style.display = 'none';
            document.body.classList.remove('has-internal-tabs');
            return;
        }

        if (!_areTabsEnabled()) {
            if (bar) bar.style.display = 'none';
            document.body.classList.remove('has-internal-tabs');
            return;
        }
        document.body.classList.add('has-internal-tabs');
        if (bar) bar.style.display = '';
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'app-tab-bar';

            // Drag-to-scroll functionality
            var isDragging = false;
            var hasDragged = false;
            var startX = 0;
            var scrollLeft = 0;

            bar.addEventListener('mousedown', function (e) {
                // Don't start dragging on close button
                if (e.target.closest('.app-tab-close')) return;

                isDragging = true;
                hasDragged = false;
                startX = e.pageX - bar.offsetLeft;
                scrollLeft = bar.scrollLeft;
                bar.style.cursor = 'grabbing';
                bar.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', function (e) {
                if (!isDragging) return;
                e.preventDefault();
                var x = e.pageX - bar.offsetLeft;
                var walk = (x - startX) * 1.5; // Scroll speed multiplier

                // If moved more than 5px, consider it a drag
                if (Math.abs(walk) > 5) {
                    hasDragged = true;
                }

                bar.scrollLeft = scrollLeft - walk;
            });

            document.addEventListener('mouseup', function () {
                if (isDragging) {
                    isDragging = false;
                    bar.style.cursor = '';
                    bar.style.userSelect = '';

                    // Reset hasDragged after a short delay to allow click event to check it
                    setTimeout(function () {
                        hasDragged = false;
                    }, 10);
                }
            });

            bar.addEventListener('mouseleave', function () {
                if (isDragging) {
                    isDragging = false;
                    bar.style.cursor = '';
                    bar.style.userSelect = '';
                }
            });

            // Event delegation on the bar (only once)
            bar.addEventListener('click', function (e) {
                // Don't process click if we just finished dragging
                if (hasDragged) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

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
            var tabType = _getTabType(tab);
            var fallbackTitle = tabType === 'kanban' ? _getDefaultKanbanTitle() : _getDefaultTitle();
            el.className = 'app-tab app-tab-' + tabType + (tab.id === activeTabId ? ' active' : '');
            el.setAttribute('data-tab-id', tab.id);
            el.setAttribute('data-tab-type', tabType);

            var titleSpan = document.createElement('span');
            titleSpan.className = 'app-tab-title';
            titleSpan.textContent = tab.title || fallbackTitle;
            titleSpan.title = tab.title || fallbackTitle;

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

        _applySearchTabVisibility();

        // Ensure active tab is visible if bar overflowed
        if (activeTabId) {
            var activeEl = bar.querySelector('.app-tab.active');
            if (activeEl && typeof activeEl.scrollIntoView === 'function') {
                activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }

        updateOpenInNewTabButtons();
    }

    function _loadNoteTab(tab) {
        if (!tab || !tab.noteId) return;
        _pendingTabSwitch = tab.id;
        var url = _buildUrl(tab.noteId);
        if (typeof window.loadNoteDirectly === 'function') {
            window.loadNoteDirectly(url, tab.noteId, null, null);
        } else {
            window.location.href = url;
        }
    }

    function _loadKanbanTab(tab) {
        if (!tab || !tab.folderId) return;
        activeTabId = tab.id;
        _pendingTabSwitch = null;
        _saveToStorage();
        render();

        if (typeof window.openKanbanView === 'function') {
            window.openKanbanView(tab.folderId, tab.title, { skipTabManager: true, fromTabManager: true });
        } else {
            window.location.href = _buildKanbanUrl(tab.folderId);
        }
    }

    function _loadTabContent(tab) {
        if (!tab) return;
        if (_isKanbanTab(tab)) {
            _loadKanbanTab(tab);
            return;
        }
        _loadNoteTab(tab);
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Called when "open in new tab" is clicked (from note toolbar or sidebar menu).
     * Creates a new tab for the given note and makes it active.
     * If the note is not currently displayed, loads it via AJAX.
     */
    function openInNewTab(noteId, title, options) {
        options = options || {};
        // Internal tabs are always enabled (except on mobile where this won't be called)
        noteId = String(noteId);

        // Check if tab already exists for this note
        var existingTab = null;
        for (var i = 0; i < tabs.length; i++) {
            if (_isNoteTab(tabs[i]) && tabs[i].noteId === noteId) {
                existingTab = tabs[i];
                break;
            }
        }

        if (existingTab) {
            switchToTab(existingTab.id);
            return;
        }

        var newTab = { id: _generateId(), type: 'note', noteId: noteId, title: title || _getDefaultTitle() };
        if (options.insertAfterActive && activeTabId) {
            var activeIndex = _indexById(activeTabId);
            if (activeIndex !== -1) {
                tabs.splice(activeIndex + 1, 0, newTab);
            } else {
                tabs.push(newTab);
            }
        } else {
            tabs.push(newTab);
        }
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
     * Open a folder Kanban view in an internal tab.
     * @param {string|number} folderId
     * @param {string} folderName
     */
    function openKanbanTab(folderId, folderName) {
        folderId = String(folderId);
        var title = _formatKanbanTitle(folderId, folderName);

        var existingTab = null;
        for (var i = 0; i < tabs.length; i++) {
            if (_isKanbanTab(tabs[i]) && tabs[i].folderId === folderId) {
                existingTab = tabs[i];
                break;
            }
        }

        if (existingTab) {
            if (folderName && existingTab.title !== title) {
                existingTab.title = title;
                _saveToStorage();
                render();
            }
            switchToTab(existingTab.id);
            return;
        }

        var newTab = { id: _generateId(), type: 'kanban', folderId: folderId, title: title };
        tabs.push(newTab);
        activeTabId = newTab.id;
        _saveToStorage();
        render();
        _loadKanbanTab(newTab);
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

        _loadTabContent(tab);
    }

    /**
     * Called when a tab's × button is clicked.
     * Removes the tab and switches to the closest neighbour.
     * The last remaining tab cannot be closed unless force is true.
     */
    function closeTab(tabId, force) {
        if (!force && tabs.length <= 1) return false; // cannot close the last tab via UI
        var idx = _indexById(tabId);
        if (idx === -1) return false;

        var wasActive = (tabId === activeTabId);
        tabs.splice(idx, 1);

        if (tabs.length === 0) {
            // Last tab closed
            activeTabId = null;
            _saveToStorage();
            render();
            return true;
        }

        if (wasActive) {
            // Prefer left neighbour, else right
            var newIdx = idx > 0 ? idx - 1 : 0;
            var nextTab = tabs[newIdx];
            activeTabId = nextTab.id;
            _saveToStorage();
            render();
            _loadTabContent(nextTab);
        } else {
            _saveToStorage();
            render();
        }

        return true;
    }

    function closeActiveTab(force) {
        if (!activeTabId) return false;
        return closeTab(activeTabId, force);
    }

    /**
     * Close all tabs associated with a specific note ID.
     * Used when a note is deleted.
     */
    function closeTabByNoteId(noteId) {
        noteId = String(noteId);
        // Iterate backwards to avoid index shifting issues
        for (var i = tabs.length - 1; i >= 0; i--) {
            if (_isNoteTab(tabs[i]) && tabs[i].noteId === noteId) {
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
            if (switchedTab && _isNoteTab(switchedTab) && switchedTab.noteId === noteId) {
                var sidebarTitleForSwitch = _readSidebarTitle(noteId);
                var freshTitle = _readTitle(noteId, sidebarTitleForSwitch || switchedTab.title || _getDefaultTitle());
                switchedTab.title = freshTitle;
            }
            _saveToStorage();
            return;
        }

        // Regular sidebar navigation (or initial load via AJAX)
        var sidebarTitle = _readSidebarTitle(noteId);
        var title = _readTitle(noteId, sidebarTitle || _getDefaultTitle());

        // Check if an existing tab already has this noteId (from a previous session or manual nav)
        // If so, just activate it
        var existingTabWithNote = null;
        for (var i = 0; i < tabs.length; i++) {
            if (_isNoteTab(tabs[i]) && tabs[i].noteId === noteId) {
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
                tab.type = 'note';
                tab.noteId = noteId;
                delete tab.folderId;
                tab.title = title;
            }
        } else {
            // No active tab — create the first tab
            var newTab = { id: _generateId(), type: 'note', noteId: noteId, title: title };
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
            if (_isNoteTab(tab) && tab.noteId === noteId) {
                tab.title = e.target.value.trim() || _getDefaultTitle();
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
        hasInitialized = true;

        // Read current note from page config
        var currentNoteId = null;
        var currentKanbanFolderId = null;
        try {
            var configEl = document.getElementById('current-note-data');
            if (configEl) {
                var config = JSON.parse(configEl.textContent);
                currentNoteId = config.noteId ? String(config.noteId) : null;
            }
            var params = new URLSearchParams(window.location.search || '');
            currentKanbanFolderId = params.get('kanban') ? String(params.get('kanban')) : null;
        } catch (e) { }

        // Try to restore from localStorage
        var stored = _loadFromStorage();
        if (stored && stored.tabs.length > 0) {
            tabs = stored.tabs.filter(function (tab) {
                if (!tab) return false;
                if (!tab.id) tab.id = _generateId();

                if (_isKanbanTab(tab)) {
                    if (!tab.folderId) return false;
                    tab.folderId = String(tab.folderId);
                    delete tab.noteId;
                    tab.title = tab.title || _formatKanbanTitle(tab.folderId, null);
                    return true;
                }

                if (!tab.noteId) return false;
                tab.type = 'note';
                tab.noteId = String(tab.noteId);
                delete tab.folderId;
                tab.title = tab.title || _getDefaultTitle();
                return true;
            });

            if (tabs.length === 0) {
                activeTabId = null;
                _saveToStorage();
                render();
                return;
            }

            activeTabId = stored.activeTabId || null;

            // Validate activeTabId is still in the list
            if (activeTabId && !_findTabById(activeTabId)) {
                activeTabId = tabs[0].id;
            }

            if (currentNoteId) {
                // Find a tab whose noteId matches the current URL note
                var matchingTab = null;
                for (var i = 0; i < tabs.length; i++) {
                    if (_isNoteTab(tabs[i]) && tabs[i].noteId === currentNoteId) {
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
                        activeTab.type = 'note';
                        activeTab.noteId = currentNoteId;
                        delete activeTab.folderId;
                        activeTab.title = _readTitle(currentNoteId, _getDefaultTitle());
                    }
                }
            } else if (currentKanbanFolderId) {
                var matchingKanbanTab = null;
                for (var j = 0; j < tabs.length; j++) {
                    if (_isKanbanTab(tabs[j]) && tabs[j].folderId === currentKanbanFolderId) {
                        matchingKanbanTab = tabs[j];
                        break;
                    }
                }

                if (matchingKanbanTab) {
                    activeTabId = matchingKanbanTab.id;
                } else if (activeTabId) {
                    var activeKanbanTab = _findTabById(activeTabId);
                    if (activeKanbanTab) {
                        activeKanbanTab.type = 'kanban';
                        activeKanbanTab.folderId = currentKanbanFolderId;
                        delete activeKanbanTab.noteId;
                        activeKanbanTab.title = _formatKanbanTitle(currentKanbanFolderId, null);
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
            var title = _readTitle(currentNoteId, _getDefaultTitle());
            tabs = [{ id: _generateId(), type: 'note', noteId: currentNoteId, title: title }];
            activeTabId = tabs[0].id;
            _saveToStorage();
            render();
        } else if (currentKanbanFolderId) {
            tabs = [{ id: _generateId(), type: 'kanban', folderId: currentKanbanFolderId, title: _formatKanbanTitle(currentKanbanFolderId, null) }];
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

    // Re-render tabs when i18n is loaded to update default titles
    document.addEventListener('poznote:i18n:loaded', function () {
        if (_areTabsEnabled() && tabs.length > 0) {
            // Update tabs that have default titles to use the translated version
            var changed = false;
            var newDefaultTitle = _getDefaultTitle();

            tabs.forEach(function (tab) {
                if (!_isNoteTab(tab)) return;
                var match = _matchDefaultNoteTitle(tab.title);
                if (match) {
                    var number = match.number; // Captured number, e.g., "10" from "New note (10)"
                    var freshTitle;

                    // For active tab or if note is in DOM, read from DOM (has the most accurate info)
                    if (tab.id === activeTabId || document.getElementById('inp' + tab.noteId)) {
                        freshTitle = _readTitle(tab.noteId, null);
                    }

                    // If we couldn't read from DOM, construct the title
                    if (!freshTitle) {
                        if (number) {
                            // Construct numbered title with current language
                            freshTitle = window.t
                                ? window.t('index.note.new_note_numbered', { number: number }, 'New note ({{number}})')
                                : 'New note (' + number + ')';
                        } else {
                            freshTitle = newDefaultTitle;
                        }
                    }

                    if (freshTitle !== tab.title) {
                        tab.title = freshTitle;
                        changed = true;
                    }
                }
            });

            if (changed) {
                _saveToStorage();
            }
            render();
        }
    });

    // ── Workspace switch ──────────────────────────────────────────────────

    /**
     * Called when the user switches to a different workspace.
     * Saves the current workspace's tabs under the old workspace key,
     * clears the in-memory state, then loads the new workspace's tabs.
     * @param {string} [oldWorkspace] - The workspace we are leaving (to save tabs under its key).
     *                                   If not provided, uses the current _getWorkspace().
     */
    function switchWorkspace(oldWorkspace) {
        // Save current tabs for the old workspace explicitly
        if (oldWorkspace) {
            try {
                localStorage.setItem('poznote_tabs_' + oldWorkspace, JSON.stringify({
                    tabs: tabs,
                    activeTabId: activeTabId
                }));
            } catch (e) { /* ignore */ }
        } else {
            _saveToStorage();
        }

        // Reset in-memory state
        tabs = [];
        activeTabId = null;
        _pendingTabSwitch = null;

        // Load tabs for the new workspace (selectedWorkspace is now updated)
        var stored = _loadFromStorage();
        if (stored && stored.tabs.length > 0) {
            tabs = stored.tabs.filter(function (tab) {
                if (!tab) return false;
                if (!tab.id) tab.id = _generateId();
                if (_isKanbanTab(tab)) {
                    if (!tab.folderId) return false;
                    tab.folderId = String(tab.folderId);
                    delete tab.noteId;
                    tab.title = tab.title || _formatKanbanTitle(tab.folderId, null);
                    return true;
                }
                if (!tab.noteId) return false;
                tab.type = 'note';
                tab.noteId = String(tab.noteId);
                delete tab.folderId;
                tab.title = tab.title || _getDefaultTitle();
                return true;
            });
            activeTabId = stored.activeTabId || null;

            // Validate activeTabId
            if (activeTabId && !_findTabById(activeTabId) && tabs.length > 0) {
                activeTabId = tabs[0].id;
            }
            if (tabs.length === 0) {
                activeTabId = null;
            }
        }

        // Re-render with new workspace's tabs (or empty if none stored)
        render();

        // Refresh calendar for new workspace
        if (window.miniCalendar && typeof window.miniCalendar.refresh === 'function') {
            window.miniCalendar.refresh();
        }

        // Load the active tab if we have one
        if (activeTabId) {
            var activeTab = _findTabById(activeTabId);
            _loadTabContent(activeTab);
        }
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
            if (_isNoteTab(tabs[i]) && tabs[i].noteId === noteId) return true;
        }
        return false;
    }

    function isKanbanOpen(folderId) {
        if (!_areTabsEnabled()) return false;
        folderId = String(folderId);
        for (var i = 0; i < tabs.length; i++) {
            if (_isKanbanTab(tabs[i]) && tabs[i].folderId === folderId) return true;
        }
        return false;
    }

    // ── Update UI for "Open in new tab" buttons ────────────────────────────

    function updateOpenInNewTabButtons() {
        if (!_areTabsEnabled()) return;

        _applySearchTabVisibility();

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
                    if (_isNoteTab(tabs[i]) && tabs[i].noteId === String(noteId)) {
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

    /**
     * Get the note ID of the currently active tab, or null.
     * @returns {string|null}
     */
    function getActiveNoteId() {
        if (!activeTabId) return null;
        var tab = _findTabById(activeTabId);
        return tab && _isNoteTab(tab) ? tab.noteId : null;
    }

    function getActiveTabType() {
        if (!activeTabId) return null;
        var tab = _findTabById(activeTabId);
        return tab ? _getTabType(tab) : null;
    }

    function getActiveKanbanFolderId() {
        if (!activeTabId) return null;
        var tab = _findTabById(activeTabId);
        return tab && _isKanbanTab(tab) ? tab.folderId : null;
    }

    function isInitialized() {
        return hasInitialized;
    }

    window.tabManager = {
        openInNewTab: openInNewTab,
        openKanbanTab: openKanbanTab,
        switchToTab: switchToTab,
        closeTab: closeTab,
        closeActiveTab: closeActiveTab,
        closeTabByNoteId: closeTabByNoteId,
        isNoteOpen: isNoteOpen,
        isKanbanOpen: isKanbanOpen,
        getActiveNoteId: getActiveNoteId,
        getActiveTabType: getActiveTabType,
        getActiveKanbanFolderId: getActiveKanbanFolderId,
        isInitialized: isInitialized,
        render: render,
        updateUI: updateOpenInNewTabButtons, // Expose for external calls
        _onNoteLoaded: _onNoteLoaded,
        switchWorkspace: switchWorkspace
    };

})();
