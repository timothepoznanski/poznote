/**
 * Note Loader Common - Shared functionality for note loading system
 * Contains common functions used by both desktop and mobile versions
 */

// Global variables for note loading
var currentLoadingNoteId = null;
var isNoteLoading = false;
var imageClickHandlerInitialized = false;

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
        // In tags-only mode, we still call highlightSearchTerms() to initialize word-search navigation
        // even if it finds 0 matches in content, so that Entrée works for tags.
        if (typeof highlightSearchTerms === 'function') {
            try { highlightSearchTerms(); } catch (e) { /* ignore */ }
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
            // Re-apply both for tags mode to ensure navigation logic is initialized
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) { }
            }
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
            // Clear any note highlights before highlighting tags
            if (typeof clearSearchHighlights === 'function') {
                try { clearSearchHighlights(); } catch (e) { }
            }
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

    // Show loading state
    showNoteLoadingState();
    if (options.updateSelectionBeforeLoad && options.clickedLink) {
        updateSelectedNote(options.clickedLink);
    }

    // On mobile, add note-open class
    if (isMobileDevice()) {
        document.body.classList.add('note-open');
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

                                // Preserve the tab bar if it exists, only replace content below it
                                var existingTabBar = document.getElementById('app-tab-bar');
                                if (existingTabBar) {
                                    // Build new content in a fragment (avoids reflows per node)
                                    var frag = document.createDocumentFragment();
                                    var srcNodes = rightColumn.childNodes;
                                    for (var i = 0; i < srcNodes.length; i++) {
                                        var imported = document.importNode(srcNodes[i], true);
                                        if (imported.id !== 'app-tab-bar') {
                                            // Insert hidden so it doesn't flash before hideNoteLoadingState runs
                                            if (imported.nodeType === 1) imported.classList.add('note-fade-out');
                                            frag.appendChild(imported);
                                        }
                                    }
                                    // Remove everything after the tab bar in one go
                                    while (existingTabBar.nextSibling) {
                                        currentRightColumn.removeChild(existingTabBar.nextSibling);
                                    }
                                    // Remove everything before the tab bar too (shouldn't exist, but be safe)
                                    while (currentRightColumn.firstChild && currentRightColumn.firstChild !== existingTabBar) {
                                        currentRightColumn.removeChild(currentRightColumn.firstChild);
                                    }
                                    // Append all new content at once
                                    currentRightColumn.appendChild(frag);
                                } else {
                                    currentRightColumn.innerHTML = rightColumn.innerHTML;
                                }

                                // Update tab state and re-render tab bar
                                if (window.tabManager) {
                                    window.tabManager._onNoteLoaded(noteId);
                                    window.tabManager.render();
                                }

                                // Clear Kanban view flags if requested
                                if (options.clearKanbanFlags) {
                                    window._isKanbanViewActive = false;
                                    window._kanbanFolderId = null;
                                    window._originalRightColContent = null;
                                }

                                // Update URL (skip if coming from popstate)
                                if (!options.fromHistory) {
                                    updateBrowserUrl(url, noteId);
                                }

                                reinitializeNoteContent();

                                // Post-content hook for caller-specific logic
                                if (typeof options.onContentLoaded === 'function') {
                                    options.onContentLoaded(noteId, url);
                                }

                                // Reapply highlights after content initialization
                                if (typeof applyHighlightsWithRetries === 'function') {
                                    try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                                }

                                // Small delay to ensure the loading animation is visible
                                setTimeout(function () {
                                    hideNoteLoadingState();
                                    // Update selection after load if not done before
                                    if (!options.updateSelectionBeforeLoad && options.clickedLink) {
                                        updateSelectedNote(options.clickedLink);
                                    }
                                }, 80);

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
window.loadNoteDirectly = function (url, noteId, event, clickedElement) {
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

        // Find the clicked link to update selection
        const clickedLink = clickedElement || findNoteLinkById(noteId);

        loadNoteCommon(url, noteId, {
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
                        setTimeout(function () {
                            scrollToRightColumn();
                            sessionStorage.removeItem('shouldScrollToNote');
                        }, 100);
                    }
                }
            }
        });

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

    const tabBar = document.getElementById('app-tab-bar');
    if (tabBar) {
        // Fade only siblings after the tab bar
        var node = tabBar.nextSibling;
        while (node) {
            if (node.nodeType === 1) node.classList.add('note-fade-out');
            node = node.nextSibling;
        }
    } else {
        rightColumn.classList.add('note-fade-out');
    }
}

/**
 * Hide loading state and show content with fade-in.
 * When the tab bar is present, only animate the note content below it.
 */
