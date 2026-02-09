// Navigation system for Poznote
// Handles note-to-note navigation, browser history, and unsaved changes warnings

// Initialize all auto-save and navigation systems
function initializeAutoSaveSystem() {
    setupAutoSaveCheck();
    setupNoteNavigationInterceptor();
    setupNavigationDebugger();
}

// Monitor popstate events - reload note when using browser back/forward
function setupNavigationDebugger() {
    window.addEventListener('popstate', function (e) {
        var currentNoteId = window.noteid;

        // Check for unsaved changes first
        if (hasUnsavedChanges(currentNoteId)) {
            var message = tr(
                'autosave.confirm_navigation',
                {},
                "⚠️ Unsaved Changes\n\n" +
                "You have unsaved changes that will be lost.\n" +
                "Save before navigating away?"
            );

            if (confirm(message)) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
                if (isOnline) {
                    saveToServerDebounced();
                }
                notesNeedingRefresh.delete(String(currentNoteId));
            }
        }

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
    });
}

// Global click interceptor for note navigation links
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

            // Show temporary notification
            showSaveInProgressNotification(function () {
                // Callback when save is complete - proceed with navigation
                window.location.href = href;
            });

            return false;
        }

        // No unsaved changes, allow normal navigation
    }, true); // Use capture phase to intercept before other handlers
}

// Load a note by ID (used for note-to-note navigation)
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

// Check before leaving a note with unsaved changes
function checkUnsavedBeforeLeaving(targetNoteId) {
    var currentNoteId = window.noteid;

    if (!currentNoteId || currentNoteId === -1 || currentNoteId === 'search') return true;

    // If staying on same note, no need to check
    if (String(currentNoteId) === String(targetNoteId)) return true;

    if (hasUnsavedChanges(currentNoteId)) {
        var message = tr(
            'autosave.confirm_switch',
            {},
            "⚠️ Unsaved Changes Detected\n\n" +
            "You have unsaved changes that will be lost if you switch now.\n\n" +
            "Click OK to save and continue, or Cancel to stay.\n" +
            "(Auto-save occurs 2 seconds after you stop typing)"
        );

        if (confirm(message)) {
            // Force immediate save
            clearTimeout(saveTimeout);
            saveTimeout = null;

            // Immediate server save
            if (isOnline) {
                saveToServerDebounced();
            }

            // Small delay to let save complete
            setTimeout(() => {
                notesNeedingRefresh.delete(String(currentNoteId));
            }, 500);

            return true;
        } else {
            return false;
        }
    }

    return true;
}

// Expose navigation functions globally
window.checkUnsavedBeforeLeaving = checkUnsavedBeforeLeaving;
