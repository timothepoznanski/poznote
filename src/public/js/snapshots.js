/**
 * Revisions of the open note, from the notes page.
 *
 * Saves a revision on Ctrl + Alt + S and opens the Revisions page
 * (revisions.php), which holds the history, the comparison and the restore.
 * The automatic revisions are taken by the server when a change is saved
 * (lib/snapshots.php), nothing here asks for them. The API calls revisions
 * snapshots.
 */

(function () {
    'use strict';

    function tr(key, fallback, vars) {
        if (typeof window.t === 'function') {
            return window.t(key, vars || null, fallback);
        }
        return fallback;
    }

    function requestSnapshotCreate(noteId, manual) {
        return fetch('/api/v1/notes/' + noteId + '/snapshot' + (manual ? '?manual=1' : ''), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        }).then(function (response) {
            return response.json().catch(function () {
                return {
                    success: response.ok,
                    error: response.ok ? null : tr('revisions.errors.create_failed', 'Could not save a revision')
                };
            });
        });
    }

    /**
     * Wait until the autosave of the current note has gone through, so a
     * revision taken (or a comparison made) right after reflects what the
     * user sees. Resolves anyway after a few seconds.
     */
    function waitForNoteSaved(noteId) {
        return new Promise(function (resolve) {
            var deadline = Date.now() + 5000;
            (function check() {
                var pending = typeof window.hasUnsavedChanges === 'function' && window.hasUnsavedChanges(noteId);
                if (!pending || Date.now() > deadline) {
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            })();
        });
    }

    function saveOpenNote(noteId) {
        if (typeof window.hasUnsavedChanges === 'function' && window.hasUnsavedChanges(noteId)
            && typeof window.saveNoteImmediately === 'function') {
            window.saveNoteImmediately();
            return waitForNoteSaved(noteId);
        }
        return Promise.resolve();
    }

    /**
     * Open the Revisions page of a note. Pending edits are saved first, so
     * "Current version" there is what was on screen.
     */
    window.openNoteRevisions = function (noteId) {
        if (!noteId) {
            noteId = typeof window.getDisplayedNoteId === 'function' ? window.getDisplayedNoteId() : window.noteid;
        }
        if (!noteId || noteId === -1 || noteId === 'search') return;

        var workspace = '';
        if (typeof window.selectedWorkspace === 'string' && window.selectedWorkspace) {
            workspace = window.selectedWorkspace;
        } else if (typeof window.getSelectedWorkspace === 'function') {
            workspace = window.getSelectedWorkspace() || '';
        }
        var url = 'revisions.php?note_id=' + encodeURIComponent(noteId)
            + (workspace ? '&workspace=' + encodeURIComponent(workspace) : '');

        saveOpenNote(noteId).then(function () {
            window.location.href = url;
        });
    };

    /**
     * Save a revision of the open note without any confirmation
     * (Ctrl + Alt + S). Saves pending edits first so the revision holds the
     * content on screen, then shows a toast.
     */
    window.takeSnapshotShortcut = function () {

        var noteId = window.noteid;
        if (!noteId || noteId === -1 || noteId === 'search') return false;

        saveOpenNote(noteId).then(function () {
            return requestSnapshotCreate(noteId, true);
        }).then(function (data) {
            if (!data || !data.success) {
                showSnapshotError((data && data.error) || tr('revisions.errors.create_failed', 'Could not save a revision'));
                return;
            }
            showSnapshotToast(tr('revisions.messages.created', 'Revision saved'));
        }).catch(function () {
            showSnapshotError(tr('revisions.errors.create_failed', 'Could not save a revision'));
        });

        return true;
    };

    function ensureSnapshotToastContainer() {
        // Shared with the "Saved!" toast so both stack (issue 1508)
        if (typeof window.poznoteToastStack === 'function') return window.poznoteToastStack();

        var id = 'snapshot-toast-container';
        var container = document.getElementById(id);
        if (container) return container;

        container = document.createElement('div');
        container.id = id;
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        container.style.position = 'fixed';
        container.style.top = '16px';
        container.style.right = '16px';
        container.style.zIndex = '2147483647';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
        return container;
    }

    function showSnapshotToast(message, duration) {
        try {
            duration = duration || 1800;

            var container = ensureSnapshotToastContainer();
            var toast = document.createElement('div');
            toast.className = 'snapshot-toast-message';
            toast.style.pointerEvents = 'auto';
            toast.style.background = '#007DB8';
            toast.style.color = '#ffffff';
            toast.style.padding = '10px 16px';
            toast.style.marginTop = '8px';
            toast.style.borderRadius = '10px';
            toast.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.18)';
            toast.style.fontSize = '14px';
            toast.style.fontWeight = '600';
            toast.style.maxWidth = '280px';
            toast.style.wordBreak = 'break-word';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-6px)';
            toast.style.transition = 'opacity 160ms ease-in-out, transform 160ms ease-in-out';
            toast.textContent = message;
            container.appendChild(toast);

            toast.offsetHeight;
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';

            setTimeout(function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(function () {
                    try {
                        container.removeChild(toast);
                    } catch (e) {
                        console.debug('snapshots: showSnapshotToast() failed:', e);
                    }
                }, 220);
            }, duration);
        } catch (e) {
            console.debug('snapshots: showSnapshotToast() failed:', e);
        }
    }

    function showSnapshotError(message) {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(message, 'error');
            return;
        }

        try {
            window.alert(message);
        } catch (e) {
            console.debug('snapshots: showSnapshotError() failed:', e);
        }
    }

})();