function hideNoteLoadingState() {
    const rightColumn = document.getElementById('right_col');
    if (!rightColumn) return;

    // Always remove from the main container first, in case it was added there 
    // by showNoteLoadingState (e.g. if the tab bar was missing at that time).
    rightColumn.classList.remove('note-fade-out');

    const tabBar = document.getElementById('app-tab-bar');
    if (tabBar) {
        // Animate only siblings after the tab bar
        var node = tabBar.nextSibling;
        while (node) {
            if (node.nodeType === 1) {
                node.classList.remove('note-fade-out');
                node.classList.add('note-loading-state');
                (function (el) {
                    setTimeout(function () { el.classList.remove('note-loading-state'); }, 150);
                })(node);
            }
            node = node.nextSibling;
        }
    } else {
        rightColumn.classList.remove('note-fade-out');
        rightColumn.classList.add('note-loading-state');
        setTimeout(() => {
            rightColumn.classList.remove('note-loading-state');
        }, 150);
    }
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
    try {
        // Merge existing search params (search, tags_search, workspace, preserve_notes, preserve_tags, search_combined) into the target URL
        const currentParams = new URLSearchParams(window.location.search || '');
        const preserveKeys = ['search', 'tags_search', 'workspace', 'preserve_notes', 'preserve_tags', 'search_combined'];

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

/**
 * Re-initialize image click handlers for note content
 */
function reinitializeImageClickHandlers() {
    // Remove any leftover resize handles that might have been saved in HTML
    const leftoverHandles = document.querySelectorAll('.image-resize-handle');
    leftoverHandles.forEach(handle => handle.remove());

    // Find all images in the note content
    const allImages = document.querySelectorAll('img');

    // Use event delegation on document level (only set once)
    if (!imageClickHandlerInitialized) {
        document.addEventListener('click', function (event) {
            // Check if the click target or any parent is an image
            const img = event.target.tagName === 'IMG' ? event.target : event.target.closest('img');

            if (img && img.tagName === 'IMG') {
                handleImageClick(event);
            }
        }, true); // Use capture phase

        imageClickHandlerInitialized = true;
    }

    // Ensure all images are clickable
    allImages.forEach((img) => {
        img.style.cursor = 'pointer';

        // Remove existing tooltip event listeners to avoid duplicates
        const oldListeners = img._tooltipListeners;
        if (oldListeners) {
            img.removeEventListener('mouseenter', oldListeners.mouseenter);
            img.removeEventListener('mousemove', oldListeners.mousemove);
            img.removeEventListener('mouseleave', oldListeners.mouseleave);
        }

        // Add hover tooltip for images with links (not on public pages)
        if (!window.isPublicNotePage) {
            let currentToast;

            const mouseenterHandler = function (e) {
                // Check if link still exists at the time of hover
                const parentLink = img.closest('a[data-image-link]');
                if (parentLink && parentLink.href) {
                    currentToast = showImageLinkToast(parentLink.href, e.clientX, e.clientY);
                }
            };

            const mousemoveHandler = function (e) {
                // Update toast position as mouse moves
                if (currentToast) {
                    updateImageLinkToastPosition(currentToast, e.clientX, e.clientY);
                }
            };

            const mouseleaveHandler = function () {
                if (currentToast) {
                    hideImageLinkToast(currentToast);
                    currentToast = null;
                }
            };

            img.addEventListener('mouseenter', mouseenterHandler);
            img.addEventListener('mousemove', mousemoveHandler);
            img.addEventListener('mouseleave', mouseleaveHandler);

            // Store listeners for cleanup
            img._tooltipListeners = {
                mouseenter: mouseenterHandler,
                mousemove: mousemoveHandler,
                mouseleave: mouseleaveHandler
            };
        }
    });
}

/**
 * Safely remove the image menu and any associated submenu from the DOM.
 * @param {HTMLElement} menu - The main menu element
 */
function removeImageMenu(menu) {
    if (!menu) return;
    // Remove any associated submenu
    var submenu = menu._associatedSubmenu;
    if (submenu && document.body.contains(submenu)) {
        document.body.removeChild(submenu);
    }
    if (document.body.contains(menu)) {
        document.body.removeChild(menu);
    }
}

/**
 * Build the HTML for the image context menu based on image properties.
 * @param {HTMLImageElement} img - The image element
 * @returns {string} The menu innerHTML
 */
function buildImageMenuHTML(img) {
    // Check if this is an Excalidraw image
    const isExcalidraw = img.getAttribute('data-is-excalidraw') === 'true';
    const excalidrawNoteId = img.getAttribute('data-excalidraw-note-id');

    // Also check if this image is inside an Excalidraw container
    const excalidrawContainer = img.closest('.excalidraw-container');
    const isEmbeddedExcalidraw = excalidrawContainer !== null;
    const diagramId = excalidrawContainer ? excalidrawContainer.id : null;

    // Check if we're on mobile (width < 800px)
    const isMobile = window.innerWidth < 800;

    // Check if this is a markdown note (to exclude certain options for markdown)
    const isMarkdownNote = img.closest('.markdown-preview') !== null ||
        img.closest('.markdown-editor') !== null ||
        img.closest('.note-entry[data-note-format="markdown"]') !== null;

    // Helper function for translations
    const t = window.t || ((key, params, fallback) => fallback);

    let menuHTML = `
        <div class="image-menu-item" data-action="view-large">
            <i class="lucide-maximize-2"></i>
            ${t('image_menu.view_large', null, 'View Large')}
        </div>
        <div class="image-menu-item" data-action="download">
            <i class="lucide lucide-download"></i>
            ${t('image_menu.download', null, 'Download')}
        </div>
    `;

    // Add Resize option only on desktop (not on mobile) and NOT for markdown notes
    if (!isMobile && !isMarkdownNote) {
        menuHTML += `
        <div class="image-menu-item" data-action="resize">
            <i class="lucide-maximize"></i>
            ${t('image_menu.resize', null, 'Resize')}
        </div>
    `;
    }

    // Add Edit option for Excalidraw images (standalone notes) - hide on mobile
    if (isExcalidraw && excalidrawNoteId && !isMobile) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-excalidraw" data-note-id="${excalidrawNoteId}">
                <i class="lucide lucide-pencil"></i>
                ${t('image_menu.edit', null, 'Edit')}
            </div>
        ` + menuHTML;
    }

    // Add Edit option for embedded Excalidraw diagrams - hide on mobile
    if (isEmbeddedExcalidraw && diagramId && !isMobile) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-embedded-excalidraw" data-diagram-id="${diagramId}">
                <i class="lucide lucide-pencil"></i>
                ${t('image_menu.edit', null, 'Edit')}
            </div>
        ` + menuHTML;
    }

    // Add link option for all images
    const existingLink = img.closest('a');

    // If no existing link, show direct "Add Link" button
    if (!existingLink) {
        menuHTML += `
            <div class="image-menu-item" data-action="add-link">
                <i class="lucide lucide-link"></i>
                ${t('image_menu.add_link', null, 'Ajouter un lien')}
            </div>
        `;
    } else {
        // If link exists, create submenu with multiple options
        let linkSubmenuHTML = '';

        // Add "Open link" option first
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="open-link" data-url="${existingLink.href}">
                ${t('image_menu.open_link', null, 'Open Link')}
            </div>
        `;

        // Add edit link option
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="add-link">
                ${t('image_menu.edit_link', null, 'Modifier le lien')}
            </div>
        `;

        // Add remove link option
        linkSubmenuHTML += `
            <div class="image-menu-item image-submenu-item" data-action="remove-link">
                ${t('image_menu.remove_link', null, 'Retirer le lien')}
            </div>
        `;

        // Add link submenu parent
        menuHTML += `
            <div class="image-menu-item image-menu-parent" data-action="link-submenu" data-submenu-html="${encodeURIComponent(linkSubmenuHTML)}">
                <i class="lucide lucide-link"></i>
                ${t('image_menu.links', null, 'Liens')}
                <i class="lucide lucide-chevron-right" style="margin-left: auto; font-size: 10px;"></i>
            </div>
        `;
    }

    // Add border toggle and delete options only for non-markdown notes
    if (!isMarkdownNote) {
        const hasBorder = img.classList.contains('img-with-border');
        const hasBorderNoPadding = img.classList.contains('img-with-border-no-padding');
        menuHTML += `
            <div class="image-menu-item" data-action="toggle-border">
                <i class="lucide lucide-square"></i>
                ${hasBorder ? t('image_menu.remove_border', null, 'Remove Border') : t('image_menu.add_border', null, 'Add Border')}
            </div>
            <div class="image-menu-item" data-action="toggle-border-no-padding">
                <i class="lucide lucide-square"></i>
                ${hasBorderNoPadding ? t('image_menu.remove_border_no_padding', null, 'Remove Border without padding') : t('image_menu.add_border_no_padding', null, 'Add Border without padding')}
            </div>
        `;

        // Add Delete option at the end
        menuHTML += `
            <div class="image-menu-item" data-action="delete-image" style="color: #dc3545;">
                <i class="lucide lucide-trash-2"></i>
                ${t('image_menu.delete_image', null, 'Delete Image')}
            </div>
        `;
    }

    return menuHTML;
}

/**
 * Create and attach the link submenu for the image menu.
 * Handles hover behavior and click delegation for submenu actions.
 * @param {HTMLElement} menu - The main menu element
 * @param {HTMLImageElement} img - The image element
 */
function createImageSubmenu(menu, img) {
    const linkParent = menu.querySelector('.image-menu-parent[data-action="link-submenu"]');
    if (!linkParent) return;

    // Get submenu HTML from data attribute
    const linkSubmenuHTML = decodeURIComponent(linkParent.getAttribute('data-submenu-html'));

    // Create submenu element
    const submenu = document.createElement('div');
    submenu.className = 'image-submenu';
    submenu.style.display = 'none';
    submenu.innerHTML = linkSubmenuHTML;
    document.body.appendChild(submenu);

    // Store reference for cleanup
    menu._associatedSubmenu = submenu;

    linkParent.addEventListener('mouseenter', function () {
        submenu.style.display = 'block';

        // Position submenu like slash menu does
        const parentRect = linkParent.getBoundingClientRect();
        const submenuRect = submenu.getBoundingClientRect();

        const padding = 8;
        let x = parentRect.right + 4;
        let y = parentRect.top;

        // If overflows right, show on left
        if (x + submenuRect.width > window.innerWidth - padding) {
            x = parentRect.left - submenuRect.width - 4;
        }

        // If overflows bottom
        if (y + submenuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, window.innerHeight - submenuRect.height - padding);
        }

        submenu.style.position = 'fixed';
        submenu.style.left = Math.max(padding, x) + 'px';
        submenu.style.top = Math.max(padding, y) + 'px';

        const chevron = linkParent.querySelector('.lucide-chevron-right');
        if (chevron) {
            chevron.style.transform = 'rotate(90deg)';
        }
    });

    linkParent.addEventListener('mouseleave', function (e) {
        // Don't hide if moving to submenu
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!submenu.contains(relatedTarget) && relatedTarget !== submenu)) {
            setTimeout(() => {
                if (!submenu.matches(':hover')) {
                    submenu.style.display = 'none';
                    const chevron = linkParent.querySelector('.lucide-chevron-right');
                    if (chevron) {
                        chevron.style.transform = '';
                    }
                }
            }, 100);
        }
    });

    submenu.addEventListener('mouseleave', function (e) {
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!linkParent.contains(relatedTarget) && relatedTarget !== linkParent)) {
            submenu.style.display = 'none';
            const chevron = linkParent.querySelector('.lucide-chevron-right');
            if (chevron) {
                chevron.style.transform = '';
            }
        }
    });

    // Add click handlers to submenu items
    submenu.addEventListener('click', function (e) {
        const action = e.target.closest('.image-menu-item')?.getAttribute('data-action');
        handleImageMenuAction(action, img, e);
        removeImageMenu(menu);
    });
}

