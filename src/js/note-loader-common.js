/**
 * Note Loader Common - Shared functionality for note loading system
 * Contains common functions used by both desktop and mobile versions
 */

// Global variables for note loading
var currentLoadingNoteId = null;
var isNoteLoading = false;

/**
 * Reapply search highlights with a couple of delayed retries to handle layout timing.
 * Centralized helper to avoid duplicated code blocks across loaders.
 */
function applyHighlightsWithRetries() {
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
        // Clear any note content highlights so tags are the only visible highlights
        if (typeof clearSearchHighlights === 'function') {
            try { clearSearchHighlights(); } catch (e) { /* ignore */ }
        }
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
    setTimeout(function() {
        if (activeType === 'notes') {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) {}
            }
        } else if (activeType === 'tags') {
            // Clear any note highlights before highlighting tags
            if (typeof clearSearchHighlights === 'function') {
                try { clearSearchHighlights(); } catch (e) {}
            }
            if (typeof window.highlightMatchingTags === 'function') {
                try {
                    var term2 = (document.getElementById('search-tags-hidden') && document.getElementById('search-tags-hidden').value) || (document.getElementById('unified-search') && document.getElementById('unified-search').value) || '';
                    window.highlightMatchingTags(term2);
                } catch (e) { /* ignore */ }
            }
        }
        if (typeof updateAllOverlayPositions === 'function') {
            try { updateAllOverlayPositions(); } catch (e) {}
        }
    }, 100);
    setTimeout(function() {
        if (activeType === 'notes') {
            if (typeof highlightSearchTerms === 'function') {
                try { highlightSearchTerms(); } catch (e) {}
            }
        } else if (activeType === 'tags') {
            // Clear any note highlights before highlighting tags
            if (typeof clearSearchHighlights === 'function') {
                try { clearSearchHighlights(); } catch (e) {}
            }
            if (typeof window.highlightMatchingTags === 'function') {
                try {
                    var term3 = (document.getElementById('search-tags-hidden') && document.getElementById('search-tags-hidden').value) || (document.getElementById('unified-search') && document.getElementById('unified-search').value) || '';
                    window.highlightMatchingTags(term3);
                } catch (e) { /* ignore */ }
            }
        }
        if (typeof updateAllOverlayPositions === 'function') {
            try { updateAllOverlayPositions(); } catch (e) {}
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
 * Direct note loading function called from onclick
 */
window.loadNoteDirectly = function(url, noteId, event) {
    try {
        
        // Check for unsaved changes in current note before proceeding
        var currentNoteId = window.noteid;
        if (currentNoteId && currentNoteId !== noteId && typeof window.hasUnsavedChanges === 'function') {
            if (window.hasUnsavedChanges(currentNoteId)) {
                
                // Show save in progress notification
                if (typeof window.showSaveInProgressNotification === 'function') {
                    window.showSaveInProgressNotification(function() {
                        window.loadNoteDirectly(url, noteId, null);
                    });
                    return false;
                }
            }
        }
        
        
        // loadNoteDirectly start
        // Prevent default link behavior
        if (event) {
            event.preventDefault();
            event.stopPropagation();
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
                notesNeedingRefresh.delete(String(noteId)); // Remove from list
            }
        }
        
        // Auto-save ensures no changes are lost during navigation
        
        // Prevent multiple simultaneous loads
        if (window.isLoadingNote) {
            return false;
        }
        window.isLoadingNote = true;

        // Find the clicked link to update selection using robust method
        const clickedLink = findNoteLinkById(noteId);
        
        // Show loading state immediately
        showNoteLoadingState();
        
        // If note needs refresh, add cache-busting parameter
        var finalUrl = url;
        if (needsRefresh) {
            var separator = url.includes('?') ? '&' : '?';
            finalUrl = url + separator + '_refresh=' + Date.now();
        }
        
        // On mobile, add note-open class
        if (isMobileDevice()) {
            document.body.classList.add('note-open');
        }

        // Create XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('GET', finalUrl, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onreadystatechange = function() {
            try {
                if (xhr.readyState === 4) {
                    window.isLoadingNote = false;

                    if (xhr.status === 200) {
                        // xhr 200 received, processing response
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(xhr.responseText, 'text/html');
                            const rightColumn = doc.getElementById('right_col');

                            if (rightColumn) {
                                // right_col found in response
                                const currentRightColumn = document.getElementById('right_col');
                                    if (currentRightColumn) {
                                    // Clear existing highlights first to avoid overlays being left over
                                    if (typeof clearSearchHighlights === 'function') {
                                        try { clearSearchHighlights(); } catch (e) { /* ignore */ }
                                    }

                                    currentRightColumn.innerHTML = rightColumn.innerHTML;
                                    
                                    // Auto-save handles all state management automatically
                                    
                                    // Update URL before reinitializing so reinitializeNoteContent
                                    // can detect the 'note' param and keep the right column visible
                                    updateBrowserUrl(url, noteId);
                                    reinitializeNoteContent();

                                    // If this was a forced refresh, skip auto-draft restore
                                    if (needsRefresh && typeof checkForUnsavedDraft === 'function') {
                                        setTimeout(() => {
                                            checkForUnsavedDraft(noteId, true); // true = skip auto restore
                                        }, 100);
                                        
                                        // Clean up the URL by removing the _refresh parameter
                                        if (window.history && window.history.replaceState) {
                                            var cleanUrl = url.replace(/[?&]_refresh=\d+/, '');
                                            // Remove trailing ? or & if they exist
                                            cleanUrl = cleanUrl.replace(/[?&]$/, '');
                                            window.history.replaceState(null, '', cleanUrl);
                                        }
                                    }

                                    // Auto-scroll to right column on mobile after note is loaded
                                    // Only if the user clicked on a note (sessionStorage flag)
                                    if (isMobileDevice() && noteId && typeof scrollToRightColumn === 'function') {
                                        const shouldScroll = sessionStorage.getItem('shouldScrollToNote');
                                        if (shouldScroll === 'true') {
                                            setTimeout(() => {
                                                scrollToRightColumn();
                                                sessionStorage.removeItem('shouldScrollToNote');
                                            }, 100);
                                        }
                                    }

                                    // Reapply highlights after content has been reinitialized.
                                    // Use delayed calls to ensure layout has stabilized when switching notes.
                                    if (typeof applyHighlightsWithRetries === 'function') {
                                        try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                                    }

                                    hideNoteLoadingState();

                                    // Apply selection after content is loaded and initialized
                                    updateSelectedNote(clickedLink);
                                    
                                    // Reinitialize note click handlers for mobile navigation after loading individual note
                                    if (typeof window.initializeNoteClickHandlers === 'function') {
                                        window.initializeNoteClickHandlers();
                                    }
                                } else {
                                    throw new Error('Could not find current right column');
                                }
                            } else {
                                // right_col NOT found in server response
                                throw new Error('Could not find note content in response');
                            }
                        } catch (error) {
                            console.error('Error parsing note content:', error);
                            showNotificationPopup('Error loading note: ' + error.message);
                            hideNoteLoadingState();
                            if (isMobileDevice()) {
                                document.body.classList.remove('note-open');
                            }
                        }
                    } else {
                        console.error('Failed to load note, status:', xhr.status, 'response:', xhr.responseText);
                        showNotificationPopup('Failed to load note (status: ' + xhr.status + ')');
                        hideNoteLoadingState();
                        if (isMobileDevice()) {
                            document.body.classList.remove('note-open');
                        }
                    }
                }
            } catch (error) {
                console.error('Error in xhr onreadystatechange:', error);
                window.isLoadingNote = false;
                hideNoteLoadingState();
                if (isMobileDevice()) {
                    document.body.classList.remove('note-open');
                }
            }
        };

        xhr.onerror = function() {
            window.isLoadingNote = false;
            console.error('Network error during note loading');
            showNotificationPopup('Network error - please check your connection');
            hideNoteLoadingState();
            if (isMobileDevice()) {
                document.body.classList.remove('note-open');
                // Re-initialize search highlighting if in search mode
                if (typeof applyHighlightsWithRetries === 'function' && isSearchMode) {
                    try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                }
            }
        };

        xhr.ontimeout = function() {
            window.isLoadingNote = false;
            console.error('Request timeout during note loading');
            showNotificationPopup('Request timeout - please try again');
            hideNoteLoadingState();
            if (isMobileDevice()) {
                document.body.classList.remove('note-open');
            }
        };

        // Set timeout
        xhr.timeout = 10000; // 10 seconds

        xhr.send();
        // xhr sent
        return false;
    } catch (error) {
        console.error('Error in loadNoteDirectly:', error);
        window.isLoadingNote = false;
        if (isMobileDevice()) {
            document.body.classList.remove('note-open');
        }
        showNotificationPopup('Error initializing note load: ' + error.message);
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

    // Update UI to show loading state
    showNoteLoadingState();
    updateSelectedNote(clickedLink);
    
    // On mobile, add the note-open class to show the loading state
    if (isMobileDevice()) {
        document.body.classList.add('note-open');
    }

    // Create XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            isNoteLoading = false;

            if (xhr.status === 200) {
                try {
                    // Parse the response to extract the right column content
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xhr.responseText, 'text/html');
                    const rightColumn = doc.getElementById('right_col');

                    if (rightColumn) {
                        // Update the right column content
                        const currentRightColumn = document.getElementById('right_col');
                            if (currentRightColumn) {
                            // Clear existing highlights first to avoid overlays being left over
                            if (typeof clearSearchHighlights === 'function') {
                                try { clearSearchHighlights(); } catch (e) { /* ignore */ }
                            }

                            currentRightColumn.innerHTML = rightColumn.innerHTML;

                            // Auto-save handles all state management automatically

                            // Update URL before reinitializing so reinitializeNoteContent
                            // can detect the 'note' param and keep the right column visible
                            // Don't push to history if we're coming from popstate event
                            if (!fromHistory) {
                                updateBrowserUrl(url, noteId);
                            }

                            // Re-initialize any JavaScript that might be needed
                            reinitializeNoteContent();

                            // Reapply highlights after content initialization using centralized helper
                            if (typeof applyHighlightsWithRetries === 'function') {
                                try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                            }

                            // Hide loading state
                            hideNoteLoadingState();
                        }
                    } else {
                        throw new Error('Could not find note content in response');
                    }
                } catch (error) {
                    console.error('Error loading note:', error);
                    showNotificationPopup('Error loading note: ' + error.message);
                    hideNoteLoadingState();
                    
                    // On error, remove note-open class to go back to note list
                    if (isMobileDevice()) {
                        document.body.classList.remove('note-open');
                    }
                }
            } else {
                console.error('Failed to load note:', xhr.status, xhr.statusText);
                showNotificationPopup('Failed to load note. Please try again.');
                hideNoteLoadingState();
                
                // On error, remove note-open class to go back to note list
                if (isMobileDevice()) {
                    document.body.classList.remove('note-open');
                }
            }
        }
    };

    xhr.onerror = function() {
        isNoteLoading = false;
        console.error('Network error while loading note');
        showNotificationPopup('Network error. Please check your connection.');
        hideNoteLoadingState();
        
        // On error, remove note-open class to go back to note list
        if (isMobileDevice()) {
            document.body.classList.remove('note-open');
        }
    };

    xhr.ontimeout = function() {
        isNoteLoading = false;
        console.error('Request timeout during note loading');
        showNotificationPopup('Request timeout - please try again');
        hideNoteLoadingState();
        
        // On error, remove note-open class to go back to note list
        if (isMobileDevice()) {
            document.body.classList.remove('note-open');
        }
    };

    xhr.send();
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
 * Show loading state in the right column
 */
