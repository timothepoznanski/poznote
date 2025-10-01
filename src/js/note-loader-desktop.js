/**
 * Note Loader Desktop - Desktop-specific functionality for note loading system
 * Handles click events and desktop-specific interactions
 */

function initializeDesktopClickHandlers() {
    if (isMobileDevice()) return;
}

/**
 * Initialize note loading system for desktop
 */
function initializeNoteLoaderDesktop() {
    // Simple initialization - events are now handled directly in HTML

    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.noteId) {
            loadNoteFromUrl(window.location.href);
        } else {
            // If no state (going back to list), handle desktop view
            // Clear selected note
            document.querySelectorAll('.links_arbo_left').forEach(link => {
                link.classList.remove('selected-note');
            });
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteLoaderDesktop();
    reinitializeImageClickHandlers(); // Initialize image handlers on page load
    initializeDesktopClickHandlers(); // Initialize desktop click handlers

    // Add global image click listener as fallback - using event delegation
    document.addEventListener('click', function(event) {
        // Check if the clicked element is an image
        if (event.target.tagName === 'IMG') {
            handleImageClick(event);
        }
    }, true); // Use capture phase to ensure we get the event first
});

// Also initialize if DOM is already loaded
if (document.readyState !== 'loading') {
    initializeNoteLoaderDesktop();
    reinitializeImageClickHandlers(); // Initialize image handlers if DOM already loaded
    initializeDesktopClickHandlers(); // Initialize desktop click handlers if DOM already loaded
}
