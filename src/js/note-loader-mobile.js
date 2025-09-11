/**
 * Note Loader Mobile - Mobile-specific functionality for note loading system
 * Handles touch events and mobile-specific interactions
 */

/**
 * Initialize touch event handlers for mobile note links
 */
function initializeMobileTouchHandlers() {
    if (!isMobileDevice()) {
        return; // Skip if not mobile
    }

    // Find all note links
    const noteLinks = document.querySelectorAll('.links_arbo_left a');

    noteLinks.forEach(link => {
        // Remove existing event listeners to avoid duplicates
        link.removeEventListener('touchstart', handleMobileTouchStart);
        link.removeEventListener('touchend', handleMobileTouchEnd);

        // Add touch event listeners with passive option for touchstart
        link.addEventListener('touchstart', handleMobileTouchStart, { passive: true });
        link.addEventListener('touchend', handleMobileTouchEnd, { passive: false });
    });
}

/**
 * Handle mobile touch start
 */
function handleMobileTouchStart(event) {
    // Store touch start time and position on the element
    this.touchStartTime = Date.now();
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.touchHandled = false; // Reset flag
}

/**
 * Handle mobile touch end
 */
function handleMobileTouchEnd(event) {
    const link = this;
    const url = link.getAttribute('href');
    const noteTitle = link.querySelector('.note-title')?.textContent?.trim() || link.textContent.trim();

    // Prevent default to avoid navigation
    event.preventDefault();

    // Validate touch
    const touch = event.changedTouches[0];
    const touchDuration = Date.now() - (this.touchStartTime || 0);
    const deltaX = Math.abs(touch.clientX - (this.touchStartX || 0));
    const deltaY = Math.abs(touch.clientY - (this.touchStartY || 0));
    const hasMoved = deltaX > 10 || deltaY > 10;

    // Validate tap: reasonable duration, no significant movement
    if (touchDuration > 50 && touchDuration < 1000 && !hasMoved && !this.touchHandled) {
        console.log('Valid mobile tap detected, loading note:', noteTitle);
        this.touchHandled = true; // Mark as handled
        loadNoteDirectly(url, noteTitle);
    } else {
        console.log('Invalid mobile tap - Duration:', touchDuration, 'ms, Movement:', deltaX, deltaY);
    }

    return false;
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

        // Update URL to remove note parameter while preserving workspace and other parameters
        const url = new URL(window.location);
        url.searchParams.delete('note');
        
        // Ensure workspace is preserved if it exists
        const currentWorkspace = selectedWorkspace || window.selectedWorkspace;
        if (currentWorkspace && currentWorkspace !== 'Poznote') {
            url.searchParams.set('workspace', currentWorkspace);
        } else if (!currentWorkspace || currentWorkspace === 'Poznote') {
            // If workspace is the default 'Poznote', we can remove it from URL for cleaner URLs
            url.searchParams.delete('workspace');
        }
        
        history.pushState({}, '', url.toString());
    }
};

/**
 * Initialize note loading system for mobile
 */
function initializeNoteLoaderMobile() {
    // Simple initialization - events are now handled directly in HTML

    // Keep the existing functions available for compatibility
    window.loadNoteViaAjax = loadNoteViaAjax;

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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteLoaderMobile();
    reinitializeImageClickHandlers(); // Initialize image handlers on page load
    initializeMobileTouchHandlers(); // Initialize mobile touch handlers

    // Add touch move detection for mobile
    if (isMobileDevice()) {
        document.addEventListener('touchmove', function(event) {
            if (window.touchStartX !== undefined && window.touchStartY !== undefined) {
                const touch = event.touches[0];
                const deltaX = Math.abs(touch.clientX - window.touchStartX);
                const deltaY = Math.abs(touch.clientY - window.touchStartY);

                if (deltaX > 10 || deltaY > 10) {
                    window.hasTouchMoved = true;
                }
            }
        }, { passive: true });
    }

    // Add global image click listener as fallback - using event delegation
    document.addEventListener('click', function(event) {
        // Check if the clicked element is an image
        if (event.target.tagName === 'IMG') {
            handleImageClick(event);
        }
    }, true); // Use capture phase to ensure we get the event first

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
    initializeNoteLoaderMobile();
    reinitializeImageClickHandlers(); // Initialize image handlers if DOM already loaded
    initializeMobileTouchHandlers(); // Initialize mobile touch handlers if DOM already loaded

    // Add touch move detection for mobile if DOM already loaded
    if (isMobileDevice()) {
        document.addEventListener('touchmove', function(event) {
            if (window.touchStartX !== undefined && window.touchStartY !== undefined) {
                const touch = event.touches[0];
                const deltaX = Math.abs(touch.clientX - window.touchStartX);
                const deltaY = Math.abs(touch.clientY - window.touchStartY);

                if (deltaX > 10 || deltaY > 10) {
                    window.hasTouchMoved = true;
                }
            }
        }, { passive: true });
    }

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
