/**
 * Navigation System for Poznote
 * 
 * Manages note-to-note navigation, browser history (back/forward),
 * and warnings for unsaved changes during navigation.
 * 
 * External Dependencies:
 * - hasUnsavedChanges(noteId) - from auto-save.js
 * - saveToServerDebounced() - from auto-save.js
 * - loadNoteFromUrl(url, isPop) - from ui.js
 * - showSaveInProgressNotification(callback) - from ui.js
 * - tr(key, params, fallback) - translation function
 * - window.noteid - current note ID
 * - saveTimeout - auto-save timer reference
 * - isOnline - connection status
 * - notesNeedingRefresh - Set of notes pending save
 */

/**
 * Initialize all navigation-related event handlers
 * Called once on page load to set up the navigation system
 */
function initializeAutoSaveSystem() {
    setupAutoSaveCheck();
    setupNoteNavigationInterceptor();
    setupBrowserNavigationHandler();
}

/**
 * Handle browser back/forward button navigation (popstate events)
 * Checks for unsaved changes and reloads the appropriate note
 */
function setupBrowserNavigationHandler() {
    window.addEventListener('popstate', function (e) {
        var currentNoteId = window.noteid;

        // Check for unsaved changes before navigating
        if (hasUnsavedChanges(currentNoteId)) {
            var result = handleUnsavedChanges(currentNoteId, 'autosave.confirm_navigation', 
                "You have unsaved changes that will be lost.\nSave before navigating away?");
            
            // If result is a Promise (using modal), wait for it
            if (result && typeof result.then === 'function') {
                result.then(function(confirmed) {
                    // Continue navigation regardless of choice
                    performPopstateNavigation();
                });
                return; // Stop here, navigation will continue in callback
            }
            // If synchronous (fallback confirm), continue immediately
        }

        // No unsaved changes or after save, perform navigation
        performPopstateNavigation();
    });
    
    function performPopstateNavigation() {
        // Handle URL-based navigation (browser back/forward)
        var url = new URL(window.location.href);
        var noteParam = url.searchParams.get('note');

        if (noteParam && typeof loadNoteFromUrl === 'function') {
            loadNoteFromUrl(window.location.href, true);
        } else if (!noteParam && url.searchParams.get('workspace')) {
            // Just workspace change, let ui.js handler manage it
        } else {
            window.location.reload();
        }
    }
}

/**
 * Intercept clicks on note links to check for unsaved changes
 * Prevents navigation if there are unsaved changes and initiates save
 */
function setupNoteNavigationInterceptor() {
    document.addEventListener('click', function (e) {
        // Check if this is a note link
        var link = e.target.closest('a.links_arbo_left, a[href*="note="]');
        if (!link) return;

        // Extract target note ID from href
        var href = link.getAttribute('href');
        if (!href) return;

        var noteMatch = href.match(/[?&]note=(\d+)/);
        if (!noteMatch) return;

        var targetNoteId = noteMatch[1];
        var currentNoteId = window.noteid;

        // Check for unsaved changes BEFORE allowing navigation
        if (currentNoteId && currentNoteId !== targetNoteId && hasUnsavedChanges(currentNoteId)) {
            // Prevent default navigation
            e.preventDefault();
            e.stopPropagation();

            // Show notification and save, then navigate
            showSaveInProgressNotification(function () {
                // Callback when save is complete - proceed with navigation
                window.location.href = href;
            });

            return false;
        }

        // No unsaved changes, allow normal navigation
    }, true); // Use capture phase to intercept before other handlers
}

/**
 * Load a note by ID (programmatic navigation)
 * 
 * @param {string|number} noteId - The ID of the note to load
 */
function loadNoteById(noteId) {
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + noteId;

    // Use the existing loadNoteDirectly function if available
    if (typeof window.loadNoteDirectly === 'function') {
        window.loadNoteDirectly(url, noteId, null);
    } else {
        // Fallback: navigate directly
        window.location.href = url;
    }
}

/**
 * Check for unsaved changes before leaving current note
 * Shows confirmation dialog and saves if user confirms
 * 
 * @param {string|number} targetNoteId - The ID of the note to navigate to
 * @returns {boolean} True if navigation should proceed, false otherwise
 */
function checkUnsavedBeforeLeaving(targetNoteId) {
    var currentNoteId = window.noteid;

    // Skip check for special states
    if (!currentNoteId || currentNoteId === -1 || currentNoteId === 'search') {
        return true;
    }

    // If staying on same note, no need to check
    if (String(currentNoteId) === String(targetNoteId)) {
        return true;
    }

    // Check for unsaved changes
    if (hasUnsavedChanges(currentNoteId)) {
        return handleUnsavedChanges(currentNoteId, 'autosave.confirm_switch',
            "⚠️ Unsaved Changes Detected\n\n" +
            "You have unsaved changes that will be lost if you switch now.\n\n" +
            "Click OK to save and continue, or Cancel to stay.\n" +
            "(Auto-save occurs 2 seconds after you stop typing)");
    }

    return true;
}

/**
 * Handle unsaved changes by prompting user and saving if confirmed
 * Extracted to avoid code duplication
 * 
 * @param {string|number} noteId - Current note ID with unsaved changes
 * @param {string} translationKey - Translation key for the message
 * @param {string} fallbackMessage - Fallback message if translation not found
 * @returns {boolean|Promise<boolean>} True if user confirmed save, false otherwise (or Promise if using modal)
 */
function handleUnsavedChanges(noteId, translationKey, fallbackMessage) {
    var message = tr(translationKey, {}, fallbackMessage);
    var title = tr('autosave.unsaved_changes_title', {}, 'Unsaved Changes');

    // Use styled modal if available
    if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
        return window.modalAlert.confirm(message, title).then(function(confirmed) {
            if (confirmed) {
                // Force immediate save
                clearTimeout(saveTimeout);
                saveTimeout = null;

                // Immediate server save if online
                if (isOnline) {
                    saveToServerDebounced();
                }

                // Clear refresh flag after short delay to let save complete
                setTimeout(function() {
                    notesNeedingRefresh.delete(String(noteId));
                }, 500);

                return true;
            }
            return false;
        });
    } else {
        // Fallback to native confirm (synchronous)
        if (confirm(message)) {
            // Force immediate save
            clearTimeout(saveTimeout);
            saveTimeout = null;

            // Immediate server save if online
            if (isOnline) {
                saveToServerDebounced();
            }

            // Clear refresh flag after short delay to let save complete
            setTimeout(function() {
                notesNeedingRefresh.delete(String(noteId));
            }, 500);

            return true;
        }

        return false;
    }
}

// Expose navigation functions globally
window.checkUnsavedBeforeLeaving = checkUnsavedBeforeLeaving;
