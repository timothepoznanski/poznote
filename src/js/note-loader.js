/**
 * Note loading.
 * 
 * Opening a note into the right column, from the cache when possible and over AJAX
 * otherwise, plus the surrounding state: loading indicator, search-term highlighting,
 * selected-note styling and the browser URL.
 */

function restoreNoteDomFromCache(url, noteId, options) {
    options = options || {};
    if (!isNoteDomCacheAllowed(url, noteId, options)) return false;

    var key = getNoteDomCacheKey(noteId, url);
    var cached = noteDomCache.get(key);
    if (!cached || !cached.fragment) return false;

    var currentRightColumn = document.getElementById('right_col');
    if (!currentRightColumn) return false;

    if (typeof clearSearchHighlights === 'function') {
        try { clearSearchHighlights(); } catch (e) { /* ignore */ }
    }

    storeCurrentNoteDomInCache(noteId, url, options);
    // Plain delete here (not dropNoteDomCacheEntry): this fragment is about to
    // be re-attached, its editors must stay alive.
    noteDomCache.delete(key);

    // Whatever is still in right_col was not moved into the cache above, so
    // its editors are about to be discarded - destroy them first.
    if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
        window.destroyMarkdownCodeMirrorEditorsWithin(currentRightColumn);
    }
    while (currentRightColumn.firstChild) {
        currentRightColumn.removeChild(currentRightColumn.firstChild);
    }
    currentRightColumn.appendChild(cached.fragment);
    requestAnimationFrame(function () {
        try {
            window.dispatchEvent(new Event('resize'));
        } catch (e) { /* ignore */ }
    });

    if (typeof window.hideNoteCreationLoading === 'function') {
        window.hideNoteCreationLoading();
    }

    if (window.tabManager) {
        window.tabManager._onNoteLoaded(noteId);
        window.tabManager.render();
    }

    clearKanbanStateForNoteLoad(options);

    if (!options.fromHistory) {
        updateBrowserUrl(url, noteId);
    }

    reinitializeNoteContent({
        skipStructuralInit: true,
        preserveRuntimeState: true
    });

    const isPublicWorkspaceReadonlyFromCache =
        (typeof window.isPublicWorkspaceNavigationActive === 'function' && window.isPublicWorkspaceNavigationActive()) ||
        (document.body && document.body.classList.contains('public-workspace-readonly'));

    if (typeof window.createNoteSnapshot === 'function' && !isPublicWorkspaceReadonlyFromCache) {
        window.createNoteSnapshot(noteId);
    }

    if (typeof options.onLoadingComplete === 'function') {
        options.onLoadingComplete();
    }

    if (typeof options.onContentLoaded === 'function') {
        options.onContentLoaded(noteId, url);
    }

    if (typeof applyHighlightsWithRetries === 'function') {
        try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
    }

    finishNoteLoadVisualState(options);
    return true;
}

/**
 * Ensure the currently active search highlight is visible in the viewport.
 * Called from retry passes to correct for layout shifts after initial scroll.
 */
function ensureActiveHighlightVisible() {
    try {
        if (!window.searchNavigation) return;
        var nav = window.searchNavigation;
        if (nav.currentHighlightIndex < 0 || !nav.highlights || nav.highlights.length === 0) return;
        var idx = Math.min(nav.currentHighlightIndex, nav.highlights.length - 1);
        var target = nav.highlights[idx];
        if (!target || !document.body.contains(target)) return;

        var rect = target.getBoundingClientRect();
        var vpHeight = window.innerHeight || document.documentElement.clientHeight;

        // Compute sticky offset
        var topThreshold = 0;
        var tabBar = document.getElementById('app-tab-bar');
        if (tabBar) topThreshold += tabBar.offsetHeight;
        
        // For titles, don't include note-header since title is inside it
        var isInTitle = target.closest('.css-title, .note-header .title');
        var nc = target.closest('.notecard');
        if (nc && !isInTitle) {
            var nh = nc.querySelector('.note-header');
            if (nh) topThreshold += nh.offsetHeight;
        }
        topThreshold += 12;

        var isInView = rect.top >= topThreshold && rect.top <= vpHeight * 0.85;
        if (!isInView) {
            target.style.scrollMarginTop = topThreshold + 'px';
            target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
        }
    } catch (e) { /* ignore */ }
}