/**
 * Adjust the image menu position to stay within the viewport.
 * Must be called after the menu is appended to the DOM.
 * @param {HTMLElement} menu - The menu element (already in DOM)
 * @param {number} clickX - clientX of the original click
 * @param {number} clickY - clientY of the original click
 */
function adjustImageMenuPosition(menu, clickX, clickY) {
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    // If menu goes off the right edge, move it left
    if (menuRect.right > viewportWidth - padding) {
        menu.style.left = (clickX - (menuRect.width / 2)) + 'px';
        menu.style.transform = 'translate(0, -120%)';
    }

    // If menu goes off the left edge, move it right
    // Recalculate after potential right edge adjustment
    const updatedMenuRect = menu.getBoundingClientRect();
    if (updatedMenuRect.left < padding) {
        // Position menu with padding from left edge
        menu.style.left = (padding + menuRect.width / 2) + 'px';
        menu.style.transform = 'translate(-50%, -120%)';
    }

    // If menu goes off the top edge, move it below the cursor
    if (menuRect.top < padding) {
        menu.style.top = clickY + 'px';
        menu.style.transform = 'translate(-50%, 20%)';
    }
}

/**
 * Handle an action from the image context menu.
 * @param {string} action - The action identifier
 * @param {HTMLImageElement} img - The image element
 * @param {Event} e - The click event
 */
