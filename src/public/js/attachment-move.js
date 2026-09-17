/**
 * "Move to another note" for an attachment: the note picker and the call
 * behind it, shared by the attachments page (js/attachments-page.js) and the
 * right-click menu on an attachment inside a note (js/note-attachment-menu.js).
 *
 * The dialog builds its own markup rather than living in a <div> of each page:
 * attachments.php has no modals.php include, and the two callers would
 * otherwise carry the same block twice.
 *
 * Translations come from window.t where a page loads it (index.php), and from
 * the labels the caller passes otherwise: attachments.php reads its strings
 * from data attributes on <body>, as the rest of that page does.
 */
(function () {
    'use strict';

    // Enough to pick from without scrolling forever; the search field is there
    // for everything else.
    var MAX_RECENT = 30;
    var MAX_SEARCH_RESULTS = 50;

    var dialog = null;
    // What is being moved, and where the answer goes. Null while closed.
    var current = null;
    var notesRequest = null;
    var moveInFlight = false;

    function tr(key, vars, fallback) {
        var labels = (current && current.labels) || {};
        // The strings the caller passed come first: a page that has to pass
        // them (attachments.php) has no window.t to ask.
        var text = (typeof labels[key] === 'string' && labels[key] !== '') ? labels[key] : null;

        if (text === null) {
            text = (typeof window.t === 'function') ? window.t(key, null, fallback || key) : (fallback || key);
        }
        if (vars) {
            for (var name in vars) {
                if (Object.prototype.hasOwnProperty.call(vars, name)) {
                    text = text.split('{{' + name + '}}').join(String(vars[name]));
                }
            }
        }
        return text;
    }

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    // ------------------------------------------------------------------
    // The dialog
    // ------------------------------------------------------------------

    function buildDialog() {
        var modal = element('div', 'modal attachment-move-modal');
        modal.id = 'attachmentMoveModal';

        var content = element('div', 'modal-content attachment-move-content');

        var title = element('h3');
        var icon = element('i', 'lucide lucide-file-output');
        title.appendChild(icon);
        title.appendChild(document.createTextNode(' '));
        var titleText = element('span', 'attachment-move-title');
        title.appendChild(titleText);
        content.appendChild(title);

        var description = element('p', 'attachment-move-description');
        content.appendChild(description);

        var search = element('input', 'attachment-move-search');
        search.type = 'text';
        search.autocomplete = 'off';
        content.appendChild(search);

        var list = element('div', 'attachment-move-list');
        content.appendChild(list);

        var error = element('div', 'attachment-move-error');
        error.hidden = true;
        content.appendChild(error);

        var buttons = element('div', 'modal-buttons');
        var cancel = element('button', 'btn-cancel');
        cancel.type = 'button';
        buttons.appendChild(cancel);
        content.appendChild(buttons);

        modal.appendChild(content);
        document.body.appendChild(modal);

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function (event) {
            if (event.target === modal && pressedOnBackdrop) close();
            pressedOnBackdrop = false;
        });
        cancel.addEventListener('click', close);
        search.addEventListener('input', function () {
            render(search.value);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && dialog && dialog.modal.style.display === 'flex') close();
        });

        return {
            modal: modal,
            titleText: titleText,
            description: description,
            search: search,
            list: list,
            error: error,
            cancel: cancel
        };
    }

    function close() {
        if (!dialog) return;
        dialog.modal.style.display = 'none';
        current = null;
        notesRequest = null;
        moveInFlight = false;
    }

    function showError(message) {
        dialog.error.textContent = message;
        dialog.error.hidden = false;
    }

    function clearError() {
        dialog.error.textContent = '';
        dialog.error.hidden = true;
    }

    // ------------------------------------------------------------------
    // The note list
    // ------------------------------------------------------------------

    /** Every note of the account, across workspaces, newest first. */
    function loadNotes() {
        return fetch('/api/v1/notes', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) {
                if (!data || !data.success || !Array.isArray(data.notes)) return null;
                return data.notes.slice().sort(function (a, b) {
                    return String(b.updated || '').localeCompare(String(a.updated || ''));
                });
            })
            .catch(function () { return null; });
    }

    function matches(note, query) {
        if (query === '') return true;
        var haystack = String(note.heading || '') + ' ' + String(note.folder || '');
        return haystack.toLowerCase().indexOf(query) !== -1;
    }

    function renderNote(note) {
        var item = element('div', 'attachment-move-item');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');

        var body = element('div', 'attachment-move-item-content');
        body.appendChild(element('span', 'attachment-move-item-title',
            note.heading || tr('note_reference.untitled', null, 'Untitled')));

        var otherWorkspace = (note.workspace && current.workspace && note.workspace !== current.workspace)
            ? note.workspace : '';
        if (note.folder || otherWorkspace) {
            var meta = element('span', 'attachment-move-item-meta');
            if (otherWorkspace) {
                var workspaceTag = element('span', 'attachment-move-item-tag');
                workspaceTag.appendChild(element('i', 'lucide lucide-layers'));
                workspaceTag.appendChild(element('span', null, otherWorkspace));
                meta.appendChild(workspaceTag);
            }
            if (note.folder) {
                var folderTag = element('span', 'attachment-move-item-tag');
                folderTag.appendChild(element('i', 'lucide lucide-folder'));
                folderTag.appendChild(element('span', null, note.folder));
                meta.appendChild(folderTag);
            }
            body.appendChild(meta);
        }

        item.appendChild(body);
        item.addEventListener('click', function () { moveTo(note, item); });
        item.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                moveTo(note, item);
            }
        });
        return item;
    }

    function render(searchValue) {
        if (!current) return;

        var query = String(searchValue || '').trim().toLowerCase();
        dialog.list.textContent = '';

        if (current.notes === null) {
            dialog.list.appendChild(element('div', 'attachment-move-empty',
                tr('note_reference.error.loading_notes', null, 'Error loading notes')));
            return;
        }
        if (current.notes === undefined) {
            dialog.list.appendChild(element('div', 'attachment-move-empty', tr('common.loading', null, 'Loading...')));
            return;
        }

        var found = current.notes.filter(function (note) {
            return String(note.id) !== String(current.noteId) && matches(note, query);
        });

        if (found.length === 0) {
            dialog.list.appendChild(element('div', 'attachment-move-empty',
                tr('attachments.move.empty', null, 'No other note found')));
            return;
        }

        found.slice(0, query === '' ? MAX_RECENT : MAX_SEARCH_RESULTS).forEach(function (note) {
            dialog.list.appendChild(renderNote(note));
        });
    }

    // ------------------------------------------------------------------
    // The move itself
    // ------------------------------------------------------------------

    function moveTo(note, item) {
        if (!current || moveInFlight) return;

        moveInFlight = true;
        clearError();
        dialog.list.classList.add('is-busy');
        item.classList.add('is-moving');
        var moving = element('span', 'attachment-move-item-status', tr('attachments.move.moving', null, 'Moving...'));
        item.appendChild(moving);

        // No workspace in the address on purpose: a note id already names one
        // note in the account, and the caller's idea of the current workspace
        // could differ from the note's, which the endpoint would read as
        // "no such note".
        var url = '/api/v1/notes/' + encodeURIComponent(current.noteId) + '/attachments/' +
            encodeURIComponent(current.attachmentId) + '/move';

        fetch(url, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ target_note_id: note.id })
        })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (data) {
                    if (!response.ok || !data.success) {
                        // The API answers 4xx with {"error": ...} and the
                        // controllers with {"message": ...}; both carry the
                        // only text worth showing.
                        throw new Error(data.error || data.message || '');
                    }
                    return data;
                });
            })
            .then(function (data) {
                var onMoved = current.onMoved;
                var payload = {
                    sourceNoteId: current.noteId,
                    attachmentId: current.attachmentId,
                    targetNoteId: note.id,
                    targetNoteHeading: data.target_note_heading || note.heading || '',
                    keptInSource: !!data.kept_in_source,
                    newAttachmentId: data.attachment_id || ''
                };
                close();
                if (typeof onMoved === 'function') onMoved(payload);
            })
            .catch(function (e) {
                moveInFlight = false;
                dialog.list.classList.remove('is-busy');
                item.classList.remove('is-moving');
                moving.remove();
                showError(e && e.message
                    ? tr('attachments.errors.move_failed', { error: e.message }, 'Move failed: {{error}}')
                    : tr('attachments.errors.move_failed_generic', null, 'Move failed.'));
            });
    }

    // ------------------------------------------------------------------
    // Public entry point
    // ------------------------------------------------------------------

    /**
     * @param {object} options
     *   noteId       the note the attachment is on
     *   attachmentId the attachment to move
     *   workspace    the workspace in view, so that notes from another one
     *                are labelled with theirs
     *   filename     what to call it in the dialog
     *   labels       translations, for a page without window.t
     *   onMoved      called with the move once it succeeded
     */
    window.openAttachmentMoveDialog = function (options) {
        if (!options || !options.noteId || !options.attachmentId) return;

        if (!dialog) {
            dialog = buildDialog();
        }

        current = {
            noteId: options.noteId,
            attachmentId: options.attachmentId,
            workspace: options.workspace || '',
            filename: options.filename || '',
            labels: options.labels || {},
            onMoved: options.onMoved,
            notes: undefined
        };
        moveInFlight = false;

        dialog.titleText.textContent = tr('attachments.move.title', null, 'Move attachment');
        dialog.description.textContent = current.filename
            ? tr('attachments.move.description', { filename: current.filename }, 'Choose the note that receives "{{filename}}".')
            : tr('attachments.move.description_unnamed', null, 'Choose the note that receives this attachment.');
        dialog.search.placeholder = tr('attachments.move.search_placeholder', null, 'Search for a note...');
        dialog.search.value = '';
        dialog.cancel.textContent = tr('common.cancel', null, 'Cancel');
        dialog.list.classList.remove('is-busy');
        clearError();

        dialog.modal.style.display = 'flex';
        render('');
        setTimeout(function () { dialog.search.focus(); }, 50);

        var request = loadNotes();
        notesRequest = request;
        request.then(function (notes) {
            // A dialog closed and reopened in the meantime owns the list now
            if (notesRequest !== request || !current) return;
            current.notes = notes;
            render(dialog.search.value);
        });
    };

    window.closeAttachmentMoveDialog = close;
})();
