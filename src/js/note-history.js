/**
 * Note Navigation History
 * 
 * Tracks visited notes and provides back/forward navigation,
 * similar to browser history but scoped to note navigation only.
 * 
 * External Dependencies:
 * - window.noteid - current note ID
 * - loadNoteDirectly(url, noteId, event) - from note-loader-common.js
 * - window.selectedWorkspace / getSelectedWorkspace() - workspace context
 */

var NoteHistory = (function () {
    var MAX_HISTORY = 50;
    var history = [];    // Array of note IDs
    var currentIndex = -1;
    var navigating = false; // Flag to prevent recording during back/forward

    /**
     * Push a new note onto the history stack.
     * Called whenever a note is opened (not via back/forward).
     */
    function push(noteId) {
        if (navigating) return;
        noteId = String(noteId);
        if (!noteId || noteId === '-1' || noteId === 'search') return;

        // If we're at the same note, don't duplicate
        if (currentIndex >= 0 && history[currentIndex] === noteId) return;

        // Truncate any forward history
        history = history.slice(0, currentIndex + 1);

        // Push the new entry
        history.push(noteId);

        // Cap the history size
        if (history.length > MAX_HISTORY) {
            history.shift();
        }

        currentIndex = history.length - 1;
        updateButtons();
    }

    /**
     * Navigate backward in history.
     */
    function goBack() {
        if (!canGoBack()) return;
        currentIndex--;
        navigateTo(history[currentIndex]);
    }

    /**
     * Navigate forward in history.
     */
    function goForward() {
        if (!canGoForward()) return;
        currentIndex++;
        navigateTo(history[currentIndex]);
    }

    function canGoBack() {
        return currentIndex > 0;
    }

    function canGoForward() {
        return currentIndex < history.length - 1;
    }

    /**
     * Load the note at the given history position.
     */
    function navigateTo(noteId) {
        navigating = true;
        var workspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace)
            ? selectedWorkspace
            : (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '');
        var url = 'index.php?note=' + encodeURIComponent(noteId);
        if (workspace) {
            url += '&workspace=' + encodeURIComponent(workspace);
        }

        if (typeof window.loadNoteDirectly === 'function') {
            window.loadNoteDirectly(url, noteId, null);
        } else {
            window.location.href = url;
        }

        // Reset navigating flag after a short delay to allow the load to complete
        setTimeout(function () {
            navigating = false;
            updateButtons();
        }, 300);
    }

    /**
     * Update the disabled/enabled state of the back/forward buttons.
     */
    function updateButtons() {
        var backBtn = document.getElementById('note-history-back');
        var forwardBtn = document.getElementById('note-history-forward');

        if (backBtn) {
            backBtn.disabled = !canGoBack();
            backBtn.classList.toggle('history-disabled', !canGoBack());
        }
        if (forwardBtn) {
            forwardBtn.disabled = !canGoForward();
            forwardBtn.classList.toggle('history-disabled', !canGoForward());
        }
    }

    /**
     * Initialize: record the currently open note and bind button events.
     */
    function init() {
        // Record the initially loaded note
        var dataEl = document.getElementById('current-note-data');
        if (dataEl) {
            try {
                var data = JSON.parse(dataEl.textContent);
                if (data && data.noteId) {
                    push(data.noteId);
                }
            } catch (e) { /* ignore */ }
        } else if (window.noteid && window.noteid !== -1) {
            push(window.noteid);
        }

        // Bind click events via delegation (buttons may be re-rendered via AJAX)
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('#note-history-back');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                goBack();
                return;
            }
            btn = e.target.closest('#note-history-forward');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                goForward();
                return;
            }
        });

        updateButtons();
    }

    // Public API
    return {
        push: push,
        goBack: goBack,
        goForward: goForward,
        canGoBack: canGoBack,
        canGoForward: canGoForward,
        updateButtons: updateButtons,
        init: init
    };
})();

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
    NoteHistory.init();
});