/**
 * Reapply search highlights with a couple of delayed retries to handle layout timing.
 * Centralized helper to avoid duplicated code blocks across loaders.
 */
function applyHighlightsWithRetries() {
    // Check for combined mode first
    var isCombinedMode = false;
    try {
        var combinedModeInput = document.getElementById('search-combined-mode');
        var combinedModeInputMobile = document.getElementById('search-combined-mode-mobile');
        isCombinedMode = (combinedModeInput && combinedModeInput.value === '1') ||
            (combinedModeInputMobile && combinedModeInputMobile.value === '1');

        // Also check via SearchManager if available
        if (!isCombinedMode && window.searchManager && typeof window.searchManager.isCombinedModeActive === 'function') {
            isCombinedMode = window.searchManager.isCombinedModeActive(false) || window.searchManager.isCombinedModeActive(true);
        }
    } catch (e) { /* ignore */ }

    // In combined mode, apply BOTH highlights
    if (isCombinedMode) {
        var searchTerm = (document.getElementById('unified-search') && document.getElementById('unified-search').value) ||
            (document.getElementById('unified-search-mobile') && document.getElementById('unified-search-mobile').value) || '';

        // Apply notes highlighting
        if (typeof highlightSearchTerms === 'function') {
            try { highlightSearchTerms(); } catch (e) { /* ignore */ }
        }
        // Apply tags highlighting
        if (typeof window.highlightMatchingTags === 'function') {
            try { window.highlightMatchingTags(searchTerm.trim()); } catch (e) { /* ignore */ }
        }

        // Delayed retries for combined mode
        setTimeout(function () {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) { }
            }
            if (typeof window.highlightMatchingTags === 'function') {
                try { window.highlightMatchingTags(searchTerm.trim()); } catch (e) { }
            }
            if (typeof updateAllOverlayPositions === 'function') {
                try { updateAllOverlayPositions(); } catch (e) { }
            }
        }, 100);
        setTimeout(function () {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) { }
            }
            if (typeof window.highlightMatchingTags === 'function') {
                try { window.highlightMatchingTags(searchTerm.trim()); } catch (e) { }
            }
            if (typeof updateAllOverlayPositions === 'function') {
                try { updateAllOverlayPositions(); } catch (e) { }
            }
            ensureActiveHighlightVisible();
        }, 250);
        return;
    }

    // Determine active search type (prefer SearchManager if available)
    var activeType = null;
    try {
        var isMobile = isMobileDevice();
        // 1) Prefer SearchManager's mobile-aware state
        if (window.searchManager && typeof window.searchManager.getActiveSearchType === 'function') {
            activeType = window.searchManager.getActiveSearchType(isMobile) || null;
        }
        // 2) Fallback to URL params (tags_search / search) which reflect user-initiated searches
        if (!activeType) {
            try {
                var urlParams = new URLSearchParams(window.location.search || '');
                if (urlParams.get('tags_search')) activeType = 'tags';
                else if (urlParams.get('search')) activeType = 'notes';
            } catch (e) { /* ignore */ }
        }
        // 3) Finally infer from hidden inputs (mobile-aware)
        if (!activeType) {
            try {
                var hiddenTags = (isMobile && document.getElementById('search-in-tags-mobile')?.value === '1') || (!isMobile && document.getElementById('search-in-tags')?.value === '1');
                var hiddenNotes = (isMobile && document.getElementById('search-in-notes-mobile')?.value === '1') || (!isMobile && document.getElementById('search-in-notes')?.value === '1');
                if (hiddenTags) activeType = 'tags';
                else if (hiddenNotes) activeType = 'notes';
            } catch (e) { /* ignore */ }
        }

        // No folder-specific fallbacks: only detect notes or tags searches.
    } catch (e) { activeType = null; }

    // Extra fallback: use globally recorded last active search type from SearchManager
    if (!activeType && typeof window._lastActiveSearchType === 'string') {
        activeType = window._lastActiveSearchType;
    }

    // folders search removed: always allow notes/tags highlight reapplication

    // Reapply only the highlights relevant to the active search type
    if (activeType === 'tags') {
        // Enforce tag highlighting with word-search logic for navigation support
        if (typeof window.highlightMatchingTags === 'function') {
            try {
                var desktopTagsTerm = (document.getElementById('search-tags-hidden') && document.getElementById('search-tags-hidden').value) || '';
                var mobileTagsTerm = (document.getElementById('search-tags-hidden-mobile') && document.getElementById('search-tags-hidden-mobile').value) || '';
                var visible = (document.getElementById('unified-search') && document.getElementById('unified-search').value) || (document.getElementById('unified-search-mobile') && document.getElementById('unified-search-mobile').value) || '';
                var term = desktopTagsTerm && desktopTagsTerm.trim() ? desktopTagsTerm.trim() : (mobileTagsTerm && mobileTagsTerm.trim() ? mobileTagsTerm.trim() : visible.trim());
                window.highlightMatchingTags(term);
            } catch (e) { /* ignore */ }
        }
    } else if (activeType === 'notes') {
        // Clear any tag UI highlights so notes highlights are the only visible highlights
        if (typeof window.highlightMatchingTags === 'function') {
            try { window.highlightMatchingTags(''); } catch (e) { /* ignore */ }
        }
        if (typeof highlightSearchTerms === 'function') {
            try { highlightSearchTerms(); } catch (e) { /* ignore */ }
        }
    } else {
        // Unknown active type: attempt to re-run both but prefer notes first
        if (typeof highlightSearchTerms === 'function') {
            try { highlightSearchTerms(); } catch (e) { /* ignore */ }
        }
        if (typeof window.highlightMatchingTags === 'function') {
            try { window.highlightMatchingTags((document.getElementById('unified-search') && document.getElementById('unified-search').value) || ''); } catch (e) { /* ignore */ }
        }
    }

    // Delayed retries to handle layout/async changes and overlay positioning
    setTimeout(function () {
        if (activeType === 'notes') {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) { }
            }
        } else if (activeType === 'tags') {
            if (typeof window.highlightMatchingTags === 'function') {
                try {
                    var term2 = (document.getElementById('search-tags-hidden') && document.getElementById('search-tags-hidden').value) || (document.getElementById('unified-search') && document.getElementById('unified-search').value) || '';
                    window.highlightMatchingTags(term2);
                } catch (e) { /* ignore */ }
            }
        }
        if (typeof updateAllOverlayPositions === 'function') {
            try { updateAllOverlayPositions(); } catch (e) { }
        }
    }, 100);
    setTimeout(function () {
        if (activeType === 'notes') {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) { }
            }
        } else if (activeType === 'tags') {
            if (typeof window.highlightMatchingTags === 'function') {
                try {
                    var term3 = (document.getElementById('search-tags-hidden') && document.getElementById('search-tags-hidden').value) || (document.getElementById('unified-search') && document.getElementById('unified-search').value) || '';
                    window.highlightMatchingTags(term3);
                } catch (e) { /* ignore */ }
            }
        }
        if (typeof updateAllOverlayPositions === 'function') {
            try { updateAllOverlayPositions(); } catch (e) { }
        }
        ensureActiveHighlightVisible();
    }, 300);
}