function handleImageMenuAction(action, img, e) {
    if (!action) return;

    if (action === 'view-large') {
        viewImageLarge(img.src);
    } else if (action === 'download') {
        downloadImage(img.src);
    } else if (action === 'edit-excalidraw') {
        const noteId = e.target.closest('.image-menu-item')?.getAttribute('data-note-id');
        if (noteId) {
            openExcalidrawNote(noteId);
        }
    } else if (action === 'edit-embedded-excalidraw') {
        const diagramId = e.target.closest('.image-menu-item')?.getAttribute('data-diagram-id');
        if (diagramId && window.openExcalidrawEditor) {
            openExcalidrawEditor(diagramId);
        }
    } else if (action === 'resize') {
        enableImageResize(img);
    } else if (action === 'toggle-border') {
        toggleImageBorder(img);
    } else if (action === 'toggle-border-no-padding') {
        toggleImageBorderNoPadding(img);
    } else if (action === 'delete-image') {
        deleteImage(img);
    } else if (action === 'open-link') {
        const url = e.target.closest('.image-menu-item')?.getAttribute('data-url');
        if (url) {
            window.open(url, '_blank');
        }
    } else if (action === 'add-link') {
        // Stop event propagation to prevent triggering link modal on parent <a> tags
        e.stopPropagation();
        e.preventDefault();
        addOrEditImageLink(img);
    } else if (action === 'remove-link') {
        removeImageLink(img);
    }
}

/**
 * Handle image click to show popup with options
 */
function handleImageClick(event) {
    const img = event.target;

    // Check if image has a valid src
    if (!img.src || img.src.trim() === '') {
        return;
    }

    // On public pages, if image is in a link, let the link work
    if (window.isPublicNotePage && img.closest('a')) {
        return;
    }

    // Always show the custom menu on left-click, even if image is in a link
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Remove any existing image menu
    const existingMenu = document.querySelector('.image-menu');
    if (existingMenu) {
        removeImageMenu(existingMenu);
    }

    // Create menu element with built HTML
    const menu = document.createElement('div');
    menu.className = 'image-menu';
    menu.innerHTML = buildImageMenuHTML(img);

    // Position the menu at click coordinates
    const clickX = event.clientX;
    const clickY = event.clientY;

    menu.style.position = 'fixed';
    menu.style.left = clickX + 'px';
    menu.style.top = clickY + 'px';
    menu.style.transform = 'translate(-50%, -120%)'; // Center horizontally, position above cursor with more space
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // Create and attach submenu for link options (if applicable)
    createImageSubmenu(menu, img);

    // Adjust position if menu goes off-screen
    adjustImageMenuPosition(menu, clickX, clickY);

    // Handle menu item clicks
    menu.addEventListener('click', function (e) {
        const action = e.target.closest('.image-menu-item')?.getAttribute('data-action');

        // Ignore click on link-submenu parent (handled by hover)
        if (action === 'link-submenu') {
            e.stopPropagation();
            return;
        }

        handleImageMenuAction(action, img, e);
        removeImageMenu(menu);

        // Prevent event bubbling to avoid triggering the global click handler
        e.stopPropagation();
    });

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== img) {
                removeImageMenu(menu);
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

/**
 * View image in large modal
 */
function viewImageLarge(imageSrc) {
    if (imageSrc.startsWith('data:image/')) {
        // Handle base64 data URLs by creating a blob
        const mimeType = imageSrc.split(';')[0].split(':')[1];
        const base64Data = imageSrc.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);

        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        // Open the blob URL in new tab
        window.open(blobUrl, '_blank');

        // Clean up the blob URL after a delay to let the new tab load
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 60000);
    } else {
        // For regular URLs, open directly
        window.open(imageSrc, '_blank');
    }
}

/**
 * Download image
 */
