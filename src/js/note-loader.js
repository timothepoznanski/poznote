/**
 * Note Loader - AJAX Note Loading System
 * Prevents full page reload when clicking on notes in the left column
 */

// Global variables for note loading
var currentLoadingNoteId = null;
var isNoteLoading = false;

/**
 * Initialize note loading system
 */
function initializeNoteLoader() {
    // Intercept clicks on note links
    document.addEventListener('click', function(event) {
        const noteLink = event.target.closest('.links_arbo_left');
        
        if (noteLink && noteLink.tagName === 'A') {
            event.preventDefault();
            
            const href = noteLink.getAttribute('href');
            const noteTitle = noteLink.getAttribute('data-note-id');
            
            if (href && noteTitle) {
                loadNoteViaAjax(href, noteTitle, noteLink);
            }
        }
    });
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.noteTitle) {
            loadNoteFromUrl(window.location.href);
        }
    });
}

/**
 * Load note content via AJAX
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
                            currentRightColumn.innerHTML = rightColumn.innerHTML;
                            
                            // Re-initialize any JavaScript that might be needed
                            reinitializeNoteContent();
                            
                            // Update browser URL without reload
                            updateBrowserUrl(url, noteTitle);
                            
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
                }
            } else {
                console.error('Failed to load note:', xhr.status, xhr.statusText);
                showNotificationPopup('Failed to load note. Please try again.');
                hideNoteLoadingState();
            }
        }
    };
    
    xhr.onerror = function() {
        isNoteLoading = false;
        console.error('Network error while loading note');
        showNotificationPopup('Network error. Please check your connection.');
        hideNoteLoadingState();
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
        // Find the corresponding note link
        const noteLink = document.querySelector(`[data-note-id="${noteTitle}"]`);
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
                    <i class="fas fa-spinner fa-spin"></i>
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
    // Remove selected class from all notes
    document.querySelectorAll('.links_arbo_left').forEach(link => {
        link.classList.remove('selected-note');
    });
    
    // Add selected class to clicked note
    if (clickedLink) {
        clickedLink.classList.add('selected-note');
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
 * Re-initialize note content after AJAX load
 */
function reinitializeNoteContent() {
    // Re-initialize any JavaScript components that might be in the loaded content
    
    // Re-initialize search highlighting if in search mode
    if (typeof highlightSearchTerms === 'function' && isSearchMode) {
        setTimeout(highlightSearchTerms, 100);
    }
    
    // Re-initialize any other components that might be needed
    // (emoji picker, toolbar handlers, etc.)
    
    // Focus on the note content if it exists
    const noteContent = document.querySelector('[contenteditable="true"]');
    if (noteContent) {
        setTimeout(() => {
            noteContent.focus();
        }, 100);
    }
    
    // Re-initialize toolbar functionality
    if (typeof initializeToolbarHandlers === 'function') {
        initializeToolbarHandlers();
    }
}

/**
 * Check if a URL is for note loading
 */
function isNoteUrl(url) {
    return url.includes('note=') && url.includes('index.php');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteLoader();
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    initializeNoteLoader();
}