/**
 * Find note link by title (robust method that handles quotes and special characters)
 */
function findNoteLinkById(noteId) {
    const noteLinks = document.querySelectorAll('a.links_arbo_left[data-note-id]');
    for (let link of noteLinks) {
        if (link.getAttribute('data-note-id') === String(noteId)) {
            return link;
        }
    }
    return null;
}

/**
 * Common note loading logic shared by loadNoteDirectly and loadNoteViaAjax.
 * Handles XHR request, response parsing, content update, and error handling.
 * @param {string} url - The original URL to load
 * @param {string|number} noteId - The note ID
 * @param {Object} options - Configuration for behavior differences
 * @param {HTMLElement} options.clickedLink - Element to mark as selected
 * @param {boolean} options.fromHistory - Whether navigating from popstate (skip URL push)
 * @param {boolean} options.needsRefresh - Whether to add cache-busting parameter
 * @param {boolean} options.clearKanbanFlags - Whether to clear Kanban view state
 * @param {boolean} options.updateSelectionBeforeLoad - Update selection before XHR (true) or after (false)
 * @param {boolean} options.reinitClickHandlers - Whether to reinitialize note click handlers
 * @param {number} options.xhrTimeout - XHR timeout in ms (0 = no timeout)
 * @param {Function} options.onLoadingComplete - Called when loading flag should be cleared
 * @param {Function} options.onContentLoaded - Called after content is inserted and initialized
 */
