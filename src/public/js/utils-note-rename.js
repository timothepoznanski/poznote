// Renaming and converting a note in Poznote.
// 
// Inline rename from the tree's note actions menu, and converting a note between types
// (HTML, Markdown, task list).

// ============================================
// Note rename (from the tree's note actions menu)
// ============================================

function renameNote(noteId, currentTitle) {
    // Inline in the tree row the actions menu was opened from; the modal below
    // stays for any caller that has no such row.
    if (window.PoznoteInlineTreeEdit && window.PoznoteInlineTreeEdit.renameNote(noteId, currentTitle)) {
        return;
    }

    var modal = document.getElementById('renameNoteModal');
    var input = document.getElementById('renameNoteName');
    if (!modal || !input) return;

    modal.style.display = 'flex';
    input.value = currentTitle || '';
    input.dataset.noteId = noteId;
    input.dataset.oldName = currentTitle || '';
    input.focus();
    input.select();
}

function saveNoteName() {
    var input = document.getElementById('renameNoteName');
    if (!input) return;

    var newName = input.value.trim();
    var oldName = input.dataset.oldName;
    var noteId = input.dataset.noteId;

    if (!newName) {
        showNotificationPopup(
            (window.t ? window.t('notes_list.note_actions.enter_note_name', null, 'Please enter a note title') : 'Please enter a note title'),
            'error'
        );
        return;
    }

    if (newName === oldName) {
        closeModal('renameNoteModal');
        return;
    }

    // Send the browser's editor session id so renaming a note that is open in
    // this tab passes the edit lock check; a note locked by someone else still
    // gets refused by the API.
    var editorSessionId = (typeof window.getCurrentEditorSessionId === 'function')
        ? window.getCurrentEditorSessionId()
        : '';

    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (editorSessionId) {
        headers['X-Editor-Session-ID'] = editorSessionId;
    }

    // Heading only: the API leaves content untouched when it is not provided.
    fetch('/api/v1/notes/' + encodeURIComponent(noteId), {
        method: 'PATCH',
        headers: headers,
        credentials: 'same-origin',
        body: JSON.stringify({ heading: newName, editor_session_id: editorSessionId })
    })
        .then(function (response) {
            return response.json().catch(function () { return {}; });
        })
        .then(function (data) {
            if (data && data.success) {
                closeModal('renameNoteModal');
                window.location.reload();
                return;
            }
            showNotificationPopup(
                'Error: ' + ((data && (data.error || data.message)) || 'Unknown error'),
                'error'
            );
        })
        .catch(function (error) {
            showNotificationPopup('Network error while renaming the note', 'error');
            console.error('Note rename error:', error);
        });
}

window.renameNote = renameNote;
window.saveNoteName = saveNoteName;

// ============================================
// Note Conversion Functions
// ============================================

var convertNoteId = null;
var convertNoteTarget = null;

/**
 * Show the convert note confirmation modal
 * @param {string} noteId - The note ID to convert
 * @param {string} target - Target type: 'html' or 'markdown'
 */
function showConvertNoteModal(noteId, target) {
    convertNoteId = noteId;
    convertNoteTarget = target;

    var modal = document.getElementById('convertNoteModal');
    var titleEl = document.getElementById('convertNoteTitle');
    var messageEl = document.getElementById('convertNoteMessage');
    var warningEl = document.getElementById('convertNoteWarning');
    var confirmBtn = document.getElementById('confirmConvertBtn');
    var duplicateBtn = document.getElementById('duplicateBeforeConvertBtn');

    if (!modal) return;

    if (target === 'html') {
        titleEl.textContent = window.t ? window.t('modals.convert.to_html_title', null, 'Convert to HTML') : 'Convert to HTML';
        messageEl.textContent = window.t ? window.t('modals.convert.to_html_message', null, 'This will convert your Markdown note to HTML format.') : 'This will convert your Markdown note to HTML format.';
        warningEl.textContent = window.t ? window.t('modals.convert.to_html_warning', null, 'Before converting this note, you may want to duplicate it to keep a copy in case the conversion doesn\'t meet your expectations.') : 'Before converting this note, you may want to duplicate it to keep a copy in case the conversion doesn\'t meet your expectations.';
    } else {
        titleEl.textContent = window.t ? window.t('modals.convert.to_markdown_title', null, 'Convert to Markdown') : 'Convert to Markdown';
        messageEl.textContent = window.t ? window.t('modals.convert.to_markdown_message', null, 'This will convert your HTML note to Markdown format. Embedded images will be saved as attachments.') : 'This will convert your HTML note to Markdown format. Embedded images will be saved as attachments.';
        warningEl.textContent = window.t ? window.t('modals.convert.to_markdown_warning', null, 'Some complex HTML formatting may not convert perfectly to Markdown.') : 'Some complex HTML formatting may not convert perfectly to Markdown.';
    }

    // Reset duplicate button state
    if (warningEl) warningEl.style.display = '';
    if (duplicateBtn) {
        duplicateBtn.disabled = false;
        duplicateBtn.style.opacity = '';
        duplicateBtn.style.cursor = '';
    }

    confirmBtn.onclick = function () {
        executeNoteConversion();
    };

    if (duplicateBtn) {
        duplicateBtn.onclick = function () {
            // Duplicate the note without reloading the page
            fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin'
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        // Update shared count if note was auto-shared
                        if (data.share_delta && typeof updateSharedCount === 'function') {
                            updateSharedCount(data.share_delta);
                        }
                        // Hide the warning message and disable the duplicate button
                        if (warningEl) warningEl.style.display = 'none';
                        duplicateBtn.disabled = true;
                        duplicateBtn.style.opacity = '0.5';
                        duplicateBtn.style.cursor = 'not-allowed';
                    }
                })
                .catch(function (error) {
                    console.error('Duplicate error:', error);
                });
        };
    }

    modal.style.display = 'flex';
}

/**
 * Execute the note conversion
 */
function executeNoteConversion() {
    if (!convertNoteId || !convertNoteTarget) return;

    closeModal('convertNoteModal');

    fetch('/api/v1/notes/' + encodeURIComponent(convertNoteId) + '/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ target: convertNoteTarget })
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Reload the page to show the converted note
                window.location.reload();
            } else {
                showNotificationPopup(data.error || (window.t ? window.t('modals.convert.error', null, 'Failed to convert note') : 'Failed to convert note'), 'error');
            }
        })
        .catch(function (error) {
            console.error('Convert error:', error);
            showNotificationPopup(window.t ? window.t('modals.convert.error', null, 'Failed to convert note') : 'Failed to convert note', 'error');
        });

    // Reset
    convertNoteId = null;
    convertNoteTarget = null;
}
