/**
 * Note Loader - AJAX Note Loading System
 * Prevents full page reload when clicking on notes in the left column
 */

// Global variables for note loading
var currentLoadingNoteId = null;
var isNoteLoading = false;

/**
 * Check if we're on mobile
 */
function isMobileDevice() {
    return window.innerWidth <= 800;
}

/**
 * Function to go back to note list on mobile
 * Made available globally for use by mobile home button
 */
window.goBackToNoteList = function() {
    if (isMobileDevice()) {
        // Remove note-open class to show left column
        document.body.classList.remove('note-open');
        
        // Clear selected note
        document.querySelectorAll('.links_arbo_left').forEach(link => {
            link.classList.remove('selected-note');
        });
        
        // Update URL to remove note parameter
        const url = new URL(window.location);
        url.searchParams.delete('note');
        history.pushState({}, '', url.toString());
    }
};

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
                // If a note has been edited but not saved, ask for confirmation using the
                // app's styled confirm modal (fallback to native confirm if unavailable).
                try {
                    if (typeof editedButNotSaved !== 'undefined' && editedButNotSaved == 1) {
                        var title = 'Unsaved changes';
                        var message = 'This note has unsaved changes. Do you want to continue and lose your changes?';

                        // If the app provides the styled confirm modal, use it
                        if (typeof showConfirmModal === 'function') {
                            showConfirmModal(title, message, function() {
                                try { editedButNotSaved = 0; } catch (e) {}
                                loadNoteViaAjax(href, noteTitle, noteLink);
                            });
                            // Do not proceed now; wait for the modal callback
                            return;
                        }

                        // Use custom confirm dialog instead of native confirm
                        showConfirmDialog(message, function() {
                            // User chose to continue: clear the flag so we don't prompt again
                            try { editedButNotSaved = 0; } catch (e) {}
                            // Continue with the navigation
                            loadnote(id, pos, e ? e.shiftKey : false, searchTerm);
                        }, function() {
                            // User cancelled - do nothing
                            return;
                        });
                        return; // Exit here to wait for user choice
                    }
                } catch (e) {
                    // If any error occurs while checking edited flag, just proceed
                }

                // No unsaved changes or user confirmed: load the note
                loadNoteViaAjax(href, noteTitle, noteLink);
            }
        }
    });
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.noteTitle) {
            loadNoteFromUrl(window.location.href);
        } else {
            // If no state (going back to list), handle mobile view
            if (isMobileDevice()) {
                document.body.classList.remove('note-open');
                
                // Clear selected note
                document.querySelectorAll('.links_arbo_left').forEach(link => {
                    link.classList.remove('selected-note');
                });
            }
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
    
    // On mobile, add the note-open class to body to show right column
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
    
    // Re-initialize clickable tags
    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
        reinitializeClickableTagsAfterAjax();
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteLoader();
    
    // On mobile, if we have a note parameter in URL, ensure note-open class is set
    if (isMobileDevice()) {
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        
        if (noteParam) {
            // We're loading a specific note on mobile, ensure proper display
            document.body.classList.add('note-open');
            
            // Mark the correct note as selected
            const noteLinks = document.querySelectorAll('.links_arbo_left');
            noteLinks.forEach(link => {
                if (link.getAttribute('data-note-id') === noteParam) {
                    link.classList.add('selected-note');
                }
            });
        }
    }
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    initializeNoteLoader();
    
    // Same mobile check for already loaded DOM
    if (isMobileDevice()) {
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        
        if (noteParam) {
            document.body.classList.add('note-open');
            
            const noteLinks = document.querySelectorAll('.links_arbo_left');
            noteLinks.forEach(link => {
                if (link.getAttribute('data-note-id') === noteParam) {
                    link.classList.add('selected-note');
                }
            });
        }
    }
}