function loadNoteCommon(url, noteId, options) {
    options = options || {};

    if (options.updateSelectionBeforeLoad && options.clickedLink) {
        updateSelectedNote(options.clickedLink);
    }

    // On mobile .note-open is NOT added here: it resizes the columns (the
    // icon rail hides), which reads as a first jerky animation at tap time.
    // window.scrollToRightColumn applies it once the slide has finished.

    if (restoreNoteDomFromCache(url, noteId, options)) {
        return;
    }

    // Show loading state (skip fade-out animation for tab switches to avoid flash)
    if (!options.skipLoadingAnimation) {
        showNoteLoadingState();
    }

    // Build final URL with cache-busting if needed
    var finalUrl = url;
    if (options.needsRefresh) {
        var separator = url.includes('?') ? '&' : '?';
        finalUrl = url + separator + '_refresh=' + Date.now();
    }

    var clearLoading = function () {
        if (typeof options.onLoadingComplete === 'function') {
            options.onLoadingComplete();
        }
    };

    var handleError = function () {
        hideNoteLoadingState();
        if (isMobileDevice()) {
            document.body.classList.remove('note-open');
        }
    };

    // Create XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', finalUrl, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function () {
        try {
            if (xhr.readyState === 4) {
                clearLoading();

                if (xhr.status === 200) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(xhr.responseText, 'text/html');
                        const rightColumn = doc.getElementById('right_col');

                        if (rightColumn) {
                            const currentRightColumn = document.getElementById('right_col');
                            if (currentRightColumn) {
                                // Clear existing highlights first to avoid overlays being left over
                                if (typeof clearSearchHighlights === 'function') {
                                    try { clearSearchHighlights(); } catch (e) { /* ignore */ }
                                }

                                storeCurrentNoteDomInCache(noteId, url, options);

                                // Destroy editors that were not moved into the
                                // DOM cache before their DOM is discarded
                                if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
                                    window.destroyMarkdownCodeMirrorEditorsWithin(currentRightColumn);
                                }

                                // Replace right_col content (tab bar lives in #right_pane, not here)
                                currentRightColumn.innerHTML = rightColumn.innerHTML;

                                if (typeof window.hideNoteCreationLoading === 'function') {
                                    window.hideNoteCreationLoading();
                                }

                                // Update tab state and re-render tab bar
                                if (window.tabManager) {
                                    window.tabManager._onNoteLoaded(noteId);
                                    window.tabManager.render();
                                }

                                clearKanbanStateForNoteLoad(options);

                                // Update URL (skip if coming from popstate)
                                if (!options.fromHistory) {
                                    updateBrowserUrl(url, noteId);
                                }

                                reinitializeNoteContent();

                                const isPublicWorkspaceReadonly =
                                    (typeof window.isPublicWorkspaceNavigationActive === 'function' && window.isPublicWorkspaceNavigationActive()) ||
                                    (document.body && document.body.classList.contains('public-workspace-readonly'));

                                if (typeof window.createNoteSnapshot === 'function' && !isPublicWorkspaceReadonly) {
                                    window.createNoteSnapshot(noteId);
                                }

                                // Post-content hook for caller-specific logic
                                if (typeof options.onContentLoaded === 'function') {
                                    options.onContentLoaded(noteId, url);
                                }

                                // Reapply highlights after content initialization
                                if (typeof applyHighlightsWithRetries === 'function') {
                                    try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                                }

                                finishNoteLoadVisualState(options);

                                // Reinitialize note click handlers if requested
                                if (options.reinitClickHandlers && typeof window.initializeNoteClickHandlers === 'function') {
                                    window.initializeNoteClickHandlers();
                                }
                            } else {
                                throw new Error('Could not find current right column');
                            }
                        } else {
                            throw new Error('Could not find note content in response');
                        }
                    } catch (error) {
                        console.error('Error loading note:', error);
                        showNotificationPopup('Error loading note: ' + error.message, 'error');
                        handleError();
                    }
                } else {
                    // Don't show error popup for network errors (status 0), xhr.onerror will handle it
                    if (xhr.status !== 0) {
                        console.error('Failed to load note, status:', xhr.status);
                        showNotificationPopup('Failed to load note (status: ' + xhr.status + ')', 'error');
                    }
                    handleError();
                }
            }
        } catch (error) {
            console.error('Error in xhr onreadystatechange:', error);
            clearLoading();
            handleError();
        }
    };

    xhr.onerror = function () {
        clearLoading();
        console.error('Network error during note loading');
        showNotificationPopup('Network error - please check your connection', 'error');
        handleError();
        // Re-initialize search highlighting if in search mode
        if (isMobileDevice() && typeof applyHighlightsWithRetries === 'function' && typeof isSearchMode !== 'undefined' && isSearchMode) {
            try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
        }
    };

    xhr.ontimeout = function () {
        clearLoading();
        console.error('Request timeout during note loading');
        showNotificationPopup('Request timeout - please try again', 'error');
        handleError();
    };

    if (options.xhrTimeout) {
        xhr.timeout = options.xhrTimeout;
    }

    xhr.send();
}

