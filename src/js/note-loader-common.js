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
    if (typeof highlightSearchTerms === 'function') {
        try { highlightSearchTerms(); } catch (e) { /* ignore */ }
        setTimeout(function() {
            try { highlightSearchTerms(); } catch (e) {}
            if (typeof updateAllOverlayPositions === 'function') {
                try { updateAllOverlayPositions(); } catch (e) {}
            }
        }, 100);
        setTimeout(function() {
            try { highlightSearchTerms(); } catch (e) {}
            if (typeof updateAllOverlayPositions === 'function') {
                try { updateAllOverlayPositions(); } catch (e) {}
            }
        }, 300);
    }
}

/**
 * Check if we're on mobile
 */
function isMobileDevice() {
    // Check both window width and user agent for better mobile detection
    const isMobileWidth = window.innerWidth <= 800;
    const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

    return isMobileWidth || isMobileUserAgent;
}

/**
 * Find note link by title (robust method that handles quotes and special characters)
 */
function findNoteLinkByTitle(noteTitle) {
    const noteLinks = document.querySelectorAll('a.links_arbo_left[data-note-id]');
    for (let link of noteLinks) {
        if (link.getAttribute('data-note-id') === noteTitle) {
            return link;
        }
    }
    return null;
}

/**
 * Direct note loading function called from onclick
 */
window.loadNoteDirectly = function(url, noteTitle, event) {
    try {
    // loadNoteDirectly start
        // Prevent default link behavior
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Prevent multiple simultaneous loads
        if (window.isLoadingNote) {
            return false;
        }
        window.isLoadingNote = true;

        // Find the clicked link to update selection using robust method
        const clickedLink = findNoteLinkByTitle(noteTitle);
        
        // Show loading state immediately
        showNoteLoadingState();
        
        // On mobile, add note-open class
        if (isMobileDevice()) {
            document.body.classList.add('note-open');
        }

    // Create XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
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
                                    // Update URL before reinitializing so reinitializeNoteContent
                                    // can detect the 'note' param and keep the right column visible
                                    updateBrowserUrl(url, noteTitle);
                                    reinitializeNoteContent();

                                    // Reapply highlights after content has been reinitialized.
                                    // Use delayed calls to ensure layout has stabilized when switching notes.
                                    if (typeof applyHighlightsWithRetries === 'function') {
                                        try { applyHighlightsWithRetries(); } catch (e) { /* ignore */ }
                                    }

                                    hideNoteLoadingState();

                                    // Apply selection after content is loaded and initialized
                                    updateSelectedNote(clickedLink);
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
function loadNoteViaAjax(url, noteTitle, clickedLink) {
    if (isNoteLoading) {
        return; // Prevent multiple simultaneous requests
    }

    isNoteLoading = true;
    currentLoadingNoteId = noteTitle;

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

                            // Update URL before reinitializing so reinitializeNoteContent
                            // can detect the 'note' param and keep the right column visible
                            updateBrowserUrl(url, noteTitle);

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
function loadNoteFromUrl(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    const noteTitle = urlParams.get('note');

    if (noteTitle) {
        // Find the corresponding note link using robust method
        const noteLink = findNoteLinkByTitle(noteTitle);
        if (noteLink) {
            loadNoteViaAjax(url, noteTitle, noteLink);
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

    // Add selected class to clicked note
    if (clickedLink) {
        clickedLink.classList.add('selected-note');
        
        // Ensure the selection persists by re-applying it after a short delay
        // This helps in case other scripts interfere with the selection
        setTimeout(() => {
            if (clickedLink && !clickedLink.classList.contains('selected-note')) {
                // re-applying selected-note if removed by other scripts
                clickedLink.classList.add('selected-note');
            }
        }, 50);
    }
}

/**
 * Update browser URL without reload
 */
function updateBrowserUrl(url, noteTitle) {
    const state = { noteTitle: noteTitle };
    history.pushState(state, '', url);
}

/**
 * Re-initialize image click handlers for note content
 */
function reinitializeImageClickHandlers() {
    // Find all images in the document
    const allImages = document.querySelectorAll('img');

    allImages.forEach((img, index) => {
        // Remove existing event listeners to avoid duplicates
        img.removeEventListener('click', handleImageClick);
        // Add new event listener
        img.addEventListener('click', handleImageClick);
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

    const src = img.src;

    // Remove any existing image menu
    const existingMenu = document.querySelector('.image-menu');
    if (existingMenu) {
        document.body.removeChild(existingMenu);
    }

    // Create simple dropdown menu
    const menu = document.createElement('div');
    menu.className = 'image-menu';
    menu.innerHTML = `
        <div class="image-menu-item" data-action="view-large">
            <i class="fa-maximize"></i>
            View Large
        </div>
        <div class="image-menu-item" data-action="download">
            <i class="fa-download"></i>
            Download
        </div>
    `;

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

    // Re-initialize search highlighting if in search mode
    if (typeof highlightSearchTerms === 'function' && isSearchMode) {
        setTimeout(highlightSearchTerms, 100);
    }

    // Re-initialize clickable tags
    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
        reinitializeClickableTagsAfterAjax();
    }

    // Re-initialize image click handlers
    reinitializeImageClickHandlers();

    // Re-initialize any other components that might be needed
    // (emoji picker, toolbar handlers, etc.)

    // Focus on the note content if it exists
    const noteContent = document.querySelector('[contenteditable="true"]');
    // Only focus the note content when not in search mode; otherwise keep focus in the search input
    if (noteContent && !isSearchMode) {
        setTimeout(() => {
            noteContent.focus();
        }, 100);
    }

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

    // Re-initialize toolbar functionality
    if (typeof initializeToolbarHandlers === 'function') {
        initializeToolbarHandlers();
    }
    
    // On mobile, ensure the right column is properly displayed only when a specific note is selected
    if (isMobileDevice()) {
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        const searchParam = urlParams.get('search');
        const tagsSearchParam = urlParams.get('tags_search');
        const unifiedSearchParam = urlParams.get('unified_search');
        const isInSearchMode = searchParam || tagsSearchParam || unifiedSearchParam;
        
        // Only add note-open class if we have a specific note selected AND we're not in search mode
        if (noteParam && !isInSearchMode) {
            // Make sure body has note-open class
            if (!document.body.classList.contains('note-open')) {
                document.body.classList.add('note-open');
            }
            
            // Ensure right column is visible
            const rightColumn = document.getElementById('right_col');
            if (rightColumn) {
                rightColumn.style.display = 'block';
            }
        } else {
            // If no specific note is selected or we're in search mode, ensure left column is visible
            if (document.body.classList.contains('note-open')) {
                document.body.classList.remove('note-open');
            }
            
            // Ensure left column is visible
            const leftColumn = document.getElementById('left_col');
            if (leftColumn) {
                leftColumn.style.display = 'block';
            }
        }
    }
}

/**
 * Check if a URL is for note loading
 */
function isNoteUrl(url) {
    return url.includes('note=') && url.includes('index.php');
}
