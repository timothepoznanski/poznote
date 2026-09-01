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

    /** @type {Array<{id: string, type?: string, noteId?: string, folderId?: string, title: string, pinned?: boolean}>} */
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

    /** Scroll positions keyed by tab ID — kept in memory only, not persisted. */
    var _scrollPositions = {};

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

    function _storageKey(workspace) {
        return window.__poznoteTabsStorageKey(workspace || _getWorkspace());
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

    function _isPinnedTab(tab) {
        return tab && tab.pinned === true;
    }

    /** Re-sort tabs so pinned ones always appear first (preserving relative order within each group). */
    function _sortPinnedFirst() {
        var pinned = tabs.filter(function (t) { return _isPinnedTab(t); });
        var unpinned = tabs.filter(function (t) { return !_isPinnedTab(t); });
        tabs = pinned.concat(unpinned);
    }

    function _t(key, fallback) {
        return window.t ? window.t(key, null, fallback) : fallback;
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

    function _getRenderedNoteId() {
        var noteEntry = document.querySelector('#right_col .noteentry[data-note-id]');
        return noteEntry ? String(noteEntry.getAttribute('data-note-id')) : null;
    }

    function _shouldRestoreActiveTabContent(tab) {
        if (!tab) return false;
        if (_isKanbanTab(tab)) return true;
        if (!_isNoteTab(tab)) return false;
        return _getRenderedNoteId() !== String(tab.noteId);
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

    // ── Drag to reorder ────────────────────────────────────────────────────

    /**
     * Tabs are reordered by dragging them along the bar, like browser tabs.
     * A press on a tab only *arms* the drag: it starts once the pointer has
     * travelled REORDER_THRESHOLD_PX, so a plain click still switches tabs.
     * Pinned tabs are always kept first by _sortPinnedFirst(), so a tab can
     * only be dropped inside its own pinned/unpinned group.
     */
    var REORDER_THRESHOLD_PX = 5;
    /** Pointer distance to the bar's edge that triggers auto-scroll, and its speed per frame. */
    var REORDER_EDGE_ZONE_PX = 44;
    var REORDER_EDGE_SPEED_PX = 14;

    /** @type {null|{bar: HTMLElement, el: HTMLElement, tabId: string, startX: number, grabOffsetX: number, pointerX: number, active: boolean, translate: number, rafId: number}} */
    var _reorder = null;

    /** Set right after a reorder drag so the trailing click does not switch tab. */
    var _reorderJustFinished = false;

    /** Remember the press without starting anything visible yet. */
    function _reorderArm(bar, tabEl, e) {
        _reorder = {
            bar: bar,
            el: tabEl,
            tabId: tabEl.getAttribute('data-tab-id'),
            startX: e.clientX,
            grabOffsetX: e.clientX - tabEl.getBoundingClientRect().left,
            pointerX: e.clientX,
            active: false,
            translate: 0,
            rafId: 0
        };
    }

    function _reorderStart() {
        var state = _reorder;
        state.active = true;
        state.el.classList.add('app-tab-dragging');
        state.bar.classList.add('is-reordering');
        document.body.classList.add('app-tab-reordering');
        state.rafId = requestAnimationFrame(_reorderFrame);
    }

    /**
     * Runs while the drag is active: the pointer can sit still against an edge
     * and still need the bar to keep scrolling, so this is driven by rAF
     * rather than by mousemove.
     */
    function _reorderFrame() {
        if (!_reorder || !_reorder.active) return;
        _reorderAutoScroll();
        _reorderUpdate();
        _reorder.rafId = requestAnimationFrame(_reorderFrame);
    }

    /** Scroll the bar when the dragged tab is held against either end. */
    function _reorderAutoScroll() {
        var state = _reorder;
        var maxScroll = state.bar.scrollWidth - state.bar.clientWidth;
        if (maxScroll <= 0) return;

        var barRect = state.bar.getBoundingClientRect();
        var delta = 0;
        if (state.pointerX < barRect.left + REORDER_EDGE_ZONE_PX) delta = -REORDER_EDGE_SPEED_PX;
        else if (state.pointerX > barRect.right - REORDER_EDGE_ZONE_PX) delta = REORDER_EDGE_SPEED_PX;
        if (!delta) return;

        state.bar.scrollLeft = Math.max(0, Math.min(maxScroll, state.bar.scrollLeft + delta));
    }

    /** Keep the dragged tab under the cursor, then re-slot it among its neighbours. */
    function _reorderUpdate() {
        var state = _reorder;
        if (!state || !state.active) return;

        // The tab's untransformed position moves whenever the bar scrolls or the
        // tab changes place, so it is re-derived from the live rect every frame.
        var naturalLeft = state.el.getBoundingClientRect().left - state.translate;
        var barRect = state.bar.getBoundingClientRect();
        var width = state.el.offsetWidth;

        // Clamped to the bar: the bar clips its overflow, so a tab dragged past
        // an edge would simply disappear instead of following the pointer.
        var visualLeft = Math.min(
            Math.max(state.pointerX - state.grabOffsetX, barRect.left),
            Math.max(barRect.right - width, barRect.left)
        );
        state.translate = visualLeft - naturalLeft;
        state.el.style.transform = 'translateX(' + state.translate + 'px)';

        _reorderSlot(visualLeft + width / 2);
    }

    /** Move the dragged tab in the DOM once its centre passes a neighbour's centre. */
    function _reorderSlot(draggedCenter) {
        var state = _reorder;
        var draggedTab = _findTabById(state.tabId);
        var isPinned = _isPinnedTab(draggedTab);

        var neighbours = [];
        var tabElements = state.bar.querySelectorAll('.app-tab[data-tab-id]');
        for (var i = 0; i < tabElements.length; i++) {
            var el = tabElements[i];
            if (el === state.el) continue;
            if (!el.offsetWidth) continue; // hidden by the search filter
            var tab = _findTabById(el.getAttribute('data-tab-id'));
            if (!tab || _isPinnedTab(tab) !== isPinned) continue;
            neighbours.push(el);
        }
        if (!neighbours.length) return;

        var reference = null; // node to insert before
        for (var j = 0; j < neighbours.length; j++) {
            var rect = neighbours[j].getBoundingClientRect();
            if (draggedCenter < rect.left + rect.width / 2) {
                reference = neighbours[j];
                break;
            }
        }
        if (!reference) reference = neighbours[neighbours.length - 1].nextSibling;

        // Already in that slot
        if (reference === state.el || reference === state.el.nextSibling) return;

        _reorderFlip(function () {
            state.bar.insertBefore(state.el, reference);
        });

        // The move changed the tab's untransformed position: re-anchor it on
        // the spot it visually occupies, or it flickers to its new slot for a frame.
        var naturalLeft = state.el.getBoundingClientRect().left - state.translate;
        state.translate = (draggedCenter - state.el.offsetWidth / 2) - naturalLeft;
        state.el.style.transform = 'translateX(' + state.translate + 'px)';
    }

    /**
     * Run a DOM move and let the tabs it displaces slide to their new place
     * (FLIP: measure, mutate, offset back, then transition the offset away).
     */
    function _reorderFlip(mutate) {
        var state = _reorder;
        var tabElements = state.bar.querySelectorAll('.app-tab[data-tab-id]');
        var before = [];
        for (var i = 0; i < tabElements.length; i++) {
            before.push(tabElements[i].getBoundingClientRect().left);
        }

        mutate();

        var moved = [];
        for (var j = 0; j < tabElements.length; j++) {
            if (tabElements[j] === state.el) continue;
            var shift = before[j] - tabElements[j].getBoundingClientRect().left;
            if (shift) moved.push({ el: tabElements[j], shift: shift });
        }
        if (!moved.length) return;

        for (var k = 0; k < moved.length; k++) {
            moved[k].el.style.transition = 'none';
            moved[k].el.style.transform = 'translateX(' + moved[k].shift + 'px)';
        }
        void state.bar.offsetWidth; // flush the offset before animating it away
        for (var m = 0; m < moved.length; m++) {
            moved[m].el.style.transition = '';
            moved[m].el.style.transform = '';
        }
    }

    /** Adopt the order the bar now shows and persist it. */
    function _reorderCommit() {
        var bar = _reorder.bar;
        var ordered = [];
        var tabElements = bar.querySelectorAll('.app-tab[data-tab-id]');
        for (var i = 0; i < tabElements.length; i++) {
            var tab = _findTabById(tabElements[i].getAttribute('data-tab-id'));
            if (tab && ordered.indexOf(tab) === -1) ordered.push(tab);
        }
        // Any tab the bar did not render keeps its previous place.
        for (var j = 0; j < tabs.length; j++) {
            if (ordered.indexOf(tabs[j]) === -1) ordered.splice(Math.min(j, ordered.length), 0, tabs[j]);
        }
        tabs = ordered;
        _sortPinnedFirst();

        _reorderEnd();
        _saveToStorage();
        render();
    }

    /** Drop the drag and let the next render restore the stored order. */
    function _reorderCancel() {
        _reorderEnd();
        render();
    }

    function _reorderEnd() {
        var state = _reorder;
        if (!state) return;
        if (state.rafId) cancelAnimationFrame(state.rafId);
        state.el.style.transform = '';
        state.el.style.transition = '';
        state.el.classList.remove('app-tab-dragging');
        state.bar.classList.remove('is-reordering');
        document.body.classList.remove('app-tab-reordering');

        if (state.active) {
            // mouseup still delivers a click; swallow it so the drop does not
            // also read as "switch to this tab".
            _reorderJustFinished = true;
            setTimeout(function () { _reorderJustFinished = false; }, 10);
        }
        _reorder = null;
    }

    /** Document-level drag listeners, bound once with the tab bar. */
    function _bindReorderHandlers() {
        document.addEventListener('mousemove', function (e) {
            if (!_reorder) return;
            _reorder.pointerX = e.clientX;
            if (!_reorder.active) {
                if (Math.abs(e.clientX - _reorder.startX) < REORDER_THRESHOLD_PX) return;
                _reorderStart();
            }
            e.preventDefault(); // no text selection while dragging
            _reorderUpdate();
        });

        document.addEventListener('mouseup', function () {
            if (!_reorder) return;
            if (_reorder.active) _reorderCommit();
            else _reorder = null;
        });

        document.addEventListener('keydown', function (e) {
            if (!_reorder || !_reorder.active) return;
            if (e.key === 'Escape') _reorderCancel();
        });

        // The mouseup that ends the drag is lost when the window goes away
        // (alt-tab, a dialog): drop the drag rather than leave the bar frozen.
        window.addEventListener('blur', function () {
            if (_reorder && _reorder.active) _reorderCancel();
            else _reorder = null;
        });
    }

    // ── Render ─────────────────────────────────────────────────────────────

    /**
     * (Re-)create #app-tab-bar as the first child of #right_col.
     * Called after every state change and after AJAX note loads.
     */
    function render() {
        // A reorder drag owns the bar's DOM: rebuilding it mid-drag would drop
        // the element under the cursor. The drag re-renders when it ends.
        if (_reorder && _reorder.active) return;

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

            _bindReorderHandlers();

            bar.addEventListener('mousedown', function (e) {
                // Middle button is handled on auxclick (closes the tab) — swallow
                // the mousedown so the browser doesn't start autoscroll instead
                if (e.button === 1) {
                    e.preventDefault();
                    return;
                }
                // Only the primary button drags the bar
                if (e.button !== 0) return;
                // Don't start dragging on the close buttons
                if (e.target.closest('.app-tab-close') || e.target.closest('.app-tab-close-all')) return;

                // Pressing a tab arms a reorder drag (like browser tabs); the
                // bar's empty space keeps the drag-to-scroll below.
                var pressedTab = e.target.closest('.app-tab');
                if (pressedTab) {
                    _reorderArm(bar, pressedTab, e);
                    return;
                }

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
                if (hasDragged || _reorderJustFinished) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if (e.target.closest('.app-tab-close-all')) {
                    closeAllTabs();
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

            // Double-click on a tab closes it (same rules as the × button:
            // pinned tabs and the last remaining tab stay open)
            bar.addEventListener('dblclick', function (e) {
                if (hasDragged || _reorderJustFinished) return;
                if (e.target.closest('.app-tab-close') || e.target.closest('.app-tab-close-all')) return;
                var tabEl = e.target.closest('.app-tab');
                if (!tabEl) return;
                e.preventDefault();
                closeTab(tabEl.getAttribute('data-tab-id'));
            });

            // Middle-click on a tab closes it (same rules as the × button:
            // pinned tabs and the last remaining tab stay open)
            bar.addEventListener('auxclick', function (e) {
                if (e.button !== 1) return;
                if (hasDragged) return;
                if (e.target.closest('.app-tab-close-all')) return;
                var tabEl = e.target.closest('.app-tab');
                if (!tabEl) return;
                e.preventDefault();
                closeTab(tabEl.getAttribute('data-tab-id'));
            });

            // Context menu (right-click) on the bar
            bar.addEventListener('contextmenu', function (e) {
                var tabEl = e.target.closest('.app-tab');
                if (!tabEl) return;
                e.preventDefault();
                _showTabContextMenu(tabEl.getAttribute('data-tab-id'), e.clientX, e.clientY);
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
            el.className = 'app-tab app-tab-' + tabType +
                (tab.id === activeTabId ? ' active' : '') +
                (_isPinnedTab(tab) ? ' pinned' : '');
            el.setAttribute('data-tab-id', tab.id);
            el.setAttribute('data-tab-type', tabType);

            if (_isPinnedTab(tab)) {
                var pinIcon = document.createElement('span');
                pinIcon.className = 'app-tab-pin-icon';
                pinIcon.setAttribute('aria-hidden', 'true');
                pinIcon.innerHTML = '<i class="lucide lucide-pin"></i>';
                el.appendChild(pinIcon);
            }

            var titleSpan = document.createElement('span');
            titleSpan.className = 'app-tab-title';
            titleSpan.textContent = tab.title || fallbackTitle;
            titleSpan.title = tab.title || fallbackTitle;

            el.appendChild(titleSpan);

            if (tabs.length > 1 && !_isPinnedTab(tab)) {
                var closeBtn = document.createElement('button');
                closeBtn.className = 'app-tab-close';
                closeBtn.setAttribute('aria-label', 'Close tab');
                closeBtn.textContent = '×';
                el.appendChild(closeBtn);
            }
            bar.appendChild(el);
        });

        // "Close all tabs" runs the same action as the right-click menu, but
        // is reachable without knowing the menu exists. Pinned to the right
        // edge (sticky) so it stays put while the bar scrolls.
        bar.classList.toggle('has-close-all', tabs.length > 1);
        if (tabs.length > 1) {
            var closeAllLabel = _t('tabs.close_all_tabs', 'Close all tabs');
            var closeAllBtn = document.createElement('button');
            closeAllBtn.type = 'button';
            closeAllBtn.className = 'app-tab-close-all';
            closeAllBtn.title = closeAllLabel;
            closeAllBtn.setAttribute('aria-label', closeAllLabel);
            closeAllBtn.innerHTML = '<i class="lucide lucide-x"></i>';

            var closeAllText = document.createElement('span');
            closeAllText.className = 'app-tab-close-all-label';
            closeAllText.textContent = _t('tabs.context_menu.close_all', 'Close all');
            closeAllBtn.appendChild(closeAllText);

            bar.appendChild(closeAllBtn);
        }

        _applySearchTabVisibility();

        // Ensure active tab is visible if bar overflowed — scroll only the bar horizontally
        if (activeTabId) {
            var activeEl = bar.querySelector('.app-tab.active');
            if (activeEl) {
                // The "Close all tabs" button is sticky at the right end, so the
                // space it covers is not usable to show the active tab.
                var closeAllEl = bar.querySelector('.app-tab-close-all');
                var trailingWidth = closeAllEl ? closeAllEl.offsetWidth : 0;
                var tabLeft = activeEl.offsetLeft;
                var tabRight = tabLeft + activeEl.offsetWidth;
                if (tabLeft < bar.scrollLeft) {
                    bar.scrollLeft = tabLeft;
                } else if (tabRight > bar.scrollLeft + bar.offsetWidth - trailingWidth) {
                    bar.scrollLeft = tabRight - bar.offsetWidth + trailingWidth;
                }
            }
        }

        updateOpenInNewTabButtons();
    }

    function _loadNoteTab(tab) {
        if (!tab || !tab.noteId) return;

        // If the note is already rendered, just activate the tab without reloading
        if (_getRenderedNoteId() === String(tab.noteId)) {
            activeTabId = tab.id;
            _pendingTabSwitch = null;
            _saveToStorage();
            render();
            _restoreScrollPosition(tab);
            return;
        }

        _pendingTabSwitch = tab.id;
        var url = _buildUrl(tab.noteId);
        if (typeof window.loadNoteDirectly === 'function') {
            window.loadNoteDirectly(url, tab.noteId, null, null, { skipLoadingAnimation: true });
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

    // ── Pin / Unpin ────────────────────────────────────────────────────────

    function pinTab(tabId) {
        var tab = _findTabById(tabId);
        if (!tab || _isPinnedTab(tab)) return;
        tab.pinned = true;
        _sortPinnedFirst();
        _saveToStorage();
        render();
    }

    function unpinTab(tabId) {
        var tab = _findTabById(tabId);
        if (!tab || !_isPinnedTab(tab)) return;
        tab.pinned = false;
        _sortPinnedFirst();
        _saveToStorage();
        render();
    }

    function closeAllTabs() {
        var hasPinned = tabs.some(function (t) { return _isPinnedTab(t); });

        // Keep pinned tabs; also keep the active tab if no pinned tabs exist
        tabs = tabs.filter(function (t) {
            if (_isPinnedTab(t)) return true;
            if (!hasPinned && t.id === activeTabId) return true;
            return false;
        });

        if (tabs.length === 0) {
            activeTabId = null;
            _pendingTabSwitch = null;
        } else if (hasPinned && !_findTabById(activeTabId)) {
            // Active tab was closed — switch to first pinned tab
            activeTabId = tabs[0].id;
        }
        _saveToStorage();
        render();
    }

    // ── Tab context menu ───────────────────────────────────────────────────

    function _removeContextMenu() {
        var existing = document.getElementById('app-tab-context-menu');
        if (existing) existing.remove();
    }

    function _showTabContextMenu(tabId, x, y) {
        _removeContextMenu();

        var tab = _findTabById(tabId);
        if (!tab) return;

        var menu = document.createElement('div');
        menu.id = 'app-tab-context-menu';
        menu.className = 'app-tab-context-menu';

        var isPinned = _isPinnedTab(tab);
        var pinLabel = isPinned
            ? _t('tabs.context_menu.unpin', 'Unpin tab')
            : _t('tabs.context_menu.pin', 'Pin tab');
        var pinIcon = '<i class="lucide lucide-pin"></i>';

        var pinItem = document.createElement('div');
        pinItem.className = 'app-tab-context-item';
        pinItem.innerHTML = '<span class="app-tab-context-icon">' + pinIcon + '</span>' + pinLabel;
        pinItem.addEventListener('click', function () {
            _removeContextMenu();
            if (isPinned) unpinTab(tabId);
            else pinTab(tabId);
        });
        menu.appendChild(pinItem);

        if (tabs.length > 1) {
            var separator = document.createElement('div');
            separator.className = 'app-tab-context-separator';
            menu.appendChild(separator);
        }

        // Show close option for all tabs (including pinned)
        if (tabs.length > 1) {
            var closeItem = document.createElement('div');
            closeItem.className = 'app-tab-context-item app-tab-context-item-danger';
            closeItem.innerHTML = _t('tabs.context_menu.close', 'Close tab');
            closeItem.addEventListener('click', function () {
                _removeContextMenu();
                closeTab(tabId, true);
            });
            menu.appendChild(closeItem);
        }

        if (tabs.length > 1) {
            var closeAllItem = document.createElement('div');
            closeAllItem.className = 'app-tab-context-item app-tab-context-item-danger';
            closeAllItem.innerHTML = _t('tabs.context_menu.close_all', 'Close all tabs');
            closeAllItem.addEventListener('click', function () {
                _removeContextMenu();
                closeAllTabs();
            });
            menu.appendChild(closeAllItem);
        }

        document.body.appendChild(menu);

        // Position the menu
        var menuRect;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = (x - menuRect.width) + 'px';
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = (y - menuRect.height) + 'px';
        }

        // Close on outside click or scroll
        setTimeout(function () {
            document.addEventListener('click', _removeContextMenu, { once: true });
            document.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Escape') { _removeContextMenu(); document.removeEventListener('keydown', onKey); }
            });
        }, 0);
    }

    // ── Public API ─────────────────────────────────────────────────────────

    function _showNewNoteLoadingPlaceholder() {
        var rightCol = document.getElementById('right_col');
        if (!rightCol) return;

        // Replace right_col content with a blank placeholder without removing right_col itself
        var placeholder = document.createElement('div');
        placeholder.id = 'new-note-loading-placeholder';
        if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
            window.destroyMarkdownCodeMirrorEditorsWithin(rightCol);
        }
        rightCol.innerHTML = '';
        rightCol.appendChild(placeholder);
    }

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
            if (options.isNewNote) {
                _showNewNoteLoadingPlaceholder();
            }
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
            if (existingTab.id === activeTabId) {
                // The tab is already active (page-reload restore): switchToTab
                // would no-op, so check the board is really in the right column
                // and not the server-rendered note.
                var boardContainer = document.getElementById('kanban-view-container');
                if (!boardContainer || String(boardContainer.dataset.folderId) !== folderId) {
                    _loadKanbanTab(existingTab);
                }
                return;
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
    function _restoreScrollForNote(noteId) {
        if (!activeTabId) return;
        var tab = _findTabById(activeTabId);
        if (!tab || !_isNoteTab(tab) || String(tab.noteId) !== String(noteId)) return;
        _restoreScrollPosition(tab);
    }

    /** Active scroll-restore watcher (ResizeObserver + timer), one at a time. */
    var _scrollRestoreObserver = null;
    var _scrollRestoreTimer = null;

    function _cancelScrollRestoreWatch() {
        if (_scrollRestoreObserver) {
            try { _scrollRestoreObserver.disconnect(); } catch (e) { }
            _scrollRestoreObserver = null;
        }
        if (_scrollRestoreTimer) {
            clearTimeout(_scrollRestoreTimer);
            _scrollRestoreTimer = null;
        }
    }

    function _saveScrollPosition() {
        // Navigating away: a still-running restore watcher belongs to the note
        // being left — stop it so it cannot clobber the next note's scroll.
        _cancelScrollRestoreWatch();
        if (!activeTabId) return;
        var currentTab = _findTabById(activeTabId);
        if (!currentTab || !_isNoteTab(currentTab)) return;
        var rightCol = document.getElementById('right_col');
        if (!rightCol) return;
        var positions = { main: rightCol.scrollTop };
        var cmScroller = rightCol.querySelector('.cm-scroller');
        if (cmScroller) positions.cmScroller = cmScroller.scrollTop;
        var mdPreview = rightCol.querySelector('.markdown-preview');
        if (mdPreview) positions.mdPreview = mdPreview.scrollTop;
        _scrollPositions[activeTabId] = positions;
    }

    function _restoreScrollPosition(tab) {
        if (!tab) return;
        var saved = _scrollPositions[tab.id];
        if (!saved) return;

        // Only one restore watcher at a time — a previous tab's watcher must
        // not re-apply its scroll on top of this one.
        _cancelScrollRestoreWatch();

        function applyScroll() {
            // The user may have switched tabs again while we were watching
            if (activeTabId !== tab.id) {
                _cancelScrollRestoreWatch();
                return;
            }
            var rightCol = document.getElementById('right_col');
            if (!rightCol) return;
            if (typeof saved.main === 'number') rightCol.scrollTop = saved.main;
            if (typeof saved.cmScroller === 'number') {
                var cmScroller = rightCol.querySelector('.cm-scroller');
                if (cmScroller) cmScroller.scrollTop = saved.cmScroller;
            }
            if (typeof saved.mdPreview === 'number') {
                var mdPreview = rightCol.querySelector('.markdown-preview');
                if (mdPreview) mdPreview.scrollTop = saved.mdPreview;
            }
        }

        applyScroll();

        // Watch for layout shifts caused by images loading and re-apply scroll each time.
        // Stop watching after 3 seconds to avoid interfering with user scrolling.
        var rightCol = document.getElementById('right_col');
        if (!rightCol || typeof ResizeObserver === 'undefined') return;

        var deadline = Date.now() + 3000;
        var observer = new ResizeObserver(function () {
            if (Date.now() > deadline) {
                observer.disconnect();
                return;
            }
            applyScroll();
        });
        // Observe the note content area so any height change (image load) triggers re-apply
        var noteContent = rightCol.querySelector('.notecard, .noteentry, .markdown-preview');
        if (noteContent) {
            observer.observe(noteContent);
            _scrollRestoreObserver = observer;
            // Disconnect after deadline regardless
            _scrollRestoreTimer = setTimeout(function () {
                observer.disconnect();
                if (_scrollRestoreObserver === observer) _scrollRestoreObserver = null;
                _scrollRestoreTimer = null;
            }, 3000);
        }
    }

    /**
     * Restore a tab's scroll position, unless the note is a markdown note whose
     * interactive editor is not built yet — that case restores via
     * _restoreScrollForNote() at the end of initializeMarkdownNote(), once the
     * markdown DOM (cm-scroller, markdown-preview) actually exists.
     */
    function _restoreScrollWhenReady(tab) {
        var isMarkdown = !!document.querySelector('#right_col .noteentry[data-note-type="markdown"]');
        var markdownDomReady = !!document.querySelector('#right_col .cm-scroller, #right_col .markdown-preview');
        if (!isMarkdown || markdownDomReady) {
            _restoreScrollPosition(tab);
        }
    }

    function switchToTab(tabId) {
        var tab = _findTabById(tabId);
        if (!tab) return;
        if (tab.id === activeTabId) return; // already active

        _saveScrollPosition();
        _loadTabContent(tab);
    }

    /**
     * Called when a tab's × button is clicked.
     * Removes the tab and switches to the closest neighbour.
     * The last remaining tab cannot be closed unless force is true.
     */
    function closeTab(tabId, force) {
        var tabToClose = _findTabById(tabId);
        if (!force && tabToClose && _isPinnedTab(tabToClose)) return false; // cannot close pinned tab without unpinning
        if (!force && tabs.length <= 1) return false; // cannot close the last tab via UI
        var idx = _indexById(tabId);
        if (idx === -1) return false;

        var wasActive = (tabId === activeTabId);
        tabs.splice(idx, 1);
        delete _scrollPositions[tabId];

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
                _restoreScrollWhenReady(switchedTab);
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
            // Found existing tab for this note - make it active.
            // Sidebar navigation (including Alt+ArrowUp/Down) landing on a note
            // already open in a tab is a tab switch: restore its scroll position.
            activeTabId = existingTabWithNote.id;
            existingTabWithNote.title = title; // Update title just in case
            _restoreScrollWhenReady(existingTabWithNote);
        } else if (activeTabId !== null) {
            var tab = _findTabById(activeTabId);
            if (tab && _isPinnedTab(tab)) {
                // Don't replace a pinned tab — create a new tab instead
                var newTab = { id: _generateId(), type: 'note', noteId: noteId, title: title };
                tabs.push(newTab);
                activeTabId = newTab.id;
            } else if (tab) {
                // Update the active tab to the new note
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
        var openAsNewTab = false;
        try {
            var configEl = document.getElementById('current-note-data');
            if (configEl) {
                var config = JSON.parse(configEl.textContent);
                currentNoteId = config.noteId ? String(config.noteId) : null;
            }
            var params = new URLSearchParams(window.location.search || '');
            currentKanbanFolderId = params.get('kanban') ? String(params.get('kanban')) : null;
            // Set by external pages (e.g. the dashboard) to open the note as an
            // additional tab instead of replacing the active one.
            openAsNewTab = params.get('newtab') === '1';
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

            _sortPinnedFirst();
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
                } else if (openAsNewTab) {
                    // Requested via newtab=1 (e.g. from the dashboard) — add a tab
                    // for this note instead of replacing the active one
                    var requestedTab = { id: _generateId(), type: 'note', noteId: currentNoteId, title: _readTitle(currentNoteId, _getDefaultTitle()) };
                    tabs.push(requestedTab);
                    activeTabId = requestedTab.id;
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

            if (!currentNoteId && !currentKanbanFolderId && !_isSearchFilteringActive()) {
                var activeTabToRestore = _findTabById(activeTabId);
                if (_shouldRestoreActiveTabContent(activeTabToRestore)) {
                    setTimeout(function () {
                        _loadTabContent(activeTabToRestore);
                    }, 0);
                }
            }
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
                localStorage.setItem(_storageKey(oldWorkspace), JSON.stringify({
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
            _sortPinnedFirst();
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
        pinTab: pinTab,
        unpinTab: unpinTab,
        closeAllTabs: closeAllTabs,
        isNoteOpen: isNoteOpen,
        isKanbanOpen: isKanbanOpen,
        getActiveNoteId: getActiveNoteId,
        getActiveTabType: getActiveTabType,
        getActiveKanbanFolderId: getActiveKanbanFolderId,
        isInitialized: isInitialized,
        render: render,
        updateUI: updateOpenInNewTabButtons, // Expose for external calls
        _onNoteLoaded: _onNoteLoaded,
        _saveScrollPosition: _saveScrollPosition,
        _restoreScrollForNote: _restoreScrollForNote,
        switchWorkspace: switchWorkspace
    };

})();