/**
 * Direct note loading function called from onclick
 * @param {string} url - The URL to load
 * @param {string|number} noteId - The note ID
 * @param {Event} event - The click event
 * @param {HTMLElement} clickedElement - The actual clicked link element (optional)
 */
window.loadNoteDirectly = function (url, noteId, event, clickedElement, extraOptions) {
    try {
        // Check for unsaved changes in current note before proceeding
        var currentNoteId = window.noteid;
        if (currentNoteId && currentNoteId !== noteId && typeof window.hasUnsavedChanges === 'function') {
            if (window.hasUnsavedChanges(currentNoteId)) {
                // Show save in progress notification
                if (typeof window.showSaveInProgressNotification === 'function') {
                    window.showSaveInProgressNotification(function () {
                        window.loadNoteDirectly(url, noteId, null);
                    });
                    return false;
                }
            }
        }
        
        // Trigger background git push if needed when leaving a note
        if (typeof window.triggerBackgroundPush === 'function') {
            window.triggerBackgroundPush();
        }

        // Prevent default link behavior
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Set flag for mobile scroll behavior
        if (typeof sessionStorage !== 'undefined' && isMobileDevice()) {
            sessionStorage.setItem('shouldScrollToNote', 'true');
        }

        // Cancel any pending auto-save operations for the previous note
        if (typeof saveTimeout !== 'undefined') {
            clearTimeout(saveTimeout);
        }

        // Check if this note needs a refresh (was left before auto-save completed)
        var needsRefresh = false;
        if (typeof notesNeedingRefresh !== 'undefined') {
            needsRefresh = notesNeedingRefresh.has(String(noteId));
            if (needsRefresh) {
                notesNeedingRefresh.delete(String(noteId));
            }
        }

        // Prevent multiple simultaneous loads
        if (window.isLoadingNote) {
            return false;
        }
        window.isLoadingNote = true;

        // Save scroll position of the current tab before navigating away
        if (window.tabManager && typeof window.tabManager._saveScrollPosition === 'function') {
            window.tabManager._saveScrollPosition();
        }

        // Find the clicked link to update selection
        const clickedLink = clickedElement || findNoteLinkById(noteId);

        loadNoteCommon(url, noteId, Object.assign({
            clickedLink: clickedLink,
            fromHistory: false,
            needsRefresh: needsRefresh,
            clearKanbanFlags: true,
            updateSelectionBeforeLoad: false,
            reinitClickHandlers: true,
            xhrTimeout: 10000,
            onLoadingComplete: function () {
                window.isLoadingNote = false;
            },
            onContentLoaded: function (loadedNoteId, originalUrl) {
                // If this was a forced refresh, skip auto-draft restore
                if (needsRefresh && typeof checkForUnsavedDraft === 'function') {
                    setTimeout(function () {
                        checkForUnsavedDraft(loadedNoteId, true); // true = skip auto restore
                    }, 100);

                    // Clean up the URL by removing the _refresh parameter
                    if (window.history && window.history.replaceState) {
                        var cleanUrl = originalUrl.replace(/[?&]_refresh=\d+/, '');
                        // Remove trailing ? or & if they exist
                        cleanUrl = cleanUrl.replace(/[?&]$/, '');
                        window.history.replaceState(null, '', cleanUrl);
                    }
                }

                // Auto-scroll to right column on mobile after note is loaded
                if (isMobileDevice() && loadedNoteId && typeof scrollToRightColumn === 'function') {
                    const shouldScroll = sessionStorage.getItem('shouldScrollToNote');
                    if (shouldScroll === 'true') {
                        requestAnimationFrame(function () {
                            scrollToRightColumn();
                            sessionStorage.removeItem('shouldScrollToNote');
                        });
                    }
                }
            }
        }, extraOptions || {}));

        return false;
    } catch (error) {
        console.error('Error in loadNoteDirectly:', error);
        window.isLoadingNote = false;
        if (isMobileDevice()) {
            document.body.classList.remove('note-open');
        }
        showNotificationPopup('Error initializing note load: ' + error.message, 'error');
        return false;
    }
};