function showNoteLoadingState() {
    const rightColumn = document.getElementById('right_col');
    if (rightColumn) {
        const loadingHtml = `
            <div class="note-loading-state">
                <div class="loading-spinner">
                    <i class="fa-spinner fa-spin"></i>
                    <p>Loading note...</p>
                </div>
            </div>
        `;
        rightColumn.innerHTML = loadingHtml;
    }
}

/**
 * Hide loading state
 */
function hideNoteLoadingState() {
    // Loading state is automatically hidden when new content is loaded
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
        if (noteId) {
            // Find all links with the same note ID (including in favorites)
            document.querySelectorAll('.links_arbo_left').forEach(link => {
                if (link.getAttribute('data-note-id') === noteId) {
                    link.classList.add('selected-note');
                }
            });
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
        // Merge existing search params (search, tags_search, workspace) into the target URL
        const currentParams = new URLSearchParams(window.location.search || '');
    const preserveKeys = ['search', 'tags_search', 'workspace'];

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

// Global flag to track if document-level handler is set
var imageClickHandlerInitialized = false;

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
        document.addEventListener('click', function(event) {
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
    });
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

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const src = img.src;

    // Remove any existing image menu
    const existingMenu = document.querySelector('.image-menu');
    if (existingMenu) {
        document.body.removeChild(existingMenu);
    }

    // Create simple dropdown menu
    const menu = document.createElement('div');
    menu.className = 'image-menu';
    
    // Check if this is an Excalidraw image
    const isExcalidraw = img.getAttribute('data-is-excalidraw') === 'true';
    const excalidrawNoteId = img.getAttribute('data-excalidraw-note-id');
    
    // Also check if this image is inside an Excalidraw container
    const excalidrawContainer = img.closest('.excalidraw-container');
    const isEmbeddedExcalidraw = excalidrawContainer !== null;
    const diagramId = excalidrawContainer ? excalidrawContainer.id : null;
    
    // Check if we're on mobile (width < 800px)
    const isMobile = window.innerWidth < 800;
    
    let menuHTML = `
        <div class="image-menu-item" data-action="view-large">
            <i class="fa-expand"></i>
            View Large
        </div>
        <div class="image-menu-item" data-action="download">
            <i class="fa-download"></i>
            Download
        </div>
    `;
    
    // Add Resize option only on desktop (not on mobile)
    if (!isMobile) {
        menuHTML += `
        <div class="image-menu-item" data-action="resize">
            <i class="fa-maximize"></i>
            Resize
        </div>
    `;
    }
    
    // Add Edit option for Excalidraw images (standalone notes) - hide on mobile
    if (isExcalidraw && excalidrawNoteId && !isMobile) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-excalidraw" data-note-id="${excalidrawNoteId}">
                <i class="fa-edit"></i>
                Edit
            </div>
        ` + menuHTML;
    }
    
    // Add Edit option for embedded Excalidraw diagrams - hide on mobile
    if (isEmbeddedExcalidraw && diagramId && !isMobile) {
        menuHTML = `
            <div class="image-menu-item" data-action="edit-embedded-excalidraw" data-diagram-id="${diagramId}">
                <i class="fa-edit"></i>
                Edit
            </div>
        ` + menuHTML;
    }
    
    // Add border toggle option
    const hasBorder = img.classList.contains('img-with-border');
    menuHTML += `
        <div class="image-menu-item" data-action="toggle-border">
            <i class="fal fa-square"></i>
            ${hasBorder ? 'Remove' : 'Add'} Border
        </div>
    `;
    
    // Add Delete option at the end
    menuHTML += `
        <div class="image-menu-item" data-action="delete-image" style="color: #dc3545;">
            <i class="fas fa-trash"></i>
            Delete Image
        </div>
    `;
    
    menu.innerHTML = menuHTML;

    // Position the menu at click coordinates
    const clickX = event.clientX;
    const clickY = event.clientY;

    menu.style.position = 'fixed';
    menu.style.left = clickX + 'px';
    menu.style.top = clickY + 'px';
    menu.style.transform = 'translate(-50%, -120%)'; // Center horizontally, position above cursor with more space
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // Adjust position if menu goes off-screen
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // If menu goes off the right edge, move it left
    if (menuRect.right > viewportWidth) {
        menu.style.left = (clickX - (menuRect.width / 2)) + 'px';
        menu.style.transform = 'translate(0, -120%)';
    }

    // If menu goes off the left edge, move it right
    if (menuRect.left < 0) {
        menu.style.left = clickX + 'px';
        menu.style.transform = 'translate(-50%, -120%)';
    }

    // If menu goes off the top edge, move it below the cursor
    if (menuRect.top < 0) {
        menu.style.top = clickY + 'px';
        menu.style.transform = 'translate(-50%, 20%)';
    }

    // Handle menu item clicks
    menu.addEventListener('click', function(e) {
        const action = e.target.closest('.image-menu-item')?.getAttribute('data-action');

        if (action === 'view-large') {
            viewImageLarge(src);
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'download') {
            downloadImage(src);
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'edit-excalidraw') {
            const noteId = e.target.closest('.image-menu-item')?.getAttribute('data-note-id');
            if (noteId) {
                openExcalidrawNote(noteId);
            }
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'edit-embedded-excalidraw') {
            const diagramId = e.target.closest('.image-menu-item')?.getAttribute('data-diagram-id');
            if (diagramId && window.openExcalidrawEditor) {
                openExcalidrawEditor(diagramId);
            }
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'resize') {
            enableImageResize(img);
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'toggle-border') {
            toggleImageBorder(img);
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        } else if (action === 'delete-image') {
            deleteImage(img);
            // Remove menu safely
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
        }

        // Prevent event bubbling to avoid triggering the global click handler
        e.stopPropagation();
    });

    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== img) {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
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

        // Clean up the blob URL after a short delay
        setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
        }, 1000);
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
 * Re-initialize note content after AJAX load
 */
function reinitializeNoteContent() {
    // Re-initialize any JavaScript components that might be in the loaded content

    // Re-initialize auto-save state for the current note
    if (typeof window.reinitializeAutoSaveState === 'function') {
        window.reinitializeAutoSaveState();
    }

    // Re-initialize search highlighting if in search mode.
    // Prefer the centralized helper which knows about notes/tags/folders.
    if (isSearchMode) {
        if (typeof applyHighlightsWithRetries === 'function') {
            try { setTimeout(function() { try { applyHighlightsWithRetries(); } catch(e){} }, 60); } catch (e) {}
        } else if (typeof highlightSearchTerms === 'function') {
            setTimeout(highlightSearchTerms, 100);
        }
    }

    // Re-initialize clickable tags
    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
        reinitializeClickableTagsAfterAjax();
    }

    // Re-initialize image click handlers
    reinitializeImageClickHandlers();

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
        taskEntries.forEach(function(entry) {
            const idAttr = entry.id || '';
            if (!idAttr) return;
            const noteId = idAttr.replace('entry', '');
            if (typeof initializeTaskList === 'function') {
                // Call initializeTaskList after a short delay to ensure the DOM is stable
                setTimeout(function() {
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
        markdownEntries.forEach(function(entry) {
            const idAttr = entry.id || '';
            if (!idAttr) return;
            const noteId = idAttr.replace('entry', '');
            if (typeof initializeMarkdownNote === 'function') {
                // Call initializeMarkdownNote after a short delay to ensure the DOM is stable
                setTimeout(function() {
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
 * Check if a URL is for note loading
 */
function isNoteUrl(url) {
    return url.includes('note=') && url.includes('index.php');
}

/**
 * Delete an image (works for both Excalidraw and regular images)
 */
function deleteImage(img) {
    if (!img) return;
    
    // Show confirmation modal
    if (typeof window.modalAlert !== 'undefined' && typeof window.modalAlert.confirm === 'function') {
        window.modalAlert.confirm(
            'Are you sure you want to delete this image? This action cannot be undone.',
            'Delete Image'
        ).then(function(confirmed) {
            if (confirmed) {
                performImageDeletion(img);
            }
        });
    } else {
        // Fallback to native confirm if modal not available
        if (confirm('Are you sure you want to delete this image? This action cannot be undone.')) {
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
        setTimeout(function() {
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
            // Add border class (with 8px padding, rounded corners, and #ddd border)
            img.classList.add('img-with-border');
        }
        
        // Trigger note update to save changes
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified(); // Mark note as edited
        }
        
        // Trigger automatic save after a short delay
        setTimeout(function() {
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately(); // Save to server
            }
        }, 100);
        
    } catch (error) {
        console.warn('Error toggling image border:', error);
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
    resizeHandle.innerHTML = '<i class="fas fa-grip-lines-vertical"></i>';
    
    // Position the image as relative so the handle can be positioned absolutely
    const originalPosition = img.style.position;
    img.style.position = 'relative';
    img.style.display = 'inline-block';
    
    // Create a wrapper if the image doesn't have one
    let wrapper = img.parentElement;
    if (!wrapper || wrapper.tagName === 'DIV' && !wrapper.classList.contains('image-resize-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'image-resize-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.maxWidth = '100%';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
    }
    
    // Add the handle to the wrapper
    wrapper.appendChild(resizeHandle);
    
    // Store original dimensions
    const originalWidth = img.width || img.naturalWidth;
    const aspectRatio = img.naturalHeight / img.naturalWidth;
    
    let isResizing = false;
    let startX, startWidth;
    
    // Mouse down on handle
    resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startWidth = img.offsetWidth;
        
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';
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
        img.removeAttribute('height'); // Let browser calculate height from aspect ratio
        
        // Remove the handle immediately to prevent it from being saved
        resizeHandle.remove();
        
        // Trigger note save
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
        
        setTimeout(function() {
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

// Initialize image click handlers when this script loads
(function initImageHandlers() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reinitializeImageClickHandlers);
    } else {
        reinitializeImageClickHandlers();
    }
})();