function downloadImage(imageSrc) {
    // Determine filename based on image source
    let filename = 'image.png'; // Default
    if (imageSrc.includes('data:image/')) {
        // For base64 images, try to determine the format
        const mimeType = imageSrc.split(';')[0].split(':')[1];
        if (mimeType === 'image/jpeg') filename = 'image.jpg';
        else if (mimeType === 'image/png') filename = 'image.png';
        else if (mimeType === 'image/gif') filename = 'image.gif';
        else if (mimeType === 'image/webp') filename = 'image.webp';
    } else {
        // For regular URLs, extract filename from URL
        try {
            const url = new URL(imageSrc);
            const pathname = url.pathname;
            filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'image.png';
        } catch (e) {
            filename = 'image.png';
        }
    }

    // Create download link
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Translate callout titles in HTML content
 * This function finds all callout elements and translates their titles to the current language
 */
function translateCalloutTitles() {
    try {
        const callouts = document.querySelectorAll('.callout');
        callouts.forEach(function (callout) {
            // Get callout type from class name
            let calloutType = null;
            const classList = callout.className.split(' ');
            for (let i = 0; i < classList.length; i++) {
                if (classList[i].startsWith('callout-')) {
                    calloutType = classList[i].replace('callout-', '');
                    break;
                }
            }

            if (!calloutType) return;

            // Find the title text element
            const titleTextElement = callout.querySelector('.callout-title-text');
            if (!titleTextElement) return;

            // Get current text
            const currentText = titleTextElement.textContent.trim();

            // List of possible English titles (in case the content is in English)
            const englishTitles = {
                'note': 'Note',
                'tip': 'Tip',
                'important': 'Important',
                'warning': 'Warning',
                'caution': 'Caution'
            };

            // Only translate if it's the default title (not a custom title)
            const expectedEnglishTitle = englishTitles[calloutType];
            if (expectedEnglishTitle && currentText === expectedEnglishTitle) {
                // Translate using the translation function
                const defaultTitle = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
                const translatedTitle = (window.t ? window.t('slash_menu.callout_' + calloutType, null, defaultTitle) : defaultTitle);
                titleTextElement.textContent = translatedTitle;
            }
        });
    } catch (e) {
        console.error('Error translating callout titles:', e);
    }
}

/**
 * Re-initialize note content after AJAX load
 */
function reinitializeNoteContent() {
    // Re-initialize any JavaScript components that might be in the loaded content

    // Re-initialize auto-save state for the current note
    if (typeof window.reinitializeAutoSaveState === 'function') {
        window.reinitializeAutoSaveState();
    }

    // Convert base64 images in HTML notes to attachments (migration)
    try {
        var noteEntries = document.querySelectorAll('.noteentry[data-note-type="note"], .noteentry:not([data-note-type])');
        noteEntries.forEach(function (entry) {
            if (typeof window.convertBase64ImagesToAttachments === 'function') {
                // Small delay to ensure DOM is stable
                setTimeout(function () {
                    window.convertBase64ImagesToAttachments(entry);
                }, 100);
            }
        });
    } catch (e) {
        // Silently continue if error
    }

    // Re-initialize search highlighting if in search mode.
    // Prefer the centralized helper which knows about notes/tags/folders.
    if (isSearchMode) {
        if (typeof applyHighlightsWithRetries === 'function') {
            try {
                setTimeout(function () {
                    try {
                        applyHighlightsWithRetries();
                        if (window.searchNavigation && window.searchNavigation.pendingAutoScroll && typeof scrollToFirstHighlight === 'function') {
                            scrollToFirstHighlight();
                        }
                    } catch (e) { }
                }, 60);
            } catch (e) { }
        } else if (typeof highlightSearchTerms === 'function') {
            setTimeout(function () {
                highlightSearchTerms();
                if (window.searchNavigation && window.searchNavigation.pendingAutoScroll && typeof scrollToFirstHighlight === 'function') {
                    scrollToFirstHighlight();
                }
            }, 100);
        }
    }

    // Re-initialize clickable tags
    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
        reinitializeClickableTagsAfterAjax();
    }

    // Process note references [[Note Title]] and track opened note
    if (typeof window.trackAndProcessNotes === 'function') {
        window.trackAndProcessNotes();
    }

    // Re-initialize image click handlers
    reinitializeImageClickHandlers();

    // Re-initialize note drag and drop events
    if (typeof setupNoteDragDropEvents === 'function') {
        setupNoteDragDropEvents();
    }

    // Re-initialize any other components that might be needed
    // (emoji picker, toolbar handlers, etc.)

    // Focus on the note content if it exists - DISABLED
    // const noteContent = document.querySelector('[contenteditable="true"]');
    // Only focus the note content when not in search mode; otherwise keep focus in the search input
    // if (noteContent && !isSearchMode) {
    //     setTimeout(() => {
    //         noteContent.focus();
    //     }, 100);
    // }

    // If the loaded note(s) include any tasklist entries, initialize them so the JSON content
    // is replaced with the interactive task list UI when notes are loaded via AJAX.
    try {
        const taskEntries = document.querySelectorAll('[data-note-type="tasklist"]');
        taskEntries.forEach(function (entry) {
            const idAttr = entry.id || '';
            if (!idAttr) return;
            const noteId = idAttr.replace('entry', '');
            if (typeof initializeTaskList === 'function') {
                // Call initializeTaskList after a short delay to ensure the DOM is stable
                setTimeout(function () {
                    try {
                        initializeTaskList(noteId, 'tasklist');
                    } catch (e) {
                        console.error('Error initializing tasklist for noteId', noteId, e);
                    }
                }, 50);
            }
        });
    } catch (e) {
        console.error('Error while initializing tasklist entries after AJAX load:', e);
    }

    // If the loaded note(s) include any markdown entries, initialize them so the markdown content
    // is replaced with the interactive markdown editor/preview UI when notes are loaded via AJAX.
    try {
        const markdownEntries = document.querySelectorAll('[data-note-type="markdown"]');
        markdownEntries.forEach(function (entry) {
            const idAttr = entry.id || '';
            if (!idAttr) return;
            const noteId = idAttr.replace('entry', '');
            if (typeof initializeMarkdownNote === 'function') {
                // Call initializeMarkdownNote after a short delay to ensure the DOM is stable
                setTimeout(function () {
                    try {
                        initializeMarkdownNote(noteId);
                    } catch (e) {
                        console.error('Error initializing markdown note for noteId', noteId, e);
                    }
                }, 50);
            }
        });
    } catch (e) {
        console.error('Error while initializing markdown entries after AJAX load:', e);
    }

    // Re-initialize toolbar functionality
    if (typeof initializeToolbarHandlers === 'function') {
        initializeToolbarHandlers();
    }

    // Re-initialize copy buttons for code blocks
    if (typeof window.reinitializeCodeCopyButtons === 'function') {
        window.reinitializeCodeCopyButtons();
    }

    // Convert bare <audio> elements to iframes for contenteditable compatibility
    if (typeof window.convertNoteAudioToIframes === 'function') {
        window.convertNoteAudioToIframes();
    }

    // Fix existing audio iframes to use audio_player.php
    if (typeof window.fixAudioIframes === 'function') {
        window.fixAudioIframes();
    }

    // Translate callout titles to the current language
    translateCalloutTitles();

    // Close all toggle blocks on page load (toggles should always start closed)
    try {
        const toggleBlocks = document.querySelectorAll('details.toggle-block');
        toggleBlocks.forEach(function (toggle) {
            toggle.removeAttribute('open');
        });
    } catch (e) {
        console.error('Error closing toggle blocks:', e);
    }

    // On mobile, ensure the right column is properly displayed only when a specific note is selected
    if (isMobileDevice()) {
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        const searchParam = urlParams.get('search');
        const tagsSearchParam = urlParams.get('tags_search');
        const unifiedSearchParam = urlParams.get('unified_search');
        const isInSearchMode = searchParam || tagsSearchParam || unifiedSearchParam;

        // If a specific note is selected, open the note pane on mobile.
        // Previously this avoided opening during search mode; that prevented selecting notes while searching.
        if (noteParam) {
            if (!document.body.classList.contains('note-open')) {
                document.body.classList.add('note-open');
            }
            // Ensure right column is visible
            const rightColumn = document.getElementById('right_col');
            if (rightColumn) {
                rightColumn.style.display = 'block';
            }
        } else {
            // If no specific note is selected, show the list
            if (document.body.classList.contains('note-open')) {
                document.body.classList.remove('note-open');
            }
            const leftColumn = document.getElementById('left_col');
            if (leftColumn) {
                leftColumn.style.display = 'block';
            }
        }
    }

    // Force interface refresh to sync with loaded content - but don't trigger auto-save
    // since content was just loaded from server and is already saved

    // Mark that note loading is complete
    window.isLoadingNote = false;
}