/**
 * Load note via AJAX (legacy function)
 */
function loadNoteViaAjax(url, noteId, clickedLink, fromHistory) {
    if (isNoteLoading) {
        return; // Prevent multiple simultaneous requests
    }

    isNoteLoading = true;
    currentLoadingNoteId = noteId;
    fromHistory = fromHistory || false;

    loadNoteCommon(url, noteId, {
        clickedLink: clickedLink,
        fromHistory: fromHistory,
        needsRefresh: false,
        clearKanbanFlags: false,
        updateSelectionBeforeLoad: true,
        reinitClickHandlers: false,
        xhrTimeout: 0,
        onLoadingComplete: function () {
            isNoteLoading = false;
        },
        onContentLoaded: null
    });
}

/**
 * Load note from URL (for browser navigation)
 */
function loadNoteFromUrl(url, fromHistory) {
    const urlParams = new URLSearchParams(new URL(url).search);
    const noteId = urlParams.get('note');

    if (noteId) {
        // Find the corresponding note link using robust method
        const noteLink = findNoteLinkById(noteId);
        if (noteLink) {
            loadNoteViaAjax(url, noteId, noteLink, fromHistory);
        }
    }
}

/**
 * Show loading state with smooth fade effect.
 * When the tab bar is present, only fade the note content below it.
 */
function showNoteLoadingState() {
    const rightColumn = document.getElementById('right_col');
    if (!rightColumn) return;
    rightColumn.classList.add('note-fade-out');
}

/**
 * Hide loading state and show content with fade-in.
 * When the tab bar is present, only animate the note content below it.
 */
function hideNoteLoadingState() {
    const rightColumn = document.getElementById('right_col');
    if (!rightColumn) return;
    rightColumn.classList.remove('note-fade-out');
    rightColumn.classList.add('note-loading-state');
    setTimeout(function () {
        rightColumn.classList.remove('note-loading-state');
    }, 150);
}

