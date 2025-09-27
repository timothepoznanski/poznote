/**
 * Note Loader Mobile - Mobile-specific functionality for note loading system
 * Handles touch events and mobile-specific interactions
 */

/**
 * Initialize touch event handlers for mobile note links
 * On mobile, we use touch handlers instead of onclick for better UX
 */
function initializeMobileTouchHandlers() {
    // Use matchMedia to match the CSS mobile breakpoint (keep behavior aligned with styles)
    if (!window.matchMedia('(max-width: 800px)').matches) {
        return; // Skip if not in mobile-like viewport
    }

    // Find all note links (anchors themselves have the class 'links_arbo_left')
    const noteLinks = document.querySelectorAll('a.links_arbo_left');

    noteLinks.forEach(link => {
        // Remove existing event listeners to avoid duplicates
        link.removeEventListener('touchstart', handleMobileTouchStart);
        link.removeEventListener('touchend', handleMobileTouchEnd);

        // Add touch event listeners with passive option for touchstart
        link.addEventListener('touchstart', handleMobileTouchStart, { passive: true });
        link.addEventListener('touchend', handleMobileTouchEnd, { passive: false });
        
        // Add a click listener to avoid duplicate activation when touch handlers already handled the tap
        link.removeEventListener('click', handleMobileClickFallback);
        link.addEventListener('click', handleMobileClickFallback);
    });

    // Capture-phase click handler to ensure single-click opens note in mobile/compact view
    function mobileAnchorCaptureHandler(e) {
    // Only handle in mobile-like layout (match CSS breakpoint)
    if (!window.matchMedia('(max-width: 800px)').matches) return;

        var link = e.target.closest('a.links_arbo_left');
        if (!link) return;

        // If touch already handled it, ignore
        if (link.touchHandled) {
            e.preventDefault();
            e.stopPropagation();
            // reset flag shortly after
            setTimeout(() => { link.touchHandled = false; }, 300);
            return;
        }

    // Prevent default navigation and ensure consistent AJAX loading
        e.preventDefault();
        e.stopPropagation();

        var url = link.getAttribute('href');
        var noteTitle = link.getAttribute('data-note-id');
        // Call loader with the event so it can prevent default if needed
        loadNoteDirectly(url, noteTitle, e);
    }

    // Attach capture listener once
    document.removeEventListener('click', mobileAnchorCaptureHandler, true);
    document.addEventListener('click', mobileAnchorCaptureHandler, true);
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
    // touch start recorded on element
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

    // touch end recorded on element
    // Validate tap: reasonable duration, no significant movement
    if (touchDuration > 50 && touchDuration < 1000 && !hasMoved && !this.touchHandled) {
    this.touchHandled = true; // Mark as handled
        loadNoteDirectly(url, noteTitle);
    }

    return false;
}

// Fallback click handler to prevent duplicate open when touch already handled
function handleMobileClickFallback(event) {
    // If this link was recently handled by touch, ignore the click
    if (this.touchHandled) {
        event.preventDefault();
        event.stopPropagation();
        // Reset flag shortly after to allow future clicks
        setTimeout(() => { this.touchHandled = false; }, 300);
        return false;
    }
    // Otherwise let normal click behavior proceed (desktop onclick or href)
}

/**
 * Function to go back to note list on mobile
 * Made available globally for use by mobile home button
 */
window.goBackToNoteList = function() {
    if (window.matchMedia('(max-width: 800px)').matches) {
        // Remove note-open class to show left column
        document.body.classList.remove('note-open');

        // Keep the currently selected note highlighted so it can be re-opened with one tap
        // (do not remove the 'selected-note' class here)

        // Reset loading state to ensure next note click works
        window.isLoadingNote = false;

        // Update URL to remove note parameter while preserving search-related params
        const url = new URL(window.location);
        // Remove note param
        url.searchParams.delete('note');

        // Preserve relevant search params if present in current location so SearchManager
        // can restore the correct active type on the list view. We'll copy any of these
        // from the current location (they may already be present) to be safe.
    const preserveKeys = ['search', 'tags_search', 'unified_search', 'workspace'];
        const currentParams = new URLSearchParams(window.location.search || '');

        // Detect active search type on mobile; prefer SearchManager if available
        let activeMobileType = null;
        try {
            if (window.searchManager && typeof window.searchManager.getActiveSearchType === 'function') {
                activeMobileType = window.searchManager.getActiveSearchType(true);
            }
        } catch (e) {
            activeMobileType = null;
        }

        // If we couldn't determine type from SearchManager, fall back to URL flags
        if (!activeMobileType) {
            if (currentParams.get('preserve_tags') === '1' || currentParams.get('search_in_tags') === '1') {
                activeMobileType = 'tags';
            } else if (currentParams.get('preserve_notes') === '1' || currentParams.get('search')) {
                activeMobileType = 'notes';
            }
        }

    // Copy relevant params but normalize preserve flags according to activeMobileType (notes or tags only)
        preserveKeys.forEach(k => {
            const v = currentParams.get(k);
            if (v && v !== '') {
                url.searchParams.set(k, v);
            }
        });

        // Normalize preserve flags according to activeMobileType (notes or tags only)
        if (activeMobileType === 'tags') {
            url.searchParams.set('preserve_tags', '1');
            url.searchParams.delete('preserve_notes');
        } else if (activeMobileType === 'notes') {
            url.searchParams.set('preserve_notes', '1');
            url.searchParams.delete('preserve_tags');
        }

        // Clean workspace param if default
        if (!url.searchParams.get('workspace')) {
            const currentWorkspace = selectedWorkspace || window.selectedWorkspace;
            if (!currentWorkspace || currentWorkspace === 'Poznote') {
                url.searchParams.delete('workspace');
            }
        }

        // Clear any lingering highlights (titles, inputs, tags) when returning to list
        try {
            if (typeof clearSearchHighlights === 'function') {
                clearSearchHighlights();
            }
            if (typeof window.highlightMatchingTags === 'function') {
                // clear tag highlights
                window.highlightMatchingTags('');
            }
        } catch (e) { /* ignore */ }

        history.pushState({}, '', url.toString());
    }
};

/**
 * Initialize note loading system for mobile
 */
function initializeNoteLoaderMobile() {
    // Simple initialization - events are now handled directly in HTML

    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.noteTitle) {
            loadNoteFromUrl(window.location.href);
        } else {
            // If no state (going back to list), handle mobile view
            if (window.matchMedia('(max-width: 800px)').matches) {
                document.body.classList.remove('note-open');
                // Keep the selected note highlighted so the user can re-open it with one tap
                // (do not clear 'selected-note' here)
                // Reset loading state to ensure next note click works
                window.isLoadingNote = false;
            }
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeNoteLoaderMobile();
    reinitializeImageClickHandlers(); // Initialize image handlers on page load
    initializeMobileTouchHandlers(); // Initialize mobile touch handlers

    // Add touch move detection for mobile-like layout
    if (window.matchMedia('(max-width: 800px)').matches) {
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

    // On mobile-like layout, if we have a note parameter in URL, ensure note-open class is set
    if (window.matchMedia('(max-width: 800px)').matches) {
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

    // Add touch move detection for mobile-like layout if DOM already loaded
    if (window.matchMedia('(max-width: 800px)').matches) {
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

    // Same mobile-like check for already loaded DOM
    if (window.matchMedia('(max-width: 800px)').matches) {
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