/**
 * Delete an image (works for both Excalidraw and regular images)
 */
function deleteImage(img) {
    if (!img) return;

    // Show confirmation modal
    if (typeof window.modalAlert !== 'undefined' && typeof window.modalAlert.confirm === 'function') {
        window.modalAlert.confirm(
            (window.t ? window.t('editor.images.delete_confirm.message', {}, 'Are you sure you want to delete this image? This action cannot be undone.') : 'Are you sure you want to delete this image? This action cannot be undone.'),
            (window.t ? window.t('editor.images.delete_confirm.title', {}, 'Delete Image') : 'Delete Image')
        ).then(function (confirmed) {
            if (confirmed) {
                performImageDeletion(img);
            }
        });
    } else {
        // Fallback to native confirm if modal not available
        if (confirm(window.t ? window.t('editor.images.delete_confirm.message', {}, 'Are you sure you want to delete this image? This action cannot be undone.') : 'Are you sure you want to delete this image? This action cannot be undone.')) {
            performImageDeletion(img);
        }
    }
}

/**
 * Perform the actual image deletion
 */
function performImageDeletion(img) {
    if (!img) return;

    try {
        // Mark image as manually deleted to avoid double deletion from observer
        img._manuallyDeleted = true;

        // Try to find attachment ID from src to delete it from server
        const src = img.getAttribute('src');
        if (src) {
            // Match /api/v1/notes/{id}/attachments/{attachmentId}
            const attachmentMatch = src.match(/\/api\/v1\/notes\/(\d+)\/attachments\/([a-fA-F0-9_-]+)/);
            if (attachmentMatch) {
                const noteId = attachmentMatch[1];
                const attachmentId = attachmentMatch[2];

                // Only delete if the image belongs to the note it's being deleted from
                const noteEntry = img.closest('.noteentry');
                const noteIdMatch = noteEntry?.id.match(/entry(\d+)/);
                const activeNoteId = noteIdMatch ? noteIdMatch[1] : null;

                if (activeNoteId && noteId === activeNoteId) {
                    // Call API if possible
                    if (typeof window.deleteAttachment === 'function') {
                        // Temporarily set currentNoteIdForAttachments if needed
                        const oldNoteId = window.currentNoteIdForAttachments;
                        window.currentNoteIdForAttachments = noteId;
                        window.deleteAttachment(attachmentId);
                        window.currentNoteIdForAttachments = oldNoteId;
                    } else {
                        // Direct fetch as fallback
                        const formData = new FormData();
                        formData.append('action', 'delete');
                        formData.append('note_id', noteId);
                        formData.append('attachment_id', attachmentId);
                        if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
                            formData.append('workspace', window.selectedWorkspace);
                        }
                        fetch('/api/v1/notes/' + noteId + '/attachments', { method: 'POST', body: formData });
                    }
                }
            }
        }

        // Find the container (could be excalidraw-container or just the img itself)
        const container = img.closest('.excalidraw-container');
        const elementToRemove = container || img;

        // Remove the element from DOM
        elementToRemove.remove();

        // Clean up any following empty elements or line breaks
        const nextElement = elementToRemove.nextElementSibling;
        if (nextElement && (nextElement.tagName === 'BR' ||
            (nextElement.tagName === 'DIV' && nextElement.innerHTML.trim() === '') ||
            nextElement.innerHTML === '&nbsp;')) {
            nextElement.remove();
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        // Trigger automatic save after a short delay
        setTimeout(function () {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Save to server
            }
        }, 100);

    } catch (error) {
        console.warn('Error deleting image:', error);
    }
}

/**
 * Toggle a 1px gray border around an image
 */