/**
 * Update selected note in the left column
 */
function updateSelectedNote(clickedLink) {
    // updateSelectedNote start
    // Remove selected class from all notes
    document.querySelectorAll('.links_arbo_left').forEach(link => {
        link.classList.remove('selected-note');
    });

    // Add selected class to clicked note and all other instances of the same note
    if (clickedLink) {
        const noteId = clickedLink.getAttribute('data-note-id');
        const clickedNoteType = clickedLink.getAttribute('data-note-type');
        const linkedSourceNoteId = clickedLink.getAttribute('data-linked-note-id');

        if (noteId) {
            // Find all links with the same note ID (including in favorites)
            document.querySelectorAll('.links_arbo_left').forEach(link => {
                if (link.getAttribute('data-note-id') === noteId) {
                    link.classList.add('selected-note');
                }
            });

            // If we clicked on a linked note, also mark the linked note itself as selected
            if (clickedNoteType === 'linked') {
                clickedLink.classList.add('selected-note');

                // Also mark the source note itself as selected
                if (linkedSourceNoteId) {
                    document.querySelectorAll('.links_arbo_left').forEach(link => {
                        const linkNoteId = link.getAttribute('data-note-id');
                        const linkDbId = link.getAttribute('data-note-db-id');
                        if (linkNoteId === linkedSourceNoteId || linkDbId === linkedSourceNoteId) {
                            link.classList.add('selected-note');
                        }
                    });
                }
            }
        } else {
            // Fallback to the clicked link only if no data-note-id
            clickedLink.classList.add('selected-note');
        }

        // Ensure the selection persists by re-applying it after a short delay
        // This helps in case other scripts interfere with the selection
        setTimeout(() => {
            if (noteId) {
                document.querySelectorAll('.links_arbo_left').forEach(link => {
                    if (link.getAttribute('data-note-id') === noteId && !link.classList.contains('selected-note')) {
                        link.classList.add('selected-note');
                    }
                });

                // Re-apply selection to the linked note if applicable
                if (clickedNoteType === 'linked' && !clickedLink.classList.contains('selected-note')) {
                    clickedLink.classList.add('selected-note');
                }

                // Re-apply selection to the source note for linked notes
                if (clickedNoteType === 'linked' && linkedSourceNoteId) {
                    document.querySelectorAll('.links_arbo_left').forEach(link => {
                        const linkNoteId = link.getAttribute('data-note-id');
                        const linkDbId = link.getAttribute('data-note-db-id');
                        if ((linkNoteId === linkedSourceNoteId || linkDbId === linkedSourceNoteId) && !link.classList.contains('selected-note')) {
                            link.classList.add('selected-note');
                        }
                    });
                }
            } else if (clickedLink && !clickedLink.classList.contains('selected-note')) {
                clickedLink.classList.add('selected-note');
            }
        }, 50);
    }
}

/**
 * Update browser URL without reload
 */
function updateBrowserUrl(url, noteId) {
    // Track this note in navigation history
    if (typeof NoteHistory !== 'undefined' && NoteHistory.push) {
        NoteHistory.push(noteId);
    }
    try {
        // Merge existing search params into the target URL
        const currentParams = new URLSearchParams(window.location.search || '');
        const preserveKeys = ['search', 'tags_search', 'created_from', 'created_to', 'workspace', 'public_workspace', 'preserve_notes', 'preserve_tags', 'search_combined'];

        const target = new URL(url, window.location.origin);
        const targetParams = new URLSearchParams(target.search || '');

        preserveKeys.forEach(k => {
            const v = currentParams.get(k);
            if (v && !targetParams.has(k)) {
                targetParams.set(k, v);
            }
        });

        target.search = targetParams.toString();
        const state = { noteId: noteId };
        history.pushState(state, '', target.toString());
    } catch (e) {
        const state = { noteId: noteId };
        history.pushState(state, '', url);
    }
}