function toggleImageBorder(img) {
    if (!img) return;

    try {
        // Check if image currently has the border class
        const hasBorderClass = img.classList.contains('img-with-border');

        if (hasBorderClass) {
            // Remove border class
            img.classList.remove('img-with-border');
        } else {
            // Remove the no-padding border class if present
            img.classList.remove('img-with-border-no-padding');
            // Add border class (with padding, rounded corners, and #ddd border)
            img.classList.add('img-with-border');
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        // Trigger automatic save after a short delay
        setTimeout(function () {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Save to server
            }
        }, 100);

    } catch (error) {
        console.warn('Error toggling image border:', error);
    }
}

/**
 * Toggle a 1px gray border around an image without padding
 */
function toggleImageBorderNoPadding(img) {
    if (!img) return;

    try {
        // Check if image currently has the no-padding border class
        const hasBorderClass = img.classList.contains('img-with-border-no-padding');

        if (hasBorderClass) {
            // Remove border class
            img.classList.remove('img-with-border-no-padding');
        } else {
            // Remove the padded border class if present
            img.classList.remove('img-with-border');
            // Add border class without padding
            img.classList.add('img-with-border-no-padding');
        }

        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }

        // Trigger automatic save after a short delay
        setTimeout(function () {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Save to server
            }
        }, 100);

    } catch (error) {
        console.warn('Error toggling image border without padding:', error);
    }
}

/**
 * Add or edit a link on an image
 */
function addOrEditImageLink(img) {
    if (!img) return;

    try {
        // Check if the image is already wrapped in a link
        const existingLink = img.closest('a');
        const currentUrl = existingLink ? existingLink.href : '';

        // Show modal instead of prompt
        showImageLinkModal(currentUrl, function (url) {
            // If user cancelled or provided empty string
            if (url === null || url === undefined) return;

            // If empty string, remove link if it exists
            if (url.trim() === '') {
                if (existingLink) {
                    removeImageLink(img);
                }
                return;
            }

            // Validate and sanitize URL
            let finalUrl = url.trim();
            if (!finalUrl.match(/^https?:\/\//i)) {
                // Add https:// if no protocol specified
                finalUrl = 'https://' + finalUrl;
            }

            if (existingLink) {
                // Update existing link
                existingLink.href = finalUrl;
                existingLink.setAttribute('target', '_blank');
                existingLink.setAttribute('rel', 'noopener noreferrer');
            } else {
                // Create new link wrapper
                const link = document.createElement('a');
                link.href = finalUrl;
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                link.setAttribute('data-image-link', 'true'); // Mark this as an image link

                // Wrap the image in the link
                img.parentNode.insertBefore(link, img);
                link.appendChild(img);
            }

            // Mark note as modified and save
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }

            setTimeout(function () {
                if (typeof window.saveNoteImmediately === 'function') {
                    window.saveNoteImmediately();
                }
            }, 100);
        }, existingLink ? 'edit' : 'add');

    } catch (error) {
        console.warn('Error adding/editing image link:', error);
    }
}

/**
 * Show modal for adding/editing image link
 */
function showImageLinkModal(defaultUrl, callback, mode) {
    const t = window.t || ((key, params, fallback) => fallback);
    const isEdit = mode === 'edit';

    // Create modal if it doesn't exist
    let modal = document.getElementById('imageLinkModal');
    if (!modal) {
        const modalHtml = `
            <div id="imageLinkModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="imageLinkModalTitle">${t('image_menu.link_modal.title_add', null, 'Add Link to Image')}</h3>
                    </div>
                    <div class="modal-body">
                        <p style="margin: 0 0 12px 0; color: #666; font-size: 13px; line-height: 1.5;">
                            ${t('image_menu.link_modal.description', null, 'Ce lien rendra l\'image clickable lorsque la note sera définie comme publique.')}
                        </p>
                        <input type="text" id="imageLinkModalInput" placeholder="${t('image_menu.link_modal.url_placeholder', null, 'https://www.example.com')}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                    </div>
                    <div class="modal-buttons">
                        <button type="button" class="btn-cancel" onclick="closeImageLinkModal()">${t('image_menu.link_modal.cancel', null, 'Cancel')}</button>
                        <button type="button" id="imageLinkModalConfirmBtn" class="btn-primary">${t('image_menu.link_modal.ok', null, 'OK')}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('imageLinkModal');

        // Add event listeners
        const input = document.getElementById('imageLinkModalInput');
        const confirmBtn = document.getElementById('imageLinkModalConfirmBtn');

        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                confirmImageLinkModal();
            }
        });

        confirmBtn.addEventListener('click', confirmImageLinkModal);
    }

    // Update modal content
    const titleEl = document.getElementById('imageLinkModalTitle');
    const inputEl = document.getElementById('imageLinkModalInput');

    titleEl.textContent = isEdit
        ? t('image_menu.link_modal.title_edit', null, 'Edit Image Link')
        : t('image_menu.link_modal.title_add', null, 'Add Link to Image');

    inputEl.value = defaultUrl || '';

    // Store callback
    window.imageLinkModalCallback = callback;

    // Show modal
    modal.style.display = 'flex';

    // Focus input
    setTimeout(() => inputEl.focus(), 100);
}

/**
 * Close image link modal
 */
function closeImageLinkModal() {
    const modal = document.getElementById('imageLinkModal');
    if (modal) {
        modal.style.display = 'none';
    }
    window.imageLinkModalCallback = null;
}

/**
 * Confirm image link modal
 */
function confirmImageLinkModal() {
    const inputValue = document.getElementById('imageLinkModalInput').value;
    const callback = window.imageLinkModalCallback;

    closeImageLinkModal();

    if (callback) {
        callback(inputValue);
    }
}

/**
 * Remove link from an image
 */
function removeImageLink(img) {
    if (!img) return;

    try {
        const link = img.closest('a');
        if (link) {
            // Replace the link with just the image
            link.parentNode.insertBefore(img, link);
            link.remove();

            // Mark note as modified and save
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }

            setTimeout(function () {
                if (typeof window.saveNoteImmediately === 'function') {
                    window.saveNoteImmediately();
                }
            }, 100);

            // Reinitialize image click handlers to remove old event listeners
            setTimeout(function () {
                reinitializeImageClickHandlers();
            }, 150);
        }
    } catch (error) {
        console.warn('Error removing image link:', error);
    }
}

/**
 * Enable resize mode for an image with a handle in the bottom-right corner
 */
function enableImageResize(img) {
    if (!img) return;

    // Remove any existing resize handles first
    const existingHandles = document.querySelectorAll('.image-resize-handle');
    existingHandles.forEach(handle => handle.remove());

    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'image-resize-handle';
    resizeHandle.innerHTML = '⤡';

    // Position the image as relative so the handle can be positioned absolutely
    const originalPosition = img.style.position;
    img.style.position = 'relative';
    img.style.display = 'inline-block';

    // Set a flag to prevent the MutationObserver in main.js from thinking this is a deletion
    // during the wrapping process (which involves moving the image in the DOM)
    img._isResizing = true;

    // Create a wrapper if the image doesn't have one OR if parent doesn't have the resize wrapper class
    let wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('image-resize-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'image-resize-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.maxWidth = '100%';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
    } else {
        // Ensure wrapper has proper positioning even if it already exists
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
    }

    // Reset the flag after a short delay to ensure the MutationObserver has processed the move
    setTimeout(function () {
        delete img._isResizing;
    }, 100);

    // Add the handle to the wrapper
    wrapper.appendChild(resizeHandle);

    // Trigger modification indicator immediately
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }

    // Store original dimensions
    const originalWidth = img.width || img.naturalWidth;
    const aspectRatio = img.naturalHeight / img.naturalWidth;

    let isResizing = false;
    let startX, startWidth;

    // Mouse down on handle
    resizeHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startWidth = img.offsetWidth;

        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';

        // Mark as modified on actual resize start too
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    });

    // Mouse move
    document.addEventListener('mousemove', function handleMouseMove(e) {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + deltaX); // Minimum 50px

        img.style.width = newWidth + 'px';
        img.style.height = 'auto';
        img.setAttribute('width', Math.round(newWidth));

        // Update wrapper size
        wrapper.style.width = newWidth + 'px';
    });

    // Mouse up
    document.addEventListener('mouseup', function handleMouseUp(e) {
        if (!isResizing) return;

        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Save the final width
        const finalWidth = Math.round(img.offsetWidth);
        img.setAttribute('width', finalWidth);
        img.style.width = finalWidth + 'px';
        img.removeAttribute('height'); // Let browser calculate height from aspect ratio

        // Clean up: remove the handle
        if (resizeHandle && resizeHandle.parentNode) {
            resizeHandle.remove();
        }

        // Clean up: remove the wrapper but preserve the image with its new size
        const currentWrapper = img.parentElement;
        if (currentWrapper && currentWrapper.classList.contains('image-resize-wrapper')) {
            const parent = currentWrapper.parentNode;
            if (parent) {
                parent.insertBefore(img, currentWrapper);
                parent.removeChild(currentWrapper);
            }
        }

        // Revert style changes made ONLY for positioning the handle
        img.style.position = (originalPosition === 'static' ? '' : originalPosition);
        if (img.style.display === 'inline-block' && !img.getAttribute('style').includes('display: inline-block')) {
            // Only revert display if we added it and it's not in the inline style attribute already
            // Actually, keeping inline-block is usually safer for resized images.
        }

        // Trigger note save and modification indicator
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }

        setTimeout(function () {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately();
            }
        }, 100);
    });

    // Click outside to remove handle
    setTimeout(() => {
        document.addEventListener('click', function closeResize(e) {
            if (!wrapper.contains(e.target) && e.target !== resizeHandle) {
                resizeHandle.remove();
                document.removeEventListener('click', closeResize);
            }
        });
    }, 10);
}

/**
 * Show toast with image link URL
 */
function showImageLinkToast(url, mouseX, mouseY) {
    // Remove any existing toast first to avoid duplication
    const existingToast = document.querySelector('.image-link-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'image-link-toast';
    toast.style.position = 'fixed';
    toast.style.background = '#2d3748';
    toast.style.color = '#e2e8f0';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.fontSize = '12px';
    toast.style.maxWidth = '400px';
    toast.style.wordBreak = 'break-all';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.style.zIndex = '10000';
    toast.style.pointerEvents = 'none';
    toast.style.whiteSpace = 'nowrap';
    toast.style.overflow = 'hidden';
    toast.style.textOverflow = 'ellipsis';

    // Position near mouse cursor (offset slightly to not block the image)
    toast.style.left = (mouseX + 15) + 'px';
    toast.style.top = (mouseY + 15) + 'px';

    // Add URL (no icon)
    toast.innerHTML = `<span>${url}</span>`;

    document.body.appendChild(toast);

    return toast;
}

/**
 * Update toast position
 */
function updateImageLinkToastPosition(toast, mouseX, mouseY) {
    if (!toast) return;
    toast.style.left = (mouseX + 15) + 'px';
    toast.style.top = (mouseY + 15) + 'px';
}

/**
 * Hide image link toast
 */
function hideImageLinkToast(toast) {
    if (!toast) return;

    if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
    }
}

// Initialize image click handlers when this script loads
(function initImageHandlers() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reinitializeImageClickHandlers);
    } else {
        reinitializeImageClickHandlers();
    }
})();
